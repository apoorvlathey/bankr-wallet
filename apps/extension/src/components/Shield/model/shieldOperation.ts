import type { ShieldSourceAccount } from "./shieldQuote";
import { PRIVACY_POOLS_DEPLOYMENT } from "@/chrome/privacy/deployment/manifest";
import { parseUnshieldOperation, type UnshieldOperation } from "./unshield";
import { parsePublicRecoveryOperation, type PublicRecoveryOperation } from "./recovery";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EVM_ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const SERIALIZED_WEI = /^(?:0|[1-9]\d{0,79})$/;
export const MAX_SHIELD_OPERATION_ACTIVITY = 20;

export interface ShieldPendingOperation {
  readonly id: string;
  readonly revision: number;
  readonly state:
    | "awaiting_wallet_confirmation"
    | "submission_unknown"
    | "submitted"
    | "public_confirmed"
    | "awaiting_event"
    | "awaiting_asp"
    | "asp_unavailable"
    | "asp_poi_required"
    | "asp_approved"
    | "private_ready"
    | "wallet_rejected"
    | "submission_failed"
    | "public_reverted"
    | "asp_declined"
    | "asp_removed"
    | "ragequit_available"
    | "ragequit_recovered"
    | "failed_recoverable"
    | "failed_needs_support";
  readonly createdAt: number;
  readonly chainId: typeof PRIVACY_POOLS_DEPLOYMENT.chainId;
  readonly accountId: string;
  readonly accountAddress: string;
  readonly accountType: Exclude<ShieldSourceAccount["type"], "impersonator">;
  readonly amountWei: bigint;
  readonly protocolFeeWei: bigint;
  readonly shieldedAmountWei: bigint;
  readonly gasReserveWei: bigint;
  readonly totalRequiredWei: bigint;
  readonly destinationAddress: string;
  readonly poolAddress: string;
  readonly txHash: string | null;
  readonly blockNumber: string | null;
  readonly errorCode: string | null;
}

export interface ShieldPrivatePortfolio {
  readonly status: "ready" | "locked";
  readonly confirmedBalanceWei: bigint;
  readonly readyBalanceWei: bigint;
  readonly maxPrivateSendWei: bigint;
  readonly pendingBalanceWei: bigint;
  readonly recoverableBalanceWei: bigint;
  readonly attentionCount: number;
  readonly lastUpdatedAt: number | null;
}

export interface ShieldPortfolioSeries {
  readonly priceUsd: number | null;
  readonly totalValueUsd: number | null;
  readonly snapshots: ReadonlyArray<{
    readonly timestamp: number;
    readonly totalValueUsd: number;
  }>;
}

const OPERATION_STATES = new Set<ShieldPendingOperation["state"]>([
  "awaiting_wallet_confirmation",
  "submission_unknown",
  "submitted",
  "public_confirmed",
  "awaiting_event",
  "awaiting_asp",
  "asp_unavailable",
  "asp_poi_required",
  "asp_approved",
  "private_ready",
  "wallet_rejected",
  "submission_failed",
  "public_reverted",
  "asp_declined",
  "asp_removed",
  "ragequit_available",
  "ragequit_recovered",
  "failed_recoverable",
  "failed_needs_support",
]);

function hasExactKeys(value: object, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return (
    actual.length === sortedExpected.length &&
    actual.every((key, index) => key === sortedExpected[index])
  );
}

function parseWei(value: unknown): bigint | null {
  if (typeof value !== "string" || !SERIALIZED_WEI.test(value)) return null;
  try {
    return BigInt(value);
  } catch {
    return null;
  }
}

