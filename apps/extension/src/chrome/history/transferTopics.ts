import { keccak256, toBytes } from "viem";

export const ERC20_TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
export const ERC1155_TRANSFER_SINGLE_TOPIC = keccak256(
  toBytes("TransferSingle(address,address,address,uint256,uint256)"),
);
export const ERC1155_TRANSFER_BATCH_TOPIC = keccak256(
  toBytes("TransferBatch(address,address,address,uint256[],uint256[])")
);

export function historyTopicToAddress(topic: string): string {
  return (`0x${topic.slice(-40)}`).toLowerCase();
}
