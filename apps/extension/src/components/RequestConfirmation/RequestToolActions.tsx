import { AddIcon, ExternalLinkIcon } from "@chakra-ui/icons";
import { Box, Button, HStack, Text, Tooltip, VStack } from "@chakra-ui/react";
import { CopyButton } from "@/components/CopyButton";
import SafeImage from "@/components/SafeImage";

interface RequestToolActionsProps {
  tenderlyUrl: string;
  onOpenTenderly: () => void;
  showAddToBatch: boolean;
  addToBatchDisabledReason: string | null;
  isAddingToBatch: boolean;
  batchedCount: number;
  onAddToBatch: () => void;
}

/** Shared developer simulation and cross-request batching action rows. */
export function RequestToolActions({
  tenderlyUrl,
  onOpenTenderly,
  showAddToBatch,
  addToBatchDisabledReason,
  isAddingToBatch,
  batchedCount,
  onAddToBatch,
}: RequestToolActionsProps) {
  return (
    <VStack spacing={0} align="stretch" w="full">
      <HStack w="full" spacing={1} px={2} py={1}>
        <Button
          variant="ghost"
          flex={1}
          minW={0}
          minH="44px"
          px={2}
          justifyContent="space-between"
          borderRadius="sm"
          textTransform="none"
          letterSpacing="normal"
          onClick={onOpenTenderly}
        >
          <HStack spacing={2.5} minW={0}>
            <SafeImage
              src="/tenderly-logo.svg"
              boxSize="20px"
              flexShrink={0}
              borderRadius="sm"
            />
            <Text fontWeight="600" fontSize="xs" color="fg.primary">
              Simulate on Tenderly
            </Text>
          </HStack>
          <ExternalLinkIcon boxSize={3.5} color="fg.muted" flexShrink={0} />
        </Button>
        <CopyButton value={tenderlyUrl} label="Copy Tenderly URL" />
      </HStack>

      {showAddToBatch && (
        <Tooltip
          label={addToBatchDisabledReason || ""}
          isDisabled={!addToBatchDisabledReason}
          placement="top"
          hasArrow
        >
          <Box w="full" tabIndex={addToBatchDisabledReason ? 0 : undefined}>
            <Button
              variant="ghost"
              w="full"
              minH="44px"
              px={4}
              borderRadius={0}
              borderTopWidth="1px"
              borderTopStyle="solid"
              borderTopColor="border.subtle"
              justifyContent="space-between"
              textTransform="none"
              letterSpacing="normal"
              onClick={onAddToBatch}
              isDisabled={!!addToBatchDisabledReason || isAddingToBatch}
              isLoading={isAddingToBatch}
              aria-label={
                addToBatchDisabledReason
                  ? `Add to batch. ${addToBatchDisabledReason}`
                  : "Add to batch"
              }
            >
              <HStack spacing={2.5} minW={0}>
                <Box
                  display="flex"
                  alignItems="center"
                  justifyContent="center"
                  boxSize="20px"
                  flexShrink={0}
                  borderRadius="sm"
                  bg="accent.highlight"
                  color="accentFg.highlight"
                >
                  <AddIcon boxSize={2.5} />
                </Box>
                <Text fontWeight="600" fontSize="xs">
                  Add to batch
                </Text>
              </HStack>
              {batchedCount > 0 && (
                <Text
                  fontSize="2xs"
                  fontWeight="600"
                  color="fg.secondary"
                  flexShrink={0}
                >
                  {batchedCount} queued
                </Text>
              )}
            </Button>
          </Box>
        </Tooltip>
      )}
    </VStack>
  );
}
