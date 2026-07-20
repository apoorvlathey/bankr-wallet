import { getStoredResolvedChainById } from "@/lib/chains";
import { assertLocalAccountEffectBinding } from "../../accounts/localEffectBoundary";
import { attachClearSignedMetaToHistory } from "../../clearSignedMetaSnapshot";
import { startReceiptPolling } from "../../forceInclusion/receiptPoller";
import { allowsImpersonatedTransactions } from "../../network/impersonatedRpcPolicy";
import { fetchRpcEnvelope } from "../../network/rpcClient";
import { NETWORKS_INFO_LOCK_KEY } from "../../network/networkRepository";
import { pinnedTxRequest } from "../../requests/pinnedRequest";
import { withStorageLock } from "../../storageLock";
import type { ImpersonatorAccount } from "../../types";
import { addTxToHistory, updateTxInHistory } from "../../txHistoryStorage";
import { reviewedImpersonatedRpcTransaction } from "../impersonatedExecution";
import type {
  SwapExecutionResult,
  SwapGasOverride,
  SwapTxEntry,
} from "./types";

type PreparedImpersonatedSwap = {
  txId: string;
  entry: SwapTxEntry;
  pending: ReturnType<typeof pinnedTxRequest>;
  gasOverride?: SwapGasOverride;
};

/** Send reviewed swap legs through an explicitly opted-in fork RPC. */
export async function executeImpersonatedSwap(
  transactions: SwapTxEntry[],
  chainName: string,
  account: ImpersonatorAccount,
  gasEstimates?: SwapGasOverride[],
): Promise<SwapExecutionResult> {
  const prepared = await prepareImpersonatedSwap(
    transactions,
    chainName,
    account,
    gasEstimates,
  );

  for (let index = 0; index < prepared.length; index += 1) {
    const item = prepared[index];
    const result = await sendImpersonatedSwapLeg(item, account);
    if (!result.success) {
      await failPreparedTail(
        prepared.slice(index + 1),
        result.ambiguous
          ? "Skipped because the previous developer-RPC submission outcome is unknown"
          : "Skipped because an earlier developer-RPC transaction failed",
      );
      return {
        success: index > 0 || result.ambiguous === true,
        txIds: prepared.map(({ txId }) => txId),
        error: result.error,
      };
    }
  }

  return { success: true, txIds: prepared.map(({ txId }) => txId) };
}

async function prepareImpersonatedSwap(
  transactions: SwapTxEntry[],
  chainName: string,
  account: ImpersonatorAccount,
  gasEstimates?: SwapGasOverride[],
): Promise<PreparedImpersonatedSwap[]> {
  const prepared: PreparedImpersonatedSwap[] = [];
  for (let index = 0; index < transactions.length; index += 1) {
    const entry = transactions[index];
    const txId = crypto.randomUUID();
    const pending = pinnedTxRequest(account, {
      id: txId,
      tx: entry.tx,
      origin: entry.origin,
      favicon: entry.favicon,
      chainName,
      timestamp: Date.now(),
      trustedInternal: true,
    });
    const gasOverride = gasEstimates?.[index];
    await addTxToHistory({
      id: txId,
      status: "processing",
      tx: gasOverride
        ? {
            ...entry.tx,
            gas: gasOverride.gasLimit,
            gasPrice: undefined,
            maxFeePerGas: gasOverride.maxFeePerGas,
            maxPriorityFeePerGas: gasOverride.maxPriorityFeePerGas,
          }
        : entry.tx,
      origin: entry.origin,
      favicon: entry.favicon,
      chainName,
      chainId: entry.tx.chainId,
      createdAt: pending.timestamp,
      accountType: "impersonator",
      functionName: entry.functionName,
      swapMeta: entry.swapMeta,
      bridge: entry.bridge,
      accountId: account.id,
    });
    void attachClearSignedMetaToHistory(
      txId,
      { ...entry.tx, to: entry.tx.to ?? undefined },
      entry.tx.chainId,
    );
    prepared.push({ txId, entry, pending, gasOverride });
  }
  return prepared;
}

async function sendImpersonatedSwapLeg(
  item: PreparedImpersonatedSwap,
  account: ImpersonatorAccount,
): Promise<{ success: boolean; error?: string; ambiguous?: boolean }> {
  let submissionStarted = false;
  let definitiveResponse = false;
  try {
    const result = await withStorageLock(
      NETWORKS_INFO_LOCK_KEY,
      async (): Promise<unknown> => {
        const chain = await getStoredResolvedChainById(item.entry.tx.chainId);
        if (!chain?.rpcUrl) {
          throw new Error("No RPC is configured for this chain");
        }
        if (
          !(await allowsImpersonatedTransactions(
            item.entry.tx.chainId,
            chain.rpcUrl,
          ))
        ) {
          throw new Error(
            "Enable developer mode for the selected RPC before sending",
          );
        }
        await assertLocalAccountEffectBinding(account);

        submissionStarted = true;
        const envelope = await fetchRpcEnvelope(
          chain.rpcUrl,
          "eth_sendTransaction",
          [
            reviewedImpersonatedRpcTransaction(
              item.pending,
              item.gasOverride,
            ),
          ],
          {
            allowPrivateWithoutOrigin: true,
            timeoutMs: 30_000,
            maxResponseBytes: 64_000,
          },
        );
        definitiveResponse = true;
        if (envelope.error) {
          const rpcError = envelope.error as { message?: unknown };
          throw new Error(
            typeof rpcError.message === "string" && rpcError.message.trim()
              ? rpcError.message.slice(0, 1_000)
              : "RPC rejected the transaction",
          );
        }
        if (!Object.prototype.hasOwnProperty.call(envelope, "result")) {
          throw new Error("RPC response missing result");
        }
        return envelope.result;
      },
    );

    if (typeof result !== "string" || !/^0x[0-9a-fA-F]{64}$/u.test(result)) {
      throw new Error("RPC returned an invalid transaction hash");
    }
    await updateTxInHistory(item.txId, { status: "pending", txHash: result });
    startReceiptPolling(item.txId, result, item.entry.tx.chainId);
    return { success: true };
  } catch (error) {
    const ambiguous = submissionStarted && !definitiveResponse;
    const message = ambiguous
      ? "Transaction submission outcome is unknown; check activity before retrying."
      : error instanceof Error
        ? error.message
        : "Unknown error";
    await updateTxInHistory(item.txId, {
      status: "failed",
      error: message,
      completedAt: Date.now(),
      ...(ambiguous ? { broadcastUncertain: true } : {}),
    });
    return { success: false, error: message, ambiguous };
  }
}

async function failPreparedTail(
  tail: PreparedImpersonatedSwap[],
  error: string,
): Promise<void> {
  for (const skipped of tail) {
    await updateTxInHistory(skipped.txId, {
      status: "failed",
      error,
      completedAt: Date.now(),
    });
  }
}
