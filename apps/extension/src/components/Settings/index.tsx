import { useState, useEffect, useRef, memo } from "react";
import {
  Text,
  Button,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  useDisclosure,
} from "@chakra-ui/react";
import { useThemedToast } from "@/hooks/useThemedToast";
import type { PendingAddChainRequest } from "@/chrome/requests/pendingAddChainStorage";
import { clearChatHistory } from "@/chrome/bankr/chat/storage";
import { isDarkThemeId, useStripTokens, useTheme } from "@/theme";
import Chains from "./Chains";
import ChangePassword from "./ChangePassword";
import AutoLockSettings from "./AutoLockSettings";
import AgentPasswordSettings from "./AgentPasswordSettings";
import BiometricUnlockSettings from "./BiometricUnlockSettings";
import AppearanceSettings from "./AppearanceSettings";
import SoundsSettings from "./SoundsSettings";
import ClearSigningSettings from "./ClearSigningSettings";
import EnsBrowsingSettings from "./EnsBrowsingSettings";
import SecuritySettings from "./SecuritySettings";
import PrivacyRecoverySettings from "./PrivacyRecoverySettings";
import DataSettings from "./DataSettings";
import AboutSettings from "./AboutSettings";
import ClearTxHistoryScreen from "./ClearTxHistoryScreen";
import { SettingsMain } from "./SettingsMain";
import { SettingsRow } from "./SettingsRow";
import {
  LEAF_ENTRIES,
  filterLeaves,
  renderLeafRow,
  type LeafId,
  type NavigableLeafId,
  type ActionLeafId,
  type RowContext,
} from "./settingsRegistry";
import {
  ShieldIcon,
  DatabaseIcon,
  LinkChainIcon,
} from "./icons";
export type SettingsTab =
  | "main"
  | "about"
  | "security"
  | "data"
  | "chains"
  | "changePassword"
  | "autoLock"
  | "agentPassword"
  | "biometricUnlock"
  | "privacyRecovery"
  | "appearance"
  | "sounds"
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
  initialQuery?: string;
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
  initialQuery = "",
  onChainSaved,
  onInitialAddChainCancelled,
}: SettingsProps) {
  const [tab, setTab] = useState<SettingsTab>(initialTab);
  const [isAgentPasswordEnabled, setIsAgentPasswordEnabled] = useState(false);
  const [isPasskeyUnlockEnabled, setIsPasskeyUnlockEnabled] = useState(false);
  const [passwordType, setPasswordType] = useState<"master" | "agent" | null>(null);
  const [query, setQuery] = useState(initialQuery);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const toast = useThemedToast();
  const { themeId } = useTheme();
  const isDarkTheme = isDarkThemeId(themeId);
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

  const returnFromLeaf = (id: NavigableLeafId) => {
    const parent = LEAF_ENTRIES.find((entry) => entry.id === id)?.group;
    setTab(parent ?? "main");
  };

  const fireAction = (id: ActionLeafId) => {
    // Actions stay on their current category screen; clear any root-search
    // query that may have been used to reach them.
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
      const parent = LEAF_ENTRIES.find((entry) => entry.id === tab)?.group;
      setTab(parent ?? "main");
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
  } else if (tab === "about") {
    body = (
      <AboutSettings
        themeName={themeId === "midnight" ? "Midnight" : "Bauhaus"}
        onBack={() => setTab("main")}
      />
    );
  } else if (tab === "changePassword") {
    body = (
      <ChangePassword
        onComplete={() => returnFromLeaf("changePassword")}
        onCancel={() => returnFromLeaf("changePassword")}
      />
    );
  } else if (tab === "autoLock") {
    body = (
      <AutoLockSettings
        onComplete={() => returnFromLeaf("autoLock")}
        onCancel={() => returnFromLeaf("autoLock")}
      />
    );
  } else if (tab === "agentPassword") {
    body = (
      <AgentPasswordSettings
        onComplete={() => {
          checkAgentPassword();
          returnFromLeaf("agentPassword");
        }}
        onCancel={() => returnFromLeaf("agentPassword")}
        onSessionExpired={handleSessionExpired}
      />
    );
  } else if (tab === "biometricUnlock") {
    body = (
      <BiometricUnlockSettings
        onComplete={() => {
          checkPasskeyUnlock();
          returnFromLeaf("biometricUnlock");
        }}
        onCancel={() => returnFromLeaf("biometricUnlock")}
      />
    );
  } else if (tab === "privacyRecovery") {
    body = <PrivacyRecoverySettings onBack={() => returnFromLeaf("privacyRecovery")} />;
  } else if (tab === "appearance") {
    body = <AppearanceSettings onCancel={() => setTab("main")} />;
  } else if (tab === "sounds") {
    body = <SoundsSettings onBack={() => setTab("main")} />;
  } else if (tab === "clearSigning") {
    body = (
      <ClearSigningSettings
        onBack={() => returnFromLeaf("clearSigning")}
      />
    );
  } else if (tab === "ensBrowsing") {
    body = <EnsBrowsingSettings onBack={() => setTab("main")} />;
  } else if (tab === "security") {
    body = <SecuritySettings onBack={() => setTab("main")} ctx={rowCtx} />;
  } else if (tab === "data") {
    body = <DataSettings onBack={() => setTab("main")} ctx={rowCtx} />;
  } else if (tab === "clearTxHistory") {
    body = (
      <ClearTxHistoryScreen
        onBack={() => returnFromLeaf("clearTxHistory")}
      />
    );
  } else {
    const trimmedQuery = query.trim();
    const matches = trimmedQuery ? filterLeaves(trimmedQuery) : [];

    const renderRootLeaf = (id: LeafId) => {
      if (id === "chains") {
        return (
          <SettingsRow
            key={id}
            title="Chains"
            subtitle="Configure chain RPC endpoints"
            icon={<LinkChainIcon boxSize={5} />}
            iconBg={isDarkTheme ? "border.strong" : chainStrip.bg}
            iconColor={isDarkTheme ? "fg.primary" : chainStrip.fg}
            iconHoverColor="fg.primary"
            showChevron
            onClick={() => navigateToLeaf(id)}
          />
        );
      }

      return renderLeafRow(id, rowCtx);
    };

    const defaultRows = [
      renderRootLeaf("appearance"),
      renderRootLeaf("chains"),
      <SettingsRow
        key="security"
        title="Security"
        subtitle="Password, auto-lock, and biometric"
        icon={<ShieldIcon boxSize={5} />}
        iconBg="accent.highlight"
        iconColor="accentFg.highlight"
        cornerAccent="highlight"
        showChevron
        onClick={() => setTab("security")}
      />,
      renderRootLeaf("ensBrowsing"),
      <SettingsRow
        key="data"
        title="Data"
        subtitle="Clear history and reset the nonce cache"
        icon={<DatabaseIcon boxSize={5} />}
        iconBg="accent.primary"
        iconColor="accentFg.primary"
        iconHoverColor="chart.negative"
        cornerAccent="primary"
        showChevron
        onClick={() => setTab("data")}
      />,
      renderRootLeaf("sounds"),
      renderRootLeaf("about"),
    ];

    const searchRows = matches
      .map((entry) => renderRootLeaf(entry.id))
      .filter((row) => row != null);
    const rows = trimmedQuery ? searchRows : defaultRows;

    const clearSearch = () => {
      setQuery("");
      searchInputRef.current?.focus();
    };

    body = (
      <SettingsMain
        showBackButton={showBackButton}
        onBack={close}
        query={query}
        onQueryChange={setQuery}
        onClearQuery={clearSearch}
        searchInputRef={searchInputRef}
        rows={rows}
        hasResults={rows.length > 0}
      />
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
            fontWeight="600"
            fontSize="md"
            borderBottomWidth="1px"
            borderColor="border.subtle"
          >
            Clear Bankr chat history?
          </ModalHeader>
          <ModalBody py={4}>
            <Text color="text.secondary" fontSize="sm" fontWeight="500">
              This permanently deletes every chat conversation. This action cannot be undone.
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

export { LEAF_ENTRIES };

export default memo(Settings);
