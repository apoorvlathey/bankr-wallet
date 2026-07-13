import {
  encryptVaultKey,
  importVaultKey,
  tryDecryptVaultKey,
  type EncryptedData,
} from "../crypto";
import {
  createMnemonicKeyCheck,
  decryptMnemonicWithKey,
  decryptMnemonicWithPassword,
  decryptTransitionalSharedVaultEntry,
  encryptMnemonicWithKey,
  encryptMnemonicWithPassword,
  verifyMnemonicKeyCheck,
} from "./crypto";
import type {
  LegacyMnemonicVaultEntry,
  MnemonicKeyVault,
  MnemonicKeyVaultEntry,
  StoredMnemonicVault,
} from "./record";
import {
  loadMnemonicVault,
  saveMnemonicVault,
  withMnemonicVaultLock,
} from "./repository";

export async function unlockMnemonicKeyWithPassword(
  password: string,
): Promise<{ keyBytes: Uint8Array; key: CryptoKey; keyId: string } | null> {
  const vault = await loadMnemonicVault();
  if (!vault || vault.version !== 2) return null;
  const keyBytes = await tryDecryptVaultKey(vault.masterWrappedKey, password);
  if (!keyBytes || keyBytes.length !== 32) return null;
  const key = await importVaultKey(keyBytes);
  // Explicit master recovery may accept an older empty V2 vault without a key
  // check. Passkey unlock does not receive this compatibility exception.
  if (
    (vault.keyCheck || vault.entries.length > 0) &&
    !(await verifyMnemonicKeyForVault(vault, key))
  ) {
    return null;
  }
  return { keyBytes, key, keyId: vault.keyId };
}

/** Prepare V2 data in memory; the caller atomically commits it with passkeys. */
export async function prepareMnemonicKeyVault(
  password: string,
  mnemonicKey: CryptoKey,
  keyId: string,
  masterWrappedKey: EncryptedData,
  legacyVaultKey?: CryptoKey | null,
): Promise<MnemonicKeyVault | null> {
  const vault = await loadMnemonicVault();
  if (!vault) {
    return {
      version: 2,
      keyId,
      revision: 0,
      masterWrappedKey,
      keyCheck: await createMnemonicKeyCheck(mnemonicKey, keyId),
      entries: [],
    };
  }
  if (vault.version === 2) {
    if (vault.keyId !== keyId) return null;
    return {
      ...vault,
      masterWrappedKey,
      keyCheck: await createMnemonicKeyCheck(mnemonicKey, keyId),
    };
  }

  try {
    const entries: MnemonicKeyVaultEntry[] = [];
    for (const entry of vault.entries) {
      const mnemonic = entry.keystore.salt
        ? await decryptMnemonicWithPassword(entry.keystore, password)
        : legacyVaultKey
          ? await decryptTransitionalSharedVaultEntry(
              entry.keystore,
              legacyVaultKey,
            )
          : null;
      if (!mnemonic) return null;
      entries.push({
        id: entry.id,
        keystore: await encryptMnemonicWithKey(
          mnemonic,
          entry.id,
          mnemonicKey,
          keyId,
        ),
      });
    }
    return {
      version: 2,
      keyId,
      revision: 0,
      masterWrappedKey,
      keyCheck: await createMnemonicKeyCheck(mnemonicKey, keyId),
      entries,
    };
  } catch {
    return null;
  }
}

export async function verifyMnemonicKeyForVault(
  vault: MnemonicKeyVault,
  mnemonicKey: CryptoKey,
): Promise<boolean> {
  if (vault.keyCheck) {
    return verifyMnemonicKeyCheck(vault.keyCheck, mnemonicKey, vault.keyId);
  }
  if (vault.entries.length === 0) return false;
  try {
    for (const entry of vault.entries) {
      await decryptMnemonicWithKey(
        entry.keystore,
        entry.id,
        mnemonicKey,
        vault.keyId,
      );
    }
    return true;
  } catch {
    return false;
  }
}

export async function decryptMnemonicKeyVaultEntries(
  vault: MnemonicKeyVault,
  mnemonicKey: CryptoKey,
): Promise<Array<{ id: string; mnemonic: string }> | null> {
  try {
    return await Promise.all(
      vault.entries.map(async (entry) => ({
        id: entry.id,
        mnemonic: await decryptMnemonicWithKey(
          entry.keystore,
          entry.id,
          mnemonicKey,
          vault.keyId,
        ),
      })),
    );
  } catch {
    return null;
  }
}

/** Compute password-rotation data without writing storage. */
export async function computeReEncryptedMnemonicVault(
  oldPassword: string,
  newPassword: string,
): Promise<StoredMnemonicVault | null> {
  const vault = await loadMnemonicVault();
  if (!vault) return null;
  try {
    if (vault.version === 2) {
      const keyBytes = await tryDecryptVaultKey(
        vault.masterWrappedKey,
        oldPassword,
      );
      if (!keyBytes) return null;
      return {
        ...vault,
        masterWrappedKey: await encryptVaultKey(keyBytes, newPassword),
      };
    }

    const entries: LegacyMnemonicVaultEntry[] = [];
    for (const entry of vault.entries) {
      if (!entry.keystore.salt) {
        entries.push(entry);
        continue;
      }
      const mnemonic = await decryptMnemonicWithPassword(
        entry.keystore,
        oldPassword,
      );
      entries.push({
        id: entry.id,
        keystore: await encryptMnemonicWithPassword(mnemonic, newPassword),
      });
    }
    return { ...vault, entries };
  } catch {
    return null;
  }
}

export async function reEncryptMnemonicVault(
  oldPassword: string,
  newPassword: string,
): Promise<boolean> {
  return withMnemonicVaultLock(async () => {
    const vault = await computeReEncryptedMnemonicVault(
      oldPassword,
      newPassword,
    );
    if (!vault) return !(await hasMnemonics());
    await saveMnemonicVault(vault);
    return true;
  });
}

export async function hasLegacyMnemonicEntries(): Promise<boolean> {
  const vault = await loadMnemonicVault();
  return vault?.version === 1 && vault.entries.length > 0;
}

export async function hasMnemonicKeyVault(): Promise<boolean> {
  return (await loadMnemonicVault())?.version === 2;
}

export async function hasMnemonics(): Promise<boolean> {
  const vault = await loadMnemonicVault();
  return !!vault && vault.entries.length > 0;
}
