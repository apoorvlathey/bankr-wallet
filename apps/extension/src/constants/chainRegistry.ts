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
  abstract,
  arbitrum,
  avalanche,
  berachain,
  blast,
  mainnet,
  hyperEvm,
  ink,
  linea,
  mantle,
  megaeth,
  mode,
  monad,
  polygon,
  plasma,
  scroll,
  sonic,
  tempo,
  base,
  bsc,
  worldchain,
  zkSync,
  // OP Stack chains for force inclusion support
  baseSepolia,
  optimism,
  optimismSepolia,
  unichain,
  unichainSepolia,
  zora,
  zoraSepolia,
  worldchainSepolia,
} from "viem/chains";
import { type NetworksInfo } from "@/types";

// ---------------------------------------------------------------------------
// Core types
// ---------------------------------------------------------------------------

export interface ChainLogoColorScheme {
  /** Surface painted behind transparent or low-contrast logo artwork. */
  surface: string;
  /** Outer edge color for the logo surface. */
  border: string;
  /** Inner edge color that keeps the surface distinct from its surroundings. */
  insetOutline: string;
}

export interface ChainLogoStyle {
  light: ChainLogoColorScheme;
  dark?: ChainLogoColorScheme;
}

export interface ChainEntry {
  chainId: number;
  /** True for first-class testnets that ship hidden until explicitly enabled. */
  isTestnet?: boolean;
  /** Mainnet whose icon, colors, and compatible runtime policy this testnet inherits. */
  parentChainId?: number;
  /** Testnet chain IDs that should reuse this chain's visual identity. */
  testnetChainIds: readonly number[];
  name: string;
  rpcUrl: string;
  explorer: string;
  /** Icon path relative to extension public dir */
  icon: string;
  /** Optional logo-specific legibility treatment, inherited by testnets. */
  logoStyle?: ChainLogoStyle;
  /** UI brand colors */
  bg: string;
  border: string;
  text: string;
  nativeCurrency: { name: string; symbol: string; decimals: number };
  /**
   * Whether eth_getBalance represents a real user-owned native asset.
   * Defaults to true. Chains such as Tempo still require nativeCurrency
   * metadata for EVM compatibility and fee display, but have no native token.
   */
  hasNativeToken?: boolean;
  /** Hidden until the user explicitly enables the chain in Settings. */
  hiddenByDefault?: boolean;
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
  logoStyle?: ChainLogoStyle;
  explorer: string;
}

// ---------------------------------------------------------------------------
// Registry — THE single list. Edit here to add/remove chains.
// ---------------------------------------------------------------------------

const ETH_CURRENCY = { name: "Ether", symbol: "ETH", decimals: 18 };

