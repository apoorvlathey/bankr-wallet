import type { MouseEvent } from "react";
import type { CompletedTransaction } from "@/chrome/txHistoryStorage";
import { getChainConfig } from "@/constants/chainConfig";
import { useNetworks } from "@/contexts/NetworksContext";
import { getResolvedChainById } from "@/lib/chains";

export interface ActivityExplorerState {
  hasViewableTx: boolean;
  hasBridgeDestLink: boolean;
  handleViewTx: (event: MouseEvent) => void;
  handleViewBridgeDest: (event: MouseEvent) => void;
}

function exactTransactionHash(value: string | undefined): string | null {
  return value?.match(/0x[a-fA-F0-9]{64}/)?.[0] ?? null;
}

export function useActivityExplorers(
  tx: CompletedTransaction,
): ActivityExplorerState {
  const { networksInfo } = useNetworks();
  const sourceExplorer =
    getResolvedChainById(tx.chainId, networksInfo)?.explorer ||
    getChainConfig(tx.chainId).explorer ||
    "";
  const bridgeSourceHash = exactTransactionHash(
    tx.bridge?.sourceTxHash || tx.txHash,
  );
  const normalHash = exactTransactionHash(tx.txHash);

  const isForceInclusion = !!tx.forceInclusionMeta;
  const l1Explorer = isForceInclusion
    ? getChainConfig(tx.forceInclusionMeta!.l1ChainId).explorer || ""
    : "";
  const l1Hash = exactTransactionHash(tx.forceInclusionMeta?.l1TxHash);
  const l2IsResolved = tx.status === "success" || tx.status === "failed";
  const preferredForceInclusionHash =
    l2IsResolved && normalHash && normalHash !== l1Hash ? normalHash : l1Hash;
  const preferredForceInclusionExplorer =
    preferredForceInclusionHash === normalHash ? sourceExplorer : l1Explorer;

  const destinationExplorer = tx.bridge?.destinationChainId
    ? getResolvedChainById(tx.bridge.destinationChainId, networksInfo)?.explorer ||
      getChainConfig(tx.bridge.destinationChainId).explorer ||
      ""
    : "";
  const destinationHash = exactTransactionHash(tx.bridge?.destinationTxHash);

  const sourceHash = isForceInclusion
    ? preferredForceInclusionHash
    : tx.bridge
      ? bridgeSourceHash
      : normalHash;
  const sourceExplorerBase = isForceInclusion
    ? preferredForceInclusionExplorer
    : sourceExplorer;

  const handleViewTx = (event: MouseEvent) => {
    event.stopPropagation();
    if (!sourceHash || !sourceExplorerBase) return;
    chrome.tabs.create({ url: `${sourceExplorerBase}/tx/${sourceHash}` });
  };

  const handleViewBridgeDest = (event: MouseEvent) => {
    event.stopPropagation();
    if (!destinationHash || !destinationExplorer) return;
    chrome.tabs.create({ url: `${destinationExplorer}/tx/${destinationHash}` });
  };

  return {
    hasViewableTx: !!(sourceHash && sourceExplorerBase),
    hasBridgeDestLink: !!(destinationHash && destinationExplorer),
    handleViewTx,
    handleViewBridgeDest,
  };
}
