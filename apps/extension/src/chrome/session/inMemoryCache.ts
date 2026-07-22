/**
 * In-memory authentication capabilities owned by the background worker.
 *
 * This module has no storage, authentication, or transition dependencies. Its
 * callers must supply the already-normalized auto-lock timeout when reading a
 * capability. Expiry is fail-closed and clears every cached capability as one
 * unit so a key, password type, or password cannot outlive its peers.
 */

import type { DecryptedEntry, PasswordType } from "../types";
import {
  clearAuthSessionHardExpiry,
  decrementUiConnectionLease,
  isCacheEntryValid,
  setAuthSessionHardExpiry,
} from "./inMemoryExpiry";
import type { CachedMnemonicKey, CachedPrivacyKey } from "./inMemoryTypes";
export type { CachedMnemonicKey, CachedPrivacyKey } from "./inMemoryTypes";
export { hasActiveUIConnections, incrementUIConnections, setAuthSessionHardExpiry } from "./inMemoryExpiry";
let cachedApiKey: string | null = null;
let cachedPassword: string | null = null;
let cacheTimestamp = 0;
let cachedVault: DecryptedEntry[] | null = null;
let vaultCacheTimestamp = 0;
let cachedPasswordType: PasswordType | null = null;
let cachedVaultKey: CryptoKey | null = null;
let cachedMnemonicKey: CachedMnemonicKey | null = null;
let cachedPrivacyKey: CachedPrivacyKey | null = null;
let authCacheTimestamp = 0;

let currentSessionId: string | null = null;

export function clearInMemoryAuthCache(): void {
  cachedPrivacyKey?.keyBytes.fill(0);
  cachedApiKey = null;
  cachedPassword = null;
  cachedVault = null;
  cachedPasswordType = null;
  cachedVaultKey = null;
  cachedMnemonicKey = null;
  cachedPrivacyKey = null;
  cacheTimestamp = 0;
  vaultCacheTimestamp = 0;
  authCacheTimestamp = 0;
  clearAuthSessionHardExpiry();
  currentSessionId = null;
}

export function getCachedApiKey(timeout: number): string | null {
  if (cachedApiKey && isCacheEntryValid(cacheTimestamp, timeout)) {
    return cachedApiKey;
  }
  if (cachedApiKey) clearInMemoryAuthCache();
  return null;
}

export function getCachedPassword(timeout: number): string | null {
  if (cachedPassword && isCacheEntryValid(cacheTimestamp, timeout)) {
    return cachedPassword;
  }
  if (cachedPassword) clearInMemoryAuthCache();
  return null;
}

export function setCachedApiKey(apiKey: string, password?: string): void {
  cachedApiKey = apiKey;
  if (password) cachedPassword = password;
  cacheTimestamp = Date.now();
}

export function setCachedApiKeyDirect(apiKey: string): void {
  cachedApiKey = apiKey;
}

export function setCachedPasswordDirect(password: string | null): void {
  cachedPassword = password;
  cacheTimestamp = password ? Date.now() : 0;
}

export function getCachedVault(timeout: number): DecryptedEntry[] | null {
  if (cachedVault && isCacheEntryValid(vaultCacheTimestamp, timeout)) {
    return cachedVault;
  }
  if (cachedVault) clearInMemoryAuthCache();
  return null;
}

export function setCachedVault(vault: DecryptedEntry[]): void {
  cachedVault = vault;
  vaultCacheTimestamp = Date.now();
}

export function getCachedVaultKey(timeout: number): CryptoKey | null {
  if (cachedVaultKey && isCacheEntryValid(authCacheTimestamp, timeout)) {
    return cachedVaultKey;
  }
  if (cachedVaultKey) clearInMemoryAuthCache();
  return null;
}

export function setCachedVaultKey(key: CryptoKey | null): void {
  cachedVaultKey = key;
  authCacheTimestamp = key ? Date.now() : 0;
}

export function getCachedMnemonicKey(
  timeout: number,
): CachedMnemonicKey | null {
  if (cachedMnemonicKey && isCacheEntryValid(authCacheTimestamp, timeout)) {
    return cachedMnemonicKey;
  }
  if (cachedMnemonicKey) clearInMemoryAuthCache();
  return null;
}

export function setCachedMnemonicKey(value: CachedMnemonicKey | null): void {
  cachedMnemonicKey = value;
  if (value) authCacheTimestamp = Date.now();
}

export function getCachedPrivacyKey(
  timeout: number,
): CachedPrivacyKey | null {
  if (cachedPrivacyKey && isCacheEntryValid(authCacheTimestamp, timeout)) {
    return cachedPrivacyKey;
  }
  if (cachedPrivacyKey) clearInMemoryAuthCache();
  return null;
}

export function setCachedPrivacyKey(value: CachedPrivacyKey | null): void {
  const nextValue = value
    ? { ...value, keyBytes: new Uint8Array(value.keyBytes) }
    : null;
  cachedPrivacyKey?.keyBytes.fill(0);
  cachedPrivacyKey = nextValue;
  if (value) authCacheTimestamp = Date.now();
}

export function getPasswordType(timeout: number): PasswordType | null {
  if (cachedPasswordType && isCacheEntryValid(authCacheTimestamp, timeout)) {
    return cachedPasswordType;
  }
  if (cachedPasswordType) clearInMemoryAuthCache();
  return null;
}

export function setCachedPasswordType(type: PasswordType | null): void {
  cachedPasswordType = type;
  authCacheTimestamp = type ? Date.now() : 0;
}

export function getCurrentSessionId(): string | null {
  return currentSessionId;
}

export function setCurrentSessionId(
  id: string | null,
  hardExpiresAt?: number | null,
): void {
  currentSessionId = id;
  if (hardExpiresAt !== undefined) {
    setAuthSessionHardExpiry(hardExpiresAt);
  }
}

export function decrementUIConnections(): void {
  if (!decrementUiConnectionLease()) return;
  if (cachedApiKey) cacheTimestamp = Date.now();
  if (cachedVault) vaultCacheTimestamp = Date.now();
  if (
    cachedVaultKey ||
    cachedMnemonicKey ||
    cachedPrivacyKey ||
    cachedPasswordType
  ) {
    authCacheTimestamp = Date.now();
  }
}
