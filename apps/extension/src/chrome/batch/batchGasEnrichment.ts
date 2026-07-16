import { buildHistoryGasData } from "../history/receiptGasData";
import { fetchSettledReceiptAtRpcUrl } from "../history/receiptSettlement";
import { fetchRpcResult } from "../network/rpcClient";
import { getRpcUrl } from "../transactions/rpcConfig";
import { updateTxInHistory } from "../txHistoryStorage";

export async function fetchAndStoreBatchGasData(
  bundleId: string,
  txHash: string,
  chainId: number,
): Promise<void> {
  const rpcUrl = await getRpcUrl(chainId);
  if (!rpcUrl) return;
  try {
    const rpcCall = (method: string, params: any[]) =>
      fetchRpcResult(rpcUrl, method, params, { allowPrivateWithoutOrigin: true });
    const [txData, receipt] = await Promise.all([
      rpcCall("eth_getTransactionByHash", [txHash]),
      rpcCall("eth_getTransactionReceipt", [txHash]),
    ]);
    if (!receipt) return;
    const settledReceipt = await fetchSettledReceiptAtRpcUrl(
      rpcUrl,
      txHash,
      chainId,
      receipt,
    );
    if (!settledReceipt) return;
    const txRecord = txData as { gas?: string } | null;
    const gasData = buildHistoryGasData(
      settledReceipt,
      chainId,
      txRecord?.gas,
    );
    await updateTxInHistory(bundleId, { gasData });
  } catch {
    // Non-critical enrichment must never change transaction outcome.
  }
}
