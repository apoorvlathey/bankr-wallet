import { MAX_HEX_DATA_CHARS } from "../provider/limits";
import { isEvmAddress } from "../provider/primitives";
import { MAX_TRANSACTION_NONCE } from "@/lib/transactionNonce";
import { replacementFeeMinimums } from "@/lib/transactionReplacement";

const HASH_PATTERN = /^0x[0-9a-fA-F]{64}$/;
const DATA_PATTERN = /^0x(?:[0-9a-fA-F]{2})*$/;
const QUANTITY_PATTERN = /^0x[0-9a-fA-F]+$/;
const MAX_UINT256 = (1n << 256n) - 1n;

export interface ReplacementSourceTransaction {
  from: string;
  to: string | null;
  data: string;
  value: string;
  chainId: number;
  nonce: number;
  gas: string;
  maxFeePerGas?: bigint;
  maxPriorityFeePerGas?: bigint;
  gasPrice?: bigint;
}

function quantity(
  value: unknown,
  field: string,
  optional = false,
): bigint | undefined {
  if (value === undefined || value === null) {
    if (optional) return undefined;
    throw new Error(`Pending transaction is missing ${field}`);
  }
  if (typeof value !== "string" || !QUANTITY_PATTERN.test(value)) {
    throw new Error(`Pending transaction has an invalid ${field}`);
  }
  const parsed = BigInt(value);
  if (parsed > MAX_UINT256) {
    throw new Error(`Pending transaction ${field} is too large`);
  }
  return parsed;
}

/** Strictly project the configured RPC's pending record into signable fields. */
export function parseReplacementSourceTransaction(
  value: unknown,
  expected: { txHash: string; from: string; chainId: number },
): ReplacementSourceTransaction {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Pending transaction is no longer available from the RPC");
  }
  const raw = value as Record<string, unknown>;
  if (
    typeof raw.hash !== "string" ||
    !HASH_PATTERN.test(raw.hash) ||
    raw.hash.toLowerCase() !== expected.txHash.toLowerCase()
  ) {
    throw new Error("RPC returned a different pending transaction");
  }
  if (
    typeof raw.from !== "string" ||
    !isEvmAddress(raw.from) ||
    raw.from.toLowerCase() !== expected.from.toLowerCase()
  ) {
    throw new Error("Pending transaction signer does not match this account");
  }
  if (raw.blockHash != null || raw.blockNumber != null) {
    throw new Error("Transaction is already included in a block");
  }
  const rawChainId = quantity(raw.chainId, "chainId");
  if (rawChainId !== BigInt(expected.chainId)) {
    throw new Error("Pending transaction chain does not match activity");
  }
  const rawType = quantity(raw.type ?? "0x0", "type");
  const hasUnsupportedAccessList =
    rawType === 1n ||
    (raw.accessList !== undefined &&
      (!Array.isArray(raw.accessList) || raw.accessList.length > 0));
  if (
    rawType! > 2n ||
    hasUnsupportedAccessList ||
    raw.authorizationList ||
    raw.blobVersionedHashes
  ) {
    throw new Error("This transaction type cannot be replaced safely yet");
  }
  const to = raw.to;
  if (to !== null && (typeof to !== "string" || !isEvmAddress(to))) {
    throw new Error("Pending transaction has an invalid recipient");
  }
  const input = raw.input ?? raw.data ?? "0x";
  if (
    typeof input !== "string" ||
    input.length > MAX_HEX_DATA_CHARS ||
    !DATA_PATTERN.test(input)
  ) {
    throw new Error("Pending transaction calldata is invalid or too large");
  }
  const nonceValue = quantity(raw.nonce, "nonce")!;
  const nonce = Number(nonceValue);
  if (!Number.isSafeInteger(nonce) || nonce > MAX_TRANSACTION_NONCE) {
    throw new Error("Pending transaction nonce is invalid");
  }
  const gas = quantity(raw.gas, "gas")!;
  if (gas === 0n) throw new Error("Pending transaction gas limit is invalid");
  const maxFeePerGas = quantity(raw.maxFeePerGas, "maxFeePerGas", true);
  const maxPriorityFeePerGas = quantity(
    raw.maxPriorityFeePerGas,
    "maxPriorityFeePerGas",
    true,
  );
  const gasPrice = quantity(raw.gasPrice, "gasPrice", true);
  if ((maxFeePerGas === undefined) !== (maxPriorityFeePerGas === undefined)) {
    throw new Error("Pending transaction has incomplete EIP-1559 fees");
  }
  replacementFeeMinimums({ maxFeePerGas, maxPriorityFeePerGas, gasPrice });
  return {
    from: raw.from,
    to,
    data: input,
    value: `0x${quantity(raw.value ?? "0x0", "value")!.toString(16)}`,
    chainId: expected.chainId,
    nonce,
    gas: `0x${gas.toString(16)}`,
    maxFeePerGas,
    maxPriorityFeePerGas,
    gasPrice,
  };
}

export function recommendReplacementFees(
  source: ReplacementSourceTransaction,
  current?: {
    fastMaxFeePerGas?: string;
    fastMaxPriorityFeePerGas?: string;
    predictedNextBaseFee?: string;
  },
) {
  const minimum = replacementFeeMinimums(source);
  const priority = [
    minimum.maxPriorityFeePerGas,
    BigInt(current?.fastMaxPriorityFeePerGas ?? 0),
  ].reduce((highest, fee) => (fee > highest ? fee : highest));
  const baseHeadroom = BigInt(current?.predictedNextBaseFee ?? 0) * 2n + priority;
  const maxFee = [
    minimum.maxFeePerGas,
    BigInt(current?.fastMaxFeePerGas ?? 0),
    baseHeadroom,
  ].reduce((highest, fee) => (fee > highest ? fee : highest));
  return {
    minimumMaxFeePerGas: minimum.maxFeePerGas.toString(),
    minimumMaxPriorityFeePerGas: minimum.maxPriorityFeePerGas.toString(),
    maxFeePerGas: maxFee.toString(),
    maxPriorityFeePerGas: priority.toString(),
  };
}

export function parseLatestNonce(value: unknown): number {
  const parsed = quantity(value, "latest account nonce")!;
  const nonce = Number(parsed);
  if (!Number.isSafeInteger(nonce) || nonce > MAX_TRANSACTION_NONCE) {
    throw new Error("RPC returned an invalid account nonce");
  }
  return nonce;
}
