import { createPublicClient, getAddress, toHex } from "viem";
import { getAccountById } from "../accountStorage";
import { getLocalPrivateKeyForAccount } from "../accounts/localKeyResolver";
import { getAuthCeremonyEpoch, isCurrentAuthCeremonyEpoch } from "../authTransition";
import { broadcastSerializedTransaction, signAndBroadcastTransaction } from "../localSigner";
import { getStoredRpcUrl } from "@/lib/chains";
import { secureHttpTransport } from "../network/rpcClient";
import { getPasswordType } from "../sessionCache";
import type { GasOverrides } from "../transactions/localExecution";
import { verifySafeOnchainState } from "./onchainState";
import {
  claimSafeProposalEffect,
  getSafeProposal,
  getSafeProposals,
  releaseSafeProposalEffect,
  updateSafeProposal,
} from "./proposalRepository";
import { buildSafeExecutionData } from "./executionData";
import type { SafeProposalRecord } from "./types";
import { writeResultToStorage } from "../transactions/runtime";
import { updateBundleStatus } from "../bundleStatusStorage";
import { BUNDLE_STATUS } from "../erc5792Types";
import { notifySafeExecutionResult } from "./notifications";
import { hasUnresolvedSafeExecution } from "./executionPolicy";
import {
  lookupSafeExecutionReceipt,
  SafeExecutionReceiptRpcError,
} from "./executionReceipt";
import {
  isSafeExecutionRpcWarning,
  SAFE_EXECUTION_RPC_WARNING,
} from "./executionStatus";
import { settleCompetingSafeProposals } from "./executionSettlement";
import { validateSafeGasOverrides } from "./executionGas";
import {
  buildSafeExecutionExecutor,
  ensureSafeExecutorHistory,
  resumeSafeExecutorHistory,
  trackSafeExecutorBroadcast,
} from "./executorHistory";

const RECONCILE_INITIAL_INTERVAL_MS = 2_000;
const RECONCILE_MAX_INTERVAL_MS = 15_000;
const RECONCILE_BACKOFF_FACTOR = 1.5;
const RECONCILE_POLL_WINDOW_MS = 15 * 60_000;
export const SAFE_EXECUTION_RECONCILIATION_ALARM =
  "walletchan-safe-execution-reconciliation";
const SAFE_EXECUTION_ALARM_PERIOD_MINUTES = 0.5;
const activeExecutionReconciliations = new Set<string>();

export {
  settleCompetingSafeProposals,
  terminalizeReplacedSafeRoute,
} from "./executionSettlement";

async function liveExecutable(proposal: SafeProposalRecord) {
  const live = await verifySafeOnchainState({ chainId: proposal.chainId, safeAddress: proposal.safeAddress });
  if (live.configEpoch !== proposal.safeConfigEpoch) throw new Error("Safe configuration changed; review again");
  if (BigInt(live.nonce) !== BigInt(proposal.transaction.nonce)) throw new Error("Safe proposal nonce is not executable");
  const distinct = new Set(proposal.confirmations.map((item) => item.ownerAddress));
  if (distinct.size < live.threshold) throw new Error("Safe approval threshold has not been reached");
  if ([...distinct].some((owner) => !live.owners.includes(owner))) throw new Error("A confirmed owner is no longer authorized");
  return live;
}

async function executionContext(proposalId: string, executorAccountId: string) {
  const [proposal, account] = await Promise.all([getSafeProposal(proposalId), getAccountById(executorAccountId)]);
  if (!proposal) throw new Error("Safe proposal not found");
  if (hasUnresolvedSafeExecution(proposal)) {
    throw new Error("Safe execution is already submitted and awaiting confirmation");
  }
  if (proposal.state !== "readyToExecute") throw new Error("Safe proposal is not ready to execute");
  if (!account || (account.type !== "privateKey" && account.type !== "seedPhrase")) throw new Error("Choose a private-key or seed-phrase executor");
  return { proposal, account };
}

async function simulateExecutionEnvelope(
  proposal: SafeProposalRecord,
  executorAddress: string,
  rpcUrl: string,
) {
  const client = createPublicClient({
    transport: secureHttpTransport(rpcUrl, { timeout: 15_000, retryCount: 1 }),
  });
  const request = {
    account: getAddress(executorAddress),
    to: getAddress(proposal.safeAddress),
    data: buildSafeExecutionData(proposal),
    value: 0n,
  } as const;
  await client.call(request);
  return { client, request };
}

