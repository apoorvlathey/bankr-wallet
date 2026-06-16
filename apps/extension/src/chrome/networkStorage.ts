import type { NetworkEntry, NetworksInfo } from "@/types";
import { DEFAULT_NETWORKS } from "@/constants/networks";
import {
  getResolvedChainById,
  getVisibleChains,
  normalizeNetworksInfo,
  type ChainAccountType,
} from "@/lib/chains";
import { withStorageLock } from "./storageLock";

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
  return trimmed;
}

function cleanNetworkEntry(entry: unknown): NetworkEntry {
  if (!entry || typeof entry !== "object") {
    throw new Error("Network details are required.");
  }

  const candidate = entry as Partial<NetworkEntry>;
  const chainId = Number(candidate.chainId);
  const rpcUrl = typeof candidate.rpcUrl === "string" ? candidate.rpcUrl.trim() : "";

  if (!Number.isInteger(chainId) || chainId <= 0) {
    throw new Error("Valid chain ID is required.");
  }
  if (!rpcUrl) {
    throw new Error("RPC URL is required.");
  }

  return {
    chainId,
    rpcUrl,
    isCustom: candidate.isCustom === true,
    hidden: candidate.hidden === true ? true : undefined,
    explorer:
      typeof candidate.explorer === "string" && candidate.explorer.trim()
        ? candidate.explorer.trim().replace(/\/+$/, "")
        : undefined,
    nativeCurrency: candidate.nativeCurrency
      ? {
          name: candidate.nativeCurrency.name || candidate.nativeCurrency.symbol || "ETH",
          symbol: candidate.nativeCurrency.symbol || "ETH",
          decimals: Number(candidate.nativeCurrency.decimals) || 18,
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
}: {
  chainName: unknown;
  entry: unknown;
  switchIfSupportedForAccountType?: ChainAccountType | null;
}): Promise<NetworkMutationResult> {
  return withStorageLock(NETWORKS_INFO_LOCK_KEY, async () => {
    try {
      const name = cleanChainName(chainName);
      const cleanedEntry = cleanNetworkEntry(entry);
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
