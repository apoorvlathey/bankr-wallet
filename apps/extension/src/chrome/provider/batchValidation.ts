import {
  MAX_BATCH_CALLS,
  MAX_HEX_DATA_CHARS,
  MAX_PROVIDER_REQUEST_CHARS,
  MAX_UINT256_HEX_CHARS,
  serializedJsonLength,
} from "./limits";
import { isEvmAddress } from "./primitives";
import {
  failProviderValidation,
  type ProviderValidationResult,
} from "./validation";

const HEX_BYTES_PATTERN = /^0x(?:[0-9a-fA-F]{2})*$/;
const HEX_QUANTITY_PATTERN = /^0x[0-9a-fA-F]+$/;

/** Shared runtime bounds for injected-provider and WalletConnect batches. */
export function validateWalletSendCallsPayload(
  params: unknown,
): ProviderValidationResult {
  if (!params || typeof params !== "object" || Array.isArray(params)) {
    return failProviderValidation("Invalid batch request");
  }

  const paramsLength = serializedJsonLength(params);
  if (paramsLength === null || paramsLength > MAX_PROVIDER_REQUEST_CHARS) {
    return failProviderValidation("Batch request is too large");
  }

  const candidate = params as Record<string, unknown>;
  if (candidate.from !== undefined && !isEvmAddress(candidate.from)) {
    return failProviderValidation("Batch 'from' must be a valid address");
  }

  const calls = candidate.calls;
  if (!Array.isArray(calls) || calls.length === 0 || calls.length > MAX_BATCH_CALLS) {
    return failProviderValidation("Invalid batch call count");
  }

  for (let index = 0; index < calls.length; index += 1) {
    const call = calls[index];
    if (!call || typeof call !== "object" || Array.isArray(call)) {
      return failProviderValidation("Invalid batch transaction data");
    }

    const candidateCall = call as Record<string, unknown>;
    if (!isEvmAddress(candidateCall.to)) {
      return failProviderValidation(
        `Call ${index + 1} must have a valid 'to' address`,
      );
    }

    if (
      candidateCall.data !== undefined &&
      (typeof candidateCall.data !== "string" ||
        candidateCall.data.length > MAX_HEX_DATA_CHARS ||
        !HEX_BYTES_PATTERN.test(candidateCall.data))
    ) {
      return failProviderValidation("Batch transaction data is invalid or too large");
    }

    if (
      candidateCall.value !== undefined &&
      (typeof candidateCall.value !== "string" ||
        candidateCall.value.length > MAX_UINT256_HEX_CHARS ||
        !HEX_QUANTITY_PATTERN.test(candidateCall.value))
    ) {
      return failProviderValidation(
        `Call ${index + 1} value must be a valid hex quantity`,
      );
    }

    if (candidateCall.from !== undefined && !isEvmAddress(candidateCall.from)) {
      return failProviderValidation(
        `Call ${index + 1} 'from' must be a valid address`,
      );
    }
  }

  return { valid: true };
}
