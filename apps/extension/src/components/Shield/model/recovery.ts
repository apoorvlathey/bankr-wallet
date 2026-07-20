const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const HASH = /^0x[0-9a-fA-F]{64}$/;
const UINT = /^(?:0|[1-9]\d{0,79})$/;

export function getPublicWithdrawalCopy(waitingForAsp: boolean): {
  title: string;
  action: string;
} {
  return {
    title: waitingForAsp
      ? "Withdraw without waiting?"
      : "Private Unshield unavailable",
    action: "Withdraw publicly",
  };
}

const PUBLIC_WITHDRAW_OPERATION_STATES = new Set([
  "awaiting_asp",
  "asp_declined",
  "asp_removed",
  "ragequit_available",
]);

export interface PublicWithdrawalOffer {
  readonly amountWei: bigint;
  readonly accountId: string;
  readonly accountAddress: string;
  readonly accountType: "privateKey" | "seedPhrase";
  readonly activeAccountMatches: boolean;
}

interface PublicWithdrawalOperation {
  readonly accountId: string;
  readonly accountAddress: string;
  readonly accountType: string;
  readonly state: string;
  readonly shieldedAmountWei: bigint;
  readonly createdAt: number;
}

function isLocalAccountType(
  type: string,
): type is PublicWithdrawalOffer["accountType"] {
  return type === "privateKey" || type === "seedPhrase";
}

function accountMatches(
  account: { id: string; address: string; type: string } | null,
  offer: Pick<PublicWithdrawalOffer, "accountId" | "accountAddress" | "accountType">,
): boolean {
  return Boolean(
    account &&
      account.id === offer.accountId &&
      account.address.toLowerCase() === offer.accountAddress.toLowerCase() &&
      account.type === offer.accountType,
  );
}

/** Keep each depositor's public exit visible regardless of the selected account. */
export function getPublicWithdrawalOffer(input: {
  account: { id: string; address: string; type: string } | null;
  recoverableBalanceWei: bigint;
  operations: readonly PublicWithdrawalOperation[];
}): PublicWithdrawalOffer | null {
  const grouped = new Map<string, PublicWithdrawalOffer & { createdAt: number }>();
  for (const operation of input.operations) {
    if (
      !isLocalAccountType(operation.accountType) ||
      !PUBLIC_WITHDRAW_OPERATION_STATES.has(operation.state) ||
      operation.shieldedAmountWei <= 0n
    ) continue;
    const key = `${operation.accountType}:${operation.accountId}:${operation.accountAddress.toLowerCase()}`;
    const existing = grouped.get(key);
    if (existing) {
      grouped.set(key, {
        ...existing,
        amountWei: existing.amountWei + operation.shieldedAmountWei,
        createdAt: Math.min(existing.createdAt, operation.createdAt),
      });
      continue;
    }
    grouped.set(key, {
      amountWei: operation.shieldedAmountWei,
      accountId: operation.accountId,
      accountAddress: operation.accountAddress,
      accountType: operation.accountType,
      activeAccountMatches: false,
      createdAt: operation.createdAt,
    });
  }

  const offers = [...grouped.values()].sort((left, right) =>
    left.createdAt - right.createdAt || left.accountId.localeCompare(right.accountId),
  );
  const matchingOffer = offers.find((offer) => accountMatches(input.account, offer));
  if (matchingOffer) {
    return {
      amountWei: input.recoverableBalanceWei > matchingOffer.amountWei
        ? input.recoverableBalanceWei
        : matchingOffer.amountWei,
      accountId: matchingOffer.accountId,
      accountAddress: matchingOffer.accountAddress,
      accountType: matchingOffer.accountType,
      activeAccountMatches: true,
    };
  }

  if (
    input.recoverableBalanceWei > 0n &&
    input.account &&
    isLocalAccountType(input.account.type)
  ) {
    return {
      amountWei: input.recoverableBalanceWei,
      accountId: input.account.id,
      accountAddress: input.account.address,
      accountType: input.account.type,
      activeAccountMatches: true,
    };
  }

  const offer = offers[0];
  return offer ? {
    amountWei: offer.amountWei,
    accountId: offer.accountId,
    accountAddress: offer.accountAddress,
    accountType: offer.accountType,
    activeAccountMatches: false,
  } : null;
}

export type PublicRecoveryState =
  | "awaiting_wallet_confirmation"
  | "submission_unknown"
  | "submitted"
  | "public_confirmed"
  | "recovered"
  | "wallet_rejected"
  | "submission_failed"
  | "public_reverted"
  | "failed_recoverable"
  | "failed_needs_support";

export interface PublicRecoveryOperation {
  id: string;
  state: PublicRecoveryState;
  revision: number;
  createdAt: number;
  updatedAt: number;
  chainId: 11_155_111;
  amountWei: bigint;
  accountAddress: string;
  txHash: string | null;
  blockNumber: string | null;
  errorCode: string | null;
}

const STATES = new Set<PublicRecoveryState>([
  "awaiting_wallet_confirmation", "submission_unknown", "submitted",
  "public_confirmed", "recovered", "wallet_rejected", "submission_failed",
  "public_reverted", "failed_recoverable", "failed_needs_support",
]);

function exact(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

export function parsePublicRecoveryOperation(value: unknown): PublicRecoveryOperation | null {
  if (!exact(value, [
    "accountAddress", "amountWei", "blockNumber", "chainId", "createdAt",
    "errorCode", "id", "revision", "state", "txHash", "updatedAt",
  ])) return null;
  if (
    typeof value.id !== "string" || !UUID.test(value.id) ||
    typeof value.state !== "string" || !STATES.has(value.state as PublicRecoveryState) ||
    typeof value.revision !== "number" || !Number.isSafeInteger(value.revision) || value.revision < 0 ||
    typeof value.createdAt !== "number" || !Number.isSafeInteger(value.createdAt) || value.createdAt < 0 ||
    typeof value.updatedAt !== "number" || !Number.isSafeInteger(value.updatedAt) || value.updatedAt < value.createdAt ||
    value.chainId !== 11_155_111 ||
    typeof value.amountWei !== "string" || !UINT.test(value.amountWei) || BigInt(value.amountWei) <= 0n ||
    typeof value.accountAddress !== "string" || !ADDRESS.test(value.accountAddress) ||
    (value.txHash !== null && (typeof value.txHash !== "string" || !HASH.test(value.txHash))) ||
    (value.blockNumber !== null && (typeof value.blockNumber !== "string" || !UINT.test(value.blockNumber))) ||
    (value.errorCode !== null && typeof value.errorCode !== "string")
  ) return null;
  return {
    id: value.id,
    state: value.state as PublicRecoveryState,
    revision: value.revision,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    chainId: 11_155_111,
    amountWei: BigInt(value.amountWei),
    accountAddress: value.accountAddress,
    txHash: value.txHash as string | null,
    blockNumber: value.blockNumber as string | null,
    errorCode: value.errorCode as string | null,
  };
}
