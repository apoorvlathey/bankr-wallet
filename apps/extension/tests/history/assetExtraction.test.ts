import assert from "node:assert/strict";
import test from "node:test";
import {
  decodeAccountErc20Transfers,
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
      assetChanges: { blockNumber: "1", erc20Transfers: [] },
    } as CompletedTransaction;
    assert.equal(shouldReconcileReceiptDerivedHistory(tx), true, accountType);
  }
});

test("backfill eligibility does not requeue existing or non-success entries", async () => {
  const history = [
    {
      id: "enriched",
      status: "success",
      txHash: "0xhash",
      tx: { from: USER },
      chainId: 1,
      assetChanges: { blockNumber: "1", erc20Transfers: [] },
    },
    {
      id: "failed",
      status: "failed",
      txHash: "0xhash",
      tx: { from: USER },
      chainId: 8453,
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
    assert.equal(harness.writes.length, 0);
  } finally {
    harness.restore();
  }
});
