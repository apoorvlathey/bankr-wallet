import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import {
  clearSafeImportVerificationsForTests,
  registerSafeImportVerification,
  resolveSafeImportVerifications,
} from "../../src/chrome/safe/importVerificationCache";
import type { SafeChainSnapshot } from "../../src/chrome/safe/types";

afterEach(clearSafeImportVerificationsForTests);

function snapshot(chainId: number): SafeChainSnapshot {
  return {
    chainId,
    verifiedAtBlock: "123",
    configEpoch: `0x${"ab".repeat(32)}`,
    singleton: "0x1111111111111111111111111111111111111111",
    version: "1.4.1",
    owners: ["0x2222222222222222222222222222222222222222"],
    contractOwners: [],
    threshold: 1,
    nonce: "4",
    modules: [],
    guard: "0x0000000000000000000000000000000000000000",
    fallbackHandler: "0x3333333333333333333333333333333333333333",
    transactionService: "supported",
    capability: "approve",
  };
}

test("Safe import verification receipts return only background-registered state", () => {
  const address = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as const;
  const verificationId = registerSafeImportVerification({
    address,
    snapshots: [snapshot(8453)],
  });

  const verified = resolveSafeImportVerifications({
    verificationIds: [verificationId],
    address,
    chainIds: [8453],
  });
  assert.equal(verified.address, address);
  assert.deepEqual(verified.snapshots.map((item) => item.chainId), [8453]);
});

test("Safe import verification receipts reject mismatched addresses and chains", () => {
  const address = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as const;
  const verificationId = registerSafeImportVerification({
    address,
    snapshots: [snapshot(8453)],
  });

  assert.throws(() => resolveSafeImportVerifications({
    verificationIds: [verificationId],
    address: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    chainIds: [8453],
  }), /verification expired/i);
  assert.throws(() => resolveSafeImportVerifications({
    verificationIds: [verificationId],
    address,
    chainIds: [1],
  }), /verification expired/i);
});
