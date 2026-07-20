import { getAuthCeremonyEpoch } from "../../authTransition";
import { handleUnlockWallet } from "../../authHandlers";
import { assertCurrentMasterAuthorization } from "../../masterAuthorization";
import {
  getCachedPrivacyKey,
  getPasswordType,
  isWalletUnlocked,
  tryRestoreSession,
} from "../../sessionCache";
import {
  WALLET_SECRET_OPERATION_LOCK_KEY,
  withStorageLock,
} from "../../storageLock";
import { decryptPrivacyRecovery } from "../crypto";
import { PRIVACY_POOLS_DEPLOYMENT } from "../deployment/manifest";
import {
  listPrivacyDepositEvents,
  listPrivacyRagequitEvents,
  listPrivacyWithdrawalEvents,
} from "../events/repository";
import { syncPrivacyDepositEvents } from "../events/sync";
import type {
  PrivacyDepositEventV1,
  PrivacyRagequitEventV1,
  PrivacyWithdrawalEventV1,
} from "../events/types";
import { advanceNextPrivacyDepositIndex } from "../operations/repository";
import {
  derivePrivacyPoolCommitment,
  derivePrivacyPoolDepositPrecommitment,
  derivePrivacyPoolDepositSecrets,
  derivePrivacyPoolMasterKeys,
  derivePrivacyPoolWithdrawalSecrets,
  type PrivacyPoolMasterKeys,
} from "../protocol/primitives";
import { readPrivacyVault } from "../repository";
import { verifyPrivacyVaultWithKey } from "../vault";
import {
  markPrivacyCommitmentLineageSuperseded,
  upsertPrivacyCommitment,
} from "./repository";
import type { PrivacyCommitmentDetailsV1 } from "./types";

export const MAX_PRIVACY_RESCAN_DERIVATION_INDEX = 4_095;
export const PRIVACY_RESCAN_MISS_GAP = 256;

export interface PrivacyCommitmentRescanResult {
  status: "current";
  events: number;
  recovered: number;
  created: number;
  scannedIndices: number;
  nextDepositIndex: number;
}

