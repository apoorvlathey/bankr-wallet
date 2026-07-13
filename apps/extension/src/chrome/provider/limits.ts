export const MAX_PROVIDER_REQUEST_CHARS = 1_000_000;
export const MAX_HEX_DATA_CHARS = 262_146;
export const MAX_SIGNATURE_PAYLOAD_CHARS = 524_288;
export const MAX_RPC_PARAMS_CHARS = 524_288;
export const MAX_BATCH_CALLS = 100;
export const MAX_PROVIDER_URL_CHARS = 2_048;
export const MAX_UINT256_HEX_CHARS = 66;
export const MAX_UINT256_DECIMAL_CHARS = 78;

/** Returns null for values JSON cannot serialize, including cyclic graphs. */
export function serializedJsonLength(value: unknown): number | null {
  try {
    const serialized = JSON.stringify(value);
    return typeof serialized === "string" ? serialized.length : null;
  } catch {
    return null;
  }
}
