import assert from "node:assert/strict";
import test from "node:test";

type StorageRecord = Record<string, unknown>;

const clone = <T>(value: T): T => structuredClone(value);

function selectStorageValues(
  storage: StorageRecord,
  keys?: string | string[] | StorageRecord | null,
): StorageRecord {
  if (keys == null) return clone(storage);
  const entries =
    typeof keys === "string"
      ? [[keys, storage[keys]]]
      : Array.isArray(keys)
        ? keys.map((key) => [key, storage[key]])
        : Object.entries(keys).map(([key, fallback]) => [
            key,
            storage[key] ?? fallback,
          ]);
  return Object.fromEntries(clone(entries));
}

test("persistent delegated authority requires a live master session", async (t) => {
  const originalChrome = Object.getOwnPropertyDescriptor(globalThis, "chrome");
  const local: StorageRecord = {};
  const sync: StorageRecord = { autoLockTimeout: 60_000 };
  const session: StorageRecord = {};

  const storageArea = (storage: StorageRecord) => ({
    async get(keys?: string | string[] | StorageRecord | null) {
      return selectStorageValues(storage, keys);
    },
    async set(values: StorageRecord) {
      Object.assign(storage, clone(values));
    },
    async remove(keys: string | string[]) {
      for (const key of Array.isArray(keys) ? keys : [keys]) delete storage[key];
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
        async sendMessage() {},
      },
      storage: {
        local: storageArea(local),
        sync: storageArea(sync),
        session: storageArea(session),
      },
      action: {
        async setBadgeText() {},
        async setBadgeBackgroundColor() {},
      },
    },
  });

  try {
    const sessionModule = await import("../../src/chrome/sessionCache");
    const transitionModule = await import("../../src/chrome/authTransition");
    const policyModule = await import(
      "../../src/chrome/delegatedAuthorityPolicy"
    );
    const grantStorageModule = await import(
      "../../src/chrome/pendingErc7715PermissionStorage"
    );
    const { EIP_7702_DEFAULT_DELEGATE } = await import(
      "../../src/constants/chainRegistry"
    );

    const customSet = {
      targetDelegate: "0x1111111111111111111111111111111111111111",
      kind: "setDelegate" as const,
    };
    const defaultSet = {
      targetDelegate: EIP_7702_DEFAULT_DELEGATE,
      kind: "setDelegate" as const,
    };
    const revoke = {
      targetDelegate: "0x0000000000000000000000000000000000000000" as const,
      kind: "revoke" as const,
    };
    const makeGrant = (id: string) => ({
      id,
      origin: "https://example.test",
      favicon: null,
      createdAt: Date.now(),
      expiresAt: null,
      status: "active",
      accountId: "account-1",
      accountAddress: "0x2222222222222222222222222222222222222222",
      accountType: "privateKey",
      chainId: 1,
      chainName: "Ethereum",
      permissionType: "native-token-allowance",
      request: {},
      response: {},
      caveats: [],
      delegation: {},
      typedData: {},
      contextHash: "0x01",
    });

    const resetSession = () => {
      sessionModule.clearInMemoryAuthCache();
      sessionModule.updateCachedAutoLockTimeout(60_000);
      transitionModule.invalidateAuthCeremonies();
    };

    const usePasswordMaster = () => {
      resetSession();
      sessionModule.setCachedPasswordDirect("master-password");
      sessionModule.setCachedPasswordType("master");
    };

    const useBiometricMaster = async (version: 1 | 2) => {
      resetSession();
      const generalKey = await crypto.subtle.importKey(
        "raw",
        crypto.getRandomValues(new Uint8Array(32)),
        "AES-GCM",
        false,
        ["encrypt", "decrypt"],
      );
      sessionModule.setCachedVaultKey(generalKey);
      if (version === 2) {
        const mnemonicKey = await crypto.subtle.importKey(
          "raw",
          crypto.getRandomValues(new Uint8Array(32)),
          "AES-GCM",
          false,
          ["encrypt", "decrypt"],
        );
        sessionModule.setCachedMnemonicKey({
          key: mnemonicKey,
          keyId: "v2-biometric-mnemonic-key",
        });
      }
      sessionModule.setCachedPasswordType("master");
      assert.equal(sessionModule.getCachedPassword(), null);
    };

    const useAgent = () => {
      resetSession();
      sessionModule.setCachedPasswordDirect("agent-password");
      sessionModule.setCachedPasswordType("agent");
    };

    await t.test("password and V1/V2 biometric master sessions are accepted", async () => {
      usePasswordMaster();
      const passwordEpoch =
        await policyModule.captureDelegatedAuthorityMasterAuthorization();
      policyModule.assertDelegatedAuthorityMasterAuthorization(passwordEpoch);

      await useBiometricMaster(1);
      const legacyBiometricEpoch =
        await policyModule.captureDelegatedAuthorityMasterAuthorization();
      policyModule.assertDelegatedAuthorityMasterAuthorization(
        legacyBiometricEpoch,
      );

      await useBiometricMaster(2);
      const biometricEpoch =
        await policyModule.captureDelegatedAuthorityMasterAuthorization();
      policyModule.assertDelegatedAuthorityMasterAuthorization(biometricEpoch);
      local.pendingErc7715PermissionRequests = [{ id: "biometric-request" }];
      await grantStorageModule.commitErc7715PermissionGrantApproval({
        grant: makeGrant("biometric-grant") as never,
        requestId: "biometric-request",
        result: { success: true, result: [] },
        expectedMasterAuthEpoch: biometricEpoch,
      });
      assert.equal(
        (local.erc7715PermissionGrants as { id: string }[])[0]?.id,
        "biometric-grant",
      );
      assert.deepEqual(local.pendingErc7715PermissionRequests, []);
      assert.deepEqual(
        (
          local["erc7715PermissionResult:biometric-request"] as {
            result: unknown;
          }
        ).result,
        { success: true, result: [] },
      );
      delete local.erc7715PermissionGrants;
      delete local["erc7715PermissionResult:biometric-request"];
    });

    await t.test(
      "an agent cannot approve a queued ERC-7715 grant or custom Set",
      async () => {
        usePasswordMaster();
        const queuedUnderMasterEpoch =
          await policyModule.captureDelegatedAuthorityMasterAuthorization();

        useAgent();
        await assert.rejects(
          policyModule.captureDelegatedAuthorityMasterAuthorization(),
          /master password or biometric/i,
        );
        await assert.rejects(
          policyModule.captureEip7702DelegationAuthorization(customSet),
          /master password or biometric/i,
        );
        assert.throws(
          () =>
            policyModule.assertDelegatedAuthorityMasterAuthorization(
              queuedUnderMasterEpoch,
            ),
          /Authentication state changed/,
        );
      },
    );

    await t.test(
      "master-to-agent transition before grant persistence writes no capability",
      async () => {
        delete local.erc7715PermissionGrants;
        usePasswordMaster();
        const expectedEpoch =
          await policyModule.captureDelegatedAuthorityMasterAuthorization();
        useAgent();
        local.pendingErc7715PermissionRequests = [
          { id: "agent-transition-request" },
        ];

        await assert.rejects(
          grantStorageModule.commitErc7715PermissionGrantApproval({
            grant: makeGrant("grant-after-agent-transition") as never,
            requestId: "agent-transition-request",
            result: { success: true, result: [] },
            expectedMasterAuthEpoch: expectedEpoch,
          }),
          /Authentication state changed/,
        );
        assert.equal(local.erc7715PermissionGrants, undefined);
        assert.deepEqual(local.pendingErc7715PermissionRequests, [
          { id: "agent-transition-request" },
        ]);
        assert.equal(
          local["erc7715PermissionResult:agent-transition-request"],
          undefined,
        );
      },
    );

    await t.test(
      "passive timeout before the grant/raw-send boundary invalidates master",
      async () => {
        delete local.erc7715PermissionGrants;
        const originalDateNow = Date.now;
        let now = 5_000_000;
        Date.now = () => now;
        try {
          usePasswordMaster();
          const expectedEpoch =
            await policyModule.captureDelegatedAuthorityMasterAuthorization();
          now += 60_001;
          local.pendingErc7715PermissionRequests = [
            { id: "timeout-request" },
          ];

          assert.throws(
            () =>
              policyModule.assertDelegatedAuthorityMasterAuthorization(
                expectedEpoch,
              ),
            /Authentication state changed/,
          );
          await assert.rejects(
            grantStorageModule.commitErc7715PermissionGrantApproval({
              grant: makeGrant("grant-after-timeout") as never,
              requestId: "timeout-request",
              result: { success: true, result: [] },
              expectedMasterAuthEpoch: expectedEpoch,
            }),
            /Authentication state changed/,
          );
          assert.equal(local.erc7715PermissionGrants, undefined);
          assert.deepEqual(local.pendingErc7715PermissionRequests, [
            { id: "timeout-request" },
          ]);
        } finally {
          Date.now = originalDateNow;
        }
      },
    );

    await t.test(
      "default routine authorization and all revocations stay agent-capable",
      async () => {
        useAgent();
        assert.equal(
          await policyModule.captureEip7702DelegationAuthorization(defaultSet),
          undefined,
        );
        assert.equal(
          await policyModule.captureEip7702DelegationAuthorization(revoke),
          undefined,
        );
        assert.equal(
          policyModule.requiresMasterForEip7702Delegation(defaultSet),
          false,
        );
        assert.equal(
          policyModule.requiresMasterForEip7702Delegation(revoke),
          false,
        );
      },
    );
  } finally {
    if (originalChrome) {
      Object.defineProperty(globalThis, "chrome", originalChrome);
    } else {
      Reflect.deleteProperty(globalThis, "chrome");
    }
  }
});
