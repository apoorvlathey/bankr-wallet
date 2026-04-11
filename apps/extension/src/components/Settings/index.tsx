import { useState, useEffect, memo, type ReactNode } from "react";
import {
  HStack,
  VStack,
  Text,
  Link,
  Box,
  Button,
  Badge,
  IconButton,
  Spacer,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  useDisclosure,
  Icon,
} from "@chakra-ui/react";
import { useThemedToast } from "@/hooks/useThemedToast";
import {
  ArrowBackIcon,
  LockIcon,
  ChevronRightIcon,
  DeleteIcon,
  TimeIcon,
  ChatIcon,
  RepeatIcon,
} from "@chakra-ui/icons";

import { clearChatHistory } from "@/chrome/chatStorage";
import { TWITTER_URL } from "@/constants/externalUrls";
import { ThemedCard, Decorator, useStripTokens, useTheme } from "@/theme";
import type { DecoratorAccent } from "@/theme";
import Chains from "./Chains";
import ChangePassword from "./ChangePassword";
import AutoLockSettings from "./AutoLockSettings";
import AgentPasswordSettings from "./AgentPasswordSettings";
import AppearanceSettings from "./AppearanceSettings";

// Robot/Agent icon for Agent Password section
const AgentIcon = (props: any) => (
  <Icon viewBox="0 0 24 24" {...props}>
    <path
      fill="currentColor"
      d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1H2a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h1a7 7 0 0 1 7-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 0 1 2-2M7.5 13A2.5 2.5 0 0 0 5 15.5A2.5 2.5 0 0 0 7.5 18a2.5 2.5 0 0 0 2.5-2.5A2.5 2.5 0 0 0 7.5 13m9 0a2.5 2.5 0 0 0-2.5 2.5a2.5 2.5 0 0 0 2.5 2.5a2.5 2.5 0 0 0 2.5-2.5a2.5 2.5 0 0 0-2.5-2.5Z"
    />
  </Icon>
);

// Paintbrush icon for Appearance section
const PaintBrushIcon = (props: any) => (
  <Icon viewBox="0 0 24 24" {...props}>
    <path
      fill="currentColor"
      d="M18 4V3a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-1a2 2 0 0 1 2 2v1a4 4 0 0 1-4 4h-3v2.72A1.28 1.28 0 0 1 11.72 21h-1.44A1.28 1.28 0 0 1 9 19.72V17H6a4 4 0 0 1-4-4V3a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3v1a2 2 0 0 1-2 2H5v6h12a3 3 0 0 0 3-3V4Z"
    />
  </Icon>
);

// Chain-link icon for Chain RPCs section. Uses currentColor so it inherits
// from `iconColor` and themes properly — the previous emoji had fixed colors
// and could not adapt to dark surfaces.
const LinkChainIcon = (props: any) => (
  <Icon viewBox="0 0 24 24" {...props}>
    <path
      fill="currentColor"
      d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1M8 13h8v-2H8zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5"
    />
  </Icon>
);

/**
 * Internal settings row — wraps ThemedCard with the consistent layout used by
 * every entry on the Settings menu (icon swatch + title + subtitle + chevron).
 *
 * `iconBg` and `iconColor` accept any Chakra color token so callers can mix
 * intent tokens (`accent.highlight`, `accent.primary`) with status colors as
 * needed. The corner ornament is rendered via `<Decorator>` so it's
 * automatically suppressed in themes without `decorators.cardCorner`.
 */
interface SettingsRowProps {
  title: string;
  subtitle: string;
  icon: ReactNode;
  iconBg: string;
  iconColor?: string;
  cornerAccent?: DecoratorAccent;
  cornerBg?: string;
  showChevron?: boolean;
  onClick?: () => void;
  disabled?: boolean;
  badge?: ReactNode;
  borderRadiusFull?: boolean;
}

