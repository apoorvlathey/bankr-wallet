import { CHAIN_REGISTRY, type ChainEntry } from "@/constants/chainRegistry";
import { getVisibleChains, type ChainAccountType } from "@/lib/chains";
import type { NetworksInfo } from "@/types";
import type { BungeeChain } from "@walletchan/shared/bungee";
import type { EnrichedBridgeChain } from "./types";

/** Synthetic positive IDs used by non-EVM Socket destinations. */
const NON_EVM_CHAIN_IDS = new Set<number>([
  1337, // Hypercore; HyperEVM is chain 999.
  89999, // Solana
  1110002, // Stellar
  728126428, // Tron
]);
const NON_EVM_NAME_RE = /\b(solana|tron|stellar|hypercore|aptos|sui)\b/i;

export function isEvmBridgeChain(chain: BungeeChain): boolean {
  if (
    typeof chain.chainId !== "number" ||
    !Number.isFinite(chain.chainId) ||
    chain.chainId <= 0
  ) {
    return false;
  }
  if (NON_EVM_CHAIN_IDS.has(chain.chainId)) return false;
  if (chain.name && NON_EVM_NAME_RE.test(chain.name)) return false;
  return true;
}

function registryEntriesById(): Map<number, ChainEntry> {
  return new Map(CHAIN_REGISTRY.map((chain) => [chain.chainId, chain]));
}

/**
 * Resolves signable sources. A failed/empty Socket catalog deliberately falls
 * back to every visible configured chain so temporary API failure does not
 * block same-chain swaps or locally signable custom chains.
 */
export function resolveBridgeSourceChains(
  bungeeChains: BungeeChain[],
  networksInfo: NetworksInfo,
  accountType?: ChainAccountType | null,
): EnrichedBridgeChain[] {
  const bungeeById = new Map<number, BungeeChain>();
  for (const chain of bungeeChains) {
    if (isEvmBridgeChain(chain)) bungeeById.set(chain.chainId, chain);
  }

  const registryById = registryEntriesById();
  const bungeeAvailable = bungeeChains.length > 0;
  const result: EnrichedBridgeChain[] = [];
  for (const chain of getVisibleChains(networksInfo, accountType)) {
    const bungee = bungeeById.get(chain.chainId);
    const canBridgeFrom =
      !bungeeAvailable || (!!bungee && bungee.sendingEnabled !== false);
    if (!chain.isSwapSupported && !canBridgeFrom) continue;

    result.push({
      ...(bungee ?? {}),
      chainId: chain.chainId,
      name: bungee?.name ?? chain.name,
      icon: bungee?.icon ?? bungee?.logoURI ?? chain.icon,
      logoURI: bungee?.logoURI,
      sendingEnabled: bungee?.sendingEnabled,
      receivingEnabled: bungee?.receivingEnabled,
      bgColor: bungee?.bgColor,
      registry: registryById.get(chain.chainId),
    });
  }
  return result;
}

export function resolveBridgeDestinationChains(
  bungeeChains: BungeeChain[],
): EnrichedBridgeChain[] {
  const registryById = registryEntriesById();
  const result: EnrichedBridgeChain[] = [];
  for (const chain of bungeeChains) {
    if (!isEvmBridgeChain(chain) || chain.receivingEnabled === false) continue;
    result.push({ ...chain, registry: registryById.get(chain.chainId) });
  }
  return result;
}

export function getRegistryEntry(chainId: number): ChainEntry | undefined {
  return CHAIN_REGISTRY.find((chain) => chain.chainId === chainId);
}
