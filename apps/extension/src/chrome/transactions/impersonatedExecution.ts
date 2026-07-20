import { getStoredResolvedChainById } from "@/lib/chains";
import { getAccountById } from "../accountStorage";
import { attachClearSignedMetaToHistory } from "../clearSignedMetaSnapshot";
import { startReceiptPolling } from "../forceInclusion/receiptPoller";
import { allowsImpersonatedTransactions } from "../network/impersonatedRpcPolicy";
import { fetchRpcEnvelope } from "../network/rpcClient";
import { NETWORKS_INFO_LOCK_KEY } from "../network/networkRepository";
import {
  getPendingTxRequestById,
  removePendingTxRequest,
  type PendingTxRequest,
} from "../requests/pendingTxStorage";
import { enforcePendingRequestAuthorizationAtConfirmation } from "../requests/pendingRequestLifecycle";
import {
  beginPendingRequestEffectLease,
  guardPendingRequestEffectLease,
  type PendingRequestEffectLease,
} from "../requests/pendingRequestResolution";
import { addTxToHistory, updateTxInHistory } from "../txHistoryStorage";
import { withStorageLock } from "../storageLock";
import type { GasOverrides } from "./localExecution";
import { handleTransactionFailure } from "./failure";
import { processingTxIds, writeResultToStorage } from "./runtime";

type ConfirmationResult = { success: boolean; error?: string };

export function reviewedImpersonatedRpcTransaction(
  pending: PendingTxRequest,
  gasOverrides?: GasOverrides,
): Record<string, string> {
  const tx = pending.tx;
  return {
    from: tx.from,
    ...(tx.to ? { to: tx.to } : {}),
    data: tx.data ?? "0x",
    value: tx.value ?? "0x0",
    ...(gasOverrides
      ? {
          gas: gasOverrides.gasLimit,
          maxFeePerGas: gasOverrides.maxFeePerGas,
          maxPriorityFeePerGas: gasOverrides.maxPriorityFeePerGas,
        }
      : {
          ...(tx.gas ? { gas: tx.gas } : {}),
          ...(tx.gasPrice ? { gasPrice: tx.gasPrice } : {}),
          ...(tx.maxFeePerGas ? { maxFeePerGas: tx.maxFeePerGas } : {}),
          ...(tx.maxPriorityFeePerGas
            ? { maxPriorityFeePerGas: tx.maxPriorityFeePerGas }
            : {}),
        }),
  };
}

