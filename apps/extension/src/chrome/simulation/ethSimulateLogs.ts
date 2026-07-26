import type { Address } from "viem";
import { MAX_SIMULATION_ASSET_CHANGES } from "./constants";

const TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const TRANSFER_SINGLE_TOPIC =
  "0xc3d58168c5ae7397731d063d5bbf3d657854427343f4c083240f7aacaa2d0f62";
const TRANSFER_BATCH_TOPIC =
  "0x4a39dc06d4c0dbc64b70af90fd698a233a518aa5d07e595d983b8c0526c8f7fb";
const NATIVE_TRANSFER_SENTINEL =
  "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";

export interface EthSimulateLog {
  address?: string;
  topics?: string[];
  data?: string;
}

export interface EthSimulateCallResult {
  status?: string;
  returnData?: string;
  logs?: EthSimulateLog[];
}

export interface ParsedEthSimulateLogs {
  allSuccess: boolean;
  nativeDelta: bigint;
  tokens: Address[];
  deltas: bigint[];
}

/** Safely decode untrusted RPC hex, treating missing or malformed values as 0. */
export function safeHexToBigInt(hex: string | undefined | null): bigint {
  if (!hex || hex === "0x" || hex === "0X") return 0n;
  try {
    return BigInt(hex);
  } catch {
    return 0n;
  }
}

function topicAddress(topic: string | undefined): string {
  return `0x${(topic || "").slice(26).toLowerCase()}`;
}

/**
 * Classify eth_simulateV1 transfer logs into net ERC-20 and native deltas.
 * NFT-shaped contracts are deliberately excluded because the bytecode
 * simulator owns token-id and URI capture.
 */
export function parseEthSimulateV1CallResults(
  callResults: EthSimulateCallResult[],
  fromAddress: string,
): ParsedEthSimulateLogs {
  const from = fromAddress.toLowerCase();
  const tokenDeltas = new Map<string, bigint>();
  const nftAddresses = new Set<string>();
  let nativeDelta = 0n;

  for (const callResult of callResults) {
    for (const log of callResult.logs || []) {
      const topics = log.topics || [];
      const address = (log.address || "").toLowerCase();
      if (topics.length === 0) continue;

      if (topics[0] === TRANSFER_TOPIC) {
        if (topics.length >= 4) {
          if (nftAddresses.size < MAX_SIMULATION_ASSET_CHANGES) {
            nftAddresses.add(address);
          }
          continue;
        }
        if (topics.length < 3) continue;

        const logFrom = topicAddress(topics[1]);
        const logTo = topicAddress(topics[2]);
        const amount = safeHexToBigInt(log.data);
        if (address === NATIVE_TRANSFER_SENTINEL) {
          if (logFrom === from) nativeDelta -= amount;
          if (logTo === from) nativeDelta += amount;
          continue;
        }

        if (logFrom === from) {
          if (
            tokenDeltas.has(address) ||
            tokenDeltas.size < MAX_SIMULATION_ASSET_CHANGES
          ) {
            tokenDeltas.set(address, (tokenDeltas.get(address) ?? 0n) - amount);
          }
        }
        if (logTo === from) {
          if (
            tokenDeltas.has(address) ||
            tokenDeltas.size < MAX_SIMULATION_ASSET_CHANGES
          ) {
            tokenDeltas.set(address, (tokenDeltas.get(address) ?? 0n) + amount);
          }
        }
        continue;
      }

      if (
        (topics[0] === TRANSFER_SINGLE_TOPIC ||
          topics[0] === TRANSFER_BATCH_TOPIC) &&
        topics.length >= 4
      ) {
        if (nftAddresses.size < MAX_SIMULATION_ASSET_CHANGES) {
          nftAddresses.add(address);
        }
      }
    }
  }

  tokenDeltas.delete(NATIVE_TRANSFER_SENTINEL);
  for (const address of nftAddresses) tokenDeltas.delete(address);

  const tokens: Address[] = [];
  const deltas: bigint[] = [];
  for (const [address, delta] of tokenDeltas) {
    if (delta === 0n) continue;
    tokens.push(address as Address);
    deltas.push(delta);
  }

  return {
    allSuccess: callResults.every((result) => result.status === "0x1"),
    nativeDelta,
    tokens,
    deltas,
  };
}
