import { Box, HStack, Image, Text, VStack } from "@chakra-ui/react";
import type { CompletedTransaction } from "@/chrome/txHistoryStorage";
import { isDarkThemeId, useIconChipBg, useTheme } from "@/theme";
import ActivityExplorerActions from "./ActivityExplorerActions";
import ActivityMedia from "./ActivityMedia";
import ActivityStatus from "./ActivityStatus";
import {
  formatTimeAgo,
  getActivityPresentation,
  getActivityStatusModel,
} from "./activityModel";
import { useActivityExplorers } from "./useActivityExplorers";

interface ActivityItemProps {
  tx: CompletedTransaction;
  onClick: () => void;
  resolveLogo: (url: string | undefined) => string | undefined;
  flush: boolean | undefined;
}

export default function ActivityItem({
  tx,
  onClick,
  resolveLogo,
  flush,
}: ActivityItemProps) {
  const iconChipBg = useIconChipBg();
  const { themeId } = useTheme();
  const isDarkTheme = isDarkThemeId(themeId);
  const explorer = useActivityExplorers(tx);
  const presentation = getActivityPresentation(tx);
  const statusModel = getActivityStatusModel(tx);

  return (
    <Box
      as="li"
      w="full"
      m={0}
      p={0}
      listStyleType="none"
      borderBottomWidth="1px"
      borderBottomStyle="solid"
      borderBottomColor="border.subtle"
      _last={{ borderBottomWidth: 0 }}
    >
      <HStack spacing={0} align="stretch">
        <HStack
          as="button"
          type="button"
          flex="1 1 auto"
          minW={0}
          minH="72px"
          spacing={3}
          align="center"
          py={3}
          pl={flush ? 1 : 3}
          pr={
            explorer.hasViewableTx || explorer.hasBridgeDestLink
              ? 2
              : flush
                ? 1
                : 3
          }
          textAlign="start"
          color="fg.primary"
          bg="transparent"
          borderWidth={0}
          cursor="pointer"
          aria-label={`Open transaction details for ${presentation.intent}`}
          onClick={onClick}
          transitionProperty="background-color, box-shadow"
          transitionDuration="fast"
          _hover={{ bg: "surface.raisedHover" }}
          _active={{ bg: "surface.sunken" }}
          _focus={{ outline: "none" }}
          _focusVisible={{
            zIndex: 1,
            boxShadow: "inset 0 0 0 2px var(--chakra-colors-border-focus)",
          }}
        >
          <ActivityMedia
            tx={tx}
            originHostname={presentation.originHostname}
            iconChipBg={iconChipBg}
            isDarkTheme={isDarkTheme}
            resolveLogo={resolveLogo}
          />

          <Box flex="1 1 auto" minW={0}>
            <HStack spacing={1.5} minW={0}>
              {tx.clearSignedMeta?.tokenLogo && (
                <Image
                  src={resolveLogo(tx.clearSignedMeta.tokenLogo)}
                  alt=""
                  boxSize="16px"
                  borderRadius="full"
                  flexShrink={0}
                />
              )}
              <Text
                fontSize="sm"
                fontWeight="600"
                color="fg.primary"
                lineHeight="1.35"
                noOfLines={1}
              >
                {presentation.intent}
              </Text>
            </HStack>
            {presentation.context && (
              <Text
                mt={0.5}
                fontSize="xs"
                color="fg.secondary"
                lineHeight="1.35"
                noOfLines={1}
              >
                {presentation.context}
              </Text>
            )}
            {tx.status === "failed" && tx.error && (
              <Text
                mt={0.5}
                fontSize="xs"
                color="chart.negative"
                lineHeight="1.35"
                noOfLines={1}
              >
                {tx.error}
              </Text>
            )}
          </Box>

          <VStack
            spacing={0.5}
            flex="0 1 auto"
            minW={0}
            maxW="46%"
            align="flex-end"
          >
            {presentation.value && (
              <Text
                fontSize="sm"
                fontWeight="600"
                color="fg.primary"
                lineHeight="1.35"
                textAlign="end"
                sx={{ fontVariantNumeric: "tabular-nums" }}
                noOfLines={1}
              >
                {presentation.value}
              </Text>
            )}
            <ActivityStatus tx={tx} model={statusModel} />
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
          </VStack>
        </HStack>

        <ActivityExplorerActions tx={tx} explorer={explorer} />
      </HStack>
    </Box>
  );
}