export const MAINNET_CHAIN_REGISTRY: readonly ChainEntry[] = [
  // Ethereum first, then alphabetical
  {
    chainId: 1,
    testnetChainIds: [11155111, 560048],
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
    chainId: 2741,
    testnetChainIds: [11124],
    name: "Abstract",
    rpcUrl: "https://api.mainnet.abs.xyz",
    explorer: "https://abscan.org",
    icon: "/chainIcons/abstract.webp",
    bg: "rgba(128, 255, 0, 0.15)",
    border: "rgba(128, 255, 0, 0.4)",
    text: "#80FF00",
    nativeCurrency: ETH_CURRENCY,
    isOpStack: false,
    isBankrSupported: false,
    isSwapSupported: true,
    isEip7702Supported: false,
    coingeckoTokenId: "ethereum",
    coingeckoPlatformId: "abstract",
    geckoTerminalNetworkId: "abstract",
    viemChain: abstract,
  },
  {
    chainId: 42161,
    testnetChainIds: [421614],
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
    chainId: 43114,
    testnetChainIds: [43113],
    name: "Avalanche",
    rpcUrl: "https://api.avax.network/ext/bc/C/rpc",
    explorer: "https://snowtrace.io",
    icon: "/chainIcons/avalanche.svg",
    bg: "rgba(232, 65, 66, 0.15)",
    border: "rgba(232, 65, 66, 0.4)",
    text: "#E84142",
    nativeCurrency: { name: "Avalanche", symbol: "AVAX", decimals: 18 },
    isOpStack: false,
    isBankrSupported: false,
    isSwapSupported: true,
    isEip7702Supported: false,
    coingeckoTokenId: "avalanche-2",
    coingeckoPlatformId: "avalanche",
    geckoTerminalNetworkId: "avax",
    viemChain: avalanche,
  },
  {
    chainId: 8453,
    testnetChainIds: [84532],
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
    chainId: 80094,
    testnetChainIds: [80069],
    name: "Berachain",
    rpcUrl: "https://rpc.berachain.com",
    explorer: "https://berascan.com",
    icon: "/chainIcons/berachain.svg",
    bg: "rgba(255, 183, 59, 0.15)",
    border: "rgba(255, 183, 59, 0.4)",
    text: "#FFB73B",
    nativeCurrency: { name: "BERA Token", symbol: "BERA", decimals: 18 },
    isOpStack: false,
    isBankrSupported: false,
    isSwapSupported: true,
    isEip7702Supported: true,
    coingeckoTokenId: "berachain-bera",
    coingeckoPlatformId: "berachain",
    geckoTerminalNetworkId: "berachain",
    viemChain: berachain,
  },
  {
    chainId: 81457,
    testnetChainIds: [168587773],
    name: "Blast",
    rpcUrl: "https://rpc.blast.io",
    explorer: "https://blastscan.io",
    icon: "/chainIcons/blast.svg",
    bg: "rgba(252, 252, 3, 0.15)",
    border: "rgba(252, 252, 3, 0.4)",
    text: "#FCFC03",
    nativeCurrency: ETH_CURRENCY,
    hiddenByDefault: true,
    isOpStack: true,
    isBankrSupported: false,
    isSwapSupported: false,
    isEip7702Supported: false,
    coingeckoTokenId: "ethereum",
    coingeckoPlatformId: "blast",
    geckoTerminalNetworkId: "blast",
    viemChain: blast,
  },
  {
    chainId: 56,
    testnetChainIds: [97],
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
    chainId: 999,
    testnetChainIds: [998],
    name: "HyperEVM",
    rpcUrl: "https://rpc.hyperliquid.xyz/evm",
    explorer: "https://hyperevmscan.io",
    icon: "/chainIcons/hyperevm.svg",
    logoStyle: {
      light: {
        surface: "rgba(255, 255, 255, 0.94)",
        border: "rgba(255, 255, 255, 0.28)",
        insetOutline: "rgba(0, 0, 0, 0.08)",
      },
      dark: {
        surface: "rgba(9, 9, 11, 0.94)",
        border: "rgba(151, 252, 228, 0.28)",
        insetOutline: "rgba(255, 255, 255, 0.06)",
      },
    },
    bg: "rgba(80, 227, 194, 0.15)",
    border: "rgba(80, 227, 194, 0.4)",
    text: "#50E3C2",
    nativeCurrency: { name: "HYPE", symbol: "HYPE", decimals: 18 },
    isOpStack: false,
    isBankrSupported: false,
    isSwapSupported: true,
    isEip7702Supported: false,
    coingeckoTokenId: "hyperliquid",
    coingeckoPlatformId: "hyperevm",
    geckoTerminalNetworkId: "hyperevm",
    viemChain: hyperEvm,
  },
  {
    chainId: 57073,
    testnetChainIds: [763373],
    name: "Ink",
    rpcUrl: "https://rpc-gel.inkonchain.com",
    explorer: "https://explorer.inkonchain.com",
    icon: "/chainIcons/ink.svg",
    bg: "rgba(113, 50, 245, 0.15)",
    border: "rgba(113, 50, 245, 0.4)",
    text: "#7132F5",
    nativeCurrency: ETH_CURRENCY,
    isOpStack: true,
    isBankrSupported: false,
    isSwapSupported: true,
    isEip7702Supported: true,
    coingeckoTokenId: "ethereum",
    coingeckoPlatformId: "ink",
    geckoTerminalNetworkId: "ink",
    viemChain: ink,
  },
  {
    chainId: 59144,
    testnetChainIds: [59141],
    name: "Linea",
    rpcUrl: "https://rpc.linea.build",
    explorer: "https://lineascan.build",
    icon: "/chainIcons/linea.svg",
    bg: "rgba(97, 223, 255, 0.15)",
    border: "rgba(97, 223, 255, 0.4)",
    text: "#61DFFF",
    nativeCurrency: ETH_CURRENCY,
    isOpStack: false,
    isBankrSupported: false,
    isSwapSupported: true,
    isEip7702Supported: true,
    coingeckoTokenId: "ethereum",
    coingeckoPlatformId: "linea",
    geckoTerminalNetworkId: "linea",
    viemChain: linea,
  },
  {
    chainId: 5000,
    testnetChainIds: [5003],
    name: "Mantle",
    rpcUrl: "https://rpc.mantle.xyz",
    explorer: "https://mantlescan.xyz",
    icon: "/chainIcons/mantle.svg",
    bg: "rgba(101, 217, 206, 0.15)",
    border: "rgba(101, 217, 206, 0.4)",
    text: "#65D9CE",
    nativeCurrency: { name: "MNT", symbol: "MNT", decimals: 18 },
    hiddenByDefault: true,
    isOpStack: true,
    isBankrSupported: false,
    isSwapSupported: true,
    isEip7702Supported: true,
    coingeckoTokenId: "mantle",
    coingeckoPlatformId: "mantle",
    geckoTerminalNetworkId: "mantle",
    viemChain: mantle,
  },
  {
    chainId: 10,
    testnetChainIds: [11155420],
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
    testnetChainIds: [6343],
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
    coingeckoPlatformId: "megaeth",
    geckoTerminalNetworkId: "megaeth",
    viemChain: megaeth,
  },
  {
    chainId: 34443,
    testnetChainIds: [919],
    name: "Mode",
    rpcUrl: "https://mainnet.mode.network",
    explorer: "https://explorer.mode.network",
    icon: "/chainIcons/mode.svg",
    bg: "rgba(223, 254, 0, 0.15)",
    border: "rgba(223, 254, 0, 0.4)",
    text: "#DFFE00",
    nativeCurrency: ETH_CURRENCY,
    hiddenByDefault: true,
    isOpStack: true,
    isBankrSupported: false,
    isSwapSupported: false,
    isEip7702Supported: false,
    coingeckoTokenId: "ethereum",
    coingeckoPlatformId: "mode",
    geckoTerminalNetworkId: "mode",
    viemChain: mode,
  },
  {
    chainId: 143,
    testnetChainIds: [10143, 41454], // 41454 is legacy; retain existing icon coverage
    name: "Monad",
    rpcUrl: "https://rpc.monad.xyz",
    explorer: "https://monadvision.com",
    icon: "/chainIcons/monad.svg",
    bg: "rgba(131, 110, 249, 0.15)",
    border: "rgba(131, 110, 249, 0.4)",
    text: "#836EF9",
    nativeCurrency: { name: "Monad", symbol: "MON", decimals: 18 },
    isOpStack: false,
    isBankrSupported: false,
    isSwapSupported: true,
    isEip7702Supported: true,
    coingeckoTokenId: "monad",
    coingeckoPlatformId: "monad",
    geckoTerminalNetworkId: "monad",
    viemChain: monad,
  },
  {
    chainId: 9745,
    testnetChainIds: [9746],
    name: "Plasma",
    rpcUrl: "https://rpc.plasma.to",
    explorer: "https://plasmascan.to",
    icon: "/chainIcons/plasma.svg",
    bg: "rgba(79, 255, 176, 0.15)",
    border: "rgba(79, 255, 176, 0.4)",
    text: "#4FFFB0",
    nativeCurrency: { name: "Plasma", symbol: "XPL", decimals: 18 },
    isOpStack: false,
    isBankrSupported: false,
    isSwapSupported: true,
    isEip7702Supported: false,
    coingeckoTokenId: "plasma",
    coingeckoPlatformId: "plasma",
    geckoTerminalNetworkId: "plasma",
    viemChain: plasma,
  },
  {
    chainId: 137,
    testnetChainIds: [80002],
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
    coingeckoTokenId: "polygon-ecosystem-token",
    coingeckoPlatformId: "polygon-pos",
    geckoTerminalNetworkId: "polygon_pos",
    viemChain: polygon,
  },
  {
    chainId: 4663,
    testnetChainIds: [46630],
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
    // MetaMask upstream added 4663/46630 in smart-accounts-kit PR #277.
    // The published delegation-deployments 1.4.0 package predates that merge,
    // so this built-in flag is pinned to the live 2026-07-21 verification:
    // v1.3.0 bytecode is present and supports the plain ERC-7821 batch mode.
    isEip7702Supported: true,
    coingeckoTokenId: "ethereum",
    coingeckoPlatformId: "robinhood",
    geckoTerminalNetworkId: "robinhood",
  },
  {
    chainId: 534352,
    testnetChainIds: [534351],
    name: "Scroll",
    rpcUrl: "https://rpc.scroll.io",
    explorer: "https://scrollscan.com",
    icon: "/chainIcons/scroll.svg",
    bg: "rgba(235, 194, 142, 0.15)",
    border: "rgba(235, 194, 142, 0.4)",
    text: "#EBC28E",
    nativeCurrency: ETH_CURRENCY,
    hiddenByDefault: true,
    isOpStack: false,
    isBankrSupported: false,
    isSwapSupported: true,
    isEip7702Supported: false,
    coingeckoTokenId: "ethereum",
    coingeckoPlatformId: "scroll",
    geckoTerminalNetworkId: "scroll",
    viemChain: scroll,
  },
  {
    chainId: 146,
    testnetChainIds: [14601, 57054], // Blaze (57054) is legacy but still recognizable
    name: "Sonic",
    rpcUrl: "https://rpc.soniclabs.com",
    explorer: "https://sonicscan.org",
    icon: "/chainIcons/sonic.webp",
    bg: "rgba(53, 96, 255, 0.15)",
    border: "rgba(53, 96, 255, 0.4)",
    text: "#3560FF",
    nativeCurrency: { name: "Sonic", symbol: "S", decimals: 18 },
    hiddenByDefault: true,
    isOpStack: false,
    isBankrSupported: false,
    isSwapSupported: true,
    isEip7702Supported: true,
    coingeckoTokenId: "sonic-3",
    coingeckoPlatformId: "sonic",
    geckoTerminalNetworkId: "sonic",
    viemChain: sonic,
  },
  {
    chainId: 4217,
    testnetChainIds: [42431],
    name: "Tempo",
    rpcUrl: "https://rpc.presto.tempo.xyz",
    explorer: "https://explore.mainnet.tempo.xyz",
    icon: "/chainIcons/tempo.webp",
    bg: "rgba(255, 77, 141, 0.15)",
    border: "rgba(255, 77, 141, 0.4)",
    text: "#FF4D8D",
    nativeCurrency: { name: "USD", symbol: "USD", decimals: 6 },
    hasNativeToken: false,
    isOpStack: false,
    isBankrSupported: false,
    isSwapSupported: true,
    isEip7702Supported: true,
    viemChain: tempo,
  },
  {
    chainId: 130,
    testnetChainIds: [1301],
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
    viemChain: unichain,
  },
  {
    chainId: 480,
    testnetChainIds: [4801],
    name: "World Chain",
    rpcUrl: "https://worldchain-mainnet.g.alchemy.com/public",
    explorer: "https://worldscan.org",
    icon: "/chainIcons/worldchain.svg",
    bg: "rgba(255, 255, 255, 0.15)",
    border: "rgba(255, 255, 255, 0.4)",
    text: "#FFFFFF",
    nativeCurrency: ETH_CURRENCY,
    isOpStack: true,
    isBankrSupported: false,
    isSwapSupported: true,
    isEip7702Supported: false,
    coingeckoTokenId: "ethereum",
    coingeckoPlatformId: "world-chain",
    geckoTerminalNetworkId: "world-chain",
    viemChain: worldchain,
  },
  {
    chainId: 324,
    testnetChainIds: [300],
    name: "ZKsync Era",
    rpcUrl: "https://mainnet.era.zksync.io",
    explorer: "https://explorer.zksync.io",
    icon: "/chainIcons/zksync.svg",
    bg: "rgba(78, 82, 154, 0.15)",
    border: "rgba(78, 82, 154, 0.4)",
    text: "#4E529A",
    nativeCurrency: ETH_CURRENCY,
    isOpStack: false,
    isBankrSupported: false,
    isSwapSupported: false,
    isEip7702Supported: false,
    coingeckoTokenId: "ethereum",
    coingeckoPlatformId: "zksync",
    geckoTerminalNetworkId: "zksync",
    viemChain: zkSync,
  },
] as const;

