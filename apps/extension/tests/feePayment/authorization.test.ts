import assert from "node:assert/strict";
import test from "node:test";
import type { SignedAuthorization } from "viem";

import {
  createDummyFeePaymentAuthorization,
  toPimlicoEip7702Authorization,
} from "../../src/chrome/feePayment/authorization";

test("formats a viem authorization for Pimlico JSON-RPC", () => {
  assert.deepEqual(
    toPimlicoEip7702Authorization({
      address: "0x63c0c19a282a1B52b07dD5a65b58948A07DAE32B",
      chainId: 8453,
      nonce: 9,
      r: `0x${"11".repeat(32)}`,
      s: `0x${"22".repeat(32)}`,
      yParity: 1,
    } as SignedAuthorization),
    {
      address: "0x63c0c19a282a1B52b07dD5a65b58948A07DAE32B",
      chainId: "0x2105",
      nonce: "0x9",
      r: `0x${"11".repeat(32)}`,
      s: `0x${"22".repeat(32)}`,
      yParity: "0x1",
    },
  );
});

test("builds a well-formed official dummy authorization for estimation only", () => {
  const authorization = createDummyFeePaymentAuthorization({
    chainId: 8453,
    currentEoaNonce: 7,
  });
  assert.equal(authorization.chainId, "0x2105");
  assert.equal(authorization.nonce, "0x7");
  assert.equal(authorization.r.length, 66);
  assert.equal(authorization.s.length, 66);
  assert.equal(
    authorization.address.toLowerCase(),
    "0x63c0c19a282a1b52b07dd5a65b58948a07dae32b",
  );
});

test("normalizes legacy v and rejects invalid parity", () => {
  const formatted = toPimlicoEip7702Authorization({
    address: "0x63c0c19a282a1B52b07dD5a65b58948A07DAE32B",
    chainId: 1,
    nonce: 0,
    r: `0x${"11".repeat(32)}`,
    s: `0x${"22".repeat(32)}`,
    v: 27n,
  } as SignedAuthorization);
  assert.equal(formatted.v, "0x1b");
  assert.equal(formatted.yParity, "0x0");

  assert.throws(
    () =>
      toPimlicoEip7702Authorization({
        address: "0x63c0c19a282a1B52b07dD5a65b58948A07DAE32B",
        chainId: 1,
        nonce: 0,
        r: `0x${"11".repeat(32)}`,
        s: `0x${"22".repeat(32)}`,
        yParity: 2,
      } as unknown as SignedAuthorization),
    /invalid yParity/,
  );
});
