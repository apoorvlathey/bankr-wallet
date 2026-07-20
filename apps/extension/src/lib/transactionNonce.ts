export const MAX_TRANSACTION_NONCE = Number.MAX_SAFE_INTEGER - 1;

/** Validate an optional transaction nonce crossing the renderer boundary. */
export function normalizeTransactionNonce(value: unknown): number | undefined {
  if (value === undefined) return undefined;
  if (
    !Number.isSafeInteger(value) ||
    (value as number) < 0 ||
    (value as number) > MAX_TRANSACTION_NONCE
  ) {
    throw new Error("Transaction nonce must be a non-negative safe integer");
  }
  return value as number;
}

export type TransactionNonceInputResult =
  | { valid: true; nonce: number }
  | { valid: false; error: string };

/** Parse the decimal nonce shown in the transaction review editor. */
export function parseTransactionNonceInput(
  value: string,
): TransactionNonceInputResult {
  const trimmed = value.trim();
  if (!/^[0-9]+$/.test(trimmed)) {
    return { valid: false, error: "Enter a non-negative whole number" };
  }
  try {
    const parsed = BigInt(trimmed);
    if (parsed > BigInt(MAX_TRANSACTION_NONCE)) {
      return { valid: false, error: "Nonce is too large" };
    }
    return { valid: true, nonce: Number(parsed) };
  } catch {
    return { valid: false, error: "Enter a valid nonce" };
  }
}
