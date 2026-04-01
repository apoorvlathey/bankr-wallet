import { CHAIN_REGISTRY, DEFAULT_CHAIN_CONFIG } from "@/constants/chainRegistry";

export interface ResolvedChainIconMeta {
  iconSrc?: string;
  overlayLabel?: string;
  fallbackText: string;
  bg: string;
  border: string;
  text: string;
}

interface ChainIconAlias {
  chainIds?: number[];
  names?: string[];
  iconSrc?: string;
  overlayLabel?: string;
  bg: string;
  border: string;
  text: string;
}

const REGISTRY_BY_ID = new Map(CHAIN_REGISTRY.map((chain) => [chain.chainId, chain]));

const CHAIN_ICON_ALIASES: ChainIconAlias[] = [
  {
    chainIds: [84532],
    names: ["base sepolia", "base sepolia testnet"],
    iconSrc: "/chainIcons/base.svg",
    overlayLabel: "SEP",
    bg: "rgba(0, 82, 255, 0.15)",
    border: "rgba(0, 82, 255, 0.4)",
    text: "#0052FF",
  },
  {
    chainIds: [11155111],
    names: ["sepolia", "ethereum sepolia", "sepolia testnet"],
    iconSrc: "/chainIcons/ethereum.svg",
    overlayLabel: "SEP",
    bg: "rgba(37, 41, 46, 0.15)",
    border: "rgba(37, 41, 46, 0.4)",
    text: "#25292E",
  },
  {
    chainIds: [421614],
    names: ["arbitrum sepolia"],
    iconSrc: "/chainIcons/arbitrum.svg",
    overlayLabel: "SEP",
    bg: "rgba(40, 160, 240, 0.15)",
    border: "rgba(40, 160, 240, 0.4)",
    text: "#28A0F0",
  },
  {
    chainIds: [43114],
    names: ["avalanche", "avalanche c-chain", "avalanche c chain"],
    iconSrc: "/chainIcons/avalanche.svg",
    bg: "rgba(232, 65, 66, 0.15)",
    border: "rgba(232, 65, 66, 0.4)",
    text: "#E84142",
  },
  {
    chainIds: [43113],
    names: ["avalanche fuji", "fuji", "fuji testnet"],
    iconSrc: "/chainIcons/avalanche.svg",
    overlayLabel: "FUJI",
    bg: "rgba(232, 65, 66, 0.15)",
    border: "rgba(232, 65, 66, 0.4)",
    text: "#E84142",
  },
  {
    names: ["apechain"],
    iconSrc: "/chainIcons/apechain.svg",
    bg: "rgba(36, 40, 43, 0.12)",
    border: "rgba(36, 40, 43, 0.28)",
    text: "#24282B",
  },
  {
    names: ["berachain", "bera"],
    iconSrc: "/chainIcons/berachain.svg",
    bg: "rgba(247, 190, 74, 0.16)",
    border: "rgba(247, 190, 74, 0.4)",
    text: "#7F5700",
  },
  {
    names: ["blast"],
    iconSrc: "/chainIcons/blast.svg",
    bg: "rgba(252, 252, 3, 0.18)",
    border: "rgba(140, 140, 0, 0.32)",
    text: "#7A6A00",
  },
  {
    names: ["celo"],
    iconSrc: "/chainIcons/celo.svg",
    bg: "rgba(53, 211, 167, 0.16)",
    border: "rgba(53, 211, 167, 0.38)",
    text: "#157C64",
  },
  {
    names: ["gnosis", "gnosis chain", "xdai"],
    iconSrc: "/chainIcons/gnosis.svg",
    bg: "rgba(0, 153, 132, 0.16)",
    border: "rgba(0, 153, 132, 0.36)",
    text: "#006B5C",
  },
  {
    names: ["hyperevm", "hyper evm"],
    iconSrc: "/chainIcons/hyperevm.svg",
    bg: "rgba(18, 18, 18, 0.08)",
    border: "rgba(18, 18, 18, 0.22)",
    text: "#121212",
  },
  {
    names: ["ink"],
    iconSrc: "/chainIcons/ink.svg",
    bg: "rgba(18, 18, 18, 0.08)",
    border: "rgba(18, 18, 18, 0.22)",
    text: "#121212",
  },
  {
    names: ["linea"],
    iconSrc: "/chainIcons/linea.svg",
    bg: "rgba(18, 18, 18, 0.08)",
    border: "rgba(18, 18, 18, 0.22)",
    text: "#121212",
  },
  {
    chainIds: [5000],
    names: ["mantle", "mantle mainnet"],
    iconSrc: "/chainIcons/mantle.svg",
    bg: "rgba(18, 18, 18, 0.12)",
    border: "rgba(18, 18, 18, 0.28)",
    text: "#121212",
  },
  {
    chainIds: [143, 41454],
    names: ["monad", "monad testnet"],
    iconSrc: "/chainIcons/monad.svg",
    bg: "rgba(18, 18, 18, 0.08)",
    border: "rgba(18, 18, 18, 0.18)",
    text: "#121212",
  },
  {
    names: ["optimism", "op mainnet"],
    iconSrc: "/chainIcons/optimism.svg",
    bg: "rgba(255, 4, 32, 0.12)",
    border: "rgba(255, 4, 32, 0.32)",
    text: "#D8001D",
  },
  {
    names: ["zksync", "zksync era", "zk sync", "zksync era mainnet"],
    iconSrc: "/chainIcons/zksync.svg",
    bg: "rgba(123, 97, 255, 0.14)",
    border: "rgba(123, 97, 255, 0.34)",
    text: "#4E41D9",
  },
  {
    chainIds: [1699],
    names: ["tempo", "tempo mainnet"],
    bg: "rgba(18, 18, 18, 0.1)",
    border: "rgba(18, 18, 18, 0.25)",
    text: "#121212",
  },
];

