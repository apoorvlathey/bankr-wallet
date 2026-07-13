import { erc20Abi, type Address, type PublicClient } from "viem";

export interface PreflightTokenMetadata {
  name: string;
  symbol: string;
  decimals: number;
}

const ERC165_ABI = [
  {
    type: "function" as const,
    name: "supportsInterface" as const,
    stateMutability: "view" as const,
    inputs: [{ name: "interfaceId", type: "bytes4" as const }],
    outputs: [{ name: "supported", type: "bool" as const }],
  },
] as const;

const ERC1155_INTERFACE_ID = "0xd9b67a26" as const;
const METADATA_CACHE_TTL_MS = 10 * 60 * 1000;
const MAX_METADATA_CACHE_ENTRIES = 512;

const metadataCache = new Map<
  string,
  { metadata: PreflightTokenMetadata; cachedAt: number }
>();

function cacheKey(chainId: number, address: string): string {
  return `${chainId}:${address.toLowerCase()}`;
}

function cacheMetadata(
  chainId: number,
  address: Address,
  metadata: PreflightTokenMetadata,
): void {
  if (metadataCache.size >= MAX_METADATA_CACHE_ENTRIES) {
    const oldest = metadataCache.keys().next().value;
    if (oldest) metadataCache.delete(oldest);
  }
  metadataCache.set(cacheKey(chainId, address), {
    metadata,
    cachedAt: Date.now(),
  });
}

export function getPreflightTokenMetadata(
  chainId: number,
  address: Address,
): PreflightTokenMetadata | null {
  const key = cacheKey(chainId, address);
  const cached = metadataCache.get(key);
  if (!cached) return null;
  if (Date.now() - cached.cachedAt >= METADATA_CACHE_TTL_MS) {
    metadataCache.delete(key);
    return null;
  }
  return cached.metadata;
}

/**
 * Filter calldata-derived addresses with one Multicall3 request before the
 * heavier bytecode-injection simulation. ERC-721 candidates survive through
 * balanceOf(address); ERC-1155 candidates survive through ERC-165.
 *
 * If Multicall3 is unavailable, return the original bounded list so asset
 * previews degrade to the existing simulator behavior instead of disappearing.
 */
export async function preflightAssetCandidates(
  client: PublicClient,
  chainId: number,
  account: Address,
  candidates: Address[],
  multicallAddress: Address,
): Promise<Address[]> {
  if (candidates.length === 0) return [];

  const contracts = candidates.flatMap((address) => [
    { address, abi: erc20Abi, functionName: "balanceOf" as const, args: [account] },
    { address, abi: erc20Abi, functionName: "name" as const },
    { address, abi: erc20Abi, functionName: "symbol" as const },
    { address, abi: erc20Abi, functionName: "decimals" as const },
    {
      address,
      abi: ERC165_ABI,
      functionName: "supportsInterface" as const,
      args: [ERC1155_INTERFACE_ID],
    },
  ]);

  try {
    const results = await client.multicall({
      contracts,
      allowFailure: true,
      multicallAddress,
    });
    const filtered: Address[] = [];

    for (let index = 0; index < candidates.length; index += 1) {
      const offset = index * 5;
      const balance = results[offset];
      const name = results[offset + 1];
      const symbol = results[offset + 2];
      const decimals = results[offset + 3];
      const erc1155 = results[offset + 4];
      const hasAccountBalance = balance?.status === "success";
      const isErc1155 = erc1155?.status === "success" && erc1155.result === true;

      if (!hasAccountBalance && !isErc1155) continue;
      filtered.push(candidates[index]);

      if (
        name?.status === "success" &&
        typeof name.result === "string" &&
        symbol?.status === "success" &&
        typeof symbol.result === "string" &&
        decimals?.status === "success" &&
        typeof decimals.result === "number"
      ) {
        cacheMetadata(chainId, candidates[index], {
          name: name.result,
          symbol: symbol.result,
          decimals: decimals.result,
        });
      }
    }

    return filtered;
  } catch {
    return candidates;
  }
}
