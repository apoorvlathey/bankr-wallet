import { useState, useEffect, useRef, memo } from "react";
import {
  HStack,
  VStack,
  Text,
  Link,
  Box,
  Button,
  IconButton,
  Spacer,
  Input,
  InputGroup,
  InputLeftElement,
  InputRightElement,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  useDisclosure,
} from "@chakra-ui/react";
import { useThemedToast } from "@/hooks/useThemedToast";
import { ArrowBackIcon, Search2Icon, SmallCloseIcon } from "@chakra-ui/icons";
import type { PendingAddChainRequest } from "@/chrome/pendingAddChainStorage";

import { clearChatHistory } from "@/chrome/chatStorage";
import { TWITTER_URL } from "@/constants/externalUrls";
import { isDarkThemeId, useStripTokens, useTheme } from "@/theme";
import Chains from "./Chains";
import ChangePassword from "./ChangePassword";
import AutoLockSettings from "./AutoLockSettings";
import AgentPasswordSettings from "./AgentPasswordSettings";
import BiometricUnlockSettings from "./BiometricUnlockSettings";
import AppearanceSettings from "./AppearanceSettings";
import ClearSigningSettings from "./ClearSigningSettings";
import EnsBrowsingSettings from "./EnsBrowsingSettings";
import SecuritySettings from "./SecuritySettings";
import DataSettings from "./DataSettings";
import ClearTxHistoryScreen from "./ClearTxHistoryScreen";
import { SettingsRow } from "./SettingsRow";
import {
  LEAF_ENTRIES,
  filterLeaves,
  renderLeafRow,
  type NavigableLeafId,
  type ActionLeafId,
  type RowContext,
} from "./settingsRegistry";
import {
  ShieldIcon,
  DatabaseIcon,
} from "./icons";

export type SettingsTab =
  | "main"
  | "security"
  | "data"
  | "chains"
  | "changePassword"
  | "autoLock"
  | "agentPassword"
  | "biometricUnlock"
  | "appearance"
  | "ensBrowsing"
  | "clearSigning"
  | "clearTxHistory";

interface SettingsProps {
  close: () => void;
  showBackButton?: boolean;
  onSessionExpired?: (returnTab?: SettingsTab) => void;
  initialTab?: SettingsTab;
  initialChainsTab?: "list" | "add";
  initialAddChainRequest?: PendingAddChainRequest;
  initialEditChainName?: string;
  onChainSaved?: (chain: { chainName: string; chainId: number }) => void;
  onInitialAddChainCancelled?: () => void;
}

