import { ExternalLinkIcon } from "@chakra-ui/icons";
import { Box, Grid, HStack, IconButton, Image, Text, Tooltip } from "@chakra-ui/react";
import { ListItem } from "@/components/ui";
import type { UnshieldOperation } from "@/components/Shield/model/unshield";
import {
  SHIELDED_ETH_LOGO_URL,
  SHIELDED_ETH_NETWORK_NAME,
  SHIELDED_ETH_EXPLORER_URL,
} from "@/components/Shield/model/shieldedAsset";
import { formatShieldWei } from "@/components/Shield/model/shieldQuote";
import { unshieldStatusCopy } from "@/components/Shield/model/shieldActivity";
import { playInteractionSound } from "@/sounds/soundManager";
import {
  formatActivityAddress,
  getLiveActivityAddressLabel,
} from "./activityIdentityModel";
import { formatTimeAgo } from "./activityModel";
import { ActivityStatusLabel } from "./ActivityStatus";

interface UnshieldActivityItemProps {
  operation: UnshieldOperation;
  addressLabels: ReadonlyMap<string, string>;
  onClick?: () => void;
}

export default function UnshieldActivityItem({
  operation,
  addressLabels,
  onClick,
}: UnshieldActivityItemProps) {
  const failed = [
    "proof_failed",
    "relayer_rejected",
    "public_reverted",
    "failed_recoverable",
    "failed_needs_support",
  ].includes(operation.state) || (
    operation.method === "direct" && operation.state === "failed_recoverable" &&
    (operation.errorCode === "submission-failed" ||
      operation.errorCode === "interrupted-before-confirmation" ||
      operation.errorCode === "interrupted-before-submission")
  );
  const complete = operation.state === "private_balance_updated";
  const recipient = getLiveActivityAddressLabel(operation.recipient, addressLabels) ??
    formatActivityAddress(operation.recipient);
  const explorerUrl = operation.txHash
    ? `${SHIELDED_ETH_EXPLORER_URL}/tx/${operation.txHash}`
    : null;

  return (
    <ListItem
      density="compact"
      minH="64px"
      px={3}
      py={2}
      gap={3}
      align="center"
    >
      <Box
        as="button"
        type="button"
        position="absolute"
        inset={0}
        zIndex={0}
        w="full"
        h="full"
        bg="transparent"
        border={0}
        appearance="none"
        cursor="pointer"
        transitionProperty="background-color, box-shadow"
        transitionDuration="fast"
        _hover={{ bg: "surface.raisedHover" }}
        _active={{ bg: "surface.sunken" }}
        _focus={{ outline: "none" }}
        _focusVisible={{
          zIndex: 1,
          boxShadow: "inset 0 0 0 2px var(--chakra-colors-border-focus)",
        }}
        aria-label="Open Unshield transaction details"
        onMouseEnter={() =>
          void playInteractionSound("portfolioTokenHover")
        }
        onClick={onClick}
      />
      <Box position="relative" zIndex={1} flexShrink={0} pointerEvents="none">
        <Image src={SHIELDED_ETH_LOGO_URL} alt="" boxSize="34px" />
      </Box>
      <Grid
        position="relative"
        zIndex={1}
        pointerEvents="none"
        flex="1 1 auto"
        minW={0}
        templateColumns="minmax(0, 1fr)"
        alignItems="center"
      >
        <HStack minW={0} spacing={2} justify="space-between">
          <Text minW={0} fontSize="sm" fontWeight="600" noOfLines={1}>
            Unshield ETH
          </Text>
          <HStack flexShrink={0} minW={0} spacing={1} justify="flex-end">
            <Text
              flexShrink={0}
              fontSize="sm"
              fontWeight="600"
              color="chart.negative"
              sx={{ fontVariantNumeric: "tabular-nums" }}
            >
              −{formatShieldWei(operation.amountWei)} ETH
            </Text>
            {explorerUrl ? (
              <Box position="relative" zIndex={2} pointerEvents="auto">
                <Tooltip label="View on explorer" fontSize="2xs" openDelay={300} hasArrow>
                  <IconButton
                    aria-label={`View transaction on ${SHIELDED_ETH_NETWORK_NAME} explorer`}
                    icon={<ExternalLinkIcon boxSize="14px" />}
                    minW="24px"
                    minH="24px"
                    w="24px"
                    h="24px"
                    borderRadius="sm"
                    variant="ghost"
                    color="fg.muted"
                    _hover={{ color: "fg.primary", bg: "surface.raisedHover" }}
                    _active={{ bg: "surface.sunken" }}
                    onClick={(event) => {
                      event.stopPropagation();
                      void chrome.tabs.create({ url: explorerUrl });
                    }}
                  />
                </Tooltip>
              </Box>
            ) : null}
          </HStack>
        </HStack>
        <HStack minW={0} spacing={2} justify="space-between">
          <Text minW={0} fontSize="xs" color="fg.secondary" noOfLines={1}>
            To {recipient} · {SHIELDED_ETH_NETWORK_NAME}
          </Text>
          <HStack flexShrink={0} spacing={1}>
            {operation.state === "submitted" ? (
              <ActivityStatusLabel label="Pending" tone="info" isPending />
            ) : (
              <Text
                fontSize="2xs"
                fontWeight="600"
                color={failed
                  ? "status.error.emphasis"
                  : complete
                    ? "status.success.emphasis"
                    : "status.warning.emphasis"}
                noOfLines={1}
              >
                {unshieldStatusCopy(operation.state, operation.method, operation.errorCode)}
              </Text>
            )}
            <Text fontSize="2xs" color="fg.muted">·</Text>
            <Text fontSize="2xs" color="fg.muted" flexShrink={0}>
              {formatTimeAgo(operation.createdAt, Date.now())}
            </Text>
          </HStack>
        </HStack>
      </Grid>
    </ListItem>
  );
}
