/** Shared pure allowlist for persisted and configured auto-lock durations. */

export const VALID_AUTO_LOCK_TIMEOUTS = new Set([
  60_000,
  300_000,
  900_000,
  1_800_000,
  3_600_000,
  14_400_000,
  0,
]);

export function isValidAutoLockTimeout(value: unknown): value is number {
  return typeof value === "number" && VALID_AUTO_LOCK_TIMEOUTS.has(value);
}
