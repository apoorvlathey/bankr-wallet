import dappsData from "./dapps.json";

export interface DappEntry {
  id: number;
  name: string;
  description: string;
  url: string;
  iconUrl: string;
  chains: number[];
  categories?: string[];
  /** true = tested & auto-connects, false = tested & does NOT, undefined = untested */
  autoConnect?: boolean;
  /** If set, the app is temporarily disabled — shows a warning instead of loading the iframe */
  disabled?: { reason: string; link?: string };
}

/** Ordered list of categories for the filter bar */
export const CATEGORIES = [
  "swap",
  "yield",
  "staking",
  "bridge",
  "leverage",
  "tools",
  "insurance",
  "social",
] as const;

export type Category = (typeof CATEGORIES)[number];

/** Display names for categories */
export const CATEGORY_LABELS: Record<string, string> = {
  swap: "Swap",
  yield: "Yield",
  staking: "Staking",
  bridge: "Bridge",
  leverage: "Leverage",
  tools: "Tools",
  insurance: "Insurance",
  social: "Social",
};

/** Category colors: [bg, text] */
export const CATEGORY_COLORS: Record<string, [string, string]> = {
  swap: ["#1040C0", "#FFFFFF"],       // Bauhaus blue
  yield: ["#0B8A3E", "#FFFFFF"],      // Green
  staking: ["#7C3AED", "#FFFFFF"],    // Purple
  bridge: ["#F0C020", "#121212"],     // Bauhaus yellow
  leverage: ["#D02020", "#FFFFFF"],    // Bauhaus red
  tools: ["#64748B", "#FFFFFF"],      // Slate
  insurance: ["#DB2777", "#FFFFFF"],  // Pink
  social: ["#6366F1", "#FFFFFF"],     // Indigo
};

/** Chains hidden from the UI (stripped from dapp entries and filters) */
const HIDDEN_CHAINS = new Set([
  7777777, // Zora
  369, // PulseChain
]);

/** Temporarily disabled apps — keyed by dapp ID */
const DISABLED_APPS: Record<number, DappEntry["disabled"]> = {};

export const DAPPS: DappEntry[] = dappsData.map((dapp) => ({
  ...dapp,
  chains: dapp.chains.filter((c) => !HIDDEN_CHAINS.has(c)),
  ...(DISABLED_APPS[dapp.id] ? { disabled: DISABLED_APPS[dapp.id] } : {}),
}));

export const CHAIN_NAMES: Record<number, string> = {
  1: "Ethereum",
  8453: "Base",
  137: "Polygon",
  130: "Unichain",
  42161: "Arbitrum",
  10: "Optimism",
  56: "BSC",
  43114: "Avalanche",
  42220: "Celo",
  100: "Gnosis",
  57073: "Ink",
  369: "PulseChain",
  1868: "Soneium",
  146: "Sonic",
  4326: "MegaETH",
};

/** Brand colors for each chain (used for geometric chain indicators) */
export const CHAIN_COLORS: Record<number, string> = {
  1: "#627EEA", // Ethereum blue
  8453: "#0052FF", // Base blue
  137: "#8247E5", // Polygon purple
  130: "#F50DB4", // Unichain pink
  42161: "#28A0F0", // Arbitrum blue
  10: "#FF0420", // Optimism red
  56: "#F0B90B", // BSC yellow
  43114: "#E84142", // Avalanche red
  42220: "#FCFF52", // Celo green-yellow
  100: "#04795B", // Gnosis green
  57073: "#7C3AED", // Ink purple
  369: "#00CC8E", // PulseChain green
  1868: "#1040C0", // Soneium blue
  146: "#19E97F", // Sonic green
  4326: "#D02020", // MegaETH red
};

export function getChainColor(chainId: number): string {
  return CHAIN_COLORS[chainId] || "#888";
}

/** Returns "white" or "black" for readable text on the chain's brand color */
export function getChainTextColor(chainId: number): string {
  const hex = getChainColor(chainId).replace("#", "");
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  // Relative luminance (perceived brightness)
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.55 ? "#121212" : "white";
}

/** SVG icons available in /public/images/ for select chains */
// source: https://github.com/rainbow-me/rainbowkit/tree/main/packages/rainbowkit/src/components/RainbowKitProvider/chainIcons
export const CHAIN_ICONS: Record<number, string> = {
  1: "/images/ethereum.svg",
  8453: "/images/base.svg",
  137: "/images/polygon.svg",
  130: "/images/unichain.svg",
  4326: "/images/megaeth.svg",
  42161: "/images/arbitrum.svg",
  43114: "/images/avalanche.svg",
  56: "/images/bsc.svg",
  42220: "/images/celo.svg",
  100: "/images/gnosis.svg",
  57073: "/images/ink.svg",
  10: "/images/optimism.svg",
  146: "/images/sonic.png",
  1868: "/images/soneium.webp",
};
