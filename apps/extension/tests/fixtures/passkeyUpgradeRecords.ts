import type {
  PasskeyUnlockRecordV1,
  PasskeyUnlockRecordV2,
} from "../../src/chrome/passkeyUnlockCrypto";

/**
 * Frozen serialized records from the released V1 raw-PRF wrapping format and
 * the current V2 purpose-separated HKDF format. These values are deliberately
 * not produced by the current writer during a test: a reader/writer regression
 * therefore cannot make both sides pass together.
 *
 * All bytes are synthetic test material. They are not wallet credentials.
 */
export const FROZEN_PASSKEY_FIXTURE = {
  prfKeyMaterial: "MzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzM",
  expectedVaultKeyBase64: "ERERERERERERERERERERERERERERERERERERERERERE=",
  expectedMnemonicKeyBase64:
    "IiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiI=",
  v1: {
    version: 1,
    rpId: "extension",
    credentialId:
      "MTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMQ",
    prfSalt: "MjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjI",
    wrappedVaultKey: {
      ciphertext:
        "IYDVg9sXnnqxk7WD54zbYAudAJtxzq5a9F/DYg/wE5aX5L8Z4hVy2O2qKnAQh0ro",
      iv: "RERERERERERERERE",
    },
    createdAt: 1_700_000_000_000,
  } satisfies PasskeyUnlockRecordV1,
  v2: {
    version: 2,
    rpId: "extension",
    credentialId:
      "MTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMQ",
    prfSalt: "MjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjI",
    wrappedVaultKey: {
      ciphertext:
        "WXri2StXrUN4kWtdUIralJr6BzxP2HlZgDvyo1tddfyLnnFUhKRT6+DApIcEYE8n",
      iv: "VVVVVVVVVVVVVVVV",
    },
    wrappedMnemonicKey: {
      ciphertext:
        "LmkGA/mTT9L2QE5cYu26sMhkB92Kc/algqBdBcbznnH/Mn5sgb+9GM4KCmzChHhP",
      iv: "ZmZmZmZmZmZmZmZm",
    },
    mnemonicKeyId: "frozen-mnemonic-key-v2",
    createdAt: 1_800_000_000_000,
  } satisfies PasskeyUnlockRecordV2,
} as const;

