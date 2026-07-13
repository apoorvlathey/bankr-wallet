import { OP_STACK_CHAIN_IDS } from "../../constants/networks";
import { fetchRpcResult } from "../rpcHttpClient";
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
    const gasData: import("../txHistoryStorage").GasData = {
      gasUsed: BigInt(receipt.gasUsed).toString(),
      gasLimit: txData?.gas ? BigInt(txData.gas).toString() : BigInt(receipt.gasUsed).toString(),
      effectiveGasPrice: BigInt(receipt.effectiveGasPrice).toString(),
    };
    if (OP_STACK_CHAIN_IDS.has(chainId)) {
      if (receipt.l1Fee) gasData.l1Fee = BigInt(receipt.l1Fee).toString();
      if (receipt.l1GasUsed) gasData.l1GasUsed = BigInt(receipt.l1GasUsed).toString();
      if (receipt.l1GasPrice) gasData.l1GasPrice = BigInt(receipt.l1GasPrice).toString();
    }
    await updateTxInHistory(bundleId, { gasData });
  } catch {
    // Non-critical enrichment must never change transaction outcome.
  }
}
