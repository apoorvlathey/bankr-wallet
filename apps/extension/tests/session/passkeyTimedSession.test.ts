import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import test from "node:test";
import { privateKeyToAccount } from "viem/accounts";

import { createChromeStorageHarness } from "../helpers/chromeStorageHarness";

const AUTO_LOCK_TIMEOUT = 900_000;
const MASTER_PASSWORD = "timed-passkey-master-password";
const API_KEY = "timed-passkey-bankr-api-key";
const PRIVATE_KEYS = {
  bankr: `0x${"21".repeat(32)}`,
  privateKey: `0x${"31".repeat(32)}`,
  seedPhrase: `0x${"42".repeat(32)}`,
} as const;

function clearRecord(record: Record<string, unknown>): void {
  for (const key of Object.keys(record)) delete record[key];
}

test("15-minute passkey sessions survive a two-minute worker restart without extending expiry", async (t) => {
  const chromeHarness = createChromeStorageHarness({
    sync: { autoLockTimeout: AUTO_LOCK_TIMEOUT },
  });
  const originalDateNow = Date.now;
  let now = 2_000_000_000_000;
  Date.now = () => now;

  try {
    const auth = await import("../../src/chrome/authHandlers");
    const authTransition = await import("../../src/chrome/authTransition");
    const cryptoModule = await import("../../src/chrome/crypto");
    const passkey = await import("../../src/chrome/passkeyUnlock");
    const passkeyCrypto = await import("../../src/chrome/passkeyUnlockCrypto");
    const session = await import("../../src/chrome/sessionCache");
    const signer = await import("../../src/chrome/localSigner");
    const vault = await import("../../src/chrome/vaultCrypto");

    for (const walletType of [
      "bankr",
      "privateKey",
      "seedPhrase",
    ] as const) {
      await t.test(walletType, async () => {
        await session.clearAllAuthState();
        clearRecord(chromeHarness.stores.local);
        clearRecord(chromeHarness.stores.sync);
        clearRecord(chromeHarness.stores.session);
        chromeHarness.stores.sync.autoLockTimeout = AUTO_LOCK_TIMEOUT;
        session.updateCachedAutoLockTimeout(AUTO_LOCK_TIMEOUT);
        now += 20_000_000;
        const sessionStartedAt = now;

        const vaultKeyBytes = cryptoModule.generateVaultKey();
        const vaultKey = await cryptoModule.importVaultKey(vaultKeyBytes);
        chromeHarness.stores.local.encryptedVaultKeyMaster =
          await cryptoModule.encryptVaultKey(vaultKeyBytes, MASTER_PASSWORD);

        const payload = {
          credentialId: Buffer.alloc(64, 0x51).toString("base64url"),
          prfSalt: Buffer.alloc(32, 0x52).toString("base64url"),
          prfKeyMaterial: Buffer.alloc(32, 0x53).toString("base64url"),
          authCeremonyEpoch: authTransition.getAuthCeremonyEpoch(),
        };
        const built = await passkeyCrypto.buildPasskeyRecord(
          payload,
          vaultKeyBytes,
        );
        assert.ok(built.record);
        chromeHarness.stores.local.passkeyUnlock = built.record;

        const privateKey = PRIVATE_KEYS[walletType];
        const address = privateKeyToAccount(privateKey).address;
        const accountId = `${walletType}-account`;
        chromeHarness.stores.local.accounts = [
          {
            id: accountId,
            type: walletType,
            address,
            ...(walletType === "seedPhrase"
              ? { seedGroupId: "seed-group", derivationIndex: 0 }
              : {}),
            createdAt: now,
          },
        ];
        if (walletType === "bankr") {
          chromeHarness.stores.local.encryptedApiKeyVault =
            await cryptoModule.encryptWithVaultKey(vaultKey, API_KEY);
        } else {
          chromeHarness.stores.local.pkVault = {
            version: 1,
            entries: [
              {
                id: accountId,
                keystore: await vault.encryptPrivateKeyWithVaultKey(
                  privateKey,
                  vaultKey,
                ),
              },
            ],
          };
        }

        assert.deepEqual(await passkey.handleUnlockWithPasskey(payload), {
          success: true,
        });
        const envelope = chromeHarness.stores.session
          .encryptedSessionCapabilities as {
          version: number;
          lastActiveAt: number;
          autoLockTimeout: number;
          idleExpiresAt: number;
          leaseState: string;
        };
        assert.deepEqual(
          {
            version: envelope.version,
            startedAt: envelope.lastActiveAt,
            autoLockTimeout: envelope.autoLockTimeout,
            expiresAt: envelope.idleExpiresAt,
            leaseState: envelope.leaseState,
            autoLockNever: chromeHarness.stores.session.autoLockNever,
          },
          {
            version: 1,
            startedAt: sessionStartedAt,
            autoLockTimeout: AUTO_LOCK_TIMEOUT,
            expiresAt: sessionStartedAt + AUTO_LOCK_TIMEOUT,
            leaseState: "idle",
            autoLockNever: false,
          },
        );
        assert.equal(session.getCachedPassword(), null);

        // Reproduce Chrome suspending the worker around two minutes after
        // passkey login. The encrypted capability must restore without a new
        // WebAuthn ceremony while the authenticated deadline is still live.
        now = sessionStartedAt + 120_000;
        session.clearInMemoryAuthCache();
        assert.equal(
          await session.tryRestoreSession(auth.handleUnlockWallet),
          true,
        );
        assert.equal(session.getPasswordType(), "master");
        assert.equal(session.isWalletUnlocked(), true);
        assert.equal(
          (
            chromeHarness.stores.session.encryptedSessionCapabilities as {
              idleExpiresAt: number;
            }
          ).idleExpiresAt,
          sessionStartedAt + AUTO_LOCK_TIMEOUT,
        );

        if (walletType === "bankr") {
          assert.equal(session.getCachedApiKey(), API_KEY);
        } else {
          const restoredPrivateKey = session.getPrivateKeyFromCache(accountId);
          assert.equal(restoredPrivateKey, privateKey);
          assert.match(
            await signer.signMessage(restoredPrivateKey!, "timed restore"),
            /^0x[0-9a-f]{130}$/i,
          );
        }

        // A cold restore must not grant a second full timeout. The same hard
        // deadline expires the live cache and then destroys persisted state.
        now = sessionStartedAt + AUTO_LOCK_TIMEOUT;
        assert.equal(session.isWalletUnlocked(), false);
        assert.equal(
          await session.tryRestoreSession(auth.handleUnlockWallet),
          false,
        );
        assert.deepEqual(chromeHarness.stores.session, {});
        assert.equal(chromeHarness.stores.local.sessionEncKey, undefined);
      });
    }
  } finally {
    Date.now = originalDateNow;
    chromeHarness.restore();
  }
});

