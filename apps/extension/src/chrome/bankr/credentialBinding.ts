import type { EncryptedData } from "../crypto";

const MAX_CIPHERTEXT_CHARS = 1_400_000;
const MAX_IV_CHARS = 64;
const MAX_SALT_CHARS = 128;
const BASE64_RE = /^[A-Za-z0-9+/]*={0,2}$/;

type CredentialScheme = "vault" | "legacy";

function boundedBase64(
  value: unknown,
  minLength: number,
  maxLength: number,
): value is string {
  return (
    typeof value === "string" &&
    value.length >= minLength &&
    value.length <= maxLength &&
    value.length % 4 === 0 &&
    BASE64_RE.test(value)
  );
}

function validEncryptedCredential(
  value: unknown,
  scheme: CredentialScheme,
): value is EncryptedData {
  if (!value || typeof value !== "object") return false;
  const encrypted = value as Partial<EncryptedData>;
  if (
    !boundedBase64(encrypted.ciphertext, 24, MAX_CIPHERTEXT_CHARS) ||
    !boundedBase64(encrypted.iv, 16, MAX_IV_CHARS)
  ) {
    return false;
  }
  if (scheme === "vault") return encrypted.salt === "";
  return boundedBase64(encrypted.salt, 16, MAX_SALT_CHARS);
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

/**
 * Return a non-secret generation tag for the currently persisted Bankr
 * credential. The tag is derived from authenticated ciphertext metadata, not
 * the plaintext API key, so it cannot be used as an offline API-key verifier.
 * AES-GCM uses a fresh IV for every update, which also means A -> B -> A still
 * creates a distinct generation and invalidates prompts created before it.
 */
export async function getCurrentBankrCredentialTag(): Promise<string | null> {
  const { encryptedApiKeyVault, encryptedApiKey } =
    await chrome.storage.local.get([
      "encryptedApiKeyVault",
      "encryptedApiKey",
    ]);

  // A present vault-form value is authoritative. Never fall back to a stale
  // legacy ciphertext when the newer record exists but is malformed.
  if (encryptedApiKeyVault !== undefined && encryptedApiKeyVault !== null) {
    if (!validEncryptedCredential(encryptedApiKeyVault, "vault")) return null;
    return sha256Hex(
      `walletchan-bankr-credential:vault:${encryptedApiKeyVault.iv}:${encryptedApiKeyVault.ciphertext}`,
    );
  }

  if (!validEncryptedCredential(encryptedApiKey, "legacy")) return null;
  return sha256Hex(
    `walletchan-bankr-credential:legacy:${encryptedApiKey.salt}:${encryptedApiKey.iv}:${encryptedApiKey.ciphertext}`,
  );
}

export async function bindPendingBankrCredential<
  T extends {
    accountType?: string;
    bankrCredentialTag?: string;
  },
>(request: T): Promise<T> {
  if (request.accountType !== "bankr") return request;
  const bankrCredentialTag = await getCurrentBankrCredentialTag();
  if (!bankrCredentialTag) {
    throw new Error("Bankr credential is unavailable. Unlock and try again.");
  }
  // Binding can happen at intake and again at the storage boundary. Preserve
  // an already-bound request only when it still names the current generation;
  // never silently retarget an authorized prompt to a newer credential.
  if (
    request.bankrCredentialTag !== undefined &&
    request.bankrCredentialTag !== bankrCredentialTag
  ) {
    throw new Error(
      "The Bankr credential changed. Review a new request before continuing.",
    );
  }
  return { ...request, bankrCredentialTag };
}

export async function validatePendingBankrCredential(
  pending: { accountType?: string; bankrCredentialTag?: string },
): Promise<boolean> {
  if (pending.accountType !== "bankr") return true;
  if (!/^[0-9a-f]{64}$/.test(pending.bankrCredentialTag ?? "")) return false;
  const current = await getCurrentBankrCredentialTag();
  return current !== null && current === pending.bankrCredentialTag;
}
