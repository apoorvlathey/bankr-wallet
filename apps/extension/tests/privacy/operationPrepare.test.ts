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
      : type === "ledger"
        ? {
            deviceId: ADDRESS.toLowerCase(),
            hdPath: "m/44'/60'/0'/0/0",
            hdIndex: 0,
          }
        : {}),
  } as Account;
}

function quote(canAfford = true) {
  return Object.freeze({
    chainId: 11_155_111,
    amountWei: "101010101010101010",
    balanceWei: "500000000000000000",
    minimumAmountWei: "1000000000000000",
    protocolFeeWei: "1010101010101010",
    shieldedAmountWei: "100000000000000000",
    gasReserveWei: "200000000000000",
    totalRequiredWei: "101210101010101010",
    maxShieldableWei: "494802000000000000",
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

test("operation preparation reserves one encrypted index for every Sepolia signing wallet", async () => {
  const identity = await import("../../src/chrome/privacy/identity");

  for (const [position, type] of ["privateKey", "seedPhrase", "ledger"].entries()) {
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

test("operation preparation retries the same request UUID without reserving another index", async () => {
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
  let deploymentChecks = 0;
  let quoteReads = 0;
  const request = {
    requestId: REQUEST_ID,
    accountId: source.id,
    accountAddress: source.address,
    accountType: source.type,
    amount: "0.1",
  };
  const shared = {
    verifyDeployment: async () => {
      deploymentChecks += 1;
    },
    quotePrivacyShield: async () => {
      quoteReads += 1;
      return quote();
    },
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
      findOperation: async (requestId) =>
        stored?.summary.requestId === requestId ? stored : null,
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
    assert.equal(deploymentChecks, 1);
    assert.equal(quoteReads, 1);

    await assert.rejects(
      preparePrivacyShieldOperation({ ...request, amount: "0.2" }, {
        ...shared,
        findOperation: async (requestId) =>
          stored?.summary.requestId === requestId ? stored : null,
      }),
      (error: unknown) =>
        error instanceof PrivacyShieldOperationError &&
        error.code === "operation-unavailable",
    );
    assert.equal(indexReads, 1);
    assert.equal(commits, 1);
    assert.equal(deploymentChecks, 1);
    assert.equal(quoteReads, 1);
  } finally {
    session.clearInMemoryAuthCache();
    harness.restore();
  }
});

test("new request UUIDs can Shield the same amount during confirmation and ASP review", async () => {
  const identity = await import("../../src/chrome/privacy/identity");
  const source = account("privateKey");
  const harness = createChromeStorageHarness({
    local: { accounts: [source] },
    sync: { activeAccountId: source.id, autoLockTimeout: 60_000 },
  });
  const session = await establishMasterSession();
  const stored: StoredPrivacyShieldOperationV1[] = [];
  let nextIndex = 0;
  let operationSequence = 10;
  const dependencies = {
    verifyDeployment: async () => {},
    quotePrivacyShield: async () => quote(),
    getAccountById: async () => source,
    findOperation: async (requestId: string) =>
      stored.find((operation) => operation.summary.requestId === requestId) ?? null,
    readNextDepositIndex: async () => nextIndex,
    createOperationId: () =>
      `00000000-0000-4000-8000-${(operationSequence++).toString().padStart(12, "0")}`,
    now: () => 100 + stored.length,
    commitOperation: async (
      operation: StoredPrivacyShieldOperationV1,
      expectedDepositIndex: number,
    ) => {
      const existing = stored.find(
        (candidate) =>
          candidate.summary.requestId === operation.summary.requestId,
      );
      if (existing) return { status: "existing" as const, operation: existing };
      assert.equal(expectedDepositIndex, nextIndex);
      stored.push(operation);
      nextIndex += 1;
      return { status: "created" as const, operation };
    },
  };
  try {
    assert.equal((await identity.ensurePrivacyIdentityInitialized()).success, true);
    const first = await preparePrivacyShieldOperation({
      requestId: REQUEST_ID,
      accountId: source.id,
      accountAddress: source.address,
      accountType: source.type,
      amount: "0.1",
    }, dependencies);
    assert.equal(stored.length, 1);

    const duringConfirmation = await preparePrivacyShieldOperation({
      requestId: "00000000-0000-4000-8000-000000000003",
      accountId: source.id,
      accountAddress: source.address,
      accountType: source.type,
      amount: "0.1",
    }, dependencies);
    assert.equal(stored.length, 2);
    assert.equal(duringConfirmation.state, "awaiting_wallet_confirmation");

    stored[0] = {
      ...stored[0],
      tracking: {
        version: 1,
        revision: 4,
        state: "awaiting_asp",
        updatedAt: 200,
        txHash: `0x${"ab".repeat(32)}`,
        blockNumber: "123",
        commitment: "456",
        label: "789",
        poolValueWei: stored[0].summary.shieldedAmountWei,
        errorCode: null,
      },
    };

    const duringAspReview = await preparePrivacyShieldOperation({
      requestId: "00000000-0000-4000-8000-000000000004",
      accountId: source.id,
      accountAddress: source.address,
      accountType: source.type,
      amount: "0.1",
    }, dependencies);

    assert.equal(stored.length, 3);
    assert.equal(nextIndex, 3);
    assert.notEqual(duringConfirmation.id, first.id);
    assert.notEqual(duringAspReview.id, first.id);
    assert.notEqual(duringAspReview.id, duringConfirmation.id);
    assert.equal(duringConfirmation.dedupeKey, first.dedupeKey);
    assert.equal(duringAspReview.dedupeKey, first.dedupeKey);
    assert.equal(duringAspReview.state, "awaiting_wallet_confirmation");

    const privacyKey = session.getCachedPrivacyKey();
    assert.ok(privacyKey);
    const details = await Promise.all(stored.map((operation) =>
      decryptPrivacyShieldOperationDetails(
        privacyKey.key,
        operation.keyId,
        operation.summary,
        operation.encryptedDetails,
      )
    ));
    assert.deepEqual(details.map((detail) => detail?.depositIndex), ["0", "1", "2"]);
    assert.equal(new Set(details.map((detail) => detail?.precommitment)).size, 3);
  } finally {
    session.clearInMemoryAuthCache();
    harness.restore();
  }
});