test("finite passkey timing metadata is authenticated and policy-bound", async (t) => {
  const chromeHarness = createChromeStorageHarness({
    sync: { autoLockTimeout: AUTO_LOCK_TIMEOUT },
  });

  try {
    const cryptoModule = await import("../../src/chrome/crypto");
    const persistence = await import(
      "../../src/chrome/session/passkeyPersistence"
    );
    const session = await import("../../src/chrome/sessionCache");
    const startedAt = Date.now();
    const passkeyBinding = Buffer.alloc(32, 0xb6).toString("base64");
    const vaultKeyBytes = cryptoModule.generateVaultKey();

    await persistence.storePasskeySessionAtomic(
      "timing-auth-session",
      vaultKeyBytes,
      passkeyBinding,
      {
        autoLockTimeout: AUTO_LOCK_TIMEOUT,
        startedAt,
        expiresAt: startedAt + AUTO_LOCK_TIMEOUT,
      },
    );
    const validSession = structuredClone(chromeHarness.stores.session);
    const validLocal = structuredClone(chromeHarness.stores.local);

    for (const testCase of [
      {
        name: "shifted start and expiry",
        mutate(record: {
          startedAt: number;
          expiresAt: number;
        }) {
          record.startedAt += 60_000;
          record.expiresAt += 60_000;
        },
      },
      {
        name: "extended timeout and expiry",
        mutate(record: {
          autoLockTimeout: number;
          expiresAt: number;
        }) {
          record.autoLockTimeout = 14_400_000;
          record.expiresAt = startedAt + 14_400_000;
          chromeHarness.stores.sync.autoLockTimeout = 14_400_000;
        },
      },
    ]) {
      await t.test(testCase.name, async () => {
        clearRecord(chromeHarness.stores.session);
        clearRecord(chromeHarness.stores.local);
        clearRecord(chromeHarness.stores.sync);
        Object.assign(chromeHarness.stores.session, structuredClone(validSession));
        Object.assign(chromeHarness.stores.local, structuredClone(validLocal));
        chromeHarness.stores.sync.autoLockTimeout = AUTO_LOCK_TIMEOUT;
        session.updateCachedAutoLockTimeout(AUTO_LOCK_TIMEOUT);
        testCase.mutate(
          chromeHarness.stores.session.encryptedSessionVaultKey as never,
        );

        assert.equal(
          await persistence.getSessionPasskeyCredential("timing-auth-session"),
          null,
        );
      });
    }
  } finally {
    chromeHarness.restore();
  }
});

test("finite passkey capabilities are revoked instead of reinterpreted after a timeout change", async () => {
  const chromeHarness = createChromeStorageHarness({
    sync: { autoLockTimeout: AUTO_LOCK_TIMEOUT },
  });

  try {
    const cryptoModule = await import("../../src/chrome/crypto");
    const session = await import("../../src/chrome/sessionCache");
    await session.clearAllAuthState();
    chromeHarness.stores.sync.autoLockTimeout = AUTO_LOCK_TIMEOUT;
    session.updateCachedAutoLockTimeout(AUTO_LOCK_TIMEOUT);
    const vaultKeyBytes = cryptoModule.generateVaultKey();
    const passkeyBinding = Buffer.alloc(32, 0xc6).toString("base64");
    await session.storePasskeySessionAtomic(
      "timeout-change-session",
      vaultKeyBytes,
      passkeyBinding,
      { autoLockTimeout: AUTO_LOCK_TIMEOUT },
    );

    assert.equal(await session.setAutoLockTimeout(300_000), true);
    assert.deepEqual(chromeHarness.stores.session, {});
    assert.equal(chromeHarness.stores.local.sessionEncKey, undefined);

    let unlockCalls = 0;
    assert.equal(
      await session.tryRestoreSession(async () => {
        unlockCalls += 1;
        return { success: true, passwordType: "master" as const };
      }),
      false,
    );
    assert.equal(unlockCalls, 0);
  } finally {
    chromeHarness.restore();
  }
});
