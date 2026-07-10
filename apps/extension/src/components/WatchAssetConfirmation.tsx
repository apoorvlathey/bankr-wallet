import { useMemo, useState } from "react";
import { Button, Spinner } from "@chakra-ui/react";

import type { PendingWatchAssetRequest } from "@/chrome/pendingWatchAssetStorage";
import { WatchAssetConfirmationScreen } from "@/components/WatchAssetConfirmation/WatchAssetConfirmationScreen";
import { getChainConfig } from "@/constants/chainConfig";
import { googleFaviconUrl } from "@/constants/externalUrls";

interface WatchAssetConfirmationProps {
  request: PendingWatchAssetRequest;
  onConfirmed: () => void;
  onRejected: () => void;
}

export default function WatchAssetConfirmation({
  request,
  onConfirmed,
  onRejected,
}: WatchAssetConfirmationProps) {
  const [confirming, setConfirming] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const chainConfig = getChainConfig(request.chainId);
  const originHostname = useMemo(() => {
    try {
      return new URL(request.origin).hostname;
    } catch {
      return request.origin;
    }
  }, [request.origin]);
  const fallbackFavicon = googleFaviconUrl(originHostname);

  const handleConfirm = async () => {
    setConfirming(true);
    try {
      await new Promise<void>((resolve) => {
        chrome.runtime.sendMessage(
          { type: "confirmWatchAsset", watchAssetId: request.id },
          () => resolve(),
        );
      });
      onConfirmed();
    } finally {
      setConfirming(false);
    }
  };

  const handleReject = async () => {
    setRejecting(true);
    try {
      await new Promise<void>((resolve) => {
        chrome.runtime.sendMessage(
          { type: "rejectWatchAsset", watchAssetId: request.id },
          () => resolve(),
        );
      });
      onRejected();
    } finally {
      setRejecting(false);
    }
  };

  return (
    <WatchAssetConfirmationScreen
      symbol={request.asset.symbol}
      address={request.asset.address}
      decimals={request.asset.decimals}
      imageUrl={request.asset.image}
      chainId={request.chainId}
      chainName={chainConfig.name}
      explorerUrl={chainConfig.explorer}
      originHostname={originHostname}
      origin={request.origin}
      originFavicon={request.favicon || fallbackFavicon}
      fallbackFavicon={fallbackFavicon}
      requestId={request.id}
      rejectAction={
        <Button
          variant="secondary"
          onClick={handleReject}
          isLoading={rejecting}
          isDisabled={confirming}
          loadingText="Rejecting"
          spinner={<Spinner size="sm" sx={{ animationDirection: "reverse" }} />}
        >
          Reject
        </Button>
      }
      confirmAction={
        <Button
          variant="primary"
          onClick={handleConfirm}
          isLoading={confirming}
          isDisabled={rejecting}
          loadingText="Adding"
        >
          Add token
        </Button>
      }
    />
  );
}
