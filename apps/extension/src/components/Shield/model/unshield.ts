import { getAddress, isAddress, parseEther, zeroAddress } from "viem";
import { PRIVACY_POOLS_DEPLOYMENT } from "@/chrome/privacy/deployment/manifest";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const HASH = /^0x[0-9a-fA-F]{64}$/;
const UINT = /^(?:0|[1-9]\d{0,79})$/;

export type PrivateWithdrawalIntent = "unshield" | "send";

export interface PrivateWithdrawalCopy {
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

const PRIVATE_WITHDRAWAL_COPY: Readonly<Record<PrivateWithdrawalIntent, PrivateWithdrawalCopy>> =
  Object.freeze({
    unshield: Object.freeze({
      title: "Unshield",
      recipientLabel: "Receive at",
      recipientPickerTitle: "Choose address",
      recipientChooserLabel: "Choose address",
      reviewLabel: "Review unshield",
      sourceAmountLabel: "From private balance",
      outcomeAmountLabel: "You receive",
      availableBalanceLabel: "Available to unshield",
      confirmLabel: "Unshield",
      recipientContextLabel: "unshield recipient",
    }),
    send: Object.freeze({
      title: "Send privately",
      recipientLabel: "Recipient",
      recipientPickerTitle: "My contacts",
      recipientChooserLabel: "My contacts",
      reviewLabel: "Review private send",
      sourceAmountLabel: "From private balance",
      outcomeAmountLabel: "Recipient receives",
      availableBalanceLabel: "Available to send privately",
      confirmLabel: "Send privately",
      recipientContextLabel: "private-send recipient",
    }),
  });

export function getPrivateWithdrawalCopy(
  intent: PrivateWithdrawalIntent,
): PrivateWithdrawalCopy {
  return PRIVATE_WITHDRAWAL_COPY[intent];
}

export interface UnshieldOperation {
  readonly id: string;
  readonly state:
    | "quote_ready" | "proof_preparing" | "proof_verified"
    | "submitting_to_relayer" | "submission_unknown" | "submitted"
    | "public_confirmed" | "private_balance_updated" | "quote_expired"
    | "proof_failed" | "relayer_rejected" | "public_reverted"
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
}

const STATES = new Set<UnshieldOperation["state"]>([
  "quote_ready", "proof_preparing", "proof_verified", "submitting_to_relayer",
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

export function parseUnshieldOperation(value: unknown): UnshieldOperation | null {
  if (!exact(value, [
    "amountWei", "blockNumber", "chainId", "createdAt", "errorCode", "expiresAt",
    "feeBPS", "id", "netRecipientAmountWei", "recipient",
    "recipientMatchesDepositor", "relayFeeWei", "relayerName", "revision", "state",
    "txHash", "updatedAt",
  ])) return null;
  const amountWei = uint(value.amountWei);
  const netRecipientAmountWei = uint(value.netRecipientAmountWei);
  const relayFeeWei = uint(value.relayFeeWei);
  const feeBPS = uint(value.feeBPS);
  if (
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
    (value.errorCode !== null && typeof value.errorCode !== "string")
  ) return null;
  return Object.freeze({
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
  });
}

export function parseUnshieldResponse(value: unknown): UnshieldOperation | null {
  if (!exact(value, ["operation", "success"]) || value.success !== true) return null;
  return parseUnshieldOperation(value.operation);
}

export function parseUnshieldError(value: unknown): string | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const error = (value as { error?: unknown }).error;
  return typeof error === "string" && error.length > 0 && error.length <= 240 ? error : null;
}

export function validateUnshieldInput(
  amount: string,
  recipient: string,
  availableWei: bigint,
): { valid: true; amountWei: bigint; recipient: string } | { valid: false } {
  try {
    const amountWei = parseEther(amount.trim());
    if (
      amountWei <= 0n || amountWei > availableWei ||
      !isAddress(recipient, { strict: false }) || recipient.toLowerCase() === zeroAddress
    ) return { valid: false };
    return { valid: true, amountWei, recipient: getAddress(recipient) };
  } catch {
    return { valid: false };
  }
}
