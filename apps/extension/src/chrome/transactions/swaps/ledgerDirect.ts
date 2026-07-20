import { getAccountById } from "../../accountStorage";
import { attachClearSignedMetaToHistory } from "../../clearSignedMetaSnapshot";
import { getNextNonce, resetNonce } from "../../forceInclusion/nonceManager";
import { applyReceiptToHistory, startReceiptPolling } from "../../forceInclusion/receiptPoller";
import { ensureLedgerSigningSession } from "../../ledger/session";
import { signAndBroadcastLedgerTransaction } from "../../ledger/signing";
import { pinnedTxRequest } from "../../requests/pinnedRequest";
import type { LedgerAccount } from "../../types";
import { addTxToHistory, updateTxInHistory } from "../../txHistoryStorage";
import { getStoredResolvedChainById } from "@/lib/chains";
import type {
  SwapExecutionResult,
  SwapGasOverride,
  SwapTxEntry,
} from "./types";

/** Execute reviewed, ordered calls with one Ledger device approval per leg. */
export async function executeLedgerSwap(
  transactions: SwapTxEntry[],
  chainName: string,
  account: LedgerAccount,
  gasEstimates?: SwapGasOverride[],
): Promise<SwapExecutionResult> {
  await ensureLedgerSigningSession("");
  const txIds: string[] = [];

  for (let index = 0; index < transactions.length; index += 1) {
    const entry = transactions[index];
    const txId = crypto.randomUUID();
    txIds.push(txId);
    const pending = pinnedTxRequest(account, {
      id: txId,
      tx: entry.tx,
      origin: entry.origin,
      favicon: entry.favicon,
      chainName,
      timestamp: Date.now(),
      trustedInternal: true,
    });
    const nonce = await getNextNonce(account.address, entry.tx.chainId);
    const gasOverride = gasEstimates?.[index];
    let committed = false;

    try {
      const result = await signAndBroadcastLedgerTransaction({
        opId: txId,
        account,
        tx: { ...entry.tx, nonce },
        gasOverrides: gasOverride,
        beforeBroadcast: async () => {
          const latest = await getAccountById(account.id);
          if (
            !latest ||
            latest.type !== "ledger" ||
            latest.address.toLowerCase() !== account.address.toLowerCase() ||
            latest.deviceId !== account.deviceId ||
            latest.hdPath !== account.hdPath
          ) {
            throw new Error("Prepared transaction account is no longer available");
          }

          const txForHistory = gasOverride
            ? {
                ...entry.tx,
                nonce,
                gas: gasOverride.gasLimit,
                gasPrice: undefined,
                maxFeePerGas: gasOverride.maxFeePerGas,
                maxPriorityFeePerGas: gasOverride.maxPriorityFeePerGas,
              }
            : { ...entry.tx, nonce };
          await addTxToHistory({
            id: txId,
            status: "processing",
            tx: txForHistory,
            origin: entry.origin,
            favicon: entry.favicon,
            chainName,
            chainId: entry.tx.chainId,
            createdAt: pending.timestamp,
            accountType: "ledger",
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
          committed = true;
        },
      });

      const resolved = await getStoredResolvedChainById(entry.tx.chainId);
      if (result.txHash && result.receipt) {
        await applyReceiptToHistory(
          txId,
          result.txHash,
          entry.tx.chainId,
          result.receipt,
          { rpcUrl: resolved?.rpcUrl, signedGasLimit: result.signedGasLimit },
        );
      } else {
        await updateTxInHistory(txId, {
          status: "pending",
          txHash: result.txHash,
          broadcastUncertain: result.broadcastUncertain === true,
        });
        if (result.txHash) startReceiptPolling(txId, result.txHash, entry.tx.chainId);
      }

      if (result.broadcastUncertain) {
        return { success: true, txIds };
      }
    } catch (error) {
      resetNonce(account.address, entry.tx.chainId);
      const message = error instanceof Error ? error.message : "Ledger transaction failed";
      if (committed) {
        await updateTxInHistory(txId, {
          status: "failed",
          error: message,
          completedAt: Date.now(),
        });
      }
      return {
        success: index > 0,
        txIds,
        error: `Transaction ${index + 1}/${transactions.length} failed: ${message}`,
      };
    }
  }

  return { success: true, txIds };
}
