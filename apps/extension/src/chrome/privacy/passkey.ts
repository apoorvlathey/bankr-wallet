import {
  WALLET_SECRET_OPERATION_LOCK_KEY,
  withStorageLock,
} from "../storageLock";
import { savePrivacyVault } from "./repository";
import type { UnlockedPrivacyKey } from "./types";
import { preparePrivacyVaultForPasskeyUnlock } from "./vault";

export function unlockPrivacyVaultForPasskeySession(
  prfKeyMaterial: string,
): Promise<UnlockedPrivacyKey | null> {
  return withStorageLock(WALLET_SECRET_OPERATION_LOCK_KEY, async () => {
    const prepared = await preparePrivacyVaultForPasskeyUnlock(
      prfKeyMaterial,
    );
    if (!prepared?.recordToCommit) return prepared?.unlocked ?? null;
    try {
      await savePrivacyVault(prepared.recordToCommit);
      return prepared.unlocked;
    } catch (error) {
      prepared.unlocked.keyBytes.fill(0);
      throw error;
    }
  });
}
