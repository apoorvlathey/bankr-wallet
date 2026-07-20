import { Box, Grid, HStack, Image, Text } from "@chakra-ui/react";
import { ListItem } from "@/components/ui";
import type { UnshieldOperation } from "@/components/Shield/model/unshield";
import { SHIELDED_ETH_LOGO_URL } from "@/components/Shield/model/shieldedAsset";
import { formatShieldWei } from "@/components/Shield/model/shieldQuote";
import { unshieldStatusCopy } from "@/components/Shield/model/shieldActivity";
import { truncateAddress } from "@/lib/addressUtils";
import { formatTimeAgo } from "./activityModel";

interface PrivacySendActivityItemProps {
  operation: UnshieldOperation;
  onClick?: () => void;
}

export default function PrivacySendActivityItem({
  operation,
  onClick,
}: PrivacySendActivityItemProps) {
  const failed = [
    "proof_failed",
    "relayer_rejected",
    "public_reverted",
    "failed_recoverable",
    "failed_needs_support",
  ].includes(operation.state);
  const complete = operation.state === "private_balance_updated";

  return (
    <ListItem
      as="button"
      type="button"
      interactive
      density="compact"
      minH="64px"
      px={3}
      py={2}
      gap={3}
      align="center"
      textAlign="left"
      onClick={onClick}
    >
      <Box position="relative" flexShrink={0}>
        <Image src={SHIELDED_ETH_LOGO_URL} alt="" boxSize="34px" />
      </Box>
      <Grid flex="1 1 auto" minW={0} templateColumns="minmax(0, 1fr)" alignItems="center">
        <HStack minW={0} spacing={2} justify="space-between">
          <Text minW={0} fontSize="sm" fontWeight="600" noOfLines={1}>
            Sent privately
          </Text>
          <Text
            flexShrink={0}
            fontSize="sm"
            fontWeight="600"
            color="chart.negative"
            sx={{ fontVariantNumeric: "tabular-nums" }}
          >
            −{formatShieldWei(operation.amountWei)} ETH
          </Text>
        </HStack>
        <HStack minW={0} spacing={2} justify="space-between">
          <Text minW={0} fontSize="xs" color="fg.secondary" noOfLines={1}>
            To {truncateAddress(operation.recipient)} · Sepolia
          </Text>
          <HStack flexShrink={0} spacing={1}>
            <Text
              fontSize="2xs"
              fontWeight="600"
              color={failed
                ? "status.error.fg"
                : complete
                  ? "status.success.fg"
                  : "status.warning.fg"}
              noOfLines={1}
            >
              {unshieldStatusCopy(operation.state)}
            </Text>
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
