import assert from "node:assert/strict";
import test from "node:test";

import type { Account } from "../../src/chrome/types";
import { createChromeStorageHarness } from "../helpers/chromeStorageHarness";

const ADDRESS = "0x1111111111111111111111111111111111111111";
const REQUEST_ID = "00000000-0000-4000-8000-000000000002";

function account(type: "privateKey" | "seedPhrase"): Account {
  return {
    id: `${type}-shield-submit`,
    type,
    address: ADDRESS,
    createdAt: 1,
    ...(type === "seedPhrase"
      ? { seedGroupId: "seed-shield-submit", derivationIndex: 0 }
      : {}),
  } as Account;
}

function quote() {
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
    canAfford: true,
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
  session.setCachedPasswordDirect("privacy-submit-master");
  return session;
}

test("durable Shield operations queue one exact normal confirmation for both local wallet types", async () => {
  const identity = await import("../../src/chrome/privacy/identity");
  const operationModule = await import("../../src/chrome/privacy/operations/prepare");
  const submission = await import("../../src/chrome/privacy/operations/submission");

  for (const [index, type] of (["privateKey", "seedPhrase"] as const).entries()) {
    const selected = account(type);
    const harness = createChromeStorageHarness({
      local: { accounts: [selected] },
      sync: { activeAccountId: selected.id, autoLockTimeout: 60_000 },
    });
    const session = await establishMasterSession();
    let stored: any = null;
    let queued: any = null;
    const runtimeMessages: unknown[] = [];
    try {
      assert.equal((await identity.ensurePrivacyIdentityInitialized()).success, true);
      const prepared = await operationModule.preparePrivacyShieldOperation(
        {
          requestId: REQUEST_ID,
          accountId: selected.id,
          accountAddress: selected.address,
          accountType: selected.type,
          amount: "0.1",
        },
        {
          verifyDeployment: async () => {},
          quotePrivacyShield: async () => quote(),
          getAccountById: async () => selected,
          findOperation: async () => null,
          readNextDepositIndex: async () => index,
          createOperationId: () =>
            `00000000-0000-4000-8000-${(index + 1).toString().padStart(12, "0")}`,
          now: () => 10 + index,
          commitOperation: async (operation) => {
            stored = operation;
            return { status: "created", operation };
          },
        },
      );
      assert.ok(stored);

      const result = await submission.queuePrivacyShieldConfirmation(prepared.id, {
        getOperation: async () => stored,
        getAccountById: async () => selected,
        getPending: async () => null,
        verifyDeployment: async () => {},
        savePending: async (pending) => {
          queued = pending;
        },
        sendRuntimeMessage: async (message) => {
          runtimeMessages.push(message);
        },
      });

      assert.equal(result.id, prepared.id);
      assert.equal(result.state, "awaiting_wallet_confirmation");
      assert.equal(queued.id, prepared.id);
      assert.equal(queued.accountType, type);
      assert.equal(queued.trustedInternal, true);
      assert.deepEqual(queued.privacyShieldMeta, {
        version: 1,
        operationId: prepared.id,
      });
      assert.equal(queued.tx.chainId, 11_155_111);
      assert.equal(queued.tx.from, ADDRESS);
      assert.equal(
        queued.tx.to.toLowerCase(),
        "0x34a2068192b1297f2a7f85d7d8cde66f8f0921cb",
      );
      assert.equal(queued.tx.value, "0x16345785d8a0000");
      assert.match(queued.tx.data, /^0xb6b55f25[0-9a-f]{64}$/i);
      assert.equal(JSON.stringify(queued).includes("nullifier"), false);
      assert.equal(JSON.stringify(queued).includes("secret"), false);
      assert.equal(runtimeMessages.length, 1);
    } finally {
      session.clearInMemoryAuthCache();
      harness.restore();
    }
  }
});

test("Shield confirmation queue rejects an agent session before releasing operation details", async () => {
  const submission = await import("../../src/chrome/privacy/operations/submission");
  const session = await establishMasterSession();
  session.setCachedPasswordType("agent");
  try {
    await assert.rejects(
      submission.queuePrivacyShieldConfirmation(
        "00000000-0000-4000-8000-000000000001",
      ),
      (error: unknown) =>
        error instanceof submission.PrivacyShieldSubmissionError &&
        error.code === "auth-required",
    );
  } finally {
    session.clearInMemoryAuthCache();
  }
});
