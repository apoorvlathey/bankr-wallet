import assert from "node:assert/strict";
import test from "node:test";

import {
  handleAppendApprovalRevokeToCrossDappBatch,
  handleAppendApprovalRevokesToCrossDappBatch,
} from "../../src/chrome/crossDappBatch/approvalCleanup";
import { createCrossDappBatchFanOut } from "../../src/chrome/crossDappBatch/completion";
import { parseApproveCalldata } from "../../src/lib/erc20Approve";
import { createChromeStorageHarness } from "../helpers/chromeStorageHarness";

const WALLET = "0x1111111111111111111111111111111111111111";
const TARGET = "0x2222222222222222222222222222222222222222";
const TOKEN = "0x3333333333333333333333333333333333333333";
const SPENDER = "0x4444444444444444444444444444444444444444";
const TOKEN_TWO = "0x5555555555555555555555555555555555555555";
const SPENDER_TWO = "0x6666666666666666666666666666666666666666";

test("an assembled batch appends a wallet-only cleanup linked to its provider source", async () => {
  const batch = {
    fromAddress: WALLET,
    chainId: 8453,
    chainName: "Base",
    accountType: "privateKey",
    accountId: "pk-1",
    createdAt: 1,
    entries: [{
      txId: "bundle-1:0",
      tx: {
        from: WALLET,
        to: TARGET,
        data: "0x",
        value: "0x0",
        chainId: 8453,
      },
      origin: "https://swap.example",
      favicon: null,
      addedAt: 1,
      source: {
        kind: "wallet_sendCalls",
        bundleId: "bundle-1",
        callIndex: 0,
        totalCalls: 1,
      },
      accountType: "privateKey",
      tabId: 7,
      frameId: 0,
    }],
  } as const;
  const harness = createChromeStorageHarness({
    local: { crossDappBatch: batch },
  });
  try {
    const dependencies = {
      resolvePinnedAccount: async () => ({
        ok: true as const,
        account: {
          id: "pk-1",
          type: "privateKey",
          address: WALLET,
        } as any,
      }),
      eligibilityError: async () => null,
    };
    assert.deepEqual(
      await handleAppendApprovalRevokeToCrossDappBatch(
        TOKEN,
        SPENDER,
        0,
        dependencies,
      ),
      { success: true },
    );
    assert.deepEqual(
      await handleAppendApprovalRevokeToCrossDappBatch(
        TOKEN,
        SPENDER,
        0,
        dependencies,
      ),
      { success: true, alreadyPresent: true },
    );

    const stored = harness.snapshot("local").crossDappBatch as any;
    assert.equal(stored.entries.length, 2);
    const cleanup = stored.entries[1];
    assert.deepEqual(cleanup.source, {
      kind: "walletGenerated",
      parentTxId: "bundle-1:0",
      parentBundleId: "bundle-1",
      reason: "approvalRevoke",
    });
    assert.equal(cleanup.origin, "WalletChan");
    assert.equal(cleanup.favicon, "/walletchan-icon.png");
    assert.equal(cleanup.tabId, undefined);
    assert.equal(cleanup.walletConnect, undefined);
    assert.equal(parseApproveCalldata(cleanup.tx.data)?.isRevoke, true);
    assert.deepEqual(harness.runtimeMessages, [
      { type: "crossDappBatchUpdated" },
    ]);
  } finally {
    harness.restore();
  }
});

test("assembled cleanup fails closed for Bankr and stale source indexes", async () => {
  const harness = createChromeStorageHarness({
    local: {
      crossDappBatch: {
        fromAddress: WALLET,
        chainId: 8453,
        chainName: "Base",
        accountType: "bankr",
        accountId: "bankr-1",
        createdAt: 1,
        entries: [],
      },
    },
  });
  try {
    assert.match(
      (
        await handleAppendApprovalRevokeToCrossDappBatch(
          TOKEN,
          SPENDER,
          0,
        )
      ).error ?? "",
      /cannot add/,
    );
  } finally {
    harness.restore();
  }
});

