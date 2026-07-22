import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import test from "node:test";
import { recoverMessageAddress, stringToHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

import { createChromeStorageHarness } from "../helpers/chromeStorageHarness";

const MASTER_PASSWORD = "passkey-never-master-password";
const API_KEY = "passkey-never-bankr-api-key";
const BANKR_PRIVATE_KEY = `0x${"21".repeat(32)}` as `0x${string}`;
const PRIVATE_KEY = `0x${"31".repeat(32)}` as `0x${string}`;
const SEED_PRIVATE_KEY = `0x${"42".repeat(32)}` as `0x${string}`;
const MNEMONIC =
  "test test test test test test test test test test test junk";
const originalFetch = globalThis.fetch;

function clearRecord(record: Record<string, unknown>): void {
  for (const key of Object.keys(record)) delete record[key];
}

function flipBase64Byte(value: string): string {
  const bytes = Buffer.from(value, "base64");
  bytes[0] ^= 1;
  return bytes.toString("base64");
}

test("Never-mode passkey sessions reopen every routine wallet path without persisting wallet secrets", async (t) => {
  const chromeHarness = createChromeStorageHarness({
    sync: { autoLockTimeout: 0 },
  });

  try {
    const auth = await import("../../src/chrome/authHandlers");
    const authTransition = await import("../../src/chrome/authTransition");
    const cryptoModule = await import("../../src/chrome/crypto");
    const mnemonicModule = await import("../../src/chrome/mnemonicStorage");
    const passkey = await import("../../src/chrome/passkeyUnlock");
    const passkeyCrypto = await import("../../src/chrome/passkeyUnlockCrypto");
    const reveal = await import("../../src/chrome/secretRevealHandlers");
    const signatureHandlers = await import(
      "../../src/chrome/signatures/confirmationHandlers"
    );
    const pendingSignatures = await import(
      "../../src/chrome/requests/pendingSignatureStorage"
    );
    const pendingTransactions = await import(
      "../../src/chrome/requests/pendingTxStorage"
    );
    const pinnedRequests = await import(
      "../../src/chrome/requests/pinnedRequest"
    );
    const session = await import("../../src/chrome/sessionCache");
    const signer = await import("../../src/chrome/localSigner");
    const transactionHandlers = await import("../../src/chrome/txHandlers");
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
        chromeHarness.stores.sync.autoLockTimeout = 0;
        session.updateCachedAutoLockTimeout(0);

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
        assert.equal(built.success, true);
        assert.ok(built.record);
        chromeHarness.stores.local.passkeyUnlock = built.record;

        if (walletType === "bankr") {
          chromeHarness.stores.local.accounts = [
            {
              id: "bankr-account",
              type: "bankr",
              address: privateKeyToAccount(BANKR_PRIVATE_KEY).address,
              createdAt: 1,
            },
          ];
          chromeHarness.stores.local.encryptedApiKeyVault =
            await cryptoModule.encryptWithVaultKey(vaultKey, API_KEY);
        } else {
          const privateKey =
            walletType === "privateKey" ? PRIVATE_KEY : SEED_PRIVATE_KEY;
          const accountId = `${walletType}-account`;
          chromeHarness.stores.local.accounts = [
            {
              id: accountId,
              type: walletType,
              address: signer.deriveAddress(privateKey),
              ...(walletType === "seedPhrase"
                ? { seedGroupId: "seed-group", derivationIndex: 0 }
                : {}),
              createdAt: 1,
            },
          ];
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
          if (walletType === "seedPhrase") {
            await mnemonicModule.storeMnemonic("seed-group", MNEMONIC, {
              kind: "password",
              password: MASTER_PASSWORD,
            });
          }
        }

        const unlocked = await passkey.handleUnlockWithPasskey(payload);
        assert.deepEqual(unlocked, { success: true });
        assert.ok(chromeHarness.stores.session.encryptedSessionCapabilities);
        assert.equal(
          (chromeHarness.stores.session.encryptedSessionCapabilities as {
            unlockMethod: string;
          }).unlockMethod,
          "passkey",
        );
        assert.equal(
          chromeHarness.stores.session.encryptedSessionPassword,
          undefined,
        );
        assert.equal(session.getCachedPassword(), null);
        assert.equal(session.getPasswordType(), "master");

        const persistedState = JSON.stringify({
          local: chromeHarness.stores.local,
          session: chromeHarness.stores.session,
        });
        for (const secret of [
          MASTER_PASSWORD,
          API_KEY,
          PRIVATE_KEY,
          SEED_PRIVATE_KEY,
          MNEMONIC,
          payload.prfKeyMaterial,
          Buffer.from(payload.prfKeyMaterial, "base64url").toString("base64"),
          Buffer.from(vaultKeyBytes).toString("base64"),
        ]) {
          assert.equal(
            persistedState.includes(secret),
            false,
            `persisted session exposed ${secret.slice(0, 12)}`,
          );
        }

        session.clearInMemoryAuthCache();
        let inspectedCallStackCapability = false;
        const restored = await session.tryRestoreSession(
          async (credential) => {
            assert.notEqual(typeof credential, "string");
            inspectedCallStackCapability = true;
            assert.deepEqual(Object.keys(credential), []);
            assert.equal(JSON.stringify(credential), "{}");
            assert.deepEqual(structuredClone(credential), {});
            return auth.handleUnlockWallet(credential);
          },
        );
        assert.equal(restored, true);
        assert.equal(inspectedCallStackCapability, true);
        assert.equal(session.getCachedPassword(), null);
        assert.equal(session.getPasswordType(), "master");
        assert.equal(session.getCachedMnemonicKey(), null);
        assert.equal(session.isWalletUnlocked(), true);

        if (walletType === "bankr") {
          assert.equal(session.getCachedApiKey(), API_KEY);
        } else {
          const accountId = `${walletType}-account`;
          const expectedPrivateKey =
            walletType === "privateKey" ? PRIVATE_KEY : SEED_PRIVATE_KEY;
          const restoredPrivateKey = session.getPrivateKeyFromCache(accountId);
          assert.equal(restoredPrivateKey, expectedPrivateKey);
          assert.match(
            await signer.signMessage(restoredPrivateKey!, "restored session"),
            /^0x[0-9a-f]{130}$/i,
          );

          let revealResult: { success: boolean } | null = null;
          await reveal.handleRevealPrivateKey(
            accountId,
            "not-the-master-password",
            (result) => {
              revealResult = result;
            },
          );
          assert.equal(revealResult?.success, false);
          if (walletType === "seedPhrase") {
            revealResult = null;
            await reveal.handleRevealSeedPhrase(
              "seed-group",
              "not-the-master-password",
              (result) => {
                revealResult = result;
              },
            );
            assert.equal(revealResult?.success, false);
          }
        }

        const account = (
          chromeHarness.stores.local.accounts as Array<{
            id: string;
            type: "bankr" | "privateKey" | "seedPhrase";
            address: string;
            createdAt: number;
            seedGroupId?: string;
            derivationIndex?: number;
          }>
        )[0];
        const message = `cold restored ${walletType} confirmation`;
        const signatureId = `${walletType}-cold-signature`;
        await pendingSignatures.savePendingSignatureRequest(
          pinnedRequests.pinnedSignatureRequest(account, {
            id: signatureId,
            signature: {
              method: "personal_sign",
              params: [stringToHex(message), account.address],
              chainId: 1,
            },
            origin: "WalletChan",
            favicon: null,
            chainName: "Ethereum",
            timestamp: Date.now(),
            trustedInternal: true,
          }),
        );
        session.clearInMemoryAuthCache();

        const bankrRequests: Array<{
          url: string;
          apiKey: string | null;
          body: Record<string, unknown>;
        }> = [];
        if (walletType === "bankr") {
          const bankrAccount = privateKeyToAccount(BANKR_PRIVATE_KEY);
          globalThis.fetch = async (input, init) => {
            const url = String(input);
            const body = JSON.parse(String(init?.body)) as {
              message: string;
              signatureType: string;
            };
            bankrRequests.push({
              url,
              apiKey: new Headers(init?.headers).get("X-API-Key"),
              body,
            });
            if (url.endsWith("/wallet/submit")) {
              return new Response(
                JSON.stringify({
                  success: true,
                  transactionHash: `0x${"ab".repeat(32)}`,
                  status: "success",
                  signer: bankrAccount.address,
                  chainId: 1,
                }),
                { status: 200 },
              );
            }
            const signature = await bankrAccount.signMessage({
              message: body.message,
            });
            return new Response(
              JSON.stringify({
                success: true,
                signature,
                signer: bankrAccount.address,
                signatureType: body.signatureType,
              }),
              { status: 200 },
            );
          };
        }

        const confirmation =
          walletType === "bankr"
            ? await signatureHandlers.handleConfirmSignatureRequestBankr(
                signatureId,
                "intentionally-wrong-password",
              )
            : await signatureHandlers.handleConfirmSignatureRequest(
                signatureId,
                "intentionally-wrong-password",
              );
        assert.equal(confirmation.success, true, confirmation.error);
        assert.equal(
          await recoverMessageAddress({
            message,
            signature: confirmation.signature as `0x${string}`,
          }),
          account.address,
        );
        assert.equal(
          await pendingSignatures.getPendingSignatureRequestById(signatureId),
          null,
        );
        if (walletType === "bankr") {
          assert.equal(bankrRequests[0]?.apiKey, API_KEY);

          const txId = "bankr-cold-transaction";
          await pendingTransactions.savePendingTxRequest(
            pinnedRequests.pinnedTxRequest(account, {
              id: txId,
              tx: {
                from: account.address,
                to: "0x1111111111111111111111111111111111111111",
                value: "0x1",
                data: "0x",
                chainId: 1,
              },
              origin: "WalletChan",
              favicon: null,
              chainName: "Ethereum",
              timestamp: Date.now(),
              trustedInternal: true,
            }),
          );
          session.clearInMemoryAuthCache();
          const txResult = await transactionHandlers.handleConfirmTransaction(
            txId,
            "intentionally-wrong-password",
          );
          assert.deepEqual(txResult, {
            success: true,
            txHash: `0x${"ab".repeat(32)}`,
          });
          assert.equal(
            await pendingTransactions.getPendingTxRequestById(txId),
            null,
          );
          assert.equal(bankrRequests.length, 3);
          assert.ok(bankrRequests.every((request) => request.apiKey === API_KEY));
          assert.match(bankrRequests[1].url, /\/wallet\/sign$/);
          assert.match(bankrRequests[2].url, /\/wallet\/submit$/);
          assert.deepEqual(bankrRequests[2].body, {
            transaction: {
              to: "0x1111111111111111111111111111111111111111",
              chainId: 1,
              value: "1",
            },
            waitForConfirmation: true,
          });
        }
        globalThis.fetch = originalFetch;
      });
    }

    await t.test("view-only impersonator stays reject-only", async () => {
      const account = {
        id: "view-only-account",
        type: "impersonator" as const,
        address: "0x2222222222222222222222222222222222222222",
        createdAt: 1,
      };
      chromeHarness.stores.local.accounts = [account];
      const signatureId = "view-only-cold-signature";
      await pendingSignatures.savePendingSignatureRequest(
        pinnedRequests.pinnedSignatureRequest(account, {
          id: signatureId,
          signature: {
            method: "personal_sign",
            params: [stringToHex("must stay view only"), account.address],
            chainId: 1,
          },
          origin: "WalletChan",
          favicon: null,
          chainName: "Ethereum",
          timestamp: Date.now(),
          trustedInternal: true,
        }),
      );
      session.clearInMemoryAuthCache();
      let fetchCalls = 0;
      globalThis.fetch = async () => {
        fetchCalls += 1;
        throw new Error("view-only confirmation must not reach a signer");
      };

      const localResult =
        await signatureHandlers.handleConfirmSignatureRequest(
          signatureId,
          "intentionally-wrong-password",
        );
      const bankrResult =
        await signatureHandlers.handleConfirmSignatureRequestBankr(
          signatureId,
          "intentionally-wrong-password",
        );
      assert.equal(localResult.success, false);
      assert.equal(bankrResult.success, false);
      assert.equal(fetchCalls, 0);
      assert.equal(session.getPasswordType(), null);
      assert.ok(
        await pendingSignatures.getPendingSignatureRequestById(signatureId),
      );

      const txId = "view-only-cold-transaction";
      await pendingTransactions.savePendingTxRequest(
        pinnedRequests.pinnedTxRequest(account, {
          id: txId,
          tx: {
            from: account.address,
            to: "0x3333333333333333333333333333333333333333",
            value: "0x1",
            chainId: 1,
          },
          origin: "WalletChan",
          favicon: null,
          chainName: "Ethereum",
          timestamp: Date.now(),
          trustedInternal: true,
        }),
      );
      assert.equal(
        (
          await transactionHandlers.handleConfirmTransaction(
            txId,
            "intentionally-wrong-password",
          )
        ).success,
        false,
      );
      assert.equal(
        (
          await transactionHandlers.handleConfirmTransactionAsyncPK(
            txId,
            "intentionally-wrong-password",
          )
        ).success,
        false,
      );
      assert.equal(fetchCalls, 0);
      assert.ok(await pendingTransactions.getPendingTxRequestById(txId));
      globalThis.fetch = originalFetch;
    });
  } finally {
    globalThis.fetch = originalFetch;
    chromeHarness.restore();
  }
});

