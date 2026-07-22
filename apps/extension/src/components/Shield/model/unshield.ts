import { formatEther, getAddress, isAddress, parseEther, zeroAddress } from "viem";
import { PRIVACY_POOLS_DEPLOYMENT } from "@/chrome/privacy/deployment/manifest";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const HASH = /^0x[0-9a-fA-F]{64}$/;
const UINT = /^(?:0|[1-9]\d{0,79})$/;

export interface UnshieldEntryTarget {
  readonly operationId: string;
  readonly shieldedAmountWei: string;
}

interface UnshieldCopy {
  readonly title: string;
  readonly recipientLabel: string;
  readonly recipientPickerTitle: string;
  readonly recipientChooserLabel: string;
  readonly reviewLabel: string;
  readonly sourceAmountLabel: string;
  readonly outcomeAmountLabel: string;
  readonly availableBalanceLabel: string;
  readonly confirmLabel: string;
  readonly recipientContextLabel: string;
}

const UNSHIELD_COPY: UnshieldCopy = Object.freeze({
  title: "Unshield",
  recipientLabel: "Receive at",
  recipientPickerTitle: "Choose address",
  recipientChooserLabel: "Address",
  reviewLabel: "Review unshield",
  sourceAmountLabel: "From private balance",
  outcomeAmountLabel: "Receiver amount",
  availableBalanceLabel: "Available to unshield",
  confirmLabel: "Unshield",
  recipientContextLabel: "unshield recipient",
});

export function getUnshieldCopy(): UnshieldCopy {
  return UNSHIELD_COPY;
}

export interface UnshieldOperation {
  readonly method: "relay" | "direct";
  readonly id: string;
  readonly state:
    | "quote_ready" | "proof_preparing" | "proof_verified"
    | "submitting_to_relayer" | "submission_unknown" | "submitted"
    | "public_confirmed" | "private_balance_updated" | "quote_expired"
    | "awaiting_wallet_confirmation" | "proof_failed" | "relayer_rejected" | "public_reverted"
    | "nullifier_already_spent" | "failed_recoverable" | "failed_needs_support";
  readonly revision: number;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly chainId: typeof PRIVACY_POOLS_DEPLOYMENT.chainId;
  readonly amountWei: bigint;
  readonly netRecipientAmountWei: bigint;
  readonly relayFeeWei: bigint;
  readonly feeBPS: bigint;
  readonly recipient: string;
  readonly relayerName: string;
  readonly expiresAt: number;
  readonly recipientMatchesDepositor: boolean;
  readonly txHash: string | null;
  readonly blockNumber: string | null;
  readonly errorCode: string | null;
  readonly accountId: string | null;
  readonly accountAddress: string | null;
  readonly accountType: "bankr" | "privateKey" | "seedPhrase" | null;
  readonly gasLimit: bigint | null;
  readonly maxFeePerGas: bigint | null;
  readonly gasFeeEstimateWei: bigint | null;
}

export interface UnshieldRelayFeeWarning {
  readonly kind: "relay-fee-cap-exceeded";
  readonly relayerName: string;
  readonly quotedFeeBPS: bigint;
  readonly maxFeeBPS: bigint;
}

const STATES = new Set<UnshieldOperation["state"]>([
  "quote_ready", "proof_preparing", "proof_verified", "submitting_to_relayer",
  "awaiting_wallet_confirmation",
  "submission_unknown", "submitted", "public_confirmed", "private_balance_updated",
  "quote_expired", "proof_failed", "relayer_rejected", "public_reverted",
  "nullifier_already_spent", "failed_recoverable", "failed_needs_support",
]);

