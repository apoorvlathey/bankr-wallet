import {
  getStoredNetworksInfo,
  type ChainAccountType,
} from "@/lib/chains";
import { getCachedBungeeChains } from "./catalogCache";
import {
  resolveBridgeDestinationChains,
  resolveBridgeSourceChains,
} from "./chainPolicy";
import type { EnrichedBridgeChain } from "./types";

export async function getBridgeSourceChains(
  accountType?: ChainAccountType | null,
): Promise<EnrichedBridgeChain[]> {
  const [bungeeChains, networksInfo] = await Promise.all([
    getCachedBungeeChains(),
    getStoredNetworksInfo(),
  ]);
  return resolveBridgeSourceChains(bungeeChains, networksInfo, accountType);
}

export async function getBridgeDestinationChains(): Promise<
  EnrichedBridgeChain[]
> {
  return resolveBridgeDestinationChains(await getCachedBungeeChains());
}
