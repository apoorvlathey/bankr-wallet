import assert from "node:assert/strict";
import { test } from "node:test";
import { deriveSafeCapability, getLinkedSafeOwners } from "../../src/chrome/safe/capabilities";
import type { Account } from "../../src/chrome/types";
import type { SafeChainSnapshot } from "../../src/chrome/safe/types";

const ownerA = "0x1111111111111111111111111111111111111111";
const ownerB = "0x2222222222222222222222222222222222222222";
const snapshot: SafeChainSnapshot = {
  chainId: 8453,
  verifiedAtBlock: "1",
  configEpoch: `0x${"12".repeat(32)}`,
  singleton: "0x3333333333333333333333333333333333333333",
  version: "1.4.1",
  owners: [ownerA, ownerB],
  contractOwners: [],
  threshold: 2,
  nonce: "0",
  modules: [],
  guard: "0x0000000000000000000000000000000000000000",
  fallbackHandler: "0x0000000000000000000000000000000000000000",
  transactionService: "supported",
  capability: "observe",
};
const account = (id: string, address: string, type: Account["type"]): Account =>
  ({ id, address, type, createdAt: 1 } as Account);

test("capabilities count distinct linked owner addresses, not account records", () => {
  const accounts = [
    account("a", ownerA, "privateKey"),
    account("duplicate", ownerA, "seedPhrase"),
    account("observer", ownerB, "impersonator"),
    account("nested", ownerB, "safe"),
  ];
  assert.equal(getLinkedSafeOwners(snapshot, accounts).length, 2);
  assert.equal(deriveSafeCapability({ snapshot, accounts }), "approve");
  assert.equal(
    deriveSafeCapability({ snapshot, accounts: [...accounts, account("b", ownerB, "bankr")] }),
    "quorumAvailable",
  );
  assert.equal(deriveSafeCapability({ snapshot, accounts, validApprovalCount: 2 }), "readyToExecute");
});

test("unsupported authority configuration remains blocked", () => {
  assert.equal(
    deriveSafeCapability({
      snapshot: { ...snapshot, blockedReason: "custom guard", capability: "blocked" },
      accounts: [account("a", ownerA, "privateKey")],
      validApprovalCount: 2,
    }),
    "blocked",
  );
});
