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
  assert.equal(result.record.chains["1"].nonce, "4");
  assert.equal(result.record.chains["8453"].nonce, "5");
  assert.deepEqual(result.newChainIds, []);
  assert.deepEqual(reconciledNonces, ["5"]);
});

test("account settings refresh discovers missing chains in parallel with known-chain RPC refresh", async () => {
  let knownStarted = false;
  let discoveryStarted = false;
  let signalKnownStarted!: () => void;
  let signalDiscoveryStarted!: () => void;
  const knownStartedSignal = new Promise<void>((resolve) => { signalKnownStarted = resolve; });
  const discoveryStartedSignal = new Promise<void>((resolve) => { signalDiscoveryStarted = resolve; });
  let releaseKnown!: () => void;
  let releaseDiscovery!: () => void;
  const knownGate = new Promise<void>((resolve) => { releaseKnown = resolve; });
  const discoveryGate = new Promise<void>((resolve) => { releaseDiscovery = resolve; });
  let importedSnapshots: SafeChainSnapshot[] = [];

  const work = refreshSafeAccountState({ accountId: "safe-account" }, {
    getSafeAccountRecord: async () => storedRecord,
    getAccounts: async () => accounts,
    verifySafeOnchainState: async (input) => {
      knownStarted = true;
      signalKnownStarted();
      await knownGate;
      return { ...snapshot(input.chainId), nonce: "5" };
    },
    discoverNewSafeDeployments: async (input) => {
      discoveryStarted = true;
      signalDiscoveryStarted();
      assert.deepEqual([...input.knownChainIds].sort((a, b) => a - b), [1, 8453]);
      await discoveryGate;
      return {
        address: safeAddress,
        snapshots: [snapshot(10)],
        failures: [{ chainId: 137, chainName: "Polygon", error: "Unavailable" }],
        scannedChainIds: [10, 137],
      };
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
          chains: Object.fromEntries([
            ...Object.entries(storedRecord.chains),
            ...input.snapshots.map((item) => [String(item.chainId), item]),
          ]),
        },
        created: false,
      };
    },
    reconcileSafeProposalNonceQueue: async () => undefined,
  });

  await Promise.all([knownStartedSignal, discoveryStartedSignal]);
  assert.equal(knownStarted, true);
  assert.equal(discoveryStarted, true);
  releaseKnown();
  releaseDiscovery();

  const result = await work;
  assert.deepEqual(
    importedSnapshots.map((item) => item.chainId).sort((a, b) => a - b),
    [1, 10, 8453],
  );
  assert.deepEqual(result.newChainIds, [10]);
  assert.equal(result.discoveryFailureCount, 1);
  assert.equal(result.record.chains["10"].capability, "quorumAvailable");
});

test("Safe-service discovery failure does not fail known-chain refresh", async () => {
  const result = await refreshSafeAccountState({ accountId: "safe-account" }, {
    getSafeAccountRecord: async () => storedRecord,
    getAccounts: async () => accounts,
    verifySafeOnchainState: async (input) => snapshot(input.chainId),
    discoverNewSafeDeployments: async () => {
      throw new Error("Safe service unavailable");
    },
    importVerifiedSafeAccount: async () => ({
      account: {
        id: "safe-account",
        type: "safe",
        address: safeAddress,
        createdAt: 1,
      },
      record: storedRecord,
      created: false,
    }),
    reconcileSafeProposalNonceQueue: async () => undefined,
  });

  assert.equal(result.record.accountId, "safe-account");
  assert.equal(result.discoveryError, "Safe service unavailable");
  assert.deepEqual(result.newChainIds, []);
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
