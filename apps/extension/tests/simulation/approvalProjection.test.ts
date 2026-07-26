import assert from "node:assert/strict";
import test from "node:test";

import type { ApprovalIntent } from "../../src/chrome/simulation/approvalIntents";
import {
  buildFallbackApprovalChanges,
  projectApprovalChange,
} from "../../src/chrome/simulation/approvalProjection";

const OWNER = "0x1111111111111111111111111111111111111111";
const TOKEN = "0x2222222222222222222222222222222222222222";
const SPENDER = "0x3333333333333333333333333333333333333333";

function intent(
  overrides: Partial<ApprovalIntent> = {},
): ApprovalIntent {
  return {
    system: "erc20",
    tokenAddress: TOKEN,
    owner: OWNER,
    spender: SPENDER,
    requestedAmount: 100n,
    expiration: null,
    grantLike: true,
    order: 0,
    ...overrides,
  };
}

test("an approval consumed or revoked in the same batch is hidden", () => {
  assert.equal(
    projectApprovalChange(
      intent(),
      { amount: 0n, expiration: null },
      { amount: 0n, expiration: null },
      1_900_000_000n,
    ).change,
    null,
  );
  assert.equal(
    projectApprovalChange(
      intent(),
      { amount: 100n, expiration: null },
      { amount: 20n, expiration: null },
      1_900_000_000n,
    ).change,
    null,
  );
});

test("only the verified persistent ERC-20 increase is shown", () => {
  const projected = projectApprovalChange(
    intent({ requestedAmount: 100n }),
    { amount: 10n, expiration: null },
    { amount: 60n, expiration: null },
    1_900_000_000n,
  );
  assert.equal(projected.incomplete, false);
  assert.equal(projected.change?.verification, "verified");
  assert.equal(projected.change?.previousAmount, "10");
  assert.equal(projected.change?.remainingAmount, "60");
  assert.equal(projected.change?.changeType, "increase");
});

test("increaseAllowance displays the verified final allowance, not only its delta", () => {
  const projected = projectApprovalChange(
    intent({ requestedAmount: 25n }),
    { amount: 100n, expiration: null },
    { amount: 125n, expiration: null },
    1_900_000_000n,
  );

  assert.equal(projected.incomplete, false);
  assert.equal(projected.change?.requestedAmount, "25");
  assert.equal(projected.change?.previousAmount, "100");
  assert.equal(projected.change?.remainingAmount, "125");
});

test("Permit2 expired grants are hidden and expiry extensions remain visible", () => {
  const permit2 = intent({
    system: "permit2",
    expiration: 2_100_000_000,
  });
  const expired = projectApprovalChange(
    permit2,
    { amount: 0n, expiration: 0 },
    { amount: 100n, expiration: 1_800_000_000 },
    1_900_000_000n,
  );
  assert.equal(expired.change, null);

  const extended = projectApprovalChange(
    permit2,
    { amount: 100n, expiration: 1_950_000_000 },
    { amount: 100n, expiration: 2_100_000_000 },
    1_900_000_000n,
  );
  assert.equal(extended.change?.changeType, "expiryExtension");
  assert.equal(extended.change?.expiration, 2_100_000_000);
});

test("missing post-state never hides a grant and labels it unverified", () => {
  const projected = projectApprovalChange(
    intent(),
    { amount: 0n, expiration: null },
    null,
    1_900_000_000n,
  );
  assert.equal(projected.incomplete, true);
  assert.equal(projected.change?.verification, "unverified");
  assert.equal(projected.change?.remainingAmount, null);

  assert.equal(
    buildFallbackApprovalChanges([
      intent(),
      intent({ requestedAmount: 0n, grantLike: false, order: 1 }),
    ]).length,
    1,
  );
});

test("max-sized allowances are brought to the front as unlimited risk", () => {
  const projected = projectApprovalChange(
    intent({ requestedAmount: 2n ** 256n - 1n }),
    { amount: 0n, expiration: null },
    { amount: 2n ** 256n - 1n, expiration: null },
    1_900_000_000n,
  );
  assert.equal(projected.change?.isUnlimited, true);
});
