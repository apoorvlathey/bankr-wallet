import type { NetworksInfo, NetworkEntry } from "@/types";
import {
  CHAIN_REGISTRY,
  DEFAULT_CHAIN_CONFIG,
  ZEROX_SUPPORTED_CHAIN_IDS,
  type ChainEntry,
  type ChainLogoStyle,
} from "@/constants/chainRegistry";
import { resolveChainIconMeta } from "@/lib/chainIcons";
import { sanitizeCustomExplorerUrl } from "@/lib/externalNavigation";

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
  logoStyle?: ChainLogoStyle;
  iconOverlayLabel?: string;
  bg: string;
  border: string;
  text: string;
  isBankrSupported: boolean;
  isSwapSupported: boolean;
  isOpStack: boolean;
}

const DEFAULT_NATIVE_CURRENCY = { name: "Ether", symbol: "ETH", decimals: 18 };
export const MAX_SAVED_RPC_URLS = 10;
export const MAX_RPC_ENDPOINT_NAME_LENGTH = 64;
export const NETWORK_RPC_URLS_STORAGE_KEY = "networkRpcUrls";

export interface SavedRpcEndpoint {
  url: string;
  name?: string;
}
const CHAIN_BY_ID = new Map<number, ChainEntry>(
  CHAIN_REGISTRY.map((chain) => [chain.chainId, chain]),
);

export function normalizeRpcUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 2_048) return null;

  try {
    const parsed = new URL(trimmed);
    if (
      (parsed.protocol !== "https:" && parsed.protocol !== "http:") ||
      parsed.username ||
      parsed.password
    ) {
      return null;
    }
    return trimmed.replace(/\/+$/, "");
  } catch {
    return null;
  }
}

export function normalizeRpcEndpointName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, MAX_RPC_ENDPOINT_NAME_LENGTH) : null;
}

export function normalizeSavedRpcEndpoints(
  activeRpcUrl: unknown,
  savedRpcEndpoints: unknown,
): SavedRpcEndpoint[] {
  const candidates: unknown[] = [
    activeRpcUrl,
    ...(Array.isArray(savedRpcEndpoints) ? savedRpcEndpoints : []),
  ];
  const normalized: SavedRpcEndpoint[] = [];

  for (const candidate of candidates) {
    const endpoint =
      candidate && typeof candidate === "object" && !Array.isArray(candidate)
        ? (candidate as { url?: unknown; name?: unknown })
        : { url: candidate, name: undefined };
    const url = normalizeRpcUrl(endpoint.url);
    if (!url) continue;

    const name = normalizeRpcEndpointName(endpoint.name) ?? undefined;
    const existing = normalized.find((saved) => saved.url === url);
    if (existing) {
      if (!existing.name && name) existing.name = name;
      continue;
    }

    normalized.push({ url, ...(name ? { name } : {}) });
    if (normalized.length === MAX_SAVED_RPC_URLS) break;
  }

  return normalized;
}

export function normalizeSavedRpcUrls(
  activeRpcUrl: unknown,
  savedRpcUrls: unknown,
): string[] {
  return normalizeSavedRpcEndpoints(activeRpcUrl, savedRpcUrls).map(
    (endpoint) => endpoint.url,
  );
}

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
      // A stored entry represents an existing user choice. Only apply the
      // registry default when this built-in chain has never been persisted.
      hidden: stored ? stored.hidden : chain.hiddenByDefault ? true : undefined,
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
      explorer:
        sanitizeCustomExplorerUrl(entry.explorer)?.replace(/\/+$/, "") ||
        undefined,
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
        logoStyle: iconMeta.logoStyle,
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

export interface NativeAssetMeta {
  name: string;
  symbol: string;
  decimals: number;
  logoUrl: string;
  chainName: string;
}

export const ETH_NATIVE_ASSET_LOGO_URL = "/chainIcons/ethereum.svg";

export function getNativeAssetLogoUrl(
  symbol: string | undefined,
  chainIcon: string | null | undefined,
): string {
  return symbol?.toUpperCase() === "ETH"
    ? ETH_NATIVE_ASSET_LOGO_URL
    : chainIcon || "";
}

/**
 * Centralized native-asset resolver. Use this anywhere code needs a native
 * token's symbol / name / decimals / logo (Send page, Swap/Bridge selectors,
 * confirmation surfaces, tx history, etc.) so custom-added chains stay
 * consistent with built-ins and the logo always falls back to the chain icon
 * for non-ETH natives (AVAX, BNB, POL, …).
 *
 * Returns null only when the chain itself can't be resolved.
 */
export function getNativeAssetMeta(
  chainId: number,
  networksInfo: NetworksInfo | undefined,
): NativeAssetMeta | null {
  const chain = getResolvedChainById(chainId, networksInfo);
  if (!chain) return null;
  const symbol = chain.nativeCurrency.symbol;
  return {
    name: chain.nativeCurrency.name,
    symbol,
    decimals: chain.nativeCurrency.decimals,
    logoUrl: getNativeAssetLogoUrl(symbol, chain.icon),
    chainName: chain.name,
  };
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
