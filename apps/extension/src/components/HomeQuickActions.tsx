import { Box, Button, Grid, Icon, Text } from "@chakra-ui/react";
import { isDarkThemeId, useTheme } from "@/theme";
import { playInteractionSound } from "@/sounds/soundManager";

interface HomeQuickActionsProps {
  onSend: () => void;
  onSwap: () => void;
  onReceive: () => void;
  onMore: () => void;
  hasConnectedApps?: boolean;
}

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

/* Shield will return in a future release.
const ShieldIcon = () => (
  <Icon viewBox="0 0 24 24" boxSize="20px" aria-hidden="true">
    <path
      d="M14 18a2 2 0 0 0-4 0M19 11l-2.11-6.657a2 2 0 0 0-2.752-1.148l-1.276.61A2 2 0 0 1 12 4H8.5a2 2 0 0 0-1.925 1.456L5 11M2 11h20"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <circle
      cx="17"
      cy="18"
      r="3"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    />
    <circle
      cx="7"
      cy="18"
      r="3"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    />
  </Icon>
);
*/

const ReceiveIcon = () => (
  <Icon viewBox="0 0 24 24" boxSize="20px" aria-hidden="true">
    <path
      d="m17 7-10 10m0-7v7h7"
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
  { id: "send", label: "Send", icon: <SendIcon /> },
  { id: "swap", label: "Swap", icon: <SwapIcon /> },
  // { id: "shield", label: "Shield", icon: <ShieldIcon /> },
  { id: "receive", label: "Receive", icon: <ReceiveIcon /> },
  { id: "more", label: "More", icon: <MoreIcon /> },
] as const;

/** Stable, mobile-style root actions with equal spacing and bounded tap targets. */
export default function HomeQuickActions({
  onSend,
  onSwap,
  onReceive,
  onMore,
  hasConnectedApps = false,
}: HomeQuickActionsProps) {
  const { themeId } = useTheme();
  const isWarmMidnight = isDarkThemeId(themeId);
  const handlers = {
    send: onSend,
    swap: onSwap,
    receive: onReceive,
    more: onMore,
  };

  return (
    <Grid
      as="nav"
      aria-label="Wallet actions"
      templateColumns="repeat(4, minmax(0, 1fr))"
      columnGap={{ base: 1, sm: 2 }}
      w="100%"
      maxW="620px"
      mx="auto"
    >
      {actions.map((action) => (
        <Button
          key={action.id}
          type="button"
          variant="ghost"
          w="100%"
          maxW="88px"
          justifySelf="center"
          minW={0}
          h="auto"
          minH="78px"
          px={2}
          py={1.5}
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
          onMouseEnter={() => void playInteractionSound("quickActionHover")}
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
              action.id === "swap"
                ? isWarmMidnight
                  ? "accent.highlight"
                  : "accent.primary"
                : "surface.raised"
            }
            color={
              action.id === "swap"
                ? isWarmMidnight
                  ? "accentFg.highlight"
                  : "accentFg.primary"
                : isWarmMidnight && action.id !== "more"
                  ? "accent.highlight"
                  : "fg.primary"
            }
            borderWidth={action.id === "swap" ? "0" : "1px"}
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
    </Grid>
  );
}
