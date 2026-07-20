import { PASSKEY_SESSION_CREDENTIAL_VERSION } from "./passkeyCredentialTypes";

function hasExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
): boolean {
  const keys = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return keys.length === sortedExpected.length &&
    keys.every((key, index) => key === sortedExpected[index]);
}

export function getPasskeyCredentialVersion(
  candidate: Record<string, unknown>,
): 1 | 2 | null {
  if (
    candidate.version === 1 &&
    hasExactKeys(candidate, ["version", "data", "iv", "passkeyBinding"])
  ) return 1;
  if (
    candidate.version === PASSKEY_SESSION_CREDENTIAL_VERSION &&
    hasExactKeys(candidate, [
      "version", "data", "iv", "passkeyBinding", "startedAt",
      "autoLockTimeout", "expiresAt",
    ])
  ) return 2;
  return null;
}
