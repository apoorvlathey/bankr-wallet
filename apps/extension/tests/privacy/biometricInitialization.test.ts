import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import test from "node:test";

import type { Account } from "../../src/chrome/types";
import { createChromeStorageHarness } from "../helpers/chromeStorageHarness";

function account(type: Account["type"]): Account {
  const base = {
    id: `${type}-account`,
    type,
    address: `0x${"44".repeat(20)}`,
    createdAt: 1,
  };
  return type === "seedPhrase"
    ? { ...base, type, seedGroupId: "seed-group", derivationIndex: 0 }
    : base as Account;
}

test("an existing biometric factor initializes Shield for every custody wallet type", async () => {
  const authTransition = await import("../../src/chrome/authTransition");
  const cryptoModule = await import("../../src/chrome/crypto");
  const identity = await import("../../src/chrome/privacy/identity");
  const passkey = await import("../../src/chrome/passkeyUnlock");
  const passkeyCrypto = await import("../../src/chrome/passkeyUnlockCrypto");
  const privacyCrypto = await import("../../src/chrome/privacy/crypto");
  const privacyDeposit = await import("../../src/chrome/privacy/deposit/prepare");
  const privacyOperation = await import("../../src/chrome/privacy/operations/prepare");
  const privacyVault = await import("../../src/chrome/privacy/vault");
  const session = await import("../../src/chrome/sessionCache");

  for (const type of ["bankr", "privateKey", "seedPhrase"] as const) {
    const selected = account(type);
    const harness = createChromeStorageHarness({
      local: { accounts: [selected] },
      sync: { activeAccountId: selected.id, autoLockTimeout: 60_000 },
    });
    const vaultKeyBytes = cryptoModule.generateVaultKey();
    const prfKeyMaterial = Buffer.alloc(32, type.length).toString("base64url");
    const payload = {
      credentialId: Buffer.alloc(64, type.length + 1).toString("base64url"),
      prfSalt: Buffer.alloc(32, type.length + 2).toString("base64url"),
      prfKeyMaterial,
      authCeremonyEpoch: authTransition.getAuthCeremonyEpoch(),
    };

    session.clearInMemoryAuthCache();
    try {
      const built = await passkeyCrypto.buildPasskeyRecord(
        payload,
        vaultKeyBytes,
      );
      assert.ok(built.record);
      harness.stores.local.passkeyUnlock = built.record;

      assert.deepEqual(await passkey.handleUnlockWithPasskey(payload), {
        success: true,
      });
      const scaffold = harness.stores.local.privacyVault as {
        masterWrappedKey?: unknown;
        passkeyWrappedKey?: unknown;
        recovery: unknown;
      };
      assert.ok(scaffold.passkeyWrappedKey);
      assert.equal(scaffold.masterWrappedKey, undefined);
      assert.equal(scaffold.recovery, null);
      assert.ok(session.getCachedPrivacyKey());

      assert.deepEqual(await identity.ensurePrivacyIdentityInitialized(), {
        success: true,
        status: "ready",
      });

      const review = await privacyDeposit.preparePrivacyShieldReview(
        {
          accountId: selected.id,
          accountAddress: selected.address,
          accountType: selected.type,
          amount: "0.1",
        },
        {
          quotePrivacyShield: async () => ({
            chainId: 11_155_111,
            amountWei: "100000000000000000",
            balanceWei: "500000000000000000",
            minimumAmountWei: "1000000000000000",
            protocolFeeWei: "1000000000000000",
            shieldedAmountWei: "99000000000000000",
            gasReserveWei: "200000000000000",
            totalRequiredWei: "100200000000000000",
            maxShieldableWei: "499800000000000000",
            vettingFeeBPS: "100",
            canAfford: true,
          }),
        },
      );
      assert.equal(review.intent.submittable, false);
      assert.equal(review.accountType, type);

      const prepareOperation = () =>
        privacyOperation.preparePrivacyShieldOperation(
          {
            requestId: "00000000-0000-4000-8000-000000000003",
            accountId: selected.id,
            accountAddress: selected.address,
            accountType: selected.type,
            amount: "0.1",
          },
          {
            verifyDeployment: async () => {},
            quotePrivacyShield: async () => ({
              chainId: 11_155_111,
              amountWei: "100000000000000000",
              balanceWei: "500000000000000000",
              minimumAmountWei: "1000000000000000",
              protocolFeeWei: "1000000000000000",
              shieldedAmountWei: "99000000000000000",
              gasReserveWei: "200000000000000",
              totalRequiredWei: "100200000000000000",
              maxShieldableWei: "499800000000000000",
              vettingFeeBPS: "100",
              canAfford: true,
            }),
            getAccountById: async () => selected,
            findOperation: async () => null,
            readNextDepositIndex: async () => 0,
            createOperationId: () =>
              `00000000-0000-4000-8000-${type.length.toString().padStart(12, "0")}`,
            now: () => 100,
            commitOperation: async (operation) => ({
              status: "created",
              operation,
            }),
          },
        );
      if (type === "bankr") {
        await assert.rejects(
          prepareOperation(),
          (error: unknown) =>
            error instanceof privacyOperation.PrivacyShieldOperationError &&
            error.code === "bankr-testnet-unsupported",
        );
      } else {
        const operation = await prepareOperation();
        assert.equal(operation.accountType, type);
        assert.equal(operation.state, "awaiting_wallet_confirmation");
      }

      const unlockedPrivacy = await privacyVault.unlockPrivacyVaultWithPasskey(
        prfKeyMaterial,
      );
      assert.ok(unlockedPrivacy);
      const initialized = harness.stores.local.privacyVault as {
        keyId: string;
        recovery: Parameters<typeof privacyCrypto.decryptPrivacyRecovery>[2];
      };
      assert.ok(
        await privacyCrypto.decryptPrivacyRecovery(
          unlockedPrivacy.key,
          initialized.keyId,
          initialized.recovery,
        ),
      );
      unlockedPrivacy.keyBytes.fill(0);
    } finally {
      vaultKeyBytes.fill(0);
      session.clearInMemoryAuthCache();
      harness.restore();
    }
  }
});

