/**
 * Authentication and password management handlers
 * Handles wallet unlock, vault key system, password changes, and agent passwords
 */

import {
  encrypt,
  loadDecryptedApiKey,
  hasEncryptedApiKey,
  generateVaultKey,
  encryptVaultKey,
  tryDecryptVaultKey,
  importVaultKey,
  encryptWithVaultKey,
  decryptWithVaultKey,
  EncryptedData,
} from "./crypto";
import {
  decryptAllKeys,
  computeReEncryptedVault,
  hasVaultEntries,
  loadVault,
  isVaultKeyEncrypted,
  VAULT_STORAGE_KEY,
} from "./vaultCrypto";
import { computeReEncryptedMnemonicVault, hasMnemonics } from "./mnemonicStorage";
import type { PasswordType } from "./types";
import {
  setCachedApiKey,
  setCachedApiKeyDirect,
  setCachedPasswordDirect,
  getCachedPassword,
  setCachedVault,
  getCachedVaultKey,
  setCachedVaultKey,
  setCachedPasswordType,
  resolvePasswordType,
  tryRestoreSessionAlreadySerialized,
  setCurrentSessionId,
  getAutoLockTimeout,
  storeSessionMetadata,
  storeSessionPassword,
  storeSessionAtomic,
  tryRestoreSession,
  clearAllAuthState,
} from "./sessionCache";

/**
 * Attempts to unlock the wallet by caching the decrypted API key and vault
 * Supports both legacy format (direct password encryption) and new vault key system
 * With vault key system, both master and agent passwords can unlock the wallet
 */
export async function handleUnlockWallet(password: string): Promise<{ success: boolean; error?: string; passwordType?: PasswordType }> {
  const hasVaultKeySystemActive = await checkHasVaultKeySystem();

  if (hasVaultKeySystemActive) {
    // New vault key system - try to decrypt vault key with either password
    return await unlockWithVaultKeySystem(password);
  } else {
    // Legacy system - decrypt directly with password, then migrate if successful
    return await unlockWithLegacySystem(password);
  }
}

/**
 * Checks if vault key system is in use
 */
export async function checkHasVaultKeySystem(): Promise<boolean> {
  const { encryptedVaultKeyMaster } = await chrome.storage.local.get("encryptedVaultKeyMaster");
  return !!encryptedVaultKeyMaster;
}

interface HydrateAuthSessionOptions {
  password?: string | null;
  persistPasswordSession?: boolean;
  migrateLegacyPrivateKeys?: boolean;
}

/**
 * Hydrates the normal unlocked session caches from raw vault-key bytes.
 * Password unlocks pass `password`; passkey unlocks intentionally pass null.
 */
