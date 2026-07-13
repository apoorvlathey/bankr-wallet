import type { Hash } from "viem";
import { CHAIN_CONFIG } from "@/constants/chainConfig";
import { FORCE_INCLUSION_CHAINS } from "@/constants/chainRegistry";
import { submitTransactionDirect, type TransactionParams } from "../bankr/client";
import { authorizePendingBankrSubmit } from "../bankr/pendingAuthorization";
import { BUNDLE_STATUS, type PendingBatchTxRequest } from "../erc5792Types";
import { updateBundleStatus } from "../batch/bundleStatusStorage";
import { enforcePendingRequestAuthorizationAtConfirmation } from "../requests/pendingRequestLifecycle";
import {
  guardPendingRequestEffectLease,
  type PendingRequestEffectLease,
} from "../requests/pendingRequestResolution";
import { showNotification } from "../transactions/notification";
import { writeResultToStorage } from "../transactions/runtime";
import { addTxToHistory, updateTxInHistory } from "../txHistoryStorage";
import { writeBatchForceInclusionFailure } from "./batchFailure";
import { buildL1DepositTxParams } from "./deposit";
import {
  createL1PublicClient,
  getL1RpcUrl,
  L1_RECEIPT_TIMEOUT,
  writeForceInclusionProgress,
} from "./l1Client";
import { extractL2Hash } from "./singleOutcome";

export async function processForceInclusionBatchBankr(
  bundleId: string,
  pending: PendingBatchTxRequest,
  apiKey: string,
  functionNames?: string[],
  effectLease?: PendingRequestEffectLease,
): Promise<void> {
  const info = FORCE_INCLUSION_CHAINS.get(pending.chainId);
  if (!info) {
    await writeBatchForceInclusionFailure(
      bundleId,
      pending,
      "Chain does not support force inclusion",
    );
    effectLease?.release();
    return;
  }
  const effectGuard = guardPendingRequestEffectLease(effectLease);
  const progress = (stage: any, extra?: any) =>
    writeForceInclusionProgress(bundleId, {
      stage,
      l1ChainId: info.l1ChainId,
      l2ChainId: pending.chainId,
      timestamp: Date.now(),
      ...extra,
    });

  try {
    const { getAccountById } = await import("../accountStorage");
    const account = pending.accountId
      ? await getAccountById(pending.accountId)
      : null;
    if (
      !account ||
      !pending.accountAddress ||
      account.address.toLowerCase() !== pending.accountAddress.toLowerCase()
    ) {
      await writeBatchForceInclusionFailure(
        bundleId,
        pending,
        "Pending request account is no longer available",
      );
      effectGuard.releaseIfSafe();
      return;
    }

    const { encodeBatchCalls } = await import("../batchTxHandlers");
    const encoded = encodeBatchCalls(pending.params.calls, account.address);
    const syntheticTx: TransactionParams = {
      from: account.address,
      to: encoded.to,
      data: encoded.data,
      value: encoded.value,
      chainId: pending.chainId,
    };
    const displayName = functionNames?.length
      ? `Batch: ${functionNames.join(", ")} (Force Inclusion)`
      : `Batch (${pending.params.calls.length} calls) (Force Inclusion)`;
    await addTxToHistory({
      id: bundleId,
      status: "processing",
      tx: syntheticTx,
      origin: pending.origin,
      favicon: pending.favicon,
      chainName: pending.chainName,
      chainId: pending.chainId,
      createdAt: pending.timestamp,
      accountType: "bankr",
      functionName: displayName,
      forceInclusionMeta: {
        l1TxHash: "",
        l1ChainId: info.l1ChainId,
        l2ChainId: pending.chainId,
        l2Confirmed: false,
      },
    });
    await progress("building");
    const l1TxParams = await buildL1DepositTxParams(syntheticTx, info);
    await progress("submitting");
    const authorization = await enforcePendingRequestAuthorizationAtConfirmation(
      "batchTransaction",
      pending,
    );
    if (!authorization.authorized) throw new Error(authorization.error);
    const result = await submitTransactionDirect(
      apiKey,
      l1TxParams,
      undefined,
      () =>
        authorizePendingBankrSubmit(
          "batchTransaction",
          pending,
          effectGuard.beginEffect,
        ),
    );
    effectGuard.settleEffect();
    effectGuard.releaseIfSafe();
    const l1Hash = result.transactionHash;
    if (result.status === "reverted") {
      await progress("error", { error: "L1 deposit transaction reverted" });
      await writeBatchForceInclusionFailure(
        bundleId,
        pending,
        "L1 deposit transaction reverted",
      );
      return;
    }
    await updateTxInHistory(bundleId, {
      forceInclusionMeta: {
        l1TxHash: l1Hash,
        l1ChainId: info.l1ChainId,
        l2ChainId: pending.chainId,
        l2Confirmed: false,
      },
    });
    await progress("waiting-l1", { l1Hash });
    const client = createL1PublicClient(await getL1RpcUrl(info.l1ChainId));
    const receipt = await client.waitForTransactionReceipt({
      hash: l1Hash as Hash,
      timeout: L1_RECEIPT_TIMEOUT,
    });
    if (receipt.status === "reverted") {
      const error = "L1 deposit transaction reverted onchain";
      await progress("error", { error });
      await writeBatchForceInclusionFailure(bundleId, pending, error);
      return;
    }
    const l2Hash = extractL2Hash(receipt);
    const resultHash = l2Hash || l1Hash;
    await progress("complete", { l1Hash, l2Hash });
    await updateTxInHistory(bundleId, {
      status: "pending",
      txHash: resultHash,
      forceInclusionMeta: {
        l1TxHash: l1Hash,
        l1ChainId: info.l1ChainId,
        l2ChainId: pending.chainId,
        l2Confirmed: false,
      },
    });
    await updateBundleStatus(bundleId, {
      status: BUNDLE_STATUS.PENDING,
      txHash: resultHash,
    });
    const explorer = CHAIN_CONFIG[info.l1ChainId]?.explorer;
    if (explorer) {
      await chrome.storage.local.set({
        [`notification-tx-success-${bundleId}`]: `${explorer}/tx/${l1Hash}`,
      });
    }
    await showNotification(
      `tx-success-${bundleId}`,
      "L1 Batch Deposit Confirmed",
      `Batch deposit confirmed on ${info.l1ChainName}. Awaiting L2 inclusion (~1-10 min).`,
    );
    await writeResultToStorage(`batchTxResult:${bundleId}`, {
      success: true,
      txHash: resultHash,
    });
    if (l2Hash) {
      const { startReceiptPolling } = await import("./receiptPoller");
      startReceiptPolling(bundleId, l2Hash, pending.chainId);
    }
  } catch (error: any) {
    effectGuard.releaseIfSafe();
    const message =
      error?.shortMessage || error?.message || "Force inclusion failed";
    await progress("error", { error: message });
    await writeBatchForceInclusionFailure(bundleId, pending, message);
  }
}