function exact(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function uint(value: unknown): bigint | null {
  if (typeof value !== "string" || !UINT.test(value)) return null;
  try { return BigInt(value); } catch { return null; }
}

/** Preserve the exact selected Shield output when transaction details opens Unshield. */
export function getUnshieldPrefillAmount(
  target: UnshieldEntryTarget | null | undefined,
): string {
  const amountWei = uint(target?.shieldedAmountWei);
  return target && UUID.test(target.operationId) && amountWei !== null && amountWei > 0n
    ? formatEther(amountWei)
    : "";
}

export function parseUnshieldOperation(value: unknown): UnshieldOperation | null {
  const legacyRelayKeys = [
    "amountWei", "blockNumber", "chainId", "createdAt", "errorCode", "expiresAt",
    "feeBPS", "id", "netRecipientAmountWei", "recipient",
    "recipientMatchesDepositor", "relayFeeWei", "relayerName", "revision", "state",
    "txHash", "updatedAt",
  ] as const;
  const relayKeys = [...legacyRelayKeys, "method"] as const;
  const directKeys = [
    ...relayKeys,
    "accountAddress", "accountId", "accountType", "gasFeeEstimateWei",
    "gasLimit", "maxFeePerGas",
  ] as const;
  const isDirect = exact(value, directKeys) && value.method === "direct";
  const isLegacyRelay = exact(value, legacyRelayKeys);
  if (!isDirect && !isLegacyRelay && !exact(value, relayKeys)) return null;
  const method: unknown = isLegacyRelay
    ? "relay"
    : (value as unknown as Record<string, unknown>).method;
  const amountWei = uint(value.amountWei);
  const netRecipientAmountWei = uint(value.netRecipientAmountWei);
  const relayFeeWei = uint(value.relayFeeWei);
  const feeBPS = uint(value.feeBPS);
  const gasLimit = isDirect ? uint(value.gasLimit) : null;
  const maxFeePerGas = isDirect ? uint(value.maxFeePerGas) : null;
  const gasFeeEstimateWei = isDirect ? uint(value.gasFeeEstimateWei) : null;
  if (
    (method !== "relay" && method !== "direct") ||
    typeof value.id !== "string" || !UUID.test(value.id) ||
    typeof value.state !== "string" || !STATES.has(value.state as UnshieldOperation["state"]) ||
    typeof value.revision !== "number" || !Number.isSafeInteger(value.revision) || value.revision < 0 ||
    typeof value.createdAt !== "number" || !Number.isSafeInteger(value.createdAt) || value.createdAt < 0 ||
    typeof value.updatedAt !== "number" || !Number.isSafeInteger(value.updatedAt) || value.updatedAt < value.createdAt ||
    value.chainId !== PRIVACY_POOLS_DEPLOYMENT.chainId || amountWei === null || amountWei <= 0n ||
    netRecipientAmountWei === null || relayFeeWei === null || amountWei !== netRecipientAmountWei + relayFeeWei ||
    feeBPS === null || feeBPS > PRIVACY_POOLS_DEPLOYMENT.assetConfig.maxRelayFeeBPS ||
    typeof value.recipient !== "string" || !ADDRESS.test(value.recipient) ||
    typeof value.relayerName !== "string" || value.relayerName.length === 0 || value.relayerName.length > 64 ||
    typeof value.expiresAt !== "number" || !Number.isSafeInteger(value.expiresAt) || value.expiresAt < value.createdAt ||
    typeof value.recipientMatchesDepositor !== "boolean" ||
    (value.txHash !== null && (typeof value.txHash !== "string" || !HASH.test(value.txHash))) ||
    (value.blockNumber !== null && uint(value.blockNumber) === null) ||
    (value.errorCode !== null && typeof value.errorCode !== "string") ||
    (isDirect && (
      typeof value.accountId !== "string" || value.accountId.length === 0 ||
      typeof value.accountAddress !== "string" || !ADDRESS.test(value.accountAddress) ||
      value.accountAddress.toLowerCase() !== value.recipient.toLowerCase() ||
      (value.accountType !== "bankr" && value.accountType !== "privateKey" && value.accountType !== "seedPhrase") ||
      gasLimit === null || gasLimit <= 0n || maxFeePerGas === null || maxFeePerGas <= 0n ||
      gasFeeEstimateWei === null || gasFeeEstimateWei !== gasLimit * maxFeePerGas ||
      netRecipientAmountWei !== amountWei || relayFeeWei !== 0n || feeBPS !== 0n
    ))
  ) return null;
  return Object.freeze({
    method,
    id: value.id,
    state: value.state as UnshieldOperation["state"],
    revision: value.revision,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    chainId: PRIVACY_POOLS_DEPLOYMENT.chainId,
    amountWei,
    netRecipientAmountWei,
    relayFeeWei,
    feeBPS,
    recipient: value.recipient,
    relayerName: value.relayerName,
    expiresAt: value.expiresAt,
    recipientMatchesDepositor: value.recipientMatchesDepositor,
    txHash: value.txHash as string | null,
    blockNumber: value.blockNumber as string | null,
    errorCode: value.errorCode as string | null,
    accountId: isDirect ? value.accountId as string : null,
    accountAddress: isDirect ? value.accountAddress as string : null,
    accountType: isDirect ? value.accountType as "bankr" | "privateKey" | "seedPhrase" : null,
    gasLimit,
    maxFeePerGas,
    gasFeeEstimateWei,
  });
}

export function parseUnshieldResponse(value: unknown): UnshieldOperation | null {
  if (!exact(value, ["operation", "success"]) || value.success !== true) return null;
  return parseUnshieldOperation(value.operation);
}

export function parseUnshieldRelayFeeWarning(
  value: unknown,
): UnshieldRelayFeeWarning | null {
  const warning = typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as { warning?: unknown }).warning
    : null;
  if (!exact(value, ["code", "success", "warning"]) ||
      value.success !== false || value.code !== "relay-fee-cap-exceeded" ||
      !exact(warning, [
        "kind",
        "maxFeeBPS",
        "quotedFeeBPS",
        "relayerName",
      ])) return null;
  const quotedFeeBPS = uint(warning.quotedFeeBPS);
  const maxFeeBPS = uint(warning.maxFeeBPS);
  if (
    warning.kind !== "relay-fee-cap-exceeded" ||
    typeof warning.relayerName !== "string" ||
    !PRIVACY_POOLS_DEPLOYMENT.services.relayers.some(
      (relay) => relay.name === warning.relayerName,
    ) ||
    quotedFeeBPS === null || maxFeeBPS === null ||
    maxFeeBPS !== PRIVACY_POOLS_DEPLOYMENT.assetConfig.maxRelayFeeBPS ||
    quotedFeeBPS <= maxFeeBPS
  ) return null;
  return Object.freeze({
    kind: "relay-fee-cap-exceeded",
    relayerName: warning.relayerName,
    quotedFeeBPS,
    maxFeeBPS,
  });
}

