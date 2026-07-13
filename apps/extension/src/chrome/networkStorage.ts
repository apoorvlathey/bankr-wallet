import type { NetworkEntry, NetworksInfo } from "@/types";
import { DEFAULT_NETWORKS } from "@/constants/networks";
import {
  getResolvedChainById,
  getVisibleChains,
  normalizeNetworksInfo,
  type ChainAccountType,
} from "@/lib/chains";
import { withStorageLock } from "./storageLock";
import {
  assertRpcEndpointAllowedForOrigin,
  assertSecureRpcConfigurationUrl,
} from "./rpcHttpClient";
import {
  sanitizeCustomExplorerUrl,
  sanitizeExternalNavigationUrl,
} from "@/lib/externalNavigation";

const NETWORKS_INFO_LOCK_KEY = "sync:networksInfo";

type NetworkMutationSuccess = {
  success: true;
  networksInfo: NetworksInfo;
  chainName: string;
  chainId: number;
  existed?: boolean;
  fallbackChainName?: string;
  shouldSwitch?: boolean;
};

type NetworkMutationFailure = {
  success: false;
  error: string;
  networksInfo?: NetworksInfo;
};

export type NetworkMutationResult =
  | NetworkMutationSuccess
  | NetworkMutationFailure;

type NetworkState = {
  networksInfo: NetworksInfo;
  storedNetworksInfo?: NetworksInfo;
  chainName?: string;
};

function cleanChainName(chainName: unknown): string {
  if (typeof chainName !== "string") {
    throw new Error("Chain name is required.");
  }
  const trimmed = chainName.trim();
  if (!trimmed) {
    throw new Error("Chain name is required.");
  }
  if (trimmed.length > 100) {
    throw new Error("Chain name is too long.");
  }
  return trimmed;
}

function cleanHttpUrl(
  value: unknown,
  field: "RPC" | "Explorer",
  required: boolean,
): string | undefined {
  const trimmed = typeof value === "string" ? value.trim() : "";
  if (!trimmed) {
    if (required) throw new Error(`${field} URL is required.`);
    return undefined;
  }
  if (trimmed.length > 2_048) {
    throw new Error(`${field} URL is too long.`);
  }
  try {
    const parsed = new URL(trimmed);
    if (
      (parsed.protocol !== "https:" && parsed.protocol !== "http:") ||
      parsed.username ||
      parsed.password
    ) {
      throw new Error();
    }
    if (field === "Explorer" && !sanitizeCustomExplorerUrl(trimmed)) {
      throw new Error();
    }
  } catch {
    if (field === "Explorer") {
      throw new Error(
        "Explorer URL must use public HTTPS (or HTTP(S) localhost) without embedded credentials.",
      );
    }
    throw new Error(
      `${field} URL must use HTTP or HTTPS without embedded credentials.`,
    );
  }
  return trimmed.replace(/\/+$/, "");
}

function cleanNetworkEntry(entry: unknown, requestOrigin?: string): NetworkEntry {
  if (!entry || typeof entry !== "object") {
    throw new Error("Network details are required.");
  }

  const candidate = entry as Partial<NetworkEntry>;
  const chainId = Number(candidate.chainId);
  const rpcUrl = cleanHttpUrl(candidate.rpcUrl, "RPC", true)!;
  assertSecureRpcConfigurationUrl(rpcUrl);
  if (requestOrigin) {
    assertRpcEndpointAllowedForOrigin(rpcUrl, requestOrigin);
  }

  if (!Number.isSafeInteger(chainId) || chainId <= 0) {
    throw new Error("Valid chain ID is required.");
  }

  const nativeName = candidate.nativeCurrency?.name?.trim();
  const nativeSymbol = candidate.nativeCurrency?.symbol?.trim();
  const nativeDecimals = candidate.nativeCurrency?.decimals;
  if (
    (nativeName !== undefined && (!nativeName || nativeName.length > 100)) ||
    (nativeSymbol !== undefined &&
      (!nativeSymbol || nativeSymbol.length > 11)) ||
    (nativeDecimals !== undefined &&
      (!Number.isInteger(Number(nativeDecimals)) ||
        Number(nativeDecimals) < 0 ||
        Number(nativeDecimals) > 255))
  ) {
    throw new Error("Native currency metadata is invalid.");
  }

  const explorer = cleanHttpUrl(candidate.explorer, "Explorer", false);
  if (requestOrigin && explorer && !sanitizeExternalNavigationUrl(explorer)) {
    throw new Error("Dapp-proposed explorer URL must use public HTTPS.");
  }

  return {
    chainId,
    rpcUrl,
    isCustom: candidate.isCustom === true,
    hidden: candidate.hidden === true ? true : undefined,
    explorer,
    nativeCurrency: candidate.nativeCurrency
      ? {
          name: nativeName || nativeSymbol || "ETH",
          symbol: nativeSymbol || "ETH",
          decimals: nativeDecimals === undefined ? 18 : Number(nativeDecimals),
        }
      : undefined,
  };
}

