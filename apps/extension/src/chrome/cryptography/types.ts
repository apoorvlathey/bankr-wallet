/** Released AES-GCM storage envelope shared by wallet credential records. */
export interface EncryptedData {
  ciphertext: string;
  iv: string;
  salt: string;
}
