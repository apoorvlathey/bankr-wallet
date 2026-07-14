import {
  getResolvedChainById,
  getVisibleChains,
  normalizeNetworksInfo,
  type ChainAccountType,
} from "@/lib/chains";
import type { NetworkEntry } from "@/types";
import { withStorageLock } from "../storageLock";
import {
  cleanChainName,
  cleanNetworkEntry,
  cleanSavedRpcEndpoints,
} from "./customNetworkValidation";
import {
  getNetworkRpcEndpoints,
  moveNetworkRpcEndpoints,
  removeNetworkRpcUrls,
} from "./rpcHistoryRepository";
import {
  failure,
  findChainNameById,
  getFallbackChainName,
  type NetworkMutationResult,
} from "./networkPolicy";
import {
  getNetworkState,
  NETWORKS_INFO_LOCK_KEY,
  writeNetworkState,
} from "./networkRepository";

export type { NetworkMutationResult } from "./networkPolicy";

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
  rpcEndpoints,
  rpcUrls,
}: {
  chainName: unknown;
  nextChainName: unknown;
  entry: unknown;
  rpcEndpoints?: unknown;
  /** Released compatibility input for older Settings pages. */
  rpcUrls?: unknown;
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
      const savedChainId = isCustom ? cleanedEntry.chainId : current.chainId;
      const existingByName = networksInfo[savedName];

      if (savedName !== currentName && existingByName) {
        return failure(`Chain name "${savedName}" already exists.`, networksInfo);
      }

      const existingByChainId = findChainNameById(networksInfo, savedChainId);
      if (existingByChainId && existingByChainId !== currentName) {
        return failure(
          `Chain ID ${savedChainId} already exists as "${existingByChainId}".`,
          networksInfo,
        );
      }

      const requestedRpcEndpoints = rpcEndpoints ?? rpcUrls;
      if (requestedRpcEndpoints !== undefined) {
        const cleanedRpcEndpoints = cleanSavedRpcEndpoints(
          requestedRpcEndpoints,
          cleanedEntry.rpcUrl,
        );
        await moveNetworkRpcEndpoints(
          current.chainId,
          savedChainId,
          cleanedEntry.rpcUrl,
          cleanedRpcEndpoints,
        );
      } else if (
        cleanedEntry.rpcUrl !== current.rpcUrl ||
        savedChainId !== current.chainId
      ) {
        const existingRpcEndpoints = await getNetworkRpcEndpoints(
          current.chainId,
          current.rpcUrl,
        );
        await moveNetworkRpcEndpoints(
          current.chainId,
          savedChainId,
          cleanedEntry.rpcUrl,
          [...existingRpcEndpoints, { url: current.rpcUrl }],
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
      await removeNetworkRpcUrls(current.chainId).catch(() => undefined);

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