test("manual lock is ordered after an in-flight passkey session restore", async () => {
  const chromeHarness = createChromeStorageHarness({
    sync: { autoLockTimeout: 0 },
  });

  try {
    const authTransition = await import("../../src/chrome/authTransition");
    const cryptoModule = await import("../../src/chrome/crypto");
    const passkeyCrypto = await import(
      "../../src/chrome/passkeyUnlockCrypto"
    );
    const passkeyBinding = await import(
      "../../src/chrome/passkey/sessionBinding"
    );
    const session = await import("../../src/chrome/sessionCache");

    await session.clearAllAuthState();
    session.updateCachedAutoLockTimeout(0);
    const vaultKeyBytes = cryptoModule.generateVaultKey();
    const built = await passkeyCrypto.buildPasskeyRecord(
      {
        credentialId: Buffer.alloc(64, 0x81).toString("base64url"),
        prfSalt: Buffer.alloc(32, 0x82).toString("base64url"),
        prfKeyMaterial: Buffer.alloc(32, 0x83).toString("base64url"),
        authCeremonyEpoch: "record-only",
      },
      vaultKeyBytes,
    );
    assert.ok(built.record);
    chromeHarness.stores.local.passkeyUnlock = built.record;
    await session.storePasskeySessionAtomic(
      "passkey-race-session",
      vaultKeyBytes,
      await passkeyBinding.getPasskeySessionBinding(built.record),
    );
    session.clearInMemoryAuthCache();

    let releaseUnlock!: () => void;
    let markUnlockStarted!: () => void;
    const unlockGate = new Promise<void>((resolve) => {
      releaseUnlock = resolve;
    });
    const unlockStarted = new Promise<void>((resolve) => {
      markUnlockStarted = resolve;
    });

    const restore = session.tryRestoreSession(async (credential) => {
      assert.notEqual(typeof credential, "string");
      session.setCachedPasswordType("master");
      session.setCachedVaultKey(await cryptoModule.importVaultKey(vaultKeyBytes));
      markUnlockStarted();
      await unlockGate;
      return { success: true, passwordType: "master" as const };
    });

    await unlockStarted;
    let lockFinished = false;
    const lock = authTransition
      .runSerializedAuthTransition(() => session.clearAllAuthState())
      .then(() => {
        lockFinished = true;
      });
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    assert.equal(lockFinished, false);

    releaseUnlock();
    assert.equal(await restore, true);
    await lock;

    assert.equal(session.isWalletUnlocked(), false);
    assert.equal(session.getCachedVaultKey(), null);
    assert.equal(session.getPasswordType(), null);
    assert.deepEqual(chromeHarness.stores.session, {});
    assert.equal(chromeHarness.stores.local.sessionEncKey, undefined);
  } finally {
    chromeHarness.restore();
  }
});

