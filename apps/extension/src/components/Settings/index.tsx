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
import { ArrowBackIcon, ChevronRightIcon } from "@chakra-ui/icons";

import { clearChatHistory } from "@/chrome/chatStorage";
import { TWITTER_URL } from "@/constants/externalUrls";
import { ThemedCard, Decorator, useStripTokens, useTheme } from "@/theme";
import type { DecoratorAccent } from "@/theme";
import Chains from "./Chains";
import ChangePassword from "./ChangePassword";
import AutoLockSettings from "./AutoLockSettings";
import AgentPasswordSettings from "./AgentPasswordSettings";
import AppearanceSettings from "./AppearanceSettings";

// Lucide-sourced stroke icons (ISC/MIT). All use currentColor + stroke
// outlines so they read sharply on any theme and inherit from `iconColor`.
const lucideProps = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

const PaletteIcon = (props: any) => (
  <Icon {...lucideProps} {...props}>
    <circle cx="13.5" cy="6.5" r=".5" fill="currentColor" />
    <circle cx="17.5" cy="10.5" r=".5" fill="currentColor" />
    <circle cx="8.5" cy="7.5" r=".5" fill="currentColor" />
    <circle cx="6.5" cy="12.5" r=".5" fill="currentColor" />
    <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z" />
  </Icon>
);

const LockIcon = (props: any) => (
  <Icon {...lucideProps} {...props}>
    <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </Icon>
);

const AgentIcon = (props: any) => (
  <Icon {...lucideProps} {...props}>
    <path d="M12 8V4H8" />
    <rect width="16" height="12" x="4" y="8" rx="2" />
    <path d="M2 14h2" />
    <path d="M20 14h2" />
    <path d="M15 13v2" />
    <path d="M9 13v2" />
  </Icon>
);

const ClockIcon = (props: any) => (
  <Icon {...lucideProps} {...props}>
    <circle cx="12" cy="12" r="10" />
    <polyline points="12 6 12 12 16 14" />
  </Icon>
);

const LinkChainIcon = (props: any) => (
  <Icon {...lucideProps} {...props}>
    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
  </Icon>
);

const TrashIcon = (props: any) => (
  <Icon {...lucideProps} {...props}>
    <path d="M3 6h18" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
    <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    <line x1="10" x2="10" y1="11" y2="17" />
    <line x1="14" x2="14" y1="11" y2="17" />
  </Icon>
);

const ResetIcon = (props: any) => (
  <Icon {...lucideProps} {...props}>
    <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
    <path d="M3 3v5h5" />
  </Icon>
);

