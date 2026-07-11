import { useRef } from "react";
import {
  Box,
  HStack,
  Icon,
  IconButton,
  Image,
  Tooltip,
  useDisclosure,
} from "@chakra-ui/react";
import {
  ChatIcon,
  ExternalLinkIcon,
  HamburgerIcon,
  LockIcon,
  SettingsIcon,
} from "@chakra-ui/icons";
import BrandWordmark from "@/components/BrandWordmark";
import { ActionSheet } from "@/components/ui";

interface AppHeaderBarProps {
  isAgentSession: boolean;
  canChat: boolean;
  sidePanelSupported: boolean;
  sidePanelMode: boolean;
  isFullscreenTab: boolean;
  onChat: () => void;
  onLock: () => void;
  onSettings: () => void;
  onToggleSidePanel: () => void;
  onOpenFullscreen: () => void;
  onBuyWchan: () => void;
  onOpenWalletChanOs: () => void;
}

const SidePanelIcon = () => (
  <Icon viewBox="0 0 24 24" boxSize="20px" aria-hidden="true">
    <path
      fill="currentColor"
      d="M3 3h18a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zm12 2v14h5V5h-5zM4 5v14h10V5H4z"
    />
  </Icon>
);

const FullscreenIcon = () => (
  <Icon viewBox="0 0 24 24" boxSize="20px" aria-hidden="true">
    <path
      fill="currentColor"
      d="M14 3v2h3.59l-4.3 4.29 1.42 1.42L19 6.41V10h2V3h-7zM5 17.59V14H3v7h7v-2H6.41l4.3-4.29-1.42-1.42L5 17.59z"
    />
  </Icon>
);

/**
 * Compact root header. Daily trust actions stay visible; display and ecosystem
 * utilities live in one mobile action sheet instead of competing in the bar.
 */
export default function AppHeaderBar({
  isAgentSession,
  canChat,
  sidePanelSupported,
  sidePanelMode,
  isFullscreenTab,
  onChat,
  onLock,
  onSettings,
  onToggleSidePanel,
  onOpenFullscreen,
  onBuyWchan,
  onOpenWalletChanOs,
}: AppHeaderBarProps) {
  const options = useDisclosure();
  const optionsButtonRef = useRef<HTMLButtonElement>(null);
  const choices = [
    ...(canChat
      ? [
          {
            id: "chat",
            label: "Chat with WalletChan",
            icon: <ChatIcon boxSize="18px" aria-hidden="true" />,
          },
        ]
      : []),
    ...(sidePanelSupported && !isFullscreenTab
      ? [
          {
            id: "panel",
            label: sidePanelMode ? "Switch to Popup" : "Switch to Side Panel",
            icon: <SidePanelIcon />,
          },
        ]
      : []),
    ...(!isFullscreenTab
      ? [
          {
            id: "fullscreen",
            label: "Open in fullscreen tab",
            icon: <FullscreenIcon />,
          },
        ]
      : []),
    {
      id: "wchan",
      label: "Buy $WCHAN",
      icon: <Icon viewBox="0 0 24 24" boxSize="20px" aria-hidden="true"><path fill="currentColor" d="M16 17.01V10h-2v7.01h-3L15 21l4-3.99h-3zM9 3L5 6.99h3V14h2V6.99h3L9 3z" /></Icon>,
    },
    {
      id: "os",
      label: "WalletChan OS",
      description: "Your Web3 Operating System",
      icon: <ExternalLinkIcon boxSize="18px" aria-hidden="true" />,
    },
  ];

  return (
    <>
      <HStack
        as="header"
        minH="56px"
        px={4}
        spacing={2}
        bg="surface.raised"
        borderBottomWidth="1px"
        borderColor="border.subtle"
        flexShrink={0}
      >
        <Box position="relative" flexShrink={0}>
          <Image
            src="walletchan-icon-white-bg.png"
            alt=""
            boxSize="32px"
            borderRadius="md"
          />
          {isAgentSession && (
            <Tooltip
              label="Agent session: sensitive account actions are restricted."
              placement="bottom-start"
              hasArrow
            >
              <Box
                position="absolute"
                right="-2px"
                bottom="-2px"
                boxSize="10px"
                borderRadius="full"
                bg="status.warning.fg"
                border="2px solid"
                borderColor="surface.raised"
                aria-label="Agent session"
              />
            </Tooltip>
          )}
        </Box>

        <BrandWordmark
          as="div"
          flex={1}
          minW={0}
          overflow="hidden"
          textOverflow="ellipsis"
        />

        <HStack spacing={0}>
          {canChat && (
            <IconButton
              aria-label="Chat"
              title="Chat"
              icon={<ChatIcon />}
              variant="ghost"
              size="sm"
              minW="44px"
              h="44px"
              onClick={onChat}
              sx={{
                "@media (max-width: 339px)": {
                  display: "none",
                },
              }}
            />
          )}
          <IconButton
            aria-label="Lock wallet"
            title="Lock wallet"
            icon={<LockIcon />}
            variant="ghost"
            size="sm"
            minW="44px"
            h="44px"
            onClick={onLock}
          />
          <IconButton
            aria-label="Settings"
            title="Settings"
            icon={<SettingsIcon />}
            variant="ghost"
            size="sm"
            minW="44px"
            h="44px"
            onClick={onSettings}
          />
          <IconButton
            ref={optionsButtonRef}
            aria-label="More app options"
            title="More app options"
            icon={<HamburgerIcon />}
            variant="ghost"
            size="sm"
            minW="44px"
            h="44px"
            onClick={options.onOpen}
          />
        </HStack>
      </HStack>

      <ActionSheet
        isOpen={options.isOpen}
        onClose={options.onClose}
        finalFocusRef={optionsButtonRef}
        title="App options"
        choices={choices}
        onSelect={(id) => {
          if (id === "chat") onChat();
          if (id === "panel") onToggleSidePanel();
          if (id === "fullscreen") onOpenFullscreen();
          if (id === "wchan") onBuyWchan();
          if (id === "os") onOpenWalletChanOs();
        }}
      />
    </>
  );
}
