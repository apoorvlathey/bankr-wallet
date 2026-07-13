/** Security defaults for newly-created authentication material. */
export const MIN_NEW_PASSWORD_LENGTH = 12;
export const MAX_PASSWORD_LENGTH = 256;
export const MAX_EXISTING_PASSWORD_BYTES = 1024 * 1024;

const OBVIOUS_PASSWORDS = new Set([
  "password1234",
  "qwertyuiop12",
  "123456789012",
  "letmeinplease",
  "walletchan123",
]);

/**
 * Runtime boundary for password-derived crypto. This deliberately has no
 * minimum-length rule so every legacy password remains unlockable.
 */
export function isBoundedExistingPassword(value: unknown): value is string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > MAX_EXISTING_PASSWORD_BYTES
  ) {
    return false;
  }
  return new TextEncoder().encode(value).byteLength <= MAX_EXISTING_PASSWORD_BYTES;
}

/**
 * Existing wallets may still use older, shorter passwords and must remain
 * unlockable. This policy applies only when creating or replacing a password.
 */
export function newPasswordPolicyError(
  password: unknown,
  label = "Password",
): string | null {
  if (typeof password !== "string" || password.length === 0) {
    return `${label} is required`;
  }
  if (password.length < MIN_NEW_PASSWORD_LENGTH) {
    return `${label} must be at least ${MIN_NEW_PASSWORD_LENGTH} characters`;
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    return `${label} must be at most ${MAX_PASSWORD_LENGTH} characters`;
  }
  const normalized = password.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (
    new Set(password).size < 4 ||
    OBVIOUS_PASSWORDS.has(normalized)
  ) {
    return `${label} is too easy to guess`;
  }
  return null;
}

/** Missing settings use a finite default; an explicit stored `0` still means Never. */
export const DEFAULT_AUTO_LOCK_TIMEOUT_MS = 15 * 60 * 1000;
