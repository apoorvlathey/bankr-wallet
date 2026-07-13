import {
  MAX_SIGNATURE_PAYLOAD_CHARS,
  serializedJsonLength,
} from "./limits";
import { isEvmAddress } from "./primitives";
import {
  failProviderValidation,
  type ProviderValidationResult,
} from "./validation";

const HEX_BYTES_PATTERN = /^0x(?:[0-9a-fA-F]{2})*$/;
const SIGNATURE_METHODS = new Set([
  "personal_sign",
  "eth_signTypedData_v3",
  "eth_signTypedData_v4",
]);

export function validateSignatureRequestPayload(
  method: unknown,
  params: unknown,
  options: { allowDeprecated?: boolean } = {},
): ProviderValidationResult {
  const allowed =
    (typeof method === "string" && SIGNATURE_METHODS.has(method)) ||
    (options.allowDeprecated === true &&
      (method === "eth_sign" || method === "eth_signTypedData"));
  if (!allowed || !Array.isArray(params) || params.length < 2) {
    return failProviderValidation("Unsupported or invalid signature request");
  }

  const signerIndex = method === "personal_sign" ? 1 : 0;
  if (!isEvmAddress(params[signerIndex])) {
    return failProviderValidation(
      "Signature request must include a valid signer address",
    );
  }

  if (method === "personal_sign") {
    const message = params[0];
    if (typeof message !== "string") {
      return failProviderValidation("personal_sign message must be a string");
    }
    if (
      message.startsWith("0x") &&
      (message.length > MAX_SIGNATURE_PAYLOAD_CHARS ||
        !HEX_BYTES_PATTERN.test(message))
    ) {
      return failProviderValidation("personal_sign hex message is invalid");
    }
  } else if (
    typeof params[1] !== "string" &&
    (!params[1] || typeof params[1] !== "object" || Array.isArray(params[1]))
  ) {
    return failProviderValidation("Typed signature data is invalid");
  }

  const payloadLength = serializedJsonLength(params);
  return payloadLength !== null && payloadLength <= MAX_SIGNATURE_PAYLOAD_CHARS
    ? { valid: true }
    : failProviderValidation("Signature request is too large");
}