test("an assembled batch appends multiple cleanup entries with one update", async () => {
  const batch = {
    fromAddress: WALLET,
    chainId: 8453,
    chainName: "Base",
    accountType: "seedPhrase",
    accountId: "seed-1",
    createdAt: 1,
    entries: [{
      txId: "swap-request",
      tx: {
        from: WALLET,
        to: TARGET,
        data: "0x",
        value: "0x0",
        chainId: 8453,
      },
      origin: "https://swap.example",
      favicon: null,
      addedAt: 1,
      source: { kind: "eth_sendTransaction" },
      accountType: "seedPhrase",
    }],
  } as const;
  const harness = createChromeStorageHarness({
    local: { crossDappBatch: batch },
  });
  try {
    const result = await handleAppendApprovalRevokesToCrossDappBatch(
      [
        { tokenAddress: TOKEN, spender: SPENDER, sourceCallIndex: 0 },
        {
          tokenAddress: TOKEN_TWO,
          spender: SPENDER_TWO,
          sourceCallIndex: 0,
        },
      ],
      {
        resolvePinnedAccount: async () => ({
          ok: true as const,
          account: {
            id: "seed-1",
            type: "seedPhrase",
            address: WALLET,
          } as any,
        }),
        eligibilityError: async () => null,
      },
    );
    assert.deepEqual(result, { success: true });
    const stored = harness.snapshot("local").crossDappBatch as any;
    assert.equal(stored.entries.length, 3);
    assert.deepEqual(
      stored.entries.slice(1).map((entry: any) =>
        entry.tx.to.toLowerCase()
      ),
      [TOKEN, TOKEN_TWO],
    );
    assert.deepEqual(harness.runtimeMessages, [
      { type: "crossDappBatchUpdated" },
    ]);
  } finally {
    harness.restore();
  }
});

test("an earlier revoke does not suppress cleanup after a later token pull", async () => {
  const batch = {
    fromAddress: WALLET,
    chainId: 8453,
    chainName: "Base",
    accountType: "privateKey",
    accountId: "pk-1",
    createdAt: 1,
    entries: [{
      txId: "first-swap",
      tx: {
        from: WALLET,
        to: TARGET,
        data: "0x",
        value: "0x0",
        chainId: 8453,
      },
      origin: "https://swap.example",
      favicon: null,
      addedAt: 1,
      source: { kind: "eth_sendTransaction" },
      accountType: "privateKey",
    }],
  } as const;
  const harness = createChromeStorageHarness({
    local: { crossDappBatch: batch },
  });
  const dependencies = {
    resolvePinnedAccount: async () => ({
      ok: true as const,
      account: {
        id: "pk-1",
        type: "privateKey",
        address: WALLET,
      } as any,
    }),
    eligibilityError: async () => null,
  };
  try {
    assert.deepEqual(
      await handleAppendApprovalRevokeToCrossDappBatch(
        TOKEN,
        SPENDER,
        0,
        dependencies,
      ),
      { success: true },
    );
    const withFirstCleanup =
      harness.snapshot("local").crossDappBatch as any;
    await chrome.storage.local.set({
      crossDappBatch: {
        ...withFirstCleanup,
        entries: [
          ...withFirstCleanup.entries,
          {
            ...withFirstCleanup.entries[0],
            txId: "second-swap",
            addedAt: 3,
          },
        ],
      },
    });

    assert.deepEqual(
      await handleAppendApprovalRevokeToCrossDappBatch(
        TOKEN,
        SPENDER,
        2,
        dependencies,
      ),
      { success: true },
    );
    const stored = harness.snapshot("local").crossDappBatch as any;
    assert.equal(stored.entries.length, 4);
    assert.equal(stored.entries[3].source.parentTxId, "second-swap");
  } finally {
    harness.restore();
  }
});

test("wallet-generated cleanup never creates or consumes a dapp result route", async () => {
  const harness = createChromeStorageHarness();
  try {
    const batch = {
      fromAddress: WALLET,
      chainId: 8453,
      chainName: "Base",
      accountType: "privateKey" as const,
      accountId: "pk-1",
      createdAt: 1,
      entries: [
        {
          txId: "dapp-request",
          tx: {
            from: WALLET,
            to: TARGET,
            data: "0x",
            value: "0x0",
            chainId: 8453,
          },
          origin: "https://swap.example",
          favicon: null,
          addedAt: 1,
          source: { kind: "eth_sendTransaction" as const },
        },
        {
          txId: "dapp-request:approval-revoke",
          tx: {
            from: WALLET,
            to: TOKEN,
            data: "0x",
            value: "0x0",
            chainId: 8453,
          },
          origin: "WalletChan",
          favicon: null,
          addedAt: 2,
          source: {
            kind: "walletGenerated" as const,
            parentTxId: "dapp-request",
            reason: "approvalRevoke" as const,
          },
        },
      ],
    };
    await createCrossDappBatchFanOut(batch).ethSendTransactions({
      kind: "submitted",
      txHash: "0xabc",
    });
    const local = harness.snapshot("local") as Record<string, any>;
    assert.deepEqual(local["txResult:dapp-request"].result, {
      success: true,
      txHash: "0xabc",
    });
    assert.equal(
      local["txResult:dapp-request:approval-revoke"],
      undefined,
    );
  } finally {
    harness.restore();
  }
});
