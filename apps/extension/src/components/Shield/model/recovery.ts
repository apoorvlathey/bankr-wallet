import {
  PRIVACY_POOLS_DEPLOYMENT,
  PRIVACY_POOLS_RELEASE_POLICY,
} from "@/chrome/privacy/deployment/manifest";

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
      ? "Need it now?"
      : "Public exit available",
    action: "Withdraw publicly",
  };
}

const PUBLIC_WITHDRAW_OPERATION_STATES = new Set([
  "awaiting_asp",
  "asp_unavailable",
  "asp_poi_required",
  "asp_declined",
  "asp_removed",
  "ragequit_available",
]);

export interface PublicWithdrawalOffer {
  readonly amountWei: bigint;
  readonly accountId: string;
  readonly accountAddress: string;
  readonly accountType: "bankr" | "privateKey" | "seedPhrase";
  readonly activeAccountMatches: boolean;
  readonly sourceOperationId: string | null;
}

interface PublicWithdrawalOperation {
  readonly id: string;
  readonly accountId: string;
  readonly accountAddress: string;
  readonly accountType: string;
  readonly state: string;
  readonly shieldedAmountWei: bigint;
  readonly createdAt: number;
}

function isRecoverableAccountType(
  type: string,
): type is PublicWithdrawalOffer["accountType"] {
  return (type === "bankr" &&
      PRIVACY_POOLS_RELEASE_POLICY.bankrMutations === "enabled") ||
    type === "privateKey" || type === "seedPhrase";
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
  preferredOperationId?: string | null;
  allowPrivateReady?: boolean;
}): PublicWithdrawalOffer | null {
  if (input.preferredOperationId) {
    const preferred = input.operations.find((operation) =>
      operation.id === input.preferredOperationId
    );
    if (
      !preferred ||
      !isRecoverableAccountType(preferred.accountType) ||
      (!PUBLIC_WITHDRAW_OPERATION_STATES.has(preferred.state) &&
        !(input.allowPrivateReady && preferred.state === "private_ready")) ||
      preferred.shieldedAmountWei <= 0n
    ) return null;
    const offer = {
      amountWei: preferred.shieldedAmountWei,
      accountId: preferred.accountId,
      accountAddress: preferred.accountAddress,
      accountType: preferred.accountType,
      sourceOperationId: preferred.id,
    } as const;
    return {
      ...offer,
      activeAccountMatches: accountMatches(input.account, offer),
    };
  }

  const offers = input.operations
    .filter((operation) =>
      isRecoverableAccountType(operation.accountType) &&
      (PUBLIC_WITHDRAW_OPERATION_STATES.has(operation.state) ||
        (input.allowPrivateReady && operation.state === "private_ready")) &&
      operation.shieldedAmountWei > 0n
    )
    .sort((left, right) =>
      left.createdAt - right.createdAt || left.accountId.localeCompare(right.accountId)
    )
    .map((operation): PublicWithdrawalOffer => ({
      amountWei: operation.shieldedAmountWei,
      accountId: operation.accountId,
      accountAddress: operation.accountAddress,
      accountType: operation.accountType as PublicWithdrawalOffer["accountType"],
      activeAccountMatches: accountMatches(input.account, {
        accountId: operation.accountId,
        accountAddress: operation.accountAddress,
        accountType: operation.accountType as PublicWithdrawalOffer["accountType"],
      }),
      sourceOperationId: operation.id,
    }));
  const matchingOffer = offers.find((offer) => accountMatches(input.account, offer));
  if (matchingOffer) {
    return matchingOffer;
  }

  if (
    input.recoverableBalanceWei > 0n &&
    input.account &&
    isRecoverableAccountType(input.account.type)
  ) {
    return {
      amountWei: input.recoverableBalanceWei,
      accountId: input.account.id,
      accountAddress: input.account.address,
      accountType: input.account.type,
      activeAccountMatches: true,
      sourceOperationId: null,
    };
  }

  const offer = offers[0];
  return offer ?? null;
}

