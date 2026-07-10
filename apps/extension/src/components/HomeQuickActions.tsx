import { Box, Button, HStack, Icon, Text } from "@chakra-ui/react";
import { isDarkThemeId, useTheme } from "@/theme";

interface HomeQuickActionsProps {
  onReceive: () => void;
  onSend: () => void;
  onSwap: () => void;
  onMore: () => void;
  hasConnectedApps?: boolean;
}

const ReceiveIcon = () => (
  <Icon viewBox="0 0 24 24" boxSize="20px" aria-hidden="true">
    <path
      d="M7 7v10h10M7 17 17 7"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Icon>
);

const SendIcon = () => (
  <Icon viewBox="0 0 24 24" boxSize="20px" aria-hidden="true">
    <path
      d="M7 17 17 7M10 7h7v7"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Icon>
);

const SwapIcon = () => (
  <Icon viewBox="0 0 24 24" boxSize="20px" aria-hidden="true">
    <path
      d="M5 8h12m0 0-3-3m3 3-3 3M19 16H7m0 0 3 3m-3-3 3-3"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Icon>
);

const MoreIcon = () => (
  <Icon viewBox="0 0 24 24" boxSize="20px" aria-hidden="true">
    <path
      d="M5 5h5v5H5V5Zm9 0h5v5h-5V5ZM5 14h5v5H5v-5Zm9 0h5v5h-5v-5Z"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinejoin="round"
    />
  </Icon>
);

const actions = [
  { id: "receive", label: "Receive", icon: <ReceiveIcon /> },
  { id: "send", label: "Send", icon: <SendIcon /> },
  { id: "swap", label: "Swap", icon: <SwapIcon /> },
  { id: "more", label: "More", icon: <MoreIcon /> },
] as const;

/** Stable, mobile-style root actions with equal visual weight. */
export default function HomeQuickActions({
  onReceive,
  onSend,
  onSwap,
  onMore,
  hasConnectedApps = false,
}: HomeQuickActionsProps) {
  const { themeId } = useTheme();
  const isWarmMidnight = isDarkThemeId(themeId);
  const handlers = { receive: onReceive, send: onSend, swap: onSwap, more: onMore };

  return (
    <HStack as="nav" aria-label="Wallet actions" spacing={1} justify="space-between">
      {actions.map((action) => (
        <Button
          key={action.id}
          type="button"
          variant="ghost"
          flex="1"
          minW={0}
          h="auto"
          minH="72px"
          px={1}
          py={1}
          borderRadius="md"
          flexDirection="column"
          gap={2}
          color="fg.primary"
          aria-label={
            action.id === "more" && hasConnectedApps
              ? "More, connected app active"
              : action.label
          }
          onClick={handlers[action.id]}
          _hover={{ bg: "surface.raisedHover" }}
          _active={{ bg: "surface.sunken" }}
        >
          <Box
            display="flex"
            alignItems="center"
            justifyContent="center"
            boxSize="40px"
            borderRadius={isWarmMidnight ? "md" : "full"}
            bg={
              action.id === "send"
                ? isWarmMidnight
                  ? "accent.highlight"
                  : "accent.primary"
                : "surface.raised"
            }
            color={
              action.id === "send"
                ? isWarmMidnight
                  ? "accentFg.highlight"
                  : "accentFg.primary"
                : isWarmMidnight && action.id !== "more"
                  ? "accent.highlight"
                  : "fg.primary"
            }
            borderWidth={action.id === "send" ? "0" : "1px"}
            borderColor="border.subtle"
            position="relative"
          >
            {action.icon}
            {action.id === "more" && hasConnectedApps && (
              <Box
                position="absolute"
                top="-4px"
                right="-4px"
                boxSize="10px"
                borderRadius="full"
                bg="accent.highlight"
                border="2px solid"
                borderColor="surface.base"
                aria-hidden="true"
              />
            )}
          </Box>
          <Text as="span" fontSize="sm" fontWeight="600" lineHeight="1.2">
            {action.label}
          </Text>
        </Button>
      ))}
    </HStack>
  );
}