interface NativeTestnetSpec {
  chainId: number;
  parentChainId: number;
  name: string;
  rpcUrl: string;
  explorer: string;
  nativeCurrency: ChainEntry["nativeCurrency"];
  /** Opt in only after the exact default delegate passes live verification. */
  isEip7702Supported?: boolean;
}

/**
 * Current public testnets for WalletChan's built-in mainnets.
 *
 * RPCs are keyless endpoints verified with live `eth_chainId` calls. dRPC is
 * preferred when its public endpoint is available; operator/public endpoints
 * cover the remaining networks. Legacy IDs remain in the mainnet
 * `testnetChainIds` arrays for icon recognition but are not native entries.
 */
const NATIVE_TESTNET_SPECS: readonly NativeTestnetSpec[] = [
  { chainId: 11155111, parentChainId: 1, name: "Ethereum Sepolia", rpcUrl: "https://sepolia.drpc.org", explorer: "https://sepolia.etherscan.io", nativeCurrency: ETH_CURRENCY, isEip7702Supported: true },
  { chainId: 560048, parentChainId: 1, name: "Ethereum Hoodi", rpcUrl: "https://rpc.hoodi.ethpandaops.io", explorer: "https://hoodi.etherscan.io", nativeCurrency: ETH_CURRENCY, isEip7702Supported: true },
  { chainId: 11124, parentChainId: 2741, name: "Abstract Sepolia", rpcUrl: "https://api.testnet.abs.xyz", explorer: "https://sepolia.abscan.org", nativeCurrency: ETH_CURRENCY },
  { chainId: 421614, parentChainId: 42161, name: "Arbitrum Sepolia", rpcUrl: "https://arbitrum-sepolia.drpc.org", explorer: "https://sepolia.arbiscan.io", nativeCurrency: ETH_CURRENCY, isEip7702Supported: true },
  { chainId: 43113, parentChainId: 43114, name: "Avalanche Fuji", rpcUrl: "https://avalanche-fuji.drpc.org", explorer: "https://testnet.snowscan.xyz", nativeCurrency: { name: "Avalanche", symbol: "AVAX", decimals: 18 } },
  { chainId: 84532, parentChainId: 8453, name: "Base Sepolia", rpcUrl: "https://base-sepolia.drpc.org", explorer: "https://sepolia.basescan.org", nativeCurrency: ETH_CURRENCY, isEip7702Supported: true },
  { chainId: 80069, parentChainId: 80094, name: "Berachain Bepolia", rpcUrl: "https://bepolia.rpc.berachain.com", explorer: "https://bepolia.beratrail.io", nativeCurrency: { name: "Testnet BERA Token", symbol: "BERA", decimals: 18 }, isEip7702Supported: true },
  { chainId: 168587773, parentChainId: 81457, name: "Blast Sepolia", rpcUrl: "https://blast-sepolia.drpc.org", explorer: "https://testnet.blastscan.io", nativeCurrency: ETH_CURRENCY },
  { chainId: 97, parentChainId: 56, name: "BNB Chain Testnet", rpcUrl: "https://bsc-testnet.drpc.org", explorer: "https://testnet.bscscan.com", nativeCurrency: { name: "Test BNB", symbol: "tBNB", decimals: 18 }, isEip7702Supported: true },
  { chainId: 998, parentChainId: 999, name: "HyperEVM Testnet", rpcUrl: "https://rpc.hyperliquid-testnet.xyz/evm", explorer: "https://testnet.hyperscan.com", nativeCurrency: { name: "HYPE", symbol: "HYPE", decimals: 18 } },
  { chainId: 763373, parentChainId: 57073, name: "Ink Sepolia", rpcUrl: "https://rpc-gel-sepolia.inkonchain.com", explorer: "https://explorer-sepolia.inkonchain.com", nativeCurrency: ETH_CURRENCY, isEip7702Supported: true },
  { chainId: 59141, parentChainId: 59144, name: "Linea Sepolia", rpcUrl: "https://linea-sepolia.drpc.org", explorer: "https://sepolia.lineascan.build", nativeCurrency: ETH_CURRENCY, isEip7702Supported: true },
  { chainId: 5003, parentChainId: 5000, name: "Mantle Sepolia", rpcUrl: "https://mantle-sepolia.drpc.org", explorer: "https://explorer.sepolia.mantle.xyz", nativeCurrency: { name: "Sepolia Mantle", symbol: "MNT", decimals: 18 }, isEip7702Supported: true },
  { chainId: 11155420, parentChainId: 10, name: "Optimism Sepolia", rpcUrl: "https://optimism-sepolia.drpc.org", explorer: "https://sepolia-optimism.etherscan.io", nativeCurrency: ETH_CURRENCY, isEip7702Supported: true },
  { chainId: 6343, parentChainId: 4326, name: "MegaETH Testnet", rpcUrl: "https://carrot.megaeth.com/rpc", explorer: "https://testnet-mega.etherscan.io", nativeCurrency: ETH_CURRENCY, isEip7702Supported: true },
  { chainId: 919, parentChainId: 34443, name: "Mode Testnet", rpcUrl: "https://sepolia.mode.network", explorer: "https://testnet.modescan.io", nativeCurrency: ETH_CURRENCY },
  { chainId: 10143, parentChainId: 143, name: "Monad Testnet", rpcUrl: "https://testnet-rpc.monad.xyz", explorer: "https://testnet.monadexplorer.com", nativeCurrency: { name: "Testnet MON", symbol: "MON", decimals: 18 }, isEip7702Supported: true },
  { chainId: 9746, parentChainId: 9745, name: "Plasma Testnet", rpcUrl: "https://testnet-rpc.plasma.to", explorer: "https://testnet.plasmascan.to", nativeCurrency: { name: "Testnet Plasma", symbol: "XPL", decimals: 18 } },
  { chainId: 80002, parentChainId: 137, name: "Polygon Amoy", rpcUrl: "https://polygon-amoy.drpc.org", explorer: "https://amoy.polygonscan.com", nativeCurrency: { name: "POL", symbol: "POL", decimals: 18 }, isEip7702Supported: true },
  { chainId: 46630, parentChainId: 4663, name: "Robinhood Chain Testnet", rpcUrl: "https://rpc.testnet.chain.robinhood.com/rpc", explorer: "https://explorer.testnet.chain.robinhood.com", nativeCurrency: ETH_CURRENCY, isEip7702Supported: true },
  { chainId: 534351, parentChainId: 534352, name: "Scroll Sepolia", rpcUrl: "https://scroll-sepolia.drpc.org", explorer: "https://sepolia.scrollscan.com", nativeCurrency: ETH_CURRENCY },
  { chainId: 14601, parentChainId: 146, name: "Sonic Testnet", rpcUrl: "https://rpc.testnet.soniclabs.com", explorer: "https://explorer.testnet.soniclabs.com", nativeCurrency: { name: "Sonic", symbol: "S", decimals: 18 }, isEip7702Supported: true },
  { chainId: 42431, parentChainId: 4217, name: "Tempo Moderato", rpcUrl: "https://rpc.moderato.tempo.xyz", explorer: "https://explore.testnet.tempo.xyz", nativeCurrency: { name: "USD", symbol: "USD", decimals: 6 }, isEip7702Supported: true },
  { chainId: 1301, parentChainId: 130, name: "Unichain Sepolia", rpcUrl: "https://unichain-sepolia.drpc.org", explorer: "https://sepolia.uniscan.xyz", nativeCurrency: ETH_CURRENCY, isEip7702Supported: true },
  { chainId: 4801, parentChainId: 480, name: "World Chain Sepolia", rpcUrl: "https://worldchain-sepolia.drpc.org", explorer: "https://sepolia.worldscan.org", nativeCurrency: ETH_CURRENCY },
  { chainId: 300, parentChainId: 324, name: "ZKsync Sepolia", rpcUrl: "https://zksync-sepolia.drpc.org", explorer: "https://sepolia.explorer.zksync.io", nativeCurrency: ETH_CURRENCY },
] as const;

