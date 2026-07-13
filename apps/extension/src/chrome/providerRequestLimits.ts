export const MAX_PROVIDER_REQUEST_CHARS = 1_000_000;
export const MAX_HEX_DATA_CHARS = 262_146;
export const MAX_SIGNATURE_PAYLOAD_CHARS = 524_288;
export const MAX_RPC_PARAMS_CHARS = 524_288;
export const MAX_BATCH_CALLS = 100;
export const MAX_PROVIDER_URL_CHARS = 2_048;
export const MAX_UINT256_HEX_CHARS = 66;
export const MAX_UINT256_DECIMAL_CHARS = 78;

const EVM_ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;
const HEX_BYTES_PATTERN = /^0x(?:[0-9a-fA-F]{2})*$/;
// Accept zero-padded hex at the untrusted ingress boundary. Although JSON-RPC
// quantities are normally canonical (for example `0x0`), some dapps emit
// byte-like values such as `0x00`. The transaction intake canonicalizes these
// immediately, so rejecting them here creates a false validation error without
// adding a security boundary.
const HEX_QUANTITY_PATTERN = /^0x[0-9a-fA-F]+$/;
const DECIMAL_QUANTITY_PATTERN = /^(?:0|[1-9][0-9]*)$/;
const POSITIVE_DECIMAL_PATTERN = /^[1-9][0-9]*$/;
const HEX_INTEGER_PATTERN = /^0x[0-9a-fA-F]+$/;
const MAX_UINT256 = (1n << 256n) - 1n;

export interface ProviderRequestLimitResult {
  valid: boolean;
  error?: string;
}

const SIGNATURE_METHODS = new Set([
  "personal_sign",
  "eth_signTypedData_v3",
  "eth_signTypedData_v4",
]);

export function validateSignatureRequestPayload(
  method: unknown,
  params: unknown,
  options: { allowDeprecated?: boolean } = {},
): ProviderRequestLimitResult {
  const allowed =
    SIGNATURE_METHODS.has(String(method)) ||
    (options.allowDeprecated === true &&
      (method === "eth_sign" || method === "eth_signTypedData"));
  if (!allowed || !Array.isArray(params) || params.length < 2) {
    return fail("Unsupported or invalid signature request");
  }

  const signerIndex = method === "personal_sign" ? 1 : 0;
  if (
    typeof params[signerIndex] !== "string" ||
    !EVM_ADDRESS_PATTERN.test(params[signerIndex])
  ) {
    return fail("Signature request must include a valid signer address");
  }

  if (method === "personal_sign") {
    const message = params[0];
    if (typeof message !== "string") {
      return fail("personal_sign message must be a string");
    }
    if (
      message.startsWith("0x") &&
      (message.length > MAX_SIGNATURE_PAYLOAD_CHARS ||
        !HEX_BYTES_PATTERN.test(message))
    ) {
      return fail("personal_sign hex message is invalid");
    }
  } else if (
    typeof params[1] !== "string" &&
    (!params[1] || typeof params[1] !== "object" || Array.isArray(params[1]))
  ) {
    return fail("Typed signature data is invalid");
  }

  const payloadLength = serializedJsonLength(params);
  return payloadLength !== null && payloadLength <= MAX_SIGNATURE_PAYLOAD_CHARS
    ? { valid: true }
    : fail("Signature request is too large");
}

export function serializedJsonLength(value: unknown): number | null {
  try {
    const serialized = JSON.stringify(value);
    return typeof serialized === "string" ? serialized.length : null;
  } catch {
    return null;
  }
}

function fail(error: string): ProviderRequestLimitResult {
  return { valid: false, error };
}

function validateQuantity(
  value: unknown,
  field: string,
  allowEmptyAsZero = false,
): ProviderRequestLimitResult {
  if (value === undefined || value === null) return { valid: true };
  if (typeof value !== "string") {
    return fail(`Transaction '${field}' must be an integer string`);
  }
  if (value.length > MAX_UINT256_DECIMAL_CHARS) {
    return fail(`Transaction '${field}' is too large`);
  }

  const trimmed = value.trim();
  if (allowEmptyAsZero && (trimmed === "" || trimmed.toLowerCase() === "0x")) {
    return { valid: true };
  }

  const isHex = HEX_QUANTITY_PATTERN.test(trimmed);
  const isDecimal = DECIMAL_QUANTITY_PATTERN.test(trimmed);
  if (!isHex && !isDecimal) {
    return fail(`Transaction '${field}' must be a non-negative integer`);
  }
  if (
    (isHex && trimmed.length > MAX_UINT256_HEX_CHARS) ||
    (isDecimal && trimmed.length > MAX_UINT256_DECIMAL_CHARS)
  ) {
    return fail(`Transaction '${field}' is too large`);
  }

  try {
    if (BigInt(trimmed) > MAX_UINT256) {
      return fail(`Transaction '${field}' is too large`);
    }
  } catch {
    return fail(`Transaction '${field}' is invalid`);
  }

  return { valid: true };
}

