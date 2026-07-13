import assert from "node:assert/strict";
import test from "node:test";

import {
  BACKGROUND_BANKR_CREDENTIAL_MESSAGE_TYPES,
  createBackgroundBankrCredentialMessageRouter,
  type BackgroundBankrCredentialDependencies,
} from "../../src/chrome/background/bankrCredentialRouter";

const trustedSender = { id: "extension-id" } as chrome.runtime.MessageSender;
const untrustedSender = {
  id: "extension-id",
  tab: { id: 7 },
} as chrome.runtime.MessageSender;

function createDependencies(
  overrides: Partial<BackgroundBankrCredentialDependencies> = {},
): BackgroundBankrCredentialDependencies {
  return {
    isTrustedWalletUiSender: () => true,
    validateBankrAccountAddressUpdate: async () => {},
    prepareApiKeyUpdateWithCachedPassword: async (apiKey) => ({
      success: true,
      apiKey,
      storageUpdate: { encryptedApiKeyVault: "ciphertext" },
      expectedAuthEpoch: "epoch-1",
    }),
    verifyBankrCredentialAddress: async () => {},
    withWalletSecretLock: async (work) => work(),
    assertCurrentMasterAuthorization: () => {},
    updateBankrAccountAddressWithCredentialUpdate: async (_id, address) => ({
      id: "bankr-1",
      address,
      displayName: "Bankr",
    }),
    commitPreparedApiKeyUpdate: () => {},
    getActiveAccount: async () => ({ id: "bankr-1" }),
    setSyncStorage: async () => {},
    getTabAccounts: async () => ({}),
    sendAccountToTab: async () => {},
    sendRuntimeMessage: async () => undefined,
    getCachedApiKey: () => "cached-api-key",
    getAutoLockTimeout: async () => 60_000,
    tryRestoreSession: async () => false,
    handleUnlockWallet: async () => ({ success: true }),
    getPasswordType: () => "master",
    warn: () => {},
    ...overrides,
  };
}

function dispatch(
  dependencies: BackgroundBankrCredentialDependencies,
  message: Record<string, unknown>,
  sender = trustedSender,
): Promise<{ response: any; route: any }> {
  return new Promise((resolve) => {
    const router = createBackgroundBankrCredentialMessageRouter(dependencies);
    let route: any;
    route = router(message, sender, (response) => {
      queueMicrotask(() => resolve({ response, route }));
    });
  });
}

test("Bankr credential transport declares one unique route set", () => {
  assert.equal(
    new Set(BACKGROUND_BANKR_CREDENTIAL_MESSAGE_TYPES).size,
    BACKGROUND_BANKR_CREDENTIAL_MESSAGE_TYPES.length,
  );
});

test("credential proof, auth epoch, and atomic storage precede cache publication", async () => {
  const events: string[] = [];
  const dependencies = createDependencies({
    validateBankrAccountAddressUpdate: async () => {
      events.push("validate");
    },
    prepareApiKeyUpdateWithCachedPassword: async (apiKey) => {
      events.push(`prepare:${apiKey}`);
      return {
        success: true,
        apiKey,
        storageUpdate: { encryptedApiKeyVault: "ciphertext" },
        expectedAuthEpoch: "epoch-prepared",
      };
    },
    verifyBankrCredentialAddress: async (apiKey, address) => {
      events.push(`verify:${apiKey}:${address}`);
    },
    withWalletSecretLock: async (work) => {
      events.push("lock:start");
      const result = await work();
      events.push("lock:end");
      return result;
    },
    assertCurrentMasterAuthorization: (epoch) => {
      events.push(`auth:${epoch}`);
    },
    updateBankrAccountAddressWithCredentialUpdate: async (
      accountId,
      address,
      storageUpdate,
      epoch,
    ) => {
      events.push(
        `storage:${accountId}:${address}:${storageUpdate.encryptedApiKeyVault}:${epoch}`,
      );
      return { id: accountId, address, displayName: "Primary" };
    },
    commitPreparedApiKeyUpdate: () => events.push("cache"),
    getActiveAccount: async () => ({ id: "bankr-1" }),
    setSyncStorage: async (values) => {
      events.push(`mirror:${JSON.stringify(values)}`);
    },
    getTabAccounts: async () => ({ "8": "other", "9": "bankr-1" }),
    sendAccountToTab: async (tabId) => {
      events.push(`tab:${tabId}`);
    },
    sendRuntimeMessage: async () => {
      events.push("runtime");
    },
  });

  const { response, route } = await dispatch(dependencies, {
    type: "saveBankrApiKeyAndAddress",
    accountId: "bankr-1",
    apiKey: "  new-key  ",
    address: "  0xabc  ",
  });
  assert.deepEqual(route, { handled: true, keepChannelOpen: true });
  assert.deepEqual(response, {
    success: true,
    account: { id: "bankr-1", address: "0xabc", displayName: "Primary" },
  });
  assert.deepEqual(events, [
    "validate",
    "prepare:new-key",
    "verify:new-key:0xabc",
    "lock:start",
    "auth:epoch-prepared",
    "storage:bankr-1:0xabc:ciphertext:epoch-prepared",
    "cache",
    "lock:end",
    'mirror:{"address":"0xabc","displayAddress":"Primary"}',
    "tab:9",
    "runtime",
  ]);
});

test("post-commit mirrors and notifications remain best effort", async () => {
  const warnings: string[] = [];
  const { response } = await dispatch(
    createDependencies({
      getActiveAccount: async () => {
        throw new Error("mirror failed");
      },
      getTabAccounts: async () => {
        throw new Error("tabs failed");
      },
      sendRuntimeMessage: async () => {
        throw new Error("closed UI");
      },
      warn: (message) => warnings.push(message),
    }),
    {
      type: "saveBankrApiKeyAndAddress",
      accountId: "bankr-1",
      apiKey: "new-key",
      address: "0xabc",
    },
  );
  assert.equal(response.success, true);
  assert.equal(warnings.length, 2);
});

test("legacy credential-only mutation is terminal and performs no work", async () => {
  let prepared = false;
  const { response, route } = await dispatch(
    createDependencies({
      prepareApiKeyUpdateWithCachedPassword: async () => {
        prepared = true;
        return { success: false };
      },
    }),
    { type: "saveApiKeyWithCachedPassword", apiKey: "unsafe" },
  );
  assert.deepEqual(response, {
    success: false,
    error: "Update the Bankr credential from that account's settings.",
  });
  assert.deepEqual(route, { handled: true, keepChannelOpen: false });
  assert.equal(prepared, false);
});

test("API-key reads require the exact wallet UI, restore Never sessions, and block agents", async () => {
  const denied = await dispatch(
    createDependencies({ isTrustedWalletUiSender: () => false }),
    { type: "getCachedApiKey" },
    untrustedSender,
  );
  assert.deepEqual(denied.response, { apiKey: null });

  let restored = false;
  const restoredRead = await dispatch(
    createDependencies({
      getCachedApiKey: () => (restored ? "restored-key" : null),
      getAutoLockTimeout: async () => 0,
      tryRestoreSession: async () => {
        restored = true;
        return true;
      },
    }),
    { type: "getCachedApiKey" },
  );
  assert.deepEqual(restoredRead.response, { apiKey: "restored-key" });

  const agentRead = await dispatch(
    createDependencies({ getPasswordType: () => "agent" }),
    { type: "getCachedApiKey" },
  );
  assert.deepEqual(agentRead.response, { apiKey: null });
});
