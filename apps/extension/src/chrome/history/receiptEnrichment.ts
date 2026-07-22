import { fetchRawTransactionReceipt } from "./receiptTransport";
import { fetchSettledReceiptAtRpcUrl } from "./receiptSettlement";
import type { Erc20FeeTransferContext } from "./erc20FeeSettlement";
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
  payerForGas?: boolean;
  feePayment?: Erc20FeeTransferContext;
}): Promise<void> {
  const { extractAndStoreAssetChanges } = await import(
    "./assetChangePersistence"
  );
  await extractAndStoreAssetChanges(args);
}

export async function extractAssetChangesWhenReceiptAvailable(args: {
  txId: string;
  txHash: string;
  chainId: number;
  userAddress: string;
  receipt?: any;
  rpcUrl?: string;
  logPrefix?: string;
  payerForGas?: boolean;
  feePayment?: Erc20FeeTransferContext;
}): Promise<void> {
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
          payerForGas: args.payerForGas,
          feePayment: args.feePayment,
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
            payerForGas: args.payerForGas,
            feePayment: args.feePayment,
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
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