function parseOperation(value: unknown): ShieldPendingOperation | null {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    !hasExactKeys(value, [
      "accountAddress",
      "accountId",
      "accountType",
      "amountWei",
      "chainId",
      "createdAt",
      "destinationAddress",
      "errorCode",
      "gasReserveWei",
      "id",
      "blockNumber",
      "poolAddress",
      "protocolFeeWei",
      "revision",
      "shieldedAmountWei",
      "state",
      "totalRequiredWei",
      "txHash",
    ])
  ) {
    return null;
  }
  const raw = value as Record<string, unknown>;
  const amountWei = parseWei(raw.amountWei);
  const protocolFeeWei = parseWei(raw.protocolFeeWei);
  const shieldedAmountWei = parseWei(raw.shieldedAmountWei);
  const gasReserveWei = parseWei(raw.gasReserveWei);
  const totalRequiredWei = parseWei(raw.totalRequiredWei);
  if (
    typeof raw.id !== "string" ||
    !UUID.test(raw.id) ||
    typeof raw.revision !== "number" ||
    !Number.isSafeInteger(raw.revision) ||
    raw.revision < 0 ||
    typeof raw.state !== "string" ||
    !OPERATION_STATES.has(raw.state as ShieldPendingOperation["state"]) ||
    typeof raw.createdAt !== "number" ||
    !Number.isSafeInteger(raw.createdAt) ||
    raw.createdAt < 0 ||
    raw.chainId !== PRIVACY_POOLS_DEPLOYMENT.chainId ||
    typeof raw.accountId !== "string" ||
    raw.accountId.length === 0 ||
    raw.accountId.length > 128 ||
    typeof raw.accountAddress !== "string" ||
    !EVM_ADDRESS.test(raw.accountAddress) ||
    (raw.accountType !== "bankr" &&
      raw.accountType !== "privateKey" &&
      raw.accountType !== "seedPhrase") ||
    typeof raw.destinationAddress !== "string" ||
    !EVM_ADDRESS.test(raw.destinationAddress) ||
    typeof raw.poolAddress !== "string" ||
    !EVM_ADDRESS.test(raw.poolAddress) ||
    (raw.txHash !== null &&
      (typeof raw.txHash !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(raw.txHash))) ||
    (raw.blockNumber !== null && parseWei(raw.blockNumber) === null) ||
    (raw.errorCode !== null && typeof raw.errorCode !== "string") ||
    amountWei === null ||
    protocolFeeWei === null ||
    shieldedAmountWei === null ||
    gasReserveWei === null ||
    totalRequiredWei === null ||
    amountWei !== protocolFeeWei + shieldedAmountWei ||
    totalRequiredWei !== amountWei + gasReserveWei
  ) {
    return null;
  }
  return Object.freeze({
    id: raw.id,
    revision: raw.revision,
    state: raw.state as ShieldPendingOperation["state"],
    createdAt: raw.createdAt,
    chainId: PRIVACY_POOLS_DEPLOYMENT.chainId,
    accountId: raw.accountId,
    accountAddress: raw.accountAddress,
    accountType: raw.accountType,
    amountWei,
    protocolFeeWei,
    shieldedAmountWei,
    gasReserveWei,
    totalRequiredWei,
    destinationAddress: raw.destinationAddress,
    poolAddress: raw.poolAddress,
    txHash: raw.txHash as string | null,
    blockNumber: raw.blockNumber as string | null,
    errorCode: raw.errorCode as string | null,
  });
}

export function parseShieldOperationResponse(
  response: unknown,
  expectedAccount: ShieldSourceAccount,
  expectedAmountWei: bigint,
): ShieldPendingOperation | null {
  if (
    typeof response !== "object" ||
    response === null ||
    Array.isArray(response) ||
    !hasExactKeys(response, ["operation", "status", "success"])
  ) {
    return null;
  }
  const outer = response as Record<string, unknown>;
  if (
    outer.success !== true ||
    outer.status !== "awaiting_wallet_confirmation"
  ) {
    return null;
  }
  const operation = parseOperation(outer.operation);
  if (
    !operation ||
    operation.accountId !== expectedAccount.id ||
    operation.accountType !== expectedAccount.type ||
    operation.accountAddress.toLowerCase() !==
      expectedAccount.address.toLowerCase() ||
    operation.shieldedAmountWei !== expectedAmountWei
  ) {
    return null;
  }
  return operation;
}

