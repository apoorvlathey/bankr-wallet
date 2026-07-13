import { createPublicClient, type PublicClient } from "viem";
import { mainnet, sepolia } from "viem/chains";
import { secureHttpTransport } from "../network/rpcClient";
import { getRpcUrl } from "../transactions/rpcConfig";
import type { ForceInclusionProgressData } from "./types";

export const L1_RPC_TIMEOUT = 30_000;
export const L1_RECEIPT_TIMEOUT = 10 * 60 * 1000;

export function getL1Chain(l1ChainId: number) {
  return l1ChainId === mainnet.id ? mainnet : sepolia;
}

export async function getL1RpcUrl(l1ChainId: number): Promise<string> {
  const stored = await getRpcUrl(l1ChainId);
  if (stored) return stored;
  if (l1ChainId === sepolia.id) {
    return "https://ethereum-sepolia-rpc.publicnode.com";
  }
  throw new Error(`No L1 RPC URL configured for chain ${l1ChainId}`);
}

export function createL1PublicClient(rpcUrl: string): PublicClient {
  return createPublicClient({
    transport: secureHttpTransport(rpcUrl, {
      timeout: L1_RPC_TIMEOUT,
      retryCount: 1,
    }),
  });
}

export async function writeForceInclusionProgress(
  txId: string,
  data: ForceInclusionProgressData,
): Promise<void> {
  await chrome.storage.local.set({ [`fiProgress:${txId}`]: data });
}
