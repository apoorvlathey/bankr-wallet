import { assertCurrentMasterAuthorization } from "../masterAuthorization";
import {
  decryptMnemonicWithKey,
  decryptMnemonicWithPassword,
  decryptTransitionalSharedVaultEntry,
  encryptMnemonicWithKey,
  encryptMnemonicWithPassword,
} from "./crypto";
import type {
  LegacyMnemonicVault,
  MnemonicKeyVault,
  MnemonicReadAccess,
  MnemonicWriteAccess,
} from "./record";
import {
  loadMnemonicVault,
  saveMnemonicVault,
  withMnemonicVaultLock,
} from "./repository";

export async function storeMnemonic(
  seedGroupId: string,
  mnemonic: string,
  access: MnemonicWriteAccess,
  expectedAuthEpoch?: string,
): Promise<void> {
  await withMnemonicVaultLock(async () => {
    if (expectedAuthEpoch) assertCurrentMasterAuthorization(expectedAuthEpoch);
    const existing = await loadMnemonicVault();
    if (existing?.entries.some((entry) => entry.id === seedGroupId)) {
      throw new Error("Seed group already exists in vault");
    }

    if (!existing) {
      if (access.kind !== "password" || !access.password) {
        throw new Error(
          "Biometric seed storage is not initialized. Unlock with the master password and set up biometric unlock again.",
        );
      }
      const vault: LegacyMnemonicVault = {
        version: 1,
        entries: [
          {
            id: seedGroupId,
            keystore: await encryptMnemonicWithPassword(
              mnemonic,
              access.password,
            ),
          },
        ],
      };
      if (expectedAuthEpoch) assertCurrentMasterAuthorization(expectedAuthEpoch);
      await saveMnemonicVault(vault);
      return;
    }

    if (existing.version === 1) {
      if (access.kind !== "password" || !access.password) {
        throw new Error(
          "Unlock with the master password and set up biometric unlock again before adding a seed phrase.",
        );
      }
      const next: LegacyMnemonicVault = {
        ...existing,
        entries: [
          ...existing.entries,
          {
            id: seedGroupId,
            keystore: await encryptMnemonicWithPassword(
              mnemonic,
              access.password,
            ),
          },
        ],
      };
      if (expectedAuthEpoch) assertCurrentMasterAuthorization(expectedAuthEpoch);
      await saveMnemonicVault(next);
      return;
    }

    if (access.kind !== "mnemonic-key" || access.keyId !== existing.keyId) {
      throw new Error("Mnemonic encryption key is unavailable");
    }
    const next: MnemonicKeyVault = {
      ...existing,
      revision: existing.revision + 1,
      entries: [
        ...existing.entries,
        {
          id: seedGroupId,
          keystore: await encryptMnemonicWithKey(
            mnemonic,
            seedGroupId,
            access.key,
            access.keyId,
          ),
        },
      ],
    };
    if (expectedAuthEpoch) assertCurrentMasterAuthorization(expectedAuthEpoch);
    await saveMnemonicVault(next);
  });
}

export async function getMnemonic(
  seedGroupId: string,
  access: MnemonicReadAccess,
): Promise<string | null> {
  const vault = await loadMnemonicVault();
  if (!vault) return null;
  const entry = vault.entries.find((candidate) => candidate.id === seedGroupId);
  if (!entry) return null;

  try {
    if (vault.version === 2) {
      if (!access.mnemonicKey || access.mnemonicKey.keyId !== vault.keyId) {
        return null;
      }
      return await decryptMnemonicWithKey(
        entry.keystore,
        entry.id,
        access.mnemonicKey.key,
        vault.keyId,
      );
    }
    if (entry.keystore.salt) {
      if (!access.password) return null;
      return await decryptMnemonicWithPassword(entry.keystore, access.password);
    }
    if (!access.legacyVaultKey) return null;
    return await decryptTransitionalSharedVaultEntry(
      entry.keystore,
      access.legacyVaultKey,
    );
  } catch {
    return null;
  }
}

export async function removeMnemonic(
  seedGroupId: string,
  expectedAuthEpoch?: string,
): Promise<void> {
  await withMnemonicVaultLock(async () => {
    if (expectedAuthEpoch) assertCurrentMasterAuthorization(expectedAuthEpoch);
    const vault = await loadMnemonicVault();
    if (!vault) return;
    const entries = vault.entries.filter((entry) => entry.id !== seedGroupId);
    if (expectedAuthEpoch) assertCurrentMasterAuthorization(expectedAuthEpoch);
    if (vault.version === 1) {
      await saveMnemonicVault({ ...vault, entries });
    } else {
      await saveMnemonicVault({
        ...vault,
        revision: vault.revision + 1,
        entries,
      });
    }
  });
}
