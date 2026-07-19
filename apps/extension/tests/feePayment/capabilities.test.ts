import assert from "node:assert/strict";
import test from "node:test";

import { evaluateUsdcFeePaymentEligibility } from "../../src/chrome/feePayment/capabilities";
import { WALLETCHAN_OFFICIAL_DELEGATE } from "../../src/chrome/feePayment/constants";

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
