import { resolveTokenMetadata } from "../tokenMetadata";
import {
  decodeAccountErc20Transfers,
  toHistoryBigInt,
} from "./assetTransferParser";
import { fetchBalanceAtBlock, sumSiblingSenderTxCosts } from "./rpc";
import type { AssetChangeRecord, AssetTransferRecord } from "./types";

export interface AssetChangeExtractionInput {
  receipt: any;
  userAddress: string;
  chainId: number;
  rpcUrl: string;
  /** False for bridge receivers, which did not pay the destination gas. */
  payerForGas: boolean;
}

export async function extractAssetChangesFromConfirmedReceipt({
  receipt,
  userAddress,
  chainId,
  rpcUrl,
  payerForGas,
}: AssetChangeExtractionInput): Promise<AssetChangeRecord | null> {
  const blockNumberValue = toHistoryBigInt(receipt.blockNumber);
  if (blockNumberValue === 0n) return null;
  const blockNumber = blockNumberValue.toString();

  const drafts = decodeAccountErc20Transfers(receipt, userAddress);
  const uniqueTokens = Array.from(new Set(drafts.map((transfer) => transfer.token)));
  const metadataByToken = new Map<
    string,
    { name?: string; symbol?: string; decimals?: number; logoUrl?: string }
  >();
  await Promise.all(
    uniqueTokens.map(async (address) => {
      metadataByToken.set(
        address,
        await resolveTokenMetadata(chainId, address).catch(() => ({})),
      );
    }),
  );

  const erc20Transfers: AssetTransferRecord[] = drafts.map((draft) => {
    const metadata = metadataByToken.get(draft.token);
    return {
      ...draft,
      symbol: metadata?.symbol,
      decimals: metadata?.decimals,
      logoUrl: metadata?.logoUrl,
    };
  });

  const currentBlockHex = `0x${blockNumberValue.toString(16)}`;
  const previousBlockHex = `0x${(blockNumberValue - 1n).toString(16)}`;
  const [currentBalance, previousBalance] = await Promise.all([
    fetchBalanceAtBlock(rpcUrl, userAddress, currentBlockHex),
    fetchBalanceAtBlock(rpcUrl, userAddress, previousBlockHex),
  ]);

  let nativeDelta: string | undefined;
  if (currentBalance !== null && previousBalance !== null) {
    let pureFlow = currentBalance - previousBalance;
    if (payerForGas) {
      try {
        const gasUsed = toHistoryBigInt(receipt.gasUsed);
        const effectiveGasPrice = toHistoryBigInt(receipt.effectiveGasPrice);
        const l1Fee = receipt.l1Fee ? toHistoryBigInt(receipt.l1Fee) : 0n;
        pureFlow += gasUsed * effectiveGasPrice + l1Fee;
      } catch {
        // Preserve the observable balance delta when gas fields are malformed.
      }
      const txHash: string | undefined = receipt.transactionHash;
      if (txHash) {
        pureFlow += await sumSiblingSenderTxCosts(
          rpcUrl,
          currentBlockHex,
          userAddress,
          txHash,
        );
      }
    }
    if (pureFlow !== 0n) nativeDelta = pureFlow.toString();
  }

  if (erc20Transfers.length === 0 && nativeDelta === undefined) return null;
  return { blockNumber, nativeDelta, erc20Transfers };
}
