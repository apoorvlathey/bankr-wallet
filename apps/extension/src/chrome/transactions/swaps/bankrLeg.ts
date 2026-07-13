import { CHAIN_CONFIG } from "../../../constants/chainConfig";
import { authorizePendingBankrSubmit } from "../../bankr/pendingAuthorization";
import { BankrApiError } from "../../bankr/response";
import { submitTransactionDirect } from "../../bankr/submission";
import { attachClearSignedMetaToHistory } from "../../clearSignedMetaSnapshot";
import { resetNonce } from "../../forceInclusion/nonceManager";
import type { PinnedTxRequest } from "../../requests/pendingTxStorage";
import {
  guardPendingRequestEffectLease,
  type PendingRequestEffectLease,
} from "../../requests/pendingRequestResolution";
import { extractAssetChangesWhenReceiptAvailable } from "../../receiptEnrichment";
import { startReceiptPolling } from "../../forceInclusion/receiptPoller";
import type { BridgeMeta, SwapMeta } from "../../txHistoryStorage";
import {
  addTxToHistory,
  updateTxInHistory,
} from "../../txHistoryStorage";
import { fetchAndStoreGasData } from "../displayMetadata";
import { handleTransactionFailure } from "../failure";
import { activeAbortControllers } from "../runtime";

export type BankrSwapLegResult =
  | { kind: "accepted"; txHash: string }
  | { kind: "reverted" | "failed" | "ambiguous"; error: string };

/** Submit one ordered Bankr swap leg and publish its exact terminal state. */
export async function processSwapTxBankr(
  txId: string,
  pending: PinnedTxRequest,
  apiKey: string,
  functionName?: string,
  swapMeta?: SwapMeta,
  bridge?: BridgeMeta,
  effectLease?: PendingRequestEffectLease,
): Promise<BankrSwapLegResult> {
  const abortController = new AbortController();
  activeAbortControllers.set(txId, abortController);
  const effectGuard = guardPendingRequestEffectLease(effectLease);

  try {
    await addTxToHistory({
      id: txId,
      status: "processing",
      tx: pending.tx,
      origin: pending.origin,
      favicon: pending.favicon,
      chainName: pending.chainName,
      chainId: pending.tx.chainId,
      createdAt: pending.timestamp,
      accountType: "bankr",
      functionName,
      swapMeta,
      bridge,
    });
    attachClearSignedMetaToHistory(
      txId,
      { ...pending.tx, to: pending.tx.to ?? undefined },
      pending.tx.chainId,
    );

    const result = await submitTransactionDirect(
      apiKey,
      pending.tx,
      abortController.signal,
      () =>
        authorizePendingBankrSubmit(
          "transaction",
          pending,
          effectGuard.beginEffect,
        ),
    );
    effectGuard.settleEffect();
    const txHash = result.transactionHash;

    if (result.status === "reverted") {
      if (txHash) await updateTxInHistory(txId, { txHash });
      await handleTransactionFailure(
        txId,
        pending,
        "Transaction reverted onchain",
      );
      return { kind: "reverted", error: "Transaction reverted onchain" };
    }

    if (result.status === "success" && txHash) {
      await updateTxInHistory(txId, {
        status: "success",
        txHash,
        completedAt: Date.now(),
      });
      extractAssetChangesWhenReceiptAvailable({
        txId,
        txHash,
        chainId: pending.tx.chainId,
        userAddress: pending.tx.from,
        logPrefix: "[bankr-swap]",
      });
      fetchAndStoreGasData(txId, txHash, pending.tx.chainId);

      const notificationId = `tx-success-${txId}`;
      const chainConfig = CHAIN_CONFIG[pending.tx.chainId];
      const explorerUrl = chainConfig?.explorer
        ? `${chainConfig.explorer}/tx/${txHash}`
        : null;
      if (explorerUrl) {
        chrome.storage.local.set({
          [`notification-${notificationId}`]: explorerUrl,
        });
      }
      if (bridge) {
        try {
          const { maybeStartBridgePolling } = await import(
            "../../bridgeStatusPoller"
          );
          await maybeStartBridgePolling(txId);
        } catch (error) {
          console.warn("[bridge] failed to start status polling", error);
        }
      }
    } else {
      await updateTxInHistory(txId, { status: "pending", txHash });
      if (txHash) startReceiptPolling(txId, txHash, pending.tx.chainId);
    }
    return { kind: "accepted", txHash };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    if (error instanceof BankrApiError && error.outcomeUncertain) {
      await updateTxInHistory(txId, {
        status: "pending",
        error: errorMessage,
        broadcastUncertain: true,
      });
      return { kind: "ambiguous", error: errorMessage };
    }
    effectGuard.settleEffect();
    resetNonce(pending.tx.from, pending.tx.chainId);
    await handleTransactionFailure(txId, pending, errorMessage);
    return { kind: "failed", error: errorMessage };
  } finally {
    effectGuard.releaseIfSafe();
    activeAbortControllers.delete(txId);
  }
}
