import assert from "node:assert/strict";
import test from "node:test";

import type { Account, AccountType } from "../../src/chrome/types";
import {
  preparePrivacyShieldOperation,
  PrivacyShieldOperationError,
} from "../../src/chrome/privacy/operations/prepare";
import { decryptPrivacyShieldOperationDetails } from "../../src/chrome/privacy/operations/crypto";
import type { StoredPrivacyShieldOperationV1 } from "../../src/chrome/privacy/operations/types";
import { createChromeStorageHarness } from "../helpers/chromeStorageHarness";

const MASTER_PASSWORD = "privacy-operation-master";
const ADDRESS = "0x1111111111111111111111111111111111111111";
const REQUEST_ID = "00000000-0000-4000-8000-000000000002";

function account(type: AccountType): Account {
  return {
    id: `${type}-operation`,
    type,
    address: ADDRESS,
    createdAt: 1,
    ...(type === "seedPhrase"
      ? { seedGroupId: "seed-operation", derivationIndex: 0 }
      : {}),
  } as Account;
}

function quote(canAfford = true) {
  return Object.freeze({
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
    canAfford,
  });
}

async function establishMasterSession() {
  const cryptoModule = await import("../../src/chrome/crypto");
  const session = await import("../../src/chrome/sessionCache");
  session.clearInMemoryAuthCache();
  session.setCachedVaultKey(
    await cryptoModule.importVaultKey(cryptoModule.generateVaultKey()),
  );
  session.setCachedPasswordType("master");
  session.setCachedPasswordDirect(MASTER_PASSWORD);
  return session;
}

test("operation preparation reserves one encrypted index for both Sepolia-capable local wallets", async () => {
  const identity = await import("../../src/chrome/privacy/identity");

  for (const [position, type] of ["privateKey", "seedPhrase"].entries()) {
    const source = account(type as AccountType);
    const harness = createChromeStorageHarness({
      local: { accounts: [source] },
      sync: { activeAccountId: source.id, autoLockTimeout: 60_000 },
    });
    const session = await establishMasterSession();
    let committed: StoredPrivacyShieldOperationV1 | null = null;
    try {
      assert.equal((await identity.ensurePrivacyIdentityInitialized()).success, true);
      const result = await preparePrivacyShieldOperation(
        {
          requestId: REQUEST_ID,
          accountId: source.id,
          accountAddress: source.address,
          accountType: source.type,
          amount: "0.1",
        },
        {
          verifyDeployment: async () => {},
          quotePrivacyShield: async () => quote(),
          getAccountById: async () => source,
          findOperation: async () => null,
          readNextDepositIndex: async () => position,
          createOperationId: () =>
            `00000000-0000-4000-8000-${(position + 1).toString().padStart(12, "0")}`,
          now: () => 100 + position,
          commitOperation: async (operation) => {
            committed = operation;
            return { status: "created", operation };
          },
        },
      );
      assert.equal(result.accountType, type);
      assert.equal(result.state, "awaiting_wallet_confirmation");
      assert.ok(committed);
      const privacyKey = session.getCachedPrivacyKey();
      assert.ok(privacyKey);
      const details = await decryptPrivacyShieldOperationDetails(
        privacyKey.key,
        committed.keyId,
        committed.summary,
        committed.encryptedDetails,
      );
      assert.ok(details);
      assert.equal(details.depositIndex, position.toString());
      assert.equal("nullifier" in details, false);
      assert.equal("secret" in details, false);
    } finally {
      session.clearInMemoryAuthCache();
      harness.restore();
    }
  }
});

test("operation preparation rejects Bankr because its raw submit API has no Sepolia support", async () => {
  const source = account("bankr");
  const harness = createChromeStorageHarness({
    local: { accounts: [source] },
    sync: { activeAccountId: source.id, autoLockTimeout: 60_000 },
  });
  const session = await establishMasterSession();
  try {
    await assert.rejects(
      preparePrivacyShieldOperation({
        requestId: REQUEST_ID,
        accountId: source.id,
        accountAddress: source.address,
        accountType: source.type,
        amount: "0.1",
      }),
      (error: unknown) =>
        error instanceof PrivacyShieldOperationError &&
        error.code === "bankr-testnet-unsupported",
    );
  } finally {
    session.clearInMemoryAuthCache();
    harness.restore();
  }
});

test("operation preparation blocks agent sessions", async () => {
  const identity = await import("../../src/chrome/privacy/identity");
  const source = account("privateKey");
  const harness = createChromeStorageHarness({
    local: { accounts: [source] },
    sync: { activeAccountId: source.id, autoLockTimeout: 60_000 },
  });
  const session = await establishMasterSession();
  try {
    assert.equal((await identity.ensurePrivacyIdentityInitialized()).success, true);
    session.setCachedPasswordType("agent");
    await assert.rejects(
      preparePrivacyShieldOperation({
        requestId: REQUEST_ID,
        accountId: source.id,
        accountAddress: source.address,
        accountType: source.type,
        amount: "0.1",
      }),
      (error: unknown) =>
        error instanceof PrivacyShieldOperationError &&
        error.code === "auth-required",
    );
  } finally {
    session.clearInMemoryAuthCache();
    harness.restore();
  }
});

test("operation preparation returns the existing pending operation without reserving another index", async () => {
  const identity = await import("../../src/chrome/privacy/identity");
  const source = account("privateKey");
  const harness = createChromeStorageHarness({
    local: { accounts: [source] },
    sync: { activeAccountId: source.id, autoLockTimeout: 60_000 },
  });
  const session = await establishMasterSession();
  let stored: StoredPrivacyShieldOperationV1 | null = null;
  let indexReads = 0;
  let commits = 0;
  const request = {
    requestId: REQUEST_ID,
    accountId: source.id,
    accountAddress: source.address,
    accountType: source.type,
    amount: "0.1",
  };
  const shared = {
    verifyDeployment: async () => {},
    quotePrivacyShield: async () => quote(),
    getAccountById: async () => source,
    createOperationId: () => "00000000-0000-4000-8000-000000000009",
    now: () => 100,
  };
  try {
    assert.equal((await identity.ensurePrivacyIdentityInitialized()).success, true);
    const first = await preparePrivacyShieldOperation(request, {
      ...shared,
      findOperation: async () => null,
      readNextDepositIndex: async () => {
        indexReads += 1;
        return 0;
      },
      commitOperation: async (operation) => {
        commits += 1;
        stored = operation;
        return { status: "created", operation };
      },
    });
    assert.ok(stored);
    const second = await preparePrivacyShieldOperation(request, {
      ...shared,
      findOperation: async () => stored,
      readNextDepositIndex: async () => {
        indexReads += 1;
        return 1;
      },
      commitOperation: async () => {
        commits += 1;
        throw new Error("duplicate commit");
      },
    });
    assert.deepEqual(second, first);
    assert.equal(indexReads, 1);
    assert.equal(commits, 1);
  } finally {
    session.clearInMemoryAuthCache();
    harness.restore();
  }
});
