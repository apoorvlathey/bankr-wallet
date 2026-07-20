import { getRpcUrl } from "../transactions/rpcConfig";
import { fetchTxAtRpcUrl } from "./rpc";
import { getTxById } from "./repository";
import {
  cacheHistoryNftMetadata,
  getCachedHistoryNftMetadata,
  type HistoryNftDisplayMetadata,
} from "./nftMetadataCache";
import { resolveConfirmedNftTransferMetadata } from "./nftTransferMetadata";
import type { AssetChangeLeg } from "./queryTypes";

export async function getTransactionCalldata(txId: string): Promise<{
  success: boolean;
  data?: string;
  error?: string;
}> {
  const transaction = await getTxById(txId);
  if (!transaction) return { success: false, error: "Transaction not found" };
  if (transaction.tx.data) return { success: true, data: transaction.tx.data };
  if (!transaction.txHash) {
    return { success: false, error: "Calldata is unavailable for this transaction" };
  }
  const rpcUrl = await getRpcUrl(transaction.chainId);
  if (!rpcUrl) return { success: false, error: "No RPC is configured for this network" };
  const remote = await fetchTxAtRpcUrl(rpcUrl, transaction.txHash);
  if (!remote) return { success: false, error: "Transaction is not available from the RPC yet" };
  if (
    String(remote.hash || "").toLowerCase() !== transaction.txHash.toLowerCase() ||
    String(remote.from || "").toLowerCase() !== transaction.tx.from.toLowerCase()
  ) {
    return { success: false, error: "RPC transaction did not match stored activity" };
  }
  const storedTo = transaction.tx.to?.toLowerCase() ?? null;
  const remoteTo = typeof remote.to === "string" ? remote.to.toLowerCase() : null;
  if (storedTo !== remoteTo) {
    return { success: false, error: "RPC transaction target did not match stored activity" };
  }
  return typeof remote.input === "string" || typeof remote.data === "string"
    ? { success: true, data: String(remote.input ?? remote.data) }
    : { success: false, error: "RPC returned no transaction calldata" };
}

export async function resolveHistoryNftMetadata(options: {
  txId: string;
  leg: AssetChangeLeg;
  nftIndex: number;
}): Promise<{ success: boolean; data?: HistoryNftDisplayMetadata; error?: string }> {
  const transaction = await getTxById(options.txId);
  if (!transaction) return { success: false, error: "Transaction not found" };
  const record = options.leg === "source"
    ? transaction.assetChanges
    : transaction.destAssetChanges;
  const transfer = record?.nftTransfers?.[options.nftIndex];
  if (!record || !transfer) return { success: false, error: "NFT transfer not found" };
  const chainId = options.leg === "source"
    ? transaction.chainId
    : transaction.bridge?.destinationChainId;
  if (!chainId) return { success: false, error: "NFT network is unavailable" };
  const cacheKey = `${chainId}:${transfer.token}:${transfer.tokenId}:${record.blockNumber}`;
  const cached = await getCachedHistoryNftMetadata(cacheKey);
  if (cached) return { success: true, data: cached };
  const rpcUrl = await getRpcUrl(chainId);
  if (!rpcUrl) return { success: false, error: "No RPC is configured for this network" };
  const metadata = await resolveConfirmedNftTransferMetadata(
    transfer,
    rpcUrl,
    record.blockNumber,
  );
  await cacheHistoryNftMetadata(cacheKey, metadata);
  return { success: true, data: metadata };
}
