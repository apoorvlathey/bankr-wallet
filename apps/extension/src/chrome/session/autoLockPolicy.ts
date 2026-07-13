/**
 * Auto-lock setting normalization and storage cache.
 *
 * This module deliberately owns no credentials and performs no session-secret
 * side effects. The `sessionCache.ts` facade applies transitions such as
 * clearing a persisted Never session after this module reports 0 -> timed.
 */

import { DEFAULT_AUTO_LOCK_TIMEOUT_MS } from "@/constants/securityPolicy";

export const DEFAULT_AUTO_LOCK_TIMEOUT = DEFAULT_AUTO_LOCK_TIMEOUT_MS;
export const AUTO_LOCK_STORAGE_KEY = "autoLockTimeout";

export const VALID_AUTO_LOCK_TIMEOUTS = new Set([
  60_000,
  300_000,
  900_000,
  1_800_000,
  3_600_000,
  14_400_000,
  0,
]);

let cachedAutoLockTimeout: number | null = null;

export function normalizeAutoLockTimeout(value: unknown): number {
  return typeof value === "number" && VALID_AUTO_LOCK_TIMEOUTS.has(value)
    ? value
    : DEFAULT_AUTO_LOCK_TIMEOUT;
}

export function isValidAutoLockTimeout(value: unknown): value is number {
  return typeof value === "number" && VALID_AUTO_LOCK_TIMEOUTS.has(value);
}

export function getEffectiveCachedAutoLockTimeout(): number {
  return cachedAutoLockTimeout ?? DEFAULT_AUTO_LOCK_TIMEOUT;
}

export function setCachedAutoLockTimeout(timeout: number): void {
  cachedAutoLockTimeout = timeout;
}

export function updateCachedAutoLockTimeout(
  newValue: number | undefined,
): void {
  cachedAutoLockTimeout = normalizeAutoLockTimeout(newValue);
}

export async function readRawStoredAutoLockTimeout(): Promise<unknown> {
  const result = await chrome.storage.sync.get(AUTO_LOCK_STORAGE_KEY);
  return result[AUTO_LOCK_STORAGE_KEY];
}

export async function readStoredAutoLockTimeout(): Promise<number> {
  return normalizeAutoLockTimeout(await readRawStoredAutoLockTimeout());
}

export async function getAutoLockTimeout(): Promise<number> {
  if (cachedAutoLockTimeout !== null) return cachedAutoLockTimeout;
  const timeout = await readStoredAutoLockTimeout();
  cachedAutoLockTimeout = timeout;
  return timeout;
}

export async function writeAutoLockTimeout(timeout: number): Promise<void> {
  await chrome.storage.sync.set({ [AUTO_LOCK_STORAGE_KEY]: timeout });
  cachedAutoLockTimeout = timeout;
}
