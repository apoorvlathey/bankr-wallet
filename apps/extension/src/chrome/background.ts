/**
 * Background service worker - message router and Chrome event listeners
 *
 * All business logic has been extracted into focused modules:
 * - sessionCache.ts: Credential caching, session persistence, auto-lock
 * - authHandlers.ts: Wallet unlock, vault key system, password management
 * - txHandlers.ts: Transaction/signature requests, notifications
 * - chatHandlers.ts: Bankr AI chat prompt handling
 * - sidepanelManager.ts: Side panel detection and mode management
 */

import { encryptWithVaultKey } from "./crypto";
import {
  getAccounts,
  getAccountById,
  getActiveAccount,
  setActiveAccountId,
  getTabAccount,
  setTabAccount,
  addBankrAccount,
  addImpersonatorAccount,
  addSeedPhraseAccount,
  addSeedGroup,
  getSeedGroups,
  renameSeedGroup,
  updateSeedGroupCount,
  updateAccountDisplayName,
  findAccountByAddress,
  convertToSeedPhraseAccount,
} from "./accountStorage";
import type { SeedPhraseAccount } from "./types";
import { decryptAllKeys, addKeyToVault } from "./vaultCrypto";
import {
  generateNewMnemonic,
  isValidMnemonic,
  derivePrivateKey as deriveSeedPrivateKey,
} from "./seedPhraseUtils";
import { storeMnemonic, getMnemonic } from "./mnemonicStorage";
import { deriveAddress } from "./localSigner";
import { validateEIP712TypedData } from "./eip712Validator";
import {
  removePendingTxRequest,
  getPendingTxRequests,
  clearExpiredTxRequests,
  updateBadge,
} from "./pendingTxStorage";
import {
  removePendingSignatureRequest,
  getPendingSignatureRequests,
  clearExpiredSignatureRequests,
} from "./pendingSignatureStorage";
import {
  getTxHistory,
  getProcessingTxs,
  clearTxHistory,
  cleanupStaleProcessingTxs,
} from "./txHistoryStorage";
import {
  getConversations,
  getConversation,
  createConversation,
  deleteConversation,
  addMessageToConversation,
  updateMessageInConversation,
} from "./chatStorage";

// Session & cache management
import {
  AUTO_LOCK_STORAGE_KEY,
  updateCachedAutoLockTimeout,
  getCachedApiKey,
  setCachedApiKeyDirect,
  clearCachedApiKey,
  getCachedPassword,
  setCachedVault,
  clearCachedVault,
  getCachedVaultKey,
  getPasswordType,
  getAutoLockTimeout,
  setAutoLockTimeout,
  isApiKeyCached,
  isWalletUnlocked,
  getPrivateKeyFromCache,
  getCurrentSessionId,
  clearSessionStorage,
  tryRestoreSession,
  incrementUIConnections,
  decrementUIConnections,
} from "./sessionCache";

// Auth handlers
import {
  handleUnlockWallet,
  handleSetAgentPassword,
  handleRemoveAgentPassword,
  handleSaveApiKeyWithCachedPassword,
  handleChangePasswordWithCachedPassword,
} from "./authHandlers";

// Transaction handlers
import {
  failedTxResults,
  handleTransactionRequest,
  handleSignatureRequest,
  handleConfirmTransaction,
  handleRejectTransaction,
  handleCancelTransaction,
  handleConfirmTransactionAsync,
  handleConfirmTransactionAsyncPK,
  handleConfirmSignatureRequest,
  handleConfirmSignatureRequestBankr,
  handleAddPrivateKeyAccount,
  handleRemoveAccount,
  openPopupWindow,
  performSecurityReset,
  handleInitiateTransfer,
  handleExecuteSwapDirect,
  handleCancelProcessingTx,
  writeResultToStorage,
  SignatureResult,
} from "./txHandlers";

// Gas estimation
import { estimateGas } from "./gasEstimation";

// Chat handlers
import { handleSubmitChatPrompt } from "./chatHandlers";

// Swap API
import {
  fetchSwapPrice,
  fetchSwapQuote,
  fetchTokenInfo,
  fetchTokenPrice,
  getCachedTokenList,
  checkTokenAllowance,
} from "./swapApi";

// Sidepanel management
import {
  isSidePanelSupported,
  isSidePanelSupportedAsync,
  getSidePanelMode,
  setSidePanelMode,
  initSidePanel,
} from "./sidepanelManager";

// Handles RPC requests proxied from inpage script (to bypass page CSP)
async function handleRpcRequest(
  rpcUrl: string,
  method: string,
  params: any[],
): Promise<any> {
  // Validate URL protocol to prevent SSRF
  try {
    const url = new URL(rpcUrl);
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      throw new Error("Only HTTP(S) RPC URLs allowed");
    }
  } catch (e) {
    if (e instanceof Error && e.message === "Only HTTP(S) RPC URLs allowed")
      throw e;
    throw new Error("Invalid RPC URL");
  }

  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method,
      params,
    }),
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    throw new Error(`RPC request failed: ${response.status}`);
  }

  const data = await response.json();

  if (data.error) {
    throw new Error(data.error.message || "RPC error");
  }

  return data.result;
}

// ─── Security Helpers ────────────────────────────────────────────────────────

/**
 * Checks whether the message sender is an extension page (popup, sidepanel, onboarding)
 * as opposed to a content script running on a web page.
 * Content scripts have sender.url set to the web page URL, not the extension URL.
 */
