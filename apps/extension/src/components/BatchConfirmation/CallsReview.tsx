import type { MouseEvent } from "react";
import { Box, HStack, IconButton, Text, Tooltip, VStack } from "@chakra-ui/react";
import { DeleteIcon } from "@chakra-ui/icons";
import type { PendingBatchTxRequest } from "@/chrome/erc5792Types";
import { CallCard } from "@/components/BatchCallsList";
import { InlineDisclosure } from "@/components/ui";
import { UnlinkIcon } from "./presentation";

interface CallsReviewProps {
  batchRequestId: string;
  calls: PendingBatchTxRequest["params"]["calls"];
  chainId: number;
  expandedCalls: Set<number>;
  decodedFunctionNames: Record<number, string>;
  canSplitBatch: boolean;
  originPerCall?: Array<{ origin: string; favicon: string | null }>;
  onEditCallData?: (
    callIndex: number,
    newData: string,
  ) => Promise<{ success: boolean; error?: string }>;
  onRemoveCall?: (callIndex: number) => void;
  onToggleCall: (index: number) => void;
  onFunctionName: (index: number, name: string) => void;
  onOpenSplit: () => void;
}

export function CallsReview({
  batchRequestId,
  calls,
  chainId,
  expandedCalls,
  decodedFunctionNames,
  canSplitBatch,
  originPerCall,
  onEditCallData,
  onRemoveCall,
  onToggleCall,
  onFunctionName,
  onOpenSplit,
}: CallsReviewProps) {
  return (
    <InlineDisclosure
      label={`Actions (${calls.length})`}
      description="Review decoded calls, edit calldata, or remove eligible actions."
    >
      <VStack spacing={2} align="stretch" pt={3}>
        <VStack spacing={1.5} align="stretch">
          <HStack justify="space-between" align="center" px={1}>
            <Text fontSize="xs" fontWeight="700" color="text.secondary" textTransform="uppercase">
              Calls
            </Text>
            {canSplitBatch && (
              <Tooltip label="Split into individual transactions" fontSize="xs" hasArrow>
                <IconButton
                  aria-label="Split into individual transactions"
                  icon={<UnlinkIcon boxSize={3} />}
                  variant="ghost"
                  size="xs"
                  onClick={onOpenSplit}
                  color="text.tertiary"
                  _hover={{ color: "accent.secondary", bg: "bg.muted" }}
                  minW="auto"
                  h="auto"
                  p={0.5}
                />
              </Tooltip>
            )}
          </HStack>

          {calls.map((call, index) => {
            const callOrigin = originPerCall?.[index];
            const editCallData = (newData: string) =>
              onEditCallData
                ? onEditCallData(index, newData)
                : new Promise<{ success: boolean; error?: string }>((resolve) => {
                    chrome.runtime.sendMessage(
                      {
                        type: "updateCallInPendingBatch",
                        bundleId: batchRequestId,
                        callIndex: index,
                        newData,
                      },
                      (response) => resolve(
                        response || { success: false, error: "No response" },
                      ),
                    );
                  });
            const card = (
              <CallCard
                call={call}
                index={index}
                chainId={chainId}
                isExpanded={expandedCalls.has(index)}
                onToggle={() => onToggleCall(index)}
                onFunctionName={(name) => onFunctionName(index, name)}
                decodedName={decodedFunctionNames[index]}
                origin={callOrigin?.origin}
                favicon={callOrigin?.favicon ?? null}
                onEditCallData={editCallData}
              />
            );

            if (!onRemoveCall) return <Box key={index}>{card}</Box>;

            return (
              <Box key={index} position="relative" sx={{ "& .call-chevron": { opacity: 0 } }}>
                {card}
                <Box
                  className="delete-call-btn"
                  position="absolute"
                  top={0}
                  right={3}
                  height={callOrigin?.origin ? "46px" : "32px"}
                  display="flex"
                  alignItems="center"
                  zIndex={2}
                >
                  <Box
                    as="button"
                    type="button"
                    cursor="pointer"
                    bg="transparent"
                    border="none"
                    minW="32px"
                    h="32px"
                    p={0}
                    display="flex"
                    alignItems="center"
                    justifyContent="center"
                    lineHeight={0}
                    color="chart.negative"
                    transition="color 0.12s ease-out, transform 0.12s ease-out, filter 0.12s ease-out"
                    _hover={{
                      filter: "brightness(1.25) saturate(1.2)",
                      transform: "scale(1.15)",
                    }}
                    _active={{ transform: "scale(0.95)" }}
                    _focusVisible={{ outline: "none", boxShadow: "focus" }}
                    onClick={(event: MouseEvent<HTMLElement>) => {
                      event.stopPropagation();
                      onRemoveCall(index);
                    }}
                    aria-label={`Remove call ${index + 1}`}
                  >
                    <DeleteIcon boxSize={4} />
                  </Box>
                </Box>
              </Box>
            );
          })}
        </VStack>
      </VStack>
    </InlineDisclosure>
  );
}
