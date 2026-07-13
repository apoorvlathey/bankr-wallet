import { getStoredRpcUrl } from "@/lib/chains";
import type { BundleReceipt } from "../erc5792Types";
import { fetchReceiptAtRpcUrl } from "./rpc";

export async function fetchRawTransactionReceipt(
  txHash: string,
  chainId: number,
): Promise<{ receipt: any; rpcUrl: string } | null> {
  const rpcUrl = await getStoredRpcUrl(chainId);
  if (!rpcUrl) return null;
  const receipt = await fetchReceiptAtRpcUrl(rpcUrl, txHash);
  if (!receipt || typeof receipt !== "object") return null;
  return { receipt, rpcUrl };
}

/** Projects an internal raw receipt onto the released ERC-5792 receipt shape. */
export function toBundleReceipt(receipt: any): BundleReceipt {
  return {
    status: receipt.status,
    blockHash: receipt.blockHash,
    blockNumber: receipt.blockNumber,
    gasUsed: receipt.gasUsed,
    transactionHash: receipt.transactionHash,
    logs: (receipt.logs || []).map((log: any) => ({
      address: log.address,
      topics: log.topics,
      data: log.data,
    })),
  };
}

export async function fetchBundleReceipt(
  txHash: string,
  chainId: number,
): Promise<BundleReceipt | null> {
  const raw = await fetchRawTransactionReceipt(txHash, chainId);
  return raw ? toBundleReceipt(raw.receipt) : null;
}
