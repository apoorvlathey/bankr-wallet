import { createPublicClient, type Address } from "viem";
import { secureHttpTransport } from "@/chrome/network/rpcClient";

import { sanitizeResolvedName } from "@/lib/ensUtils";

const GNS_NAME_NFT_ADDRESS =
  "0x9D51D507BC7264d4fE8Ad1cf7Fe191933A0a81d6" as Address;

const GNS_NAME_NFT_ABI = [
  {
    type: "function",
    name: "getFullName",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ name: "", type: "string" }],
  },
] as const;

const cache = new Map<string, string | null>();

export async function resolveGweiNameForTokenId({
  chainId,
  rpcUrl,
  tokenId,
}: {
  chainId: number;
  rpcUrl?: string;
  tokenId: string;
}): Promise<string | null> {
  if ((chainId !== 1 && chainId !== 11155111) || !rpcUrl) return null;

  let tokenIdBigInt: bigint;
  try {
    tokenIdBigInt = BigInt(tokenId);
  } catch {
    return null;
  }
  if (tokenIdBigInt === 0n) return null;

  const key = `${chainId}:${tokenIdBigInt.toString()}`;
  if (cache.has(key)) return cache.get(key) ?? null;

  try {
    const client = createPublicClient({
      transport: secureHttpTransport(rpcUrl, { timeout: 8000, retryCount: 0 }),
    });
    const raw = await client.readContract({
      address: GNS_NAME_NFT_ADDRESS,
      abi: GNS_NAME_NFT_ABI,
      functionName: "getFullName",
      args: [tokenIdBigInt],
    });
    const resolved = sanitizeResolvedName(raw) ?? null;
    cache.set(key, resolved);
    return resolved;
  } catch {
    cache.set(key, null);
    return null;
  }
}

export function formatGweiTokenFallback(tokenId: string): string {
  if (tokenId.length <= 18) return `#${tokenId}`;
  return `#${tokenId.slice(0, 8)}...${tokenId.slice(-6)}`;
}
