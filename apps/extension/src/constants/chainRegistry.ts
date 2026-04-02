/**
 * Single source of truth for all supported chains.
 *
 * Adding a new chain? Add ONE entry to CHAIN_REGISTRY below.
 * All derived maps, sets, and config objects auto-populate.
 *
 * Runtime note: UI/background code should usually go through `lib/chains.ts`
 * instead of reading `CHAIN_REGISTRY` and `networksInfo` separately. That
 * resolver is what keeps built-in chains, user RPC overrides, hidden flags,
 * and custom chains in sync everywhere.
 */

import { type Chain } from "viem";
import { arbitrum, mainnet, polygon, base, bsc } from "viem/chains";
import { type NetworksInfo } from "@/types";

// ---------------------------------------------------------------------------
// Core types
// ---------------------------------------------------------------------------

export interface ChainEntry {
  chainId: number;
  name: string;
  rpcUrl: string;
  explorer: string;
  /** Icon path relative to extension public dir */
  icon: string;
  /** UI brand colors */
  bg: string;
  border: string;
  text: string;
  nativeCurrency: { name: string; symbol: string; decimals: number };
  /** Whether this chain uses OP Stack (for L1 fee breakdown in gas display) */
  isOpStack: boolean;
  /** Whether the Bankr API supports this chain */
  isBankrSupported: boolean;
  /** Whether 0x Swap API supports this chain */
  isSwapSupported: boolean;
  /** CoinGecko token ID for native token price lookups (undefined = no price) */
  coingeckoTokenId?: string;
  /** CoinGecko platform ID for token list lookups (e.g. "base", "ethereum") */
  coingeckoPlatformId?: string;
  /** Pre-built viem Chain object (for chains in viem/chains). Omit for custom chains. */
  viemChain?: Chain;
}

/** Subset exposed by chainConfig.ts consumers */
export interface ChainConfig {
  name: string;
  bg: string;
  border: string;
  text: string;
  icon: string;
  explorer: string;
}

// ---------------------------------------------------------------------------
// Registry — THE single list. Edit here to add/remove chains.
// ---------------------------------------------------------------------------

const ETH_CURRENCY = { name: "Ether", symbol: "ETH", decimals: 18 };

export const CHAIN_REGISTRY: readonly ChainEntry[] = [
  // Ethereum first, then alphabetical
  {
    chainId: 1,
    name: "Ethereum",
    rpcUrl: "https://eth.llamarpc.com",
    explorer: "https://etherscan.io",
    icon: "/chainIcons/ethereum.svg",
    bg: "rgba(98, 126, 234, 0.15)",
    border: "rgba(98, 126, 234, 0.4)",
    text: "#627EEA",
    nativeCurrency: ETH_CURRENCY,
    isOpStack: false,
    isBankrSupported: true,
    isSwapSupported: true,
    coingeckoTokenId: "ethereum",
    coingeckoPlatformId: "ethereum",
    viemChain: mainnet,
  },
  {
    chainId: 42161,
    name: "Arbitrum",
    rpcUrl: "https://arb1.arbitrum.io/rpc",
    explorer: "https://arbiscan.io",
    icon: "/chainIcons/arbitrum.svg",
    bg: "rgba(40, 160, 240, 0.15)",
    border: "rgba(40, 160, 240, 0.4)",
    text: "#28A0F0",
    nativeCurrency: ETH_CURRENCY,
    isOpStack: false,
    isBankrSupported: true,
    isSwapSupported: true,
    coingeckoTokenId: "ethereum",
    coingeckoPlatformId: "arbitrum-one",
    viemChain: arbitrum,
  },
  {
    chainId: 8453,
    name: "Base",
    rpcUrl: "https://mainnet.base.org",
    explorer: "https://basescan.org",
    icon: "/chainIcons/base.svg",
    bg: "rgba(0, 82, 255, 0.15)",
    border: "rgba(0, 82, 255, 0.4)",
    text: "#0052FF",
    nativeCurrency: ETH_CURRENCY,
    isOpStack: true,
    isBankrSupported: true,
    isSwapSupported: true,
    coingeckoTokenId: "ethereum",
    coingeckoPlatformId: "base",
    viemChain: base,
  },
  {
    chainId: 56,
    name: "BNB Chain",
    rpcUrl: "https://bsc-dataseed.binance.org",
    explorer: "https://bscscan.com",
    icon: "/chainIcons/bnb.svg",
    bg: "rgba(243, 186, 47, 0.15)",
    border: "rgba(243, 186, 47, 0.4)",
    text: "#F3BA2F",
    nativeCurrency: { name: "BNB", symbol: "BNB", decimals: 18 },
    isOpStack: false,
    isBankrSupported: true,
    isSwapSupported: true,
    coingeckoTokenId: "binancecoin",
    coingeckoPlatformId: "binance-smart-chain",
    viemChain: bsc,
  },
  {
    chainId: 4326,
    name: "MegaETH",
    rpcUrl: "https://mainnet.megaeth.com/rpc",
    explorer: "https://mega.etherscan.io",
    icon: "/chainIcons/megaeth.svg",
    bg: "rgba(25, 25, 26, 0.15)",
    border: "rgba(25, 25, 26, 0.4)",
    text: "#19191A",
    nativeCurrency: ETH_CURRENCY,
    isOpStack: true,
    isBankrSupported: false,
    isSwapSupported: false,
    coingeckoTokenId: undefined,
  },
  {
    chainId: 137,
    name: "Polygon",
    rpcUrl: "https://polygon-rpc.com",
    explorer: "https://polygonscan.com",
    icon: "/chainIcons/polygon.svg",
    bg: "rgba(130, 71, 229, 0.15)",
    border: "rgba(130, 71, 229, 0.4)",
    text: "#8247E5",
    nativeCurrency: { name: "POL", symbol: "POL", decimals: 18 },
    isOpStack: false,
    isBankrSupported: true,
    isSwapSupported: true,
    coingeckoTokenId: "matic-network",
    coingeckoPlatformId: "polygon-pos",
    viemChain: polygon,
  },
  {
    chainId: 130,
    name: "Unichain",
    rpcUrl: "https://mainnet.unichain.org",
    explorer: "https://uniscan.xyz",
    icon: "/chainIcons/unichain.svg",
    bg: "rgba(255, 0, 122, 0.15)",
    border: "rgba(255, 0, 122, 0.4)",
    text: "#FF007A",
    nativeCurrency: ETH_CURRENCY,
    isOpStack: true,
    isBankrSupported: true,
    isSwapSupported: true,
    coingeckoTokenId: "ethereum",
    coingeckoPlatformId: "unichain",
  },
] as const;

