import assert from "node:assert/strict";
import test from "node:test";
import { IDBFactory, IDBKeyRange } from "fake-indexeddb";
import { encodeAbiParameters } from "viem";
import {
  decodeAccountErc20Transfers,
  decodeAccountNftTransfers,
  ERC1155_TRANSFER_BATCH_TOPIC,
  ERC1155_TRANSFER_SINGLE_TOPIC,
  ERC20_TRANSFER_TOPIC,
  toHistoryBigInt,
} from "../../src/chrome/history/assetTransferParser";
import { toBundleReceipt } from "../../src/chrome/history/receiptTransport";
import {
  deriveNativeDelta,
  isWalletOuterGasPayer,
} from "../../src/chrome/history/nativeDelta";
import { fetchSettledReceiptAtRpcUrl } from "../../src/chrome/history/receiptSettlement";
import { shouldReconcileReceiptDerivedHistory } from "../../src/chrome/history/receiptReconciliation";
import { separateErc20FeeTransfers } from "../../src/chrome/history/erc20FeeSettlement";
import type { CompletedTransaction } from "../../src/chrome/history/types";
import { createChromeStorageHarness } from "../helpers/chromeStorageHarness";

const USER = `0x${"1".repeat(40)}`;
const OTHER = `0x${"2".repeat(40)}`;
const TOKEN = `0x${"a".repeat(40)}`;
const topic = (address: string) => `0x${"0".repeat(24)}${address.slice(2)}`;

test("asset parser keeps only non-zero fungible transfers involving the account", () => {
  const log = (from: string, to: string, data: string, topics = 3) => ({
    address: TOKEN.toUpperCase(),
    data,
    topics: [ERC20_TRANSFER_TOPIC, topic(from), topic(to), topic(OTHER)].slice(
      0,
      topics,
    ),
  });
  const receipt = {
    logs: [
      log(USER, OTHER, "0x2a"),
      log(OTHER, USER, "0x07"),
      log(USER, USER, "0x03"),
      log(USER, OTHER, "0x09", 4),
      log(OTHER, OTHER, "0x05"),
      log(USER, OTHER, "0x00"),
      log(USER, OTHER, "not-hex"),
      { ...log(USER, OTHER, "0x01"), address: "0x1234" },
    ],
  };

  assert.deepEqual(decodeAccountErc20Transfers(receipt, USER), [
    {
      token: TOKEN,
      direction: "out",
      counterparty: OTHER,
      amountWei: "42",
    },
    {
      token: TOKEN,
      direction: "in",
      counterparty: OTHER,
      amountWei: "7",
    },
    {
      token: TOKEN,
      direction: "out",
      counterparty: USER,
      amountWei: "3",
    },
  ]);
  assert.equal(toHistoryBigInt("0x2a"), 42n);
  assert.equal(toHistoryBigInt(7), 7n);
  assert.equal(toHistoryBigInt(3n), 3n);
  assert.equal(toHistoryBigInt(null), 0n);
});

test("asset parser decodes ERC-721 and ERC-1155 transfers involving the account", () => {
  const receipt = {
    logs: [
      {
        address: TOKEN,
        topics: [ERC20_TRANSFER_TOPIC, topic(USER), topic(OTHER), "0x2a"],
        data: "0x",
      },
      {
        address: TOKEN,
        topics: [
          ERC1155_TRANSFER_SINGLE_TOPIC,
          topic(OTHER),
          topic(OTHER),
          topic(USER),
        ],
        data: encodeAbiParameters(
          [{ type: "uint256" }, { type: "uint256" }],
          [7n, 3n],
        ),
      },
      {
        address: TOKEN,
        topics: [
          ERC1155_TRANSFER_BATCH_TOPIC,
          topic(OTHER),
          topic(USER),
          topic(OTHER),
        ],
        data: encodeAbiParameters(
          [{ type: "uint256[]" }, { type: "uint256[]" }],
          [[8n, 9n], [1n, 2n]],
        ),
      },
    ],
  };

  assert.deepEqual(decodeAccountNftTransfers(receipt, USER), [
    {
      token: TOKEN,
      direction: "out",
      counterparty: OTHER,
      standard: "erc721",
      tokenId: "42",
      amount: "1",
    },
    {
      token: TOKEN,
      direction: "in",
      counterparty: OTHER,
      standard: "erc1155",
      tokenId: "7",
      amount: "3",
    },
    {
      token: TOKEN,
      direction: "out",
      counterparty: OTHER,
      standard: "erc1155",
      tokenId: "8",
      amount: "1",
    },
    {
      token: TOKEN,
      direction: "out",
      counterparty: OTHER,
      standard: "erc1155",
      tokenId: "9",
      amount: "2",
    },
  ]);
});

