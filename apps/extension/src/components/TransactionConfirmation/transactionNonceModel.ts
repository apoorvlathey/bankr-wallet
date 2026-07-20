import type { TransactionAccountType } from "./types";

export function supportsEditableTransactionNonce(
  accountType: TransactionAccountType | undefined,
): boolean {
  return (
    accountType === "privateKey" ||
    accountType === "seedPhrase" ||
    accountType === "ledger"
  );
}
