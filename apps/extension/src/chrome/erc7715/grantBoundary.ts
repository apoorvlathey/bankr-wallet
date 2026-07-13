import type { Account } from "../types";
import {
  WALLET_SECRET_OPERATION_LOCK_KEY,
  withStorageLock,
} from "../storageLock";

export interface PinnedErc7715GrantAccount {
  accountId: string;
  accountAddress: string;
  accountType: "privateKey" | "seedPhrase";
}

function accountMatchesPinnedGrant(
  account: Account | null,
  pinned: PinnedErc7715GrantAccount,
): boolean {
  return (
    !!account &&
    account.id === pinned.accountId &&
    account.type === pinned.accountType &&
    (account.type === "privateKey" || account.type === "seedPhrase") &&
    account.address.toLowerCase() === pinned.accountAddress.toLowerCase()
  );
}

/**
 * Linearize reusable-capability publication with account removal/conversion.
 * Signing happens before this boundary; the signed bytes are discarded unless
 * the exact local account identity still exists while the durable grant/result
 * commit owns the wallet-secret operation lock.
 */
export function commitErc7715GrantForPinnedAccount<T>({
  pinned,
  loadAccount,
  commit,
}: {
  pinned: PinnedErc7715GrantAccount;
  loadAccount: (accountId: string) => Promise<Account | null>;
  commit: () => Promise<T>;
}): Promise<T> {
  return withStorageLock(WALLET_SECRET_OPERATION_LOCK_KEY, async () => {
    const account = await loadAccount(pinned.accountId);
    if (!accountMatchesPinnedGrant(account, pinned)) {
      throw new Error("Pending permission request account is no longer valid");
    }
    return commit();
  });
}
