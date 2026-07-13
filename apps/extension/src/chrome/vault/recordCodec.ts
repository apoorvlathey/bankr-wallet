/** Bounded decoder for the released private-key vault V1 record. */

import { decodeBase64Bounded, decodeBase64Exact } from "../cryptography/base64";
import { IV_LENGTH, SALT_LENGTH } from "../cryptography/passwordKey";
import type { Vault } from "../types";

export const RELEASED_VAULT_VERSION = 1;
export const MAX_VAULT_ENTRIES = 10_000;
export const MAX_VAULT_ENTRY_ID_LENGTH = 512;

const AES_GCM_TAG_BYTES = 16;
const MAX_PRIVATE_KEY_CIPHERTEXT_BYTES = 256;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isReleasedKeystore(value: unknown): boolean {
  if (!isRecord(value)) return false;
  const saltIsReleasedShape =
    value.salt === "" || decodeBase64Exact(value.salt, SALT_LENGTH) !== null;
  return (
    saltIsReleasedShape &&
    decodeBase64Exact(value.iv, IV_LENGTH) !== null &&
    decodeBase64Bounded(
      value.ciphertext,
      AES_GCM_TAG_BYTES,
      MAX_PRIVATE_KEY_CIPHERTEXT_BYTES,
    ) !== null
  );
}

export function assertVaultEntryId(value: unknown): asserts value is string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > MAX_VAULT_ENTRY_ID_LENGTH
  ) {
    throw new Error("Private-key vault account ID is invalid");
  }
}

function isReleasedEntry(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    value.id.length > 0 &&
    value.id.length <= MAX_VAULT_ENTRY_ID_LENGTH &&
    isReleasedKeystore(value.keystore)
  );
}

/**
 * Decode only the released V1 shape without rewriting or cloning it.
 *
 * Duplicate IDs remain readable for recovery compatibility with historical
 * read/modify/write races. Call `assertVaultSafeForMutation` before any write
 * or migration preparation so ambiguous records can never be rewritten.
 */
export function parseReleasedVaultV1(value: unknown): Vault | null {
  if (value == null) return null;
  if (
    !isRecord(value) ||
    value.version !== RELEASED_VAULT_VERSION ||
    !Array.isArray(value.entries) ||
    value.entries.length > MAX_VAULT_ENTRIES ||
    !value.entries.every(isReleasedEntry)
  ) {
    throw new Error("Private-key vault has an unsupported or corrupt format");
  }
  return value as unknown as Vault;
}

/** Mutation/migration gate: structurally valid V1 plus unique bounded IDs. */
export function assertVaultSafeForMutation(
  value: unknown,
): asserts value is Vault {
  const vault = parseReleasedVaultV1(value);
  if (!vault) throw new Error("Private-key vault is missing");

  const ids = new Set<string>();
  for (const entry of vault.entries) {
    if (ids.has(entry.id)) {
      throw new Error("Private-key vault contains duplicate account IDs");
    }
    ids.add(entry.id);
  }
}
