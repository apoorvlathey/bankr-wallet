import { clearAllNonces } from "../forceInclusion/nonceManager";
import {
  activeAbortControllers,
  failedTxResults,
  processingTxIds,
} from "./runtime";
import {
  getStorageKeysWithPrefixes,
  WALLET_LOCAL_STORAGE_PREFIXES,
} from "../walletResetStorage";

/** Clears transaction-process state as part of a full wallet reset. */
export async function performSecurityReset(): Promise<void> {
  for (const [, abortController] of activeAbortControllers.entries()) {
    try {
      abortController.abort();
    } catch {
      // Ignore abort errors.
    }
  }
  activeAbortControllers.clear();

  const allKeys = await chrome.storage.local.get(null);
  const transientKeys = getStorageKeysWithPrefixes(
    allKeys,
    WALLET_LOCAL_STORAGE_PREFIXES,
  );
  if (transientKeys.length > 0) {
    await chrome.storage.local.remove(transientKeys);
  }

  failedTxResults.clear();
  processingTxIds.clear();
  clearAllNonces();
}
