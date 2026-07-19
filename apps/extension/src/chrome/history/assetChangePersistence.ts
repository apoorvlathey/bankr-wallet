import { addReceivedToken } from "../portfolio/recentTokens";
import { getRpcUrl } from "../transactions/rpcConfig";
import { extractAssetChangesFromConfirmedReceipt } from "./assetChangeExtraction";
import { updateTxInHistory } from "./repository";
import { fetchReceiptAtRpcUrl } from "./rpc";
import type { AssetChangeRecord } from "./types";

export interface SourceExtractionArgs {
  txId: string;
  chainId: number;
  userAddress: string;
  receipt: any;
  rpcUrl: string;
}

export async function extractAndStoreAssetChanges(
  args: SourceExtractionArgs,
): Promise<void> {
  try {
    const record = await extractAssetChangesFromConfirmedReceipt({
      receipt: args.receipt,
      userAddress: args.userAddress,
      chainId: args.chainId,
      rpcUrl: args.rpcUrl,
      payerForGas: true,
    });
    if (!record) return;
    await seedRecentlyReceivedSafely(args.chainId, record);
    await updateTxInHistory(args.txId, { assetChanges: record });
  } catch (error) {
    console.warn("[assetChanges] source extraction failed", error);
    await updateTxInHistory(args.txId, { detailsIncomplete: true }).catch(() => undefined);
  }
}

export interface DestinationExtractionArgs {
  txId: string;
  destChainId: number;
  destTxHash: string;
  receiverAddress: string;
}

export async function extractAndStoreDestinationAssetChanges(
  args: DestinationExtractionArgs,
): Promise<void> {
  try {
    const rpcUrl = await getRpcUrl(args.destChainId);
    if (!rpcUrl) return;
    const receipt = await fetchReceiptAtRpcUrl(rpcUrl, args.destTxHash);
    if (!receipt) return;
    const record = await extractAssetChangesFromConfirmedReceipt({
      receipt,
      userAddress: args.receiverAddress,
      chainId: args.destChainId,
      rpcUrl,
      payerForGas: false,
    });
    if (!record) return;
    await seedRecentlyReceivedSafely(args.destChainId, record);
    await updateTxInHistory(args.txId, { destAssetChanges: record });
  } catch (error) {
    console.warn("[assetChanges] destination extraction failed", error);
    await updateTxInHistory(args.txId, { detailsIncomplete: true }).catch(() => undefined);
  }
}

export async function seedRecentlyReceivedSafely(
  chainId: number,
  record: AssetChangeRecord,
): Promise<void> {
  try {
    for (const transfer of record.erc20Transfers) {
      if (transfer.direction !== "in") continue;
      await addReceivedToken(chainId, transfer.token, {
        symbol: transfer.symbol,
        decimals: transfer.decimals,
        logoUrl: transfer.logoUrl,
      });
    }
  } catch (error) {
    console.warn("[assetChanges] recent received token seed failed", error);
  }
}