export function formatRelayFeePercentage(feeBPS: bigint): string {
  const whole = feeBPS / 100n;
  const fractional = feeBPS % 100n;
  if (fractional === 0n) return `${whole}%`;
  const digits = fractional.toString().padStart(2, "0").replace(/0$/, "");
  return `${whole}.${digits}%`;
}

export function parseUnshieldError(value: unknown): string | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const error = (value as { error?: unknown }).error;
  return typeof error === "string" && error.length > 0 && error.length <= 240 ? error : null;
}

export function validateUnshieldAmount(
  amount: string,
  availableWei: bigint,
): { valid: true; amountWei: bigint } | { valid: false } {
  try {
    const amountWei = parseEther(amount.trim());
    return amountWei > 0n && amountWei <= availableWei
      ? { valid: true, amountWei }
      : { valid: false };
  } catch {
    return { valid: false };
  }
}

export function validateUnshieldInput(
  amount: string,
  recipient: string,
  availableWei: bigint,
): { valid: true; amountWei: bigint; recipient: string } | { valid: false } {
  const amountValidation = validateUnshieldAmount(amount, availableWei);
  if (
    !amountValidation.valid ||
    !isAddress(recipient, { strict: false }) ||
    recipient.toLowerCase() === zeroAddress
  ) return { valid: false };
  return {
    valid: true,
    amountWei: amountValidation.amountWei,
    recipient: getAddress(recipient),
  };
}
