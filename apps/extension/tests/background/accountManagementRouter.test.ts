import assert from "node:assert/strict";
import test from "node:test";

import {
  BACKGROUND_ACCOUNT_MANAGEMENT_MESSAGE_TYPES,
  createBackgroundAccountManagementMessageRouter,
  type BackgroundAccountManagementDependencies,
} from "../../src/chrome/background/accountManagementRouter";

const trustedSender = { id: "extension-id" } as chrome.runtime.MessageSender;
const externalSender = {
  id: "extension-id",
  tab: { id: 1 },
} as chrome.runtime.MessageSender;

function createDependencies(
  overrides: Partial<BackgroundAccountManagementDependencies> = {},
): BackgroundAccountManagementDependencies {
  return {
    isTrustedWalletUiSender: () => true,
    migrateFromLegacyStorage: async () => true,
    resolvePasswordType: async () => "master",
    handleUnlockWallet: async () => ({ success: true }),
    prepareApiKeyUpdateWithCachedPassword: async () => ({ success: false }),
    commitPreparedApiKeyUpdate() {},
    getAuthCeremonyEpoch: () => "epoch-1",
    getCachedApiKey: () => "cached-api-key",
    verifyBankrCredentialAddress: async () => {},
    withWalletSecretLock: async (work) => work(),
    assertCurrentMasterAuthorization() {},
    addBankrAccountWithCredentialUpdate: async () => ({ id: "bankr-1" }),
    addBankrAccount: async () => ({ id: "bankr-1" }),
    setActiveAccountId: async () => {},
    addImpersonatorAccount: async () => ({ id: "view-1" }),
    previewSeedAddresses: async () => ({ success: true, addresses: [] }),
    addSeedPhraseGroup: async () => ({ success: true }),
    deriveSeedAccounts: async () => ({ success: true }),
    getSeedGroups: async () => [],
    renameSeedGroup: async () => {},
    getCachedPassword: () => "cached-password",
    getAutoLockTimeout: async () => 60_000,
    tryRestoreSession: async () => false,
    getCachedVaultKey: () => null,
    handleAddPrivateKeyAccount: async () => ({ success: true }),
    withSponsoredTransferOperation: async (work) => work(),
    removeAccountWithDappPrivacyBoundary: async () => ({ success: true }),
    getAccountById: async () => ({
      id: "account-1",
      address: "0x1111111111111111111111111111111111111111",
    }),
    hasUnresolvedSponsoredTransferIntent: async () => false,
    assertPrivacyAccountRemovalSafe: async () => {},
    getAccounts: async () => [{ id: "account-1" }, { id: "account-2" }],
    handleRevokeDappPermission: async () => ({ success: true }),
    handleRemoveAccount: async () => ({ success: true }),
    clearTxHistoryForAddresses: async () => {},
    sendRuntimeMessage: async () => undefined,
    ...overrides,
  };
}

function dispatch(
  dependencies: BackgroundAccountManagementDependencies,
  message: Record<string, unknown>,
  sender = trustedSender,
): Promise<{
  response: any;
  route: ReturnType<ReturnType<typeof createBackgroundAccountManagementMessageRouter>>;
}> {
  return new Promise((resolve) => {
    const router = createBackgroundAccountManagementMessageRouter(dependencies);
    let route!: ReturnType<typeof router>;
    route = router(message, sender, (response) => {
      queueMicrotask(() => resolve({ response, route }));
    });
  });
}

test("account management declares one unique route set", () => {
  assert.equal(
    new Set(BACKGROUND_ACCOUNT_MANAGEMENT_MESSAGE_TYPES).size,
    BACKGROUND_ACCOUNT_MANAGEMENT_MESSAGE_TYPES.length,
  );
});

test("legacy migration retains its direct trusted-sender and channel boundary", async () => {
  let migrated = false;
  const dependencies = createDependencies({
    isTrustedWalletUiSender: (sender) => sender === trustedSender,
    migrateFromLegacyStorage: async () => {
      migrated = true;
      return true;
    },
  });

  const rejected = await dispatch(
    dependencies,
    { type: "migrateFromLegacy" },
    externalSender,
  );
  assert.deepEqual(rejected.response, { migrated: false });
  assert.deepEqual(rejected.route, {
    handled: true,
    keepChannelOpen: false,
  });
  assert.equal(migrated, false);

  const accepted = await dispatch(dependencies, { type: "migrateFromLegacy" });
  assert.deepEqual(accepted.response, { migrated: true });
  assert.equal(accepted.route.keepChannelOpen, true);
});

test("agent and locked sessions cannot enter any account mutation path", async () => {
  const effects: string[] = [];
  const dependencies = createDependencies({
    resolvePasswordType: async () => "agent",
    addBankrAccount: async () => {
      effects.push("bankr");
      return {};
    },
    addImpersonatorAccount: async () => {
      effects.push("view-only");
      return {};
    },
    handleAddPrivateKeyAccount: async () => {
      effects.push("private-key");
      return {};
    },
    handleRemoveAccount: async () => {
      effects.push("remove");
      return {};
    },
  });

  for (const [type, error] of [
    ["addBankrAccount", "Adding accounts requires master password"],
    ["addImpersonatorAccount", "Adding accounts requires master password"],
    ["addPrivateKeyAccount", "Adding accounts requires master password"],
    ["removeAccount", "Account removal requires master password"],
  ] as const) {
    const { response } = await dispatch(dependencies, { type });
    assert.deepEqual(response, { success: false, error });
  }
  assert.deepEqual(effects, []);
});