test("biometric unlock does not initialize recovery for an impersonator", async () => {
  const authTransition = await import("../../src/chrome/authTransition");
  const cryptoModule = await import("../../src/chrome/crypto");
  const identity = await import("../../src/chrome/privacy/identity");
  const passkey = await import("../../src/chrome/passkeyUnlock");
  const passkeyCrypto = await import("../../src/chrome/passkeyUnlockCrypto");
  const session = await import("../../src/chrome/sessionCache");
  const selected = account("impersonator");
  const harness = createChromeStorageHarness({
    local: { accounts: [selected] },
    sync: { activeAccountId: selected.id, autoLockTimeout: 60_000 },
  });
  const vaultKeyBytes = cryptoModule.generateVaultKey();
  const payload = {
    credentialId: Buffer.alloc(64, 0x71).toString("base64url"),
    prfSalt: Buffer.alloc(32, 0x72).toString("base64url"),
    prfKeyMaterial: Buffer.alloc(32, 0x73).toString("base64url"),
    authCeremonyEpoch: authTransition.getAuthCeremonyEpoch(),
  };

  session.clearInMemoryAuthCache();
  try {
    const built = await passkeyCrypto.buildPasskeyRecord(payload, vaultKeyBytes);
    assert.ok(built.record);
    harness.stores.local.passkeyUnlock = built.record;
    assert.equal((await passkey.handleUnlockWithPasskey(payload)).success, true);
    assert.equal((await identity.ensurePrivacyIdentityInitialized()).success, false);
    assert.equal(
      (harness.stores.local.privacyVault as { recovery: unknown }).recovery,
      null,
    );
  } finally {
    vaultKeyBytes.fill(0);
    session.clearInMemoryAuthCache();
    harness.restore();
  }
});
