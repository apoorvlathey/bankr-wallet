import { DEFAULT_NETWORKS } from "@/constants/networks";
import { normalizeNetworksInfo } from "@/lib/chains";
import type { NetworksInfo } from "@/types";

export const NETWORKS_INFO_LOCK_KEY = "sync:networksInfo";

export type NetworkState = {
  networksInfo: NetworksInfo;
  storedNetworksInfo?: NetworksInfo;
  chainName?: string;
};

export async function getNetworkState(): Promise<NetworkState> {
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

export async function writeNetworkState(
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