export async function hydrateAuthSessionFromVaultKeyBytes(
  vaultKeyBytes: Uint8Array,
  passwordType: PasswordType,
  options: HydrateAuthSessionOptions = {},
): Promise<{ success: boolean; error?: string }> {
  await getAutoLockTimeout();

  let vaultKey: CryptoKey;
  try {
    vaultKey = await importVaultKey(vaultKeyBytes);
  } catch {
    return { success: false, error: "Failed to import vault key" };
  }

  let apiKey: string | null = null;
  const { encryptedApiKeyVault } = await chrome.storage.local.get("encryptedApiKeyVault");
  if (encryptedApiKeyVault) {
    apiKey = await decryptWithVaultKey(vaultKey, encryptedApiKeyVault);
    if (!apiKey) {
      return { success: false, error: "Failed to decrypt API key" };
    }
  }

  let decryptedVault: import("./types").DecryptedEntry[] | null = null;
  const hasVault = await hasVaultEntries();
  if (hasVault) {
    if (options.migrateLegacyPrivateKeys && options.password) {
      const vault = await loadVault();
      const needsMigration = vault?.entries.some(e => !isVaultKeyEncrypted(e.keystore));

      if (needsMigration) {
        await migratePrivateKeysToVaultKey(options.password, vaultKey);
      }
    }

    decryptedVault = await decryptAllKeysWithVaultKey(
      vaultKey,
      options.password ?? null,
    );
    if (!decryptedVault && passwordType === "agent") {
      // SECURITY (H-5): Agent unlock cannot decrypt password-encrypted
      // legacy keystores. If the vault still has any non-vault-key entries,
      // surface a clear error and tear down the partial unlock so the user
      // doesn't end up with a silently empty cached vault that fails opaquely
      // when signing.
      const fullVault = await loadVault();
      const hasLegacyEntries = fullVault?.entries.some(e => !isVaultKeyEncrypted(e.keystore));
      if (hasLegacyEntries) {
        return {
          success: false,
          error: "Unlock with master password once to migrate legacy private keys",
        };
      }
    } else if (!decryptedVault) {
      return { success: false, error: "Failed to decrypt vault" };
    }
  }

  let persistedSessionId: string | null = null;
  if (options.persistPasswordSession && options.password) {
    const autoLockTimeout = await getAutoLockTimeout();
    if (autoLockTimeout === 0) {
      persistedSessionId = crypto.randomUUID();
      // Persist before committing in-memory credentials. If either storage
      // write fails, callers receive an error while the cache remains in its
      // previous state instead of becoming silently unlocked.
      await storeSessionAtomic(
        persistedSessionId,
        true,
        passwordType,
        options.password,
      );
    }
  }

  // Commit the prepared session synchronously only after every fallible
  // decrypt/migration/persistence step has completed.
  setCachedVaultKey(vaultKey);
  setCachedPasswordType(passwordType);
  setCachedPasswordDirect(options.password ?? null);
  if (persistedSessionId) setCurrentSessionId(persistedSessionId);

  if (apiKey) {
    setCachedApiKey(apiKey);
  }
  if (decryptedVault) {
    setCachedVault(decryptedVault);
  }

  return { success: true };
}

/**
 * Unlocks using the new vault key system
 * Tries master password first, then agent password
 */
async function unlockWithVaultKeySystem(password: string): Promise<{ success: boolean; error?: string; passwordType?: PasswordType }> {
  const { encryptedVaultKeyMaster, encryptedVaultKeyAgent, agentPasswordEnabled } =
    await chrome.storage.local.get(["encryptedVaultKeyMaster", "encryptedVaultKeyAgent", "agentPasswordEnabled"]);

  if (!encryptedVaultKeyMaster) {
    return { success: false, error: "No encrypted vault key found" };
  }

  // SECURITY (H-4): Race master and agent decryption in parallel to
  // eliminate the password-type timing oracle. Without this an attacker
  // observing handler latency could distinguish master vs agent unlock
  // (master returns ~0.6s, agent ~1.2s under sequential trial).
  // SECURITY (M-5): tryDecryptVaultKey is null-safe AND we still guard
  // encryptedVaultKeyAgent at the call site so a partial-write desync
  // (agentPasswordEnabled=true with no wrapper) cannot crash unlock.
  const tryMaster = tryDecryptVaultKey(encryptedVaultKeyMaster, password);
  const tryAgent = (agentPasswordEnabled && encryptedVaultKeyAgent)
    ? tryDecryptVaultKey(encryptedVaultKeyAgent, password)
    : Promise.resolve(null);
  const [masterResult, agentResult] = await Promise.all([tryMaster, tryAgent]);

  let vaultKeyBytes: Uint8Array | null = null;
  let passwordType: PasswordType = "master";
  if (masterResult) {
    vaultKeyBytes = masterResult;
    passwordType = "master";
  } else if (agentResult) {
    vaultKeyBytes = agentResult;
    passwordType = "agent";
  }

  if (!vaultKeyBytes) {
    return { success: false, error: "Invalid password" };
  }

  const hydrated = await hydrateAuthSessionFromVaultKeyBytes(vaultKeyBytes, passwordType, {
    password,
    persistPasswordSession: true,
    migrateLegacyPrivateKeys: passwordType === "master",
  });
  if (!hydrated.success) {
    return hydrated;
  }

  return { success: true, passwordType };
}

