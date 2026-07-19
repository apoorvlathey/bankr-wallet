import type { PersistedPasskeySessionCredential } from "./passkeyPersistencePolicy";

export interface RestoredPasskeyTiming {
  startedAt: number;
  autoLockTimeout: number;
  expiresAt: number | null;
}

export function validateRestoredPasskeyTiming(
  session: Record<string, unknown>,
  credential: PersistedPasskeySessionCredential,
  timeout: number,
): { valid: boolean; timing: RestoredPasskeyTiming | null } {
  const expectedNeverMarker = timeout === 0;
  const hasAuthenticatedTiming = credential.startedAt !== null;
  const valid =
    session.autoLockNever === expectedNeverMarker &&
    credential.autoLockTimeout === timeout &&
    (hasAuthenticatedTiming || timeout === 0) &&
    (!hasAuthenticatedTiming || session.sessionStartedAt === credential.startedAt) &&
    (timeout === 0 ||
      (credential.expiresAt !== null && Date.now() < credential.expiresAt));
  return {
    valid,
    timing: valid && hasAuthenticatedTiming
      ? {
          startedAt: credential.startedAt!,
          autoLockTimeout: credential.autoLockTimeout,
          expiresAt: credential.expiresAt,
        }
      : null,
  };
}
