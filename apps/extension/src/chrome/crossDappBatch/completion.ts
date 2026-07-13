import { CHAIN_CONFIG } from "../../constants/chainConfig";
import { updateBundleStatus } from "../batch/bundleStatusStorage";
import { BUNDLE_STATUS, type BundleReceipt } from "../erc5792Types";
import { startReceiptPolling } from "../forceInclusion/receiptPoller";
import {
  extractAssetChangesWhenReceiptAvailable,
  fetchBundleReceipt,
  fetchRawTransactionReceipt,
  toBundleReceipt,
} from "../receiptEnrichment";
import { getTxById, updateTxInHistory } from "../txHistoryStorage";
import { showNotification } from "../transactions/notification";
import { writeResultToStorage } from "../transactions/runtime";
import { clearCrossDappBatch, type CrossDappBatch } from "./storage";
import type {
  CrossDappBatchShipResult,
  EthSendTransactionFanOutOutcome,
  WalletSendCallsFanOutOutcome,
} from "./types";

export interface CrossDappBatchFanOut {
  walletSendCalls: (outcome: WalletSendCallsFanOutOutcome) => Promise<void>;
  ethSendTransactions: (
    outcome: EthSendTransactionFanOutOutcome,
  ) => Promise<void>;
}

export function createCrossDappBatchFanOut(
  batch: CrossDappBatch,
): CrossDappBatchFanOut {
  return {
    walletSendCalls: async (outcome) => {
      const seenBundles = new Set<string>();
      await Promise.all(
        batch.entries.map(async (entry) => {
          if (entry.source?.kind !== "wallet_sendCalls") return;
          const bundleId = entry.source.bundleId;
          if (seenBundles.has(bundleId)) return;
          seenBundles.add(bundleId);
          if (outcome.kind === "submitted") {
            await updateBundleStatus(bundleId, {
              status: BUNDLE_STATUS.PENDING,
              txHash: outcome.txHash,
              atomic: true,
            });
          } else if (outcome.kind === "confirmed") {
            await updateBundleStatus(bundleId, {
              status: BUNDLE_STATUS.CONFIRMED,
              txHash: outcome.txHash,
              receipts: outcome.receipt ? [outcome.receipt] : undefined,
              completedAt: Date.now(),
              atomic: true,
            });
          } else if (outcome.kind === "reverted") {
            await updateBundleStatus(bundleId, {
              status: BUNDLE_STATUS.REVERTED,
              txHash: outcome.txHash,
              error: outcome.error,
              completedAt: Date.now(),
              atomic: true,
            });
          } else {
            await updateBundleStatus(bundleId, {
              status: BUNDLE_STATUS.OFFCHAIN_FAILURE,
              error: outcome.error,
              completedAt: Date.now(),
            });
          }
        }),
      );
    },
    ethSendTransactions: async (outcome) => {
      await Promise.all(
        batch.entries.map((entry) => {
          if (entry.source?.kind === "wallet_sendCalls") {
            return Promise.resolve();
          }
          return writeResultToStorage(
            `txResult:${entry.txId}`,
            outcome.kind === "submitted"
              ? { success: true, txHash: outcome.txHash }
              : { success: false, error: outcome.error },
          );
        }),
      );
    },
  };
}