const FALLBACK_PALETTE = [
  { bg: "rgba(240, 192, 32, 0.16)", border: "rgba(240, 192, 32, 0.4)", text: "#7A5A00" },
  { bg: "rgba(16, 64, 192, 0.12)", border: "rgba(16, 64, 192, 0.32)", text: "#1040C0" },
  { bg: "rgba(208, 32, 32, 0.12)", border: "rgba(208, 32, 32, 0.32)", text: "#B01616" },
  { bg: "rgba(18, 18, 18, 0.08)", border: "rgba(18, 18, 18, 0.22)", text: "#121212" },
];

function normalizeChainName(name: string | undefined): string {
  return (name ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash;
}

export function getChainInitials(name: string | undefined): string {
  if (!name || !name.trim()) return "CH";
  const words = name.split(/[\s\-_]+/).filter(Boolean);
  if (words.length >= 2) {
    return (words[0][0] + words[1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

function findAlias(chainId: number, chainName?: string): ChainIconAlias | undefined {
  const normalizedName = normalizeChainName(chainName);

  const byId = CHAIN_ICON_ALIASES.find((alias) => alias.chainIds?.includes(chainId));
  if (byId) return byId;

  return CHAIN_ICON_ALIASES.find((alias) =>
    alias.names?.some((name) => normalizedName === name || normalizedName.includes(name)),
  );
}

function inferOverlayLabel(chainName: string | undefined): string | undefined {
  const normalizedName = normalizeChainName(chainName);
  if (!normalizedName) return undefined;
  if (normalizedName.includes("sepolia")) return "SEP";
  if (normalizedName.includes("fuji")) return "FUJI";
  if (normalizedName.includes("testnet")) return "T";
  return undefined;
}

export function resolveChainIconMeta(
  chainId: number,
  chainName?: string,
): ResolvedChainIconMeta {
  const builtIn = REGISTRY_BY_ID.get(chainId);
  if (builtIn) {
    return {
      iconSrc: builtIn.icon || undefined,
      fallbackText: getChainInitials(chainName || builtIn.name),
      bg: builtIn.bg,
      border: builtIn.border,
      text: builtIn.text,
    };
  }

  const alias = findAlias(chainId, chainName);
  if (alias) {
    return {
      iconSrc: alias.iconSrc,
      overlayLabel: alias.overlayLabel ?? inferOverlayLabel(chainName),
      fallbackText: getChainInitials(chainName),
      bg: alias.bg,
      border: alias.border,
      text: alias.text,
    };
  }

  const fallback = FALLBACK_PALETTE[hashString(`${chainId}:${chainName ?? ""}`) % FALLBACK_PALETTE.length];
  return {
    iconSrc: DEFAULT_CHAIN_CONFIG.icon || undefined,
    overlayLabel: inferOverlayLabel(chainName),
    fallbackText: getChainInitials(chainName),
    bg: fallback.bg,
    border: fallback.border,
    text: fallback.text,
  };
}
