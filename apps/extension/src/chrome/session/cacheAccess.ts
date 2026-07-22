/** Expiry-aware selectors over one in-memory authorization generation. */

import type { DecryptedEntry, PasswordType } from "../types";
import { getEffectiveCachedAutoLockTimeout } from "./autoLockPolicy";
import * as memoryCache from "./inMemoryCache";
import type { CachedMnemonicKey, CachedPrivacyKey } from "./inMemoryCache";

function effectiveTimeout(): number {
  return getEffectiveCachedAutoLockTimeout();
}

export function getCachedApiKey(): string | null {
  return memoryCache.getCachedApiKey(effectiveTimeout());
}

export function getCachedPassword(): string | null {
  return memoryCache.getCachedPassword(effectiveTimeout());
}

export function getCachedVault(): DecryptedEntry[] | null {
  return memoryCache.getCachedVault(effectiveTimeout());
}

export function getCachedVaultKey(): CryptoKey | null {
  return memoryCache.getCachedVaultKey(effectiveTimeout());
}

export function getCachedMnemonicKey(): CachedMnemonicKey | null {
  return memoryCache.getCachedMnemonicKey(effectiveTimeout());
}

export function getCachedPrivacyKey(): CachedPrivacyKey | null {
  return memoryCache.getCachedPrivacyKey(effectiveTimeout());
}

export function getPasswordType(): PasswordType | null {
  return memoryCache.getPasswordType(effectiveTimeout());
}

export function getPrivateKeyFromCache(
  accountId: string,
): `0x${string}` | null {
  const vault = getCachedVault();
  if (!vault) return null;
  return vault.find((entry) => entry.id === accountId)?.privateKey || null;
}

export function isApiKeyCached(): boolean {
  return getCachedApiKey() !== null;
}

export function isWalletUnlocked(): boolean {
  if (getCachedApiKey() !== null || getCachedVault() !== null) return true;

  // A view-only-only wallet has neither a Bankr credential nor local signing
  // keys. Its coherent capability generation is the general vault key paired
  // with the password type that established its authority. Both selectors
  // share one expiry timestamp and clear the whole generation on expiry.
  return getCachedVaultKey() !== null && getPasswordType() !== null;
}
