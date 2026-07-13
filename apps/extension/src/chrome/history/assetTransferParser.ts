import type { AssetTransferRecord } from "./types";

/** keccak256("Transfer(address,address,uint256)"). */
export const ERC20_TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

export type AssetTransferDraft = Pick<
  AssetTransferRecord,
  "token" | "direction" | "counterparty" | "amountWei"
>;

/** Normalizes raw-RPC and viem-formatted numeric fields. */
export function toHistoryBigInt(value: unknown): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "number") return BigInt(value);
  if (typeof value === "string") return BigInt(value);
  return 0n;
}

function topicToAddress(topic: string): string {
  return (`0x${topic.slice(-40)}`).toLowerCase();
}

/**
 * Decodes only fungible Transfer logs involving the observed account.
 * ERC-721 reuses the topic but has four topics and is deliberately excluded.
 */
export function decodeAccountErc20Transfers(
  receipt: any,
  userAddress: string,
): AssetTransferDraft[] {
  const userLower = userAddress.toLowerCase();
  const logs: any[] = Array.isArray(receipt.logs) ? receipt.logs : [];
  const transfers: AssetTransferDraft[] = [];

  for (const log of logs) {
    const topics: string[] = log?.topics ?? [];
    if (topics.length !== 3) continue;
    if (typeof topics[0] !== "string") continue;
    if (topics[0].toLowerCase() !== ERC20_TRANSFER_TOPIC) continue;

    const from = topicToAddress(topics[1]);
    const to = topicToAddress(topics[2]);
    const isOut = from === userLower;
    const isIn = to === userLower;
    if (!isOut && !isIn) continue;

    let amountWei = 0n;
    try {
      amountWei = BigInt(log.data ?? "0x0");
    } catch {
      continue;
    }
    if (amountWei === 0n) continue;

    const token = String(log.address ?? "").toLowerCase();
    if (!/^0x[a-fA-F0-9]{40}$/.test(token)) continue;
    transfers.push({
      token,
      direction: isOut ? "out" : "in",
      counterparty: isOut ? to : from,
      amountWei: amountWei.toString(),
    });
  }

  return transfers;
}