test("bundle receipt projection excludes provider-specific fields", () => {
  assert.deepEqual(
    toBundleReceipt({
      status: "0x1",
      blockHash: "0xblock",
      blockNumber: "0x10",
      gasUsed: "0x20",
      transactionHash: "0xtx",
      effectiveGasPrice: "0x99",
      logs: [
        {
          address: TOKEN,
          topics: [ERC20_TRANSFER_TOPIC],
          data: "0x01",
          blockHash: "must-not-leak",
        },
      ],
    }),
    {
      status: "0x1",
      blockHash: "0xblock",
      blockNumber: "0x10",
      gasUsed: "0x20",
      transactionHash: "0xtx",
      logs: [
        {
          address: TOKEN,
          topics: [ERC20_TRANSFER_TOPIC],
          data: "0x01",
        },
      ],
    },
  );
});

test("sealed Base fees remove the exact false native residual", () => {
  const previousBalance = 10_000_000_000_000_000n;
  const chargedFee = 226_003_804_786n;
  const currentBalance = previousBalance - chargedFee;
  const commonReceipt = {
    gasUsed: "0x8fc0",
    effectiveGasPrice: "0x5d6240",
  };

  assert.equal(
    deriveNativeDelta({
      currentBalance,
      previousBalance,
      receipt: { ...commonReceipt, l1Fee: "0x25e7de09" },
      payerForGas: true,
    }),
    "-151852137",
  );
  assert.equal(
    deriveNativeDelta({
      currentBalance,
      previousBalance,
      receipt: { ...commonReceipt, l1Fee: "0x2ef4f272" },
      payerForGas: true,
    }),
    undefined,
  );
});

test("token-funded UserOperations do not attribute bundler gas to the wallet", () => {
  const balance = 10_000_000_000_000_000n;
  assert.equal(isWalletOuterGasPayer("USDC"), false);
  assert.equal(isWalletOuterGasPayer(undefined), true);
  assert.equal(isWalletOuterGasPayer(undefined, { token: TOKEN }), false);
  assert.equal(
    deriveNativeDelta({
      currentBalance: balance,
      previousBalance: balance,
      receipt: { gasUsed: "0x5208", effectiveGasPrice: "0x3b9aca00" },
      payerForGas: isWalletOuterGasPayer("USDC"),
    }),
    undefined,
  );
});

test("paymaster token charges are separated without hiding same-token activity", () => {
  const paymaster = `0x${"3".repeat(40)}`;
  const transfers = [
    { token: TOKEN, direction: "out" as const, counterparty: OTHER, amountWei: "100000" },
    { token: TOKEN, direction: "out" as const, counterparty: paymaster, amountWei: "5847" },
    { token: `0x${"b".repeat(40)}`, direction: "out" as const, counterparty: paymaster, amountWei: "9" },
  ];
  assert.deepEqual(
    separateErc20FeeTransfers(transfers, { token: TOKEN, paymaster }),
    { transfers: [transfers[0], transfers[2]], amountWei: "5847" },
  );
});

test("sponsored amount removes a treasury transfer distinct from the paymaster", () => {
  const paymaster = `0x${"3".repeat(40)}`;
  const treasury = `0x${"4".repeat(40)}`;
  const swap = { token: TOKEN, direction: "out" as const, counterparty: OTHER, amountWei: "100000" };
  const fee = { token: TOKEN, direction: "out" as const, counterparty: treasury, amountWei: "5797" };
  assert.deepEqual(
    separateErc20FeeTransfers([swap, fee], {
      token: TOKEN,
      paymaster,
      amountWei: "5797",
    }),
    { transfers: [swap], amountWei: "5797" },
  );
});

test("paymaster refunds reduce the settled fee and both settlement legs are removed", () => {
  const paymaster = `0x${"3".repeat(40)}`;
  const unrelated = { token: TOKEN, direction: "out" as const, counterparty: OTHER, amountWei: "100000" };
  assert.deepEqual(
    separateErc20FeeTransfers([
      unrelated,
      { token: TOKEN, direction: "out", counterparty: paymaster, amountWei: "10000" },
      { token: TOKEN, direction: "in", counterparty: paymaster, amountWei: "4153" },
    ], { token: TOKEN, paymaster }),
    { transfers: [unrelated], amountWei: "5847" },
  );
});

test("unproven or non-positive paymaster settlement fails open", () => {
  const paymaster = `0x${"3".repeat(40)}`;
  const transfers = [
    { token: TOKEN, direction: "in" as const, counterparty: paymaster, amountWei: "5" },
  ];
  assert.deepEqual(
    separateErc20FeeTransfers(transfers, { token: TOKEN, paymaster }),
    { transfers },
  );
});

