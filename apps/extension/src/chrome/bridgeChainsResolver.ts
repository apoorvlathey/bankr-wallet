/**
 * Bridge chain coverage helpers.
 *
 * - **Source chains**: must be signable by the extension. Uses the runtime
 *   configured chain list (built-ins + user-added custom chains), filtered by
 *   account type, and keeps chains that 0x supports for same-chain swaps OR
 *   Socket supports as bridge sources.
 * - **Destination chains**: only needs metadata for display + tx-link.
 *   Returns Bungee's full EVM-only list so the picker auto-expands when
 *   Bungee adds support for new chains.
 *
 * EVM filter: keeps entries whose `chainId` is a finite positive number
 * (Bungee occasionally lists non-EVM networks like Solana with non-numeric
 * ids in the same response shape).
 */

import { CHAIN_REGISTRY, type ChainEntry } from "@/constants/chainRegistry";
import {
  getStoredNetworksInfo,
  getVisibleChains,
  type ChainAccountType,
} from "@/lib/chains";
import { getCachedBungeeChains } from "./bridgeApi";
import type { BungeeChain } from "@walletchan/shared/bungee";

export interface EnrichedBridgeChain extends BungeeChain {
  /** Registry entry — present only on the source-chain list. */
  registry?: ChainEntry;
}

/**
 * Bungee routes to several non-EVM destinations (Solana, Tron, Stellar via
 * Wormhole; Hypercore is Hyperliquid's native order-book L1, separate from
 * the EVM chain HyperEVM at chainId 999). Our wallet only signs EVM txs, so
 * we strip them at the resolver layer rather than rendering chains the user
 * can't actually bridge to.
 *
 * Verified against the live `/api/bridge/chains` response: Bungee assigns
 * these synthetic positive numeric chainIds, so a typeof-number filter alone
 * misses them. We drop them by chainId (definitive — Bungee doesn't renumber
 * existing chains) and keep a name-keyword safety net for likely future
 * additions like Aptos/Sui. Word boundaries avoid false positives such as
 * "Fantom" (contains "ton") or "Mantle" (contains "ant").
 */
const NON_EVM_CHAIN_IDS = new Set<number>([
  1337, // Hypercore (Hyperliquid order-book L1 — HyperEVM at 999 is EVM ✓)
  89999, // Solana
  1110002, // Stellar
  728126428, // Tron
]);

const NON_EVM_NAME_RE =
  /\b(solana|tron|stellar|hypercore|aptos|sui)\b/i;

function isEvmChain(chain: BungeeChain): boolean {
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

/**
 * Returns chains the extension can sign on.
 *
 * - Starts from `getVisibleChains()` so user-added custom chains, hidden
 *   flags, RPC overrides, and Bankr-vs-local account restrictions stay in one
 *   resolver.
 * - Keeps 0x-supported chains even if Bungee doesn't report them, because the
 *   same sell picker also powers same-chain swaps.
 * - Keeps Bungee source chains even if they aren't 0x-supported, because they
 *   can still be valid bridge origins.
 * - When Bungee is unreachable we fall back to the configured visible chains —
 *   letting users pick a chain they can sign on is strictly better than
 *   blocking entirely.
 */
export async function getBridgeSourceChains(
  accountType?: ChainAccountType | null,
): Promise<EnrichedBridgeChain[]> {
  const [bungeeChains, networksInfo] = await Promise.all([
    getCachedBungeeChains(),
    getStoredNetworksInfo(),
  ]);
  const bungeeById = new Map<number, BungeeChain>();
  for (const c of bungeeChains) {
    if (isEvmChain(c)) bungeeById.set(c.chainId, c);
  }

  const registryById = new Map<number, ChainEntry>();
  for (const c of CHAIN_REGISTRY) registryById.set(c.chainId, c);

  const visibleChains = getVisibleChains(networksInfo, accountType);
  const bungeeAvailable = bungeeChains.length > 0;
  const result: EnrichedBridgeChain[] = [];
  for (const chain of visibleChains) {
    const bungee = bungeeById.get(chain.chainId);
    const canSwap = chain.isSwapSupported;
    const canBridgeFrom =
      !bungeeAvailable || (!!bungee && bungee.sendingEnabled !== false);
    if (!canSwap && !canBridgeFrom) continue;

    const entry = registryById.get(chain.chainId);
    result.push({
      ...(bungee ?? {}),
      chainId: chain.chainId,
      name: bungee?.name ?? chain.name,
      icon: bungee?.icon ?? bungee?.logoURI ?? chain.icon,
      logoURI: bungee?.logoURI,
      sendingEnabled: bungee?.sendingEnabled,
      receivingEnabled: bungee?.receivingEnabled,
      bgColor: bungee?.bgColor,
      registry: entry,
    });
  }
  return result;
}

/**
 * Returns all Bungee-supported EVM destination chains.
 *
 * Used for the destination picker only — we don't sign here, we just track
 * status via Bungee. When CHAIN_REGISTRY also has the chain, that entry is
 * preferred for explorer / RPC metadata downstream; otherwise the row still
 * renders, just without a tx-explorer link.
 */
export async function getBridgeDestinationChains(): Promise<EnrichedBridgeChain[]> {
  const bungeeChains = await getCachedBungeeChains();
  const registryById = new Map<number, ChainEntry>();
  for (const c of CHAIN_REGISTRY) registryById.set(c.chainId, c);

  const result: EnrichedBridgeChain[] = [];
  for (const c of bungeeChains) {
    if (!isEvmChain(c)) continue;
    if (c.receivingEnabled === false) continue;
    result.push({ ...c, registry: registryById.get(c.chainId) });
  }
  return result;
}

/**
 * Lookup the registry entry for a chainId, if any. Used downstream when we
 * need to surface an explorer link on the destination side (graceful degrade
 * to plain truncated hex when missing).
 */
export function getRegistryEntry(chainId: number): ChainEntry | undefined {
  return CHAIN_REGISTRY.find((c) => c.chainId === chainId);
}
