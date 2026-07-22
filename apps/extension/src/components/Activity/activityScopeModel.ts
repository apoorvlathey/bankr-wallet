import type { CompletedTransaction } from "@/chrome/txHistoryStorage";
import { getPrivacyTransactionIdentity } from "@/lib/privacyTransactionIdentity";

export type ActivityScope = "public" | "private";

/** Public follows the signer; Private follows the privacy-ledger projection. */
export function isTransactionVisibleInActivityScope(
  tx: CompletedTransaction,
  scope: ActivityScope,
): boolean {
  if (scope === "public") return true;
  const identity = getPrivacyTransactionIdentity(tx);
  return identity !== null && identity.kind !== "unshield";
}
