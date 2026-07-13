/** Stable private-key vault compatibility facade. */

export {
  decryptPrivateKey,
  decryptPrivateKeyWithVaultKey,
  encryptPrivateKey,
  encryptPrivateKeyWithVaultKey,
  isVaultKeyEncrypted,
} from "./vault/entryCrypto";
export {
  addKeyToVault,
  computeReEncryptedVault,
  computeVaultKeyMigratedVault,
  decryptAllKeys,
  reEncryptVault,
  removeKeyFromVault,
} from "./vault/operations";
export {
  clearVault,
  hasVaultEntries,
  loadVault,
  saveVault,
  VAULT_STORAGE_KEY,
} from "./vault/repository";