/**
 * Unlocks using legacy system (direct password encryption)
 * Also migrates to vault key system after successful unlock
 */
async function unlockWithLegacySystem(password: string): Promise<{ success: boolean; error?: string; passwordType?: PasswordType }> {
  try {
    // Try to decrypt API key (if exists)
    const hasApiKey = await hasEncryptedApiKey();
    let apiKey: string | null = null;

    if (hasApiKey) {
      apiKey = await loadDecryptedApiKey(password);
      if (!apiKey) {
        return { success: false, error: "Invalid password" };
      }
      setCachedApiKey(apiKey, password);
    }

    // Try to decrypt vault (if exists)
    const hasVault = await hasVaultEntries();
    if (hasVault) {
      const vault = await decryptAllKeys(password);
      if (!vault) {
        // If we already decrypted API key but vault fails, password is wrong
        // This shouldn't happen if passwords are in sync
        if (!hasApiKey) {
          return { success: false, error: "Invalid password" };
        }
      } else {
        setCachedVault(vault);
      }
    }

    // If we have neither API key nor vault, password can't be verified
    if (!hasApiKey && !hasVault) {
      return { success: false, error: "No encrypted data found" };
    }

    // Migration: Create vault key system
    await migrateToVaultKeySystem(password, apiKey);

    // Set password type to master (legacy system only has master password)
    setCachedPasswordType("master");
    setCachedPasswordDirect(password);

    // Store session data for restoration if auto-lock is "Never"
    const autoLockTimeout = await getAutoLockTimeout();
    if (autoLockTimeout === 0) {
      const sessionId = crypto.randomUUID();
      setCurrentSessionId(sessionId);
      await storeSessionMetadata(sessionId, true, "master");
      await storeSessionPassword(password);
    }

    return { success: true, passwordType: "master" };
  } catch (error) {
    // Legacy unlock mutates caches while it performs the one-time migration.
    // If later persistence fails, tear everything down so callers cannot see
    // an error while decrypted credentials remain active.
    await clearAllAuthState().catch(() => undefined);
    console.error("[authHandlers] Legacy unlock failed:", error);
    return { success: false, error: "Failed to unlock wallet" };
  }
}

/**
 * Migrates private keys to vault-key encryption (used when vault key system exists but private keys aren't migrated)
 */
async function migratePrivateKeysToVaultKey(password: string, vaultKey: CryptoKey): Promise<void> {
  try {
    const { loadVault, saveVault, decryptPrivateKey, encryptPrivateKeyWithVaultKey } = await import("./vaultCrypto");
    const vault = await loadVault();
    if (!vault || vault.entries.length === 0) {
      return;
    }

    const newEntries: any[] = [];
    for (const entry of vault.entries) {
      // Decrypt with password
      const privateKey = await decryptPrivateKey(entry.keystore as any, password);
      // Re-encrypt with vault key
      const newKeystore = await encryptPrivateKeyWithVaultKey(privateKey, vaultKey);
      newEntries.push({ id: entry.id, keystore: newKeystore });
    }
    vault.entries = newEntries;
    await saveVault(vault);

    console.log("Private key migration to vault key completed");
  } catch (error) {
    console.error("Failed to migrate private keys to vault key:", error);
    // Continue without migration - will try again next unlock
  }
}

/**
 * Migrates from legacy direct-password encryption to vault key system
 * Migrates both API key and all private keys to vault-key encryption
 */
