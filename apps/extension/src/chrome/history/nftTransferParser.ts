import { decodeAbiParameters } from "viem";
import type { NftTransferRecord } from "./types";
import {
  ERC20_TRANSFER_TOPIC,
  ERC1155_TRANSFER_BATCH_TOPIC,
  ERC1155_TRANSFER_SINGLE_TOPIC,
  historyTopicToAddress,
} from "./transferTopics";

export type NftTransferDraft = Pick<
  NftTransferRecord,
  "token" | "direction" | "counterparty" | "standard" | "tokenId" | "amount"
>;

export function decodeAccountNftTransfers(
  receipt: any,
  userAddress: string,
): NftTransferDraft[] {
  const userLower = userAddress.toLowerCase();
  const logs: any[] = Array.isArray(receipt.logs) ? receipt.logs : [];
  const transfers: NftTransferDraft[] = [];
  const append = (
    log: any,
    from: string,
    to: string,
    standard: NftTransferRecord["standard"],
    tokenId: bigint,
    amount: bigint,
  ) => {
    const isOut = from === userLower;
    const isIn = to === userLower;
    const token = String(log.address ?? "").toLowerCase();
    if ((!isOut && !isIn) || amount === 0n || !/^0x[a-fA-F0-9]{40}$/.test(token)) return;
    transfers.push({
      token,
      direction: isOut ? "out" : "in",
      counterparty: isOut ? to : from,
      standard,
      tokenId: tokenId.toString(),
      amount: amount.toString(),
    });
  };

  for (const log of logs) {
    const topics: string[] = Array.isArray(log?.topics) ? log.topics : [];
    const signature = topics[0]?.toLowerCase();
    try {
      if (signature === ERC20_TRANSFER_TOPIC && topics.length === 4) {
        append(log, historyTopicToAddress(topics[1]), historyTopicToAddress(topics[2]), "erc721", BigInt(topics[3]), 1n);
      } else if (signature === ERC1155_TRANSFER_SINGLE_TOPIC && topics.length === 4) {
        const [tokenId, amount] = decodeAbiParameters(
          [{ type: "uint256" }, { type: "uint256" }],
          log.data,
        );
        append(log, historyTopicToAddress(topics[2]), historyTopicToAddress(topics[3]), "erc1155", tokenId, amount);
      } else if (signature === ERC1155_TRANSFER_BATCH_TOPIC && topics.length === 4) {
        const [ids, amounts] = decodeAbiParameters(
          [{ type: "uint256[]" }, { type: "uint256[]" }],
          log.data,
        );
        if (ids.length !== amounts.length) continue;
        for (let index = 0; index < ids.length; index += 1) {
          append(log, historyTopicToAddress(topics[2]), historyTopicToAddress(topics[3]), "erc1155", ids[index], amounts[index]);
        }
      }
    } catch {
      // Ignore malformed logs without hiding other valid transfers.
    }
  }
  return transfers;
}
