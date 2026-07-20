import type { AssetChangeLeg } from "./queryTypes";
import type {
  AssetChangeRecord,
  AssetTransferRecord,
  CompletedTransaction,
  NftTransferRecord,
} from "./types";

export type StoredTransaction = CompletedTransaction & {
  ownerAddress: string;
  sizeBytes: number;
};

export type StoredTransfer = {
  key: string;
  txId: string;
  leg: AssetChangeLeg;
  index: number;
  kind: "erc20" | "nft";
  record: AssetTransferRecord | NftTransferRecord;
  sizeBytes: number;
};

function byteLength(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

function compactNft(record: NftTransferRecord): NftTransferRecord {
  return {
    token: record.token,
    direction: record.direction,
    counterparty: record.counterparty,
    standard: record.standard,
    tokenId: record.tokenId,
    amount: record.amount,
  };
}

function transferRows(
  txId: string,
  leg: AssetChangeLeg,
  record: AssetChangeRecord | undefined,
): StoredTransfer[] {
  if (!record) return [];
  const records: Array<{ kind: "erc20" | "nft"; record: AssetTransferRecord | NftTransferRecord }> = [
    ...record.erc20Transfers.map((transfer) => ({ kind: "erc20" as const, record: transfer })),
    ...(record.nftTransfers ?? []).map((transfer) => ({ kind: "nft" as const, record: compactNft(transfer) })),
  ];
  return records.map((candidate, index) => {
    const row: StoredTransfer = {
      key: `${txId}:${leg}:${index}`,
      txId,
      leg,
      index,
      kind: candidate.kind,
      record: candidate.record,
      sizeBytes: 0,
    };
    row.sizeBytes = byteLength(row);
    return row;
  });
}

function compactAssetHeader(
  record: AssetChangeRecord | undefined,
): AssetChangeRecord | undefined {
  return record
    ? {
        version: 2,
        blockNumber: record.blockNumber,
        nativeDelta: record.nativeDelta,
        erc20Transfers: [],
        nftTransfers: [],
      }
    : undefined;
}

export function compactHistoryTransaction(transaction: CompletedTransaction): {
  transaction: StoredTransaction;
  transfers: StoredTransfer[];
} {
  const cloned = structuredClone(transaction);
  const data = cloned.tx.data;
  if (data && data !== "0x") cloned.calldataSelector = data.slice(0, 10);
  if (!(cloned.status === "processing" && !cloned.txHash)) delete cloned.tx.data;

  const transfers = [
    ...transferRows(cloned.id, "source", cloned.assetChanges),
    ...transferRows(cloned.id, "destination", cloned.destAssetChanges),
  ];
  cloned.assetChanges = compactAssetHeader(cloned.assetChanges);
  cloned.destAssetChanges = compactAssetHeader(cloned.destAssetChanges);
  const stored = {
    ...cloned,
    ownerAddress: cloned.tx.from.toLowerCase(),
    sizeBytes: 0,
  } as StoredTransaction;
  stored.sizeBytes = byteLength(stored);
  return { transaction: stored, transfers };
}
