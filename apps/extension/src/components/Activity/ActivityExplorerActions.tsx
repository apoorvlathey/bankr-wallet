import { ExternalLinkIcon } from "@chakra-ui/icons";
import { HStack, IconButton, Tooltip, VStack } from "@chakra-ui/react";
import type { CompletedTransaction } from "@/chrome/txHistoryStorage";
import ChainIcon from "@/components/ChainIcon";
import type { ActivityExplorerState } from "./useActivityExplorers";

interface ActivityExplorerActionsProps {
  tx: CompletedTransaction;
  explorer: ActivityExplorerState;
}

export default function ActivityExplorerActions({
  tx,
  explorer,
}: ActivityExplorerActionsProps) {
  if (!explorer.hasViewableTx && !explorer.hasBridgeDestLink) return null;

  const sourceExplorerLabel =
    tx.bridge && explorer.hasBridgeDestLink
      ? `View on ${tx.chainName || "source chain"} explorer`
      : "View on explorer";
  const sourceExplorerIcon =
    tx.bridge && explorer.hasBridgeDestLink ? (
      <HStack spacing="2px" aria-hidden="true">
        <ChainIcon chainId={tx.chainId} chainName={tx.chainName} size="11px" />
        <ExternalLinkIcon boxSize={3} />
      </HStack>
    ) : (
      <ExternalLinkIcon boxSize={3.5} />
    );

  return (
    <VStack
      flex="0 0 auto"
      spacing={0}
      justify="center"
      px={1}
      borderLeftWidth="1px"
      borderLeftStyle="solid"
      borderLeftColor="border.subtle"
    >
      {explorer.hasViewableTx && (
        <Tooltip
          label={sourceExplorerLabel}
          fontSize="2xs"
          openDelay={300}
          hasArrow
        >
          <IconButton
            aria-label={sourceExplorerLabel}
            icon={sourceExplorerIcon}
            size="sm"
            variant="ghost"
            color="fg.secondary"
            onClick={explorer.handleViewTx}
          />
        </Tooltip>
      )}
      {explorer.hasBridgeDestLink && (
        <Tooltip
          label={`View on ${tx.bridge!.destinationChainName} explorer`}
          fontSize="2xs"
          openDelay={300}
          hasArrow
        >
          <IconButton
            aria-label={`View on ${tx.bridge!.destinationChainName} explorer`}
            icon={
              <HStack spacing="2px" aria-hidden="true">
                <ChainIcon
                  chainId={tx.bridge!.destinationChainId}
                  chainName={tx.bridge!.destinationChainName}
                  size="11px"
                />
                <ExternalLinkIcon boxSize={3} />
              </HStack>
            }
            size="sm"
            variant="ghost"
            color="fg.secondary"
            onClick={explorer.handleViewBridgeDest}
          />
        </Tooltip>
      )}
    </VStack>
  );
}