export function parseShieldOperationListResponse(
  response: unknown,
): {
  operations: ShieldPendingOperation[];
  portfolio: ShieldPrivatePortfolio;
  series: ShieldPortfolioSeries;
  withdrawals: UnshieldOperation[];
  recoveries: PublicRecoveryOperation[];
} | null {
  if (
    typeof response !== "object" ||
    response === null ||
    Array.isArray(response) ||
    !hasExactKeys(response, ["operations", "portfolio", "recoveries", "series", "success", "withdrawals"])
  ) {
    return null;
  }
  const outer = response as Record<string, unknown>;
  if (
    outer.success !== true ||
    !Array.isArray(outer.operations) ||
    outer.operations.length > MAX_SHIELD_OPERATION_ACTIVITY ||
    !Array.isArray(outer.withdrawals) ||
    outer.withdrawals.length > MAX_SHIELD_OPERATION_ACTIVITY ||
    !Array.isArray(outer.recoveries) ||
    outer.recoveries.length > MAX_SHIELD_OPERATION_ACTIVITY
  ) {
    return null;
  }
  const portfolio = outer.portfolio;
  if (
    typeof portfolio !== "object" ||
    portfolio === null ||
    Array.isArray(portfolio) ||
    !hasExactKeys(portfolio, [
      "attentionCount",
      "confirmedBalanceWei",
      "lastUpdatedAt",
      "maxPrivateSendWei",
      "pendingBalanceWei",
      "recoverableBalanceWei",
      "readyBalanceWei",
      "status",
    ])
  ) return null;
  const rawPortfolio = portfolio as Record<string, unknown>;
  const confirmedBalanceWei = parseWei(rawPortfolio.confirmedBalanceWei);
  const readyBalanceWei = parseWei(rawPortfolio.readyBalanceWei);
  const maxPrivateSendWei = parseWei(rawPortfolio.maxPrivateSendWei);
  const pendingBalanceWei = parseWei(rawPortfolio.pendingBalanceWei);
  const recoverableBalanceWei = parseWei(rawPortfolio.recoverableBalanceWei);
  if (
    (rawPortfolio.status !== "ready" && rawPortfolio.status !== "locked") ||
    confirmedBalanceWei === null ||
    readyBalanceWei === null ||
    maxPrivateSendWei === null ||
    maxPrivateSendWei > readyBalanceWei ||
    pendingBalanceWei === null ||
    recoverableBalanceWei === null ||
    typeof rawPortfolio.attentionCount !== "number" ||
    !Number.isSafeInteger(rawPortfolio.attentionCount) ||
    rawPortfolio.attentionCount < 0 ||
    (rawPortfolio.lastUpdatedAt !== null &&
      (typeof rawPortfolio.lastUpdatedAt !== "number" ||
        !Number.isSafeInteger(rawPortfolio.lastUpdatedAt) ||
        rawPortfolio.lastUpdatedAt < 0))
  ) return null;
  const series = outer.series;
  if (
    typeof series !== "object" || series === null || Array.isArray(series) ||
    !hasExactKeys(series, ["priceUsd", "snapshots", "totalValueUsd"])
  ) return null;
  const rawSeries = series as Record<string, unknown>;
  if (
    (rawSeries.priceUsd !== null &&
      (typeof rawSeries.priceUsd !== "number" || !Number.isFinite(rawSeries.priceUsd) || rawSeries.priceUsd <= 0)) ||
    (rawSeries.totalValueUsd !== null &&
      (typeof rawSeries.totalValueUsd !== "number" || !Number.isFinite(rawSeries.totalValueUsd) || rawSeries.totalValueUsd < 0)) ||
    !Array.isArray(rawSeries.snapshots) || rawSeries.snapshots.length > 193
  ) return null;
  const snapshots: Array<{ timestamp: number; totalValueUsd: number }> = [];
  let previousTimestamp = -1;
  for (const item of rawSeries.snapshots) {
    if (typeof item !== "object" || item === null || Array.isArray(item) ||
      !hasExactKeys(item, ["timestamp", "totalValueUsd"])) return null;
    const snapshot = item as Record<string, unknown>;
    if (typeof snapshot.timestamp !== "number" || !Number.isSafeInteger(snapshot.timestamp) ||
      snapshot.timestamp < 0 || snapshot.timestamp < previousTimestamp ||
      typeof snapshot.totalValueUsd !== "number" || !Number.isFinite(snapshot.totalValueUsd) ||
      snapshot.totalValueUsd < 0) return null;
    previousTimestamp = snapshot.timestamp;
    snapshots.push({ timestamp: snapshot.timestamp, totalValueUsd: snapshot.totalValueUsd });
  }
  const parsed = outer.operations.map(parseOperation);
  const withdrawals = outer.withdrawals.map(parseUnshieldOperation);
  const recoveries = outer.recoveries.map(parsePublicRecoveryOperation);
  return parsed.every((operation): operation is ShieldPendingOperation => operation !== null) &&
      withdrawals.every((operation): operation is UnshieldOperation => operation !== null) &&
      recoveries.every((operation): operation is PublicRecoveryOperation => operation !== null)
    ? {
        operations: parsed,
        withdrawals,
        recoveries,
        series: {
          priceUsd: rawSeries.priceUsd as number | null,
          totalValueUsd: rawSeries.totalValueUsd as number | null,
          snapshots,
        },
        portfolio: {
          status: rawPortfolio.status,
          confirmedBalanceWei,
          readyBalanceWei,
          maxPrivateSendWei,
          pendingBalanceWei,
          recoverableBalanceWei,
          attentionCount: rawPortfolio.attentionCount,
          lastUpdatedAt: rawPortfolio.lastUpdatedAt as number | null,
        },
      }
    : null;
}