export async function publishCrossDappBatchShipResult(args: {
  historyId: string;
  callCount: number;
  batch: CrossDappBatch;
  ship: CrossDappBatchShipResult;
  fanOut: CrossDappBatchFanOut;
}): Promise<{ success: boolean; error?: string; txHash?: string }> {
  const { historyId, callCount, batch, ship, fanOut } = args;
  if (ship.kind === "retryable") {
    return { success: false, error: ship.error };
  }
  if (ship.kind === "authorization") {
    await failHistory(historyId, ship.error);
    return { success: false, error: ship.error };
  }
  if (ship.kind === "error") {
    await failHistory(historyId, ship.error);
    await Promise.all([
      fanOut.walletSendCalls({ kind: "error", error: ship.error }),
      fanOut.ethSendTransactions({ kind: "error", error: ship.error }),
    ]);
    await clearCrossDappBatch();
    await showNotification(
      `cross-dapp-batch-failed-${historyId}`,
      "Cross-Dapp Batch Failed",
      `Batch on ${batch.chainName} failed: ${ship.error}`,
    );
    return { success: false, error: ship.error };
  }
  if (ship.kind === "reverted") {
    await updateTxInHistory(historyId, {
      status: "failed",
      txHash: ship.txHash,
      error: ship.error,
      completedAt: Date.now(),
    });
    await Promise.all([
      fanOut.walletSendCalls({
        kind: "reverted",
        txHash: ship.txHash,
        error: ship.error,
      }),
      fanOut.ethSendTransactions({
        kind: "reverted",
        txHash: ship.txHash,
        error: ship.error,
      }),
    ]);
    await clearCrossDappBatch();
    await showNotification(
      `cross-dapp-batch-reverted-${historyId}`,
      "Cross-Dapp Batch Reverted",
      `Batch on ${batch.chainName} reverted onchain.`,
    );
    return { success: false, error: ship.error, txHash: ship.txHash };
  }

  const txHash = ship.txHash;
  await fanOut.ethSendTransactions({ kind: "submitted", txHash });
  if (ship.status === "success") {
    const rawReceipt = await fetchRawTransactionReceipt(txHash, batch.chainId);
    const receipt = rawReceipt ? toBundleReceipt(rawReceipt.receipt) : null;
    await updateTxInHistory(historyId, {
      status: "success",
      txHash,
      completedAt: Date.now(),
    });
    extractAssetChangesWhenReceiptAvailable({
      txId: historyId,
      txHash,
      chainId: batch.chainId,
      userAddress: batch.fromAddress,
      receipt: rawReceipt?.receipt,
      rpcUrl: rawReceipt?.rpcUrl,
      logPrefix: "[cross-dapp]",
    });
    await fanOut.walletSendCalls({ kind: "confirmed", txHash, receipt });
    const explorer = CHAIN_CONFIG[batch.chainId]?.explorer;
    const notificationId = `cross-dapp-batch-success-${historyId}`;
    if (explorer) {
      chrome.storage.local.set({
        [`notification-${notificationId}`]: `${explorer}/tx/${txHash}`,
      });
    }
    await showNotification(
      notificationId,
      "Cross-Dapp Batch Confirmed",
      `Batch (${callCount} call${callCount === 1 ? "" : "s"}) on ${batch.chainName} was successful.`,
    );
  } else {
    await updateTxInHistory(historyId, {
      status: "pending",
      txHash,
      broadcastUncertain: ship.broadcastUncertain === true,
    });
    await fanOut.walletSendCalls({ kind: "submitted", txHash });
    startReceiptPolling(historyId, txHash, batch.chainId);
    void trackCrossDappBatchCompletion({
      historyId,
      txHash,
      chainId: batch.chainId,
      fanOutWalletSendCalls: fanOut.walletSendCalls,
    });
  }
  await clearCrossDappBatch();
  return { success: true, txHash };
}

export async function trackCrossDappBatchCompletion(args: {
  historyId: string;
  txHash: string;
  chainId: number;
  fanOutWalletSendCalls: (
    outcome:
      | { kind: "confirmed"; txHash: string; receipt?: BundleReceipt | null }
      | { kind: "reverted"; txHash?: string; error: string },
  ) => Promise<void>;
}): Promise<void> {
  const startTime = Date.now();
  while (Date.now() - startTime < 10 * 60 * 1000) {
    await new Promise((resolve) => setTimeout(resolve, 5_000));
    const tx = await getTxById(args.historyId);
    if (!tx || tx.status === "processing" || tx.status === "pending") continue;
    if (tx.status === "success") {
      const receipt = await fetchBundleReceipt(args.txHash, args.chainId);
      await args.fanOutWalletSendCalls({
        kind: "confirmed",
        txHash: args.txHash,
        receipt,
      });
    } else {
      await args.fanOutWalletSendCalls({
        kind: "reverted",
        txHash: args.txHash,
        error: tx.error || "Transaction reverted",
      });
    }
    return;
  }
}

async function failHistory(historyId: string, error: string): Promise<void> {
  await updateTxInHistory(historyId, {
    status: "failed",
    error,
    completedAt: Date.now(),
  });
}
