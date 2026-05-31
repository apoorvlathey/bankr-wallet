export interface RuntimeChainSummary {
  name: string;
  chainId: number;
}

const CHAIN_ALIASES = new Map<string, number>([
  ["ethereum", 1],
  ["eth", 1],
  ["mainnet", 1],
  ["optimism", 10],
  ["op", 10],
  ["bnb", 56],
  ["bsc", 56],
  ["binance", 56],
  ["bnb-chain", 56],
  ["binance-smart-chain", 56],
  ["gnosis", 100],
  ["xdai", 100],
  ["unichain", 130],
  ["uni", 130],
  ["monad", 143],
  ["sonic", 146],
  ["polygon", 137],
  ["matic", 137],
  ["base", 8453],
  ["base-mainnet", 8453],
  ["megaeth", 4326],
  ["mega", 4326],
  ["intuition", 1155],
  ["sei", 1329],
  ["sei-network", 1329],
  ["ronin", 2020],
  ["citrea", 4114],
  ["tempo", 4217],
  ["mantle", 5000],
  ["arbitrum", 42161],
  ["arbitrum-one", 42161],
  ["arb", 42161],
  ["arbitrum-nova", 42170],
  ["arb-nova", 42170],
  ["nova", 42170],
  ["celo", 42220],
  ["avalanche", 43114],
  ["avax", 43114],
  ["ink", 57073],
  ["linea", 59144],
  ["linea-mainnet", 59144],
  ["berachain", 80094],
  ["bera", 80094],
  ["katana", 747474],
  ["base-sepolia", 84532],
]);

export function parseChainId(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return value;
  }
  if (typeof value !== "string" || value.trim() === "") return null;
  const trimmed = value.trim();
  const parsed = trimmed.startsWith("0x")
    ? Number.parseInt(trimmed, 16)
    : Number(trimmed);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export function toHexChainId(chainId: number): `0x${string}` {
  return `0x${chainId.toString(16)}`;
}

export function resolveChainInput(value: unknown): {
  chainId?: number;
  name?: string;
} {
  const chainId = parseChainId(value);
  if (chainId) return { chainId };

  if (typeof value !== "string" || value.trim() === "") {
    return {};
  }

  const normalized = value.trim().toLowerCase();
  return {
    name: normalized,
    chainId: CHAIN_ALIASES.get(normalized),
  };
}

export function findConfiguredChain(
  chains: RuntimeChainSummary[],
  value: unknown,
): RuntimeChainSummary | null {
  const requested = resolveChainInput(value);
  if (requested.chainId) {
    return chains.find((chain) => chain.chainId === requested.chainId) || null;
  }
  if (requested.name) {
    return chains.find((chain) => chain.name.toLowerCase() === requested.name) || null;
  }
  return null;
}

export function formatConfiguredChains(chains: RuntimeChainSummary[]): string {
  return chains.map((chain) => `${chain.name}(${chain.chainId})`).join(", ");
}
