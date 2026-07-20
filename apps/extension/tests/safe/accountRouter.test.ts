import assert from "node:assert/strict";
import test from "node:test";
import { createBackgroundSafeAccountMessageRouter } from "../../src/chrome/background/safeAccountRouter";
import type { Account } from "../../src/chrome/types";
import type { SafeChainSnapshot } from "../../src/chrome/safe/types";

function captureResponse() {
  let resolve!: (value: any) => void;
  const response = new Promise<any>((done) => { resolve = done; });
  return { response, sendResponse: resolve };
}

const accounts: Account[] = [
  {
    id: "bankr-owner",
    type: "bankr",
    address: "0x1111111111111111111111111111111111111111",
    createdAt: 1,
  },
  {
    id: "pk-owner",
    type: "privateKey",
    address: "0x2222222222222222222222222222222222222222",
    createdAt: 2,
  },
];

const verifiedSnapshot: SafeChainSnapshot = {
  chainId: 8453,
  verifiedAtBlock: "123",
  configEpoch: `0x${"ab".repeat(32)}`,
  singleton: "0x3333333333333333333333333333333333333333",
  version: "1.4.1",
  owners: ["0x2222222222222222222222222222222222222222"],
  contractOwners: [],
  threshold: 1,
  nonce: "4",
  modules: [],
  guard: "0x0000000000000000000000000000000000000000",
  fallbackHandler: "0x4444444444444444444444444444444444444444",
  transactionService: "supported",
  capability: "approve",
};

test("Safe discovery sends only the explicitly selected account to the domain", async () => {
  let received: Account | null = null;
  const capture = captureResponse();
  const router = createBackgroundSafeAccountMessageRouter({
    getAccounts: async () => accounts,
    findSafesOwnedByAccount: async (account) => {
      received = account;
      return { candidates: [], failures: [], scannedChainIds: [8453] };
    },
  });

  assert.deepEqual(
    router(
      { type: "findSafesByOwner", accountId: "pk-owner" },
      {} as chrome.runtime.MessageSender,
      capture.sendResponse,
    ),
    { handled: true, keepChannelOpen: true },
  );
  assert.equal(received, null);
  assert.deepEqual(await capture.response, {
    candidates: [],
    failures: [],
    scannedChainIds: [8453],
  });
  assert.equal(received?.id, "pk-owner");
});

test("unknown account IDs fail before any Safe service request", async () => {
  let calls = 0;
  const capture = captureResponse();
  const router = createBackgroundSafeAccountMessageRouter({
    getAccounts: async () => accounts,
    findSafesOwnedByAccount: async () => {
      calls += 1;
      return { candidates: [], failures: [], scannedChainIds: [] };
    },
  });

  router(
    { type: "findSafesByOwner", accountId: "missing" },
    {} as chrome.runtime.MessageSender,
    capture.sendResponse,
  );
  assert.deepEqual(await capture.response, {
    success: false,
    error: "Selected account was not found",
  });
  assert.equal(calls, 0);
});

test("Safe discovery validates and forwards bounded progressive batches", async () => {
  const receivedPages: Array<{ offset: number; limit: number }> = [];
  const capture = captureResponse();
  const router = createBackgroundSafeAccountMessageRouter({
    getAccounts: async () => accounts,
    findSafesOwnedByAccountBatch: async (_account, page) => {
      receivedPages.push(page);
      if (page.limit === 0) {
        return {
          candidates: [],
          failures: [],
          scannedChainIds: [],
          nextOffset: 0,
          totalChains: 10,
          complete: false,
        };
      }
      return {
        candidates: [],
        failures: [],
        scannedChainIds: [1, 8453, 42161, 10],
        nextOffset: 4,
        totalChains: 53,
        complete: false,
      };
    },
  });

  const count = captureResponse();
  router(
    {
      type: "findSafesByOwner",
      accountId: "pk-owner",
      offset: 0,
      limit: 0,
      countOnly: true,
    },
    {} as chrome.runtime.MessageSender,
    count.sendResponse,
  );
  assert.deepEqual(await count.response, {
    candidates: [],
    failures: [],
    scannedChainIds: [],
    nextOffset: 0,
    totalChains: 10,
    complete: false,
  });

  router(
    {
      type: "findSafesByOwner",
      accountId: "pk-owner",
      offset: 0,
      limit: 4,
    },
    {} as chrome.runtime.MessageSender,
    capture.sendResponse,
  );
  assert.deepEqual(await capture.response, {
    candidates: [],
    failures: [],
    scannedChainIds: [1, 8453, 42161, 10],
    nextOffset: 4,
    totalChains: 53,
    complete: false,
  });
  assert.deepEqual(receivedPages, [
    { offset: 0, limit: 0 },
    { offset: 0, limit: 4 },
  ]);

  const invalid = captureResponse();
  router(
    {
      type: "findSafesByOwner",
      accountId: "pk-owner",
      offset: 0,
      limit: 11,
    },
    {} as chrome.runtime.MessageSender,
    invalid.sendResponse,
  );
  assert.deepEqual(await invalid.response, {
    success: false,
    error: "Invalid Safe discovery batch",
  });
});

test("Safe import consumes background verification without probing networks again", async () => {
  let probeCalls = 0;
  let importedSnapshots: SafeChainSnapshot[] = [];
  const capture = captureResponse();
  const router = createBackgroundSafeAccountMessageRouter({
    resolvePasswordType: async () => "master",
    probeSafeAddress: async () => {
      probeCalls += 1;
      throw new Error("duplicate probe should not run");
    },
    resolveSafeImportVerifications: () => ({
      address: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      snapshots: [verifiedSnapshot],
    }),
    getAccounts: async () => accounts,
    importVerifiedSafeAccount: async (input) => {
      importedSnapshots = input.snapshots;
      return {
        account: {
          id: "safe-account",
          type: "safe",
          address: input.address,
          createdAt: 3,
        },
        record: {
          version: 1,
          accountId: "safe-account",
          address: input.address,
          importedBy: input.importedBy,
          chains: { "8453": input.snapshots[0] },
        },
        created: true,
      };
    },
    setActiveAccountId: async () => undefined,
    discardSafeImportVerifications: () => undefined,
    sendRuntimeMessage: async () => undefined,
  });

  router(
    {
      type: "importSafeAccount",
      address: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      chainIds: [8453],
      verificationIds: ["verified-receipt"],
      importedBy: "ownerDiscovery",
    },
    {} as chrome.runtime.MessageSender,
    capture.sendResponse,
  );

  const result = await capture.response;
  assert.equal(result.success, true);
  assert.equal(probeCalls, 0);
  assert.equal(importedSnapshots.length, 1);
  assert.equal(importedSnapshots[0].chainId, 8453);
});
