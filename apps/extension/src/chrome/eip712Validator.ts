/** Bounded EIP-712 validation facade and orchestration. */

import {
  RAW_ERC7710_DELEGATION_SIGNATURE_ERROR,
  isRawErc7710DelegationSignatureRequest,
} from "./eip712DelegationPolicy";
import {
  detectEip712CircularReferences,
  validateEip712NestingDepth,
  validateEip712ObjectDepth,
  validateEip712TypeDefinitions,
} from "./eip712SchemaValidation";
import { sanitizeEip712TypedData } from "./eip712Sanitization";
import type { EIP712ValidationResult } from "./eip712ValidationTypes";

export type { EIP712ValidationResult } from "./eip712ValidationTypes";
export {
  RAW_ERC7710_DELEGATION_SIGNATURE_ERROR,
  isRawErc7710DelegationSignatureRequest,
} from "./eip712DelegationPolicy";

const MAX_NESTING_DEPTH = 50;
const MAX_PAYLOAD_BYTES = 128 * 1024;
const MAX_TYPES = 64;
const MAX_FIELDS_PER_TYPE = 32;

export function validateEIP712TypedData(
  method: string,
  typedData: any,
): EIP712ValidationResult {
  if (method !== "eth_signTypedData_v3" && method !== "eth_signTypedData_v4") {
    return { valid: true };
  }

  try {
    const serialized =
      typeof typedData === "string" ? typedData : JSON.stringify(typedData);
    if (serialized.length > MAX_PAYLOAD_BYTES) {
      return {
        valid: false,
        error: `Typed data exceeds maximum size of ${MAX_PAYLOAD_BYTES} bytes`,
      };
    }
  } catch {
    return { valid: false, error: "Typed data could not be serialized" };
  }

  let data: any;
  try {
    data = typeof typedData === "string" ? JSON.parse(typedData) : typedData;
  } catch {
    return { valid: false, error: "Invalid JSON in typed data" };
  }
  if (!data.types || typeof data.types !== "object") {
    return { valid: false, error: "Missing or invalid 'types' field" };
  }

  const typeNames = Object.keys(data.types);
  if (typeNames.length > MAX_TYPES) {
    return {
      valid: false,
      error: `Typed data exceeds maximum of ${MAX_TYPES} types`,
    };
  }
  for (const typeName of typeNames) {
    const fields = data.types[typeName];
    if (Array.isArray(fields) && fields.length > MAX_FIELDS_PER_TYPE) {
      return {
        valid: false,
        error: `Type '${typeName}' exceeds maximum of ${MAX_FIELDS_PER_TYPE} fields`,
      };
    }
  }
  if (!data.domain || typeof data.domain !== "object") {
    return { valid: false, error: "Missing or invalid 'domain' field" };
  }
  if (!data.primaryType || typeof data.primaryType !== "string") {
    return { valid: false, error: "Missing or invalid 'primaryType' field" };
  }
  if (!data.message || typeof data.message !== "object") {
    return { valid: false, error: "Missing or invalid 'message' field" };
  }
  if (isRawErc7710DelegationSignatureRequest(method, data)) {
    return { valid: false, error: RAW_ERC7710_DELEGATION_SIGNATURE_ERROR };
  }

  for (const result of [
    validateEip712ObjectDepth(data, MAX_NESTING_DEPTH),
    detectEip712CircularReferences(data.types),
    validateEip712NestingDepth(data.types, MAX_NESTING_DEPTH),
    validateEip712TypeDefinitions(data.types),
  ]) {
    if (!result.valid) return result;
  }

  return { valid: true, sanitized: sanitizeEip712TypedData(data) };
}
