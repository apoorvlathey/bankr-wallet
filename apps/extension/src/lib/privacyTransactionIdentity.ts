import type { CompletedTransaction } from "@/chrome/txHistoryStorage";

export type PrivacyTransactionKind =
  | "shield"
  | "recovery"
  | "publicExit"
  | "unshield";

export interface PrivacyTransactionIdentity {
  kind: PrivacyTransactionKind;
  label: "Shield ETH" | "Shield Recovery" | "Public Exit" | "Unshield ETH";
}

/** Shared Activity/detail identity for WalletChan-owned privacy transactions. */
export function getPrivacyTransactionIdentity(
  tx: Pick<
    CompletedTransaction,
    | "origin"
    | "privacyShieldMeta"
    | "privacyRagequitMeta"
    | "privacyUnshieldMeta"
  >,
): PrivacyTransactionIdentity | null {
  if (tx.privacyShieldMeta) {
    return { kind: "shield", label: "Shield ETH" };
  }

  const origin = tx.origin.trim().toLowerCase();
  if (origin === "walletchan shield") {
    return { kind: "shield", label: "Shield ETH" };
  }
  if (origin === "walletchan shield recovery") {
    return { kind: "recovery", label: "Shield Recovery" };
  }
  if (
    tx.privacyRagequitMeta?.version === 1 ||
    origin === "walletchan public exit"
  ) {
    return { kind: "publicExit", label: "Public Exit" };
  }
  if (
    tx.privacyUnshieldMeta?.version === 1 ||
    origin === "walletchan receiver-paid unshield"
  ) {
    return { kind: "unshield", label: "Unshield ETH" };
  }

  return null;
}
