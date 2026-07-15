import { DEFAULT_NETWORKS } from "@/constants/networks";
import { normalizeNetworksInfo } from "@/lib/chains";
import type { NetworksInfo } from "@/types";

export const NETWORKS_INFO_LOCK_KEY = "sync:networksInfo";

export type NetworkState = {
  networksInfo: NetworksInfo;
  storedNetworksInfo?: NetworksInfo;
  chainName?: string;
  storedChainName?: string;
};

export function normalizeActiveChainName(
  chainName: string | undefined,
  storedNetworksInfo: NetworksInfo | undefined,
  normalizedNetworksInfo: NetworksInfo,
): string | undefined {
  if (!chainName || normalizedNetworksInfo[chainName]) return chainName;

  const storedChainId = storedNetworksInfo?.[chainName]?.chainId;
  if (storedChainId === undefined) return chainName;

  return (
    Object.entries(normalizedNetworksInfo).find(
      ([, entry]) => entry.chainId === storedChainId,
    )?.[0] ?? chainName
  );
}

export async function getNetworkState(): Promise<NetworkState> {
  const { networksInfo, chainName } = (await chrome.storage.sync.get([
    "networksInfo",
    "chainName",
  ])) as {
    networksInfo?: NetworksInfo;
    chainName?: string;
  };

  const normalizedNetworksInfo = normalizeNetworksInfo(
    networksInfo ?? DEFAULT_NETWORKS,
  );

  return {
    networksInfo: normalizedNetworksInfo,
    storedNetworksInfo: networksInfo,
    chainName: normalizeActiveChainName(
      chainName,
      networksInfo,
      normalizedNetworksInfo,
    ),
    storedChainName: chainName,
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
