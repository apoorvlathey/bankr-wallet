export interface CachedMnemonicKey {
  key: CryptoKey;
  keyId: string;
}

export interface CachedPrivacyKey {
  key: CryptoKey;
  keyBytes: Uint8Array;
  keyId: string;
}