async function migrateToVaultKeySystem(password: string, apiKey: string | null): Promise<void> {
  try {
    // Generate a new vault key
    const vaultKeyBytes = generateVaultKey();
    const vaultKey = await importVaultKey(vaultKeyBytes);

    // Encrypt vault key with master password
    const encryptedVaultKeyMaster = await encryptVaultKey(vaultKeyBytes, password);

    // Re-encrypt API key with vault key (if exists)
    let encryptedApiKeyVault: EncryptedData | null = null;
    if (apiKey) {
      encryptedApiKeyVault = await encryptWithVaultKey(vaultKey, apiKey);
    }

    // Re-encrypt all private keys with vault key (if vault exists)
    const { loadVault: loadV, decryptPrivateKey, encryptPrivateKeyWithVaultKey } = await import("./vaultCrypto");
    const vault = await loadV();
    let updatedVault = vault;
    if (vault && vault.entries.length > 0) {
      const newEntries: any[] = [];
      for (const entry of vault.entries) {
        // Decrypt with password
        const privateKey = await decryptPrivateKey(entry.keystore as any, password);
        // Re-encrypt with vault key
        const newKeystore = await encryptPrivateKeyWithVaultKey(privateKey, vaultKey);
        newEntries.push({ id: entry.id, keystore: newKeystore });
      }
      updatedVault = { ...vault, entries: newEntries };
    }

    // SECURITY: Single atomic write. Persist vault entries, master wrapper,
    // optional vault-key-encrypted API key, and DROP the legacy
    // password-encrypted API key ciphertext (C-3 + C-4). If the SW dies
    // mid-write, chrome.storage.local.set is atomic at the chrome layer.
    const storageData: Record<string, any> = {
      encryptedVaultKeyMaster,
      agentPasswordEnabled: false,
      encryptedApiKey: null, // SECURITY: drop legacy password-encrypted ciphertext
    };
    if (updatedVault) {
      storageData[VAULT_STORAGE_KEY] = updatedVault;
    }
    if (encryptedApiKeyVault) {
      storageData.encryptedApiKeyVault = encryptedApiKeyVault;
    }
    await chrome.storage.local.set(storageData);

    // Cache the vault key
    setCachedVaultKey(vaultKey);

    console.log("Migration to vault key system completed (API key + private keys)");
  } catch (error) {
    console.error("Failed to migrate to vault key system:", error);
    // Continue without migration - will try again next unlock
  }
}

/**
 * Decrypts all private keys using the vault key
 * Supports both vault-key and password-encrypted entries for backward compatibility
 */
export async function decryptAllKeysWithVaultKey(
  vaultKey: CryptoKey,
  fallbackPassword?: string | null,
): Promise<import("./types").DecryptedEntry[] | null> {
  const { loadVault, isVaultKeyEncrypted, decryptPrivateKeyWithVaultKey, decryptPrivateKey } = await import("./vaultCrypto");

  const vault = await loadVault();
  if (!vault || vault.entries.length === 0) {
    return [];
  }

  try {
    const decrypted: import("./types").DecryptedEntry[] = [];
    for (const entry of vault.entries) {
      const keystore = entry.keystore;

      // Check if vault-key encrypted or password-encrypted
      if (isVaultKeyEncrypted(keystore)) {
        // New format: decrypt with vault key
        const privateKey = await decryptPrivateKeyWithVaultKey(keystore, vaultKey);
        if (!privateKey) throw new Error("Vault key decryption failed");
        decrypted.push({ id: entry.id, privateKey });
      } else {
        // Legacy format: need password (fallback during transition)
        const password = fallbackPassword ?? getCachedPassword();
        if (!password) {
          throw new Error("Password required for legacy keystore format");
        }
        const privateKey = await decryptPrivateKey(keystore, password);
        decrypted.push({ id: entry.id, privateKey });
      }
    }
    return decrypted;
  } catch (error) {
    console.error("Failed to decrypt vault with vault key:", error);
    return null;
  }
}

/**
 * Sets an agent password for the wallet
 * Requires the wallet to be unlocked with master password
 */
