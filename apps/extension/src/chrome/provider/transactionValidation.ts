import {
  MAX_HEX_DATA_CHARS,
  MAX_UINT256_DECIMAL_CHARS,
  MAX_UINT256_HEX_CHARS,
} from "./limits";
import { isEvmAddress } from "./primitives";
import {
  failProviderValidation,
  type ProviderValidationResult,
} from "./validation";

const HEX_BYTES_PATTERN = /^0x(?:[0-9a-fA-F]{2})*$/;
// Accept zero-padded hex at ingress. Transaction intake canonicalizes it.
const HEX_QUANTITY_PATTERN = /^0x[0-9a-fA-F]+$/;
const DECIMAL_QUANTITY_PATTERN = /^(?:0|[1-9][0-9]*)$/;
const POSITIVE_DECIMAL_PATTERN = /^[1-9][0-9]*$/;
const HEX_INTEGER_PATTERN = /^0x[0-9a-fA-F]+$/;
const MAX_UINT256 = (1n << 256n) - 1n;

function validateQuantity(
  value: unknown,
  field: string,
  allowEmptyAsZero = false,
): ProviderValidationResult {
  if (value === undefined || value === null) return { valid: true };
  if (typeof value !== "string") {
    return failProviderValidation(
      `Transaction '${field}' must be an integer string`,
    );
  }
  if (value.length > MAX_UINT256_DECIMAL_CHARS) {
    return failProviderValidation(`Transaction '${field}' is too large`);
  }

  const trimmed = value.trim();
  if (allowEmptyAsZero && (trimmed === "" || trimmed.toLowerCase() === "0x")) {
    return { valid: true };
  }

  const isHex = HEX_QUANTITY_PATTERN.test(trimmed);
  const isDecimal = DECIMAL_QUANTITY_PATTERN.test(trimmed);
  if (!isHex && !isDecimal) {
    return failProviderValidation(
      `Transaction '${field}' must be a non-negative integer`,
    );
  }
  if (
    (isHex && trimmed.length > MAX_UINT256_HEX_CHARS) ||
    (isDecimal && trimmed.length > MAX_UINT256_DECIMAL_CHARS)
  ) {
    return failProviderValidation(`Transaction '${field}' is too large`);
  }

  try {
    if (BigInt(trimmed) > MAX_UINT256) {
      return failProviderValidation(`Transaction '${field}' is too large`);
    }
  } catch {
    return failProviderValidation(`Transaction '${field}' is invalid`);
  }

  return { valid: true };
}

/**
 * Validates fields consumed by confirmation, simulation, and local signing.
 * `from` is optional because WalletConnect can infer the session account; the
 * injected-provider envelope requires it separately.
 */
export function validateTransactionPayload(
  transaction: unknown,
): ProviderValidationResult {
  if (!transaction || typeof transaction !== "object" || Array.isArray(transaction)) {
    return failProviderValidation("Invalid transaction request");
  }

  const candidate = transaction as Record<string, unknown>;
  if (candidate.chainId !== undefined && candidate.chainId !== null) {
    const rawChainId = candidate.chainId;
    if (typeof rawChainId === "number") {
      if (!Number.isSafeInteger(rawChainId) || rawChainId <= 0) {
        return failProviderValidation(
          "Transaction chainId must be a positive safe integer",
        );
      }
    } else if (typeof rawChainId === "string") {
      if (
        (!POSITIVE_DECIMAL_PATTERN.test(rawChainId) &&
          !HEX_INTEGER_PATTERN.test(rawChainId)) ||
        rawChainId.length > MAX_UINT256_HEX_CHARS
      ) {
        return failProviderValidation("Transaction chainId is invalid");
      }
      try {
        const parsedChainId = BigInt(rawChainId);
        if (parsedChainId <= 0n || parsedChainId > BigInt(Number.MAX_SAFE_INTEGER)) {
          return failProviderValidation("Transaction chainId is invalid");
        }
      } catch {
        return failProviderValidation("Transaction chainId is invalid");
      }
    } else {
      return failProviderValidation("Transaction chainId is invalid");
    }
  }
  if (
    candidate.from !== undefined &&
    candidate.from !== null &&
    !isEvmAddress(candidate.from)
  ) {
    return failProviderValidation("Transaction 'from' must be a valid address");
  }
  if (
    candidate.to !== undefined &&
    candidate.to !== null &&
    !isEvmAddress(candidate.to)
  ) {
    return failProviderValidation("Transaction 'to' must be a valid address");
  }
  if (
    candidate.data !== undefined &&
    candidate.data !== null &&
    (typeof candidate.data !== "string" ||
      candidate.data.length > MAX_HEX_DATA_CHARS ||
      !HEX_BYTES_PATTERN.test(candidate.data))
  ) {
    return failProviderValidation("Transaction data is invalid or too large");
  }

  const valueResult = validateQuantity(candidate.value, "value", true);
  if (!valueResult.valid) return valueResult;
  for (const field of [
    "gas",
    "gasPrice",
    "maxFeePerGas",
    "maxPriorityFeePerGas",
  ]) {
    const result = validateQuantity(candidate[field], field);
    if (!result.valid) return result;
  }

  return { valid: true };
}
