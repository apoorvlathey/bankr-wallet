import assert from "node:assert/strict";
import test from "node:test";

import type { Account, AccountType } from "../../src/chrome/types";
import { decodePrivacyShieldReviewIntent } from "../../src/chrome/privacy/deposit/intent";
import {
  preparePrivacyShieldReview,
  PrivacyShieldReviewError,
} from "../../src/chrome/privacy/deposit/prepare";
import { PrivacyShieldQuoteError } from "../../src/chrome/privacy/deposit/quotePolicy";
import { createChromeStorageHarness } from "../helpers/chromeStorageHarness";

const MASTER_PASSWORD = "privacy-review-master";
const ADDRESS = "0x1111111111111111111111111111111111111111";

function account(type: AccountType): Account {
  return {
    id: `${type}-review`,
    type,
    address: ADDRESS,
    createdAt: 1,
    ...(type === "seedPhrase"
      ? { seedGroupId: "seed-review", derivationIndex: 0 }
      : {}),
  } as Account;
}

function requestFor(source: Account) {
  return {
    accountId: source.id,
    accountAddress: source.address,
    accountType: source.type,
    amount: "0.1",
  };
}

function publicQuote(canAfford = true) {
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

test("review preparation supports every custody wallet without persistence", async () => {
  const identity = await import("../../src/chrome/privacy/identity");

  for (const type of ["bankr", "privateKey", "seedPhrase"] as const) {
    const source = account(type);
    const harness = createChromeStorageHarness({
      local: { accounts: [source] },
      sync: { activeAccountId: source.id, autoLockTimeout: 60_000 },
    });
    const session = await establishMasterSession();
    try {
      assert.deepEqual(await identity.ensurePrivacyIdentityInitialized(), {
        success: true,
        status: "ready",
      });
      const writesBefore = harness.writes.length;
      const prepare = () =>
        preparePrivacyShieldReview(requestFor(source), {
          quotePrivacyShield: async () => publicQuote(),
        });
      const first = await prepare();
      const second = await prepare();
      const decoded = decodePrivacyShieldReviewIntent(first.intent);

      assert.equal(first.accountType, type);
      assert.equal(first.intent.submittable, false);
      assert.equal(decoded.sourceAddress, ADDRESS);
      assert.equal(decoded.valueWei, 100_000_000_000_000_000n);
      assert.equal(second.intent.callData, first.intent.callData);
      assert.equal(harness.writes.length, writesBefore);
      assert.equal("nullifier" in first.intent, false);
      assert.equal("secret" in first.intent, false);
    } finally {
      session.clearInMemoryAuthCache();
      harness.restore();
    }
  }
});

test("review preparation blocks agent, view-only, and unaffordable paths", async () => {
  const identity = await import("../../src/chrome/privacy/identity");
  const source = account("privateKey");
  const harness = createChromeStorageHarness({
    local: { accounts: [source] },
    sync: { activeAccountId: source.id, autoLockTimeout: 60_000 },
  });
  const session = await establishMasterSession();
  try {
    assert.equal((await identity.ensurePrivacyIdentityInitialized()).success, true);

    let quoteCalls = 0;
    session.setCachedPasswordType("agent");
    await assert.rejects(
      preparePrivacyShieldReview(requestFor(source), {
        quotePrivacyShield: async () => {
          quoteCalls += 1;
          return publicQuote();
        },
      }),
      (error: unknown) =>
        error instanceof PrivacyShieldReviewError &&
        error.code === "auth-required",
    );
    assert.equal(quoteCalls, 0);

    session.setCachedPasswordType("master");
    await assert.rejects(
      preparePrivacyShieldReview(requestFor(source), {
        quotePrivacyShield: async () => publicQuote(false),
      }),
      (error: unknown) =>
        error instanceof PrivacyShieldReviewError &&
        error.code === "insufficient-funds",
    );

    const impersonator = account("impersonator");
    await assert.rejects(
      preparePrivacyShieldReview(requestFor(impersonator), {
        getAccountById: async () => impersonator,
        quotePrivacyShield: async () => publicQuote(),
      }),
      (error: unknown) =>
        error instanceof PrivacyShieldQuoteError &&
        error.code === "view-only-account",
    );
  } finally {
    session.clearInMemoryAuthCache();
    harness.restore();
  }
});