function SettingsRow({
  title,
  subtitle,
  icon,
  iconBg,
  iconColor = "fg.inverse",
  cornerAccent = "highlight",
  cornerBg,
  showChevron = false,
  onClick,
  disabled = false,
  badge,
  borderRadiusFull = false,
}: SettingsRowProps) {
  // Strip tokens give us the proper inverted bar in each theme: BLACK box +
  // WHITE chevron in Bauhaus, recessed surface.sunken + light chevron in
  // Midnight. The previous `bg="fg.primary"` rendered as a stark off-white
  // square in Midnight (because fg.primary is near-white there).
  const chevronStrip = useStripTokens();
  return (
    <ThemedCard
      weight="medium"
      interactive={!disabled}
      p={4}
      position="relative"
      cursor={disabled ? "not-allowed" : "pointer"}
      onClick={disabled ? undefined : onClick}
      opacity={disabled ? 0.55 : 1}
    >
      <Decorator
        corner="top-right"
        accent={cornerAccent}
        {...(cornerBg ? { bg: cornerBg } : {})}
        {...(borderRadiusFull ? { borderRadius: "full" } : {})}
      />

      <HStack justify="space-between">
        <HStack spacing={3}>
          <Box p={2} bg={iconBg} color={iconColor}>
            {icon}
          </Box>
          <Box>
            <HStack spacing={2}>
              <Text fontWeight="700" color="text.primary">
                {title}
              </Text>
              {badge}
            </HStack>
            <Text fontSize="xs" color="text.secondary" fontWeight="500">
              {subtitle}
            </Text>
          </Box>
        </HStack>
        {showChevron && (
          <Box bg={chevronStrip.bg} p={1}>
            <ChevronRightIcon color={chevronStrip.fg} />
          </Box>
        )}
      </HStack>
    </ThemedCard>
  );
}

type SettingsTab =
  | "main"
  | "chains"
  | "changePassword"
  | "autoLock"
  | "agentPassword"
  | "appearance";

interface SettingsProps {
  close: () => void;
  showBackButton?: boolean;
  onSessionExpired?: () => void;
  initialTab?: SettingsTab;
  initialChainsTab?: "list" | "add";
  initialEditChainName?: string;
  onChainSaved?: (chain: { chainName: string; chainId: number }) => void;
}

