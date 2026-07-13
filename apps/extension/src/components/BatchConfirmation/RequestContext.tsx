import type { ReactNode } from "react";
import {
  Badge,
  Box,
  Button,
  Flex,
  HStack,
  IconButton,
  Spinner,
  Text,
  VStack,
} from "@chakra-ui/react";
import { ChevronLeftIcon, ChevronRightIcon } from "@chakra-ui/icons";
import type { PendingBatchTxRequest } from "@/chrome/erc5792Types";
import { BatchClearSigningSummary } from "@/components/BatchCallsList";
import type { ConfirmationState } from "./types";

interface RequestContextProps {
  calls: PendingBatchTxRequest["params"]["calls"];
  chainId: number;
  currentIndex: number;
  totalCount: number;
  stripBg: string;
  stripFg: string;
  state: ConfirmationState;
  error: string;
  accountType?: "bankr" | "privateKey" | "seedPhrase" | "impersonator";
  customConfirm: boolean;
  canConfirmBatch: boolean;
  confirmDisabledReason: string | null;
  warnings: ReactNode;
  smartAccountSetup: ReactNode;
  metadata: ReactNode;
  onNavigate: (direction: "prev" | "next") => void;
  onRejectAll: () => void;
}

export function RequestContext({
  calls,
  chainId,
  currentIndex,
  totalCount,
  stripBg,
  stripFg,
  state,
  error,
  accountType,
  customConfirm,
  canConfirmBatch,
  confirmDisabledReason,
  warnings,
  smartAccountSetup,
  metadata,
  onNavigate,
  onRejectAll,
}: RequestContextProps) {
  return (
    <VStack spacing={3} align="stretch">
      {totalCount > 1 && (
        <Flex align="center" justify="center" position="relative">
          <HStack spacing={0}>
            <IconButton
              aria-label="Previous"
              icon={<ChevronLeftIcon />}
              variant="ghost"
              size="xs"
              isDisabled={currentIndex === 0}
              onClick={() => onNavigate("prev")}
              color="text.secondary"
              _hover={{ color: "text.primary", bg: "bg.muted" }}
              minW="32px"
              h="32px"
              p={0}
            />
            <Badge bg={stripBg} color={stripFg} fontSize="xs" px={3} py={1} fontWeight="700">
              {currentIndex + 1}/{totalCount}
            </Badge>
            <IconButton
              aria-label="Next"
              icon={<ChevronRightIcon />}
              variant="ghost"
              size="xs"
              isDisabled={currentIndex + 1 === totalCount}
              onClick={() => onNavigate("next")}
              color="text.secondary"
              _hover={{ color: "text.primary", bg: "bg.muted" }}
              minW="32px"
              h="32px"
              p={0}
            />
          </HStack>
          <Button
            position="absolute"
            right={0}
            size="xs"
            variant="ghost"
            color="status.error.emphasis"
            fontWeight="700"
            _hover={{ bg: "status.error.bg", color: "status.error.fg" }}
            onClick={onRejectAll}
            px={2}
          >
            Reject All
          </Button>
        </Flex>
      )}

      {warnings}
      {smartAccountSetup}
      <BatchClearSigningSummary calls={calls} chainId={chainId} />
      {metadata}

      <VStack spacing={2} align="stretch">
        {error && state === "error" && (
          <Box
            bg="status.error.bg"
            border="1px solid"
            borderColor="status.error.border"
            borderRadius="lg"
            p={3}
          >
            <Text color="status.error.fg" fontSize="sm" fontWeight="700">
              {error}
            </Text>
          </Box>
        )}
        {state === "submitting" && (
          <HStack
            justify="center"
            py={3}
            bg="status.info.bg"
            border="1px solid"
            borderColor="status.info.border"
            borderRadius="lg"
          >
            <Spinner size="sm" color="status.info.fg" />
            <Text color="status.info.fg" fontSize="sm" fontWeight="700">
              Submitting batch…
            </Text>
          </HStack>
        )}
        {accountType === "impersonator" && !customConfirm && (
          <Box
            bg="accent.highlight"
            border="1px solid"
            borderColor="border.default"
            borderRadius="lg"
            p={3}
          >
            <Text color="accentFg.highlight" fontSize="sm" fontWeight="700">
              Connected via an impersonated account. Signing is disabled.
            </Text>
          </Box>
        )}
        {canConfirmBatch && confirmDisabledReason && state !== "submitting" && (
          <Text role="status" color="text.secondary" fontSize="xs">
            Confirm unavailable: {confirmDisabledReason}
          </Text>
        )}
      </VStack>
    </VStack>
  );
}
