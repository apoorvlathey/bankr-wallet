import assert from "node:assert/strict";
import test from "node:test";

import {
  createPrivacyShieldReviewIntent,
  decodePrivacyShieldReviewIntent,
  PRIVACY_SHIELD_DEPOSIT_SELECTOR,
  type PrivacyShieldReviewIntent,
} from "../../src/chrome/privacy/deposit/intent";

const SOURCE = "0x1111111111111111111111111111111111111111";
const PRECOMMITMENT =
  21_381_912_566_992_095_161_997_580_774_829_960_999_416_698_525_239_585_958_091_240_626_965_757_610_693n;

test("native Shield intent encodes and independently decodes the exact call", () => {
  const intent = createPrivacyShieldReviewIntent({
    sourceAddress: SOURCE,
    valueWei: 100_000_000_000_000_000n,
    precommitment: PRECOMMITMENT,
  });
  const expectedWord = PRECOMMITMENT.toString(16).padStart(64, "0");

  assert.equal(intent.kind, "privacy-shield-review-intent");
  assert.equal(intent.submittable, false);
  assert.equal(intent.chainId, 11_155_111);
  assert.equal(intent.callData, `${PRIVACY_SHIELD_DEPOSIT_SELECTOR}${expectedWord}`);
  assert.deepEqual(decodePrivacyShieldReviewIntent(intent), {
    sourceAddress: SOURCE,
    destinationAddress: "0x34a2068192b1297f2a7f85d7d8cde66f8f0921cb",
    valueWei: 100_000_000_000_000_000n,
    protocolFeeWei: 1_000_000_000_000_000n,
    shieldedAmountWei: 99_000_000_000_000_000n,
    precommitment: PRECOMMITMENT,
  });
});

test("independent intent decoder rejects selector, length, route, and fee drift", () => {
  const valid = createPrivacyShieldReviewIntent({
    sourceAddress: SOURCE,
    valueWei: 100_000_000_000_000_000n,
    precommitment: PRECOMMITMENT,
  });
  const altered = [
    { ...valid, callData: `0xdeadbeef${valid.callData.slice(10)}` },
    { ...valid, callData: `${valid.callData}00` },
    { ...valid, destinationAddress: "0x2222222222222222222222222222222222222222" },
    { ...valid, protocolFeeWei: valid.protocolFeeWei + 1n },
    { ...valid, submittable: true },
  ];

  for (const intent of altered) {
    assert.throws(
      () => decodePrivacyShieldReviewIntent(intent as PrivacyShieldReviewIntent),
      /invalid-shield-intent/,
    );
  }
});
