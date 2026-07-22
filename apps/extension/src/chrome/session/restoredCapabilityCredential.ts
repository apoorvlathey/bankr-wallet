import type { PasswordType } from "../types";
import type { SessionUnlockMethod } from "./capabilityPersistence";

const RESTORED_SESSION_CAPABILITY = Symbol("restored-session-capability");

export interface RestoredSessionCapabilityCredential {
  readonly [RESTORED_SESSION_CAPABILITY]: true;
  readonly vaultKeyBytes: Uint8Array;
  readonly privacyKeyBytes: Uint8Array | null;
  readonly privacyKeyId: string | null;
  readonly unlockMethod: SessionUnlockMethod;
  readonly passwordType: PasswordType;
  readonly factorBinding: string;
}

export function isRestoredSessionCapabilityCredential(
  value: unknown,
): value is RestoredSessionCapabilityCredential {
  return typeof value === "object" && value !== null &&
    (value as RestoredSessionCapabilityCredential)[RESTORED_SESSION_CAPABILITY] === true;
}

export function createRestoredSessionCapabilityCredential(
  value: Omit<
    RestoredSessionCapabilityCredential,
    typeof RESTORED_SESSION_CAPABILITY
  >,
): RestoredSessionCapabilityCredential {
  const credential = {} as RestoredSessionCapabilityCredential;
  Object.defineProperties(credential, {
    [RESTORED_SESSION_CAPABILITY]: { value: true },
    vaultKeyBytes: { value: value.vaultKeyBytes },
    privacyKeyBytes: { value: value.privacyKeyBytes },
    privacyKeyId: { value: value.privacyKeyId },
    unlockMethod: { value: value.unlockMethod },
    passwordType: { value: value.passwordType },
    factorBinding: { value: value.factorBinding },
  });
  return Object.freeze(credential);
}
