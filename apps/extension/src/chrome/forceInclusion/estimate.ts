import { FORCE_INCLUSION_CHAINS } from "@/constants/chainRegistry";
import { estimateArbitrumForceInclusionGas } from "../arbitrumForceInclusion/estimate";
import { estimateForceInclusionGas as estimateOpForceInclusionGas } from "./deposit";

export async function estimateForceInclusionGas(
  tx: Parameters<typeof estimateOpForceInclusionGas>[0],
  accountAddress: string,
) {
  const info = FORCE_INCLUSION_CHAINS.get(tx.chainId);
  return info?.protocol === "arbitrum"
    ? estimateArbitrumForceInclusionGas(tx, accountAddress)
    : estimateOpForceInclusionGas(tx, accountAddress);
}
