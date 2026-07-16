import { ExternalLinkIcon } from "@chakra-ui/icons";
import { HStack, IconButton, Tooltip } from "@chakra-ui/react";
import type { CompletedTransaction } from "@/chrome/txHistoryStorage";
import ChainIcon from "@/components/ChainIcon";
import type { ActivityExplorerState } from "./useActivityExplorers";

interface ActivityExplorerActionsProps {
  tx: CompletedTransaction;
  explorer: ActivityExplorerState;
}

function ExplorerGlyph({
  chainId,
  chainName,
}: {
  chainId?: number;
  chainName?: string;
}) {
  if (chainId == null) return <ExternalLinkIcon boxSize="14px" />;

  return (
    <HStack spacing="2px" aria-hidden="true">
      <ChainIcon chainId={chainId} chainName={chainName} size="12px" />
      <ExternalLinkIcon boxSize="11px" />
    </HStack>
  );
}

export default function ActivityExplorerActions({
  tx,
  explorer,
}: ActivityExplorerActionsProps) {
  if (!explorer.hasViewableTx && !explorer.hasBridgeDestLink) return null;

  const isCrossChain = !!tx.bridge && explorer.hasBridgeDestLink;
  const sourceLabel = isCrossChain
    ? `View on ${tx.chainName || "source chain"} explorer`
    : "View on explorer";

  return (
    <HStack spacing={0.5} flexShrink={0} pointerEvents="auto">
      {explorer.hasViewableTx && (
        <Tooltip label={sourceLabel} fontSize="2xs" openDelay={300} hasArrow>
          <IconButton
            aria-label={sourceLabel}
            icon={
              <ExplorerGlyph
                chainId={isCrossChain ? tx.chainId : undefined}
                chainName={tx.chainName}
              />
            }
            minW={isCrossChain ? "28px" : "24px"}
            minH="24px"
            w={isCrossChain ? "28px" : "24px"}
            h="24px"
            borderRadius="sm"
            variant="ghost"
            color="fg.muted"
            _hover={{ color: "fg.primary", bg: "surface.raisedHover" }}
            _active={{ bg: "surface.sunken" }}
            onClick={explorer.handleViewTx}
          />
        </Tooltip>
      )}
      {explorer.hasBridgeDestLink && tx.bridge && (
        <Tooltip
          label={`View on ${tx.bridge.destinationChainName} explorer`}
          fontSize="2xs"
          openDelay={300}
          hasArrow
        >
          <IconButton
            aria-label={`View on ${tx.bridge.destinationChainName} explorer`}
            icon={
              <ExplorerGlyph
                chainId={tx.bridge.destinationChainId}
                chainName={tx.bridge.destinationChainName}
              />
            }
            minW="28px"
            minH="24px"
            w="28px"
            h="24px"
            borderRadius="sm"
            variant="ghost"
            color="fg.muted"
            _hover={{ color: "fg.primary", bg: "surface.raisedHover" }}
            _active={{ bg: "surface.sunken" }}
            onClick={explorer.handleViewBridgeDest}
          />
        </Tooltip>
      )}
    </HStack>
  );
}
