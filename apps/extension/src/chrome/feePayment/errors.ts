const PAYMASTER_TOKEN_COLLECTION_FAILURE =
  /AA50 postOp reverted 0x7939f424/i;

export const INSUFFICIENT_REMAINING_FEE_TOKEN_ERROR =
  "This transaction would leave too little of the selected token for the network fee. Reduce the amount or choose another fee token.";
export const INSUFFICIENT_REMAINING_USDC_ERROR =
  INSUFFICIENT_REMAINING_FEE_TOKEN_ERROR;

/** Keep provider diagnostics out of the confirmation UI when recovery is known. */
export function getFeePaymentProviderErrorMessage(
  method: string,
  providerMessage: string,
): string {
  if (
    method === "eth_estimateUserOperationGas" &&
    PAYMASTER_TOKEN_COLLECTION_FAILURE.test(providerMessage)
  ) {
    return INSUFFICIENT_REMAINING_FEE_TOKEN_ERROR;
  }
  return providerMessage;
}
