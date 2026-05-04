/**
 * Single source of truth for portfolio API chain support and per-provider
 * addressing. Edit this file (and only this file) when adding/removing chains.
 *
 * Provider docs — re-verify periodically (providers add chains regularly):
 * - Dune Sim:  https://docs.sim.dune.com/evm/supported-chains
 *              live JSON at https://api.sim.dune.com/v1/evm/supported-chains
 * - Alchemy:   https://www.alchemy.com/docs/reference/get-tokens-by-address
 *              full chain list at https://dashboard.alchemy.com/chains
 *              (some chains gated behind paid plans — see `alchemyRequiresPaidPlan`)
 * - Octav:     https://docs.octav.fi/api/reference/supported-chains
 */

export interface ChainSupport {
  chainId: number;
  /** Human-friendly name for logs / debugging. */
  name: string;
  /** Alchemy `network` slug. null = not supported by Alchemy at any tier. */
  alchemyNetwork: string | null;
  /** True if Alchemy gates this chain behind a paid plan. Dropped on retry. */
  alchemyRequiresPaidPlan?: boolean;
  /** Octav `chains` map key. null = not supported by Octav. */
  octavName: string | null;
}

export const PORTFOLIO_CHAINS: readonly ChainSupport[] = [
  { chainId: 1,     name: "Ethereum",  alchemyNetwork: "eth-mainnet",      octavName: "ethereum" },
  { chainId: 8453,  name: "Base",      alchemyNetwork: "base-mainnet",     octavName: "base" },
  { chainId: 137,   name: "Polygon",   alchemyNetwork: "matic-mainnet",    octavName: "polygon" },
  { chainId: 130,   name: "Unichain",  alchemyNetwork: "unichain-mainnet", alchemyRequiresPaidPlan: true, octavName: "unichain" },
  { chainId: 42161, name: "Arbitrum",  alchemyNetwork: "arb-mainnet",      octavName: "arbitrum" },
  { chainId: 10,    name: "Optimism",  alchemyNetwork: "opt-mainnet",      octavName: "optimism" },
  { chainId: 56,    name: "BSC",       alchemyNetwork: "bnb-mainnet",      octavName: "bsc" },
  { chainId: 43114, name: "Avalanche", alchemyNetwork: "avax-mainnet",     octavName: "avalanche-c-chain" },
  { chainId: 4326,  name: "MegaETH",   alchemyNetwork: "megaeth-mainnet",  alchemyRequiresPaidPlan: true, octavName: null },
  { chainId: 143,   name: "Monad",     alchemyNetwork: "monad-mainnet",    alchemyRequiresPaidPlan: true, octavName: null },
];

export const SUPPORTED_CHAIN_IDS: readonly number[] = PORTFOLIO_CHAINS.map(
  (c) => c.chainId
);

export const CHAIN_BY_ID: Map<number, ChainSupport> = new Map(
  PORTFOLIO_CHAINS.map((c) => [c.chainId, c])
);

/** Octav returns chains by name; we map back to our chainId. Used by octav.ts. */
export const OCTAV_NAME_TO_CHAIN_ID: Record<string, number> = Object.fromEntries(
  PORTFOLIO_CHAINS.filter((c) => c.octavName).map((c) => [c.octavName!, c.chainId])
);
