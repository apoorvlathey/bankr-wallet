import {
  WALLET_SECRET_OPERATION_LOCK_KEY,
  withStorageLock,
} from "./storageLock";
import { normalizeEvmAccountAddress } from "./accountStorage";

/**
 * Migrates the pre-multi-account Bankr storage shape.
 *
 * Both `runtime.onInstalled` and the renderer safety-net may request this at
 * the same time. The outer wallet-operation lock and the re-read inside it make
 * the migration linearizable: only one account ID can be committed, so the
 * synced active-account mirror cannot point at a losing concurrent ID.
 */
export async function migrateFromLegacyStorage(): Promise<boolean> {
  return withStorageLock(WALLET_SECRET_OPERATION_LOCK_KEY, async () => {
    try {
      const { accounts } = await chrome.storage.local.get("accounts");
      if (Array.isArray(accounts) && accounts.length > 0) {
        return false;
      }

      const { encryptedApiKey } =
        await chrome.storage.local.get("encryptedApiKey");
      if (!encryptedApiKey) {
        return false;
      }

      const { address, displayAddress } = await chrome.storage.sync.get([
        "address",
        "displayAddress",
      ]);
      if (!address || typeof address !== "string") {
        return false;
      }

      const newAccount = {
        id: crypto.randomUUID(),
        type: "bankr" as const,
        address: normalizeEvmAccountAddress(address),
        displayName:
          typeof displayAddress === "string" && displayAddress !== address
            ? displayAddress
            : undefined,
        createdAt: Date.now(),
      };

      // Cross-storage writes cannot be one Chrome transaction. Commit the
      // authoritative local account first: if the sync mirror write fails, the
      // normal active-account fallback safely selects and repairs this row.
      await chrome.storage.local.set({ accounts: [newAccount] });
      await chrome.storage.sync.set({ activeAccountId: newAccount.id });

      console.log(
        "[WalletChan] Legacy storage migration complete:",
        newAccount.address,
      );
      return true;
    } catch (error) {
      console.error("[WalletChan] Legacy storage migration failed:", error);
      return false;
    }
  });
}
