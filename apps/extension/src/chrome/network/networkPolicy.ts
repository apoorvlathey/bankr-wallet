import {
  getVisibleChains,
  type ChainAccountType,
} from "@/lib/chains";
import type { NetworksInfo } from "@/types";

export type NetworkMutationSuccess = {
  success: true;
  networksInfo: NetworksInfo;
  chainName: string;
  chainId: number;
  existed?: boolean;
  fallbackChainName?: string;
  shouldSwitch?: boolean;
};

export type NetworkMutationFailure = {
  success: false;
  error: string;
  networksInfo?: NetworksInfo;
};

export type NetworkMutationResult =
  | NetworkMutationSuccess
  | NetworkMutationFailure;

export function findChainNameById(
  networksInfo: NetworksInfo,
  chainId: number,
): string | undefined {
  return Object.entries(networksInfo).find(
    ([, entry]) => entry.chainId === chainId,
  )?.[0];
}

export function getFallbackChainName(
  networksInfo: NetworksInfo,
  accountType: ChainAccountType | null | undefined,
  excludedChainName?: string,
): string | null {
  const visibleChains = getVisibleChains(networksInfo, accountType).filter(
    (chain) => chain.name !== excludedChainName,
  );
  return visibleChains[0]?.name ?? null;
}

export function failure(error: unknown, networksInfo?: NetworksInfo): NetworkMutationFailure {
  return {
    success: false,
    error: error instanceof Error ? error.message : String(error),
    networksInfo,
  };
}
