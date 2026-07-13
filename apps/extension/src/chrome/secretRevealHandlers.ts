import {
  decryptAllKeysWithVaultKey,
  handleUnlockWallet,
  verifyMasterPassword,
} from "./authHandlers";
import { getMnemonic } from "./mnemonicStorage";
import {
  getCachedMnemonicKey,
  getCachedVaultKey,
  getPrivateKeyFromCache,
  resolvePasswordType,
  setCachedVault,
} from "./sessionCache";
import {
  getAuthCeremonyEpoch,
} from "./authTransition";
import {
  hasCurrentMasterAuthorization,
  STALE_MASTER_AUTHORIZATION_ERROR,
} from "./masterAuthorization";
import {
  WALLET_SECRET_OPERATION_LOCK_KEY,
  withStorageLock,
} from "./storageLock";
import { decryptAllKeys } from "./vaultCrypto";

type SecretRevealResponse =
  | { success: true; mnemonic: string }
  | { success: true; privateKey: `0x${string}` }
  | {
      success: false;
      error: string;
      requiresMasterPassword?: boolean;
    };

type SendRevealResponse = (response: SecretRevealResponse) => void;

async function resolveExplicitMasterRevealAuthorization(
  password: string,
  secretLabel: "Private key" | "Seed phrase",
  sendResponse: SendRevealResponse,
): Promise<string | null> {
  const passwordType = await resolvePasswordType(handleUnlockWallet);
  if (passwordType === "agent") {
    sendResponse({
      success: false,
      error: `${secretLabel} reveal requires master password`,
      requiresMasterPassword: true,
    });
    return null;
  }
  if (passwordType !== "master") {
    sendResponse({ success: false, error: "Wallet is locked" });
    return null;
  }

  // Capture before the expensive recovery proof. A lock, password rotation, or
  // factor mutation that completes while PBKDF2/storage work is in flight must
  // invalidate this reveal instead of letting it adopt the newer epoch.
  const expectedAuthEpoch = getAuthCeremonyEpoch();
  if (!(await verifyMasterPassword(password))) {
    sendResponse({ success: false, error: "Invalid password" });
    return null;
  }
  if (!hasCurrentMasterAuthorization(expectedAuthEpoch)) {
    sendResponse({ success: false, error: STALE_MASTER_AUTHORIZATION_ERROR });
    return null;
  }
  return expectedAuthEpoch;
}

/**
 * Reveal one recovery phrase only while this operation owns the same lock used
 * by lock/password/factor mutations. The plaintext callback is invoked before
 * releasing the lock so a queued lock cannot complete first and still receive
 * a stale secret response afterward.
 */
export async function handleRevealSeedPhrase(
  seedGroupId: string,
  password: string,
  sendResponse: SendRevealResponse,
): Promise<void> {
  try {
    const expectedAuthEpoch = await resolveExplicitMasterRevealAuthorization(
      password,
      "Seed phrase",
      sendResponse,
    );
    if (!expectedAuthEpoch) return;

    await withStorageLock(WALLET_SECRET_OPERATION_LOCK_KEY, async () => {
      if (!hasCurrentMasterAuthorization(expectedAuthEpoch)) {
        sendResponse({ success: false, error: STALE_MASTER_AUTHORIZATION_ERROR });
        return;
      }

      const mnemonic = await getMnemonic(seedGroupId, {
        password,
        mnemonicKey: getCachedMnemonicKey(),
        legacyVaultKey: getCachedVaultKey(),
      });

      // Timed expiry can clear caches without another message taking the lock,
      // so re-check after every asynchronous secret read as well.
      if (!hasCurrentMasterAuthorization(expectedAuthEpoch)) {
        sendResponse({ success: false, error: STALE_MASTER_AUTHORIZATION_ERROR });
        return;
      }
      if (!mnemonic) {
        sendResponse({ success: false, error: "Seed phrase not found" });
        return;
      }

      sendResponse({ success: true, mnemonic });
    });
  } catch (error) {
    sendResponse({
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to reveal seed phrase",
    });
  }
}

/** Same linearized response boundary as handleRevealSeedPhrase. */
export async function handleRevealPrivateKey(
  accountId: string,
  password: string,
  sendResponse: SendRevealResponse,
): Promise<void> {
  try {
    const expectedAuthEpoch = await resolveExplicitMasterRevealAuthorization(
      password,
      "Private key",
      sendResponse,
    );
    if (!expectedAuthEpoch) return;

    await withStorageLock(WALLET_SECRET_OPERATION_LOCK_KEY, async () => {
      if (!hasCurrentMasterAuthorization(expectedAuthEpoch)) {
        sendResponse({ success: false, error: STALE_MASTER_AUTHORIZATION_ERROR });
        return;
      }

      let privateKey = getPrivateKeyFromCache(accountId);
      let decryptedVault: Awaited<ReturnType<typeof decryptAllKeys>> | null = null;
      if (!privateKey) {
        const cachedVaultKey = getCachedVaultKey();
        decryptedVault = cachedVaultKey
          ? await decryptAllKeysWithVaultKey(cachedVaultKey, password)
          : await decryptAllKeys(password);
        privateKey =
          decryptedVault?.find((entry) => entry.id === accountId)?.privateKey ??
          null;
      }

      if (!hasCurrentMasterAuthorization(expectedAuthEpoch)) {
        sendResponse({ success: false, error: STALE_MASTER_AUTHORIZATION_ERROR });
        return;
      }
      if (!privateKey) {
        sendResponse({
          success: false,
          error: "Private key not found for this account",
        });
        return;
      }
      if (decryptedVault) setCachedVault(decryptedVault);

      sendResponse({ success: true, privateKey });
    });
  } catch (error) {
    sendResponse({
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to reveal private key",
    });
  }
}