function isExtensionPage(sender: chrome.runtime.MessageSender): boolean {
  return !!sender.url?.startsWith(`chrome-extension://${chrome.runtime.id}/`);
}

// ─── Chrome Event Listeners ──────────────────────────────────────────────────

// Listen for storage changes to update cached timeout and broadcast address changes
chrome.storage.onChanged.addListener(async (changes, areaName) => {
  if (areaName === "sync") {
    if (changes[AUTO_LOCK_STORAGE_KEY]) {
      updateCachedAutoLockTimeout(changes[AUTO_LOCK_STORAGE_KEY].newValue);
    }

    // Broadcast address changes to all tabs so dapps receive accountsChanged event
    if (changes.address) {
      const newAddress = changes.address.newValue;
      const newDisplayAddress = changes.displayAddress?.newValue || newAddress;

      if (newAddress) {
        // Get all tabs and send setAddress message
        const tabs = await chrome.tabs.query({});
        for (const tab of tabs) {
          if (
            tab.id &&
            tab.url &&
            !tab.url.startsWith("chrome://") &&
            !tab.url.startsWith("chrome-extension://")
          ) {
            chrome.tabs
              .sendMessage(tab.id, {
                type: "setAddress",
                msg: { address: newAddress, displayAddress: newDisplayAddress },
              })
              .catch(() => {
                // Ignore errors for tabs without content script
              });
          }
        }
      }
    }
  }
});

// Clear cache when service worker suspends
self.addEventListener("suspend", () => {
  clearCachedApiKey();
  clearCachedVault();
});

// Clean up expired transactions and signature requests periodically
setInterval(() => {
  clearExpiredTxRequests();
  clearExpiredSignatureRequests();
}, 60000); // Every minute

// Clean up stale result keys from storage (from previous service worker sessions)
chrome.storage.local.get(null).then((items) => {
  const staleKeys = Object.keys(items).filter((k) => {
    if (!k.startsWith("txResult:") && !k.startsWith("sigResult:") && !k.startsWith("rpcResult:")) return false;
    const entry = items[k];
    return entry?.timestamp && Date.now() - entry.timestamp > 30 * 60 * 1000;
  });
  if (staleKeys.length > 0) chrome.storage.local.remove(staleKeys);
});

// Initialize badge on startup
updateBadge();

// Initialize auto-lock timeout cache on startup
getAutoLockTimeout();

/**
 * Migrates legacy storage (v0.1.1/v0.2.0) to the multi-account system.
 *
 * Old versions stored only `address` in chrome.storage.sync and had no `accounts`
 * array.  Without this migration the popup enters an onboarding loop because
 * App.tsx requires at least one entry in the accounts array.
 *
 * Safe to call multiple times — exits early when accounts already exist.
 */
async function migrateFromLegacyStorage(): Promise<boolean> {
  try {
    // Already migrated?
    const { accounts } = await chrome.storage.local.get("accounts");
    if (Array.isArray(accounts) && accounts.length > 0) {
      return false;
    }

    // Must have legacy encrypted data to be a real returning user
    const { encryptedApiKey } =
      await chrome.storage.local.get("encryptedApiKey");
    if (!encryptedApiKey) {
      return false; // Fresh install — nothing to migrate
    }

    // Read legacy address
    const { address, displayAddress } = await chrome.storage.sync.get([
      "address",
      "displayAddress",
    ]);
    if (!address) {
      return false; // No address stored — cannot create account entry
    }

    // Build a BankrAccount entry matching the shape in types.ts
    const newAccount = {
      id: crypto.randomUUID(),
      type: "bankr" as const,
      address: (address as string).toLowerCase(),
      displayName:
        displayAddress && displayAddress !== address
          ? (displayAddress as string)
          : undefined,
      createdAt: Date.now(),
    };

    // Write accounts array + set this account as active (single atomic write per store)
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
}

// Handle extension install/update
chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === "install") {
    // First time install - open onboarding page
    const onboardingUrl = chrome.runtime.getURL("onboarding.html");
    await chrome.tabs.create({ url: onboardingUrl });
  } else if (details.reason === "update") {
    // Migrate from v0.1.1/v0.2.0 legacy storage to multi-account system
    await migrateFromLegacyStorage();
  }
});

// Initialize sidepanel behavior on startup
initSidePanel();

// Clean up txs stuck in "processing" (e.g. from a service worker restart mid-tx)
cleanupStaleProcessingTxs();

// Resume receipt polling for any txs stuck in "pending" status
import { resumePendingPollers, checkPendingTxReceipt as checkPendingTxReceiptFn } from "./txReceiptPoller";
import { clearAllNonces } from "./nonceManager";
resumePendingPollers();

// Handle extension icon click when popup is cleared (sidepanel mode)
// When sidepanel mode is active, setPopup('') causes onClicked to fire instead of opening a popup.
// We try sidePanel.open() and verify it actually opened. Some browsers (Arc) resolve the promise
// successfully but silently do nothing, so we check for a SIDE_PANEL context after a delay.
chrome.action.onClicked.addListener(async (tab) => {
  try {
    await chrome.sidePanel.open({ windowId: tab.windowId! });

    // Verify the sidepanel actually opened — some browsers (Arc) resolve the promise
    // successfully but render nothing. Check for a SIDE_PANEL context after a brief delay.
    await new Promise((r) => setTimeout(r, 600));

    let sidePanelActuallyOpen = false;
    if (chrome.runtime.getContexts) {
      const contexts = await chrome.runtime.getContexts({
        contextTypes: ["SIDE_PANEL" as chrome.runtime.ContextType],
      });
      sidePanelActuallyOpen = contexts.length > 0;
    } else {
      try {
        const response = await chrome.runtime.sendMessage({ type: "ping" });
        sidePanelActuallyOpen = response === "pong";
      } catch {
        sidePanelActuallyOpen = false;
      }
    }

    if (!sidePanelActuallyOpen) {
      // Self-heal: disable sidepanel mode and fall back to popup window
      await setSidePanelMode(false);
      await openPopupWindow();
    }
  } catch {
    // sidePanel.open() threw — disable sidepanel and fall back to popup
    await setSidePanelMode(false);
    await openPopupWindow();
  }
});