export async function handleSetAgentPassword(agentPassword: string): Promise<{ success: boolean; error?: string }> {
  // Must be unlocked with master password to set agent password.
  // Use resolvePasswordType so post-SW-restart agent sessions don't fall
  // through a stale-null cachedPasswordType (M-6).
  if ((await resolvePasswordType(handleUnlockWallet, true)) !== "master") {
    return { success: false, error: "Must be unlocked with master password to set agent password" };
  }

  if (!getCachedVaultKey()) {
    return { success: false, error: "Vault key not available. Please unlock the wallet first." };
  }

  if (!agentPassword || agentPassword.length < 6) {
    return { success: false, error: "Agent password must be at least 6 characters" };
  }

  try {
    // Get the vault key bytes by decrypting with master password
    const { encryptedVaultKeyMaster } = await chrome.storage.local.get("encryptedVaultKeyMaster");
    if (!encryptedVaultKeyMaster) {
      return { success: false, error: "No vault key found" };
    }

    let password = getCachedPassword();

    // If no cached password, try session restoration (for "Never" auto-lock mode)
    if (!password) {
      const autoLockTimeout = await getAutoLockTimeout();
      if (autoLockTimeout === 0) {
        const restored = await tryRestoreSessionAlreadySerialized(handleUnlockWallet);
        if (restored) {
          password = getCachedPassword();
        }
      }
    }

    if (!password) {
      return { success: false, error: "Session expired. Please unlock the wallet again." };
    }

    // SECURITY (H-1): Refuse if the agent password matches the master.
    // Otherwise every unlock would resolve as "master" (master path tried
    // first), silently bypassing agent restrictions.
    if (agentPassword === password) {
      return { success: false, error: "Agent password must differ from master password" };
    }
    // Defense in depth: also reject if the agent password decrypts the
    // master wrapper (e.g. caller bypassed the equality check).
    const matchesMaster = await tryDecryptVaultKey(encryptedVaultKeyMaster, agentPassword);
    if (matchesMaster) {
      return { success: false, error: "Agent password must differ from master password" };
    }

    // Decrypt vault key with master password to get raw bytes
    const vaultKeyBytes = await tryDecryptVaultKey(encryptedVaultKeyMaster, password);
    if (!vaultKeyBytes) {
      return { success: false, error: "Failed to decrypt vault key" };
    }

    // Encrypt vault key with agent password
    const encryptedVaultKeyAgent = await encryptVaultKey(vaultKeyBytes, agentPassword);

    // Save to storage
    await chrome.storage.local.set({
      encryptedVaultKeyAgent,
      agentPasswordEnabled: true,
    });

    // Don't touch the session-restore record: this handler can only run
    // under master, the master password / wrapper aren't modified here, so
    // the existing master-keyed session is still valid. Clearing it would
    // force a re-unlock on the next SW restart for no security gain.

    return { success: true };
  } catch (error) {
    console.error("[authHandlers]", error);
    return {
      success: false,
      error: "Failed to set agent password",
    };
  }
}

/**
 * Removes the agent password
 * Requires verification of master password
 */
export async function handleRemoveAgentPassword(masterPassword: string): Promise<{ success: boolean; error?: string }> {
  try {
    // Verify master password by trying to decrypt vault key
    const { encryptedVaultKeyMaster } = await chrome.storage.local.get("encryptedVaultKeyMaster");
    if (!encryptedVaultKeyMaster) {
      return { success: false, error: "No vault key found" };
    }

    const vaultKeyBytes = await tryDecryptVaultKey(encryptedVaultKeyMaster, masterPassword);
    if (!vaultKeyBytes) {
      return { success: false, error: "Invalid master password" };
    }

    // Remove agent password from storage
    await chrome.storage.local.remove("encryptedVaultKeyAgent");
    await chrome.storage.local.set({ agentPasswordEnabled: false });

    // SECURITY (H-6 + M-4): Force-lock any active session so an in-progress
    // agent unlock cannot continue after its wrapper was removed. Broadcast
    // walletLockedExternal so other open UIs route to the lock screen.
    await clearAllAuthState();
    chrome.runtime.sendMessage({ type: "walletLockedExternal" }).catch(() => {});

    return { success: true };
  } catch (error) {
    console.error("[authHandlers]", error);
    return {
      success: false,
      error: "Failed to remove agent password",
    };
  }
}

