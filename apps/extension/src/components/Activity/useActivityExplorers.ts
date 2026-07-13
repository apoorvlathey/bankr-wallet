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

export function useActivityExplorers(
  tx: CompletedTransaction,
): ActivityExplorerState {
  const { networksInfo } = useNetworks();
  const config = getChainConfig(tx.chainId);
  const explorerBase =
    getResolvedChainById(tx.chainId, networksInfo)?.explorer ||
    config.explorer ||
    "";
  const isForceInclusion = !!tx.forceInclusionMeta;
  const isBridge = !!tx.bridge;
  const l1ExplorerBase = isForceInclusion
    ? getChainConfig(tx.forceInclusionMeta!.l1ChainId).explorer || ""
    : "";
  const hasViewableTx = isForceInclusion
    ? !!(tx.forceInclusionMeta!.l1TxHash || tx.txHash)
    : !!(tx.txHash && explorerBase);
  const destExplorerBase =
    isBridge && tx.bridge?.destinationChainId
      ? getResolvedChainById(tx.bridge.destinationChainId, networksInfo)
          ?.explorer ||
        getChainConfig(tx.bridge.destinationChainId).explorer ||
        ""
      : "";
  const hasBridgeDestLink = !!(
    isBridge && tx.bridge?.destinationTxHash && destExplorerBase
  );

  const handleViewBridgeDest = (event: MouseEvent) => {
    event.stopPropagation();
    const hash = tx.bridge?.destinationTxHash;
    if (!hash || !destExplorerBase) return;
    const clean = hash.match(/0x[a-fA-F0-9]{64}/)?.[0];
    if (clean) {
      chrome.tabs.create({ url: `${destExplorerBase}/tx/${clean}` });
    }
  };

  const handleViewTx = (event: MouseEvent) => {
    event.stopPropagation();
    if (isForceInclusion) {
      const l1Hash = tx.forceInclusionMeta!.l1TxHash;
      const txHashIsL2 = tx.txHash && tx.txHash !== l1Hash;
      const l2Resolved = tx.status === "success" || tx.status === "failed";
      if (l2Resolved && txHashIsL2 && explorerBase) {
        const hash = tx.txHash!.match(/0x[a-fA-F0-9]{64}/)?.[0];
        if (hash) {
          chrome.tabs.create({ url: `${explorerBase}/tx/${hash}` });
          return;
        }
      }
      if (l1Hash && l1ExplorerBase) {
        chrome.tabs.create({ url: `${l1ExplorerBase}/tx/${l1Hash}` });
        return;
      }
    }
    if (tx.txHash && explorerBase) {
      const hash = tx.txHash.match(/0x[a-fA-F0-9]{64}/)?.[0];
      if (hash) {
        chrome.tabs.create({ url: `${explorerBase}/tx/${hash}` });
      }
    }
  };

  return {
    hasViewableTx,
    hasBridgeDestLink,
    handleViewTx,
    handleViewBridgeDest,
  };
}
