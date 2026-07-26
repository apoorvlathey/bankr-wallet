export function crossDappFeePaymentArgs(
  message: Record<string, unknown>,
): ["native" | "token", string | undefined] {
  const value = message.feePaymentToken;
  if (value !== undefined && value !== "native" && value !== "token") {
    throw new Error("Invalid gas-payment token");
  }
  return [
    value === "token" ? "token" : "native",
    typeof message.feePaymentQuoteId === "string"
      ? message.feePaymentQuoteId
      : undefined,
  ];
}