export async function estimateSafeExecution(input: { proposalId: string; executorAccountId: string }) {
  const { proposal, account } = await executionContext(input.proposalId, input.executorAccountId);
  await liveExecutable(proposal);
  const rpcUrl = await getStoredRpcUrl(proposal.chainId);
  if (!rpcUrl) throw new Error("No RPC configured for network");
  const { client, request } = await simulateExecutionEnvelope(proposal, account.address, rpcUrl);
  const gas = await client.estimateGas(request);
  return { gas: gas.toString(), executor: account.address, safeTxHash: proposal.safeTxHash };
}

export async function executeSafeProposal(input: {
  proposalId: string;
  executorAccountId: string;
  gasOverrides?: GasOverrides;
}) {
  const { proposal, account } = await executionContext(input.proposalId, input.executorAccountId);
  const claim = await claimSafeProposalEffect(proposal.id, { kind: "execute" });
  const claimId = claim.effectClaim!.claimId;
  try {
    const key = await getLocalPrivateKeyForAccount(account.id, "");
    if (!key || !getPasswordType()) throw new Error("Wallet is locked; unlock it and try again");
    const authEpoch = getAuthCeremonyEpoch();
    await liveExecutable(proposal);
    const rpcUrl = await getStoredRpcUrl(proposal.chainId);
    if (!rpcUrl) throw new Error("No RPC configured for network");
    const gas = validateSafeGasOverrides(input.gasOverrides);
    const result = await signAndBroadcastTransaction(
      key,
      {
        chainId: proposal.chainId,
        from: account.address,
        to: proposal.safeAddress,
        value: "0",
        data: buildSafeExecutionData(proposal),
        ...gas,
      },
      rpcUrl,
      undefined,
      async ({ serializedTransaction, transactionHash }) => {
        if (!isCurrentAuthCeremonyEpoch(authEpoch) || !getPasswordType()) throw new Error("Authentication state changed; unlock and try again");
        const currentAccount = await getAccountById(account.id);
        if (!currentAccount || currentAccount.type !== account.type || currentAccount.address.toLowerCase() !== account.address.toLowerCase()) throw new Error("Executor account changed");
        const currentProposal = await getSafeProposal(proposal.id);
        if (currentProposal?.effectClaim?.claimId !== claimId) throw new Error("Safe execution claim changed");
        await liveExecutable(proposal);
        // This is the final read-only operation before the serialized outer
        // transaction crosses the broadcast boundary. Simulate the exact
        // immutable Safe envelope with the selected executor, not merely its
        // underlying calls or an earlier estimate.
        await simulateExecutionEnvelope(proposal, account.address, rpcUrl);
        const preparedAt = Date.now();
        const prepared = await updateSafeProposal(proposal.id, (record) => ({
          ...record,
          state: "ambiguous",
          transactionHash,
          serializedExecution: serializedTransaction,
          executionPreparedAt: preparedAt,
          executor: buildSafeExecutionExecutor({
            accountId: account.id,
            accountType: account.type,
            address: account.address.toLowerCase() as `0x${string}`,
          }, gas, preparedAt),
          error: "Execution is crossing the broadcast boundary",
          updatedAt: preparedAt,
        }));
        await ensureSafeExecutorHistory(prepared, true);
      },
    );
    if (!/^0x[0-9a-fA-F]{64}$/.test(result.txHash)) {
      throw new Error("Executor returned an invalid transaction hash");
    }
    const updated = await releaseSafeProposalEffect(proposal.id, claimId, {
      state: result.broadcastUncertain ? "ambiguous" : "executing",
      transactionHash: result.txHash.toLowerCase() as `0x${string}`,
      error: result.broadcastUncertain ? "Execution broadcast outcome is being reconciled" : undefined,
    });
    await trackSafeExecutorBroadcast(updated, result, rpcUrl).catch((error) => {
      console.warn("[safe] executor history tracking failed", error);
    });
    startSafeExecutionReconciliation(updated.id);
    if (!result.broadcastUncertain && (updated.route.kind === "injected" || updated.route.kind === "walletConnect") && !updated.route.detachedAt && updated.route.requestId) {
      await writeResultToStorage(`txResult:${updated.route.requestId}`, { success: true, txHash: updated.transactionHash });
    }
    if (proposal.route.kind === "erc5792" && proposal.route.bundleId) {
      await updateBundleStatus(proposal.route.bundleId, { txHash: updated.transactionHash });
    }
    return updated;
  } catch (error) {
    const current = await getSafeProposal(proposal.id).catch(() => null);
    const recovered = await releaseSafeProposalEffect(proposal.id, claimId, current?.serializedExecution
      ? {
          state: "ambiguous",
          transactionHash: current.transactionHash,
          serializedExecution: current.serializedExecution,
          executionPreparedAt: current.executionPreparedAt,
          error: "Execution broadcast outcome is being reconciled",
        }
      : {
          state: "readyToExecute",
          error: error instanceof Error ? error.message : "Safe execution failed",
        }).catch(() => null);
    if (recovered?.serializedExecution && recovered.transactionHash) {
      startSafeExecutionReconciliation(recovered.id);
      void resumeSafeExecutorHistory(recovered).catch((historyError) => {
        console.warn("[safe] executor history recovery failed", historyError);
      });
    }
    throw error;
  }
}

