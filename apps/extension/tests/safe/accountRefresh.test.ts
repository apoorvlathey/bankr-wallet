import assert from "node:assert/strict";
import test from "node:test";
import { refreshSafeAccountState } from "../../src/chrome/safe/accountRefresh";
import type { Account } from "../../src/chrome/types";
import type {
  SafeAccountRecord,
  SafeChainSnapshot,
} from "../../src/chrome/safe/types";

const owner = "0x2222222222222222222222222222222222222222" as const;
const safeAddress = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as const;

function snapshot(chainId: number): SafeChainSnapshot {
  return {
    chainId,
    verifiedAtBlock: "123",
    configEpoch: `0x${"ab".repeat(32)}`,
    singleton: "0x3333333333333333333333333333333333333333",
    version: "1.4.1",
    owners: [owner],
    contractOwners: [],
    threshold: 1,
    nonce: "4",
    modules: [],
    guard: "0x0000000000000000000000000000000000000000",
    fallbackHandler: "0x4444444444444444444444444444444444444444",
    transactionService: "supported",
    capability: "approve",
  };
}

const storedRecord: SafeAccountRecord = {
  version: 1,
  accountId: "safe-account",
  address: safeAddress,
  importedBy: "manual",
  chains: {
    "1": snapshot(1),
    "8453": snapshot(8453),
  },
};

const accounts: Account[] = [{
  id: "pk-owner",
  type: "privateKey",
  address: owner,
  createdAt: 1,
}];

test("proposal refresh verifies only its stored chain directly onchain", async () => {
  const verifiedChainIds: number[] = [];
  let importedSnapshots: SafeChainSnapshot[] = [];
  const reconciledNonces: string[] = [];

  const result = await refreshSafeAccountState({
    accountId: "safe-account",
    chainId: 8453,
  }, {
    getSafeAccountRecord: async () => storedRecord,
    getAccounts: async () => accounts,
    verifySafeOnchainState: async (input) => {
      verifiedChainIds.push(input.chainId);
      assert.equal(input.safeAddress, safeAddress);
      assert.equal(input.transactionService, "supported");
      return { ...snapshot(input.chainId), nonce: "5", capability: "observe" };
    },
    importVerifiedSafeAccount: async (input) => {
      importedSnapshots = input.snapshots;
      return {
        account: {
          id: "safe-account",
          type: "safe",
          address: safeAddress,
          createdAt: 1,
        },
        record: {
          ...storedRecord,
          chains: {
            ...storedRecord.chains,
            [String(input.snapshots[0].chainId)]: input.snapshots[0],
          },
        },
        created: false,
      };
    },
    reconcileSafeProposalNonceQueue: async (input) => {
      reconciledNonces.push(input.liveNonce);
    },
  });

  assert.deepEqual(verifiedChainIds, [8453]);
  assert.equal(importedSnapshots.length, 1);
  assert.equal(importedSnapshots[0].nonce, "5");
  assert.equal(importedSnapshots[0].capability, "quorumAvailable");
  assert.equal(result.chains["1"].nonce, "4");
  assert.equal(result.chains["8453"].nonce, "5");
  assert.deepEqual(reconciledNonces, ["5"]);
});

test("proposal refresh rejects a chain that was not imported", async () => {
  let verifyCalls = 0;
  await assert.rejects(
    refreshSafeAccountState({ accountId: "safe-account", chainId: 10 }, {
      getSafeAccountRecord: async () => storedRecord,
      getAccounts: async () => accounts,
      verifySafeOnchainState: async () => {
        verifyCalls += 1;
        return snapshot(10);
      },
    }),
    /Safe is not imported on chain 10/,
  );
  assert.equal(verifyCalls, 0);
});