/**
 * Saves a new API key using the currently cached password
 * This is used when changing API key while already unlocked
 */
export async function handleSaveApiKeyWithCachedPassword(
  newApiKey: string
): Promise<{ success: boolean; error?: string }> {
  // SECURITY: Block API key changes when unlocked with agent password.
  // Resolve via session restore so post-SW-restart agent sessions are caught.
  const passwordType = await resolvePasswordType(handleUnlockWallet);
  if (passwordType === "agent") {
    return { success: false, error: "API key changes require master password" };
  }

  let password = getCachedPassword();

  // If no cached password, try session restoration (for "Never" auto-lock mode)
  if (!password) {
    const autoLockTimeout = await getAutoLockTimeout();
    if (autoLockTimeout === 0) {
      const restored = await tryRestoreSession(handleUnlockWallet);
      if (restored) {
        password = getCachedPassword();
      }
    }
  }

  if (!password) {
    return { success: false, error: "Wallet is locked. Please unlock first." };
  }

  try {
    // Check if vault key system is in use
    const vaultKey = getCachedVaultKey();
    if (vaultKey) {
      // Encrypt API key with vault key and save to new location
      const encrypted = await encryptWithVaultKey(vaultKey, newApiKey);
      await chrome.storage.local.set({ encryptedApiKeyVault: encrypted });
    } else {
      // Legacy system - encrypt with password
      const { saveEncryptedApiKey } = await import("./crypto");
      await saveEncryptedApiKey(newApiKey, password);
    }
    // Update the cached API key
    setCachedApiKeyDirect(newApiKey);
    return { success: true };
  } catch (error) {
    console.error("[authHandlers]", error);
    return {
      success: false,
      error: "Failed to save API key",
    };
  }
}

/**
 * Changes the wallet password using the currently cached password
 * This is used when changing password while already unlocked
 */
