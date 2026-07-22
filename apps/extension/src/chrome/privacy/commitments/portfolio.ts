import { getCachedPrivacyKey } from "../../sessionCache";
import { readPrivacyVault } from "../repository";
import { verifyPrivacyVaultWithKey } from "../vault";
import { listAllPrivacyShieldOperations } from "../operations/repository";
import type { PrivacyShieldTrackingState } from "../operations/types";
import { readPrivacyCommitments } from "./repository";
import {
  privacyCommitmentLineageKey,
  repairPrivacyCommitmentLineages,
} from "./lineageIntegrity";
import {
  isPrivacyCommitmentPubliclyRecoverableStatus,
  type PrivacyCommitmentStatus,
} from "./types";
import {
  readReleasedPrivacyPortfolioView,
  storeReleasedPrivacyPortfolio,
} from "../portfolioViewCache";

export interface PrivacyCommitmentPortfolio {
  status: "ready" | "locked";
  confirmedBalanceWei: string;
  readyBalanceWei: string;
  maxPrivateSendWei: string;
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
  lineageKey?: string;
  withdrawalIndex?: string;
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
  "asp_unavailable",
  "asp_poi_required",
  "asp_approved",
  "private_ready",
  "asp_declined",
  "asp_removed",
  "ragequit_available",
]);

/** Combine encrypted commitments with newly confirmed operations without double counting. */
export function aggregatePrivacyCommitmentPortfolio(
  commitments: readonly PrivacyPortfolioCommitmentInput[],
  operations: readonly PrivacyPortfolioOperationInput[],
): Omit<PrivacyCommitmentPortfolio, "status"> {
  let confirmed = 0n;
  let ready = 0n;
  let maxPrivateSend = 0n;
  let pendingAsp = 0n;
  let recoverable = 0n;
  let attentionCount = 0;
  let lastUpdatedAt: number | null = null;
  const representedOperations = new Set<string>();
  const canonicalCommitments = new Map<string, PrivacyPortfolioCommitmentInput>();

  for (const commitment of commitments) {
    if (!commitment.lineageKey) {
      canonicalCommitments.set(`record:${canonicalCommitments.size}`, commitment);
      continue;
    }
    const existing = canonicalCommitments.get(commitment.lineageKey);
    if (!existing) {
      canonicalCommitments.set(commitment.lineageKey, commitment);
      continue;
    }
    const currentIndex = BigInt(commitment.withdrawalIndex ?? "0");
    const existingIndex = BigInt(existing.withdrawalIndex ?? "0");
    if (
      currentIndex > existingIndex ||
      (currentIndex === existingIndex && commitment.updatedAt > existing.updatedAt)
    ) canonicalCommitments.set(commitment.lineageKey, commitment);
  }

  for (const commitment of canonicalCommitments.values()) {
    const balance = BigInt(commitment.balanceWei);
    confirmed += balance;
    if (commitment.status === "private_ready") {
      ready += balance;
      if (balance > maxPrivateSend) maxPrivateSend = balance;
    }
    if (commitment.status === "awaiting_asp") pendingAsp += balance;
    if (isPrivacyCommitmentPubliclyRecoverableStatus(commitment.status)) {
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
    if (
      operation.state === "asp_unavailable" ||
      operation.state === "asp_poi_required" ||
      operation.state === "asp_declined" ||
      operation.state === "asp_removed" ||
      operation.state === "ragequit_available"
    ) {
      recoverable += balance;
      attentionCount += 1;
    }
    lastUpdatedAt = Math.max(lastUpdatedAt ?? 0, operation.updatedAt);
  }

  return {
    confirmedBalanceWei: confirmed.toString(),
    readyBalanceWei: ready.toString(),
    maxPrivateSendWei: maxPrivateSend.toString(),
    pendingBalanceWei: pendingAsp.toString(),
    recoverableBalanceWei: recoverable.toString(),
    attentionCount,
    lastUpdatedAt,
  };
}

/**
 * Keep public onchain deposit progress visible while encrypted commitment
 * material is unavailable. These amounts already live in the sanitized Shield
 * operation summaries; no commitment linkage or private-ready balance is
 * released by this fallback.
 */
export function aggregateLockedPrivacyCommitmentPortfolio(
  operations: readonly PrivacyPortfolioOperationInput[],
): PrivacyCommitmentPortfolio {
  return {
    status: "locked",
    ...aggregatePrivacyCommitmentPortfolio([], operations),
  };
}

function portfolioOperation(
  operation: Awaited<ReturnType<typeof listAllPrivacyShieldOperations>>[number],
): PrivacyPortfolioOperationInput {
  const tracking = operation.tracking;
  return {
    id: operation.summary.id,
    state: tracking?.state ?? operation.summary.state,
    shieldedAmountWei: operation.summary.shieldedAmountWei,
    poolValueWei: tracking?.poolValueWei ?? null,
    updatedAt: tracking?.updatedAt ?? operation.summary.updatedAt,
  };
}

/** Release aggregates only; individual private commitment links remain encrypted. */
export async function readPrivacyCommitmentPortfolio(): Promise<PrivacyCommitmentPortfolio> {
  const [vault, privacyKey, operations] = await Promise.all([
    readPrivacyVault(),
    Promise.resolve(getCachedPrivacyKey()),
    listAllPrivacyShieldOperations(),
  ]);
  const publicOperations = operations.map(portfolioOperation);
  if (
    vault.status !== "valid" ||
    !privacyKey ||
    privacyKey.keyId !== vault.record.keyId ||
    !(await verifyPrivacyVaultWithKey(vault.record, privacyKey.key))
  ) {
    const released = await readReleasedPrivacyPortfolioView().catch(() => null);
    return released?.portfolio
      ? { status: "locked", ...released.portfolio }
      : aggregateLockedPrivacyCommitmentPortfolio(publicOperations);
  }
  await repairPrivacyCommitmentLineages(privacyKey);
  const commitments = await readPrivacyCommitments(privacyKey.key, privacyKey.keyId);
  const portfolio = aggregatePrivacyCommitmentPortfolio(
    commitments.map(({ record, details }) => ({
      sourceOperationId: details.sourceOperationId,
      depositor: details.depositor,
      status: details.status,
      balanceWei: details.balanceWei,
      updatedAt: record.updatedAt,
      lineageKey: privacyCommitmentLineageKey(details),
      withdrawalIndex: details.withdrawalIndex,
    })),
    publicOperations,
  );
  await storeReleasedPrivacyPortfolio(portfolio).catch(() => undefined);
  return { status: "ready", ...portfolio };
}
