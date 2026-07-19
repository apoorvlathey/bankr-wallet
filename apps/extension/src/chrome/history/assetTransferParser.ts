import type { AssetTransferRecord } from "./types";
import { ERC20_TRANSFER_TOPIC, historyTopicToAddress } from "./transferTopics";

export {
  decodeAccountNftTransfers,
  type NftTransferDraft,
} from "./nftTransferParser";
export {
  ERC20_TRANSFER_TOPIC,
  ERC1155_TRANSFER_BATCH_TOPIC,
  ERC1155_TRANSFER_SINGLE_TOPIC,
} from "./transferTopics";

export type AssetTransferDraft = Pick<
  AssetTransferRecord,
  "token" | "direction" | "counterparty" | "amountWei"
>;

export function toHistoryBigInt(value: unknown): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "number") return BigInt(value);
  if (typeof value === "string") return BigInt(value);
  return 0n;
}

/** ERC-721 reuses this topic with four topics and is excluded here. */
export function decodeAccountErc20Transfers(
  receipt: any,
  userAddress: string,
): AssetTransferDraft[] {
  const userLower = userAddress.toLowerCase();
  const logs: any[] = Array.isArray(receipt.logs) ? receipt.logs : [];
  const transfers: AssetTransferDraft[] = [];
  for (const log of logs) {
    const topics: string[] = log?.topics ?? [];
    if (topics.length !== 3 || topics[0]?.toLowerCase() !== ERC20_TRANSFER_TOPIC) continue;
    const from = historyTopicToAddress(topics[1]);
    const to = historyTopicToAddress(topics[2]);
    const isOut = from === userLower;
    const isIn = to === userLower;
    if (!isOut && !isIn) continue;
    try {
      const amount = BigInt(log.data ?? "0x0");
      const token = String(log.address ?? "").toLowerCase();
      if (amount === 0n || !/^0x[a-fA-F0-9]{40}$/.test(token)) continue;
      transfers.push({
        token,
        direction: isOut ? "out" : "in",
        counterparty: isOut ? to : from,
        amountWei: amount.toString(),
      });
    } catch {
      // Ignore malformed provider logs.
    }
  }
  return transfers;
}
