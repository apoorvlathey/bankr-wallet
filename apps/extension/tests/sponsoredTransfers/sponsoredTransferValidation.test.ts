import assert from "node:assert/strict";
import test from "node:test";

import {
  BASE_USDC_DECIMALS,
  validateSponsoredTransferIntent,
} from "../../src/chrome/sponsoredTransfers/validation";
import {
  parsePremiumStatusResponse,
  parseSponsoredTransferResponse,
} from "../../src/chrome/sponsoredTransfers/response";

const ACCOUNT = "0x0000000000000000000000000000000000000001";
const RECIPIENT = "0x0000000000000000000000000000000000000002";

test("sponsored transfer pins the active account and canonical Base USDC units", () => {
  const result = validateSponsoredTransferIntent(ACCOUNT, {
    fromAddress: ACCOUNT,
    to: RECIPIENT,
    amount: "1.5",
    decimals: BASE_USDC_DECIMALS,
  });
  assert.deepEqual(result, {
    valid: true,
    from: ACCOUNT,
    to: RECIPIENT,
    value: 1_500_000n,
  });
});

test("sponsored transfer rejects a renderer-selected signer", () => {
  const result = validateSponsoredTransferIntent(ACCOUNT, {
    fromAddress: "0x0000000000000000000000000000000000000003",
    to: RECIPIENT,
    amount: "1",
    decimals: BASE_USDC_DECIMALS,
  });
  assert.equal(result.valid, false);
  if (!result.valid) assert.match(result.error, /active account/i);
});

test("sponsored transfer rejects renderer-controlled decimal scaling", () => {
  const result = validateSponsoredTransferIntent(ACCOUNT, {
    fromAddress: ACCOUNT,
    to: RECIPIENT,
    amount: "1",
    decimals: 18,
  });
  assert.deepEqual(result, { valid: false, error: "Invalid USDC decimals" });
});

test("sponsored transfer rejects invalid recipients and non-positive amounts", () => {
  assert.equal(
    validateSponsoredTransferIntent(ACCOUNT, {
      fromAddress: ACCOUNT,
      to: "not-an-address",
      amount: "1",
      decimals: BASE_USDC_DECIMALS,
    }).valid,
    false,
  );
  assert.equal(
    validateSponsoredTransferIntent(ACCOUNT, {
      fromAddress: ACCOUNT,
      to: RECIPIENT,
      amount: "0",
      decimals: BASE_USDC_DECIMALS,
    }).valid,
    false,
  );
});

test("sponsored relayer responses require an exact transaction hash", () => {
  const hash = `0x${"ab".repeat(32)}` as `0x${string}`;
  assert.equal(
    parseSponsoredTransferResponse(JSON.stringify({ txHash: hash }), true),
    hash,
  );
  assert.throws(
    () =>
      parseSponsoredTransferResponse(
        JSON.stringify({ txHash: "0x1234" }),
        true,
      ),
    /invalid transaction hash/i,
  );
  assert.throws(
    () =>
      parseSponsoredTransferResponse(
        JSON.stringify({ error: `failure\u0000${"x".repeat(2_000)}` }),
        false,
      ),
    (error: unknown) =>
      error instanceof Error &&
      error.message.length <= 1_000 &&
      !error.message.includes("\u0000"),
  );
});

test("premium-status responses are schema validated", () => {
  assert.deepEqual(
    parsePremiumStatusResponse(
      JSON.stringify({ isPremium: true, balance: "20000000" }),
    ),
    {
      isPremium: true,
      balance: "20000000",
      sponsoredTransfersEnabled: true,
    },
  );
  assert.throws(
    () =>
      parsePremiumStatusResponse(
        JSON.stringify({ isPremium: "yes", balance: {} }),
      ),
    /invalid response/i,
  );
});
