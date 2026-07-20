import type { NetworksInfo } from "@/types";

export type ChainVisibilityTab = "active" | "hidden";
export type ChainListEntry = [string, NetworksInfo[string]];

function getRpcHost(rpcUrl: string): string {
  try {
    return new URL(rpcUrl).hostname.replace(/^www\./, "");
  } catch {
    return rpcUrl;
  }
}

export function getChainEntriesForTab({
  networksInfo,
  activeChainName,
  visibilityTab,
  search,
}: {
  networksInfo: NetworksInfo | undefined;
  activeChainName: string | null;
  visibilityTab: ChainVisibilityTab;
  search: string;
}): ChainListEntry[] {
  const normalizedSearch = search.trim().toLowerCase();

  return Object.entries(networksInfo ?? {})
    .filter(([, network]) =>
      visibilityTab === "hidden" ? network.hidden === true : network.hidden !== true,
    )
    .filter(([name, network]) => {
      if (!normalizedSearch) return true;
      return (
        name.toLowerCase().includes(normalizedSearch) ||
        String(network.chainId).includes(normalizedSearch) ||
        getRpcHost(network.rpcUrl).toLowerCase().includes(normalizedSearch)
      );
    })
    .sort(([nameA, networkA], [nameB, networkB]) => {
      if (nameA === activeChainName) return -1;
      if (nameB === activeChainName) return 1;
      if (networkA.isCustom !== networkB.isCustom) {
        return networkA.isCustom ? 1 : -1;
      }
      return nameA.localeCompare(nameB);
    });
}

export function getChainVisibilityCounts(networksInfo: NetworksInfo | undefined) {
  return Object.values(networksInfo ?? {}).reduce(
    (counts, network) => {
      counts[network.hidden ? "hidden" : "active"] += 1;
      return counts;
    },
    { active: 0, hidden: 0 },
  );
}