export { buildSafeExecutionData } from "./executionData";
export { validateSafeGasOverrides } from "./executionGas";

export async function reconcileSafeExecution(id: string): Promise<SafeProposalRecord> {
  let proposal = await getSafeProposal(id);
  if (!proposal) throw new Error("Safe proposal not found");
  if (!proposal.transactionHash) throw new Error("Safe execution has no transaction hash");
  await resumeSafeExecutorHistory(proposal).catch((error) => {
    console.warn("[safe] executor history resume failed", error);
  });
  let lookup;
  try {
    lookup = await lookupSafeExecutionReceipt(
      proposal.chainId,
      proposal.transactionHash,
    );
  } catch (error) {
    if (error instanceof SafeExecutionReceiptRpcError &&
        !isSafeExecutionRpcWarning(proposal.error)) {
      proposal = await updateSafeProposal(id, (record) => ({
        ...record,
        error: SAFE_EXECUTION_RPC_WARNING,
        updatedAt: Date.now(),
      }));
    }
    throw error;
  }
  const { client, receipt } = lookup;
  if (isSafeExecutionRpcWarning(proposal.error)) {
    proposal = await updateSafeProposal(id, (record) => ({
      ...record,
      error: undefined,
      updatedAt: Date.now(),
    }));
  }
  if (receipt) {
    const state = receipt.status === "success" ? "executed" : "failed";
    const updated = await updateSafeProposal(id, (record) => ({ ...record, state, serializedExecution: undefined, executionPreparedAt: undefined, error: state === "failed" ? "Safe execution reverted" : undefined, updatedAt: Date.now() }));
    if ((proposal.route.kind === "injected" || proposal.route.kind === "walletConnect") && !proposal.route.detachedAt && proposal.route.requestId) {
      await writeResultToStorage(`txResult:${proposal.route.requestId}`, state === "executed" ? { success: true, txHash: proposal.transactionHash } : { success: false, error: "Safe execution reverted" });
    }
    if (proposal.route.kind === "erc5792" && proposal.route.bundleId) {
      await updateBundleStatus(proposal.route.bundleId, {
        status: state === "executed" ? BUNDLE_STATUS.CONFIRMED : BUNDLE_STATUS.REVERTED,
        txHash: proposal.transactionHash,
        completedAt: Date.now(),
        receipts: [{
          status: receipt.status === "success" ? "0x1" : "0x0",
          blockHash: receipt.blockHash,
          blockNumber: toHex(receipt.blockNumber),
          gasUsed: toHex(receipt.gasUsed),
          transactionHash: receipt.transactionHash,
          logs: receipt.logs.map((log) => ({
            address: log.address as `0x${string}`,
            topics: [...log.topics] as `0x${string}`[],
            data: log.data,
          })),
        }],
      });
    }
    if (state === "executed") {
      await settleCompetingSafeProposals(updated);
    }
    if (proposal.confirmations.some((confirmation) => !!confirmation.accountId)) {
      await notifySafeExecutionResult({ proposalId: proposal.id, state });
    }
    return updated;
  }
  const live = await verifySafeOnchainState({
    chainId: proposal.chainId,
    safeAddress: proposal.safeAddress,
    client,
  });
  if (BigInt(live.nonce) > BigInt(proposal.transaction.nonce)) {
    const replaced = await updateSafeProposal(id, (record) => ({ ...record, state: "replaced", serializedExecution: undefined, executionPreparedAt: undefined, error: "Safe nonce advanced without this execution receipt", updatedAt: Date.now() }));
    if (proposal.confirmations.some((confirmation) => !!confirmation.accountId)) {
      await notifySafeExecutionResult({ proposalId: proposal.id, state: "replaced" });
    }
    return replaced;
  }
  if (
    proposal.state === "ambiguous" &&
    proposal.serializedExecution &&
    proposal.executionPreparedAt &&
    Date.now() - proposal.executionPreparedAt >= 15_000
  ) {
    // Re-send the exact signed bytes. This is transaction-idempotent and can
    // recover a worker termination between durable preparation and RPC send.
    const broadcast = await broadcastSerializedTransaction(client as any, proposal.serializedExecution, {
      chainId: proposal.chainId,
      supportsSyncSend: false,
    });
    return updateSafeProposal(id, (record) => {
      if (
        record.state !== "ambiguous" ||
        record.transactionHash !== proposal.transactionHash ||
        record.serializedExecution !== proposal.serializedExecution
      ) {
        return record;
      }
      return {
        ...record,
        state: broadcast.broadcastUncertain ? "ambiguous" : "executing",
        executionPreparedAt: Date.now(),
        error: broadcast.broadcastUncertain
          ? "Execution broadcast outcome is being confirmed"
          : undefined,
        updatedAt: Date.now(),
      };
    });
  }
  return proposal;
}

