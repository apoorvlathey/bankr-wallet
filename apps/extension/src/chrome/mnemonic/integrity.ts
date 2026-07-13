import { getAccounts, getSeedGroups } from "../accountStorage";
import { deriveAddress } from "../localSigner";
import {
  decryptMnemonicKeyVaultEntries,
  unlockMnemonicKeyWithPassword,
} from "./recovery";
import { loadMnemonicVault } from "./repository";
import {
  derivePrivateKey as deriveSeedPrivateKey,
  isValidMnemonic,
} from "./derivation";

export interface MnemonicIntegrityResult {
  success: boolean;
  error?: string;
}

/**
 * Proves that the master-password wrapper is a complete recovery path for all
 * v2 seed accounts. Call this before removing another recovery factor (such
 * as a passkey) or replacing the master wrapper during password rotation.
 */
export async function validateV2MnemonicMasterRecovery(
  masterPassword: string,
): Promise<MnemonicIntegrityResult> {
  const mnemonicVault = await loadMnemonicVault();
  if (!mnemonicVault || mnemonicVault.version === 1) {
    return { success: true };
  }

  const unlocked = await unlockMnemonicKeyWithPassword(masterPassword);
  if (!unlocked || unlocked.keyId !== mnemonicVault.keyId) {
    return {
      success: false,
      error: "Seed phrases could not be verified",
    };
  }

  const decryptedEntries = await decryptMnemonicKeyVaultEntries(
    mnemonicVault,
    unlocked.key,
  );
  if (
    !decryptedEntries ||
    decryptedEntries.some(({ mnemonic }) => !isValidMnemonic(mnemonic))
  ) {
    return { success: false, error: "Seed phrases could not be verified" };
  }

  const mnemonicByGroup = new Map(
    decryptedEntries.map(({ id, mnemonic }) => [id, mnemonic]),
  );
  const [accounts, seedGroups] = await Promise.all([
    getAccounts(),
    getSeedGroups(),
  ]);
  const seedGroupIds = new Set(seedGroups.map((group) => group.id));

  try {
    for (const account of accounts) {
      if (account.type !== "seedPhrase") continue;
      const mnemonic = mnemonicByGroup.get(account.seedGroupId);
      if (!mnemonic || !seedGroupIds.has(account.seedGroupId)) {
        return {
          success: false,
          error: "A seed account is missing its recovery phrase",
        };
      }
      const derivedAddress = deriveAddress(
        deriveSeedPrivateKey(mnemonic, account.derivationIndex),
      );
      if (derivedAddress.toLowerCase() !== account.address.toLowerCase()) {
        return {
          success: false,
          error: "A seed phrase does not match its account",
        };
      }
    }
  } catch {
    return { success: false, error: "Seed accounts could not be verified" };
  }

  return { success: true };
}
