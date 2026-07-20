import type { PasswordType } from "../types";

const RESTORED_PASSKEY_SESSION = Symbol("restored-passkey-session");

export interface RestoredPasskeySessionCredential {
  readonly [RESTORED_PASSKEY_SESSION]: true;
  readonly vaultKeyBytes: Uint8Array;
  readonly passkeyBinding: string;
}

export function isRestoredPasskeySessionCredential(
  value: unknown,
): value is RestoredPasskeySessionCredential {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as RestoredPasskeySessionCredential)[RESTORED_PASSKEY_SESSION] === true
  );
}

export function createRestoredPasskeySessionCredential(
  vaultKeyBytes: Uint8Array,
  passkeyBinding: string,
): RestoredPasskeySessionCredential {
  const credential = {} as RestoredPasskeySessionCredential;
  Object.defineProperties(credential, {
    [RESTORED_PASSKEY_SESSION]: { value: true },
    vaultKeyBytes: { value: vaultKeyBytes },
    passkeyBinding: { value: passkeyBinding },
  });
  return Object.freeze(credential);
}

export type UnlockFn = (
  credential: string | RestoredPasskeySessionCredential,
) => Promise<{ success: boolean; passwordType?: PasswordType }>;