// Port connection listener - used for waking up the service worker and UI keepalive
chrome.runtime.onConnect.addListener((port) => {
  if (port.name === "popup-wake") {
    // Just acknowledge the connection - the popup is waking us up
    console.log("Service worker woken up by popup");
  } else if (port.name === "ui-keepalive") {
    // UI view (popup/sidepanel/onboarding) connected - pause auto-lock timer
    incrementUIConnections();
    port.onDisconnect.addListener(() => {
      decrementUIConnections();
    });
  }
});

// ─── Message Router ──────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case "sendTransaction": {
      const senderWindowId = sender.tab?.windowId;
      handleTransactionRequest(message, message.txId, senderWindowId);
      return false;
    }

    case "signatureRequest": {
      // Validate EIP-712 schema — write error to storage so content script picks it up
      const { signature } = message;
      if (
        signature.method === "eth_signTypedData_v3" ||
        signature.method === "eth_signTypedData_v4"
      ) {
        const validationResult = validateEIP712TypedData(
          signature.method,
          signature.params[1],
        );

        if (!validationResult.valid) {
          console.warn(
            `[WalletChan] EIP-712 validation failed for ${message.origin}:`,
            validationResult.error,
          );
          writeResultToStorage(`sigResult:${message.sigId}`, {
            success: false,
            error: "Data must conform to EIP-712 schema",
          });
          return false;
        }
      }

      const senderWindowId = sender.tab?.windowId;
      handleSignatureRequest(message, message.sigId, senderWindowId);
      return false;
    }

    case "getPendingSignatureRequests": {
      getPendingSignatureRequests().then((requests) => {
        sendResponse(requests);
      });
      return true;
    }

    case "rejectSignatureRequest": {
      const result: SignatureResult = {
        success: false,
        error: "Signature request cancelled by user",
      };
      removePendingSignatureRequest(message.sigId).then(async () => {
        await writeResultToStorage(`sigResult:${message.sigId}`, result);
        sendResponse(result);
      });
      return true;
    }

    case "getPendingTxRequests": {
      getPendingTxRequests().then((requests) => {
        sendResponse(requests);
      });
      return true;
    }

    case "getPendingTransaction": {
      (async () => {
        const { getPendingTxRequestById } = await import("./pendingTxStorage");
        const request = await getPendingTxRequestById(message.txId);
        if (request) {
          sendResponse({
            tx: request.tx,
            origin: request.origin,
            chainName: request.chainName,
            favicon: request.favicon,
          });
        } else {
          sendResponse(null);
        }
      })();
      return true;
    }

    case "isApiKeyCached": {
      sendResponse(isApiKeyCached());
      return false;
    }

    case "confirmTransaction": {
      handleConfirmTransaction(message.txId, message.password).then(
        async (result) => {
          await removePendingTxRequest(message.txId);
          await writeResultToStorage(`txResult:${message.txId}`, result);
          sendResponse(result);
        },
      );
      return true;
    }

    case "rejectTransaction": {
      const result = handleRejectTransaction(message.txId);
      removePendingTxRequest(message.txId).then(async () => {
        await writeResultToStorage(`txResult:${message.txId}`, result);
        sendResponse(result);
      });
      return true;
    }

    case "cancelTransaction": {
      handleCancelTransaction(message.txId).then((result) => {
        sendResponse(result);
      });
      return true;
    }

    case "clearApiKeyCache": {
      clearCachedApiKey();
      sendResponse({ success: true });
      return false;
    }

    case "unlockWallet": {
      handleUnlockWallet(message.password).then((result) => {
        sendResponse(result);
      });
      return true;
    }

    case "lockWallet": {
      clearCachedApiKey();
      clearCachedVault();
      clearSessionStorage();
      sendResponse({ success: true });
      return false;
    }

    // Account management handlers
    case "getAccounts": {
      getAccounts().then((accounts) => {
        sendResponse(accounts);
      });
      return true;
    }

    case "getActiveAccount": {
      getActiveAccount().then((account) => {
        sendResponse(account);
      });
      return true;
    }

    case "setActiveAccount": {
      (async () => {
        await setActiveAccountId(message.accountId);
        const account = await getAccountById(message.accountId);
        if (account) {
          await chrome.storage.sync.set({
            address: account.address,
            displayAddress: account.displayName || account.address,
          });
        }
        chrome.runtime.sendMessage({ type: "accountsUpdated" }).catch(() => {});
        sendResponse({ success: true });
      })();
      return true;
    }

    case "getTabAccount": {
      const tabId = message.tabId || sender.tab?.id;
      if (tabId) {
        getTabAccount(tabId).then((account) => {
          sendResponse(account);
        });
      } else {
        getActiveAccount().then((account) => {
          sendResponse(account);
        });
      }
      return true;
    }

    case "setTabAccount": {
      const tabId = message.tabId || sender.tab?.id;
      if (tabId) {
        setTabAccount(tabId, message.accountId).then(() => {
          sendResponse({ success: true });
        });
      } else {
        sendResponse({ success: false, error: "No tab ID" });
      }
      return true;
    }

    case "migrateFromLegacy": {
      // Only extension pages (popup / sidepanel) may trigger migration
      if (!isExtensionPage(sender)) {
        sendResponse({ migrated: false });
        return false;
      }
      migrateFromLegacyStorage().then((migrated) => {
        sendResponse({ migrated });
      });
      return true;
    }

    case "addBankrAccount": {
      (async () => {
        try {
          // SECURITY: Block API key changes when unlocked with agent password
          if (message.apiKey && getPasswordType() === "agent") {
            sendResponse({
              success: false,
              error: "Adding accounts with API keys requires master password",
            });
            return;
          }

          // If apiKey is provided and wallet is unlocked, save it first
          if (message.apiKey) {
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

            if (password) {
              const vaultKey = getCachedVaultKey();
              if (vaultKey) {
                const encrypted = await encryptWithVaultKey(
                  vaultKey,
                  message.apiKey,
                );
                await chrome.storage.local.set({
                  encryptedApiKeyVault: encrypted,
                });
              } else {
                const { saveEncryptedApiKey } = await import("./crypto");
                await saveEncryptedApiKey(message.apiKey, password);
              }
              setCachedApiKeyDirect(message.apiKey);
            }
          }

          const account = await addBankrAccount(
            message.address,
            message.displayName,
          );
          chrome.runtime
            .sendMessage({ type: "accountsUpdated" })
            .catch(() => {});
          sendResponse({ success: true, account });
        } catch (error) {
          sendResponse({
            success: false,
            error:
              error instanceof Error ? error.message : "Failed to add account",
          });
        }
      })();
      return true;
    }

    case "addImpersonatorAccount": {
      // SECURITY: Block when unlocked with agent password
      if (getPasswordType() === "agent") {
        sendResponse({
          success: false,
          error: "Adding accounts requires master password",
        });
        return false;
      }
      (async () => {
        try {
          const account = await addImpersonatorAccount(
            message.address,
            message.displayName,
          );
          chrome.runtime
            .sendMessage({ type: "accountsUpdated" })
            .catch(() => {});
          sendResponse({ success: true, account });
        } catch (error) {
          sendResponse({
            success: false,
            error:
              error instanceof Error ? error.message : "Failed to add account",
          });
        }
      })();
      return true;
    }

    case "generateMnemonic": {
      // SECURITY: Only extension pages can generate mnemonics
      if (!isExtensionPage(sender)) {
        sendResponse({ success: false, error: "Unauthorized" });
        return false;
      }
      const mnemonic = generateNewMnemonic();
      sendResponse({ success: true, mnemonic });
      return false;
    }

    case "addSeedPhraseGroup": {
      // SECURITY: Block when unlocked with agent password
      if (getPasswordType() === "agent") {
        sendResponse({
          success: false,
          error: "Adding seed phrases requires master password",
        });
        return false;
      }
      (async () => {
        try {
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
            sendResponse({ success: false, error: "Wallet must be unlocked" });
            return;
          }

          // Generate or validate mnemonic
          let mnemonic: string;
          if (message.mnemonic) {
            if (!isValidMnemonic(message.mnemonic)) {
              sendResponse({
                success: false,
                error: "Invalid seed phrase (must be 12 words)",
              });
              return;
            }
            mnemonic = message.mnemonic.trim();
          } else {
            mnemonic = generateNewMnemonic();
          }

          // Create seed group
          const group = await addSeedGroup(message.name);

          // Encrypt and store mnemonic
          await storeMnemonic(group.id, mnemonic, password);

          // Derive first account (index 0)
          const privateKey = deriveSeedPrivateKey(mnemonic, 0);
          const address = deriveAddress(privateKey);

          // Check if address already exists (PK → seed phrase conversion)
          const existingAccount = await findAccountByAddress(address);
          let account: SeedPhraseAccount;

          if (existingAccount) {
            if (existingAccount.type === "privateKey") {
              // Convert PK account to seed phrase in-place (preserves ID, display name, vault entry)
              const converted = await convertToSeedPhraseAccount(
                existingAccount.id,
                group.id,
                0,
              );
              if (!converted) throw new Error("Failed to convert account");
              account = converted;
              // Skip addKeyToVault — vault already has the key under this account ID
            } else {
              throw new Error("An account with this address already exists");
            }
          } else {
            account = await addSeedPhraseAccount(
              address,
              group.id,
              0,
              message.accountDisplayName || undefined,
            );
            // Store derived PK in vault using account UUID (matches vault lookup)
            await addKeyToVault(account.id, privateKey, password);
          }

          await updateSeedGroupCount(group.id, 1);

          // Update cached vault
          const vault = await decryptAllKeys(password);
          if (vault) setCachedVault(vault);

          chrome.runtime
            .sendMessage({ type: "accountsUpdated" })
            .catch(() => {});
          sendResponse({
            success: true,
            account,
            group,
            mnemonic: message.mnemonic ? undefined : mnemonic, // Only return if generated
          });
        } catch (error) {
          sendResponse({
            success: false,
            error:
              error instanceof Error
                ? error.message
                : "Failed to create seed phrase",
          });
        }
      })();
      return true;
    }

    case "deriveSeedAccount": {
      // SECURITY: Block when unlocked with agent password
      if (getPasswordType() === "agent") {
        sendResponse({
          success: false,
          error: "Deriving accounts requires master password",
        });
        return false;
      }
      (async () => {
        try {
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
            sendResponse({ success: false, error: "Wallet must be unlocked" });
            return;
          }

          const { seedGroupId } = message;
          const mnemonic = await getMnemonic(seedGroupId, password);
          if (!mnemonic) {
            sendResponse({
              success: false,
              error: "Seed phrase not found or wrong password",
            });
            return;
          }

          // Find next index
          const accounts = await getAccounts();
          const groupAccounts = accounts.filter(
            (a) =>
              a.type === "seedPhrase" && (a as any).seedGroupId === seedGroupId,
          );
          const nextIndex =
            groupAccounts.length > 0
              ? Math.max(
                  ...groupAccounts.map((a) => (a as any).derivationIndex),
                ) + 1
              : 0;

          // Derive key
          const privateKey = deriveSeedPrivateKey(mnemonic, nextIndex);
          const address = deriveAddress(privateKey);

          // Check if address already exists (PK → seed phrase conversion)
          const existingAccount = await findAccountByAddress(address);
          let account: SeedPhraseAccount;

          if (existingAccount) {
            if (existingAccount.type === "privateKey") {
              // Convert PK account to seed phrase in-place (preserves ID, display name, vault entry)
              const converted = await convertToSeedPhraseAccount(
                existingAccount.id,
                seedGroupId,
                nextIndex,
              );
              if (!converted) throw new Error("Failed to convert account");
              account = converted;
              // Skip addKeyToVault — vault already has the key under this account ID
            } else {
              throw new Error("An account with this address already exists");
            }
          } else {
            account = await addSeedPhraseAccount(
              address,
              seedGroupId,
              nextIndex,
              message.displayName || undefined,
            );
            // Store in vault using account UUID (matches vault lookup)
            await addKeyToVault(account.id, privateKey, password);
          }

          await updateSeedGroupCount(seedGroupId, groupAccounts.length + 1);

          // Update cached vault
          const vault = await decryptAllKeys(password);
          if (vault) setCachedVault(vault);

          chrome.runtime
            .sendMessage({ type: "accountsUpdated" })
            .catch(() => {});
          sendResponse({ success: true, account });
        } catch (error) {
          sendResponse({
            success: false,
            error:
              error instanceof Error
                ? error.message
                : "Failed to derive account",
          });
        }
      })();
      return true;
    }

    case "revealSeedPhrase": {
      // SECURITY: Only extension pages can reveal seed phrases
      if (!isExtensionPage(sender)) {
        sendResponse({ success: false, error: "Unauthorized" });
        return true;
      }
      (async () => {
        try {
          const { seedGroupId, password } = message;

          if (!getCachedPassword()) {
            const autoLockTimeout = await getAutoLockTimeout();
            if (autoLockTimeout === 0) {
              await tryRestoreSession(handleUnlockWallet);
            }
          }

          const cachedPwd = getCachedPassword();
          if (!cachedPwd) {
            sendResponse({ success: false, error: "Wallet is locked" });
            return;
          }

          // SECURITY: Block when unlocked with agent password
          if (getPasswordType() === "agent") {
            sendResponse({
              success: false,
              error: "Seed phrase reveal requires master password",
              requiresMasterPassword: true,
            });
            return;
          }

          if (password !== cachedPwd) {
            sendResponse({ success: false, error: "Invalid password" });
            return;
          }

          const mnemonic = await getMnemonic(seedGroupId, cachedPwd);
          if (!mnemonic) {
            sendResponse({ success: false, error: "Seed phrase not found" });
            return;
          }

          sendResponse({ success: true, mnemonic });
        } catch (error) {
          sendResponse({
            success: false,
            error:
              error instanceof Error
                ? error.message
                : "Failed to reveal seed phrase",
          });
        }
      })();
      return true;
    }

    case "getSeedGroups": {
      getSeedGroups().then((groups) => {
        sendResponse(groups);
      });
      return true;
    }

    case "renameSeedGroup": {
      const newName = (typeof message.name === "string" ? message.name : "")
        .trim()
        .slice(0, 100);
      if (!message.seedGroupId || !newName) {
        sendResponse({ success: false, error: "Missing seedGroupId or name" });
        return true;
      }
      renameSeedGroup(message.seedGroupId, newName)
        .then(() => {
          chrome.runtime
            .sendMessage({ type: "accountsUpdated" })
            .catch(() => {});
          sendResponse({ success: true });
        })
        .catch((error) => {
          sendResponse({
            success: false,
            error: error instanceof Error ? error.message : "Failed to rename",
          });
        });
      return true;
    }

    case "updateAccountDisplayName": {
      const displayName =
        typeof message.displayName === "string"
          ? message.displayName.slice(0, 100)
          : "";
      updateAccountDisplayName(message.accountId, displayName)
        .then(() => {
          chrome.runtime
            .sendMessage({ type: "accountsUpdated" })
            .catch(() => {});
          sendResponse({ success: true });
        })
        .catch((error) => {
          sendResponse({
            success: false,
            error: error instanceof Error ? error.message : "Failed to update",
          });
        });
      return true;
    }

    case "addPrivateKeyAccount": {
      (async () => {
        // SECURITY: Block adding accounts when unlocked with agent password
        if (getPasswordType() === "agent") {
          sendResponse({
            success: false,
            error: "Adding accounts requires master password",
          });
          return;
        }

        let password = message.password || getCachedPassword();

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
          sendResponse({ success: false, error: "Wallet is locked" });
          return;
        }

        const result = await handleAddPrivateKeyAccount(
          message.privateKey,
          password,
          message.displayName,
        );
        sendResponse(result);
      })();
      return true;
    }

    case "removeAccount": {
      // SECURITY: Block account removal when unlocked with agent password
      if (getPasswordType() === "agent") {
        sendResponse({
          success: false,
          error: "Account removal requires master password",
        });
        return false;
      }
      handleRemoveAccount(message.accountId).then((result) => {
        sendResponse(result);
      });
      return true;
    }

    case "revealPrivateKey": {
      // SECURITY: Only extension pages can reveal private keys
      if (!isExtensionPage(sender)) {
        sendResponse({ success: false, error: "Unauthorized" });
        return true;
      }
      (async () => {
        try {
          const { accountId, password } = message;

          if (!getCachedPassword()) {
            const autoLockTimeout = await getAutoLockTimeout();
            if (autoLockTimeout === 0) {
              await tryRestoreSession(handleUnlockWallet);
            }
          }

          const cachedPwd = getCachedPassword();
          if (!cachedPwd) {
            sendResponse({ success: false, error: "Wallet is locked" });
            return;
          }

          // SECURITY: Block private key reveal when unlocked with agent password
          if (getPasswordType() === "agent") {
            sendResponse({
              success: false,
              error: "Private key reveal requires master password",
              requiresMasterPassword: true,
            });
            return;
          }

          if (password !== cachedPwd) {
            sendResponse({ success: false, error: "Invalid password" });
            return;
          }

          // Try cached vault first
          let privateKey = getPrivateKeyFromCache(accountId);
          if (!privateKey) {
            const vault = await decryptAllKeys(cachedPwd);
            if (!vault) {
              sendResponse({
                success: false,
                error: "Failed to decrypt vault",
              });
              return;
            }
            setCachedVault(vault);
            privateKey = getPrivateKeyFromCache(accountId);
          }
          if (!privateKey) {
            sendResponse({
              success: false,
              error: "Private key not found for this account",
            });
            return;
          }
          sendResponse({ success: true, privateKey });
        } catch (error) {
          sendResponse({
            success: false,
            error:
              error instanceof Error
                ? error.message
                : "Failed to reveal private key",
          });
        }
      })();
      return true;
    }

    case "confirmSignatureRequest": {
      const tabId = message.tabId || sender.tab?.id;
      (async () => {
        // Determine account type to route to correct handler
        const account = tabId
          ? await getTabAccount(tabId)
          : await getActiveAccount();
        let result: SignatureResult;
        if (account?.type === "bankr") {
          result = await handleConfirmSignatureRequestBankr(
            message.sigId,
            message.password,
          );
        } else {
          result = await handleConfirmSignatureRequest(
            message.sigId,
            message.password,
            tabId,
          );
        }
        await writeResultToStorage(`sigResult:${message.sigId}`, result);
        sendResponse(result);
      })();
      return true;
    }

    case "estimateGas": {
      estimateGas(message.tx, message.accountAddress).then(sendResponse);
      return true;
    }

    case "confirmTransactionAsyncPK": {
      const tabId = message.tabId || sender.tab?.id;
      handleConfirmTransactionAsyncPK(
        message.txId,
        message.password,
        tabId,
        message.functionName,
        message.gasOverrides,
      ).then((result) => {
        sendResponse(result);
      });
      return true;
    }

    case "isWalletUnlocked": {
      (async () => {
        let unlocked = isWalletUnlocked();
        if (!unlocked) {
          const autoLockTimeout = await getAutoLockTimeout();
          if (autoLockTimeout === 0) {
            const restored = await tryRestoreSession(handleUnlockWallet);
            if (restored) {
              unlocked = true;
            }
          }
        }
        sendResponse(unlocked);
      })();
      return true;
    }

    case "validateSession": {
      sendResponse({
        valid: getCurrentSessionId() !== null && isWalletUnlocked(),
        sessionId: getCurrentSessionId(),
      });
      return false;
    }

    case "tryRestoreSession": {
      tryRestoreSession(handleUnlockWallet).then((restored) => {
        sendResponse(restored);
      });
      return true;
    }

    case "saveApiKeyWithCachedPassword": {
      handleSaveApiKeyWithCachedPassword(message.apiKey).then((result) => {
        sendResponse(result);
      });
      return true;
    }

    case "getCachedPassword": {
      (async () => {
        let hasCached = getCachedPassword() !== null;

        // If no cached password, try session restoration (for "Never" auto-lock mode)
        if (!hasCached) {
          const autoLockTimeout = await getAutoLockTimeout();
          if (autoLockTimeout === 0) {
            const restored = await tryRestoreSession(handleUnlockWallet);
            if (restored) {
              hasCached = getCachedPassword() !== null;
            }
          }
        }

        sendResponse({ hasCachedPassword: hasCached });
      })();
      return true;
    }

    case "changePasswordWithCachedPassword": {
      handleChangePasswordWithCachedPassword(message.newPassword).then(
        (result) => {
          sendResponse(result);
        },
      );
      return true;
    }

    case "getCachedApiKey": {
      // SECURITY: Only extension pages can access the API key
      if (!isExtensionPage(sender)) {
        sendResponse({ apiKey: null });
        return true;
      }
      (async () => {
        let apiKey = getCachedApiKey();
        if (!apiKey) {
          const autoLockTimeout = await getAutoLockTimeout();
          if (autoLockTimeout === 0) {
            const restored = await tryRestoreSession(handleUnlockWallet);
            if (restored) {
              apiKey = getCachedApiKey();
            }
          }
        }
        sendResponse({ apiKey: apiKey || null });
      })();
      return true;
    }

    case "setAgentPassword": {
      handleSetAgentPassword(message.agentPassword).then((result) => {
        sendResponse(result);
      });
      return true;
    }

    case "removeAgentPassword": {
      handleRemoveAgentPassword(message.masterPassword).then((result) => {
        sendResponse(result);
      });
      return true;
    }

    case "isAgentPasswordEnabled": {
      (async () => {
        const { agentPasswordEnabled } = await chrome.storage.local.get(
          "agentPasswordEnabled",
        );
        sendResponse({ enabled: !!agentPasswordEnabled });
      })();
      return true;
    }

    case "getPasswordType": {
      sendResponse({ passwordType: getPasswordType() });
      return false;
    }

    case "rpcRequest": {
      const rpcResultKey = `rpcResult:${message.rpcId}`;
      handleRpcRequest(message.rpcUrl, message.method, message.params)
        .then((result) => writeResultToStorage(rpcResultKey, { result }))
        .catch((error) => writeResultToStorage(rpcResultKey, { error: error.message }));
      return false;
    }

    case "setArcBrowser": {
      if (message.isArc) {
        chrome.storage.sync.set({
          sidePanelMode: false,
          isArcBrowser: true,
        });
        // Restore native popup so clicks work on Arc
        chrome.action.setPopup({ popup: "popup-init.html" }).catch(() => {});
      }
      sendResponse({ success: true });
      return false;
    }

    case "isSidePanelSupported": {
      isSidePanelSupportedAsync().then((supported) => {
        sendResponse({ supported });
      });
      return true;
    }

    case "getSidePanelMode": {
      getSidePanelMode().then((enabled) => {
        sendResponse({ enabled });
      });
      return true;
    }

    case "setSidePanelMode": {
      setSidePanelMode(message.enabled).then((success) => {
        sendResponse({ success, sidePanelWorks: success || !message.enabled });
      });
      return true;
    }

    case "getAutoLockTimeout": {
      getAutoLockTimeout().then((timeout) => {
        sendResponse({ timeout });
      });
      return true;
    }

    case "setAutoLockTimeout": {
      setAutoLockTimeout(message.timeout).then((success) => {
        sendResponse({ success });
      });
      return true;
    }

    case "openPopupWindow": {
      openPopupWindow().then(() => {
        sendResponse({ success: true });
      });
      return true;
    }

    case "confirmTransactionAsync": {
      handleConfirmTransactionAsync(
        message.txId,
        message.password,
        message.functionName,
      ).then((result) => {
        sendResponse(result);
      });
      return true;
    }

    case "initiateTransfer": {
      handleInitiateTransfer(message).then((result) => {
        sendResponse(result);
      });
      return true;
    }

    case "fetchSwapPrice": {
      fetchSwapPrice({
        chainId: message.chainId,
        sellToken: message.sellToken,
        buyToken: message.buyToken,
        sellAmount: message.sellAmount,
        taker: message.taker,
        slippageBps: message.slippageBps,
      })
        .then((data) => sendResponse({ success: true, data }))
        .catch((err) =>
          sendResponse({ success: false, error: err.message }),
        );
      return true;
    }

    case "fetchSwapQuote": {
      fetchSwapQuote({
        chainId: message.chainId,
        sellToken: message.sellToken,
        buyToken: message.buyToken,
        sellAmount: message.sellAmount,
        taker: message.taker,
        slippageBps: message.slippageBps,
      })
        .then((data) => sendResponse({ success: true, data }))
        .catch((err) =>
          sendResponse({ success: false, error: err.message }),
        );
      return true;
    }

    case "fetchTokenInfo": {
      fetchTokenInfo(message.tokenAddress, message.chainId)
        .then((data) => sendResponse({ success: true, data }))
        .catch((err) =>
          sendResponse({ success: false, error: err.message }),
        );
      return true;
    }

    case "fetchTokenPrice": {
      fetchTokenPrice(message.chainId, message.address)
        .then((priceUsd) =>
          sendResponse({ success: true, priceUsd }),
        )
        .catch((err) =>
          sendResponse({ success: false, error: err.message }),
        );
      return true;
    }

    case "fetchSwapTokenList": {
      getCachedTokenList(message.chainId)
        .then((data) => sendResponse({ success: true, data }))
        .catch((err) =>
          sendResponse({ success: false, error: err.message }),
        );
      return true;
    }

    case "checkTokenAllowance": {
      checkTokenAllowance(
        message.tokenAddress,
        message.owner,
        message.spender,
        message.chainId,
      )
        .then((allowance) =>
          sendResponse({ success: true, allowance: allowance.toString() }),
        )
        .catch((err) =>
          sendResponse({ success: false, error: err.message }),
        );
      return true;
    }

    case "executeSwapDirect": {
      handleExecuteSwapDirect(
        message.transactions,
        message.chainName,
      ).then((result) => {
        sendResponse(result);
      });
      return true;
    }

    case "cancelProcessingTx": {
      handleCancelProcessingTx(message.txId).then((result) => {
        sendResponse(result);
      });
      return true;
    }

    case "getFailedTxResult": {
      const result = failedTxResults.get(message.notificationId);
      if (result) {
        failedTxResults.delete(message.notificationId);
        chrome.storage.local.remove(`notification-${message.notificationId}`);
      }
      sendResponse(result || null);
      return false;
    }

    case "clearFailedTxResult": {
      failedTxResults.delete(message.notificationId);
      chrome.storage.local.remove(`notification-${message.notificationId}`);
      sendResponse({ success: true });
      return false;
    }

    case "onboardingComplete": {
      chrome.runtime
        .sendMessage({ type: "onboardingComplete" })
        .catch(() => {});
      sendResponse({ success: true });
      return false;
    }

    case "getTxHistory": {
      getTxHistory().then((history) => {
        sendResponse(history);
      });
      return true;
    }

    case "getProcessingTxs": {
      getProcessingTxs().then((txs) => {
        sendResponse(txs);
      });
      return true;
    }

    case "clearTxHistory": {
      clearTxHistory().then(() => {
        sendResponse({ success: true });
      });
      return true;
    }

    case "clearNonceCache": {
      clearAllNonces();
      sendResponse({ success: true });
      return false;
    }

    case "checkPendingTxReceipt": {
      checkPendingTxReceiptFn(
        message.txId,
        message.txHash,
        message.chainId,
      ).then((result) => {
        sendResponse({ status: result });
      });
      return true;
    }

    case "resetExtension": {
      // SECURITY: Block extension reset when unlocked with agent password
      if (getPasswordType() === "agent") {
        sendResponse({
          success: false,
          error: "Extension reset requires master password",
        });
        return false;
      }

      // SECURITY: Perform full memory cleanup first (before async operations)
      clearCachedApiKey();
      clearCachedVault();

      (async () => {
        await performSecurityReset();
        try {
          const allLocalStorage = await chrome.storage.local.get(null);
          const notificationKeys = Object.keys(allLocalStorage).filter((key) =>
            key.startsWith("notification-"),
          );

          await Promise.all([
            chrome.storage.local.remove([
              "encryptedApiKey",
              "encryptedApiKeyVault",
              "encryptedVaultKeyMaster",
              "encryptedVaultKeyAgent",
              "agentPasswordEnabled",
              "txHistory",
              "pendingTxRequests",
              "pendingSignatureRequests",
              "chatHistory",
              "pkVault",
              "mnemonicVault",
              "seedGroups",
              "accounts",
              "portfolioSnapshots",
              "ensIdentityCache",
              ...notificationKeys,
            ]),
            chrome.storage.sync.remove([
              "address",
              "displayAddress",
              "networksInfo",
              "chainName",
              "autoLockTimeout",
              "isArcBrowser",
              "hidePortfolioValue",
              "sidePanelVerified",
              "sidePanelMode",
              "activeAccountId",
              "tabAccounts",
            ]),
            clearSessionStorage(),
          ]);

          await chrome.action.setBadgeText({ text: "" });

          const notifications = await chrome.notifications.getAll();
          for (const notificationId of Object.keys(notifications)) {
            chrome.notifications.clear(notificationId);
          }

          sendResponse({ success: true });
        } catch (error) {
          console.error("Failed to reset extension:", error);
          sendResponse({ success: false, error: "Failed to reset extension" });
        }
      })();
      return true;
    }

    // Chat message handlers
    case "submitChatPrompt": {
      handleSubmitChatPrompt(
        message.conversationId,
        message.messageId,
        message.prompt,
      ).then((result) => {
        sendResponse(result);
      });
      return true;
    }

    case "getChatConversations": {
      getConversations().then((conversations) => {
        sendResponse(conversations);
      });
      return true;
    }

    case "getChatConversation": {
      getConversation(message.conversationId).then((conversation) => {
        sendResponse(conversation);
      });
      return true;
    }

    case "createChatConversation": {
      createConversation(message.title).then((conversation) => {
        sendResponse(conversation);
      });
      return true;
    }

    case "deleteChatConversation": {
      deleteConversation(message.conversationId).then(() => {
        sendResponse({ success: true });
      });
      return true;
    }

    case "addChatMessage": {
      addMessageToConversation(message.conversationId, message.message).then(
        (conversation) => {
          sendResponse(conversation);
        },
      );
      return true;
    }

    case "updateChatMessage": {
      updateMessageInConversation(
        message.conversationId,
        message.messageId,
        message.updates,
      ).then((conversation) => {
        sendResponse(conversation);
      });
      return true;
    }

    default: {
      if (message.type && typeof message.type === "string") {
        console.warn(`[WalletChan] Unknown message type: ${message.type}`);
      }
      break;
    }
  }

  return false;
});

// Handle notification clicks
chrome.notifications.onClicked.addListener(async (notificationId) => {
  const storageKey = `notification-${notificationId}`;
  const data = await chrome.storage.local.get([storageKey]);
  const notificationData = data[storageKey];

  if (notificationData) {
    if (typeof notificationData === "string") {
      chrome.tabs.create({ url: notificationData });
      chrome.storage.local.remove(storageKey);
    } else if (notificationData.type === "error") {
      const useSidePanel = await getSidePanelMode();

      if (useSidePanel && isSidePanelSupported()) {
        const popupUrl = chrome.runtime.getURL(
          `index.html?showError=${notificationData.txId}`,
        );
        await chrome.windows.create({
          url: popupUrl,
          type: "popup",
          width: 360,
          height: 680,
          focused: true,
        });
      } else {
        const popupUrl = chrome.runtime.getURL(
          `index.html?showError=${notificationData.txId}`,
        );
        await chrome.windows.create({
          url: popupUrl,
          type: "popup",
          width: 360,
          height: 680,
          focused: true,
        });
      }
    }
  }

  chrome.notifications.clear(notificationId);
});

// Export for module
export {};