/**
 * Validates the transaction fields consumed by confirmation, simulation, and
 * local signing. The same validator is used for content-script and
 * WalletConnect ingress so neither transport can turn an invalid destination
 * into contract creation or persist quantities that later throw in BigInt().
 *
 * `from` is optional here because WalletConnect can infer it from the approved
 * session account. The injected-provider boundary requires it separately.
 */
export function validateTransactionPayload(
  transaction: unknown,
): ProviderRequestLimitResult {
  if (!transaction || typeof transaction !== "object" || Array.isArray(transaction)) {
    return fail("Invalid transaction request");
  }

  const candidate = transaction as Record<string, unknown>;
  if (candidate.chainId !== undefined && candidate.chainId !== null) {
    const rawChainId = candidate.chainId;
    if (typeof rawChainId === "number") {
      if (!Number.isSafeInteger(rawChainId) || rawChainId <= 0) {
        return fail("Transaction chainId must be a positive safe integer");
      }
    } else if (typeof rawChainId === "string") {
      if (
        (!POSITIVE_DECIMAL_PATTERN.test(rawChainId) &&
          !HEX_INTEGER_PATTERN.test(rawChainId)) ||
        rawChainId.length > MAX_UINT256_HEX_CHARS
      ) {
        return fail("Transaction chainId is invalid");
      }
      try {
        const parsedChainId = BigInt(rawChainId);
        if (parsedChainId <= 0n || parsedChainId > BigInt(Number.MAX_SAFE_INTEGER)) {
          return fail("Transaction chainId is invalid");
        }
      } catch {
        return fail("Transaction chainId is invalid");
      }
    } else {
      return fail("Transaction chainId is invalid");
    }
  }
  if (
    candidate.from !== undefined &&
    candidate.from !== null &&
    (typeof candidate.from !== "string" ||
      !EVM_ADDRESS_PATTERN.test(candidate.from))
  ) {
    return fail("Transaction 'from' must be a valid address");
  }
  if (
    candidate.to !== undefined &&
    candidate.to !== null &&
    (typeof candidate.to !== "string" || !EVM_ADDRESS_PATTERN.test(candidate.to))
  ) {
    return fail("Transaction 'to' must be a valid address");
  }
  if (
    candidate.data !== undefined &&
    candidate.data !== null &&
    (typeof candidate.data !== "string" ||
      candidate.data.length > MAX_HEX_DATA_CHARS ||
      !HEX_BYTES_PATTERN.test(candidate.data))
  ) {
    return fail("Transaction data is invalid or too large");
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

/**
 * Runtime bounds shared by injected-provider and WalletConnect batches.
 * Both transports are controlled by an untrusted dapp, so the common batch
 * handler must never assume an ingress-specific validator already ran.
 */
export function validateWalletSendCallsPayload(
  params: unknown,
): ProviderRequestLimitResult {
  if (!params || typeof params !== "object" || Array.isArray(params)) {
    return fail("Invalid batch request");
  }

  const paramsLength = serializedJsonLength(params);
  if (paramsLength === null || paramsLength > MAX_PROVIDER_REQUEST_CHARS) {
    return fail("Batch request is too large");
  }

  const candidate = params as Record<string, unknown>;
  if (
    candidate.from !== undefined &&
    (typeof candidate.from !== "string" ||
      !EVM_ADDRESS_PATTERN.test(candidate.from))
  ) {
    return fail("Batch 'from' must be a valid address");
  }

  const calls = candidate.calls;
  if (
    !Array.isArray(calls) ||
    calls.length === 0 ||
    calls.length > MAX_BATCH_CALLS
  ) {
    return fail("Invalid batch call count");
  }

  for (let index = 0; index < calls.length; index += 1) {
    const call = calls[index];
    if (!call || typeof call !== "object" || Array.isArray(call)) {
      return fail("Invalid batch transaction data");
    }

    const candidateCall = call as Record<string, unknown>;
    if (
      typeof candidateCall.to !== "string" ||
      !EVM_ADDRESS_PATTERN.test(candidateCall.to)
    ) {
      return fail(`Call ${index + 1} must have a valid 'to' address`);
    }

    if (candidateCall.data !== undefined) {
      if (
        typeof candidateCall.data !== "string" ||
        candidateCall.data.length > MAX_HEX_DATA_CHARS ||
        !HEX_BYTES_PATTERN.test(candidateCall.data)
      ) {
        return fail("Batch transaction data is invalid or too large");
      }
    }

    if (candidateCall.value !== undefined) {
      if (
        typeof candidateCall.value !== "string" ||
        candidateCall.value.length > MAX_UINT256_HEX_CHARS ||
        !HEX_QUANTITY_PATTERN.test(candidateCall.value)
      ) {
        return fail(`Call ${index + 1} value must be a valid hex quantity`);
      }
    }

    if (
      candidateCall.from !== undefined &&
      (typeof candidateCall.from !== "string" ||
        !EVM_ADDRESS_PATTERN.test(candidateCall.from))
    ) {
      return fail(`Call ${index + 1} 'from' must be a valid address`);
    }
  }

  return { valid: true };
}
