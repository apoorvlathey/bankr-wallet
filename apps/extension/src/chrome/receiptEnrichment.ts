import { getStoredRpcUrl } from "@/lib/chains";
import type { BundleReceipt } from "./erc5792Types";
import { getTxById } from "./txHistoryStorage";

const RECEIPT_RETRY_ATTEMPTS = 8;
const RECEIPT_RETRY_DELAY_MS = 2_000;

export async function fetchRawTransactionReceipt(
  txHash: string,
  chainId: number,
): Promise<{ receipt: any; rpcUrl: string } | null> {
  const rpcUrl = await getStoredRpcUrl(chainId);
  if (!rpcUrl) return null;

  try {
    const response = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_getTransactionReceipt",
        params: [txHash],
      }),
    });
    if (!response.ok) return null;
    const data = await response.json();
    const receipt = data.result;
    if (!receipt) return null;
    return { receipt, rpcUrl };
  } catch {
    return null;
  }
}

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

export async function extractAssetChangesFromReceipt(args: {
  txId: string;
  chainId: number;
  userAddress: string;
  receipt: any;
  rpcUrl: string;
}): Promise<void> {
  const { extractAndStoreAssetChanges } = await import(
    "./assetChangesExtractor"
  );
  await extractAndStoreAssetChanges(args);
}

export function extractAssetChangesWhenReceiptAvailable(args: {
  txId: string;
  txHash: string;
  chainId: number;
  userAddress: string;
  receipt?: any;
  rpcUrl?: string;
  logPrefix?: string;
}): void {
  void (async () => {
    const logPrefix = args.logPrefix ?? "[receipt]";
    try {
      if (args.receipt && args.rpcUrl) {
        await extractAssetChangesFromReceipt({
          txId: args.txId,
          chainId: args.chainId,
          userAddress: args.userAddress,
          receipt: args.receipt,
          rpcUrl: args.rpcUrl,
        });
        return;
      }

      for (let attempt = 0; attempt < RECEIPT_RETRY_ATTEMPTS; attempt++) {
        const raw = await fetchRawTransactionReceipt(args.txHash, args.chainId);
        if (raw) {
          await extractAssetChangesFromReceipt({
            txId: args.txId,
            chainId: args.chainId,
            userAddress: args.userAddress,
            receipt: raw.receipt,
            rpcUrl: raw.rpcUrl,
          });
          return;
        }
        if (attempt < RECEIPT_RETRY_ATTEMPTS - 1) {
          await sleep(RECEIPT_RETRY_DELAY_MS);
        }
      }
    } catch (err) {
      console.warn(`${logPrefix} asset-changes extraction failed`, err);
    }
  })();
}

export async function queueAssetChangesBackfill(
  txId: string,
): Promise<{ success: boolean; queued?: boolean; error?: string }> {
  const tx = await getTxById(txId);
  if (!tx) {
    return { success: false, error: "Transaction not found" };
  }
  if (tx.assetChanges) {
    return { success: true, queued: false };
  }
  if (tx.status !== "success" || !tx.txHash || !tx.tx.from) {
    return { success: false, error: "Transaction is not backfillable" };
  }

  extractAssetChangesWhenReceiptAvailable({
    txId,
    txHash: tx.txHash,
    chainId: tx.chainId,
    userAddress: tx.tx.from,
    logPrefix: "[asset-backfill]",
  });

  return { success: true, queued: true };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