export async function handleChangePasswordWithCachedPassword(
  newPassword: string
): Promise<{ success: boolean; error?: string }> {
  // SECURITY: Block password changes when unlocked with agent password.
  // Resolve via session restore so post-SW-restart agent sessions are caught.
  const passwordType = await resolvePasswordType(handleUnlockWallet, true);
  if (passwordType === "agent") {
    return { success: false, error: "Password changes require master password" };
  }

  let currentPassword = getCachedPassword();

  // If no cached password, try session restoration (for "Never" auto-lock mode)
  if (!currentPassword) {
    const autoLockTimeout = await getAutoLockTimeout();
    if (autoLockTimeout === 0) {
      const restored = await tryRestoreSessionAlreadySerialized(handleUnlockWallet);
      if (restored) {
        currentPassword = getCachedPassword();
      }
    }
  }

  if (!currentPassword) {
    return { success: false, error: "Session expired. Please unlock your wallet again." };
  }

  try {
    // Check if using vault key system
    const hasVaultKeySystemActive = await checkHasVaultKeySystem();

    if (hasVaultKeySystemActive) {
      // New vault key system: re-encrypt the vault key with new password
      // The actual data (API key, private keys) stays encrypted with the vault key
      const { encryptedVaultKeyMaster } = await chrome.storage.local.get("encryptedVaultKeyMaster");
      if (!encryptedVaultKeyMaster) {
        return { success: false, error: "No vault key found" };
      }

      // Decrypt vault key with old password to get raw bytes
      const vaultKeyBytes = await tryDecryptVaultKey(encryptedVaultKeyMaster, currentPassword);
      if (!vaultKeyBytes) {
        return { success: false, error: "Failed to decrypt vault key" };
      }

      // Step 1: Compute ALL new encrypted values in memory (no storage writes yet).
      // In the vault-key system the private-key vault entries are encrypted
      // with the vault key (not the password), so they don't need re-encryption
      // when the master password changes — only the master wrapper does. The
      // mnemonic vault is still password-encrypted today, so it does.
      const newEncryptedVaultKeyMaster = await encryptVaultKey(vaultKeyBytes, newPassword);

      const hasMnemonicEntries = await hasMnemonics();
      let newMnemonicVault = null;
      if (hasMnemonicEntries) {
        newMnemonicVault = await computeReEncryptedMnemonicVault(currentPassword, newPassword);
        if (!newMnemonicVault) {
          return { success: false, error: "Failed to re-encrypt mnemonic vault" };
        }
      }

      // Step 2: Single atomic storage write with all re-encrypted data.
      // SECURITY (C-2): Drop the agent-password wrapper on master rotation.
      // Otherwise the OLD agent password could still unwrap the vault key
      // even after the master rotated.
      const storageUpdate: Record<string, unknown> = {
        encryptedVaultKeyMaster: newEncryptedVaultKeyMaster,
        encryptedVaultKeyAgent: null,
        agentPasswordEnabled: false,
        passkeyUnlock: null,
      };
      if (newMnemonicVault) {
        storageUpdate.mnemonicVault = newMnemonicVault;
      }
      await chrome.storage.local.set(storageUpdate);

      // SECURITY (H-7): Round-trip verify that the stored wrapper decrypts
      // with the new password BEFORE we tear down the active session. If
      // verification fails, the user can still recover with the old
      // password (it was just overwritten — but on the off chance the write
      // succeeded with corruption, a clean error is far better than a
      // permanent lockout).
      const { encryptedVaultKeyMaster: storedAfter } = await chrome.storage.local.get("encryptedVaultKeyMaster");
      const verify = await tryDecryptVaultKey(storedAfter, newPassword);
      if (!verify) {
        console.error("[authHandlers] Password rotation verify FAILED. Stored wrapper does not decrypt with the new password.");
        return { success: false, error: "Password change verification failed; rotation aborted" };
      }
    } else {
      // Legacy system: re-encrypt password-derived data directly with the
      // new password. Prepare every replacement in memory first, then write
      // once so API key, PK vault, and mnemonic vault cannot be split across
      // old/new passwords if the service worker dies mid-rotation.
      const storageUpdate: Record<string, unknown> = {};

      // Decrypt API key with cached password (if exists)
      const hasApiKey = await hasEncryptedApiKey();
      if (hasApiKey) {
        const apiKey = await loadDecryptedApiKey(currentPassword);
        if (!apiKey) {
          return { success: false, error: "Failed to decrypt API key" };
        }
        storageUpdate.encryptedApiKey = await encrypt(apiKey, newPassword);
      }

      // Re-encrypt the vault with new password (if exists)
      const hasVault = await hasVaultEntries();
      if (hasVault) {
        const newVault = await computeReEncryptedVault(currentPassword, newPassword);
        if (!newVault) {
          return { success: false, error: "Failed to re-encrypt vault" };
        }
        storageUpdate[VAULT_STORAGE_KEY] = newVault;
      }

      const hasMnemonicEntries = await hasMnemonics();
      if (hasMnemonicEntries) {
        const newMnemonicVault = await computeReEncryptedMnemonicVault(currentPassword, newPassword);
        if (!newMnemonicVault) {
          return { success: false, error: "Failed to re-encrypt mnemonic vault" };
        }
        storageUpdate.mnemonicVault = newMnemonicVault;
      }

      if (Object.keys(storageUpdate).length > 0) {
        await chrome.storage.local.set(storageUpdate);
      }
    }

    // SECURITY (C-1): Tear down ALL cached auth state and broadcast
    // walletLockedExternal so any open UI re-routes to the unlock screen.
    // The user must re-enter the new password.
    await clearAllAuthState();
    chrome.runtime.sendMessage({ type: "walletLockedExternal" }).catch(() => {});

    return { success: true };
  } catch (error) {
    console.error("[authHandlers]", error);
    return {
      success: false,
      error: "Failed to change password",
    };
  }
}