test("Flashblocks receipt enrichment waits for a canonical following block", async () => {
  const blockNumber = "0x2e7103e";
  const canonicalReceipt = {
    blockNumber,
    blockHash: "0xcanonical",
    l1Fee: "0x2ef4f272",
  };
  let headReads = 0;
  const receipt = await fetchSettledReceiptAtRpcUrl(
    "https://example.invalid",
    "0xhash",
    8453,
    {
      ...canonicalReceipt,
      blockHash: "0xpreconfirmed",
      l1Fee: "0x25e7de09",
    },
    {
      attempts: 3,
      sleep: async () => undefined,
      rpcCall: async (method) => {
        if (method === "eth_blockNumber") {
          headReads += 1;
          return headReads === 1 ? blockNumber : "0x2e7103f";
        }
        if (method === "eth_getBlockByNumber") {
          return { hash: "0xcanonical" };
        }
        if (method === "eth_getTransactionReceipt") return canonicalReceipt;
        throw new Error(`Unexpected method: ${method}`);
      },
    },
  );

  assert.equal(receipt?.l1Fee, "0x2ef4f272");
  assert.equal(receipt?.blockHash, "0xcanonical");
});

test("receipt reconciliation is wallet-type neutral", () => {
  for (const accountType of ["bankr", "privateKey", "seedPhrase"] as const) {
    const tx = {
      id: accountType,
      status: "success",
      txHash: "0xhash",
      tx: { from: USER },
      chainId: 8453,
      accountType,
      assetChanges: { version: 2, blockNumber: "1", erc20Transfers: [] },
    } as CompletedTransaction;
    assert.equal(shouldReconcileReceiptDerivedHistory(tx), true, accountType);
  }
});

test("legacy ERC-20-only history snapshots are eligible for lazy NFT backfill", () => {
  const base = {
    status: "success" as const,
    txHash: "0xhash",
    tx: { from: USER },
    chainId: 1,
  };
  assert.equal(
    shouldReconcileReceiptDerivedHistory({
      ...base,
      assetChanges: { blockNumber: "1", erc20Transfers: [] },
    }),
    true,
  );
  assert.equal(
    shouldReconcileReceiptDerivedHistory({
      ...base,
      assetChanges: { version: 2, blockNumber: "1", erc20Transfers: [] },
    }),
    false,
  );
});

test("only new unresolved token-fee history can repair a failed receipt", () => {
  const base = {
    status: "failed" as const,
    txHash: "0xhash",
    tx: { from: USER },
    chainId: 1,
    assetChanges: { version: 2 as const, blockNumber: "1", erc20Transfers: [] },
  };
  assert.equal(shouldReconcileReceiptDerivedHistory(base), false);
  assert.equal(shouldReconcileReceiptDerivedHistory({
    ...base,
    erc20FeePayment: { token: TOKEN },
  }), true);
  assert.equal(shouldReconcileReceiptDerivedHistory({
    ...base,
    erc20FeePayment: { token: TOKEN, amountWei: "5847" },
  }), false);
});

test("backfill eligibility does not requeue existing or non-success entries", async () => {
  Object.assign(globalThis, {
    indexedDB: new IDBFactory(),
    IDBKeyRange,
  });
  const history = [
    {
      id: "enriched",
      status: "success",
      txHash: "0xhash",
      tx: { from: USER },
      chainId: 1,
      createdAt: 1,
      assetChanges: { version: 2, blockNumber: "1", erc20Transfers: [] },
    },
    {
      id: "failed",
      status: "failed",
      txHash: "0xhash",
      tx: { from: USER },
      chainId: 8453,
      createdAt: 2,
    },
  ] as CompletedTransaction[];
  const harness = createChromeStorageHarness({ local: { txHistory: history } });
  try {
    const { queueAssetChangesBackfill } = await import(
      "../../src/chrome/history/receiptEnrichment"
    );
    assert.deepEqual(await queueAssetChangesBackfill("missing"), {
      success: false,
      error: "Transaction not found",
    });
    assert.deepEqual(await queueAssetChangesBackfill("enriched"), {
      success: true,
      queued: false,
    });
    assert.deepEqual(await queueAssetChangesBackfill("failed"), {
      success: false,
      error: "Transaction is not backfillable",
    });
    assert.equal(harness.stores.local.txHistory, undefined);
  } finally {
    const { resetHistoryDatabaseConnectionForTests } = await import(
      "../../src/chrome/history/database"
    );
    resetHistoryDatabaseConnectionForTests();
    harness.restore();
  }
});
