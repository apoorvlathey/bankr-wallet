import { Box, Grid, HStack, Text } from "@chakra-ui/react";
import type { CompletedTransaction } from "@/chrome/txHistoryStorage";
import ShieldComplianceProgress from "@/components/Shield/ShieldComplianceProgress";
import { ListItem } from "@/components/ui";
import { isDarkThemeId, useIconChipBg, useTheme } from "@/theme";
import type { DappOriginDisplay } from "@/lib/dappOriginDisplay";
import { isPrivacyShieldCompliancePending } from "@/lib/privacyShieldLifecycle";
import ActivityMedia from "./ActivityMedia";
import ActivityExplorerActions from "./ActivityExplorerActions";
import ActivityStatus from "./ActivityStatus";
import { useActivityExplorers } from "./useActivityExplorers";
import {
  formatTimeAgo,
  getActivityPresentation,
  getActivityStatusModel,
} from "./activityModel";

interface ActivityItemProps {
  tx: CompletedTransaction;
  originDisplay?: DappOriginDisplay;
  addressLabels: ReadonlyMap<string, string>;
  onClick: () => void;
  resolveLogo: (url: string | undefined) => string | undefined;
}

export default function ActivityItem({
  tx,
  originDisplay,
  addressLabels,
  onClick,
  resolveLogo,
}: ActivityItemProps) {
  const iconChipBg = useIconChipBg();
  const { themeId } = useTheme();
  const isDarkTheme = isDarkThemeId(themeId);
  const presentation = getActivityPresentation(
    tx,
    addressLabels,
    originDisplay?.resolvedName,
  );
  const statusModel = getActivityStatusModel(tx);
  const explorer = useActivityExplorers(tx);
  const isOutgoingValue = presentation.value?.startsWith("−") ?? false;
  const isIncomingValue = presentation.value?.startsWith("+") ?? false;
  const shieldState = tx.privacyShieldMeta?.state;
  const compliancePending = shieldState
    ? isPrivacyShieldCompliancePending(shieldState)
    : false;
  const confirmedAt = tx.completedAt ?? tx.privacyShieldMeta?.updatedAt;

  return (
    <ListItem
      density="compact"
      minH="64px"
      px={3}
      py={2}
      gap={3}
      align="center"
      overflow="hidden"
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
        aria-label={`Open transaction details for ${presentation.intent}`}
        onClick={onClick}
      />

      <Box position="relative" zIndex={1} flexShrink={0} pointerEvents="none">
        <ActivityMedia
          tx={tx}
          originHostname={presentation.originHostname}
          originFaviconSrc={originDisplay?.faviconSrc}
          originFaviconFallbackSrc={originDisplay?.faviconFallbackSrc}
          iconChipBg={iconChipBg}
          isDarkTheme={isDarkTheme}
          resolveLogo={resolveLogo}
        />
      </Box>

      <Grid
        position="relative"
        zIndex={1}
        pointerEvents="none"
        flex="1 1 auto"
        minW={0}
        templateColumns="minmax(0, 1fr)"
        rowGap={tx.bridge ? 0.5 : 0}
        alignItems="center"
      >
        <HStack
          gridColumn="1"
          minW={0}
          w="full"
          spacing={2}
          justify="space-between"
        >
          <Text
            flex="1 1 auto"
            minW={0}
            fontSize="sm"
            fontWeight="600"
            color="fg.primary"
            lineHeight="1.35"
            whiteSpace="nowrap"
            overflow="hidden"
            textOverflow="ellipsis"
          >
            {presentation.intent}
          </Text>

          {(presentation.value ||
            explorer.hasViewableTx ||
            explorer.hasBridgeDestLink) && (
            <HStack flexShrink={0} minW={0} spacing={1} justify="flex-end">
              {presentation.value && (
                <Text
                  maxW={{ base: "112px", sm: "160px" }}
                  fontSize="sm"
                  fontWeight="600"
                  color={isOutgoingValue
                    ? "chart.negative"
                    : isIncomingValue
                      ? "chart.positive"
                      : "fg.primary"}
                  lineHeight="1.35"
                  textAlign="end"
                  sx={{ fontVariantNumeric: "tabular-nums" }}
                  noOfLines={1}
                >
                  <Box as="span" display={{ base: "none", sm: "inline" }}>
                    {presentation.value}
                  </Box>
                  <Box as="span" display={{ base: "inline", sm: "none" }}>
                    {presentation.compactValue}
                  </Box>
                </Text>
              )}
              <Box
                position="relative"
                zIndex={2}
                flexShrink={0}
                pointerEvents="auto"
              >
                <ActivityExplorerActions tx={tx} explorer={explorer} />
              </Box>
            </HStack>
          )}
        </HStack>

        {compliancePending ? (
          <HStack
            gridColumn="1"
            minW={0}
            w="full"
            spacing={2}
            justify="space-between"
          >
            <Box flex="1 1 auto" minW={0}>
              <ActivityStatus tx={tx} model={statusModel} />
            </Box>
            <Text
              fontSize="2xs"
              color="fg.muted"
              fontWeight="500"
              lineHeight="1.3"
              sx={{ fontVariantNumeric: "tabular-nums" }}
              flexShrink={0}
            >
              {formatTimeAgo(tx.createdAt, Date.now())}
            </Text>
          </HStack>
        ) : (
          <HStack
            gridColumn="1"
            minW={0}
            w="full"
            spacing={2}
            justify="space-between"
          >
            <Text
              flex="1 1 auto"
              minW={0}
              fontSize="xs"
              color="fg.secondary"
              lineHeight="1.35"
              whiteSpace="nowrap"
              overflow="hidden"
              textOverflow="ellipsis"
            >
              {presentation.context || tx.chainName}
            </Text>

            <HStack
              flexShrink={0}
              spacing={1}
              justify="flex-end"
              color="fg.muted"
            >
              <ActivityStatus tx={tx} model={statusModel} />
              <Text aria-hidden="true" fontSize="2xs" color="fg.muted">
                ·
              </Text>
              <Text
                fontSize="2xs"
                color="fg.muted"
                fontWeight="500"
                lineHeight="1.3"
                sx={{ fontVariantNumeric: "tabular-nums" }}
                flexShrink={0}
              >
                {formatTimeAgo(tx.createdAt, Date.now())}
              </Text>
            </HStack>
          </HStack>
        )}

        {compliancePending && shieldState ? (
          <Box gridColumn="1" pt={1}>
            <ShieldComplianceProgress
              state={shieldState}
              confirmedAt={confirmedAt}
              compact
            />
          </Box>
        ) : null}
      </Grid>
    </ListItem>
  );
}
