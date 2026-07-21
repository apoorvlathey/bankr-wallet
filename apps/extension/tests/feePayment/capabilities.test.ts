import assert from "node:assert/strict";
import test from "node:test";

import {
  buildFundedFeePaymentTokenOptions,
  evaluateUsdcFeePaymentEligibility,
} from "../../src/chrome/feePayment/capabilities";
import { WALLETCHAN_OFFICIAL_DELEGATE } from "../../src/chrome/feePayment/constants";
import { getPimlicoFeeTokens } from "../../src/chrome/feePayment/tokens";

for (const accountType of ["privateKey", "seedPhrase"] as const) {
  test(`${accountType} can include the one-time official delegation`, () => {
    assert.deepEqual(
      evaluateUsdcFeePaymentEligibility({
        accountType,
        chainId: 8453,
        hasDeployment: false,
        onchainDelegate: null,
      }),
      { available: true, oneTimeUpgrade: true },
    );
  });
}

test("Bankr is enabled only after the official delegation already exists", () => {
  assert.deepEqual(
    evaluateUsdcFeePaymentEligibility({
      accountType: "bankr",
      chainId: 8453,
      hasDeployment: false,
      onchainDelegate: WALLETCHAN_OFFICIAL_DELEGATE,
    }),
    { available: true },
  );
  assert.match(
    evaluateUsdcFeePaymentEligibility({
      accountType: "bankr",
      chainId: 8453,
      hasDeployment: false,
      onchainDelegate: null,
    }).unavailableReason ?? "",
    /Enable WalletChan's smart account/,
  );
});

for (const onchainDelegate of [null, WALLETCHAN_OFFICIAL_DELEGATE] as const) {
  test(`Ledger fails closed with ${onchainDelegate ? "the official delegate" : "no delegate"}`, () => {
    const eligibility = evaluateUsdcFeePaymentEligibility({
      accountType: "ledger",
      chainId: 8453,
      hasDeployment: false,
      onchainDelegate,
    });
    assert.equal(eligibility.available, false);
    assert.match(eligibility.unavailableReason ?? "", /Ledger accounts/);
    assert.equal(eligibility.oneTimeUpgrade, undefined);
  });
}

test("view-only, deployment, and foreign-delegate requests fail closed", () => {
  assert.equal(
    evaluateUsdcFeePaymentEligibility({
      accountType: "impersonator",
      chainId: 8453,
      hasDeployment: false,
      onchainDelegate: WALLETCHAN_OFFICIAL_DELEGATE,
    }).available,
    false,
  );
  assert.match(
    evaluateUsdcFeePaymentEligibility({
      accountType: "privateKey",
      chainId: 8453,
      hasDeployment: true,
      onchainDelegate: null,
    }).unavailableReason ?? "",
    /contract deployment/,
  );
  assert.match(
    evaluateUsdcFeePaymentEligibility({
      accountType: "seedPhrase",
      chainId: 8453,
      hasDeployment: false,
      onchainDelegate: "0x1111111111111111111111111111111111111111",
    }).unavailableReason ?? "",
    /different smart-account delegate/,
  );
});

test("zero-balance fee tokens are omitted while funded tokens retain their balance", () => {
  const tokens = getPimlicoFeeTokens(8453);
  const options = buildFundedFeePaymentTokenOptions({
    feeTokens: tokens,
    balances: [0n, 12_345n],
    eligibility: { available: true },
  });

  assert.deepEqual(options.map(({ symbol, balance }) => ({ symbol, balance })), [
    { symbol: "USDT", balance: "12345" },
  ]);
});

test("an unavailable balance is not mistaken for a confirmed zero balance", () => {
  const [token] = getPimlicoFeeTokens(8453);
  const options = buildFundedFeePaymentTokenOptions({
    feeTokens: [token],
    balances: [undefined],
    eligibility: { available: false, unavailableReason: "Balance unavailable" },
  });

  assert.equal(options.length, 1);
  assert.equal(options[0].balance, undefined);
  assert.equal(options[0].available, false);
});

for (const accountType of [
  "bankr",
  "privateKey",
  "seedPhrase",
  "ledger",
  "impersonator",
] as const) {
  test(`${accountType} never receives a zero-balance catalog option`, () => {
    const [token] = getPimlicoFeeTokens(8453);
    const eligibility = evaluateUsdcFeePaymentEligibility({
      accountType,
      chainId: 8453,
      hasDeployment: false,
      onchainDelegate: WALLETCHAN_OFFICIAL_DELEGATE,
    });
    const options = buildFundedFeePaymentTokenOptions({
      feeTokens: [token],
      balances: [0n],
      eligibility,
    });

    assert.deepEqual(options, []);
  });
}