// ---------------------------------------------------------------------------
// Derived: chainConfig.ts exports
// ---------------------------------------------------------------------------

export const CHAIN_CONFIG: Record<number, ChainConfig> = {};
for (const c of CHAIN_REGISTRY) {
  CHAIN_CONFIG[c.chainId] = {
    name: c.name,
    bg: c.bg,
    border: c.border,
    text: c.text,
    icon: c.icon,
    explorer: c.explorer,
  };
}

export const DEFAULT_CHAIN_CONFIG: ChainConfig = {
  name: "Unknown",
  bg: "rgba(255, 255, 255, 0.1)",
  border: "rgba(255, 255, 255, 0.2)",
  text: "#FAFAFA",
  icon: "",
  explorer: "",
};

export function getChainConfig(chainId: number): ChainConfig {
  return CHAIN_CONFIG[chainId] || DEFAULT_CHAIN_CONFIG;
}

// ---------------------------------------------------------------------------
// Derived: networks.ts exports
// ---------------------------------------------------------------------------

export const DEFAULT_NETWORKS: NetworksInfo = {};
for (const c of CHAIN_REGISTRY) {
  DEFAULT_NETWORKS[c.name] = { chainId: c.chainId, rpcUrl: c.rpcUrl };
}

export const ALLOWED_CHAIN_IDS = new Set(CHAIN_REGISTRY.map((c) => c.chainId));

export const BANKR_SUPPORTED_CHAIN_IDS = new Set(
  CHAIN_REGISTRY.filter((c) => c.isBankrSupported).map((c) => c.chainId)
);

export const SWAP_SUPPORTED_CHAIN_IDS = new Set(
  CHAIN_REGISTRY.filter((c) => c.isSwapSupported).map((c) => c.chainId)
);

export const COINGECKO_PLATFORM_IDS: Record<number, string> = {};
for (const c of CHAIN_REGISTRY) {
  if (c.coingeckoPlatformId) {
    COINGECKO_PLATFORM_IDS[c.chainId] = c.coingeckoPlatformId;
  }
}

export const OP_STACK_CHAIN_IDS = new Set(
  CHAIN_REGISTRY.filter((c) => c.isOpStack).map((c) => c.chainId)
);

export const CHAIN_NAMES: Record<number, string> = {};
for (const c of CHAIN_REGISTRY) {
  CHAIN_NAMES[c.chainId] = c.name;
}

// ---------------------------------------------------------------------------
// Derived: localSigner.ts exports (viem Chain objects + RPC URLs)
// ---------------------------------------------------------------------------

