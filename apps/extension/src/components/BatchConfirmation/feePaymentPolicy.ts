import type { FeePaymentRequestKind } from "@/components/FeePaymentSelector";

export function allowsBatchFeePaymentSelection(input: {
  customConfirmation: boolean;
  requestKind: FeePaymentRequestKind;
  privacyRagequit: boolean;
}): boolean {
  return (
    !input.privacyRagequit &&
    (!input.customConfirmation || input.requestKind === "crossDapp")
  );
}