test("Bankr credential verification and auth epoch precede the atomic commit", async () => {
  const events: string[] = [];
  const prepared = {
    success: true,
    apiKey: "new-api-key",
    storageUpdate: { encryptedApiKeyVault: "ciphertext" },
    expectedAuthEpoch: "epoch-prepared",
  };
  const dependencies = createDependencies({
    prepareApiKeyUpdateWithCachedPassword: async () => prepared,
    verifyBankrCredentialAddress: async () => {
      events.push("verify");
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
    addBankrAccountWithCredentialUpdate: async () => {
      events.push("account:commit");
      return { id: "bankr-new" };
    },
    commitPreparedApiKeyUpdate: () => events.push("cache:commit"),
    setActiveAccountId: async () => {
      events.push("selection:commit");
    },
    sendRuntimeMessage: async () => {
      events.push("broadcast");
    },
  });

  const { response } = await dispatch(dependencies, {
    type: "addBankrAccount",
    apiKey: "new-api-key",
    address: "0x1111111111111111111111111111111111111111",
  });
  assert.deepEqual(response, {
    success: true,
    account: { id: "bankr-new" },
  });
  assert.deepEqual(events, [
    "verify",
    "lock:start",
    "auth:epoch-prepared",
    "account:commit",
    "cache:commit",
    "selection:commit",
    "lock:end",
    "broadcast",
  ]);
});

test("passwordless passkey private-key import keeps the live vault capability", async () => {
  const liveVaultKey = {} as CryptoKey;
  let restoreCalls = 0;
  let receivedPassword: unknown;
  let receivedEpoch: unknown;
  const dependencies = createDependencies({
    getCachedPassword: () => null,
    getCachedVaultKey: () => liveVaultKey,
    getAutoLockTimeout: async () => 0,
    tryRestoreSession: async () => {
      restoreCalls += 1;
      return true;
    },
    handleAddPrivateKeyAccount: async (
      _key,
      password,
      _displayName,
      authEpoch,
    ) => {
      receivedPassword = password;
      receivedEpoch = authEpoch;
      return { success: true };
    },
  });

  assert.deepEqual(
    (
      await dispatch(dependencies, {
        type: "addPrivateKeyAccount",
        privateKey: "0xkey",
      })
    ).response,
    { success: true },
  );
  assert.equal(restoreCalls, 0);
  assert.equal(receivedPassword, null);
  assert.equal(receivedEpoch, "epoch-1");
});

test("locked Never password session restores before private-key import", async () => {
  let restored = false;
  let receivedPassword: unknown;
  const dependencies = createDependencies({
    getCachedPassword: () => (restored ? "restored-password" : null),
    getCachedVaultKey: () => null,
    getAutoLockTimeout: async () => 0,
    tryRestoreSession: async () => {
      restored = true;
      return true;
    },
    handleAddPrivateKeyAccount: async (_key, password) => {
      receivedPassword = password;
      return { success: true };
    },
  });

  assert.deepEqual(
    (
      await dispatch(dependencies, {
        type: "addPrivateKeyAccount",
        privateKey: "0xkey",
      })
    ).response,
    { success: true },
  );
  assert.equal(receivedPassword, "restored-password");
});

test("account removal validates sponsored state and revokes dapps before deletion", async () => {
  const events: string[] = [];
  const dependencies = createDependencies({
    withSponsoredTransferOperation: async (work) => {
      events.push("sponsored:start");
      const result = await work();
      events.push("sponsored:end");
      return result;
    },
    removeAccountWithDappPrivacyBoundary: async (options) => {
      await options.validateRemoval();
      await options.revokeOrigin("https://connected.example");
      return options.removeAccount();
    },
    getAccountById: async () => {
      events.push("account:read");
      return { address: "0x1111111111111111111111111111111111111111" };
    },
    hasUnresolvedSponsoredTransferIntent: async () => {
      events.push("sponsored:check");
      return false;
    },
    assertPrivacyAccountRemovalSafe: async () => {
      events.push("privacy:check");
    },
    getAccounts: async () => {
      events.push("accounts:read");
      return [{}, {}];
    },
    handleRevokeDappPermission: async () => {
      events.push("dapp:revoke");
    },
    handleRemoveAccount: async (_accountId, _epoch, validateRemoval) => {
      await validateRemoval?.();
      events.push("account:remove");
      return { success: true };
    },
    clearTxHistoryForAddresses: async (addresses) => {
      events.push(`history:clear:${addresses.join(",")}`);
    },
  });

  assert.deepEqual(
    (await dispatch(dependencies, { type: "removeAccount", accountId: "a" }))
      .response,
    { success: true },
  );
  assert.deepEqual(events, [
    "sponsored:start",
    "account:read",
    "sponsored:check",
    "privacy:check",
    "accounts:read",
    "dapp:revoke",
    "account:read",
    "privacy:check",
    "account:remove",
    "sponsored:end",
    "history:clear:0x1111111111111111111111111111111111111111",
  ]);
});

test("account removal stops before permission revocation when Shield funds are at risk", async () => {
  const effects: string[] = [];
  const dependencies = createDependencies({
    removeAccountWithDappPrivacyBoundary: async (options) => {
      await options.validateRemoval();
      effects.push("validated");
      return options.removeAccount();
    },
    assertPrivacyAccountRemovalSafe: async () => {
      throw new Error(
        "Unshield or recover this account's Shield balance before removing the account",
      );
    },
    handleRemoveAccount: async () => {
      effects.push("removed");
      return { success: true };
    },
  });

  const { response } = await dispatch(dependencies, {
    type: "removeAccount",
    accountId: "account-1",
  });
  assert.deepEqual(response, {
    success: false,
    error: "Unshield or recover this account's Shield balance before removing the account",
  });
  assert.deepEqual(effects, []);
});