test("removing the passkey factor revokes its Never-session capability", async () => {
  const chromeHarness = createChromeStorageHarness({
    local: { accounts: [] },
    sync: { autoLockTimeout: 0 },
  });

  try {
    const cryptoModule = await import("../../src/chrome/crypto");
    const passkey = await import("../../src/chrome/passkeyUnlock");
    const passkeyCrypto = await import(
      "../../src/chrome/passkeyUnlockCrypto"
    );
    const passkeyBinding = await import(
      "../../src/chrome/passkey/sessionBinding"
    );
    const session = await import("../../src/chrome/sessionCache");

    await session.clearAllAuthState();
    session.updateCachedAutoLockTimeout(0);
    const vaultKeyBytes = cryptoModule.generateVaultKey();
    chromeHarness.stores.local.encryptedVaultKeyMaster =
      await cryptoModule.encryptVaultKey(vaultKeyBytes, MASTER_PASSWORD);
    const built = await passkeyCrypto.buildPasskeyRecord(
      {
        credentialId: Buffer.alloc(64, 0x91).toString("base64url"),
        prfSalt: Buffer.alloc(32, 0x92).toString("base64url"),
        prfKeyMaterial: Buffer.alloc(32, 0x93).toString("base64url"),
        authCeremonyEpoch: "record-only",
      },
      vaultKeyBytes,
    );
    assert.ok(built.record);
    chromeHarness.stores.local.passkeyUnlock = built.record;
    await session.storePasskeySessionAtomic(
      "passkey-removal-session",
      vaultKeyBytes,
      await passkeyBinding.getPasskeySessionBinding(built.record),
    );

    const removed = await passkey.handleRemovePasskeyUnlock(MASTER_PASSWORD);
    assert.equal(removed.success, true);
    assert.equal(chromeHarness.stores.local.passkeyUnlock, undefined);
    assert.equal(chromeHarness.stores.local.sessionEncKey, undefined);
    assert.deepEqual(chromeHarness.stores.session, {});

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

test("passkey session envelopes fail closed on tampering, stale factors, and timed settings", async (t) => {
  const chromeHarness = createChromeStorageHarness({
    sync: { autoLockTimeout: 0 },
  });

  try {
    const auth = await import("../../src/chrome/authHandlers");
    const cryptoModule = await import("../../src/chrome/crypto");
    const passkeyCrypto = await import("../../src/chrome/passkeyUnlockCrypto");
    const passkeyBinding = await import(
      "../../src/chrome/passkey/sessionBinding"
    );
    const session = await import("../../src/chrome/sessionCache");

    const vaultKeyBytes = cryptoModule.generateVaultKey();
    const payload = {
      credentialId: Buffer.alloc(64, 0x61).toString("base64url"),
      prfSalt: Buffer.alloc(32, 0x62).toString("base64url"),
      prfKeyMaterial: Buffer.alloc(32, 0x63).toString("base64url"),
      authCeremonyEpoch: "not-used-for-record-construction",
    };
    const built = await passkeyCrypto.buildPasskeyRecord(
      payload,
      vaultKeyBytes,
    );
    assert.ok(built.record);
    chromeHarness.stores.local.passkeyUnlock = built.record;
    chromeHarness.stores.local.accounts = [
      {
        id: "view-only-account",
        type: "impersonator",
        address: "0x2222222222222222222222222222222222222222",
        createdAt: 1,
      },
    ];
    session.updateCachedAutoLockTimeout(0);
    await session.storePasskeySessionAtomic(
      "tamper-session",
      vaultKeyBytes,
      await passkeyBinding.getPasskeySessionBinding(built.record),
    );

    const validLocal = structuredClone(chromeHarness.stores.local);
    const validSync = structuredClone(chromeHarness.stores.sync);
    const validSession = structuredClone(chromeHarness.stores.session);

    const cases: Array<{
      name: string;
      expectedUnlockCalls: number;
      mutate: () => void;
    }> = [
      {
        name: "ciphertext authentication failure",
        expectedUnlockCalls: 0,
        mutate: () => {
          const record = chromeHarness.stores.session
            .encryptedSessionVaultKey as { data: string };
          record.data = flipBase64Byte(record.data);
        },
      },
      {
        name: "wrong IV size",
        expectedUnlockCalls: 0,
        mutate: () => {
          const record = chromeHarness.stores.session
            .encryptedSessionVaultKey as { iv: string };
          record.iv = Buffer.alloc(11).toString("base64");
        },
      },
      {
        name: "unknown envelope field",
        expectedUnlockCalls: 0,
        mutate: () => {
          const record = chromeHarness.stores.session
            .encryptedSessionVaultKey as Record<string, unknown>;
          record.untrusted = true;
        },
      },
      {
        name: "binding metadata tamper",
        expectedUnlockCalls: 0,
        mutate: () => {
          const record = chromeHarness.stores.session
            .encryptedSessionVaultKey as { passkeyBinding: string };
          record.passkeyBinding = Buffer.alloc(32, 0x7f).toString("base64");
        },
      },
      {
        name: "session ID tamper",
        expectedUnlockCalls: 0,
        mutate: () => {
          chromeHarness.stores.session.sessionId = "different-session";
        },
      },
      {
        name: "missing session ID",
        expectedUnlockCalls: 0,
        mutate: () => {
          delete chromeHarness.stores.session.sessionId;
        },
      },
      {
        name: "missing credential discriminator",
        expectedUnlockCalls: 0,
        mutate: () => {
          delete chromeHarness.stores.session.sessionCredentialKind;
        },
      },
      {
        name: "unknown credential discriminator",
        expectedUnlockCalls: 0,
        mutate: () => {
          chromeHarness.stores.session.sessionCredentialKind = "unknown";
        },
      },
      {
        name: "agent metadata cannot upgrade a passkey capability",
        expectedUnlockCalls: 0,
        mutate: () => {
          chromeHarness.stores.session.passwordType = "agent";
        },
      },
      {
        name: "ambiguous password and passkey credentials",
        expectedUnlockCalls: 0,
        mutate: () => {
          chromeHarness.stores.session.encryptedSessionPassword = {
            data: "ambiguous",
            iv: "ambiguous",
          };
        },
      },
      {
        name: "replaced passkey factor",
        expectedUnlockCalls: 1,
        mutate: () => {
          (chromeHarness.stores.local.passkeyUnlock as { createdAt: number })
            .createdAt += 1;
        },
      },
      {
        name: "timed setting",
        expectedUnlockCalls: 0,
        mutate: () => {
          chromeHarness.stores.sync.autoLockTimeout = 300_000;
        },
      },
    ];

    for (const entry of cases) {
      await t.test(entry.name, async () => {
        session.clearInMemoryAuthCache();
        clearRecord(chromeHarness.stores.local);
        clearRecord(chromeHarness.stores.sync);
        clearRecord(chromeHarness.stores.session);
        Object.assign(chromeHarness.stores.local, structuredClone(validLocal));
        Object.assign(chromeHarness.stores.sync, structuredClone(validSync));
        Object.assign(
          chromeHarness.stores.session,
          structuredClone(validSession),
        );
        session.updateCachedAutoLockTimeout(0);
        entry.mutate();

        let unlockCalls = 0;
        const restored = await session.tryRestoreSession(async (credential) => {
          unlockCalls += 1;
          return auth.handleUnlockWallet(credential);
        });
        assert.equal(restored, false);
        assert.equal(unlockCalls, entry.expectedUnlockCalls);
        assert.equal(session.isWalletUnlocked(), false);
        assert.equal(session.getCachedPassword(), null);
        assert.equal(session.getCachedVaultKey(), null);
        assert.deepEqual(chromeHarness.stores.session, {});
        assert.equal(chromeHarness.stores.local.sessionEncKey, undefined);
      });
    }

    session.clearInMemoryAuthCache();
    const forged = await auth.handleUnlockWallet({
      vaultKeyBytes,
      passkeyBinding: await passkeyBinding.getPasskeySessionBinding(
        built.record,
      ),
    } as never);
    assert.equal(forged.success, false);
    assert.equal(session.isWalletUnlocked(), false);
  } finally {
    chromeHarness.restore();
  }
});

test("passkey session persistence failures never leave a half-unlocked wallet", async (t) => {
  for (const failure of ["session-ciphertext", "local-key"] as const) {
    await t.test(failure, async () => {
      const chromeHarness = createChromeStorageHarness({
        sync: { autoLockTimeout: 0 },
      });
      try {
        const authTransition = await import("../../src/chrome/authTransition");
        const cryptoModule = await import("../../src/chrome/crypto");
        const passkey = await import("../../src/chrome/passkeyUnlock");
        const passkeyCrypto = await import(
          "../../src/chrome/passkeyUnlockCrypto"
        );
        const session = await import("../../src/chrome/sessionCache");

        await session.clearAllAuthState();
        session.updateCachedAutoLockTimeout(0);
        const vaultKeyBytes = cryptoModule.generateVaultKey();
        const payload = {
          credentialId: Buffer.alloc(64, 0x71).toString("base64url"),
          prfSalt: Buffer.alloc(32, 0x72).toString("base64url"),
          prfKeyMaterial: Buffer.alloc(32, 0x73).toString("base64url"),
          authCeremonyEpoch: authTransition.getAuthCeremonyEpoch(),
        };
        const built = await passkeyCrypto.buildPasskeyRecord(
          payload,
          vaultKeyBytes,
        );
        assert.ok(built.record);
        chromeHarness.stores.local.passkeyUnlock = built.record;
        chromeHarness.stores.local.accounts = [
          {
            id: "view-only-account",
            type: "impersonator",
            address: "0x3333333333333333333333333333333333333333",
            createdAt: 1,
          },
        ];
        chromeHarness.failNext(
          failure === "session-ciphertext"
            ? {
                area: "session",
                operation: "set",
                key: "encryptedSessionCapabilities",
              }
            : {
                area: "local",
                operation: "set",
                key: "sessionEncKey",
              },
        );

        const result = await passkey.handleUnlockWithPasskey(payload);
        assert.equal(result.success, false);
        assert.equal(session.isWalletUnlocked(), false);
        assert.equal(session.getCachedPassword(), null);
        assert.equal(session.getCachedVaultKey(), null);
        assert.deepEqual(chromeHarness.stores.session, {});
        assert.equal(chromeHarness.stores.local.sessionEncKey, undefined);
      } finally {
        chromeHarness.restore();
      }
    });
  }
});