export interface PublicRecoveryPreview {
  readonly commitmentId: string;
  readonly createdAt: number;
  readonly accountId: string;
  readonly accountAddress: string;
  readonly accountType: "bankr" | "privateKey" | "seedPhrase";
  readonly amountWei: bigint;
  readonly originalAmountWei: bigint;
  readonly withdrawnAmountWei: bigint;
  readonly withdrawalCount: number;
  readonly sourceOperationId: string | null;
}

const MAX_PUBLIC_RECOVERY_PREVIEWS = 1_024;

function parsePublicRecoveryPreview(
  value: unknown,
): PublicRecoveryPreview | null {
  if (!exact(value, [
    "accountAddress", "accountId", "accountType", "amountWei", "commitmentId",
    "createdAt", "originalAmountWei", "sourceOperationId", "withdrawalCount",
    "withdrawnAmountWei",
  ])) return null;
  if (
    typeof value.commitmentId !== "string" || !UUID.test(value.commitmentId) ||
    typeof value.createdAt !== "number" || !Number.isSafeInteger(value.createdAt) ||
    value.createdAt < 0 ||
    typeof value.accountId !== "string" || value.accountId.length === 0 ||
    typeof value.accountAddress !== "string" || !ADDRESS.test(value.accountAddress) ||
    (value.accountType !== "bankr" && value.accountType !== "privateKey" &&
      value.accountType !== "seedPhrase") ||
    typeof value.amountWei !== "string" || !UINT.test(value.amountWei) ||
    BigInt(value.amountWei) <= 0n ||
    typeof value.originalAmountWei !== "string" || !UINT.test(value.originalAmountWei) ||
    BigInt(value.originalAmountWei) < BigInt(value.amountWei) ||
    typeof value.withdrawnAmountWei !== "string" || !UINT.test(value.withdrawnAmountWei) ||
    BigInt(value.withdrawnAmountWei) !==
      BigInt(value.originalAmountWei) - BigInt(value.amountWei) ||
    typeof value.withdrawalCount !== "number" ||
    !Number.isSafeInteger(value.withdrawalCount) || value.withdrawalCount < 0 ||
    value.withdrawalCount > 0xffff_ffff ||
    (value.sourceOperationId !== null &&
      (typeof value.sourceOperationId !== "string" || !UUID.test(value.sourceOperationId)))
  ) return null;
  return {
    commitmentId: value.commitmentId,
    createdAt: value.createdAt,
    accountId: value.accountId,
    accountAddress: value.accountAddress,
    accountType: value.accountType,
    amountWei: BigInt(value.amountWei),
    originalAmountWei: BigInt(value.originalAmountWei),
    withdrawnAmountWei: BigInt(value.withdrawnAmountWei),
    withdrawalCount: value.withdrawalCount,
    sourceOperationId: value.sourceOperationId,
  };
}

export function parsePublicRecoveryPreviewsResponse(
  value: unknown,
): PublicRecoveryPreview[] | null {
  if (!exact(value, ["previews", "success"]) || value.success !== true) return null;
  if (
    !Array.isArray(value.previews) ||
    value.previews.length > MAX_PUBLIC_RECOVERY_PREVIEWS
  ) return null;
  const previews = value.previews.map(parsePublicRecoveryPreview);
  if (previews.some((preview) => preview === null)) return null;
  const parsed = previews as PublicRecoveryPreview[];
  if (new Set(parsed.map((preview) => preview.commitmentId)).size !== parsed.length) {
    return null;
  }
  return parsed;
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
  chainId: typeof PRIVACY_POOLS_DEPLOYMENT.chainId;
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
    value.chainId !== PRIVACY_POOLS_DEPLOYMENT.chainId ||
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
    chainId: PRIVACY_POOLS_DEPLOYMENT.chainId,
    amountWei: BigInt(value.amountWei),
    accountAddress: value.accountAddress,
    txHash: value.txHash as string | null,
    blockNumber: value.blockNumber as string | null,
    errorCode: value.errorCode as string | null,
  };
}
