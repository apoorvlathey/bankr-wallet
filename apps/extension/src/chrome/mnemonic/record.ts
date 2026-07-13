import type { EncryptedData } from "../crypto";

export interface LegacyEncryptedMnemonic {
  ciphertext: string;
  iv: string;
  salt: string;
}

export interface MnemonicKeyEncryptedMnemonic {
  version: 2;
  scheme: "mnemonic-key";
  ciphertext: string;
  iv: string;
}

export interface MnemonicKeyCheck {
  version: 2;
  scheme: "mnemonic-key-check";
  ciphertext: string;
  iv: string;
}

export interface LegacyMnemonicVaultEntry {
  id: string;
  keystore: LegacyEncryptedMnemonic;
}

export interface MnemonicKeyVaultEntry {
  id: string;
  keystore: MnemonicKeyEncryptedMnemonic;
}

export interface LegacyMnemonicVault {
  version: 1;
  entries: LegacyMnemonicVaultEntry[];
}

export interface MnemonicKeyVault {
  version: 2;
  keyId: string;
  revision: number;
  masterWrappedKey: EncryptedData;
  // Optional only for compatibility with early V2 records. Current writers
  // always include this authenticated proof, including for empty vaults.
  keyCheck?: MnemonicKeyCheck;
  entries: MnemonicKeyVaultEntry[];
}

export type StoredMnemonicVault = LegacyMnemonicVault | MnemonicKeyVault;

export interface MnemonicReadAccess {
  password?: string | null;
  mnemonicKey?: { key: CryptoKey; keyId: string } | null;
  // Read-only compatibility for the short-lived shared-vault development
  // format. Exact master sessions migrate it only during biometric setup.
  legacyVaultKey?: CryptoKey | null;
}

export type MnemonicWriteAccess =
  | { kind: "password"; password: string }
  | { kind: "mnemonic-key"; key: CryptoKey; keyId: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isEncryptedData(value: unknown): value is EncryptedData {
  if (!isRecord(value)) return false;
  return (
    typeof value.ciphertext === "string" &&
    typeof value.iv === "string" &&
    typeof value.salt === "string"
  );
}

function isLegacyEntry(value: unknown): value is LegacyMnemonicVaultEntry {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    value.id.length > 0 &&
    isEncryptedData(value.keystore)
  );
}

function isMnemonicKeyEntry(value: unknown): value is MnemonicKeyVaultEntry {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    !isRecord(value.keystore)
  ) {
    return false;
  }
  return (
    value.id.length > 0 &&
    value.keystore.version === 2 &&
    value.keystore.scheme === "mnemonic-key" &&
    typeof value.keystore.ciphertext === "string" &&
    typeof value.keystore.iv === "string"
  );
}

function isMnemonicKeyCheck(value: unknown): value is MnemonicKeyCheck {
  return (
    isRecord(value) &&
    value.version === 2 &&
    value.scheme === "mnemonic-key-check" &&
    typeof value.ciphertext === "string" &&
    typeof value.iv === "string"
  );
}

export function parseMnemonicVault(value: unknown): StoredMnemonicVault | null {
  if (value == null) return null;
  if (!isRecord(value) || !Array.isArray(value.entries)) {
    throw new Error("Mnemonic vault is malformed");
  }

  if (value.version === 1 && value.entries.every(isLegacyEntry)) {
    return value as unknown as LegacyMnemonicVault;
  }

  if (
    value.version === 2 &&
    typeof value.keyId === "string" &&
    value.keyId.length > 0 &&
    Number.isInteger(value.revision) &&
    (value.revision as number) >= 0 &&
    isEncryptedData(value.masterWrappedKey) &&
    (value.keyCheck === undefined || isMnemonicKeyCheck(value.keyCheck)) &&
    value.entries.every(isMnemonicKeyEntry)
  ) {
    return value as unknown as MnemonicKeyVault;
  }

  throw new Error("Mnemonic vault has an unsupported or corrupt format");
}