async function getNetworkState(): Promise<NetworkState> {
  const { networksInfo, chainName } = (await chrome.storage.sync.get([
    "networksInfo",
    "chainName",
  ])) as {
    networksInfo?: NetworksInfo;
    chainName?: string;
  };

  return {
    networksInfo: normalizeNetworksInfo(networksInfo ?? DEFAULT_NETWORKS),
    storedNetworksInfo: networksInfo,
    chainName,
  };
}

async function writeNetworkState(
  networksInfo: NetworksInfo,
  extraUpdates: Record<string, unknown> = {},
): Promise<NetworksInfo> {
  const normalized = normalizeNetworksInfo(networksInfo);
  await chrome.storage.sync.set({
    networksInfo: normalized,
    ...extraUpdates,
  });
  return normalized;
}

function findChainNameById(
  networksInfo: NetworksInfo,
  chainId: number,
): string | undefined {
  return Object.entries(networksInfo).find(
    ([, entry]) => entry.chainId === chainId,
  )?.[0];
}

function getFallbackChainName(
  networksInfo: NetworksInfo,
  accountType: ChainAccountType | null | undefined,
  excludedChainName?: string,
): string | null {
  const visibleChains = getVisibleChains(networksInfo, accountType).filter(
    (chain) => chain.name !== excludedChainName,
  );
  return visibleChains[0]?.name ?? null;
}

function failure(error: unknown, networksInfo?: NetworksInfo): NetworkMutationFailure {
  return {
    success: false,
    error: error instanceof Error ? error.message : String(error),
    networksInfo,
  };
}

export async function ensureNetworksInfo(): Promise<NetworkMutationResult> {
  return withStorageLock(NETWORKS_INFO_LOCK_KEY, async () => {
    try {
      const state = await getNetworkState();
      const normalized = state.networksInfo;
      if (
        !state.storedNetworksInfo ||
        JSON.stringify(state.storedNetworksInfo) !== JSON.stringify(normalized)
      ) {
        await writeNetworkState(normalized);
      }
      return {
        success: true,
        networksInfo: normalized,
        chainName: state.chainName || getFallbackChainName(normalized, null) || "Base",
        chainId: getVisibleChains(normalized)[0]?.chainId ?? 8453,
      };
    } catch (error) {
      return failure(error);
    }
  });
}

export async function addNetworkIfMissing({
  chainName,
  entry,
  switchIfSupportedForAccountType,
  requestOrigin,
}: {
  chainName: unknown;
  entry: unknown;
  switchIfSupportedForAccountType?: ChainAccountType | null;
  /** Trusted sender origin for a dapp-proposed network. */
  requestOrigin?: string;
}): Promise<NetworkMutationResult> {
  return withStorageLock(NETWORKS_INFO_LOCK_KEY, async () => {
    try {
      const name = cleanChainName(chainName);
      const cleanedEntry = cleanNetworkEntry(entry, requestOrigin);
      const { networksInfo } = await getNetworkState();
      const existingName = findChainNameById(networksInfo, cleanedEntry.chainId);

      if (networksInfo[name] && networksInfo[name].chainId !== cleanedEntry.chainId) {
        return failure(`Chain name "${name}" already exists.`, networksInfo);
      }

      const nextNetworksInfo = existingName
        ? networksInfo
        : normalizeNetworksInfo({
            ...networksInfo,
            [name]: {
              ...cleanedEntry,
              isCustom: true,
            },
          });

      const resolvedName = existingName || name;
      const resolvedChain = getResolvedChainById(
        cleanedEntry.chainId,
        nextNetworksInfo,
      );
      const shouldSwitch =
        switchIfSupportedForAccountType !== undefined &&
        (switchIfSupportedForAccountType !== "bankr" ||
          resolvedChain?.isBankrSupported === true);

      const normalized = existingName
        ? nextNetworksInfo
        : await writeNetworkState(nextNetworksInfo, shouldSwitch ? { chainName: resolvedName } : {});

      if (existingName && shouldSwitch) {
        await chrome.storage.sync.set({ chainName: resolvedName });
      }

      return {
        success: true,
        networksInfo: normalized,
        chainName: resolvedName,
        chainId: cleanedEntry.chainId,
        existed: !!existingName,
        shouldSwitch,
      };
    } catch (error) {
      return failure(error);
    }
  });
}

