import { OP_STACK_CHAIN_IDS } from "../../constants/networks";
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
    const txRecord = txData as { gas?: string } | null;
    const receiptRecord = receipt as {
      gasUsed: string;
      effectiveGasPrice: string;
      l1Fee?: string;
      l1GasUsed?: string;
      l1GasPrice?: string;
    };
    const gasData: import("../txHistoryStorage").GasData = {
      gasUsed: BigInt(receiptRecord.gasUsed).toString(),
      gasLimit: txRecord?.gas
        ? BigInt(txRecord.gas).toString()
        : BigInt(receiptRecord.gasUsed).toString(),
      effectiveGasPrice: BigInt(receiptRecord.effectiveGasPrice).toString(),
    };
    if (OP_STACK_CHAIN_IDS.has(chainId)) {
      if (receiptRecord.l1Fee)
        gasData.l1Fee = BigInt(receiptRecord.l1Fee).toString();
      if (receiptRecord.l1GasUsed)
        gasData.l1GasUsed = BigInt(receiptRecord.l1GasUsed).toString();
      if (receiptRecord.l1GasPrice)
        gasData.l1GasPrice = BigInt(receiptRecord.l1GasPrice).toString();
    }
    await updateTxInHistory(bundleId, { gasData });
  } catch {
    // Non-critical enrichment must never change transaction outcome.
  }
}