function Settings({
  close,
  showBackButton = true,
  onSessionExpired,
  initialTab = "main",
  initialChainsTab = "list",
  initialAddChainRequest,
  initialEditChainName,
  onChainSaved,
  onInitialAddChainCancelled,
}: SettingsProps) {
  const [tab, setTab] = useState<SettingsTab>(initialTab);
  const [isAgentPasswordEnabled, setIsAgentPasswordEnabled] = useState(false);
  const [isPasskeyUnlockEnabled, setIsPasskeyUnlockEnabled] = useState(false);
  const [passwordType, setPasswordType] = useState<"master" | "agent" | null>(null);
  const [query, setQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const toast = useThemedToast();
  const { themeId } = useTheme();
  const isDarkTheme = isDarkThemeId(themeId);
  const currentVersion = chrome.runtime.getManifest().version;
  // Reused for the Chain RPCs chip — same recessed strip pattern as the
  // chevron, so the row reads as a "system" tile in both themes.
  const chainStrip = useStripTokens();
  const { isOpen: isChatDeleteModalOpen, onOpen: onChatDeleteModalOpen, onClose: onChatDeleteModalClose } = useDisclosure();

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
    checkPasskeyUnlock();
    checkPasswordType();
  }, []);

  // Auto-focus the search input when landing on the main settings list.
  // Guarded so we don't yank focus when the user navigates back from a leaf
  // screen mid-session (focus restoration there is handled by individual leaf
  // screens). Only fire on the initial mount in main.
  useEffect(() => {
    if (tab === "main") {
      searchInputRef.current?.focus();
    }
  }, [tab]);

  const checkAgentPassword = async () => {
    const response = await new Promise<{ enabled: boolean }>((resolve) => {
      chrome.runtime.sendMessage({ type: "isAgentPasswordEnabled" }, resolve);
    });
    setIsAgentPasswordEnabled(response.enabled);
  };

  const checkPasskeyUnlock = async () => {
    const response = await new Promise<{ configured: boolean }>((resolve) => {
      chrome.runtime.sendMessage({ type: "getPasskeyUnlockStatus" }, resolve);
    });
    setIsPasskeyUnlockEnabled(!!response?.configured);
  };

  const checkPasswordType = async () => {
    const response = await new Promise<{ passwordType: "master" | "agent" | null }>((resolve) => {
      chrome.runtime.sendMessage({ type: "getPasswordType" }, resolve);
    });
    setPasswordType(response.passwordType);
  };

  const navigateToLeaf = (id: NavigableLeafId) => {
    // NavigableLeafId values intentionally line up 1:1 with SettingsTab values.
    setQuery("");
    setTab(id);
  };

  const fireAction = (id: ActionLeafId) => {
    // After firing, drop the search query so the user lands back on the
    // default main list (clean state) once any modal closes / toast fires.
    setQuery("");
    if (id === "clearChatHistory") onChatDeleteModalOpen();
    else if (id === "resetNonce") handleResetNonce();
  };

  const rowCtx: RowContext = {
    isDarkTheme,
    chainStripBg: chainStrip.bg,
    chainStripFg: chainStrip.fg,
    passwordType,
    isAgentPasswordEnabled,
    isPasskeyUnlockEnabled,
    onNavigate: navigateToLeaf,
    onAction: fireAction,
  };

  const handleSessionExpired = () => {
    if (onSessionExpired) {
      onSessionExpired(tab);
    } else {
      setTab("main");
    }
  };

  // Confirmation modals are owned by the parent so DataSettings (and any future
  // sub-tab) can trigger them via `fireAction`. They MUST stay mounted across
  // tab transitions — early-returning the sub-tab would unmount this JSX and
  // the modal would silently fail to render even though its open-state flipped.
  let body: JSX.Element;

  if (tab === "chains") {
    body = (
      <Chains
        close={() => setTab("main")}
        initialTab={initialChainsTab}
        initialAddChainRequest={initialAddChainRequest}
        initialEditChainName={initialEditChainName}
        onChainSaved={onChainSaved}
        onInitialAddChainCancelled={onInitialAddChainCancelled}
      />
    );
  } else if (tab === "changePassword") {
    body = (
      <ChangePassword
        onComplete={() => setTab("main")}
        onCancel={() => setTab("main")}
        onSessionExpired={handleSessionExpired}
      />
    );
  } else if (tab === "autoLock") {
    body = (
      <AutoLockSettings
        onComplete={() => setTab("main")}
        onCancel={() => setTab("main")}
      />
    );
  } else if (tab === "agentPassword") {
    body = (
      <AgentPasswordSettings
        onComplete={() => {
          checkAgentPassword();
          setTab("main");
        }}
        onCancel={() => setTab("main")}
        onSessionExpired={handleSessionExpired}
      />
    );
  } else if (tab === "biometricUnlock") {
    body = (
      <BiometricUnlockSettings
        onComplete={() => {
          checkPasskeyUnlock();
          setTab("main");
        }}
        onCancel={() => setTab("main")}
        onSessionExpired={handleSessionExpired}
      />
    );
  } else if (tab === "appearance") {
    body = <AppearanceSettings onCancel={() => setTab("main")} />;
  } else if (tab === "clearSigning") {
    body = <ClearSigningSettings onBack={() => setTab("main")} />;
  } else if (tab === "ensBrowsing") {
    body = <EnsBrowsingSettings onBack={() => setTab("main")} />;
  } else if (tab === "security") {
    body = <SecuritySettings onBack={() => setTab("main")} ctx={rowCtx} />;
  } else if (tab === "data") {
    body = <DataSettings onBack={() => setTab("main")} ctx={rowCtx} />;
  } else if (tab === "clearTxHistory") {
    body = <ClearTxHistoryScreen onBack={() => setTab("main")} />;
  } else {
    const trimmedQuery = query.trim();
    const matches = trimmedQuery ? filterLeaves(trimmedQuery) : [];

    body = (
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

        {/* Search */}
        <InputGroup>
          <InputLeftElement pointerEvents="none">
            <Search2Icon color="fg.muted" />
          </InputLeftElement>
          <Input
            ref={searchInputRef}
            placeholder="Search settings..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
          {query && (
            <InputRightElement>
              <IconButton
                aria-label="Clear search"
                icon={<SmallCloseIcon />}
                size="xs"
                variant="ghost"
                onClick={() => {
                  setQuery("");
                  searchInputRef.current?.focus();
                }}
              />
            </InputRightElement>
          )}
        </InputGroup>

        {trimmedQuery ? (
          matches.length > 0 ? (
            <>{matches.map((e) => renderLeafRow(e.id, rowCtx))}</>
          ) : (
            <Box py={6} textAlign="center">
              <Text fontSize="sm" color="text.secondary" fontWeight="500">
                No settings match &ldquo;{trimmedQuery}&rdquo;
              </Text>
            </Box>
          )
        ) : (
          <>
            {/* Appearance — first row, themed picker entry */}
            {renderLeafRow("appearance", rowCtx)}

            {/* Security group */}
            <SettingsRow
              title="Security"
              subtitle="Password, agent access, auto-lock"
              icon={<ShieldIcon boxSize={5} />}
              iconBg="accent.highlight"
              iconColor="accentFg.highlight"
              cornerAccent="highlight"
              showChevron
              onClick={() => setTab("security")}
            />

            {/* Chain RPCs — top-level single entry */}
            {renderLeafRow("chains", rowCtx)}

            {/* ENS Browsing — top-level single entry */}
            {renderLeafRow("ensBrowsing", rowCtx)}

            {/* Data group */}
            <SettingsRow
              title="Data"
              subtitle="Clear history, reset nonce cache"
              icon={<DatabaseIcon boxSize={5} />}
              iconBg="accent.primary"
              iconColor="accentFg.primary"
              cornerAccent="primary"
              showChevron
              onClick={() => setTab("data")}
            />
          </>
        )}

        {/* Spacer to push footer to bottom */}
        <Box flex="1" />

        <Box h="3px" bg="border.default" w="full" />

        <VStack spacing={1} align="center">
          <Text fontSize="xs" color="fg.muted" fontWeight="700">
            Version {currentVersion}
          </Text>
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
      </VStack>
    );
  }

  return (
    <>
      {body}

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
    </>
  );
}

// LEAF_ENTRIES is exported from registry for any external consumer that needs
// to enumerate settings; re-export for backwards compatibility if needed.
export { LEAF_ENTRIES };

export default memo(Settings);
