/** Seed-derived account metadata. Mnemonic material is owned elsewhere. */

import type { SeedPhraseAccount } from "../types";
import { withStorageLock } from "../storageLock";
import {
  ACCOUNTS_LOCK_KEY,
  getAccounts,
  normalizeEvmAccountAddress,
  saveAccounts,
} from "./repository";
import { assertAccountStorageAuthorized } from "./authorization";
import { setActiveAccountId } from "./selectionStorage";

function assertSeedMetadata(seedGroupId: string, derivationIndex: number): void {
  if (
    typeof seedGroupId !== "string" ||
    seedGroupId.length === 0 ||
    seedGroupId.length > 128 ||
    !Number.isSafeInteger(derivationIndex) ||
    derivationIndex < 0
  ) {
    throw new Error("Invalid seed account metadata");
  }
}

export async function addSeedPhraseAccount(
  address: string,
  seedGroupId: string,
  derivationIndex: number,
  displayName?: string,
  accountId = crypto.randomUUID(),
  expectedAuthEpoch?: string,
): Promise<SeedPhraseAccount> {
  const newAccount = await withStorageLock(ACCOUNTS_LOCK_KEY, async () => {
    const accounts = await getAccounts();
    assertAccountStorageAuthorized(expectedAuthEpoch);
    const normalizedAddress = normalizeEvmAccountAddress(address);
    assertSeedMetadata(seedGroupId, derivationIndex);
    if (
      accounts.some(
        (account) =>
          account.type !== "impersonator" &&
          account.address.toLowerCase() === normalizedAddress,
      )
    ) {
      throw new Error("An account with this address already exists");
    }
    const account: SeedPhraseAccount = {
      id: accountId,
      type: "seedPhrase",
      address: normalizedAddress,
      seedGroupId,
      derivationIndex,
      displayName,
      createdAt: Date.now(),
    };
    accounts.push(account);
    assertAccountStorageAuthorized(expectedAuthEpoch);
    await saveAccounts(accounts);
    return account;
  });
  await setActiveAccountId(newAccount.id, expectedAuthEpoch).catch((error) => {
    console.warn("[accountStorage] Failed to select newly added account:", error);
  });
  return newAccount;
}

/** Convert metadata in place; the caller coordinates any vault-entry change. */
export async function convertToSeedPhraseAccount(
  accountId: string,
  seedGroupId: string,
  derivationIndex: number,
  expectedAuthEpoch?: string,
): Promise<SeedPhraseAccount | null> {
  const converted = await withStorageLock(ACCOUNTS_LOCK_KEY, async () => {
    const accounts = await getAccounts();
    assertAccountStorageAuthorized(expectedAuthEpoch);
    const index = accounts.findIndex((account) => account.id === accountId);
    if (index === -1) return null;

    const existing = accounts[index];
    const account: SeedPhraseAccount = {
      id: existing.id,
      type: "seedPhrase",
      address: existing.address,
      displayName: existing.displayName,
      createdAt: existing.createdAt,
      seedGroupId,
      derivationIndex,
    };
    accounts[index] = account;
    assertAccountStorageAuthorized(expectedAuthEpoch);
    await saveAccounts(accounts);
    return account;
  });
  if (!converted) return null;
  await setActiveAccountId(converted.id, expectedAuthEpoch).catch((error) => {
    console.warn("[accountStorage] Failed to select converted account:", error);
  });
  return converted;
}
