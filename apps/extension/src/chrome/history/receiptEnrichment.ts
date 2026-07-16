import { fetchRawTransactionReceipt } from "./receiptTransport";
import { fetchSettledReceiptAtRpcUrl } from "./receiptSettlement";
export {
  queueReceiptDerivedHistoryReconciliation as queueAssetChangesBackfill,
} from "./receiptReconciliation";

const RECEIPT_RETRY_ATTEMPTS = 8;
const RECEIPT_RETRY_DELAY_MS = 2_000;

export async function extractAssetChangesFromReceipt(args: {
  txId: string;
  chainId: number;
  userAddress: string;
  receipt: any;
  rpcUrl: string;
}): Promise<void> {
  const { extractAndStoreAssetChanges } = await import(
    "./assetChangePersistence"
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
      if (args.rpcUrl) {
        const receipt = await fetchSettledReceiptAtRpcUrl(
          args.rpcUrl,
          args.txHash,
          args.chainId,
          args.receipt,
        );
        if (!receipt) return;
        await extractAssetChangesFromReceipt({
          txId: args.txId,
          chainId: args.chainId,
          userAddress: args.userAddress,
          receipt,
          rpcUrl: args.rpcUrl,
        });
        return;
      }

      for (let attempt = 0; attempt < RECEIPT_RETRY_ATTEMPTS; attempt++) {
        const raw = await fetchRawTransactionReceipt(args.txHash, args.chainId);
        if (raw) {
          const receipt = await fetchSettledReceiptAtRpcUrl(
            raw.rpcUrl,
            args.txHash,
            args.chainId,
            raw.receipt,
          );
          if (!receipt) continue;
          await extractAssetChangesFromReceipt({
            txId: args.txId,
            chainId: args.chainId,
            userAddress: args.userAddress,
            receipt,
            rpcUrl: raw.rpcUrl,
          });
          return;
        }
        if (attempt < RECEIPT_RETRY_ATTEMPTS - 1) {
          await sleep(RECEIPT_RETRY_DELAY_MS);
        }
      }
    } catch (error) {
      console.warn(`${logPrefix} asset-changes extraction failed`, error);
    }
  })();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
