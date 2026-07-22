import { Box, Grid, HStack, Text } from "@chakra-ui/react";
import type { SafeProposalRecord } from "@/chrome/safe/types";
import type { DappOriginDisplay } from "@/lib/dappOriginDisplay";
import ChainIcon from "@/components/ChainIcon";
import SafeImage from "@/components/SafeImage";
import { ActivityStatusLabel } from "@/components/Activity/ActivityStatus";
import { formatTimeAgo } from "@/components/Activity/activityModel";
import { SafeIcon } from "@/components/shared/AccountTypeIcons";
import { ListItem } from "@/components/ui";
import { useIconChipBg, useTheme } from "@/theme";
import { getSafeProposalPresentation } from "./safeProposalPresentation";
import { useSafeProposalFunctionNames } from "./hooks/useSafeProposalFunctionNames";

function SafeActivityMedia({
  proposal,
  chainName,
  originDisplay,
}: {
  proposal: SafeProposalRecord;
  chainName: string;
  originDisplay: DappOriginDisplay;
}) {
  const iconChipBg = useIconChipBg();
  const { tokens } = useTheme();
  const isWalletChan = originDisplay.label === "WalletChan";
  const imageSrc = isWalletChan
    ? "/walletchan-icon.png"
    : originDisplay.faviconSrc || originDisplay.faviconFallbackSrc;
  const fallback = <SafeIcon boxSize="20px" color="status.success.emphasis" />;
  const mediaBg = !imageSrc && tokens.colorMode === "dark"
    ? "status.success.bg"
    : iconChipBg;

  return (
    <Box position="relative" flexShrink={0} w="32px" h="32px">
      <Box
        w="32px"
        h="32px"
        display="flex"
        alignItems="center"
        justifyContent="center"
        overflow="hidden"
        bg={mediaBg}
        border="1px solid"
        borderColor="border.default"
        borderRadius={originDisplay.hostname ? "md" : "full"}
      >
        {imageSrc ? (
          <SafeImage
            src={imageSrc}
            fallbackSrc={isWalletChan ? undefined : originDisplay.faviconFallbackSrc}
            alt={`${originDisplay.label} icon`}
            boxSize={originDisplay.hostname ? "28px" : "24px"}
            objectFit="cover"
            fallback={fallback}
          />
        ) : fallback}
      </Box>
      <Box
        position="absolute"
        bottom="-2px"
        right="-2px"
        w="14px"
        h="14px"
        borderRadius="full"
        bg={iconChipBg}
        border="1px solid"
        borderColor="surface.raised"
        display="flex"
        alignItems="center"
        justifyContent="center"
      >
        <ChainIcon chainId={proposal.chainId} chainName={chainName} size="10px" />
      </Box>
    </Box>
  );
}

export function SafeProposalActivityRow({
  proposal,
  chainName,
  nativeSymbol,
  nativeDecimals,
  threshold,
  addressLabels,
  originDisplay,
  onOpen,
}: {
  proposal: SafeProposalRecord;
  chainName: string;
  nativeSymbol?: string;
  nativeDecimals?: number;
  threshold?: number;
  addressLabels: ReadonlyMap<string, string>;
  originDisplay: DappOriginDisplay;
  onOpen: () => void;
}) {
  const decodedFunctionNames = useSafeProposalFunctionNames(
    proposal.id,
    proposal.calls,
  );
  const presentation = getSafeProposalPresentation(proposal, {
    nativeSymbol,
    nativeDecimals,
    threshold,
    addressLabels,
    decodedFunctionNames,
  });
  const context = `${presentation.context} · ${originDisplay.label}`;
  const isReadyToExecute = proposal.state === "readyToExecute";

  return (
    <ListItem
      interactive
      as="button"
      density="compact"
      minH="72px"
      w={isReadyToExecute ? "calc(100% - 8px)" : "full"}
      mx={isReadyToExecute ? 1 : 0}
      px={isReadyToExecute ? 2.5 : 3}
      py={2}
      gap={3}
      overflow="hidden"
      bg={isReadyToExecute ? "status.warning.tint" : undefined}
      boxShadow={isReadyToExecute
        ? "inset 0 0 0 1px var(--chakra-colors-status-warning-border)"
        : undefined}
      borderRadius={isReadyToExecute ? "lg" : undefined}
      _hover={isReadyToExecute ? { bg: "status.warning.bg" } : undefined}
      _active={isReadyToExecute ? { bg: "surface.sunken" } : undefined}
      aria-label={`Open Safe nonce ${proposal.transaction.nonce}: ${presentation.intent}. ${presentation.status}`}
      onClick={onOpen}
    >
      <SafeActivityMedia
        proposal={proposal}
        chainName={chainName}
        originDisplay={originDisplay}
      />

      <Grid flex="1 1 auto" minW={0} rowGap={0.5} templateColumns="minmax(0, 1fr)">
        <HStack minW={0} w="full" spacing={2} justify="space-between">
          <Text
            flex="1 1 auto"
            minW={0}
            fontSize="sm"
            fontWeight="600"
            color="fg.primary"
            lineHeight="1.35"
            noOfLines={1}
          >
            {presentation.intent}
          </Text>
          <Box maxW="124px" flexShrink={0}>
            <ActivityStatusLabel
              label={presentation.status}
              tone={isReadyToExecute ? "warning" : presentation.statusTone}
              isPending={presentation.isProgressing}
              icon={isReadyToExecute ? "hourglass" : undefined}
            />
          </Box>
        </HStack>

        <HStack minW={0} w="full" spacing={2} justify="space-between">
          <Text
            flex="1 1 auto"
            minW={0}
            fontSize="xs"
            color="fg.secondary"
            lineHeight="1.35"
            noOfLines={1}
          >
            {context}
          </Text>
          <HStack
            flexShrink={0}
            spacing={1}
            color="fg.muted"
            sx={{ fontVariantNumeric: "tabular-nums" }}
          >
            <Text as="span" fontSize="2xs" fontWeight="500" lineHeight="1.3">
              Nonce{" "}
              <Box as="span" color="fg.primary">
                #{proposal.transaction.nonce}
              </Box>
            </Text>
            <Text as="span" aria-hidden="true" fontSize="2xs">·</Text>
            <Text as="span" fontSize="2xs" fontWeight="500" lineHeight="1.3">
              {formatTimeAgo(proposal.createdAt, Date.now())}
            </Text>
          </HStack>
        </HStack>
      </Grid>
    </ListItem>
  );
}