export const TESTNET_CHAIN_REGISTRY: readonly ChainEntry[] = NATIVE_TESTNET_SPECS.map(
  (testnet) => {
    const parent = MAINNET_CHAIN_REGISTRY.find(
      (chain) => chain.chainId === testnet.parentChainId,
    );
    if (!parent) throw new Error(`Missing parent chain ${testnet.parentChainId}`);

    return {
      ...parent,
      ...testnet,
      testnetChainIds: [],
      isTestnet: true,
      hiddenByDefault: true,
      isBankrSupported: false,
      isSwapSupported: false,
      isEip7702Supported: testnet.isEip7702Supported ?? false,
      supportsFlashblocks: undefined,
      supportsSyncSend: undefined,
      coingeckoPlatformId: undefined,
      geckoTerminalNetworkId: undefined,
      viemChain: undefined,
    };
  },
);

/** Every chain that is natively available in Settings and local signing. */
export const CHAIN_REGISTRY: readonly ChainEntry[] = [
  ...MAINNET_CHAIN_REGISTRY,
  ...TESTNET_CHAIN_REGISTRY,
];

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
    logoStyle: c.logoStyle,
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
  DEFAULT_NETWORKS[c.name] = {
    chainId: c.chainId,
    rpcUrl: c.rpcUrl,
    hidden: c.hiddenByDefault ? true : undefined,
  };
}

