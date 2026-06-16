/**
 * Validation/coercion helpers for dapp-provided transaction fields.
 *
 * Dapps should send JSON-RPC quantities as hex strings, but a malformed page
 * can send arbitrary values. Normalize to canonical hex before persistence so
 * later UI/gas/signing paths never parse attacker-controlled strings directly.
 */

const DECIMAL_UINT_RE = /^(0|[1-9][0-9]*)$/;
const HEX_UINT_RE = /^0x[0-9a-fA-F]+$/;

export type NormalizedTransactionValue =
  | { ok: true; value: string }
  | { ok: false; error: string };

export function normalizeTransactionValue(
  value: unknown,
): NormalizedTransactionValue {
  if (value === undefined || value === null || value === "") {
    return { ok: true, value: "0x0" };
  }

  if (typeof value !== "string") {
    return {
      ok: false,
      error: "Transaction value must be a hex quantity string",
    };
  }

  const trimmed = value.trim();
  if (trimmed === "" || trimmed.toLowerCase() === "0x") {
    return { ok: true, value: "0x0" };
  }

  if (!HEX_UINT_RE.test(trimmed) && !DECIMAL_UINT_RE.test(trimmed)) {
    return {
      ok: false,
      error: "Transaction value must be a non-negative integer",
    };
  }

  try {
    const wei = BigInt(trimmed);
    return {
      ok: true,
      value: wei === 0n ? "0x0" : `0x${wei.toString(16)}`,
    };
  } catch {
    return {
      ok: false,
      error: "Transaction value is too malformed to parse",
    };
  }
}
