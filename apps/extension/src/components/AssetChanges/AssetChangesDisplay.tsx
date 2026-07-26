import { memo } from "react";
import { useNetworks } from "@/contexts/NetworksContext";
import { getResolvedChainById } from "@/lib/chains";
import { AssetChangesPanel } from "./AssetChangesPanel";
import type { AssetChangesDisplayProps } from "./types";
import { useAssetChangesSimulation } from "./useAssetChangesSimulation";

function AssetChangesDisplay(props: AssetChangesDisplayProps) {
  const { txRequest } = props;
  const { networksInfo } = useNetworks();
  const explorerUrl =
    getResolvedChainById(txRequest.tx.chainId, networksInfo)?.explorer ?? "";
  const residualApprovalRequest = props.residualApprovalRequest ??
    (!props.batchCalls
      ? { family: "transaction" as const, requestId: txRequest.id }
      : undefined);
  const { loading, result } = useAssetChangesSimulation({
    ...props,
    residualApprovalRequest,
  });

  return (
    <AssetChangesPanel
      explorerUrl={explorerUrl}
      loading={loading}
      result={result}
      embedded={props.embedded}
      approvalCleanup={props.approvalCleanup}
    />
  );
}

export {
  SimulationRevertedBanner,
  SimulationUnavailableBanner,
} from "./SimulationBanners";

export default memo(AssetChangesDisplay);
