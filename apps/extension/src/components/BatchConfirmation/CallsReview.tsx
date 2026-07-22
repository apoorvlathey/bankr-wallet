import {
  Box,
  HStack,
  Icon,
  IconButton,
  Menu,
  MenuButton,
  MenuItem,
  MenuList,
  Portal,
  Text,
  Tooltip,
  VStack,
} from "@chakra-ui/react";
import { DeleteIcon } from "@chakra-ui/icons";
import type { PendingBatchTxRequest } from "@/chrome/erc5792Types";
import { CallCard } from "@/components/BatchCallsList";
import { UnlinkIcon } from "./presentation";

interface CallsReviewProps {
  batchRequestId: string;
  calls: PendingBatchTxRequest["params"]["calls"];
  chainId: number;
  expandedCalls: Set<number>;
  decodedFunctionNames: Record<number, string>;
  originPerCall?: Array<{ origin: string; favicon: string | null }>;
  onEditCallData?: (
    callIndex: number,
    newData: string,
  ) => Promise<{ success: boolean; error?: string }>;
  onRemoveCall?: (callIndex: number) => void;
  onToggleCall: (index: number) => void;
  onFunctionName: (index: number, name: string) => void;
  onClearSigningAction: (index: number, name?: string) => void;
  readOnly?: boolean;
}

interface CallsReviewHeaderActionProps {
  callCount: number;
  canSplitBatch: boolean;
  onOpenSplit: () => void;
}

function MoreHorizontalIcon() {
  return (
    <Icon viewBox="0 0 20 20" boxSize="16px" aria-hidden="true">
      <circle cx="4" cy="10" r="1.5" fill="currentColor" />
      <circle cx="10" cy="10" r="1.5" fill="currentColor" />
      <circle cx="16" cy="10" r="1.5" fill="currentColor" />
    </Icon>
  );
}

/** Compact request-details metadata; the count remains the rightmost item. */
export function CallsReviewHeaderAction({
  callCount,
  canSplitBatch,
  onOpenSplit,
}: CallsReviewHeaderActionProps) {
  return (
    <HStack spacing={1.5}>
      {canSplitBatch && (
        <Tooltip label="Split into individual transactions" fontSize="xs" hasArrow>
          <IconButton
            aria-label="Split into individual transactions"
            icon={<UnlinkIcon boxSize={3} />}
            variant="ghost"
            size="xs"
            minW="28px"
            w="28px"
            h="28px"
            color="text.tertiary"
            onClick={onOpenSplit}
            _hover={{ color: "accent.secondary", bg: "bg.muted" }}
          />
        </Tooltip>
      )}
      <Text
        color="fg.secondary"
        fontSize="xs"
        fontWeight="600"
        whiteSpace="nowrap"
      >
        {callCount} {callCount === 1 ? "call" : "calls"}
      </Text>
    </HStack>
  );
}

export function CallsReview({
  batchRequestId,
  calls,
  chainId,
  expandedCalls,
  decodedFunctionNames,
  originPerCall,
  onEditCallData,
  onRemoveCall,
  onToggleCall,
  onFunctionName,
  onClearSigningAction,
  readOnly = false,
}: CallsReviewProps) {
  return (
    <VStack spacing={1.5} align="stretch">
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
            onClearSigningAction={(name) => onClearSigningAction(index, name)}
            decodedName={decodedFunctionNames[index]}
            origin={callOrigin?.origin}
            favicon={callOrigin?.favicon ?? null}
            onEditCallData={readOnly ? undefined : editCallData}
          />
        );

        if (!onRemoveCall) return <Box key={index}>{card}</Box>;

        return (
          <Box
            key={index}
            role="group"
            position="relative"
            sx={{
              "& .call-overflow-trigger": {
                opacity: 0,
                pointerEvents: "none",
              },
              "&:hover .call-overflow-trigger, &:focus-within .call-overflow-trigger": {
                opacity: 1,
                pointerEvents: "auto",
              },
              "&:hover .call-chevron, &:focus-within .call-chevron": {
                opacity: 0,
              },
              "@media (hover: none)": {
                "& .call-overflow-trigger": {
                  opacity: 1,
                  pointerEvents: "auto",
                },
                "& .call-chevron": { opacity: 0 },
              },
            }}
          >
            {card}
            <Box
              position="absolute"
              top="6px"
              right={2}
              zIndex={2}
            >
              <Menu placement="bottom-end" gutter={4} isLazy autoSelect={false}>
                <MenuButton
                  className="call-overflow-trigger"
                  as={IconButton}
                  aria-label={`Call ${index + 1} actions`}
                  icon={<MoreHorizontalIcon />}
                  variant="ghost"
                  size="xs"
                  minW="32px"
                  w="32px"
                  h="32px"
                  color="fg.secondary"
                  transition="opacity 120ms ease-out, color 120ms ease-out"
                  _hover={{ bg: "transparent", color: "accent.highlight" }}
                  _active={{ bg: "transparent", color: "accent.highlight" }}
                  _expanded={{ bg: "transparent", color: "accent.highlight", opacity: 1 }}
                  onClick={(event) => event.stopPropagation()}
                />
                <Portal>
                  <MenuList minW="152px" py={1}>
                    <MenuItem
                      icon={<DeleteIcon boxSize={3.5} />}
                      minH="40px"
                      color="status.error.fg"
                      fontSize="sm"
                      fontWeight="600"
                      onClick={() => onRemoveCall(index)}
                      _hover={{ bg: "status.error.bg" }}
                      _focus={{ bg: "status.error.bg" }}
                    >
                      Delete call
                    </MenuItem>
                  </MenuList>
                </Portal>
              </Menu>
            </Box>
          </Box>
        );
      })}
    </VStack>
  );
}
