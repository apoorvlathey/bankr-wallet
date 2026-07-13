# Cryptography audit domain

The stable `../crypto.ts` and `../cryptoUtils.ts` paths are compatibility
facades. Review the implementation inward in this order:

1. `types.ts` freezes the released `{ ciphertext, iv, salt }` record.
2. `base64.ts` bounds persisted binary decoding before allocation.
3. `passwordKey.ts` freezes PBKDF2-SHA-256, 600,000 iterations, and AES-256.
4. `passwordCipher.ts` owns legacy password-derived AES-GCM records.
5. `vaultKey.ts` owns 32-byte vault-key wrapping and direct AES-GCM records.
6. `credentialStorage.ts` owns vault-first, legacy-second Bankr credential
   lookup and format-presence checks.

No format, storage key, fallback order, or error contract may change without a
released-storage migration and backward-compatibility tests.