export async function updateNetworkEntry({
  chainName,
  nextChainName,
  entry,
}: {
  chainName: unknown;
  nextChainName: unknown;
  entry: unknown;
}): Promise<NetworkMutationResult> {
  return withStorageLock(NETWORKS_INFO_LOCK_KEY, async () => {
    try {
      const currentName = cleanChainName(chainName);
      const requestedNextName = cleanChainName(nextChainName);
      const cleanedEntry = cleanNetworkEntry(entry);
      const { networksInfo, chainName: activeChainName } = await getNetworkState();
      const current = networksInfo[currentName];

      if (!current) {
        return failure("Network not found.", networksInfo);
      }

      const isCustom = current.isCustom === true;
      const savedName = isCustom ? requestedNextName : currentName;
      const existingByName = networksInfo[savedName];

      if (savedName !== currentName && existingByName) {
        return failure(`Chain name "${savedName}" already exists.`, networksInfo);
      }

      const existingByChainId = findChainNameById(networksInfo, cleanedEntry.chainId);
      if (existingByChainId && existingByChainId !== currentName) {
        return failure(
          `Chain ID ${cleanedEntry.chainId} already exists as "${existingByChainId}".`,
          networksInfo,
        );
      }

      const savedEntry: NetworkEntry = isCustom
        ? {
            ...cleanedEntry,
            isCustom: true,
            hidden: current.hidden,
          }
        : {
            chainId: current.chainId,
            rpcUrl: cleanedEntry.rpcUrl,
            hidden: current.hidden,
          };

      const nextNetworksInfo = { ...networksInfo };
      if (savedName !== currentName) {
        delete nextNetworksInfo[currentName];
      }
      nextNetworksInfo[savedName] = savedEntry;

      const updates =
        activeChainName === currentName && savedName !== currentName
          ? { chainName: savedName }
          : {};
      const normalized = await writeNetworkState(nextNetworksInfo, updates);

      return {
        success: true,
        networksInfo: normalized,
        chainName: savedName,
        chainId: savedEntry.chainId,
      };
    } catch (error) {
      return failure(error);
    }
  });
}

export async function setNetworkHiddenState({
  chainName,
  hidden,
  activeAccountType,
}: {
  chainName: unknown;
  hidden: unknown;
  activeAccountType?: ChainAccountType | null;
}): Promise<NetworkMutationResult> {
  return withStorageLock(NETWORKS_INFO_LOCK_KEY, async () => {
    try {
      const name = cleanChainName(chainName);
      const shouldHide = hidden === true;
      const { networksInfo, chainName: activeChainName } = await getNetworkState();
      const current = networksInfo[name];

      if (!current) {
        return failure("Network not found.", networksInfo);
      }

      const nextNetworksInfo = normalizeNetworksInfo({
        ...networksInfo,
        [name]: {
          ...current,
          hidden: shouldHide ? true : undefined,
        },
      });

      let fallbackChainName: string | null = null;
      if (shouldHide && activeChainName === name) {
        fallbackChainName = getFallbackChainName(
          nextNetworksInfo,
          activeAccountType,
          name,
        );
        if (!fallbackChainName) {
          return failure(
            "This is the last visible chain for the current account.",
            networksInfo,
          );
        }
      }

      const normalized = await writeNetworkState(
        nextNetworksInfo,
        fallbackChainName ? { chainName: fallbackChainName } : {},
      );

      return {
        success: true,
        networksInfo: normalized,
        chainName: name,
        chainId: current.chainId,
        fallbackChainName: fallbackChainName ?? undefined,
      };
    } catch (error) {
      return failure(error);
    }
  });
}

export async function deleteNetworkEntry({
  chainName,
  activeAccountType,
}: {
  chainName: unknown;
  activeAccountType?: ChainAccountType | null;
}): Promise<NetworkMutationResult> {
  return withStorageLock(NETWORKS_INFO_LOCK_KEY, async () => {
    try {
      const name = cleanChainName(chainName);
      const { networksInfo, chainName: activeChainName } = await getNetworkState();
      const current = networksInfo[name];

      if (!current) {
        return failure("Network not found.", networksInfo);
      }
      if (current.isCustom !== true) {
        return failure("Built-in chains cannot be deleted.", networksInfo);
      }

      const nextNetworksInfo = { ...networksInfo };
      delete nextNetworksInfo[name];
      const normalizedNext = normalizeNetworksInfo(nextNetworksInfo);

      let fallbackChainName: string | null = null;
      if (activeChainName === name) {
        fallbackChainName = getFallbackChainName(
          normalizedNext,
          activeAccountType,
          name,
        );
        if (!fallbackChainName) {
          return failure(
            "This is the last visible chain for the current account.",
            networksInfo,
          );
        }
      }

      const normalized = await writeNetworkState(
        normalizedNext,
        fallbackChainName ? { chainName: fallbackChainName } : {},
      );

      return {
        success: true,
        networksInfo: normalized,
        chainName: name,
        chainId: current.chainId,
        fallbackChainName: fallbackChainName ?? undefined,
      };
    } catch (error) {
      return failure(error);
    }
  });
}