const ChatBubbleIcon = (props: any) => (
  <Icon {...lucideProps} {...props}>
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
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
  const { themeId } = useTheme();
  const isDarkTheme = themeId === "midnight";
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
          <Box
            p={2}
            bg={iconBg}
            color={iconColor}
            borderRadius={isDarkTheme ? "md" : undefined}
          >
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
          <Box
            bg={chevronStrip.bg}
            p={1}
            borderRadius={isDarkTheme ? "md" : undefined}
          >
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
        icon={<PaletteIcon boxSize={5} />}
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
        icon={<LockIcon boxSize={5} />}
        iconBg="accent.highlight"
        iconColor="accentFg.highlight"
        cornerAccent="highlight"
        showChevron={passwordType !== "agent"}
        onClick={() => setTab("changePassword")}
        disabled={passwordType === "agent"}
      />

      {/* Agent Password — OFF state needs different neutrals per theme:
          Bauhaus has a white sunken surface and dark fg.muted that read as
          "disabled but visible". In Midnight, lift the chip onto
          border.strong with fg.primary so the OFF tile reads as a clearly
          elevated neutral against the card (the previous border.default was
          too close to the card surface and faded out). */}
      <SettingsRow
        title="Agent Password"
        subtitle="Allow AI agents to unlock wallet"
        icon={<AgentIcon boxSize={5} />}
        iconBg={
          isAgentPasswordEnabled
            ? "accent.secondary"
            : isDarkTheme
              ? "border.strong"
              : "surface.sunken"
        }
        iconColor={
          isAgentPasswordEnabled
            ? "accentFg.secondary"
            : isDarkTheme
              ? "fg.primary"
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
                  ? "border.strong"
                  : "surface.sunken"
            }
            color={
              isAgentPasswordEnabled
                ? "accentFg.secondary"
                : isDarkTheme
                  ? "fg.primary"
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
        icon={<ClockIcon boxSize={5} />}
        iconBg="accent.highlight"
        iconColor="accentFg.highlight"
        cornerAccent="highlight"
        showChevron
        onClick={() => setTab("autoLock")}
      />

      {/* Chain RPCs — Bauhaus uses the inverted-strip pattern (BLACK chip)
          which is a signature look. Midnight's surface.sunken read as a dark
          "hole" against the card, so we lift onto border.strong for a clearly
          elevated neutral system chip with primary fg on top. */}
      <SettingsRow
        title="Chain RPCs"
        subtitle="Configure network RPC endpoints"
        icon={<LinkChainIcon boxSize={5} />}
        iconBg={isDarkTheme ? "border.strong" : chainStrip.bg}
        iconColor={isDarkTheme ? "fg.primary" : chainStrip.fg}
        cornerBg="border.default"
        showChevron
        onClick={() => setTab("chains")}
      />

      {/* Clear Transaction History */}
      <SettingsRow
        title="Clear Transaction History"
        subtitle="Remove all transaction records"
        icon={<TrashIcon boxSize={5} />}
        iconBg="accent.primary"
        iconColor="accentFg.primary"
        cornerAccent="primary"
        onClick={onDeleteModalOpen}
      />

      {/* Reset Nonce Cache */}
      <SettingsRow
        title="Reset Nonce Cache"
        subtitle="Fix stuck transactions from nonce conflicts"
        icon={<ResetIcon boxSize={5} />}
        iconBg="accent.secondary"
        iconColor="accentFg.secondary"
        cornerAccent="secondary"
        onClick={handleResetNonce}
      />

      {/* Clear Chat History — circular corner ornament marks the soft action */}
      <SettingsRow
        title="Clear Chat History"
        subtitle="Remove all chat conversations"
        icon={<ChatBubbleIcon boxSize={5} />}
        iconBg="accent.primary"
        iconColor="accentFg.primary"
        cornerAccent="primary"
        borderRadiusFull
        onClick={onChatDeleteModalOpen}
      />

      {/* Delete Transaction History Confirmation Modal */}
      <Modal isOpen={isDeleteModalOpen} onClose={onDeleteModalClose} isCentered>
        <ModalOverlay bg="surface.overlay" />
        <ModalContent mx={4}>
          <ModalHeader
            color="fg.primary"
            fontWeight="900"
            fontSize="md"
            borderBottomWidth="1px"
            borderColor="border.subtle"
          >
            Clear Transaction History?
          </ModalHeader>
          <ModalBody py={4}>
            <Text color="text.secondary" fontSize="sm" fontWeight="500">
              This will permanently delete all transaction records. This action cannot be undone.
            </Text>
          </ModalBody>
          <ModalFooter gap={2} borderTopWidth="1px" borderColor="border.subtle">
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
        <ModalContent mx={4}>
          <ModalHeader
            color="fg.primary"
            fontWeight="900"
            fontSize="md"
            borderBottomWidth="1px"
            borderColor="border.subtle"
          >
            Clear Chat History?
          </ModalHeader>
          <ModalBody py={4}>
            <Text color="text.secondary" fontSize="sm" fontWeight="500">
              This will permanently delete all chat conversations. This action cannot be undone.
            </Text>
          </ModalBody>
          <ModalFooter gap={2} borderTopWidth="1px" borderColor="border.subtle">
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