function nextTurn(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/** Pure recovery search apart from bounded cooperative scheduling and UUID creation. */
export async function recoverPrivacyCommitmentsFromEvents(input: {
  masterKeys: PrivacyPoolMasterKeys;
  events: readonly PrivacyDepositEventV1[];
  withdrawals?: readonly PrivacyWithdrawalEventV1[];
  ragequits?: readonly PrivacyRagequitEventV1[];
  createId?: () => string;
  maxIndex?: number;
  missGap?: number;
}): Promise<{
  commitments: PrivacyCommitmentDetailsV1[];
  scannedIndices: number;
  nextDepositIndex: number;
}> {
  const maxIndex = input.maxIndex ?? MAX_PRIVACY_RESCAN_DERIVATION_INDEX;
  const missGap = input.missGap ?? PRIVACY_RESCAN_MISS_GAP;
  if (
    !Number.isSafeInteger(maxIndex) || maxIndex < 0 || maxIndex > 0xffff_ffff ||
    !Number.isSafeInteger(missGap) || missGap < 1 || missGap > 4_096
  ) {
    throw new Error("Invalid privacy rescan bounds");
  }
  const byPrecommitment = new Map<string, PrivacyDepositEventV1>();
  const bySpentNullifier = new Map<string, PrivacyWithdrawalEventV1>();
  const ragequitByCommitment = new Map<string, PrivacyRagequitEventV1>();
  for (const event of input.events) {
    if (event.chainId !== PRIVACY_POOLS_DEPLOYMENT.chainId) {
      throw new Error("Invalid privacy rescan event chain");
    }
    if (byPrecommitment.has(event.precommitment)) {
      throw new Error("Duplicate privacy rescan precommitment");
    }
    byPrecommitment.set(event.precommitment, event);
  }
  for (const event of input.withdrawals ?? []) {
    if (
      event.chainId !== PRIVACY_POOLS_DEPLOYMENT.chainId ||
      bySpentNullifier.has(event.spentNullifier)
    ) throw new Error("Invalid privacy withdrawal history");
    bySpentNullifier.set(event.spentNullifier, event);
  }
  for (const event of input.ragequits ?? []) {
    if (
      event.chainId !== PRIVACY_POOLS_DEPLOYMENT.chainId ||
      ragequitByCommitment.has(event.commitment)
    ) throw new Error("Invalid privacy ragequit history");
    ragequitByCommitment.set(event.commitment, event);
  }

  const commitments: PrivacyCommitmentDetailsV1[] = [];
  let misses = 0;
  let scannedIndices = 0;
  let highestMatch = -1;
  for (let index = 0; index <= maxIndex; index += 1) {
    const secrets = derivePrivacyPoolDepositSecrets(
      input.masterKeys,
      PRIVACY_POOLS_DEPLOYMENT.scope,
      BigInt(index),
    );
    const precommitment = derivePrivacyPoolDepositPrecommitment(secrets);
    const event = byPrecommitment.get(precommitment.toString());
    scannedIndices += 1;
    if (!event) {
      misses += 1;
    } else {
      let currentValue = BigInt(event.valueWei);
      let commitment = derivePrivacyPoolCommitment(
        currentValue,
        BigInt(event.label),
        secrets,
      );
      if (
        commitment.precommitment !== precommitment ||
        commitment.hash !== BigInt(event.commitment)
      ) {
        throw new Error("Recovered commitment does not match the active pool event");
      }
      let withdrawalIndex = 0n;
      let status: PrivacyCommitmentDetailsV1["status"] = "awaiting_asp";
      let lineageSteps = 0;
      while (lineageSteps <= bySpentNullifier.size) {
        const ragequit = ragequitByCommitment.get(commitment.hash.toString());
        if (ragequit) {
          if (
            ragequit.label !== event.label ||
            ragequit.valueWei !== currentValue.toString() ||
            ragequit.ragequitter.toLowerCase() !== event.depositor.toLowerCase()
          ) throw new Error("Recovered ragequit does not match commitment lineage");
          currentValue = 0n;
          status = "ragequit_recovered";
          break;
        }
        const withdrawal = bySpentNullifier.get(commitment.nullifierHash.toString());
        if (!withdrawal) break;
        if (lineageSteps === bySpentNullifier.size) {
          throw new Error("Recovered withdrawal lineage contains a cycle");
        }
        lineageSteps += 1;
        const withdrawnValue = BigInt(withdrawal.valueWei);
        if (withdrawnValue <= 0n || withdrawnValue > currentValue) {
          throw new Error("Recovered withdrawal exceeds commitment balance");
        }
        const nextSecrets = derivePrivacyPoolWithdrawalSecrets(
          input.masterKeys,
          BigInt(event.label),
          withdrawalIndex,
        );
        const remaining = currentValue - withdrawnValue;
        const nextCommitment = derivePrivacyPoolCommitment(
          remaining,
          BigInt(event.label),
          nextSecrets,
        );
        if (nextCommitment.hash !== BigInt(withdrawal.newCommitment)) {
          throw new Error("Recovered replacement commitment does not match the active pool event");
        }
        currentValue = remaining;
        commitment = nextCommitment;
        withdrawalIndex += 1n;
        if (currentValue === 0n) {
          status = "spent";
          break;
        }
      }
      const id = input.createId ? input.createId() : crypto.randomUUID();
      commitments.push({
        version: 1,
        id,
        chainId: PRIVACY_POOLS_DEPLOYMENT.chainId,
        scope: PRIVACY_POOLS_DEPLOYMENT.scope.toString(),
        poolAddress: PRIVACY_POOLS_DEPLOYMENT.contracts.ethPool.address,
        commitment: commitment.hash.toString(),
        label: event.label,
        valueWei: event.valueWei,
        balanceWei: currentValue.toString(),
        precommitment: event.precommitment,
        depositIndex: index.toString(),
        depositor: event.depositor,
        depositTxHash: event.transactionHash,
        depositBlockNumber: event.blockNumber,
        withdrawalIndex: withdrawalIndex.toString(),
        status,
        sourceOperationId: null,
      });
      misses = 0;
      highestMatch = index;
    }
    if ((index + 1) % 64 === 0) await nextTurn();
    if (misses >= missGap) break;
  }
  return {
    commitments,
    scannedIndices,
    nextDepositIndex: Math.max(0, highestMatch + 1),
  };
}

async function requireMasterEpoch(): Promise<string> {
  if (!isWalletUnlocked()) {
    await tryRestoreSession(handleUnlockWallet).catch(() => false);
  }
  if (!isWalletUnlocked() || getPasswordType() !== "master") {
    throw new Error("Main authorization required");
  }
  return getAuthCeremonyEpoch();
}

/** Rebuild WalletChan-derived deposits from the encrypted phrase and public history. */
export async function rescanPrivacyCommitmentsWithActiveIdentity(): Promise<PrivacyCommitmentRescanResult> {
  const expectedEpoch = await requireMasterEpoch();
  const sync = await syncPrivacyDepositEvents();
  if (sync.status !== "current") throw new Error("Privacy event sync is incomplete");

  return withStorageLock(WALLET_SECRET_OPERATION_LOCK_KEY, async () => {
    assertCurrentMasterAuthorization(expectedEpoch);
    const [vault, privacyKey, events, withdrawals, ragequits] = await Promise.all([
      readPrivacyVault(),
      Promise.resolve(getCachedPrivacyKey()),
      listPrivacyDepositEvents(),
      listPrivacyWithdrawalEvents(),
      listPrivacyRagequitEvents(),
    ]);
    if (
      vault.status !== "valid" ||
      vault.record.recovery === null ||
      !privacyKey ||
      privacyKey.keyId !== vault.record.keyId ||
      !(await verifyPrivacyVaultWithKey(vault.record, privacyKey.key))
    ) {
      throw new Error("Privacy recovery is unavailable");
    }
    const phrase = await decryptPrivacyRecovery(
      privacyKey.key,
      vault.record.keyId,
      vault.record.recovery,
    );
    if (!phrase) throw new Error("Privacy recovery is unavailable");
    const recovered = await recoverPrivacyCommitmentsFromEvents({
      masterKeys: derivePrivacyPoolMasterKeys(phrase),
      events,
      withdrawals,
      ragequits,
    });
    assertCurrentMasterAuthorization(expectedEpoch);
    let created = 0;
    for (const commitment of recovered.commitments) {
      const result = await upsertPrivacyCommitment(
        privacyKey.key,
        privacyKey.keyId,
        commitment,
      );
      if (result === "created") created += 1;
      await markPrivacyCommitmentLineageSuperseded(
        privacyKey.key,
        privacyKey.keyId,
        commitment,
      );
    }
    const nextDepositIndex = await advanceNextPrivacyDepositIndex(
      recovered.nextDepositIndex,
    );
    assertCurrentMasterAuthorization(expectedEpoch);
    return {
      status: "current",
      events: events.length,
      recovered: recovered.commitments.length,
      created,
      scannedIndices: recovered.scannedIndices,
      nextDepositIndex,
    };
  });
}
