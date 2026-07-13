import { assertLocalAccountEffectBinding } from "../../accounts/localEffectBoundary";
import {
  isBroadcastOutcomeUncertain,
  signAndBroadcastTransaction,
} from "../../localSigner";
import { resetNonce } from "../../forceInclusion/nonceManager";
import { applyReceiptToHistory, startReceiptPolling } from "../../forceInclusion/receiptPoller";
import type { PinnedTxRequest } from "../../requests/pendingTxStorage";
import type { Account } from "../../types";
import { updateTxInHistory } from "../../txHistoryStorage";
import { handleTransactionFailure } from "../failure";
import type { GasOverrides } from "../localExecution";
import { activeAbortControllers } from "../runtime";

/** Broadcast one pre-nonced local swap leg and preserve ambiguous hashes. */
export async function broadcastSwapTxLocal(
  txId: string,
  pending: PinnedTxRequest,
  account: Account,
  privateKey: `0x${string}`,
  nonce: number,
  rpcUrl?: string,
  customChainMeta?: {
    name: string;
    nativeCurrency?: { name: string; symbol: string; decimals: number };
    explorer?: string;
  },
  gasOverrides?: GasOverrides,
): Promise<{
  success: boolean;
  txHash?: string;
  error?: string;
  broadcastUncertain?: boolean;
}> {
  const abortController = new AbortController();
  activeAbortControllers.set(txId, abortController);

  try {
    const txForSigning = gasOverrides
      ? {
          ...pending.tx,
          data: pending.tx.data ?? "0x",
          value: pending.tx.value ?? "0x0",
          nonce,
          gas: gasOverrides.gasLimit,
          maxFeePerGas: gasOverrides.maxFeePerGas,
          maxPriorityFeePerGas: gasOverrides.maxPriorityFeePerGas,
          gasPrice: undefined,
        }
      : {
          ...pending.tx,
          data: pending.tx.data ?? "0x",
          value: pending.tx.value ?? "0x0",
          nonce,
        };

    const result = await signAndBroadcastTransaction(
      privateKey,
      txForSigning,
      rpcUrl,
      customChainMeta,
      () => assertLocalAccountEffectBinding(account),
    );
    const txHash = result.txHash;

    if (txHash) {
      if (result.receipt) {
        await applyReceiptToHistory(
          txId,
          txHash,
          pending.tx.chainId,
          result.receipt,
          { rpcUrl, signedGasLimit: result.signedGasLimit },
        );
      } else {
        await updateTxInHistory(txId, {
          status: "pending",
          txHash,
          broadcastUncertain: result.broadcastUncertain === true,
        });
        startReceiptPolling(txId, txHash, pending.tx.chainId);
      }
    } else {
      await updateTxInHistory(txId, {
        status: "pending",
        txHash,
        broadcastUncertain: result.broadcastUncertain === true,
      });
    }
    return {
      success: true,
      txHash,
      broadcastUncertain: isBroadcastOutcomeUncertain(result),
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    resetNonce(pending.tx.from, pending.tx.chainId);
    await handleTransactionFailure(txId, pending, errorMessage);
    return { success: false, error: errorMessage };
  } finally {
    activeAbortControllers.delete(txId);
  }
}
