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
import {
  arbitrum,
  mainnet,
  megaeth,
  polygon,
  base,
  bsc,
  // OP Stack chains for force inclusion support
  baseSepolia,
  optimism,
  optimismSepolia,
  unichain,
  unichainSepolia,
  blast,
  zora,
  zoraSepolia,
  worldchain,
  worldchainSepolia,
} from "viem/chains";
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
  /**
   * Whether this chain supports Flashblocks (~200ms preconfirmations exposed via
   * standard eth_getTransactionReceipt on Flashblocks-aware RPC endpoints).
   * Triggers a fast-poll phase in the receipt poller. Harmless on RPCs that
   * don't support Flashblocks — they just respond with normal-block-time
   * receipts and the poller transitions to standard backoff.
   */
  supportsFlashblocks?: boolean;
  /**
   * Whether this chain supports EIP-7966 eth_sendRawTransactionSync — submit
   * a signed tx and the RPC returns the full receipt in one round trip
   * (MegaETH ~100ms). Local-signing only (PK/Seed); Bankr accounts ignore.
   * On failure or timeout the broadcaster falls back to standard send +
   * receipt polling.
   */
  supportsSyncSend?: boolean;
  /**
   * Multiplier applied to the eth_estimateGas result to allow headroom for
   * state changes between estimate and inclusion. Default 20 (= 1.2×).
   */
  gasBufferPct?: number;
  /**
   * Whether this chain uses a gas model that differs from standard EVM
   * (e.g., MegaETH's dual compute + storage gas accounting with SSTORE
   * bucket multipliers). When true:
   *
   *   1. Dapp-provided `tx.gas` values are stripped at intake — wagmi/ethers
   *      compute against standard EVM rules and produce wrong values.
   *   2. Batch gas estimation skips the GAS-opcode-based bytecode injection
   *      trick — it counts only compute gas, missing the storage dimension.
   *   3. We always defer to the chain's own `eth_estimateGas`, which knows
   *      its gas model and returns accurate values.
   *
   * Fee fields (maxFeePerGas etc.) are still honored — under-priced fees
   * only delay inclusion, they don't cause reverts.
   */
  usesNonStandardGasModel?: boolean;
  /** Whether the Bankr API supports this chain */
  isBankrSupported: boolean;
  /** Whether 0x Swap API supports this chain */
  isSwapSupported: boolean;
  /**
   * Whether this chain supports EIP-7702 (Pectra activation live). When true,
   * PK/SP accounts can authorize a smart-contract delegate (the MM
   * EIP7702StatelessDeleGator by default) and execute atomic batches as a
   * single tx. When false, PK/SP batches fall back to auto-sequential.
   * Custom chains can opt in by configuring a delegate in Account Settings,
   * regardless of this flag.
   */
  isEip7702Supported?: boolean;
  /** CoinGecko token ID for native token price lookups (undefined = no price) */
  coingeckoTokenId?: string;
  /** CoinGecko platform ID for token list lookups (e.g. "base", "ethereum") */
  coingeckoPlatformId?: string;
  /**
   * GeckoTerminal network slug (e.g. "eth", "base", "polygon_pos"). Used as
   * a fallback price source for tokens CoinGecko doesn't index. GeckoTerminal
   * derives prices from onchain DEX liquidity so it covers exotic / new
   * tokens that the CoinGecko `/simple/token_price` endpoint misses.
   * undefined = no GeckoTerminal coverage for this chain.
   */
  geckoTerminalNetworkId?: string;
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
    rpcUrl: "https://eth.drpc.org",
    explorer: "https://etherscan.io",
    icon: "/chainIcons/ethereum.svg",
    bg: "rgba(98, 126, 234, 0.15)",
    border: "rgba(98, 126, 234, 0.4)",
    text: "#627EEA",
    nativeCurrency: ETH_CURRENCY,
    isOpStack: false,
    isBankrSupported: true,
    isSwapSupported: true,
    isEip7702Supported: true,
    coingeckoTokenId: "ethereum",
    coingeckoPlatformId: "ethereum",
    geckoTerminalNetworkId: "eth",
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
    isEip7702Supported: true,
    coingeckoTokenId: "ethereum",
    coingeckoPlatformId: "arbitrum-one",
    geckoTerminalNetworkId: "arbitrum",
    viemChain: arbitrum,
  },
  {
    chainId: 8453,
    name: "Base",
    rpcUrl: "https://base.drpc.org",
    explorer: "https://basescan.org",
    icon: "/chainIcons/base.svg",
    bg: "rgba(0, 82, 255, 0.15)",
    border: "rgba(0, 82, 255, 0.4)",
    text: "#0052FF",
    nativeCurrency: ETH_CURRENCY,
    isOpStack: true,
    supportsFlashblocks: true,
    isBankrSupported: true,
    isSwapSupported: true,
    isEip7702Supported: true,
    coingeckoTokenId: "ethereum",
    coingeckoPlatformId: "base",
    geckoTerminalNetworkId: "base",
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
    isEip7702Supported: true,
    coingeckoTokenId: "binancecoin",
    coingeckoPlatformId: "binance-smart-chain",
    geckoTerminalNetworkId: "bsc",
    viemChain: bsc,
  },
  {
    chainId: 10,
    name: "Optimism",
    rpcUrl: "https://mainnet.optimism.io",
    explorer: "https://optimistic.etherscan.io",
    icon: "/chainIcons/optimism.svg",
    bg: "rgba(255, 4, 32, 0.15)",
    border: "rgba(255, 4, 32, 0.4)",
    text: "#FF0420",
    nativeCurrency: ETH_CURRENCY,
    isOpStack: true,
    supportsFlashblocks: true,
    isBankrSupported: false,
    isSwapSupported: true,
    isEip7702Supported: true,
    coingeckoTokenId: "ethereum",
    coingeckoPlatformId: "optimistic-ethereum",
    geckoTerminalNetworkId: "optimism",
    viemChain: optimism,
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
    supportsSyncSend: true,
    // MegaETH's dual gas model (compute + storage with SSTORE bucket
    // multipliers) differs from standard EVM. Locally-computed gas values
    // (dapp-provided, GAS-opcode-based simulation) are systematically wrong;
    // we must defer to the chain's own eth_estimateGas which is accurate.
    usesNonStandardGasModel: true,
    isBankrSupported: false,
    isSwapSupported: false,
    isEip7702Supported: true,
    coingeckoTokenId: "ethereum",
    geckoTerminalNetworkId: "megaeth",
    viemChain: megaeth,
  },
  {
    chainId: 137,
    name: "Polygon",
    rpcUrl: "https://polygon.drpc.org",
    explorer: "https://polygonscan.com",
    icon: "/chainIcons/polygon.svg",
    bg: "rgba(130, 71, 229, 0.15)",
    border: "rgba(130, 71, 229, 0.4)",
    text: "#8247E5",
    nativeCurrency: { name: "POL", symbol: "POL", decimals: 18 },
    isOpStack: false,
    isBankrSupported: true,
    isSwapSupported: true,
    isEip7702Supported: true,
    coingeckoTokenId: "matic-network",
    coingeckoPlatformId: "polygon-pos",
    geckoTerminalNetworkId: "polygon_pos",
    viemChain: polygon,
  },
  {
    chainId: 4663,
    name: "Robinhood Chain",
    rpcUrl: "https://rpc.mainnet.chain.robinhood.com",
    explorer: "https://robinhoodchain.blockscout.com",
    icon: "/chainIcons/robinhood.webp",
    bg: "rgba(0, 200, 5, 0.15)",
    border: "rgba(0, 200, 5, 0.4)",
    text: "#00C805",
    nativeCurrency: ETH_CURRENCY,
    isOpStack: false,
    isBankrSupported: true,
    isSwapSupported: true,
    // MetaMask's default EIP7702StatelessDeleGator is not deployed on 4663
    // in @metamask/delegation-deployments 1.4.0 / Robinhood RPC yet.
    isEip7702Supported: false,
    coingeckoTokenId: "ethereum",
    coingeckoPlatformId: "robinhood",
    geckoTerminalNetworkId: "robinhood",
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
    supportsFlashblocks: true,
    isBankrSupported: true,
    isSwapSupported: true,
    isEip7702Supported: true,
    coingeckoTokenId: "ethereum",
    coingeckoPlatformId: "unichain",
    geckoTerminalNetworkId: "unichain",
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

// https://docs.0x.org/docs/introduction/supported-chains
export const ZEROX_SUPPORTED_CHAIN_IDS = new Set([
  1,      // Ethereum
  10,     // Optimism
  56,     // BSC
  130,    // Unichain
  137,    // Polygon
  143,    // Monad
  146,    // Sonic
  480,    // World Chain
  999,    // HyperEVM
  2741,   // Abstract
  4217,   // Tempo
  4663,   // Robinhood Chain
  5000,   // Mantle
  8453,   // Base
  9745,   // Plasma
  34443,  // Mode
  42161,  // Arbitrum
  43114,  // Avalanche
  57073,  // Ink
  59144,  // Linea
  80094,  // Berachain
  81457,  // Blast
  534352, // Scroll
]);

export const SWAP_SUPPORTED_CHAIN_IDS = ZEROX_SUPPORTED_CHAIN_IDS;

export const COINGECKO_PLATFORM_IDS: Record<number, string> = {};
for (const c of CHAIN_REGISTRY) {
  if (c.coingeckoPlatformId) {
    COINGECKO_PLATFORM_IDS[c.chainId] = c.coingeckoPlatformId;
  }
}
// Extra 0x-supported chains that users may add as custom networks. They are
// not built-ins, but token prices/logos should still resolve when swaps are
// enabled for them.
COINGECKO_PLATFORM_IDS[43114] = "avalanche";

export const GECKOTERMINAL_NETWORK_IDS: Record<number, string> = {};
for (const c of CHAIN_REGISTRY) {
  if (c.geckoTerminalNetworkId) {
    GECKOTERMINAL_NETWORK_IDS[c.chainId] = c.geckoTerminalNetworkId;
  }
}
GECKOTERMINAL_NETWORK_IDS[43114] = "avax";

export const OP_STACK_CHAIN_IDS = new Set(
  CHAIN_REGISTRY.filter((c) => c.isOpStack).map((c) => c.chainId)
);

export const FLASHBLOCKS_CHAIN_IDS = new Set(
  CHAIN_REGISTRY.filter((c) => c.supportsFlashblocks).map((c) => c.chainId)
);

/**
 * Chains where EIP-7702 (Pectra) is active, so PK/SP accounts can authorize
 * a smart-contract delegate and execute atomic batches as a single tx. PK/SP
 * batches on these chains use the 7702 path; on other chains they fall back
 * to auto-sequential.
 *
 * Custom (user-added) chains whose chainId exists in KNOWN_CHAINS also use
 * the default delegate path. Other custom chains can opt into atomic batching
 * by setting a delegate explicitly in Account Settings — see
 * delegationResolution.ts.
 */
export const EIP7702_SUPPORTED_CHAIN_IDS = new Set(
  CHAIN_REGISTRY.filter((c) => c.isEip7702Supported).map((c) => c.chainId)
);

/**
 * MetaMask EIP7702StatelessDeleGator v1.3 — the default delegate WalletChan
 * authorizes for PK/SP accounts. CREATE2-deployed at the same address on
 * every chain via the canonical factory; verified on every WalletChan
 * built-in chain. Non-upgradeable, no admin, no owner. Audited by Cyfrin
 * (Apr 2025). Source: https://github.com/MetaMask/delegation-framework.
 *
 * Implements ERC-7821 `execute(bytes32 mode, bytes executionData)`, which is
 * exactly the format `encodeBatchCalls()` already produces for Bankr atomic
 * batches — same encoding works for 7702-delegated EOAs.
 *
 * Users can override this per-account×per-chain via the Smart Account section
 * in Account Settings (any ERC-7821-compatible contract).
 */
export const EIP_7702_DEFAULT_DELEGATE =
  "0x63c0c19a282a1B52b07dD5a65b58948A07DAE32B" as `0x${string}`;

/**
 * EIP-7702 set-code prefix. The 23-byte sequence written into an EOA's `code`
 * field when it delegates: `0xef0100 || <20-byte delegate address>`. Used to
 * detect whether an EOA currently has an active delegation, and to extract
 * the delegate address from `eth_getCode`.
 */
export const EIP_7702_CODE_PREFIX = "0xef0100" as const;

/**
 * Friendly name for the default delegate we authorize. Used as a pill next
 * to the raw address on the confirm screen so users see a recognizable label
 * rather than a hex blob. Custom delegates the user pastes in Account
 * Settings intentionally have no entry — they fall back to the bare address.
 */
const KNOWN_DELEGATE_NAMES: Record<string, string> = {
  [EIP_7702_DEFAULT_DELEGATE.toLowerCase()]: "MetaMask DeleGator",
};

export function getKnownDelegateName(address: string): string | null {
  return KNOWN_DELEGATE_NAMES[address.toLowerCase()] ?? null;
}

/**
 * Chains whose gas model differs enough from standard EVM that batched
 * gas estimation is unreliable (MegaETH's compute+storage dual gas, etc.).
 * The wallet hides ERC-5792 batch capability for these so dapps fall back
 * to individual eth_sendTransaction, where the chain's own RPC produces
 * accurate per-tx estimates.
 */
export const NON_STANDARD_GAS_CHAIN_IDS = new Set(
  CHAIN_REGISTRY.filter((c) => c.usesNonStandardGasModel).map((c) => c.chainId)
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

// ---------------------------------------------------------------------------
// Derived: Force Inclusion (OP Stack L1 deposit) support
// ---------------------------------------------------------------------------

export interface ForceInclusionChainInfo {
  viemChain: Chain;
  l1ChainId: number;
  l1ChainName: string;
}

/**
 * OP Stack chains that support force inclusion via L1 deposit.
 * Each chain must have a sourceId (L1 chain) and portal contract in its viem
 * definition. Covers major OP Stack chains + their testnets.
 * Custom chains added by the user are also supported if their chainId matches.
 */
export const FORCE_INCLUSION_CHAINS: Map<number, ForceInclusionChainInfo> = new Map();

const OP_STACK_VIEM_CHAINS = [
  base, baseSepolia,
  optimism, optimismSepolia,
  unichain, unichainSepolia,
  blast,
  zora, zoraSepolia,
  worldchain, worldchainSepolia,
];

for (const chain of OP_STACK_VIEM_CHAINS) {
  if (chain.sourceId && (chain.contracts as any)?.portal) {
    FORCE_INCLUSION_CHAINS.set(chain.id, {
      viemChain: chain as Chain,
      l1ChainId: chain.sourceId,
      l1ChainName:
        chain.sourceId === 1
          ? "Ethereum"
          : chain.sourceId === 11155111
            ? "Sepolia"
            : `Chain ${chain.sourceId}`,
    });
  }
}

export function isForceInclusionSupported(chainId: number): boolean {
  return FORCE_INCLUSION_CHAINS.has(chainId);
}

/**
 * Force inclusion is gated per account type because Bankr accounts submit the
 * L1 deposit through the Bankr API, which only supports chains in
 * BANKR_SUPPORTED_CHAIN_IDS. Currently that's mainnet (Ethereum, etc.) only —
 * Sepolia is not supported. PK/Seed accounts broadcast L1 directly and work on
 * any L1 with an RPC endpoint.
 */
export function isForceInclusionSupportedForAccount(
  l2ChainId: number,
  accountType: "bankr" | "privateKey" | "seedPhrase" | "impersonator" | undefined,
): boolean {
  if (!accountType || accountType === "impersonator") return false;
  const info = FORCE_INCLUSION_CHAINS.get(l2ChainId);
  if (!info) return false;
  // Bankr accounts can only force-include when the L1 chain is supported by Bankr
  if (accountType === "bankr") {
    return BANKR_SUPPORTED_CHAIN_IDS.has(info.l1ChainId);
  }
  // PK/Seed broadcast L1 directly — no Bankr dependency
  return true;
}
