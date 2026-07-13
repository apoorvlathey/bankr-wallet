/**
 * Frozen password-encrypted records matching WalletChan's released legacy
 * `pkVault` and V1 `mnemonicVault` formats. Values are synthetic test secrets,
 * generated once with PBKDF2-SHA256 (600k) and fixed fixture salt/IV bytes.
 */
export const FROZEN_LEGACY_SECRET_FIXTURE = {
  password: "legacy-master-password",
  privateKey:
    "0x1111111111111111111111111111111111111111111111111111111111111111" as const,
  mnemonic: "test test test test test test test test test test test junk",
  accountId: "legacy-private-account",
  seedGroupId: "legacy-seed-group",
  pkVault: {
    version: 1,
    entries: [
      {
        id: "legacy-private-account",
        keystore: {
          ciphertext:
            "FRmRFMTsOGq61kON4B8QyaOoJHYYLZ9gXhatFnuVO8FJk+M2bNg5nq918mGRoUuk//qSMU8919xsFsWewM2flzGsI338Q/eMnBFna9TnswF6xQ==",
          iv: "cnJycnJycnJycnJy",
          salt: "cXFxcXFxcXFxcXFxcXFxcQ==",
        },
      },
    ],
  },
  mnemonicVault: {
    version: 1,
    entries: [
      {
        id: "legacy-seed-group",
        keystore: {
          ciphertext:
            "zIyeiJp9FKYYZboDsDLsxCbWe6odubWyQuCXtNSsal4kWNJ3qrhVhbGe7n2kB1+hvudOD0AG3PPeEAeVEFJa8ny8Xpj3IPKOt+6Y",
          iv: "dHR0dHR0dHR0dHR0",
          salt: "c3Nzc3Nzc3Nzc3Nzc3Nzcw==",
        },
      },
    ],
  },
} as const;

