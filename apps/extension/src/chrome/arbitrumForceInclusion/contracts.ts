import { decodeEventLog, encodeFunctionData, type TransactionReceipt } from "viem";

export const ARBITRUM_INBOX_ABI = [
  {
    type: "function",
    name: "sendL2Message",
    inputs: [{ name: "messageData", type: "bytes" }],
    outputs: [{ name: "messageNum", type: "uint256" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "maxDataSize",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
] as const;

export const ARBITRUM_SEQUENCER_INBOX_ABI = [
  {
    type: "function",
    name: "totalDelayedMessagesRead",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "forceInclusionDeadline",
    inputs: [{ name: "messageBlockNumber", type: "uint64" }],
    outputs: [{ name: "blockNumberDeadline", type: "uint64" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "forceInclusion",
    inputs: [
      { name: "totalDelayedMessagesRead", type: "uint256" },
      { name: "kind", type: "uint8" },
      { name: "l1BlockAndTime", type: "uint64[2]" },
      { name: "baseFeeL1", type: "uint256" },
      { name: "sender", type: "address" },
      { name: "messageDataHash", type: "bytes32" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
] as const;

export const BRIDGE_MESSAGE_DELIVERED_ABI = [
  {
    type: "event",
    name: "MessageDelivered",
    inputs: [
      { name: "messageIndex", type: "uint256", indexed: true },
      { name: "beforeInboxAcc", type: "bytes32", indexed: true },
      { name: "inbox", type: "address", indexed: false },
      { name: "kind", type: "uint8", indexed: false },
      { name: "sender", type: "address", indexed: false },
      { name: "messageDataHash", type: "bytes32", indexed: false },
      { name: "baseFeeL1", type: "uint256", indexed: false },
      { name: "timestamp", type: "uint64", indexed: false },
    ],
  },
] as const;

const INBOX_MESSAGE_DELIVERED_ABI = [
  {
    type: "event",
    name: "InboxMessageDelivered",
    inputs: [
      { name: "messageNum", type: "uint256", indexed: true },
      { name: "data", type: "bytes", indexed: false },
    ],
  },
] as const;

export function encodeDelayedMessage(messageData: `0x${string}`): `0x${string}` {
  return encodeFunctionData({
    abi: ARBITRUM_INBOX_ABI,
    functionName: "sendL2Message",
    args: [messageData],
  });
}

export function decodeDeliveredMessage(
  receipt: TransactionReceipt,
  bridge: `0x${string}`,
  inbox: `0x${string}`,
) {
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== bridge.toLowerCase()) continue;
    try {
      const decoded = decodeEventLog({
        abi: BRIDGE_MESSAGE_DELIVERED_ABI,
        data: log.data,
        topics: log.topics,
      });
      if (
        decoded.eventName === "MessageDelivered" &&
        decoded.args.inbox.toLowerCase() === inbox.toLowerCase()
      ) {
        return decoded.args;
      }
    } catch {
      // Ignore unrelated Bridge events.
    }
  }
  throw new Error("Arbitrum delayed-message event was not found in the L1 receipt");
}

export function decodeInboxMessage(
  receipt: TransactionReceipt,
  inbox: `0x${string}`,
) {
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== inbox.toLowerCase()) continue;
    try {
      const decoded = decodeEventLog({
        abi: INBOX_MESSAGE_DELIVERED_ABI,
        data: log.data,
        topics: log.topics,
      });
      if (decoded.eventName === "InboxMessageDelivered") return decoded.args;
    } catch {
      // Ignore unrelated Inbox events.
    }
  }
  throw new Error("Arbitrum inbox message data was not found in the L1 receipt");
}
