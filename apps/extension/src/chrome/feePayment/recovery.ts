import {
  applyErc20FeeReceiptEnrichment,
  applyReceiptToHistory,
} from "../forceInclusion/receiptPoller";
import { BUNDLE_STATUS } from "../erc5792Types";
import { toBundleReceipt } from "../receiptEnrichment";
import { updateBundleStatus } from "../batch/bundleStatusStorage";
import { updateTxInHistory } from "../txHistoryStorage";
import { writeResultToStorage } from "../transactions/runtime";
import { WALLETCHAN_PIMLICO_PROXY_BASE } from "@/constants/externalUrls";
import { PimlicoClient } from "./pimlicoClient";
import {
  getPendingUserOperations,
  removePendingUserOperation,
  type PendingUserOperation,
} from "./pendingOperations";
import { verifyUserOperationReceiptOnchain } from "./receiptValidation";
import type { Address } from "./pimlicoTypes";

type UserOperationReceipt = NonNullable<
  Awaited<ReturnType<PimlicoClient["getUserOperationReceipt"]>>
>;
type SettledUserOperationReceipt = UserOperationReceipt & {
  paymaster: Address;
};

function receiptTransactionHash(receipt: Record<string, unknown>): `0x${string}` {
  const hash = receipt.transactionHash;
  if (typeof hash !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(hash)) {
    throw new Error("UserOperation receipt omitted transaction hash");
  }
  return hash as `0x${string}`;
}

async function finalizeTransaction(
  record: PendingUserOperation,
  receipt: SettledUserOperationReceipt,
) {
  const txHash = receiptTransactionHash(receipt.receipt);
  if (receipt.success) {
    await applyReceiptToHistory(
      record.txId,
      txHash,
      record.chainId,
      receipt.receipt,
      { feePaymentPaymaster: receipt.paymaster },
    );
    await writeResultToStorage(`txResult:${record.txId}`, {
      success: true,
      txHash,
    });
  } else {
    await applyReceiptToHistory(
      record.txId,
      txHash,
      record.chainId,
      { ...receipt.receipt, status: "reverted" },
      { feePaymentPaymaster: receipt.paymaster },
    );
    await writeResultToStorage(`txResult:${record.txId}`, {
      success: false,
      error: "Transaction reverted",
    });
  }
}

async function finalizeBatch(
  record: PendingUserOperation,
  receipt: SettledUserOperationReceipt,
) {
  const txHash = receiptTransactionHash(receipt.receipt);
  await updateBundleStatus(record.txId, {
    status: receipt.success ? BUNDLE_STATUS.CONFIRMED : BUNDLE_STATUS.REVERTED,
    atomic: true,
    txHash,
    receipts: [toBundleReceipt(receipt.receipt)],
    completedAt: Date.now(),
    ...(receipt.success ? {} : { error: "UserOperation reverted" }),
  });
  await updateTxInHistory(record.txId, {
    status: receipt.success ? "success" : "failed",
    txHash,
    completedAt: Date.now(),
    ...(receipt.success ? {} : { error: "UserOperation reverted" }),
  });
  await applyErc20FeeReceiptEnrichment(
    record.txId,
    txHash,
    record.chainId,
    receipt.receipt,
    receipt.paymaster,
  );
  await writeResultToStorage(`batchTxResult:${record.txId}`,
    receipt.success
      ? { success: true, txHash }
      : { success: false, error: "Batch transaction reverted" },
  );
}

export async function resumePendingFeePaymentOperations(): Promise<void> {
  const records = await getPendingUserOperations();
  await Promise.allSettled(
    records.map(async (record) => {
      const client = new PimlicoClient(
        `${WALLETCHAN_PIMLICO_PROXY_BASE}/${record.chainId}`,
        record.chainId,
      );
      const receipt = await client.getUserOperationReceipt(
        record.userOperationHash,
      );
      if (!receipt) return;
      const verified = await verifyUserOperationReceiptOnchain({
        chainId: record.chainId,
        sender: record.sender,
        userOperationHash: record.userOperationHash,
        bundlerReceipt: receipt,
      });
      if (!verified) return;
      const verifiedReceipt = {
        ...receipt,
        success: verified.success,
        receipt: verified.receipt,
        paymaster: verified.paymaster,
      };
      if (record.family === "transaction") {
        await finalizeTransaction(record, verifiedReceipt);
      } else if (record.family === "batchTransaction") {
        await finalizeBatch(record, verifiedReceipt);
      } else if (record.family === "crossDappBatch") {
        if (!record.crossDappResultRoute) {
          throw new Error("Cross-dapp recovery route is missing");
        }
        const { finalizeCrossDappFeePaymentReceipt } = await import(
          "../crossDappBatch/feePaymentCompletion"
        );
        await finalizeCrossDappFeePaymentReceipt({
          historyId: record.txId,
          chainId: record.chainId,
          route: record.crossDappResultRoute,
          verified,
        });
      } else {
        const { finalizeSafeFeePaymentReceipt } = await import(
          "../safe/feePaymentExecution"
        );
        await finalizeSafeFeePaymentReceipt({
          proposalId: record.txId,
          userOperationHash: record.userOperationHash,
          verified,
        });
      }
      await removePendingUserOperation(record.txId);
    }),
  );
}
