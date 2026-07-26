import assert from "node:assert/strict";
import test from "node:test";

import {
  buildApprovalRevokeCall,
  isSameApprovalRevokeCall,
} from "../../src/chrome/approvalCleanup/revokeCall";
import { buildApprovalRevokeCalls } from "../../src/chrome/approvalCleanup/revokeList";
import { parseApproveCalldata } from "../../src/lib/erc20Approve";
import { supportsAtomicEoaApprovalCleanup } from "../../src/chrome/approvalCleanup/accountPolicy";

const TOKEN = "0x2222222222222222222222222222222222222222";
const SPENDER = "0x3333333333333333333333333333333333333333";

test("approval cleanup builds one canonical zero-value approve call", () => {
  const revoke = buildApprovalRevokeCall(TOKEN, SPENDER);
  assert.equal(revoke.call.to.toLowerCase(), TOKEN);
  assert.equal(revoke.call.value, "0x0");
  assert.deepEqual(parseApproveCalldata(revoke.call.data), {
    spender: SPENDER,
    amount: 0n,
    isInfinite: false,
    isRevoke: true,
  });
  assert.equal(isSameApprovalRevokeCall(revoke.call, revoke), true);
});

test("approval cleanup rejects malformed and zero addresses", () => {
  assert.throws(() => buildApprovalRevokeCall("not-address", SPENDER));
  assert.throws(
    () =>
      buildApprovalRevokeCall(
        TOKEN,
        "0x0000000000000000000000000000000000000000",
      ),
    /non-zero/,
  );
});

test("bulk approval cleanup validates and deduplicates token-spender pairs", () => {
  const revokes = buildApprovalRevokeCalls([
    { tokenAddress: TOKEN, spender: SPENDER },
    { tokenAddress: TOKEN, spender: SPENDER },
    {
      tokenAddress: "0x4444444444444444444444444444444444444444",
      spender: SPENDER,
    },
  ]);
  assert.equal(revokes.length, 2);
  assert.throws(() => buildApprovalRevokeCalls([]), /list/);
  assert.throws(
    () => buildApprovalRevokeCalls([{ tokenAddress: TOKEN }]),
    /addresses/,
  );
});

test("background cleanup policy covers every wallet type", () => {
  assert.equal(supportsAtomicEoaApprovalCleanup("privateKey"), true);
  assert.equal(supportsAtomicEoaApprovalCleanup("seedPhrase"), true);
  assert.equal(supportsAtomicEoaApprovalCleanup("bankr"), false);
  assert.equal(supportsAtomicEoaApprovalCleanup("ledger"), false);
  assert.equal(supportsAtomicEoaApprovalCleanup("impersonator"), false);
  assert.equal(supportsAtomicEoaApprovalCleanup(undefined), false);
});