async function processImpersonatedTransaction(
  txId: string,
  pending: PendingTxRequest,
  functionName: string | undefined,
  gasOverrides: GasOverrides | undefined,
  effectLease: PendingRequestEffectLease,
): Promise<void> {
  const effectGuard = guardPendingRequestEffectLease(effectLease);
  let txHash: string | undefined;
  let submissionStarted = false;
  let definitiveResponse = false;
  try {
    await addTxToHistory({
      id: txId,
      status: "processing",
      tx: gasOverrides
        ? {
            ...pending.tx,
            gas: gasOverrides.gasLimit,
            gasPrice: undefined,
            maxFeePerGas: gasOverrides.maxFeePerGas,
            maxPriorityFeePerGas: gasOverrides.maxPriorityFeePerGas,
          }
        : pending.tx,
      origin: pending.origin,
      favicon: pending.favicon,
      chainName: pending.chainName,
      chainId: pending.tx.chainId,
      createdAt: pending.timestamp,
      accountType: "impersonator",
      functionName,
      accountId: pending.accountId,
    });
    void attachClearSignedMetaToHistory(
      txId,
      { ...pending.tx, to: pending.tx.to ?? undefined },
      pending.tx.chainId,
    );

    const result = await withStorageLock(
      NETWORKS_INFO_LOCK_KEY,
      async (): Promise<unknown> => {
        const chain = await getStoredResolvedChainById(pending.tx.chainId);
        if (!chain?.rpcUrl) {
          throw new Error("No RPC is configured for this chain");
        }
        if (
          !(await allowsImpersonatedTransactions(
            pending.tx.chainId,
            chain.rpcUrl,
          ))
        ) {
          throw new Error(
            "The selected RPC no longer allows impersonated transactions",
          );
        }
        const account = pending.accountId
          ? await getAccountById(pending.accountId)
          : null;
        if (
          !account ||
          account.type !== "impersonator" ||
          account.address.toLowerCase() !== pending.tx.from.toLowerCase()
        ) {
          throw new Error("Pending request account is no longer available");
        }
        const authorization =
          await enforcePendingRequestAuthorizationAtConfirmation(
            "transaction",
            pending,
          );
        if (!authorization.authorized) throw new Error(authorization.error);

        effectGuard.beginEffect();
        submissionStarted = true;
        const envelope = await fetchRpcEnvelope(
          chain.rpcUrl,
          "eth_sendTransaction",
          [reviewedImpersonatedRpcTransaction(pending, gasOverrides)],
          {
            allowPrivateWithoutOrigin: true,
            timeoutMs: 30_000,
            maxResponseBytes: 64_000,
          },
        );
        definitiveResponse = true;
        effectGuard.settleEffect();
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
    txHash = result;
    await updateTxInHistory(txId, { status: "pending", txHash });
    startReceiptPolling(txId, txHash, pending.tx.chainId);
    await writeResultToStorage(`txResult:${txId}`, { success: true, txHash });
  } catch (error) {
    if (txHash) {
      await writeResultToStorage(`txResult:${txId}`, { success: true, txHash });
    } else {
      const message = submissionStarted && !definitiveResponse
        ? "Transaction submission outcome is unknown; check activity before retrying."
        : error instanceof Error
          ? error.message
          : "Unknown error";
      await handleTransactionFailure(txId, pending, message);
    }
  } finally {
    effectGuard.releaseIfSafe();
    processingTxIds.delete(txId);
  }
}

export async function handleConfirmImpersonatedTransaction(
  txId: string,
  functionName?: string,
  gasOverrides?: GasOverrides,
): Promise<ConfirmationResult> {
  if (processingTxIds.has(txId)) {
    return { success: false, error: "Transaction already being processed" };
  }
  const pending = await getPendingTxRequestById(txId);
  if (!pending) return { success: false, error: "Transaction request not found" };
  if (pending.accountType !== "impersonator" || !pending.accountId) {
    return { success: false, error: "Transaction is not pinned to a view-only account" };
  }
  if (pending.delegation7702Meta || pending.erc7715PermissionRevokeMeta) {
    return { success: false, error: "This transaction requires a signing account" };
  }
  const account = await getAccountById(pending.accountId);
  if (
    !account ||
    account.type !== "impersonator" ||
    account.address.toLowerCase() !== pending.accountAddress?.toLowerCase() ||
    account.address.toLowerCase() !== pending.tx.from.toLowerCase()
  ) {
    return { success: false, error: "Pending request account is no longer available" };
  }
  const chain = await getStoredResolvedChainById(pending.tx.chainId);
  if (
    !chain?.rpcUrl ||
    !(await allowsImpersonatedTransactions(pending.tx.chainId, chain.rpcUrl))
  ) {
    return {
      success: false,
      error: "Enable impersonated transactions for the selected RPC first",
    };
  }

  processingTxIds.add(txId);
  await removePendingTxRequest(txId);
  const authorization = await enforcePendingRequestAuthorizationAtConfirmation(
    "transaction",
    pending,
  );
  if (!authorization.authorized) {
    processingTxIds.delete(txId);
    return { success: false, error: authorization.error };
  }
  const effectLease = beginPendingRequestEffectLease("transaction", txId);
  if (!effectLease) {
    processingTxIds.delete(txId);
    return { success: false, error: "Wallet reset is in progress" };
  }
  void processImpersonatedTransaction(
    txId,
    pending,
    functionName,
    gasOverrides,
    effectLease,
  );
  return { success: true };
}
