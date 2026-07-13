import type {
  AssetChangeRecord,
  AssetTransferRecord,
} from "@/chrome/txHistoryStorage";

export type TokenDisplayMetadata = Pick<
  AssetTransferRecord,
  "symbol" | "decimals" | "logoUrl"
>;

export function tokenDisplayMetadataKey(
  chainId: number,
  token: string,
): string {
  return `${chainId}-${token.toLowerCase()}`;
}

export function collectMissingTokenMetadataRequests(
  record: AssetChangeRecord | undefined,
  chainId: number,
  requests: Map<string, { chainId: number; tokenAddress: string }>,
) {
  if (!record) return;
  for (const transfer of record.erc20Transfers) {
    if (
      transfer.logoUrl &&
      transfer.symbol &&
      transfer.decimals !== undefined
    ) {
      continue;
    }
    if (!/^0x[a-fA-F0-9]{40}$/.test(transfer.token)) continue;
    const tokenAddress = transfer.token.toLowerCase();
    requests.set(tokenDisplayMetadataKey(chainId, tokenAddress), {
      chainId,
      tokenAddress,
    });
  }
}

export function applyTokenDisplayMetadata(
  record: AssetChangeRecord | undefined,
  chainId: number,
  metadataByKey: Record<string, TokenDisplayMetadata>,
): AssetChangeRecord | undefined {
  if (!record) return undefined;
  let changed = false;
  const erc20Transfers = record.erc20Transfers.map((transfer) => {
    const metadata =
      metadataByKey[tokenDisplayMetadataKey(chainId, transfer.token)];
    if (!metadata) return transfer;

    const next = {
      ...transfer,
      symbol: transfer.symbol || metadata.symbol,
      decimals:
        transfer.decimals !== undefined
          ? transfer.decimals
          : metadata.decimals,
      logoUrl: transfer.logoUrl || metadata.logoUrl,
    };
    if (
      next.symbol !== transfer.symbol ||
      next.decimals !== transfer.decimals ||
      next.logoUrl !== transfer.logoUrl
    ) {
      changed = true;
    }
    return next;
  });

  return changed ? { ...record, erc20Transfers } : record;
}
