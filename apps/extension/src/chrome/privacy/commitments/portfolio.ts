import { getActiveAccount } from "../../accounts/selectionStorage";
import { getCachedPrivacyKey } from "../../sessionCache";
import { readPrivacyVault } from "../repository";
import { verifyPrivacyVaultWithKey } from "../vault";
import { listAllPrivacyShieldOperations } from "../operations/repository";
import type { PrivacyShieldTrackingState } from "../operations/types";
import { readPrivacyCommitments } from "./repository";
import {
  isPrivacyCommitmentPubliclyRecoverableStatus,
  type PrivacyCommitmentStatus,
} from "./types";

export interface PrivacyCommitmentPortfolio {
  status: "ready" | "locked";
  confirmedBalanceWei: string;
  readyBalanceWei: string;
  pendingBalanceWei: string;
  recoverableBalanceWei: string;
  attentionCount: number;
  lastUpdatedAt: number | null;
}

export interface PrivacyPortfolioCommitmentInput {
  sourceOperationId: string | null;
  depositor: string;
  status: PrivacyCommitmentStatus;
  balanceWei: string;
  updatedAt: number;
}

export interface PrivacyPortfolioOperationInput {
  id: string;
  state: PrivacyShieldTrackingState;
  shieldedAmountWei: string;
  poolValueWei: string | null;
  updatedAt: number;
}

const CONFIRMED_OPERATION_STATES = new Set<PrivacyShieldTrackingState>([
  "public_confirmed",
  "awaiting_event",
  "awaiting_asp",
  "private_ready",
  "asp_declined",
  "asp_removed",
  "ragequit_available",
]);

/** Combine encrypted commitments with newly confirmed operations without double counting. */
export function aggregatePrivacyCommitmentPortfolio(
  commitments: readonly PrivacyPortfolioCommitmentInput[],
  operations: readonly PrivacyPortfolioOperationInput[],
  publicRecoveryAccountAddress?: string,
): Omit<PrivacyCommitmentPortfolio, "status"> {
  let confirmed = 0n;
  let ready = 0n;
  let pendingAsp = 0n;
  let recoverable = 0n;
  let attentionCount = 0;
  let lastUpdatedAt: number | null = null;
  const representedOperations = new Set<string>();

  for (const commitment of commitments) {
    const balance = BigInt(commitment.balanceWei);
    confirmed += balance;
    if (commitment.status === "private_ready") ready += balance;
    if (commitment.status === "awaiting_asp") pendingAsp += balance;
    const belongsToRecoveryAccount = publicRecoveryAccountAddress === undefined ||
      commitment.depositor.toLowerCase() === publicRecoveryAccountAddress.toLowerCase();
    if (
      belongsToRecoveryAccount &&
      isPrivacyCommitmentPubliclyRecoverableStatus(commitment.status)
    ) {
      recoverable += balance;
      if (commitment.status !== "awaiting_asp") attentionCount += 1;
    }
    if (commitment.sourceOperationId) {
      representedOperations.add(commitment.sourceOperationId);
    }
    lastUpdatedAt = Math.max(lastUpdatedAt ?? 0, commitment.updatedAt);
  }

  for (const operation of operations) {
    if (
      representedOperations.has(operation.id) ||
      !CONFIRMED_OPERATION_STATES.has(operation.state)
    ) continue;
    const balance = BigInt(operation.poolValueWei ?? operation.shieldedAmountWei);
    confirmed += balance;
    if (operation.state === "awaiting_asp") pendingAsp += balance;
    lastUpdatedAt = Math.max(lastUpdatedAt ?? 0, operation.updatedAt);
  }

  return {
    confirmedBalanceWei: confirmed.toString(),
    readyBalanceWei: ready.toString(),
    pendingBalanceWei: pendingAsp.toString(),
    recoverableBalanceWei: recoverable.toString(),
    attentionCount,
    lastUpdatedAt,
  };
}

/** Release aggregates only; individual private commitment links remain encrypted. */
export async function readPrivacyCommitmentPortfolio(): Promise<PrivacyCommitmentPortfolio> {
  const [vault, privacyKey, activeAccount] = await Promise.all([
    readPrivacyVault(),
    Promise.resolve(getCachedPrivacyKey()),
    getActiveAccount(),
  ]);
  if (
    vault.status !== "valid" ||
    !privacyKey ||
    privacyKey.keyId !== vault.record.keyId ||
    !(await verifyPrivacyVaultWithKey(vault.record, privacyKey.key))
  ) {
    return {
      status: "locked",
      confirmedBalanceWei: "0",
      readyBalanceWei: "0",
      pendingBalanceWei: "0",
      recoverableBalanceWei: "0",
      attentionCount: 0,
      lastUpdatedAt: null,
    };
  }
  const [commitments, operations] = await Promise.all([
    readPrivacyCommitments(privacyKey.key, privacyKey.keyId),
    listAllPrivacyShieldOperations(),
  ]);
  return {
    status: "ready",
    ...aggregatePrivacyCommitmentPortfolio(
      commitments.map(({ record, details }) => ({
        sourceOperationId: details.sourceOperationId,
        depositor: details.depositor,
        status: details.status,
        balanceWei: details.balanceWei,
        updatedAt: record.updatedAt,
      })),
      operations.map((operation) => {
        const tracking = operation.tracking;
        return {
          id: operation.summary.id,
          state: tracking?.state ?? operation.summary.state,
          shieldedAmountWei: operation.summary.shieldedAmountWei,
          poolValueWei: tracking?.poolValueWei ?? null,
          updatedAt: tracking?.updatedAt ?? operation.summary.updatedAt,
        };
      }),
      activeAccount?.address,
    ),
  };
}