function Settings({
  close,
  showBackButton = true,
  onSessionExpired,
  initialTab = "main",
  initialChainsTab = "list",
  initialEditChainName,
  onChainSaved,
}: SettingsProps) {
  const [tab, setTab] = useState<SettingsTab>(initialTab);
  const [isAgentPasswordEnabled, setIsAgentPasswordEnabled] = useState(false);
  const [passwordType, setPasswordType] = useState<"master" | "agent" | null>(null);
  const toast = useThemedToast();
  const { themeId } = useTheme();
  const isDarkTheme = themeId === "midnight";
  // Reused for the Chain RPCs chip — same recessed strip pattern as the
  // chevron, so the row reads as a "system" tile in both themes.
  const chainStrip = useStripTokens();
  const { isOpen: isDeleteModalOpen, onOpen: onDeleteModalOpen, onClose: onDeleteModalClose } = useDisclosure();
  const { isOpen: isChatDeleteModalOpen, onOpen: onChatDeleteModalOpen, onClose: onChatDeleteModalClose } = useDisclosure();

  const handleClearHistory = () => {
    chrome.runtime.sendMessage({ type: "clearTxHistory" }, () => {
      toast({
        title: "Transaction history cleared",
        status: "success",
        duration: 2000,
        isClosable: true,
      });
      onDeleteModalClose();
    });
  };

  const handleResetNonce = () => {
    chrome.runtime.sendMessage({ type: "clearNonceCache" }, () => {
      toast({
        title: "Nonce cache reset",
        status: "success",
        duration: 2000,
        isClosable: true,
      });
    });
  };

  const handleClearChatHistory = async () => {
    await clearChatHistory();
    toast({
      title: "Chat history cleared",
      status: "success",
      duration: 2000,
      isClosable: true,
    });
    onChatDeleteModalClose();
  };

  useEffect(() => {
    checkAgentPassword();
    checkPasswordType();
  }, []);

  const checkAgentPassword = async () => {
    const response = await new Promise<{ enabled: boolean }>((resolve) => {
      chrome.runtime.sendMessage({ type: "isAgentPasswordEnabled" }, resolve);
    });
    setIsAgentPasswordEnabled(response.enabled);
  };

  const checkPasswordType = async () => {
    const response = await new Promise<{ passwordType: "master" | "agent" | null }>((resolve) => {
      chrome.runtime.sendMessage({ type: "getPasswordType" }, resolve);
    });
    setPasswordType(response.passwordType);
  };

  if (tab === "chains") {
    return (
      <Chains
        close={() => setTab("main")}
        initialTab={initialChainsTab}
        initialEditChainName={initialEditChainName}
        onChainSaved={onChainSaved}
      />
    );
  }

  if (tab === "changePassword") {
    return (
      <ChangePassword
        onComplete={() => setTab("main")}
        onCancel={() => setTab("main")}
        onSessionExpired={onSessionExpired || (() => setTab("main"))}
      />
    );
  }

  if (tab === "autoLock") {
    return (
      <AutoLockSettings
        onComplete={() => setTab("main")}
        onCancel={() => setTab("main")}
      />
    );
  }

  if (tab === "agentPassword") {
    return (
      <AgentPasswordSettings
        onComplete={() => {
          checkAgentPassword();
          setTab("main");
        }}
        onCancel={() => setTab("main")}
        onSessionExpired={onSessionExpired || (() => setTab("main"))}
      />
    );
  }

  if (tab === "appearance") {
    return <AppearanceSettings onCancel={() => setTab("main")} />;
  }

  return (
    <VStack spacing={4} align="stretch" flex="1">
      {/* Header */}
      <HStack>
        {showBackButton && (
          <IconButton
            aria-label="Back"
            icon={<ArrowBackIcon />}
            variant="ghost"
            size="sm"
            onClick={close}
          />
        )}
        <Text fontSize="lg" fontWeight="900" color="text.primary" textTransform="uppercase" letterSpacing="tight">
          Settings
        </Text>
        <Spacer />
      </HStack>

      {/* Appearance — first row, themed picker entry */}
      <SettingsRow
        title="Appearance"
        subtitle="Choose theme and visual style"
        icon={<PaintBrushIcon boxSize={4} />}
        iconBg="accent.secondary"
        iconColor="accentFg.secondary"
        cornerAccent="secondary"
        showChevron
        onClick={() => setTab("appearance")}
      />

      {/* Change Password — disabled when unlocked with agent password */}
      <SettingsRow
        title="Change Password"
        subtitle={
          passwordType === "agent"
            ? "Unlock with master password to access"
            : "Update your encryption password"
        }
        icon={<LockIcon boxSize={4} />}
        iconBg="accent.highlight"
        iconColor="accentFg.highlight"
        cornerAccent="highlight"
        showChevron={passwordType !== "agent"}
        onClick={() => setTab("changePassword")}
        disabled={passwordType === "agent"}
      />

      {/* Agent Password — OFF state needs different neutrals per theme:
          Bauhaus has a white sunken surface and dark fg.muted that read as
          "disabled but visible". Midnight's surface.sunken (#070911) +
          fg.muted (#525A6E) are both dark and collapse into an invisible
          black void. Lift the chip onto surface.raisedHover with fg.secondary
          there so the OFF state still reads as a recessed neutral. */}
      <SettingsRow
        title="Agent Password"
        subtitle="Allow AI agents to unlock wallet"
        icon={<AgentIcon boxSize={4} />}
        iconBg={
          isAgentPasswordEnabled
            ? "accent.secondary"
            : isDarkTheme
              ? "surface.raisedHover"
              : "surface.sunken"
        }
        iconColor={
          isAgentPasswordEnabled
            ? "accentFg.secondary"
            : isDarkTheme
              ? "fg.secondary"
              : "fg.muted"
        }
        cornerAccent="secondary"
        showChevron
        onClick={() => setTab("agentPassword")}
        badge={
          <Badge
            bg={
              isAgentPasswordEnabled
                ? "accent.secondary"
                : isDarkTheme
                  ? "surface.raisedHover"
                  : "surface.sunken"
            }
            color={
              isAgentPasswordEnabled
                ? "accentFg.secondary"
                : isDarkTheme
                  ? "fg.secondary"
                  : "fg.muted"
            }
            border="2px solid"
            borderColor="border.default"
            fontSize="xs"
            fontWeight="700"
          >
            {isAgentPasswordEnabled ? "ON" : "OFF"}
          </Badge>
        }
      />

      {/* Auto-Lock Settings */}
      <SettingsRow
        title="Auto-Lock"
        subtitle="Configure wallet lock timeout"
        icon={<TimeIcon boxSize={4} />}
        iconBg="accent.highlight"
        iconColor="accentFg.highlight"
        cornerAccent="highlight"
        showChevron
        onClick={() => setTab("autoLock")}
      />

      {/* Chain RPCs — uses the same inverted strip palette as the chevron so
          the chip reads as a "system" tile in both themes (BLACK chip in
          Bauhaus, recessed surface.sunken in Midnight). The previous
          `iconBg="fg.primary"` rendered as a glaring near-white square in
          Midnight. Emoji replaced with an SVG so iconColor actually applies. */}
      <SettingsRow
        title="Chain RPCs"
        subtitle="Configure network RPC endpoints"
        icon={<LinkChainIcon boxSize={4} />}
        iconBg={chainStrip.bg}
        iconColor={chainStrip.fg}
        cornerBg="border.default"
        showChevron
        onClick={() => setTab("chains")}
      />

      {/* Clear Transaction History */}
      <SettingsRow
        title="Clear Transaction History"
        subtitle="Remove all transaction records"
        icon={<DeleteIcon boxSize={4} />}
        iconBg="accent.primary"
        iconColor="accentFg.primary"
        cornerAccent="primary"
        onClick={onDeleteModalOpen}
      />

      {/* Reset Nonce Cache */}
      <SettingsRow
        title="Reset Nonce Cache"
        subtitle="Fix stuck transactions from nonce conflicts"
        icon={<RepeatIcon boxSize={4} />}
        iconBg="accent.secondary"
        iconColor="accentFg.secondary"
        cornerAccent="secondary"
        onClick={handleResetNonce}
      />

      {/* Clear Chat History — circular corner ornament marks the soft action */}
      <SettingsRow
        title="Clear Chat History"
        subtitle="Remove all chat conversations"
        icon={<ChatIcon boxSize={4} />}
        iconBg="accent.primary"
        iconColor="accentFg.primary"
        cornerAccent="primary"
        borderRadiusFull
        onClick={onChatDeleteModalOpen}
      />

      {/* Delete Transaction History Confirmation Modal */}
      <Modal isOpen={isDeleteModalOpen} onClose={onDeleteModalClose} isCentered>
        <ModalOverlay bg="surface.overlay" />
        <ModalContent
          bg="surface.raised"
          border="3px solid"
          borderColor="border.default"
          boxShadow="modal"
          mx={4}
          borderRadius="0"
        >
          <ModalHeader
            color="fg.primary"
            fontWeight="900"
            fontSize="md"
            textTransform="uppercase"
            borderBottom="3px solid"
            borderColor="border.default"
          >
            Clear Transaction History?
          </ModalHeader>
          <ModalBody py={4}>
            <Text color="text.secondary" fontSize="sm" fontWeight="500">
              This will permanently delete all transaction records. This action cannot be undone.
            </Text>
          </ModalBody>
          <ModalFooter gap={2} borderTop="3px solid" borderColor="border.default">
            <Button variant="secondary" size="sm" onClick={onDeleteModalClose}>
              Cancel
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={handleClearHistory}
            >
              Delete
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* Delete Chat History Confirmation Modal */}
      <Modal isOpen={isChatDeleteModalOpen} onClose={onChatDeleteModalClose} isCentered>
        <ModalOverlay bg="surface.overlay" />
        <ModalContent
          bg="surface.raised"
          border="3px solid"
          borderColor="border.default"
          boxShadow="modal"
          mx={4}
          borderRadius="0"
        >
          <ModalHeader
            color="fg.primary"
            fontWeight="900"
            fontSize="md"
            textTransform="uppercase"
            borderBottom="3px solid"
            borderColor="border.default"
          >
            Clear Chat History?
          </ModalHeader>
          <ModalBody py={4}>
            <Text color="text.secondary" fontSize="sm" fontWeight="500">
              This will permanently delete all chat conversations. This action cannot be undone.
            </Text>
          </ModalBody>
          <ModalFooter gap={2} borderTop="3px solid" borderColor="border.default">
            <Button variant="secondary" size="sm" onClick={onChatDeleteModalClose}>
              Cancel
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={handleClearChatHistory}
            >
              Delete
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* Spacer to push footer to bottom */}
      <Box flex="1" />

      <Box h="3px" bg="border.default" w="full" />

      <HStack spacing={1} justify="center">
        <Text fontSize="sm" color="text.tertiary" fontWeight="500">
          Built by
        </Text>
        <Link
          display="flex"
          alignItems="center"
          gap={1}
          color="accent.secondary"
          fontWeight="700"
          _hover={{ color: "accent.primary" }}
          onClick={() => {
            chrome.tabs.create({ url: TWITTER_URL });
          }}
        >
          <Box
            as="svg"
            viewBox="0 0 24 24"
            w="14px"
            h="14px"
            fill="currentColor"
          >
            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
          </Box>
          <Text fontSize="sm" textDecor="underline">
            @apoorveth
          </Text>
        </Link>
      </HStack>
    </VStack>
  );
}

export default memo(Settings);
