import { getStoredResolvedChainById } from "@/lib/chains";
import { probeErc7821Support } from "@/utils/delegationResolution";
import { isAddress } from "viem";
import type { Address, DelegateProbeResult } from "./types";

export interface DelegateProbeDependencies {
  getStoredResolvedChainById: typeof getStoredResolvedChainById;
  probeErc7821Support: typeof probeErc7821Support;
}

const defaultDependencies: DelegateProbeDependencies = {
  getStoredResolvedChainById,
  probeErc7821Support,
};

export function createProbeDelegateContractHandler(
  dependencies: DelegateProbeDependencies,
) {
  return async function handleProbeDelegateContract(
    chainId: number,
    address: string,
  ): Promise<DelegateProbeResult> {
    if (!isAddress(address)) {
      return { success: false, error: "Invalid address" };
    }
    const resolved = await dependencies.getStoredResolvedChainById(chainId);
    if (!resolved?.rpcUrl) {
      return { success: false, error: "Chain has no RPC URL configured" };
    }
    const probe = await dependencies.probeErc7821Support(
      resolved.rpcUrl,
      chainId,
      address.toLowerCase() as Address,
    );
    if (!probe.ok) {
      return { success: false, error: `Couldn't probe contract: ${probe.error}` };
    }
    return { success: true, supports7821: probe.supports };
  };
}

export const handleProbeDelegateContract =
  createProbeDelegateContractHandler(defaultDependencies);