export const ALLOWED_CHAIN_IDS = new Set(CHAIN_REGISTRY.map((c) => c.chainId));

export const BANKR_SUPPORTED_CHAIN_IDS = new Set(
  CHAIN_REGISTRY.filter((c) => c.isBankrSupported).map((c) => c.chainId)
);

// https://docs.0x.org/docs/introduction/supported-chains
export const ZEROX_SUPPORTED_CHAIN_IDS = new Set(
  CHAIN_REGISTRY.filter((c) => c.isSwapSupported).map((c) => c.chainId)
);

export const SWAP_SUPPORTED_CHAIN_IDS = ZEROX_SUPPORTED_CHAIN_IDS;

export const COINGECKO_PLATFORM_IDS: Record<number, string> = {};
for (const c of CHAIN_REGISTRY) {
  if (c.coingeckoPlatformId) {
    COINGECKO_PLATFORM_IDS[c.chainId] = c.coingeckoPlatformId;
  }
}

export const GECKOTERMINAL_NETWORK_IDS: Record<number, string> = {};
for (const c of CHAIN_REGISTRY) {
  if (c.geckoTerminalNetworkId) {
    GECKOTERMINAL_NETWORK_IDS[c.chainId] = c.geckoTerminalNetworkId;
  }
}

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

const CHAIN_IDENTITY_BY_ID = new Map<number, ChainEntry>();
for (const chain of CHAIN_REGISTRY) {
  CHAIN_IDENTITY_BY_ID.set(chain.chainId, chain);
  for (const testnetChainId of chain.testnetChainIds) {
    CHAIN_IDENTITY_BY_ID.set(testnetChainId, chain);
  }
}

