import type { DecodedPasskeySessionCredential } from "./passkeyCredentialTypes";
import { isValidAutoLockTimeout } from "./timeoutValues";

export interface PasskeySessionTiming {
  autoLockTimeout: number;
  startedAt?: number;
  expiresAt?: number | null;
}

export interface PersistedPasskeySessionCredential {
  kind: "passkey-vault";
  vaultKeyBytes: Uint8Array;
  passkeyBinding: string;
  startedAt: number | null;
  autoLockTimeout: number;
  expiresAt: number | null;
}

export function passkeySessionAdditionalData(
  sessionId: string,
  record: Pick<
    DecodedPasskeySessionCredential,
    "version" | "passkeyBinding" | "startedAt" | "autoLockTimeout" | "expiresAt"
  >,
): Uint8Array {
  if (record.version === 1) {
    return new TextEncoder().encode(
      JSON.stringify([
        "walletchan/passkey-session/v1",
        sessionId,
        "master",
        record.passkeyBinding,
      ]),
    );
  }
  return new TextEncoder().encode(
    JSON.stringify([
      "walletchan/passkey-session/v2",
      sessionId,
      "master",
      record.passkeyBinding,
      record.startedAt,
      record.autoLockTimeout,
      record.expiresAt,
    ]),
  );
}

export function resolvePasskeySessionTiming(
  timing: PasskeySessionTiming,
): { startedAt: number; autoLockTimeout: number; expiresAt: number | null } | null {
  if (!isValidAutoLockTimeout(timing.autoLockTimeout)) return null;
  const startedAt = timing.startedAt ?? Date.now();
  const expiresAt = timing.expiresAt ??
    (timing.autoLockTimeout === 0 ? null : startedAt + timing.autoLockTimeout);
  if (
    !Number.isSafeInteger(startedAt) ||
    startedAt <= 0 ||
    (timing.autoLockTimeout === 0
      ? expiresAt !== null
      : !Number.isSafeInteger(expiresAt) ||
        expiresAt !== startedAt + timing.autoLockTimeout)
  ) return null;
  return { startedAt, autoLockTimeout: timing.autoLockTimeout, expiresAt };
}
