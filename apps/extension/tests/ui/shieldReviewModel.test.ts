import assert from "node:assert/strict";
import test from "node:test";

import { parseShieldReviewResponse } from "../../src/components/Shield/model/shieldReview";

const account = {
  id: "pk-1",
  type: "privateKey" as const,
  address: "0x1111111111111111111111111111111111111111",
};

function response() {
  return {
    success: true,
    status: "ready",
    review: {
      chainId: 11_155_111,
      accountId: account.id,
      accountAddress: account.address,
      accountType: account.type,
      amountWei: "101010101010101010",
      protocolFeeWei: "1010101010101010",
      shieldedAmountWei: "100000000000000000",
      destinationAddress: "0x34A2068192b1297f2a7f85D7D8CdE66F8F0921cB",
    },
  };
}

test("Shield review parser accepts only the expected account and amount", () => {
  const parsed = parseShieldReviewResponse(
    response(),
    account,
    100_000_000_000_000_000n,
  );
  assert.ok(parsed);
  assert.equal(parsed.accountId, account.id);
  assert.equal(parsed.amountWei, 101_010_101_010_101_010n);
  assert.equal(parsed.protocolFeeWei, 1_010_101_010_101_010n);
  assert.equal(parsed.shieldedAmountWei, 100_000_000_000_000_000n);

  const wrongAmount = response();
  wrongAmount.review.amountWei = "100000000000000001";
  assert.equal(
    parseShieldReviewResponse(
      wrongAmount,
      account,
      100_000_000_000_000_000n,
    ),
    null,
  );

  const extra = response() as any;
  extra.review.callData = "not accepted";
  assert.equal(
    parseShieldReviewResponse(extra, account, 100_000_000_000_000_000n),
    null,
  );
});
