import { Box, Flex, HStack, Spinner, Text } from "@chakra-ui/react";
import { ChevronRightIcon } from "@chakra-ui/icons";
import type { SafeProposalRecord } from "@/chrome/safe/types";
import ChainIcon from "@/components/ChainIcon";
import {
  ListItem,
  ListItemContent,
  ListItemDescription,
  ListItemMedia,
  ListItemTitle,
} from "@/components/ui";
import {
  getSafeProposalPresentation,
  type SafeProposalStatusTone,
} from "./safeProposalPresentation";

const TONE_COLOR: Record<SafeProposalStatusTone, string> = {
  success: "status.success.emphasis",
  info: "status.info.emphasis",
  warning: "status.warning.emphasis",
  error: "status.error.emphasis",
  muted: "fg.muted",
};

export function SafeProposalRow({
  proposal,
  chainName,
  nativeSymbol,
  nativeDecimals,
  threshold,
  blockedByNonce,
  conflict = false,
  rejectionPending = false,
  addressLabels,
  onOpen,
}: {
  proposal: SafeProposalRecord;
  chainName: string;
  nativeSymbol?: string;
  nativeDecimals?: number;
  threshold?: number;
  blockedByNonce?: number;
  conflict?: boolean;
  rejectionPending?: boolean;
  addressLabels?: ReadonlyMap<string, string>;
  onOpen: () => void;
}) {
  const presentation = getSafeProposalPresentation(proposal, {
    nativeSymbol,
    nativeDecimals,
    threshold,
    blockedByNonce,
    conflict,
    rejectionPending,
    addressLabels,
  });
  const statusColor = TONE_COLOR[presentation.statusTone];

  return (
    <ListItem
      interactive
      as="button"
      density="compact"
      minH="104px"
      py={3}
      align="stretch"
      aria-label={`Open Safe nonce ${proposal.transaction.nonce}: ${presentation.intent}. ${presentation.status}`}
      onClick={onOpen}
    >
      <Flex as="span" direction="column" w="full" gap={2}>
        <Text
          as="span"
          color="fg.muted"
          fontSize="xs"
          fontWeight="600"
          lineHeight="1.3"
          sx={{ fontVariantNumeric: "tabular-nums" }}
          aria-hidden="true"
        >
          Nonce{" "}
          <Text as="span" color="fg.primary">
            #{proposal.transaction.nonce}
          </Text>
        </Text>

        <Flex as="span" align="center" gap={3} minW={0}>
          <ListItemMedia
            boxSize="40px"
            borderRadius="md"
            bg="surface.sunken"
            border="1px solid"
            borderColor="border.subtle"
          >
            <ChainIcon
              chainId={proposal.chainId}
              chainName={chainName}
              size="22px"
              withChip
            />
          </ListItemMedia>

          <ListItemContent gap={1}>
            <HStack as="span" minW={0} spacing={2} justify="space-between">
              <ListItemTitle fontSize="sm" noOfLines={1}>
                {presentation.intent}
              </ListItemTitle>
              <ChevronRightIcon boxSize={4} color="fg.muted" flexShrink={0} />
            </HStack>
            <ListItemDescription fontSize="xs" noOfLines={1}>
              {presentation.context}
            </ListItemDescription>
            <HStack as="span" spacing={1.5} minW={0} color={statusColor}>
              {presentation.isProgressing ? (
                <Spinner boxSize="9px" color="currentColor" />
              ) : (
                <Box
                  as="span"
                  boxSize="6px"
                  borderRadius="full"
                  bg="currentColor"
                  flexShrink={0}
                />
              )}
              <Text
                as="span"
                minW={0}
                fontSize="xs"
                fontWeight="600"
                lineHeight="1.3"
                noOfLines={1}
              >
                {presentation.status}
              </Text>
            </HStack>
          </ListItemContent>
        </Flex>
      </Flex>
    </ListItem>
  );
}
