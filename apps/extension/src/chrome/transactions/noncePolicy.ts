import { normalizeTransactionNonce } from "@/lib/transactionNonce";

export type TransactionNonceSelection =
  | { ok: true; nonce: number | undefined }
  | { ok: false; error: string };

/** Validate an optional nonce and reject execution modes that cannot use it. */
export function validateTransactionNonceSelection(
  value: unknown,
  mode: "native" | "feeToken" | "forceInclusion",
  requiredNonce?: number,
): TransactionNonceSelection {
  let nonce: number | undefined;
  try {
    nonce = normalizeTransactionNonce(value);
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Invalid transaction nonce",
    };
  }
  if (requiredNonce !== undefined && nonce !== requiredNonce) {
    return {
      ok: false,
      error: `Replacement transaction must use nonce ${requiredNonce}`,
    };
  }
  if (nonce === undefined || mode === "native") return { ok: true, nonce };
  return {
    ok: false,
    error:
      mode === "feeToken"
        ? "Custom nonce is unavailable when paying network fees with a token"
        : "Custom nonce is unavailable for force inclusion",
  };
}
