import type { PreparedFeePaymentQuote } from "./quotes";
import type { Hex } from "./pimlicoTypes";

export function assertFeePaymentQuoteChainState(
  quote: PreparedFeePaymentQuote,
  state: {
    needsAuthorization: boolean;
    userOperationNonce: Hex;
    eoaNonce: number | null;
  },
): void {
  if (
    state.needsAuthorization !== quote.needsAuthorization ||
    state.userOperationNonce !== quote.prepared.userOperation.nonce ||
    (quote.needsAuthorization && state.eoaNonce !== quote.eoaNonce)
  ) {
    throw new Error("Account state changed; refresh the fee-token quote");
  }
}
