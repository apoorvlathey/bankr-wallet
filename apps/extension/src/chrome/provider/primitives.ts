import { MAX_PROVIDER_URL_CHARS } from "./limits";

const EVM_ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;
const PROVIDER_REQUEST_ID_PATTERN = /^[A-Za-z0-9_-]+$/;

export function isEvmAddress(value: unknown): value is string {
  return typeof value === "string" && EVM_ADDRESS_PATTERN.test(value);
}

export function isProviderRequestId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length >= 1 &&
    value.length <= 128 &&
    PROVIDER_REQUEST_ID_PATTERN.test(value)
  );
}

export function isBoundedHttpUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length > MAX_PROVIDER_URL_CHARS) {
    return false;
  }
  try {
    const url = new URL(value);
    return (
      (url.protocol === "https:" || url.protocol === "http:") &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}
