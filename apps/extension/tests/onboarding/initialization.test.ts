import assert from "node:assert/strict";
import test from "node:test";

type StorageRecord = Record<string, any>;

function clone<T>(value: T): T {
  return value === undefined ? value : structuredClone(value);
}

function selectStorageValues(
  storage: StorageRecord,
  keys?: string | string[] | StorageRecord | null,
): StorageRecord {
  if (keys == null) return clone(storage);
  if (typeof keys === "string") return { [keys]: clone(storage[keys]) };
  if (Array.isArray(keys)) {
    return Object.fromEntries(keys.map((key) => [key, clone(storage[key])]));
  }
  return Object.fromEntries(
    Object.entries(keys).map(([key, fallback]) => [
      key,
      clone(storage[key] ?? fallback),
    ]),
  );
}

test("onboarding initialization preserves existing wallet data and recovers only marked setup", async (t) => {
  const originalChrome = Object.getOwnPropertyDescriptor(globalThis, "chrome");
  const local: StorageRecord = {};
  const sync: StorageRecord = {};
  const session: StorageRecord = {};
  let failBulkWalletRemoval = false;
  let failMarkerCleanup = false;

  const storageArea = (
    storage: StorageRecord,
    options: { failMarkedRemoval?: boolean } = {},
  ) => ({
    get(
      keys?: string | string[] | StorageRecord | null,
      callback?: (values: StorageRecord) => void,
    ) {
      const values = selectStorageValues(storage, keys);
      if (callback) {
        callback(values);
        return;
      }
      return Promise.resolve(values);
    },
    async set(values: StorageRecord) {
      Object.assign(storage, clone(values));
    },
    async remove(keys: string | string[]) {
      const list = Array.isArray(keys) ? keys : [keys];
      if (options.failMarkedRemoval && failBulkWalletRemoval && list.length > 1) {
        throw new Error("simulated onboarding rollback write failure");
      }
      if (
        options.failMarkedRemoval &&
        failMarkerCleanup &&
        list.length === 1 &&
        list[0] === "onboardingInitialization"
      ) {
        throw new Error("simulated marker cleanup failure");
      }
      for (const key of list) delete storage[key];
    },
    async clear() {
      for (const key of Object.keys(storage)) delete storage[key];
    },
  });

  Object.defineProperty(globalThis, "chrome", {
    configurable: true,
    value: {
      runtime: {
        lastError: undefined,
        onStartup: { addListener() {} },
      },
      storage: {
        local: storageArea(local, { failMarkedRemoval: true }),
        sync: storageArea(sync),
        session: storageArea(session),
      },
    },
  });

  try {
    const onboarding = await import(
      "../../src/chrome/onboardingInitialization"
    );
    const sessionCache = await import("../../src/chrome/sessionCache");

    const encrypted = {
      ciphertext: "encrypted",
      iv: "initialization-vector",
      salt: "salt",
    };
    const marker = (id: string) => ({
      version: 1,
      id,
      startedAt: Date.now(),
    });
    const reset = () => {
      for (const store of [local, sync, session]) {
        for (const key of Object.keys(store)) delete store[key];
      }
      failBulkWalletRemoval = false;
      failMarkerCleanup = false;
      sessionCache.clearInMemoryAuthCache();
    };

    await t.test("fresh setup creates a marker and cannot complete early", async () => {
      reset();
      assert.deepEqual(await onboarding.getOnboardingInitializationStatus(), {
        configured: false,
        recoveryRequired: undefined,
      });

      const begun = await onboarding.beginOnboardingInitialization();
      assert.equal(begun.success, true);
      assert.equal(typeof begun.initializationId, "string");
      assert.equal(
        local.onboardingInitialization.id,
        begun.initializationId,
      );

      assert.deepEqual(
        await onboarding.completeOnboardingInitialization(
          begun.initializationId!,
        ),
        { success: false, error: "Wallet setup did not complete safely" },
      );
      assert.ok(local.onboardingInitialization);
    });

    await t.test(
      "pre-marker caches do not block seed, private-key, or Bankr onboarding",
      async (cacheTest) => {
        const cases: Array<{
          name: string;
          localResidue: StorageRecord;
        }> = [
          {
            name: "seed address ENS/avatar caches",
            localResidue: {
              ensIdentityCache: {
                "0x1111111111111111111111111111111111111111": {
                  name: null,
                  avatar: null,
                  resolvedAt: Date.now(),
                },
              },
              ensAvatarImageCache: { entries: {} },
              portfolioHoldingsCache: { version: 1, entries: {} },
            },
          },
          {
            name: "private-key metadata residue",
            localResidue: {
              portfolioSnapshots: { stale: true },
              portfolioSnapshotsV2: { stale: true },
              recentlyReceivedTokens: { stale: true },
              "txResult:stale-private": {
                result: { success: false },
                timestamp: Date.now(),
              },
            },
          },
          {
            name: "Bankr permissions and pending routes",
            localResidue: {
              dappPermissions: {
                "https://stale.example": {
                  origin: "https://stale.example",
                  hostname: "stale.example",
                  approvedAt: 1,
                  lastConnectedAt: 1,
                },
              },
              pendingDappConnectionRequests: [{ id: "stale-connect" }],
              walletConnectPendingRequests: {
                stale: { id: "stale", topic: "old-wallet" },
              },
            },
          },
        ];

        for (const scenario of cases) {
          await cacheTest.test(scenario.name, async () => {
            reset();
            Object.assign(local, clone(scenario.localResidue));
            local.sessionEncKey = "stale-session-key-half";
            sync.address = "0x9999999999999999999999999999999999999999";
            sync.activeAccountId = "stale-account";
            sync.tabAccounts = { 7: "stale-account" };
            sync.unrelatedPreference = "preserve-me";
            session.sessionId = "stale-session";
            session.encryptedSessionPassword = { data: "old", iv: "old" };

            assert.deepEqual(
              await onboarding.getOnboardingInitializationStatus(),
              { configured: false, recoveryRequired: undefined },
            );

            const begun = await onboarding.beginOnboardingInitialization(
              `fresh-${scenario.name}`,
            );
            assert.deepEqual(begun, {
              success: true,
              initializationId: `fresh-${scenario.name}`,
            });
            for (const key of Object.keys(scenario.localResidue)) {
              assert.equal(local[key], undefined, `${key} must not carry over`);
            }
            assert.equal(local.sessionEncKey, undefined);
            assert.equal(sync.address, undefined);
            assert.equal(sync.activeAccountId, undefined);
            assert.equal(sync.tabAccounts, undefined);
            assert.equal(sync.unrelatedPreference, "preserve-me");
            assert.deepEqual(session, {});
            assert.equal(
              local.onboardingInitialization.id,
              `fresh-${scenario.name}`,
            );
          });
        }
      },
    );

    await t.test(
      "every authoritative unmarked secret or account record still fails closed",
      async (authoritativeTest) => {
        const cases: Array<[string, unknown]> = [
          ["encryptedApiKey", encrypted],
          ["encryptedApiKeyVault", encrypted],
          ["encryptedVaultKeyMaster", encrypted],
          ["encryptedVaultKeyAgent", encrypted],
          ["agentPasswordEnabled", true],
          ["passkeyUnlock", { version: 1, wrappedVaultKey: encrypted }],
          ["pkVault", { version: 1, entries: [] }],
          ["mnemonicVault", { version: 1, entries: [] }],
          ["privacyVault", { version: 1, recovery: encrypted }],
          ["accounts", [{ id: "partial-account" }]],
          ["seedGroups", [{ id: "partial-seed-group" }]],
        ];

        for (const [key, value] of cases) {
          await authoritativeTest.test(key, async () => {
            reset();
            local[key] = clone(value);
            const before = clone(local);

            assert.deepEqual(
              await onboarding.getOnboardingInitializationStatus(),
              { configured: false, recoveryRequired: true },
            );
            const begun = await onboarding.beginOnboardingInitialization(
              `blocked-${key}`,
            );
            assert.equal(begun.success, false);
            assert.match(begun.error || "", /Incomplete wallet data/);
            assert.deepEqual(local, before);
          });
        }
      },
    );

    await t.test(
      "fresh setup retires WalletConnect SDK identity before writing its marker",
      async () => {
        reset();
        local.dappPermissions = {
          "https://old-wallet.example": {
            origin: "https://old-wallet.example",
          },
        };
        local.walletConnectPendingRequests = {
          old: { topic: "old-wallet-topic" },
        };
        local.walletConnectStorageNamespace = "legacy-wallet-namespace";
        let retirementCalls = 0;

        const begun = await onboarding.beginOnboardingInitialization(
          "walletconnect-cutover",
          async () => {
            retirementCalls += 1;
            // Local authorization/routes are gone before the external SDK
            // identity is retired, and no new-wallet marker exists yet.
            assert.equal(local.dappPermissions, undefined);
            assert.equal(local.walletConnectPendingRequests, undefined);
            assert.equal(local.onboardingInitialization, undefined);
            local.walletConnectStorageNamespace = "new-wallet-namespace";
          },
        );

        assert.equal(retirementCalls, 1);
        assert.deepEqual(begun, {
          success: true,
          initializationId: "walletconnect-cutover",
        });
        assert.equal(
          local.walletConnectStorageNamespace,
          "new-wallet-namespace",
        );
        assert.equal(
          local.onboardingInitialization.id,
          "walletconnect-cutover",
        );
      },
    );

    await t.test(
      "a failed WalletConnect cutover cannot start or credential a new wallet",
      async () => {
        reset();
        local.dappPermissions = { stale: true };

        await assert.rejects(
          onboarding.beginOnboardingInitialization(
            "failed-walletconnect-cutover",
            async () => {
              throw new Error("simulated SDK namespace write failure");
            },
          ),
          /simulated SDK namespace write failure/,
        );
        assert.equal(local.onboardingInitialization, undefined);
        assert.equal(local.encryptedVaultKeyMaster, undefined);
        assert.equal(local.encryptedApiKeyVault, undefined);
        assert.equal(local.dappPermissions, undefined);
      },
    );

    await t.test("initial credential creation is bound to the marker owner", async () => {
      reset();
      await onboarding.beginOnboardingInitialization("credential-owner");

      assert.deepEqual(
        await onboarding.initializeOnboardingCredential(
          "different-owner",
          "pk-only-mode",
          "correct horse battery staple",
        ),
        {
          success: false,
          error: "Wallet setup session is no longer valid",
        },
      );
      assert.equal(local.encryptedVaultKeyMaster, undefined);
      assert.equal(local.encryptedApiKeyVault, undefined);

      const initialized = await onboarding.initializeOnboardingCredential(
        "credential-owner",
        "pk-only-mode",
        "correct horse battery staple",
      );
      assert.deepEqual(initialized, {
        success: true,
        passwordType: "master",
      });
      assert.ok(local.encryptedVaultKeyMaster);
      assert.ok(local.encryptedApiKeyVault);
      assert.equal(local.encryptedApiKey, null);
      assert.equal(local.agentPasswordEnabled, false);
    });

    await t.test("rollback cannot race initial credentials back into storage", async () => {
      reset();
      await onboarding.beginOnboardingInitialization("racing-owner");

      const initialize = onboarding.initializeOnboardingCredential(
        "racing-owner",
        "pk-only-mode",
        "correct horse battery staple",
      );
      // initializeOnboardingCredential acquires the outer secret-operation
      // lock synchronously before its first crypto await. Rollback queues on
      // that same lock and must remove the committed partial state afterward.
      await Promise.resolve();
      const rollback = onboarding.rollbackOnboardingInitialization(
        "racing-owner",
      );
      const [initialized, rolledBack] = await Promise.all([
        initialize,
        rollback,
      ]);
      assert.equal(initialized.success, true);
      assert.deepEqual(rolledBack, { success: true });
      assert.equal(local.onboardingInitialization, undefined);
      assert.equal(local.encryptedVaultKeyMaster, undefined);
      assert.equal(local.encryptedApiKeyVault, undefined);
      assert.equal(local.accounts, undefined);
    });

    await t.test("status rolls back a marked partial initialization", async () => {
      reset();
      local.onboardingInitialization = marker("partial");
      local.encryptedApiKey = encrypted;
      local.pkVault = { version: 1, entries: [] };
      local.sessionEncKey = "session-key";
      local.selectedTheme = "warm-midnight";
      sync.address = "0x1111111111111111111111111111111111111111";
      sync.activeAccountId = "unfinished";
      sync.unrelatedPreference = "preserve-me";
      session.sessionId = "unfinished-session";

      assert.deepEqual(
        await onboarding.getOnboardingInitializationStatus("partial"),
        { configured: false, recoveredPartial: true },
      );
      assert.equal(local.onboardingInitialization, undefined);
      assert.equal(local.encryptedApiKey, undefined);
      assert.equal(local.pkVault, undefined);
      assert.equal(local.sessionEncKey, undefined);
      assert.equal(sync.address, undefined);
      assert.equal(sync.activeAccountId, undefined);
      assert.deepEqual(session, {});
      assert.equal(local.selectedTheme, "warm-midnight");
      assert.equal(sync.unrelatedPreference, "preserve-me");
    });

    await t.test("a failed marked rollback keeps local data and marker retryable", async () => {
      reset();
      local.onboardingInitialization = marker("retryable");
      local.encryptedApiKey = encrypted;
      failBulkWalletRemoval = true;

      await assert.rejects(
        onboarding.getOnboardingInitializationStatus("retryable"),
        /simulated onboarding rollback write failure/,
      );
      assert.equal(local.onboardingInitialization.id, "retryable");
      assert.deepEqual(local.encryptedApiKey, encrypted);

      failBulkWalletRemoval = false;
      assert.deepEqual(
        await onboarding.getOnboardingInitializationStatus("retryable"),
        { configured: false, recoveredPartial: true },
      );
      assert.equal(local.onboardingInitialization, undefined);
      assert.equal(local.encryptedApiKey, undefined);
    });

    await t.test("a complete marked wallet finalizes without deleting it", async () => {
      reset();
      local.onboardingInitialization = marker("complete");
      local.encryptedApiKey = encrypted;
      local.accounts = [
        {
          id: "bankr",
          type: "bankr",
          address: "0x1111111111111111111111111111111111111111",
          createdAt: 1,
        },
      ];

      assert.deepEqual(await onboarding.getOnboardingInitializationStatus(), {
        configured: true,
      });
      assert.equal(local.onboardingInitialization, undefined);
      assert.deepEqual(local.encryptedApiKey, encrypted);
      assert.equal(local.accounts.length, 1);
    });

    await t.test("another live tab cannot claim or roll back an active marker", async () => {
      reset();
      const begun = await onboarding.beginOnboardingInitialization("owner-tab");
      assert.deepEqual(begun, {
        success: true,
        initializationId: "owner-tab",
      });
      local.encryptedApiKey = encrypted;
      const before = clone(local);

      assert.deepEqual(
        await onboarding.getOnboardingInitializationStatus("other-tab"),
        { configured: false, setupInProgress: true },
      );
      assert.deepEqual(local, before);
      assert.deepEqual(
        await onboarding.beginOnboardingInitialization("other-tab"),
        {
          success: false,
          error: "Wallet setup is already in progress in another tab",
        },
      );
      assert.deepEqual(local, before);

      assert.deepEqual(
        await onboarding.getOnboardingInitializationStatus("owner-tab"),
        { configured: false, recoveredPartial: true },
      );
      assert.equal(local.onboardingInitialization, undefined);
      assert.equal(local.encryptedApiKey, undefined);
    });

    await t.test("a stale marker is recovered even from a different tab", async () => {
      reset();
      local.onboardingInitialization = {
        ...marker("stale-owner"),
        startedAt: Date.now() - 16 * 60 * 1000,
      };
      local.encryptedApiKey = encrypted;

      assert.deepEqual(
        await onboarding.getOnboardingInitializationStatus("new-tab"),
        { configured: false, recoveredPartial: true },
      );
      assert.equal(local.onboardingInitialization, undefined);
      assert.equal(local.encryptedApiKey, undefined);
    });

    await t.test("marker cleanup failure cannot roll back a committed wallet", async () => {
      reset();
      local.onboardingInitialization = marker("committed");
      local.encryptedApiKey = encrypted;
      local.accounts = [
        {
          id: "bankr",
          type: "bankr",
          address: "0x1111111111111111111111111111111111111111",
          createdAt: 1,
        },
      ];
      failMarkerCleanup = true;

      assert.deepEqual(
        await onboarding.completeOnboardingInitialization("committed"),
        { success: true },
      );
      assert.equal(local.onboardingInitialization.id, "committed");
      assert.deepEqual(
        await onboarding.rollbackOnboardingInitialization("committed"),
        { success: false },
      );
      assert.deepEqual(local.encryptedApiKey, encrypted);
      assert.equal(local.accounts.length, 1);

      failMarkerCleanup = false;
      assert.deepEqual(await onboarding.getOnboardingInitializationStatus(), {
        configured: true,
      });
      assert.equal(local.onboardingInitialization, undefined);
      assert.deepEqual(local.encryptedApiKey, encrypted);
      assert.equal(local.accounts.length, 1);
    });

    await t.test("unmarked partial data is preserved for explicit recovery", async () => {
      reset();
      local.encryptedApiKey = encrypted;
      local.pkVault = {
        version: 1,
        entries: [{ id: "orphan-key", keystore: encrypted }],
      };
      const before = clone(local);

      assert.deepEqual(await onboarding.getOnboardingInitializationStatus(), {
        configured: false,
        recoveryRequired: true,
      });
      assert.deepEqual(local, before);

      const begin = await onboarding.beginOnboardingInitialization();
      assert.equal(begin.success, false);
      assert.match(begin.error || "", /Incomplete wallet data/);
      assert.deepEqual(local, before);
    });

    await t.test("a mismatched rollback id cannot delete marked data", async () => {
      reset();
      local.onboardingInitialization = marker("owner-id");
      local.encryptedApiKey = encrypted;
      sync.address = "0x2222222222222222222222222222222222222222";
      const beforeLocal = clone(local);
      const beforeSync = clone(sync);

      assert.deepEqual(
        await onboarding.rollbackOnboardingInitialization("different-id"),
        { success: false },
      );
      assert.deepEqual(local, beforeLocal);
      assert.deepEqual(sync, beforeSync);
    });

    await t.test("legacy Bankr wallet is structurally complete", async () => {
      reset();
      local.encryptedApiKey = encrypted;
      local.accounts = [
        {
          id: "bankr",
          type: "bankr",
          address: "0x1111111111111111111111111111111111111111",
          createdAt: 1,
        },
      ];
      assert.deepEqual(await onboarding.getOnboardingInitializationStatus(), {
        configured: true,
      });

      delete local.encryptedApiKey;
      local.encryptedVaultKeyMaster = encrypted;
      assert.deepEqual(await onboarding.getOnboardingInitializationStatus(), {
        configured: false,
        recoveryRequired: true,
      });
    });

    await t.test("private-key wallet requires its matching vault entry", async () => {
      reset();
      local.encryptedVaultKeyMaster = encrypted;
      local.accounts = [
        {
          id: "private-account",
          type: "privateKey",
          address: "0x2222222222222222222222222222222222222222",
          createdAt: 1,
        },
      ];
      local.pkVault = {
        version: 1,
        entries: [{ id: "private-account", keystore: encrypted }],
      };
      assert.deepEqual(await onboarding.getOnboardingInitializationStatus(), {
        configured: true,
      });

      local.pkVault.entries = [];
      assert.deepEqual(await onboarding.getOnboardingInitializationStatus(), {
        configured: false,
        recoveryRequired: true,
      });
    });

    await t.test("seed wallet requires derived key, group, and mnemonic", async () => {
      reset();
      local.encryptedApiKey = encrypted;
      local.accounts = [
        {
          id: "seed-account",
          type: "seedPhrase",
          address: "0x3333333333333333333333333333333333333333",
          seedGroupId: "seed-group",
          derivationIndex: 0,
          createdAt: 1,
        },
      ];
      local.pkVault = {
        version: 1,
        entries: [{ id: "seed-account", keystore: encrypted }],
      };
      local.seedGroups = [
        { id: "seed-group", name: "Seed", accountCount: 1, createdAt: 1 },
      ];
      local.mnemonicVault = {
        version: 1,
        entries: [{ id: "seed-group", keystore: encrypted }],
      };

      assert.deepEqual(await onboarding.getOnboardingInitializationStatus(), {
        configured: true,
      });

      local.mnemonicVault.entries = [];
      assert.deepEqual(await onboarding.getOnboardingInitializationStatus(), {
        configured: false,
        recoveryRequired: true,
      });
    });
  } finally {
    if (originalChrome) {
      Object.defineProperty(globalThis, "chrome", originalChrome);
    } else {
      Reflect.deleteProperty(globalThis, "chrome");
    }
  }
});
