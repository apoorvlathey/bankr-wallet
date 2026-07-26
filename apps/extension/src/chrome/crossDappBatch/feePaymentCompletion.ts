import { WALLETCHAN_PIMLICO_PROXY_BASE } from "@/constants/externalUrls";
import { applyReceiptToHistory } from "../forceInclusion/receiptPoller";
import { PimlicoClient } from "../feePayment/pimlicoClient";
import { removePendingUserOperation } from "../feePayment/pendingOperations";
import type { Address, Hex } from "../feePayment/pimlicoTypes";
import {
  verifyUserOperationReceiptOnchain,
  type VerifiedUserOperationReceipt,
} from "../feePayment/receiptValidation";
import { toBundleReceipt } from "../receiptEnrichment";
import { updateTxInHistory } from "../txHistoryStorage";
import { showNotification } from "../transactions/notification";
import { createCrossDappBatchFanOutFromRoute } from "./completion";
import type { CrossDappBatchResultRoute } from "./resultRoute";
import type { CrossDappBatch } from "./storage";

const RECEIPT_POLL_INTERVAL_MS = 2_000;
const RECEIPT_POLL_ATTEMPTS = 60;

export async function finalizeCrossDappFeePaymentReceipt(input: {
  historyId: string;
  chainId: number;
  route: CrossDappBatchResultRoute;
  verified: VerifiedUserOperationReceipt;
}): Promise<void> {
  const fanOut = createCrossDappBatchFanOutFromRoute(input.route);
  await applyReceiptToHistory(
    input.historyId,
    input.verified.txHash,
    input.chainId,
    {
      ...input.verified.receipt,
      status: input.verified.success ? "success" : "reverted",
    },
    { feePaymentPaymaster: input.verified.paymaster },
  );
  if (input.verified.success) {
    await Promise.all([
      fanOut.ethSendTransactions({
        kind: "submitted",
        txHash: input.verified.txHash,
      }),
      fanOut.walletSendCalls({
        kind: "confirmed",
        txHash: input.verified.txHash,
        receipt: toBundleReceipt(input.verified.receipt),
      }),
    ]);
  } else {
    await Promise.all([
      fanOut.ethSendTransactions({
        kind: "reverted",
        txHash: input.verified.txHash,
        error: "Transaction reverted",
      }),
      fanOut.walletSendCalls({
        kind: "reverted",
        txHash: input.verified.txHash,
        error: "UserOperation reverted",
      }),
    ]);
  }
}

export async function pollCrossDappFeePaymentReceipt(input: {
  historyId: string;
  chainId: number;
  sender: Address;
  userOperationHash: Hex;
  route: CrossDappBatchResultRoute;
}): Promise<boolean> {
  const client = new PimlicoClient(
    `${WALLETCHAN_PIMLICO_PROXY_BASE}/${input.chainId}`,
    input.chainId,
  );
  for (let attempt = 0; attempt < RECEIPT_POLL_ATTEMPTS; attempt += 1) {
    const receipt = await client.getUserOperationReceipt(
      input.userOperationHash,
    );
    if (receipt) {
      const verified = await verifyUserOperationReceiptOnchain({
        chainId: input.chainId,
        sender: input.sender,
        userOperationHash: input.userOperationHash,
        bundlerReceipt: receipt,
      });
      if (verified) {
        await finalizeCrossDappFeePaymentReceipt({
          historyId: input.historyId,
          chainId: input.chainId,
          route: input.route,
          verified,
        });
        await removePendingUserOperation(input.historyId);
        return true;
      }
    }
    await new Promise((resolve) =>
      setTimeout(resolve, RECEIPT_POLL_INTERVAL_MS),
    );
  }
  return false;
}

export async function failConsumedCrossDappBatch(input: {
  batch: CrossDappBatch;
  historyId: string;
  route: CrossDappBatchResultRoute;
  error: string;
}): Promise<void> {
  const fanOut = createCrossDappBatchFanOutFromRoute(input.route);
  await updateTxInHistory(input.historyId, {
    status: "failed",
    error: input.error,
    completedAt: Date.now(),
  });
  await Promise.all([
    fanOut.ethSendTransactions({ kind: "error", error: input.error }),
    fanOut.walletSendCalls({ kind: "error", error: input.error }),
  ]);
  await showNotification(
    `cross-dapp-batch-failed-${input.historyId}`,
    "Cross-Dapp Batch Failed",
    `Batch on ${input.batch.chainName} failed: ${input.error}`,
  );
}