function isExecutionPending(proposal: SafeProposalRecord): boolean {
  return !!proposal.transactionHash &&
    (proposal.state === "executing" || proposal.state === "ambiguous");
}

export function startSafeExecutionReconciliation(id: string): void {
  if (!id || activeExecutionReconciliations.has(id)) return;
  chrome.alarms.create(SAFE_EXECUTION_RECONCILIATION_ALARM, {
    delayInMinutes: SAFE_EXECUTION_ALARM_PERIOD_MINUTES,
    periodInMinutes: SAFE_EXECUTION_ALARM_PERIOD_MINUTES,
  });
  activeExecutionReconciliations.add(id);
  void pollSafeExecution(id)
    .catch((error) => {
      console.warn("[safe] automatic execution reconciliation failed", error);
    })
    .finally(() => {
      activeExecutionReconciliations.delete(id);
    });
}

export async function reconcilePendingSafeExecutions(): Promise<void> {
  const pending = (await getSafeProposals()).filter(isExecutionPending);
  if (pending.length === 0) {
    await chrome.alarms.clear(SAFE_EXECUTION_RECONCILIATION_ALARM);
    return;
  }
  chrome.alarms.create(SAFE_EXECUTION_RECONCILIATION_ALARM, {
    delayInMinutes: SAFE_EXECUTION_ALARM_PERIOD_MINUTES,
    periodInMinutes: SAFE_EXECUTION_ALARM_PERIOD_MINUTES,
  });
  await Promise.allSettled(
    pending.map((proposal) => reconcileSafeExecution(proposal.id)),
  );
  if (!(await getSafeProposals()).some(isExecutionPending)) {
    await chrome.alarms.clear(SAFE_EXECUTION_RECONCILIATION_ALARM);
  }
}

async function pollSafeExecution(id: string): Promise<void> {
  const startedAt = Date.now();
  let interval = RECONCILE_INITIAL_INTERVAL_MS;
  while (Date.now() - startedAt < RECONCILE_POLL_WINDOW_MS) {
    await new Promise<void>((resolve) => setTimeout(resolve, interval));
    try {
      const proposal = await reconcileSafeExecution(id);
      if (!isExecutionPending(proposal)) return;
    } catch (error) {
      console.warn("[safe] execution receipt check failed", error);
    }
    interval = Math.min(
      interval * RECONCILE_BACKOFF_FACTOR,
      RECONCILE_MAX_INTERVAL_MS,
    );
  }
}