function buildViemChain(entry: ChainEntry): Chain {
  return {
    id: entry.chainId,
    name: entry.name,
    nativeCurrency: entry.nativeCurrency,
    rpcUrls: {
      default: { http: [entry.rpcUrl] },
    },
    blockExplorers: {
      default: { name: entry.name + " Explorer", url: entry.explorer },
    },
  };
}

const DEFAULT_NATIVE_CURRENCY = { name: "Ether", symbol: "ETH", decimals: 18 };

/** Build a viem Chain object at runtime for custom (user-added) chains. */
export function buildCustomViemChain(
  chainId: number,
  name: string,
  rpcUrl: string,
  nativeCurrency?: { name: string; symbol: string; decimals: number },
  explorer?: string,
): Chain {
  return {
    id: chainId,
    name,
    nativeCurrency: nativeCurrency ?? DEFAULT_NATIVE_CURRENCY,
    rpcUrls: {
      default: { http: [rpcUrl] },
    },
    blockExplorers: explorer
      ? { default: { name: name + " Explorer", url: explorer } }
      : undefined,
  };
}

export const VIEM_CHAINS: Record<number, Chain> = {};
for (const c of CHAIN_REGISTRY) {
  VIEM_CHAINS[c.chainId] = c.viemChain ?? buildViemChain(c);
}

export const RPC_URLS: Record<number, string> = {};
for (const c of CHAIN_REGISTRY) {
  RPC_URLS[c.chainId] = c.rpcUrl;
}

// ---------------------------------------------------------------------------
// Derived: gasEstimation.ts exports
// ---------------------------------------------------------------------------

export const CHAIN_TOKEN_IDS: Record<number, string> = {};
for (const c of CHAIN_REGISTRY) {
  if (c.coingeckoTokenId) {
    CHAIN_TOKEN_IDS[c.chainId] = c.coingeckoTokenId;
  }
}

// ---------------------------------------------------------------------------
// Derived: native currency symbols (for gas display)
// ---------------------------------------------------------------------------

/** Native currency symbols for hardcoded chains. Custom chains resolved at runtime from networksInfo. */
export const NATIVE_CURRENCY_SYMBOLS: Record<number, string> = {};
for (const c of CHAIN_REGISTRY) {
  NATIVE_CURRENCY_SYMBOLS[c.chainId] = c.nativeCurrency.symbol;
}

/**
 * Resolve native currency symbol for any chainId.
 * Checks CHAIN_REGISTRY first, then falls back to networksInfo in chrome.storage.
 * Returns "ETH" if chain is unknown (safe default).
 */
export async function getNativeCurrencySymbol(chainId: number): Promise<string> {
  // Fast path: hardcoded chain
  if (NATIVE_CURRENCY_SYMBOLS[chainId]) return NATIVE_CURRENCY_SYMBOLS[chainId];

  // Slow path: check custom chains in storage
  try {
    const { networksInfo } = await chrome.storage.sync.get("networksInfo");
    if (networksInfo) {
      for (const name of Object.keys(networksInfo)) {
        if (networksInfo[name].chainId === chainId) {
          return networksInfo[name].nativeCurrency?.symbol || "ETH";
        }
      }
    }
  } catch {
    // Storage may not be available in all contexts
  }

  return "ETH";
}

/**
 * Resolve explorer URL for any chainId.
 * Checks CHAIN_CONFIG first, then falls back to networksInfo in chrome.storage.
 * Returns "" if no explorer configured.
 */
export async function getExplorerUrl(chainId: number): Promise<string> {
  // Fast path: hardcoded chain
  if (CHAIN_CONFIG[chainId]?.explorer) return CHAIN_CONFIG[chainId].explorer;

  // Slow path: check custom chains in storage
  try {
    const { networksInfo } = await chrome.storage.sync.get("networksInfo");
    if (networksInfo) {
      for (const name of Object.keys(networksInfo)) {
        if (networksInfo[name].chainId === chainId) {
          return networksInfo[name].explorer || "";
        }
      }
    }
  } catch {
    // Storage may be unavailable in some execution contexts.
  }

  return "";
}

/**
 * Synchronous explorer URL resolver — checks CHAIN_CONFIG then networksInfo entry.
 * Use in React components where you already have networksInfo from context.
 */
export function getExplorerUrlSync(chainId: number, networksInfo?: Record<string, { chainId: number; explorer?: string }>): string {
  if (CHAIN_CONFIG[chainId]?.explorer) return CHAIN_CONFIG[chainId].explorer;
  if (networksInfo) {
    for (const name of Object.keys(networksInfo)) {
      if (networksInfo[name].chainId === chainId) {
        return networksInfo[name].explorer || "";
      }
    }
  }
  return "";
}
