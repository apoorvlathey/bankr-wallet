# Cryptography tests

These tests mirror `src/chrome/cryptography/` and freeze the released facade
identities, dependency direction, record codecs, KDF constants, ciphertext
bounds, and vault-key compatibility. Storage/session behavior remains covered
by the auth, passkey, mnemonic, and vault domains.
