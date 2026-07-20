/** Persisted marker codec and recovery-state inspection for fresh onboarding. */

import { getAccounts } from "../accountStorage";
import { clearAllAuthState } from "../sessionCache";
import {
  getWalletLocalStorageKeysToRemove,
  WALLET_SYNC_STORAGE_KEYS,
} from "../walletResetStorage";
import { withStorageLock } from "../storageLock";
import { deletePrivacyOperationsDatabase } from "../privacy/operations/repository";

export const ONBOARDING_INITIALIZATION_KEY = "onboardingInitialization";
export const ONBOARDING_LOCK_KEY = `local:${ONBOARDING_INITIALIZATION_KEY}`;
export const ACTIVE_INITIALIZATION_TTL_MS = 15 * 60 * 1000;

const AUTHORITATIVE_WALLET_LOCAL_STORAGE_KEYS = [
  "encryptedApiKey",
  "encryptedApiKeyVault",
  "encryptedVaultKeyMaster",
  "encryptedVaultKeyAgent",
  "agentPasswordEnabled",
  "passkeyUnlock",
  "pkVault",
  "mnemonicVault",
  "privacyVault",
  "accounts",
  "seedGroups",
] as const;

const ONBOARDING_IDENTITY_SYNC_KEYS = [
  "address",
  "displayAddress",
  "activeAccountId",
  "tabAccounts",
] as const;

export interface OnboardingInitializationMarker {
  version: 1;
  id: string;
  startedAt: number;
}

export function parseOnboardingInitializationMarker(
  value: unknown,
): OnboardingInitializationMarker | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<OnboardingInitializationMarker>;
  if (
    candidate.version !== 1 ||
    typeof candidate.id !== "string" ||
    candidate.id.length === 0 ||
    candidate.id.length > 128 ||
    typeof candidate.startedAt !== "number" ||
    !Number.isFinite(candidate.startedAt)
  ) {
    return null;
  }
  return candidate as OnboardingInitializationMarker;
}

/**
 * Identify storage that may be a user's only wallet identity or recovery
 * material. Malformed non-empty records fail closed instead of being erased.
 */
export function hasAuthoritativeWalletData(
  items: Record<string, unknown>,
): boolean {
  return AUTHORITATIVE_WALLET_LOCAL_STORAGE_KEYS.some((key) => {
    const value = items[key];
    if (value === undefined || value === null || value === false) return false;
    if (key === "accounts" || key === "seedGroups") {
      return !Array.isArray(value) || value.length > 0;
    }
    return true;
  });
}

/** Clear setup residue while preserving unrelated user preferences. */
export async function clearNonAuthoritativeWalletResidue(
  existingLocal: Record<string, unknown>,
): Promise<void> {
  await clearAllAuthState();
  const localKeys = getWalletLocalStorageKeysToRemove(existingLocal).filter(
    (key) => key !== ONBOARDING_INITIALIZATION_KEY,
  );
  await Promise.all([
    chrome.storage.local.remove(localKeys),
    chrome.storage.sync.remove([...ONBOARDING_IDENTITY_SYNC_KEYS]),
    deletePrivacyOperationsDatabase(),
  ]);
}

/** Structural completeness is the durable onboarding commit point. */
export async function hasStructurallyCompleteWallet(): Promise<boolean> {
  const [accounts, stored] = await Promise.all([
    getAccounts(),
    chrome.storage.local.get([
      "encryptedApiKey",
      "encryptedApiKeyVault",
      "encryptedVaultKeyMaster",
      "pkVault",
      "mnemonicVault",
      "seedGroups",
    ]),
  ]);
  if (accounts.length === 0) return false;
  if (!stored.encryptedVaultKeyMaster && !stored.encryptedApiKey) return false;

  const stringIds = (value: unknown): Set<string> =>
    new Set(
      Array.isArray(value)
        ? value
            .map((entry: any) => entry?.id)
            .filter((id: unknown): id is string => typeof id === "string")
        : [],
    );
  const pkIds = stringIds(stored.pkVault?.entries);
  const mnemonicIds = stringIds(stored.mnemonicVault?.entries);
  const seedGroupIds = stringIds(stored.seedGroups);

  for (const account of accounts) {
    if (
      (account.type === "privateKey" || account.type === "seedPhrase") &&
      !pkIds.has(account.id)
    ) {
      return false;
    }
    if (
      account.type === "seedPhrase" &&
      (!seedGroupIds.has(account.seedGroupId) ||
        !mnemonicIds.has(account.seedGroupId))
    ) {
      return false;
    }
    if (
      account.type === "bankr" &&
      !stored.encryptedApiKeyVault &&
      !stored.encryptedApiKey
    ) {
      return false;
    }
  }
  return true;
}

export async function isOnboardingInitializationOwner(
  initializationId: string,
): Promise<boolean> {
  if (!initializationId) return false;
  return withStorageLock(ONBOARDING_LOCK_KEY, async () => {
    const stored = await chrome.storage.local.get(ONBOARDING_INITIALIZATION_KEY);
    return (
      parseOnboardingInitializationMarker(
        stored[ONBOARDING_INITIALIZATION_KEY],
      )?.id === initializationId
    );
  });
}

export async function rollbackMarkedInitialization(
  expectedId?: string,
): Promise<boolean> {
  return withStorageLock(ONBOARDING_LOCK_KEY, async () => {
    const allLocal = await chrome.storage.local.get(null);
    const marker = parseOnboardingInitializationMarker(
      allLocal[ONBOARDING_INITIALIZATION_KEY],
    );
    if (!marker || (expectedId && marker.id !== expectedId)) return false;

    // Marker cleanup is only housekeeping after the structural commit point.
    if (await hasStructurallyCompleteWallet()) {
      await chrome.storage.local
        .remove(ONBOARDING_INITIALIZATION_KEY)
        .catch(() => undefined);
      return false;
    }

    await clearAllAuthState();
    await Promise.all([
      chrome.storage.local.remove(getWalletLocalStorageKeysToRemove(allLocal)),
      chrome.storage.sync.remove([...WALLET_SYNC_STORAGE_KEYS]),
      deletePrivacyOperationsDatabase(),
    ]);
    return true;
  });
}
