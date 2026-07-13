/**
 * Compatibility facade for encrypted mnemonic storage.
 *
 * Keep existing imports stable while record validation, cryptography,
 * persistence, and coordination remain independently auditable modules.
 */

export type {
  LegacyMnemonicVaultEntry,
  MnemonicKeyVaultEntry,
  LegacyMnemonicVault,
  MnemonicKeyVault,
  StoredMnemonicVault,
  MnemonicReadAccess,
  MnemonicWriteAccess,
} from "./mnemonic/record";

export {
  loadMnemonicVault,
  withMnemonicVaultLock,
} from "./mnemonic/repository";

export {
  getMnemonic,
  removeMnemonic,
  storeMnemonic,
} from "./mnemonic/operations";

export {
  computeReEncryptedMnemonicVault,
  decryptMnemonicKeyVaultEntries,
  hasLegacyMnemonicEntries,
  hasMnemonicKeyVault,
  hasMnemonics,
  prepareMnemonicKeyVault,
  reEncryptMnemonicVault,
  unlockMnemonicKeyWithPassword,
  verifyMnemonicKeyForVault,
} from "./mnemonic/recovery";