/** Unknown/custom EVM chains retain the conventional native-token default. */
export function chainHasNativeToken(chainId: number): boolean {
  return CHAIN_IDENTITY_BY_ID.get(chainId)?.hasNativeToken !== false;
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
  protocol: "op-stack" | "arbitrum";
  arbitrumContracts?: {
    inbox: `0x${string}`;
    bridge: `0x${string}`;
    sequencerInbox: `0x${string}`;
  };
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

function getL1ChainName(sourceId: number): string {
  if (sourceId === 1) return "Ethereum";
  if (sourceId === 11155111) return "Sepolia";
  return `Chain ${sourceId}`;
}

function hasPortalContract(contracts: Chain["contracts"]): boolean {
  return !!contracts && "portal" in contracts && contracts.portal !== undefined;
}

for (const chain of OP_STACK_VIEM_CHAINS) {
  if (chain.sourceId && hasPortalContract(chain.contracts)) {
    FORCE_INCLUSION_CHAINS.set(chain.id, {
      viemChain: chain,
      l1ChainId: chain.sourceId,
      l1ChainName: getL1ChainName(chain.sourceId),
      protocol: "op-stack",
    });
  }
}

FORCE_INCLUSION_CHAINS.set(arbitrum.id, {
  viemChain: arbitrum,
  l1ChainId: mainnet.id,
  l1ChainName: "Ethereum",
  protocol: "arbitrum",
  arbitrumContracts: {
    inbox: "0x4Dbd4fc535Ac27206064B68FfCf827b0A60BAB3f",
    bridge: "0x8315177aB297bA92A06054cE80a67Ed4DBd7ed3a",
    sequencerInbox: "0x1c479675ad559DC151F6Ec7ed3FbF8ceE79582B6",
  },
});

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
  accountType:
    | "bankr"
    | "privateKey"
    | "seedPhrase"
    | "ledger"
    | "impersonator"
    | "safe"
    | undefined,
): boolean {
  if (
    !accountType ||
    accountType === "impersonator" ||
    accountType === "ledger" ||
    accountType === "safe"
  ) {
    return false;
  }
  const info = FORCE_INCLUSION_CHAINS.get(l2ChainId);
  if (!info) return false;
  if (info.protocol === "arbitrum") {
    return accountType === "privateKey" || accountType === "seedPhrase";
  }
  // Bankr accounts can only force-include when the L1 chain is supported by Bankr
  if (accountType === "bankr") {
    return BANKR_SUPPORTED_CHAIN_IDS.has(info.l1ChainId);
  }
  // PK/Seed broadcast L1 directly — no Bankr dependency
  return true;
}
