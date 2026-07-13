/** Stable compatibility facade for credential and vault-key cryptography. */

export type { EncryptedData } from "./cryptography/types";
export { encrypt, decrypt } from "./cryptography/passwordCipher";
export {
  decryptWithVaultKey,
  encryptVaultKey,
  encryptWithVaultKey,
  generateVaultKey,
  importVaultKey,
  tryDecryptVaultKey,
} from "./cryptography/vaultKey";
export {
  hasEncryptedApiKey,
  hasVaultKeySystem,
  isAgentPasswordEnabled,
  loadDecryptedApiKey,
} from "./cryptography/credentialStorage";
