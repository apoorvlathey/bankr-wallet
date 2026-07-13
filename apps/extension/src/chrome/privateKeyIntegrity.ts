import type { Account, DecryptedEntry } from "./types";
import { deriveAddress } from "./localSigner";

export function privateKeyMatchesAccount(
  account: Account,
  privateKey: `0x${string}`,
): boolean {
  if (account.type !== "privateKey" && account.type !== "seedPhrase") {
    return false;
  }
  try {
    return (
      deriveAddress(privateKey).toLowerCase() === account.address.toLowerCase()
    );
  } catch {
    return false;
  }
}

/**
 * Only validated, user-visible local signing keys enter the in-memory cache.
 * Orphan ciphertext can remain after a fail-safe rollback/removal, but it is
 * never exposed as a signing capability. Historical/malformed ID-to-key
 * associations fail closed instead of broadcasting from the wrong address.
 */
export function retainValidLocalAccountKeys(
  entries: DecryptedEntry[],
  accounts: Account[],
): DecryptedEntry[] {
  const accountsById = new Map(accounts.map((account) => [account.id, account]));
  return entries.filter((entry) => {
    const account = accountsById.get(entry.id);
    const valid = !!account && privateKeyMatchesAccount(account, entry.privateKey);
    if (account && !valid) {
      console.error(
        `[privateKeyIntegrity] Refusing mismatched key for account ${account.id}`,
      );
    }
    return valid;
  });
}
