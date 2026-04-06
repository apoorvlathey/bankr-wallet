import type { NetworksInfo, NetworkEntry } from "@/types";
import {
  CHAIN_REGISTRY,
  DEFAULT_CHAIN_CONFIG,
  ZEROX_SUPPORTED_CHAIN_IDS,
  type ChainEntry,
} from "@/constants/chainRegistry";
import { resolveChainIconMeta } from "@/lib/chainIcons";

export type ChainAccountType =
  | "bankr"
  | "privateKey"
  | "seedPhrase"
  | "impersonator";

export interface ResolvedChain {
  name: string;
  chainId: number;
  rpcUrl: string;
  explorer: string;
  hidden: boolean;
  isCustom: boolean;
  nativeCurrency: { name: string; symbol: string; decimals: number };
  icon: string;
  iconOverlayLabel?: string;
  bg: string;
  border: string;
  text: string;
  isBankrSupported: boolean;
  isSwapSupported: boolean;
  isOpStack: boolean;
}

const DEFAULT_NATIVE_CURRENCY = { name: "Ether", symbol: "ETH", decimals: 18 };
const CHAIN_BY_ID = new Map<number, ChainEntry>(
  CHAIN_REGISTRY.map((chain) => [chain.chainId, chain]),
);

function getStoredEntryForRegistryChain(
  networksInfo: NetworksInfo | undefined,
  registryChain: ChainEntry,
): NetworkEntry | undefined {
  if (!networksInfo) return undefined;

  const canonicalEntry = networksInfo[registryChain.name];
  if (canonicalEntry?.chainId === registryChain.chainId) {
    return canonicalEntry;
  }

  // Match by chain ID so built-in chain RPC overrides survive even if an older
  // UI flow temporarily wrote them under a non-canonical name.
  return Object.values(networksInfo).find(
    (entry) => entry.chainId === registryChain.chainId,
  );
}

/**
 * Normalize `networksInfo` into a canonical shape derived from `CHAIN_REGISTRY`.
 *
 * Why this exists:
 * `CHAIN_REGISTRY` is the single source of truth for built-in chains. Runtime
 * storage should only carry user overrides such as RPC changes, hidden flags,
 * and custom chains. If every screen re-merges registry + storage slightly
 * differently, custom-chain support inevitably drifts.
 */
export function normalizeNetworksInfo(
  networksInfo: NetworksInfo | undefined,
): NetworksInfo {
  const normalized: NetworksInfo = {};
  const consumedKeys = new Set<string>();

  for (const chain of CHAIN_REGISTRY) {
    const stored = getStoredEntryForRegistryChain(networksInfo, chain);
    const storedKey = stored
      ? Object.entries(networksInfo ?? {}).find(([, entry]) => entry === stored)?.[0]
      : undefined;

    if (storedKey) consumedKeys.add(storedKey);

    normalized[chain.name] = {
      chainId: chain.chainId,
      rpcUrl: stored?.rpcUrl ?? chain.rpcUrl,
      hidden: stored?.hidden,
    };
  }

  for (const [name, entry] of Object.entries(networksInfo ?? {})) {
    if (consumedKeys.has(name)) continue;
    if (CHAIN_BY_ID.has(entry.chainId)) {
      // Built-in chains are always keyed by their registry name so we never end
      // up with two labels for the same chain ID.
      continue;
    }

    normalized[name] = {
      chainId: entry.chainId,
      rpcUrl: entry.rpcUrl,
      isCustom: true,
      hidden: entry.hidden,
      explorer: entry.explorer?.replace(/\/+$/, "") || undefined,
      nativeCurrency: entry.nativeCurrency ?? DEFAULT_NATIVE_CURRENCY,
    };
  }

  return normalized;
}

export function getResolvedChains(
  networksInfo: NetworksInfo | undefined,
): ResolvedChain[] {
  return Object.entries(normalizeNetworksInfo(networksInfo)).map(
    ([name, entry]) => {
      const builtIn = CHAIN_BY_ID.get(entry.chainId);
      const resolvedName = builtIn?.name ?? name;
      const iconMeta = resolveChainIconMeta(entry.chainId, resolvedName);
      const config = builtIn
        ? {
            icon: iconMeta.iconSrc ?? builtIn.icon,
            bg: iconMeta.bg,
            border: iconMeta.border,
            text: iconMeta.text,
          }
        : {
            icon: iconMeta.iconSrc ?? DEFAULT_CHAIN_CONFIG.icon,
            bg: iconMeta.bg,
            border: iconMeta.border,
            text: iconMeta.text,
          };

      return {
        name: resolvedName,
        chainId: entry.chainId,
        rpcUrl: entry.rpcUrl || builtIn?.rpcUrl || "",
        explorer: entry.explorer ?? builtIn?.explorer ?? "",
        hidden: entry.hidden === true,
        isCustom: entry.isCustom === true || !builtIn,
        nativeCurrency: entry.nativeCurrency ?? builtIn?.nativeCurrency ?? DEFAULT_NATIVE_CURRENCY,
        icon: config.icon,
        iconOverlayLabel: iconMeta.overlayLabel,
        bg: config.bg,
        border: config.border,
        text: config.text,
        isBankrSupported: builtIn?.isBankrSupported ?? false,
        isSwapSupported: builtIn?.isSwapSupported ?? ZEROX_SUPPORTED_CHAIN_IDS.has(entry.chainId),
        isOpStack: builtIn?.isOpStack ?? false,
      };
    },
  );
}

export function getVisibleChains(
  networksInfo: NetworksInfo | undefined,
  accountType?: ChainAccountType | null,
): ResolvedChain[] {
  return getResolvedChains(networksInfo).filter((chain) => {
    if (chain.hidden) return false;
    if (accountType === "bankr") return chain.isBankrSupported;
    return true;
  });
}

export function getResolvedChainByName(
  chainName: string | undefined,
  networksInfo: NetworksInfo | undefined,
): ResolvedChain | undefined {
  if (!chainName) return undefined;
  return getResolvedChains(networksInfo).find((chain) => chain.name === chainName);
}

export function getResolvedChainById(
  chainId: number,
  networksInfo: NetworksInfo | undefined,
): ResolvedChain | undefined {
  return getResolvedChains(networksInfo).find((chain) => chain.chainId === chainId);
}

export function getDefaultChainName(
  networksInfo: NetworksInfo | undefined,
  accountType?: ChainAccountType | null,
): string {
  return getVisibleChains(networksInfo, accountType)[0]?.name ?? "Base";
}

export async function getStoredNetworksInfo(): Promise<NetworksInfo> {
  const { networksInfo } = (await chrome.storage.sync.get("networksInfo")) as {
    networksInfo?: NetworksInfo;
  };
  return normalizeNetworksInfo(networksInfo);
}

export async function getStoredResolvedChainById(
  chainId: number,
): Promise<ResolvedChain | undefined> {
  return getResolvedChainById(chainId, await getStoredNetworksInfo());
}

export async function getStoredRpcUrl(
  chainId: number,
): Promise<string | undefined> {
  return (await getStoredResolvedChainById(chainId))?.rpcUrl;
}

export async function getStoredChainName(chainId: number): Promise<string> {
  return (await getStoredResolvedChainById(chainId))?.name ?? `Chain ${chainId}`;
}

export async function getStoredExplorerUrl(chainId: number): Promise<string> {
  return (await getStoredResolvedChainById(chainId))?.explorer ?? "";
}

export async function getStoredNativeCurrencySymbol(
  chainId: number,
): Promise<string> {
  return (
    (await getStoredResolvedChainById(chainId))?.nativeCurrency.symbol ?? "ETH"
  );
}
