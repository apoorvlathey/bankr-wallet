import {
  useState,
  useEffect,
  useCallback,
  useRef,
  lazy,
  Suspense,
} from "react";
import {
  useUpdateEffect,
  Flex,
  Spacer,
  Container,
  Text,
  HStack,
  Box,
  Button,
  Menu,
  MenuButton,
  MenuList,
  MenuItem,
  Image,
  IconButton,
  Code,
  VStack,
  Tooltip,
  Icon,
  Link,
  Spinner,
  useDisclosure,
} from "@chakra-ui/react";

import {
  SettingsIcon,
  ChevronDownIcon,
  CopyIcon,
  CheckIcon,
  ExternalLinkIcon,
  LockIcon,
  WarningIcon,
  InfoIcon,
  ChatIcon,
} from "@chakra-ui/icons";

// Sidepanel icon
const SidePanelIcon = (props: any) => (
  <Icon viewBox="0 0 24 24" {...props}>
    <path
      fill="currentColor"
      d="M3 3h18a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zm12 2v14h5V5h-5zM4 5v14h10V5H4z"
    />
  </Icon>
);

// Fullscreen icon (two diagonal arrows pointing outward)
const FullscreenIcon = (props: any) => (
  <Icon viewBox="0 0 24 24" {...props}>
    <path
      fill="currentColor"
      d="M14 3v2h3.59l-4.3 4.29 1.42 1.42L19 6.41V10h2V3h-7zM5 17.59V14H3v7h7v-2H6.41l4.3-4.29-1.42-1.42L5 17.59z"
    />
  </Icon>
);

// Swap icon (two vertical arrows)
const SwapIcon = (props: any) => (
  <Icon viewBox="0 0 24 24" {...props}>
    <path
      fill="currentColor"
      d="M16 17.01V10h-2v7.01h-3L15 21l4-3.99h-3zM9 3L5 6.99h3V14h2V6.99h3L9 3z"
    />
  </Icon>
);

/**
 * Detects if we're running in Arc browser using CSS variable
 * Arc browser injects --arc-palette-title CSS variable
 * This is the recommended way to detect Arc (used by MetaMask)
 */
function isArcBrowser(): boolean {
  try {
    const arcPaletteTitle = getComputedStyle(
      document.documentElement,
    ).getPropertyValue("--arc-palette-title");
    return !!arcPaletteTitle && arcPaletteTitle.trim().length > 0;
  } catch {
    return false;
  }
}

// Lazy load heavy components
const Settings = lazy(() => import("@/components/Settings"));
const TransactionConfirmation = lazy(
  () => import("@/components/TransactionConfirmation"),
);
const SignatureRequestConfirmation = lazy(
  () => import("@/components/SignatureRequestConfirmation"),
);
const PendingTxList = lazy(() => import("@/components/PendingTxList"));
const BatchTransactionConfirmation = lazy(
  () => import("@/components/BatchTransactionConfirmation"),
);
const ChatView = lazy(() => import("@/components/Chat/ChatView"));
const AccountSwitcher = lazy(() => import("@/components/AccountSwitcher"));
const AddAccount = lazy(() => import("@/components/AddAccount"));
const RevealPrivateKeyModal = lazy(
  () => import("@/components/RevealPrivateKeyModal"),
);
const RevealSeedPhraseModal = lazy(
  () => import("@/components/RevealSeedPhraseModal"),
);
const AccountSettingsModal = lazy(
  () => import("@/components/AccountSettingsModal"),
);
const QRCodeModal = lazy(() =>
  import("@/components/QRCodeModal").then((m) => ({ default: m.QRCodeModal })),
);
const TokenTransfer = lazy(() => import("@/components/TokenTransfer"));
const SwapView = lazy(() => import("@/components/Swap/SwapView"));
const WatchAssetConfirmation = lazy(() => import("@/components/WatchAssetConfirmation"));

// Eager load components needed immediately
import UnlockScreen from "@/components/UnlockScreen";
import PendingTxBanner from "@/components/PendingTxBanner";
import PortfolioTabs from "@/components/PortfolioTabs";
import { useNetworks } from "@/contexts/NetworksContext";
import { getChainConfig } from "@/constants/chainConfig";
import { BANKR_SUPPORTED_CHAIN_IDS } from "@/constants/networks";
import { hasEncryptedApiKey } from "@/chrome/crypto";
import { PendingTxRequest } from "@/chrome/pendingTxStorage";
import { PendingSignatureRequest } from "@/chrome/pendingSignatureStorage";
import type { PendingBatchTxRequest } from "@/chrome/erc5792Types";
import { PendingWatchAssetRequest } from "@/chrome/pendingWatchAssetStorage";
import type { Account } from "@/chrome/types";
import type { PortfolioToken } from "@/chrome/portfolioApi";
import { TWITTER_URL, WALLETCHAN_ICON_URL, WALLETCHAN_OS_URL, WALLETCHAN_STAKE_URL, WALLETCHAN_VAULT_DATA_API } from "@/constants/externalUrls";

// Combined request type for unified ordering
export type CombinedRequest =
  | { type: "tx"; request: PendingTxRequest }
  | { type: "sig"; request: PendingSignatureRequest }
  | { type: "batch"; request: PendingBatchTxRequest };

// Helper to combine and sort requests by timestamp
export function getCombinedRequests(
  txRequests: PendingTxRequest[],
  sigRequests: PendingSignatureRequest[],
  batchRequests: PendingBatchTxRequest[] = [],
): CombinedRequest[] {
  const combined: CombinedRequest[] = [
    ...txRequests.map((r) => ({ type: "tx" as const, request: r })),
    ...sigRequests.map((r) => ({ type: "sig" as const, request: r })),
    ...batchRequests.map((r) => ({ type: "batch" as const, request: r })),
  ];
  // Sort by timestamp ascending (oldest first)
  return combined.sort((a, b) => a.request.timestamp - b.request.timestamp);
}

// Loading fallback component
const LoadingFallback = () => (
  <Box
    minH="200px"
    display="flex"
    alignItems="center"
    justifyContent="center"
    bg="bg.base"
  >
    <Spinner size="lg" color="bauhaus.blue" thickness="3px" />
  </Box>
);

type AppView =
  | "main"
  | "unlock"
  | "settings"
  | "pendingTxList"
  | "txConfirm"
  | "signatureConfirm"
  | "watchAssetConfirm"
  | "waitingForOnboarding"
  | "chat"
  | "addAccount"
  | "transfer"
  | "swap"
  | "batchTxConfirm";

function App() {
  const { networksInfo, reloadRequired, setReloadRequired } = useNetworks();
  const [view, setView] = useState<AppView>("main");
  const [isLoading, setIsLoading] = useState(true);
  const [address, setAddress] = useState<string>("");
  const [displayAddress, setDisplayAddress] = useState<string>("");
  const [chainName, setChainName] = useState<string>();
  const [hasApiKey, setHasApiKey] = useState(false);
  const [pendingRequests, setPendingRequests] = useState<PendingTxRequest[]>(
    [],
  );
  const [selectedTxRequest, setSelectedTxRequest] =
    useState<PendingTxRequest | null>(null);
  const [pendingSignatureRequests, setPendingSignatureRequests] = useState<
    PendingSignatureRequest[]
  >([]);
  const [selectedSignatureRequest, setSelectedSignatureRequest] =
    useState<PendingSignatureRequest | null>(null);
  const [pendingWatchAssetRequest, setPendingWatchAssetRequest] =
    useState<PendingWatchAssetRequest | null>(null);
  const [pendingBatchRequests, setPendingBatchRequests] = useState<
    PendingBatchTxRequest[]
  >([]);
  const [selectedBatchRequest, setSelectedBatchRequest] =
    useState<PendingBatchTxRequest | null>(null);
  const [activityTabTrigger, setActivityTabTrigger] = useState(0);

  const [copied, setCopied] = useState(false);
  const [sidePanelSupported, setSidePanelSupported] = useState(false);
  const [sidePanelMode, setSidePanelMode] = useState(false);
  const [isInSidePanel, setIsInSidePanel] = useState(false);
  const [isFullscreenTab, setIsFullscreenTab] = useState(false);
  const [isPopupWindow, setIsPopupWindow] = useState(false);
  const [failedTxError, setFailedTxError] = useState<{
    error: string;
    origin: string;
  } | null>(null);
  const [onboardingTabId, setOnboardingTabId] = useState<number | null>(null);
  const [startChatWithNew, setStartChatWithNew] = useState(false);
  const [returnToChatAfterUnlock, setReturnToChatAfterUnlock] = useState(false);
  const [returnToConversationId, setReturnToConversationId] = useState<
    string | null
  >(null);
  const [isWalletUnlocked, setIsWalletUnlocked] = useState(false);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [activeAccount, setActiveAccount] = useState<Account | null>(null);
  const [revealAccount, setRevealAccount] = useState<Account | null>(null);
  const [revealSeedAccount, setRevealSeedAccount] = useState<Account | null>(
    null,
  );
  const [settingsAccount, setSettingsAccount] = useState<Account | null>(null);
  const {
    isOpen: isRevealKeyOpen,
    onOpen: onRevealKeyOpen,
    onClose: onRevealKeyClose,
  } = useDisclosure();
  const {
    isOpen: isRevealSeedOpen,
    onOpen: onRevealSeedOpen,
    onClose: onRevealSeedClose,
  } = useDisclosure();
  const {
    isOpen: isAccountSettingsOpen,
    onOpen: onAccountSettingsOpen,
    onClose: onAccountSettingsClose,
  } = useDisclosure();
  const {
    isOpen: isQROpen,
    onOpen: onQROpen,
    onClose: onQRClose,
  } = useDisclosure();
  const [transferToken, setTransferToken] = useState<PortfolioToken | null>(
    null,
  );
  const [swapInitialBuyToken, setSwapInitialBuyToken] = useState<
    { address: string; name: string; symbol: string; decimals: number; logoURI?: string } | undefined
  >();
  const [swapInitialSellToken, setSwapInitialSellToken] = useState<PortfolioToken | undefined>();
  const [stakeApy, setStakeApy] = useState<number | null>(null);
  const keepAlivePortRef = useRef<chrome.runtime.Port | null>(null);
  const reconnectingRef = useRef(false);
  const isPopupWindowRef = useRef(false);

  const currentTab = async () => {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    return tab;
  };

  /**
   * Try to wake up the service worker using chrome.runtime.connect
   * This is needed for browsers like Arc that don't auto-wake the service worker
   */
  const wakeUpServiceWorker = async (): Promise<boolean> => {
    return new Promise((resolve) => {
      try {
        const port = chrome.runtime.connect({ name: "popup-wake" });
        port.onDisconnect.addListener(() => {
          // Port disconnected, but that's okay - we just needed to wake it up
          resolve(true);
        });
        // Give it a moment then disconnect
        setTimeout(() => {
          try {
            port.disconnect();
          } catch {
            // Ignore disconnect errors
          }
          resolve(true);
        }, 100);
      } catch (error) {
        console.warn("Failed to wake service worker:", error);
        resolve(false);
      }
    });
  };

  /**
   * Send a message to the background script with retry logic
   * Some browsers (like Arc) may not wake up the service worker immediately
   */
  const sendMessageWithRetry = async <T,>(
    message: { type: string; [key: string]: any },
    maxRetries = 5,
    delay = 200,
  ): Promise<T | null> => {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const response = await new Promise<T | null>((resolve, reject) => {
          chrome.runtime.sendMessage(message, (result) => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
            } else {
              resolve(result);
            }
          });
        });
        return response;
      } catch (error) {
        console.warn(`Message attempt ${attempt + 1} failed:`, error);
        if (attempt < maxRetries - 1) {
          // Try to wake up the service worker
          await wakeUpServiceWorker();
          // Wait before retrying, with exponential backoff
          await new Promise((r) => setTimeout(r, delay * Math.pow(2, attempt)));
        }
      }
    }
    return null;
  };

  /**
   * Establishes and maintains a keepalive port connection to the service worker.
   * Automatically reconnects if the port disconnects (e.g., service worker restarts).
   */
  const establishKeepalivePort = useCallback(() => {
    if (reconnectingRef.current) return;

    // Disconnect existing port if any
    if (keepAlivePortRef.current) {
      try {
        keepAlivePortRef.current.disconnect();
      } catch {
        // Ignore disconnect errors
      }
    }

    try {
      const port = chrome.runtime.connect({ name: "ui-keepalive" });
      keepAlivePortRef.current = port;

      port.onDisconnect.addListener(() => {
        keepAlivePortRef.current = null;
        // Service worker may have restarted - reconnect after a short delay
        // Only reconnect if extension context is still valid
        if (chrome.runtime?.id) {
          reconnectingRef.current = true;
          setTimeout(() => {
            reconnectingRef.current = false;
            establishKeepalivePort();
          }, 100);
        }
      });
    } catch {
      keepAlivePortRef.current = null;
    }
  }, []);

  const loadPendingRequests = async () => {
    const requests = await sendMessageWithRetry<PendingTxRequest[]>({
      type: "getPendingTxRequests",
    });
    setPendingRequests(requests || []);
    return requests || [];
  };

  const loadPendingSignatureRequests = async () => {
    const requests = await sendMessageWithRetry<PendingSignatureRequest[]>({
      type: "getPendingSignatureRequests",
    });
    setPendingSignatureRequests(requests || []);
    return requests || [];
  };

  const loadPendingBatchRequests = async () => {
    const requests = await sendMessageWithRetry<PendingBatchTxRequest[]>({
      type: "getPendingBatchTxRequests",
    });
    setPendingBatchRequests(requests || []);
    return requests || [];
  };

  const loadPendingWatchAssetRequests = async () => {
    const requests = await sendMessageWithRetry<PendingWatchAssetRequest[]>({
      type: "getPendingWatchAssetRequests",
    });
    return requests || [];
  };

  const checkLockState = async (): Promise<boolean> => {
    const cached = await sendMessageWithRetry<boolean>({
      type: "isWalletUnlocked",
    });
    return cached || false;
  };

  const loadAccounts = async (syncAddress = false) => {
    const accountList = await sendMessageWithRetry<Account[]>({
      type: "getAccounts",
    });
    setAccounts(accountList || []);

    const active = await sendMessageWithRetry<Account | null>({
      type: "getActiveAccount",
    });
    setActiveAccount(active);

    // Sync address/displayAddress to match active account
    if (syncAddress && active) {
      setAddress(active.address);
      setDisplayAddress(active.displayName || active.address);
      await chrome.storage.sync.set({
        address: active.address,
        displayAddress: active.displayName || active.address,
      });

      // Notify content script about the account change
      const tab = await currentTab();
      if (tab?.id) {
        chrome.tabs
          .sendMessage(tab.id, {
            type: "setAccount",
            msg: {
              address: active.address,
              displayAddress: active.displayName || active.address,
              accountId: active.id,
              accountType: active.type,
            },
          })
          .catch(() => {});
      }
    }

    return { accounts: accountList || [], activeAccount: active };
  };

  const handleAccountSwitch = async (account: Account) => {
    // Set as active account
    await sendMessageWithRetry({
      type: "setActiveAccount",
      accountId: account.id,
    });
    setActiveAccount(account);

    // Update address and displayAddress
    setAddress(account.address);
    setDisplayAddress(account.displayName || account.address);

    // Update storage for backward compatibility
    await chrome.storage.sync.set({
      address: account.address,
      displayAddress: account.displayName || account.address,
    });

    // If switching to a Bankr account, ensure current chain is supported
    if (account.type === "bankr" && chainName && networksInfo) {
      const currentChainId = networksInfo[chainName]?.chainId;
      if (currentChainId && !BANKR_SUPPORTED_CHAIN_IDS.has(currentChainId)) {
        const firstSupported = Object.keys(networksInfo).find((name) =>
          BANKR_SUPPORTED_CHAIN_IDS.has(networksInfo[name].chainId),
        );
        if (firstSupported) setChainName(firstSupported);
      }
    }

    // Notify content script about the account change
    const tab = await currentTab();
    if (tab?.id) {
      chrome.tabs
        .sendMessage(tab.id, {
          type: "setAccount",
          msg: {
            address: account.address,
            displayAddress: account.displayName || account.address,
            accountId: account.id,
            accountType: account.type,
          },
        })
        .catch(() => {
          // Ignore errors if content script not injected
        });
    }
  };

  // Check sidepanel support and mode on mount
  // IMPORTANT: Arc browser detection must happen FIRST and synchronously notify background
  useEffect(() => {
    const checkSidePanelSupport = async () => {
      // First check if we're in Arc browser - sidepanel doesn't work there
      if (isArcBrowser()) {
        console.log(
          "Arc browser detected via CSS variable - disabling sidepanel",
        );
        // Notify background that we're in Arc - this must happen before anything else
        // Use direct chrome.storage.sync.set for immediate effect (no message needed)
        await chrome.storage.sync.set({
          isArcBrowser: true,
          sidePanelMode: false,
        });
        // Also notify background via message (for any runtime state it needs to update)
        try {
          chrome.runtime.sendMessage({ type: "setArcBrowser", isArc: true });
        } catch {
          // Ignore errors if background isn't ready yet
        }
        return false;
      }

      // Not Arc - check if sidepanel is supported
      const response = await sendMessageWithRetry<{ supported: boolean }>({
        type: "isSidePanelSupported",
      });
      return response?.supported || false;
    };

    const checkSidePanelMode = async () => {
      const response = await sendMessageWithRetry<{ enabled: boolean }>({
        type: "getSidePanelMode",
      });
      return response?.enabled || false;
    };

    const detectSidePanelContext = () => {
      // Detect if we're running in a sidepanel context by checking window dimensions
      // Sidepanel typically has more height than the popup's fixed 680px
      const isWideEnough = window.innerWidth >= 300;
      const isTall = window.innerHeight > 700;
      return isWideEnough && isTall;
    };

    const detectFullscreenContext = () => {
      // Fullscreen tab has much larger width than popup (360px) or sidepanel (~400px)
      // Also check if we're not in a popup window context
      const isWide = window.innerWidth > 500;
      const isTall = window.innerHeight > 700;
      // Check if we're a top-level window (not popup)
      const isTopLevel = window.top === window.self;
      return isWide && isTall && isTopLevel;
    };

    const initSidePanel = async () => {
      const supported = await checkSidePanelSupport();
      setSidePanelSupported(supported);

      if (supported) {
        // Check if sidepanel mode has been explicitly set
        const { sidePanelMode: storedMode } = await chrome.storage.sync.get([
          "sidePanelMode",
        ]);

        if (storedMode === undefined) {
          // First time after onboarding or upgrade - enable sidepanel by default for non-Arc
          try {
            const response = await sendMessageWithRetry<{ success: boolean }>({
              type: "setSidePanelMode",
              enabled: true,
            });
            if (response?.success) {
              setSidePanelMode(true);
              console.log("Sidepanel mode enabled by default");
            } else {
              setSidePanelMode(false);
            }
          } catch {
            setSidePanelMode(false);
          }
        } else {
          setSidePanelMode(storedMode);
        }
      }

      // Check if we're in a popup-type window (created by chrome.windows.create)
      // This is authoritative and doesn't depend on dimensions — important because
      // macOS fullscreen can resize popup windows, causing dimension-based detection to fail
      let inPopupWindow = false;
      try {
        const currentWindow = await chrome.windows.getCurrent();
        inPopupWindow = currentWindow.type === "popup";
      } catch {
        // Fallback: not in a popup window
      }
      setIsPopupWindow(inPopupWindow);
      isPopupWindowRef.current = inPopupWindow;

      // Detect if currently in fullscreen tab first (takes priority)
      // But never if we're in a popup window (macOS fullscreen can resize popups)
      const inFullscreen = !inPopupWindow && detectFullscreenContext();
      setIsFullscreenTab(inFullscreen);

      // Detect if currently in sidepanel (only if not fullscreen and not popup window)
      const inSidePanel =
        !inPopupWindow && !inFullscreen && detectSidePanelContext();
      setIsInSidePanel(inSidePanel);

      // Add/remove body class for CSS
      document.body.classList.remove(
        "sidepanel-mode",
        "fullscreen-mode",
        "popup-window-mode",
      );
      if (inPopupWindow) {
        document.body.classList.add("popup-window-mode");
      } else if (inFullscreen) {
        document.body.classList.add("fullscreen-mode");
      } else if (inSidePanel) {
        document.body.classList.add("sidepanel-mode");
      }
    };

    initSidePanel();

    // Listen for window resize to update sidepanel/fullscreen detection
    const handleResize = () => {
      // Never reclassify a popup window — macOS fullscreen can resize it
      if (isPopupWindowRef.current) return;

      const isWide = window.innerWidth > 500;
      const isTall = window.innerHeight > 700;
      const isTopLevel = window.top === window.self;
      const inFullscreen = isWide && isTall && isTopLevel;
      const inSidePanel = !inFullscreen && isTall;

      setIsFullscreenTab(inFullscreen);
      setIsInSidePanel(inSidePanel);

      document.body.classList.remove("sidepanel-mode", "fullscreen-mode");
      if (inFullscreen) {
        document.body.classList.add("fullscreen-mode");
      } else if (inSidePanel) {
        document.body.classList.add("sidepanel-mode");
      }
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Check URL params for error display (from notification click)
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const showErrorId = urlParams.get("showError");

    if (showErrorId) {
      // Fetch the failed tx result from background
      chrome.runtime.sendMessage(
        { type: "getFailedTxResult", notificationId: showErrorId },
        (result: { error: string; origin: string } | null) => {
          if (chrome.runtime.lastError) return;
          if (result) {
            setFailedTxError({ error: result.error, origin: result.origin });
          }
          // Clear the URL param
          window.history.replaceState({}, "", window.location.pathname);
        },
      );
    }
  }, []);

  const openInFullscreenTab = async () => {
    // Open the extension in a new tab
    const extensionUrl = chrome.runtime.getURL("index.html");
    await chrome.tabs.create({ url: extensionUrl });
    // Close popup if we're in popup mode
    if (!isInSidePanel && !isFullscreenTab) {
      window.close();
    }
  };

  const toggleSidePanelMode = async () => {
    if (sidePanelMode) {
      // DISABLING: persist and close immediately
      chrome.runtime.sendMessage({ type: "setSidePanelMode", enabled: false });
      window.close();
    } else {
      // ENABLING: open sidepanel, persist, close popup — all fire-and-forget
      try {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        const windowId = tabs[0]?.windowId;
        if (!windowId) return;

        chrome.sidePanel.open({ windowId });
        chrome.runtime.sendMessage({ type: "setSidePanelMode", enabled: true });
        window.close();
      } catch (error) {
        console.warn("Failed to open sidepanel:", error);
      }
    }
  };

  useEffect(() => {
    const init = async () => {
      // Check if API key is configured
      const apiKeyConfigured = await hasEncryptedApiKey();
      setHasApiKey(apiKeyConfigured);

      if (!apiKeyConfigured) {
        // No API key - open onboarding in a new tab
        const onboardingUrl = chrome.runtime.getURL("onboarding.html");

        // Check if onboarding tab already exists
        const existingTabs = await chrome.tabs.query({ url: onboardingUrl });
        if (existingTabs.length > 0 && existingTabs[0].id) {
          // Focus existing onboarding tab
          await chrome.tabs.update(existingTabs[0].id, { active: true });
          await chrome.windows.update(existingTabs[0].windowId!, {
            focused: true,
          });
          setOnboardingTabId(existingTabs[0].id);
        } else {
          // Create new onboarding tab
          const tab = await chrome.tabs.create({ url: onboardingUrl });
          if (tab.id) {
            setOnboardingTabId(tab.id);
          }
        }

        setView("waitingForOnboarding");
        setIsLoading(false);
        return;
      }

      // API key is configured - close any open onboarding tabs
      // Use pattern matching to ensure we find the tab regardless of URL variations
      const onboardingUrlPattern =
        chrome.runtime.getURL("onboarding.html") + "*";
      const onboardingTabs = await chrome.tabs.query({
        url: onboardingUrlPattern,
      });
      for (const tab of onboardingTabs) {
        if (tab.id) {
          chrome.tabs.remove(tab.id).catch(() => {
            // Ignore errors if tab is already closed
          });
        }
      }

      // Establish keepalive connection to pause auto-lock while UI is open
      // Use the robust reconnection mechanism
      establishKeepalivePort();

      // Check lock state
      const isUnlocked = await checkLockState();

      // Load pending requests
      const requests = await loadPendingRequests();
      const sigRequests = await loadPendingSignatureRequests();
      const batchRequests = await loadPendingBatchRequests();
      const watchAssetRequests = await loadPendingWatchAssetRequests();

      // Load accounts
      let { accounts: loadedAccounts, activeAccount: loadedActive } =
        await loadAccounts();

      // Migration fallback: if API key exists but no accounts, the user is
      // upgrading from v0.1.1/v0.2.0 and the onInstalled migration may not
      // have run yet (e.g. service worker was inactive). Ask background to
      // create the account entry from legacy storage.
      if (loadedAccounts.length === 0) {
        const migrationResult = await sendMessageWithRetry<{
          migrated: boolean;
        }>({
          type: "migrateFromLegacy",
        });
        if (migrationResult?.migrated) {
          const result = await loadAccounts(true);
          loadedAccounts = result.accounts;
          loadedActive = result.activeAccount;
        }
      }

      // Safety net: if API key exists but no accounts, redirect to onboarding
      // This handles edge cases like interrupted setup
      if (loadedAccounts.length === 0) {
        const onboardingUrl = chrome.runtime.getURL("onboarding.html");
        const existingTabs = await chrome.tabs.query({ url: onboardingUrl });
        if (existingTabs.length > 0 && existingTabs[0].id) {
          await chrome.tabs.update(existingTabs[0].id, { active: true });
          await chrome.windows.update(existingTabs[0].windowId!, {
            focused: true,
          });
        } else {
          await chrome.tabs.create({ url: onboardingUrl });
        }
        setView("waitingForOnboarding");
        setIsLoading(false);
        return;
      }

      // Load stored data
      const {
        displayAddress: storedDisplayAddress,
        address: storedAddress,
        chainName: storedChainName,
      } = (await chrome.storage.sync.get([
        "displayAddress",
        "address",
        "chainName",
      ])) as {
        displayAddress: string | undefined;
        address: string | undefined;
        chainName: string | undefined;
      };

      // Use active account if available, otherwise fall back to stored address
      if (loadedActive) {
        setAddress(loadedActive.address);
        setDisplayAddress(loadedActive.displayName || loadedActive.address);
      } else if (storedDisplayAddress) {
        setDisplayAddress(storedDisplayAddress);
        if (storedAddress) {
          setAddress(storedAddress);
        }
      } else if (storedAddress) {
        setAddress(storedAddress);
      }

      // Set chain name, defaulting to Base for new installations
      setChainName(storedChainName || "Base");

      // Check if injected in current tab and get latest state
      const tab = await currentTab();
      chrome.tabs.sendMessage(
        tab.id!,
        { type: "getInfo" },
        (store: {
          address: string;
          displayAddress: string;
          chainName: string;
        }) => {
          // Ignore errors (tab might not have content script, e.g. chrome:// pages)
          if (chrome.runtime.lastError) return;
          if (store?.chainName && store.chainName.length > 0) {
            if (store.address) setAddress(store.address);
            if (store.displayAddress) setDisplayAddress(store.displayAddress);
            if (store.chainName) setChainName(store.chainName);
          }
        },
      );

      // Set wallet unlock state
      setIsWalletUnlocked(isUnlocked);

      // Determine initial view
      if (!isUnlocked) {
        setView("unlock");
      } else if (requests.length > 0) {
        // Auto-open newest (last) pending transaction request
        setSelectedTxRequest(requests[requests.length - 1]);
        setView("txConfirm");
      } else if (batchRequests.length > 0) {
        setSelectedBatchRequest(batchRequests[batchRequests.length - 1]);
        setView("batchTxConfirm");
      } else if (sigRequests.length > 0) {
        // Auto-open newest (last) pending signature request
        setSelectedSignatureRequest(sigRequests[sigRequests.length - 1]);
        setView("signatureConfirm");
      } else if (watchAssetRequests.length > 0) {
        setPendingWatchAssetRequest(watchAssetRequests[watchAssetRequests.length - 1]);
        setView("watchAssetConfirm");
      } else {
        setView("main");
      }

      setIsLoading(false);
    };

    init();
  }, []);

  // Fetch staking APY from website API
  useEffect(() => {
    const fetchApy = () => {
      fetch(WALLETCHAN_VAULT_DATA_API)
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (data?.totalApy != null) setStakeApy(data.totalApy);
        })
        .catch(() => {});
    };
    fetchApy();
    const interval = setInterval(fetchApy, 60_000);
    return () => clearInterval(interval);
  }, []);

  // Listen for new pending tx/signature requests (when sidepanel/popup is already open)
  // Also respond to ping messages so background knows a view is open
  // Also listen for onboarding completion
  useEffect(() => {
    const handleMessage = (
      message: {
        type: string;
        txRequest?: PendingTxRequest;
        sigRequest?: PendingSignatureRequest;
        batchRequest?: PendingBatchTxRequest;
      },
      _sender: chrome.runtime.MessageSender,
      sendResponse: (response?: any) => void,
    ): boolean | undefined => {
      if (message.type === "ping") {
        // Respond to ping so background knows we're open
        sendResponse("pong");
        return;
      }
      if (message.type === "newPendingTxRequest" && message.txRequest) {
        const txRequest = message.txRequest;
        // Don't append to pendingRequests here — the storage change listener
        // will sync the full list from chrome.storage.local, avoiding duplicates.
        // Just handle view switching.
        (async () => {
          const isUnlocked = await checkLockState();
          setIsWalletUnlocked(isUnlocked);
          if (isUnlocked) {
            setSelectedTxRequest(txRequest);
            setView("txConfirm");
          } else {
            setView("unlock");
          }
        })();
        return;
      }
      if (message.type === "newPendingSignatureRequest" && message.sigRequest) {
        const sigRequest = message.sigRequest;
        // Don't append to pendingSignatureRequests here — the storage change listener
        // will sync the full list from chrome.storage.local, avoiding duplicates.
        // Just handle view switching.
        (async () => {
          const isUnlocked = await checkLockState();
          setIsWalletUnlocked(isUnlocked);
          if (isUnlocked) {
            setSelectedSignatureRequest(sigRequest);
            setView("signatureConfirm");
          } else {
            setView("unlock");
          }
        })();
        return;
      }
      if (message.type === "newPendingBatchTxRequest" && message.batchRequest) {
        const batchReq = message.batchRequest;
        (async () => {
          const isUnlocked = await checkLockState();
          setIsWalletUnlocked(isUnlocked);
          if (isUnlocked) {
            setSelectedBatchRequest(batchReq);
            setView("batchTxConfirm");
          } else {
            setView("unlock");
          }
        })();
        return;
      }
      if (message.type === "newPendingWatchAssetRequest" && message.request) {
        const watchRequest = message.request as PendingWatchAssetRequest;
        (async () => {
          const isUnlocked = await checkLockState();
          setIsWalletUnlocked(isUnlocked);
          if (isUnlocked) {
            setPendingWatchAssetRequest(watchRequest);
            setView("watchAssetConfirm");
          } else {
            setView("unlock");
          }
        })();
        return;
      }
      if (message.type === "onboardingComplete") {
        // Onboarding finished - reload to show unlock screen
        window.location.reload();
        return;
      }
      if (message.type === "accountsUpdated") {
        // Reload accounts and sync address when they change
        loadAccounts(true);
        return;
      }
      // Return undefined for unrecognized messages — critical so this listener
      // doesn't intercept messages meant for the background service worker
      // (an async handler always returns a Promise/truthy, which Chrome treats
      // as "I'll respond", stealing the response from the background)
    };

    chrome.runtime.onMessage.addListener(handleMessage);
    return () => chrome.runtime.onMessage.removeListener(handleMessage);
  }, []);

  // Listen for storage changes (e.g., when dapp switches chain or address changes in settings)
  useEffect(() => {
    const handleStorageChange = (
      changes: { [key: string]: chrome.storage.StorageChange },
      areaName: string,
    ) => {
      if (areaName === "sync") {
        if (changes.chainName) {
          const newChainName = changes.chainName.newValue;
          if (newChainName && newChainName !== chainName) {
            setChainName(newChainName);
          }
        }
        if (changes.address) {
          const newAddress = changes.address.newValue;
          if (newAddress && newAddress !== address) {
            setAddress(newAddress);
          }
        }
        if (changes.displayAddress) {
          const newDisplayAddress = changes.displayAddress.newValue;
          if (newDisplayAddress && newDisplayAddress !== displayAddress) {
            setDisplayAddress(newDisplayAddress);
          }
        }
      }
      // Sync pending requests when storage changes (e.g., confirmed/rejected from another context)
      if (areaName === "local") {
        if (changes.pendingTxRequests) {
          const updated: PendingTxRequest[] =
            changes.pendingTxRequests.newValue || [];
          setPendingRequests(updated);
          // If the currently selected tx was removed, clear it
          if (
            selectedTxRequest &&
            !updated.find((r) => r.id === selectedTxRequest.id)
          ) {
            if (updated.length > 0) {
              setSelectedTxRequest(updated[0]);
            } else {
              setSelectedTxRequest(null);
              if (view === "txConfirm" || view === "pendingTxList") {
                setActivityTabTrigger((k) => k + 1);
                setView("main");
              }
            }
          }
        }
        if (changes.pendingSignatureRequests) {
          const updated: PendingSignatureRequest[] =
            changes.pendingSignatureRequests.newValue || [];
          setPendingSignatureRequests(updated);
          // If the currently selected sig was removed, clear it
          if (
            selectedSignatureRequest &&
            !updated.find((r) => r.id === selectedSignatureRequest.id)
          ) {
            if (updated.length > 0) {
              setSelectedSignatureRequest(updated[0]);
            } else {
              setSelectedSignatureRequest(null);
              if (view === "signatureConfirm") {
                setView("main");
              }
            }
          }
        }
        if (changes.pendingBatchTxRequests) {
          const updated: PendingBatchTxRequest[] =
            changes.pendingBatchTxRequests.newValue || [];
          setPendingBatchRequests(updated);
          if (
            selectedBatchRequest &&
            !updated.find((r) => r.id === selectedBatchRequest.id)
          ) {
            if (updated.length > 0) {
              setSelectedBatchRequest(updated[0]);
            } else {
              setSelectedBatchRequest(null);
              if (view === "batchTxConfirm") {
                setActivityTabTrigger((k) => k + 1);
                setView("main");
              }
            }
          }
        }
        if (changes.pendingWatchAssetRequests) {
          const updated: PendingWatchAssetRequest[] =
            changes.pendingWatchAssetRequests.newValue || [];
          if (
            pendingWatchAssetRequest &&
            !updated.find((r) => r.id === pendingWatchAssetRequest.id)
          ) {
            setPendingWatchAssetRequest(null);
            if (view === "watchAssetConfirm") {
              setView("main");
            }
          }
        }
      }
    };

    chrome.storage.onChanged.addListener(handleStorageChange);
    return () => chrome.storage.onChanged.removeListener(handleStorageChange);
  }, [chainName, address, displayAddress, selectedTxRequest, selectedSignatureRequest, pendingWatchAssetRequest, view]);

  // Listen for tab activation changes to update chain for current tab
  useEffect(() => {
    const handleTabActivated = (activeInfo: chrome.tabs.TabActiveInfo) => {
      // Query the newly active tab for its chain info
      chrome.tabs.sendMessage(
        activeInfo.tabId,
        { type: "getInfo" },
        (store: {
          address: string;
          displayAddress: string;
          chainName: string;
        }) => {
          // Ignore errors (tab might not have content script injected)
          if (chrome.runtime.lastError) {
            return;
          }
          if (store?.chainName && store.chainName.length > 0) {
            setChainName(store.chainName);
          }
        },
      );
    };

    chrome.tabs.onActivated.addListener(handleTabActivated);
    return () => chrome.tabs.onActivated.removeListener(handleTabActivated);
  }, []);

  useUpdateEffect(() => {
    const updateChainId = async () => {
      if (networksInfo && chainName) {
        const tab = await currentTab();
        const chainId = networksInfo[chainName].chainId;

        chrome.tabs
          .sendMessage(tab.id!, {
            type: "setChainId",
            msg: { chainName, chainId, rpcUrl: networksInfo[chainName].rpcUrl },
          })
          .catch(() => {
            // Ignore errors if content script not injected (e.g. chrome:// pages)
          });

        await chrome.storage.sync.set({ chainName });
      }
    };

    updateChainId();
  }, [chainName, networksInfo]);

  useUpdateEffect(() => {
    if (reloadRequired && networksInfo) {
      setChainName(Object.keys(networksInfo)[0]);
    }
  }, [reloadRequired, networksInfo]);

  const handleUnlock = useCallback(async () => {
    // Mark wallet as unlocked
    setIsWalletUnlocked(true);

    // If we came from chat, return to chat
    if (returnToChatAfterUnlock) {
      setReturnToChatAfterUnlock(false);
      // Note: returnToConversationId is kept so ChatView can load the conversation
      setView("chat");
      return;
    }

    // Clear conversation ID if not returning to chat
    setReturnToConversationId(null);

    // Refresh pending requests after unlock
    const requests = await loadPendingRequests();
    const sigRequests = await loadPendingSignatureRequests();
    const batchReqs = await loadPendingBatchRequests();
    const watchAssetRequests = await loadPendingWatchAssetRequests();

    if (requests.length > 0) {
      setSelectedTxRequest(requests[requests.length - 1]);
      setView("txConfirm");
    } else if (batchReqs.length > 0) {
      setSelectedBatchRequest(batchReqs[batchReqs.length - 1]);
      setView("batchTxConfirm");
    } else if (sigRequests.length > 0) {
      setSelectedSignatureRequest(sigRequests[sigRequests.length - 1]);
      setView("signatureConfirm");
    } else if (watchAssetRequests.length > 0) {
      setPendingWatchAssetRequest(watchAssetRequests[watchAssetRequests.length - 1]);
      setView("watchAssetConfirm");
    } else {
      setView("main");
    }
  }, [returnToChatAfterUnlock]);

  const handleCopyAddress = async () => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  const handleTxConfirmed = useCallback(async () => {
    const currentTxId = selectedTxRequest?.id;
    const requests = await loadPendingRequests();

    // Check if more pending requests (use fresh data from loadPendingRequests)
    const remaining = requests.filter((r) => r.id !== currentTxId);
    if (remaining.length > 0) {
      setSelectedTxRequest(remaining[0]);
    } else {
      setSelectedTxRequest(null);
      setActivityTabTrigger((k) => k + 1);
      setView("main");
    }
  }, [selectedTxRequest?.id]);

  const handleTxRejected = useCallback(async () => {
    const currentTxId = selectedTxRequest?.id;
    const requests = await loadPendingRequests();

    // Check if more pending requests (use fresh data from loadPendingRequests)
    const remaining = requests.filter((r) => r.id !== currentTxId);
    if (remaining.length > 0) {
      setSelectedTxRequest(remaining[0]);
    } else {
      // Check for other pending request types before closing
      const batchReqs = await loadPendingBatchRequests();
      if (batchReqs.length > 0) {
        setSelectedTxRequest(null);
        setSelectedBatchRequest(batchReqs[0]);
        setView("batchTxConfirm");
      } else if (isInSidePanel || isFullscreenTab) {
        setSelectedTxRequest(null);
        setView("main");
      } else {
        window.close();
      }
    }
  }, [selectedTxRequest?.id, isInSidePanel, isFullscreenTab]);

  const handleRejectAll = useCallback(async () => {
    // Reject all pending transactions
    for (const request of pendingRequests) {
      await new Promise<void>((resolve) => {
        chrome.runtime.sendMessage(
          { type: "rejectTransaction", txId: request.id },
          () => resolve(),
        );
      });
    }
    // Reject all pending batch transactions
    for (const request of pendingBatchRequests) {
      await new Promise<void>((resolve) => {
        chrome.runtime.sendMessage(
          { type: "rejectBatchTransaction", bundleId: request.id },
          () => resolve(),
        );
      });
    }
    // Reject all pending signature requests
    for (const request of pendingSignatureRequests) {
      await new Promise<void>((resolve) => {
        chrome.runtime.sendMessage(
          { type: "rejectSignatureRequest", sigId: request.id },
          () => resolve(),
        );
      });
    }
    // Only close popup after rejecting all (not sidepanel or fullscreen tab)
    if (isInSidePanel || isFullscreenTab) {
      setPendingRequests([]);
      setPendingBatchRequests([]);
      setPendingSignatureRequests([]);
      setSelectedTxRequest(null);
      setSelectedBatchRequest(null);
      setSelectedSignatureRequest(null);
      setView("main");
    } else {
      window.close();
    }
  }, [
    pendingRequests,
    pendingBatchRequests,
    pendingSignatureRequests,
    isInSidePanel,
    isFullscreenTab,
  ]);

  const handleSignatureCancelled = useCallback(async () => {
    const currentSigId = selectedSignatureRequest?.id;
    const sigRequests = await loadPendingSignatureRequests();

    // Check if more pending signature requests (use fresh data)
    const remaining = sigRequests.filter((r) => r.id !== currentSigId);
    if (remaining.length > 0) {
      setSelectedSignatureRequest(remaining[0]);
    } else {
      // Check if there are other pending requests
      const txRequests = await loadPendingRequests();
      if (txRequests.length > 0) {
        setSelectedSignatureRequest(null);
        setSelectedTxRequest(txRequests[0]);
        setView("txConfirm");
        return;
      }
      const batchReqs = await loadPendingBatchRequests();
      if (batchReqs.length > 0) {
        setSelectedSignatureRequest(null);
        setSelectedBatchRequest(batchReqs[0]);
        setView("batchTxConfirm");
      } else if (isInSidePanel || isFullscreenTab) {
        setSelectedSignatureRequest(null);
        setView("main");
      } else {
        window.close();
      }
    }
  }, [selectedSignatureRequest?.id, isInSidePanel, isFullscreenTab]);

  const handleCancelAllSignatures = useCallback(async () => {
    // Cancel all pending signature requests
    for (const request of pendingSignatureRequests) {
      await new Promise<void>((resolve) => {
        chrome.runtime.sendMessage(
          { type: "rejectSignatureRequest", sigId: request.id },
          () => resolve(),
        );
      });
    }
    // Check if there are other pending requests
    const txRequests = await loadPendingRequests();
    if (txRequests.length > 0) {
      setPendingSignatureRequests([]);
      setSelectedSignatureRequest(null);
      setSelectedTxRequest(txRequests[0]);
      setView("txConfirm");
    } else {
      const batchReqs = await loadPendingBatchRequests();
      if (batchReqs.length > 0) {
        setPendingSignatureRequests([]);
        setSelectedSignatureRequest(null);
        setSelectedBatchRequest(batchReqs[0]);
        setView("batchTxConfirm");
      } else if (isInSidePanel || isFullscreenTab) {
        setPendingSignatureRequests([]);
        setSelectedSignatureRequest(null);
        setView("main");
      } else {
        window.close();
      }
    }
  }, [pendingSignatureRequests, isInSidePanel, isFullscreenTab]);

  // Split address for CSS middle-truncation with bold first/last 4 hex chars
  // Split hex chars (after "0x") in half, then prepend "0x" to the start
  const hexLen = address ? address.length - 2 : 0;
  const addrHalf = address ? 2 + Math.ceil(hexLen / 2) : 0;
  const addrBoldStart = address ? address.slice(0, 6) : "";
  const addrMidStart = address ? address.slice(6, addrHalf) : "";
  const addrMidEnd = address ? address.slice(addrHalf, -4) : "";
  const addrBoldEnd = address ? address.slice(-4) : "";

  if (isLoading) {
    return (
      <Box
        minH="300px"
        bg="bg.base"
        display="flex"
        alignItems="center"
        justifyContent="center"
      >
        <Text
          color="text.secondary"
          fontWeight="700"
          textTransform="uppercase"
          letterSpacing="wider"
        >
          Loading...
        </Text>
      </Box>
    );
  }

  // Unlock screen
  if (view === "unlock") {
    return (
      <Box bg="bg.base" h="100%" display="flex" flexDirection="column">
        <Box
          maxW={isFullscreenTab ? "480px" : "100%"}
          mx="auto"
          w="100%"
          h="100%"
          display="flex"
          flexDirection="column"
        >
          <UnlockScreen
            onUnlock={handleUnlock}
            pendingTxCount={pendingRequests.length}
            pendingSignatureCount={pendingSignatureRequests.length}
            pendingBatchCount={pendingBatchRequests.length}
          />
        </Box>
      </Box>
    );
  }

  // Waiting for onboarding to complete
  if (view === "waitingForOnboarding") {
    return (
      <Box bg="bg.base" h="100%" display="flex" flexDirection="column">
        <Box
          maxW={isFullscreenTab ? "480px" : "100%"}
          mx="auto"
          w="100%"
          h="100%"
          display="flex"
          flexDirection="column"
        >
          <Box
            minH="300px"
            bg="bg.base"
            display="flex"
            flexDirection="column"
            alignItems="center"
            justifyContent="center"
            p={6}
            textAlign="center"
            position="relative"
            flex="1"
          >
            {/* Geometric decorations */}
            <Box
              position="absolute"
              top={4}
              left={4}
              w="12px"
              h="12px"
              bg="bauhaus.red"
              border="2px solid"
              borderColor="bauhaus.black"
            />
            <Box
              position="absolute"
              top={4}
              right={4}
              w="12px"
              h="12px"
              bg="bauhaus.blue"
              border="2px solid"
              borderColor="bauhaus.black"
              borderRadius="full"
            />

            <VStack spacing={4}>
              <Box
                bg="bauhaus.yellow"
                border="3px solid"
                borderColor="bauhaus.black"
                boxShadow="4px 4px 0px 0px #121212"
                p={3}
              >
                <Image src="walletchan-icon.png" w="3rem" />
              </Box>
              <Text
                fontSize="lg"
                fontWeight="900"
                color="text.primary"
                textTransform="uppercase"
                letterSpacing="wider"
              >
                Complete Setup
              </Text>
              <Text fontSize="sm" color="text.secondary" fontWeight="500">
                Please complete the setup in the new tab that just opened.
              </Text>
              <Button
                variant="secondary"
                size="sm"
                onClick={async () => {
                  // Re-open or focus onboarding tab
                  const onboardingUrl =
                    chrome.runtime.getURL("onboarding.html");
                  const existingTabs = await chrome.tabs.query({
                    url: onboardingUrl,
                  });
                  if (existingTabs.length > 0 && existingTabs[0].id) {
                    await chrome.tabs.update(existingTabs[0].id, {
                      active: true,
                    });
                    await chrome.windows.update(existingTabs[0].windowId!, {
                      focused: true,
                    });
                  } else {
                    await chrome.tabs.create({ url: onboardingUrl });
                  }
                }}
              >
                Open Setup Tab
              </Button>
              <HStack spacing={1} justify="center" mt={4}>
                <Text fontSize="sm" color="text.tertiary" fontWeight="500">
                  Built by
                </Text>
                <Link
                  display="flex"
                  alignItems="center"
                  gap={1}
                  color="bauhaus.blue"
                  fontWeight="700"
                  _hover={{ color: "bauhaus.red" }}
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
          </Box>
        </Box>
      </Box>
    );
  }

  // Settings view
  if (view === "settings") {
    return (
      <Box bg="bg.base" h="100%" display="flex" flexDirection="column">
        <Box
          maxW={isFullscreenTab ? "480px" : "100%"}
          mx="auto"
          w="100%"
          h="100%"
          display="flex"
          flexDirection="column"
        >
          <Container
            pt={4}
            pb={4}
            flex="1"
            display="flex"
            flexDirection="column"
          >
            <Suspense fallback={<LoadingFallback />}>
              <Settings
                close={async () => {
                  // After settings, check if now have API key
                  const has = await hasEncryptedApiKey();
                  setHasApiKey(has);

                  if (has) {
                    // Ensure keepalive port is connected before checking lock state
                    // (service worker may have restarted while we were in settings)
                    establishKeepalivePort();
                    await new Promise((r) => setTimeout(r, 50));

                    const unlocked = await checkLockState();

                    if (unlocked) {
                      setIsWalletUnlocked(true);
                      setView("main");
                    } else {
                      // Check if this was unexpected (auto-lock is "Never")
                      // If so, try to restore the session
                      const { autoLockTimeout } =
                        await chrome.storage.sync.get("autoLockTimeout");

                      if (
                        autoLockTimeout === 0 ||
                        autoLockTimeout === undefined
                      ) {
                        // Auto-lock is "Never" - try session restoration
                        const restored = await sendMessageWithRetry<boolean>({
                          type: "tryRestoreSession",
                        });
                        if (restored) {
                          setIsWalletUnlocked(true);
                          setView("main");
                          return;
                        }
                      }

                      setIsWalletUnlocked(false);
                      setView("unlock");
                    }
                  }
                }}
                showBackButton={hasApiKey}
                onSessionExpired={() => {
                  setIsWalletUnlocked(false);
                  setView("unlock");
                }}
              />
            </Suspense>
          </Container>
        </Box>
      </Box>
    );
  }

  // Chat view
  if (view === "chat") {
    return (
      <Box bg="bg.base" h="100%" display="flex" flexDirection="column">
        <Box
          maxW={isFullscreenTab ? "600px" : "100%"}
          mx="auto"
          w="100%"
          h="100%"
          display="flex"
          flexDirection="column"
        >
          <Suspense fallback={<LoadingFallback />}>
            <ChatView
              onBack={() => {
                setStartChatWithNew(false);
                setReturnToConversationId(null);
                setView("main");
              }}
              startWithNewChat={startChatWithNew}
              returnToConversationId={returnToConversationId}
              isWalletUnlocked={isWalletUnlocked}
              onUnlock={(conversationId) => {
                setReturnToChatAfterUnlock(true);
                setReturnToConversationId(conversationId || null);
                setView("unlock");
              }}
              onWalletLocked={() => {
                setIsWalletUnlocked(false);
              }}
            />
          </Suspense>
        </Box>
      </Box>
    );
  }

  // Add Account view
  if (view === "addAccount") {
    return (
      <Box bg="bg.base" h="100%" display="flex" flexDirection="column">
        <Box
          maxW={isFullscreenTab ? "480px" : "100%"}
          mx="auto"
          w="100%"
          h="100%"
          display="flex"
          flexDirection="column"
        >
          <Suspense fallback={<LoadingFallback />}>
            <AddAccount
              onBack={() => setView("main")}
              onAccountAdded={async () => {
                await loadAccounts(true);
                setView("main");
              }}
            />
          </Suspense>
        </Box>
      </Box>
    );
  }

  // Transfer view
  if (view === "transfer") {
    return (
      <Box bg="bg.base" h="100%" display="flex" flexDirection="column">
        <Box
          maxW={isFullscreenTab ? "480px" : "100%"}
          mx="auto"
          w="100%"
          h="100%"
          display="flex"
          flexDirection="column"
        >
          <Suspense fallback={<LoadingFallback />}>
            <TokenTransfer
              token={transferToken}
              fromAddress={address}
              chainId={networksInfo?.[chainName!]?.chainId || 8453}
              accountType={activeAccount?.type || "bankr"}
              accounts={accounts}
              onBack={() => {
                setTransferToken(null);
                setView("main");
              }}
              onTransferInitiated={(sponsored?: boolean) => {
                setTransferToken(null);
                if (sponsored) {
                  // Sponsored flow: no tx confirmation screen, go straight to activity
                  setView("main");
                  setActivityTabTrigger((n) => n + 1);
                }
                // Normal flow: the newPendingTxRequest listener will auto-switch to txConfirm
              }}
              onSwapInstead={(token) => {
                setTransferToken(null);
                setSwapInitialSellToken(token);
                setView("swap");
              }}
            />
          </Suspense>
        </Box>
      </Box>
    );
  }

  // Swap view
  if (view === "swap") {
    return (
      <Box bg="bg.base" h="100%" display="flex" flexDirection="column">
        <Box
          maxW={isFullscreenTab ? "480px" : "100%"}
          mx="auto"
          w="100%"
          h="100%"
          display="flex"
          flexDirection="column"
        >
          <Suspense fallback={<LoadingFallback />}>
            <SwapView
              fromAddress={address}
              accountType={activeAccount?.type || "bankr"}
              chainId={networksInfo?.[chainName!]?.chainId || 8453}
              chainName={chainName || "Base"}
              onBack={() => {
                setSwapInitialBuyToken(undefined);
                setSwapInitialSellToken(undefined);
                setView("main");
              }}
              onSwapInitiated={() => {
                setSwapInitialBuyToken(undefined);
                setSwapInitialSellToken(undefined);
                setView("main");
                setActivityTabTrigger((t) => t + 1);
              }}
              onChainChange={(name) => {
                setChainName(name);
                chrome.storage.sync.set({ chainName: name });
              }}
              initialBuyToken={swapInitialBuyToken}
              initialSellToken={swapInitialSellToken}
            />
          </Suspense>
        </Box>
      </Box>
    );
  }

  // Pending tx list view
  if (view === "pendingTxList") {
    return (
      <Box bg="bg.base" h="100%" display="flex" flexDirection="column">
        <Box
          maxW={isFullscreenTab ? "480px" : "100%"}
          mx="auto"
          w="100%"
          h="100%"
          display="flex"
          flexDirection="column"
        >
          <Suspense fallback={<LoadingFallback />}>
            <PendingTxList
              txRequests={pendingRequests}
              signatureRequests={pendingSignatureRequests}
              batchRequests={pendingBatchRequests}
              onBack={() => setView("main")}
              onSelectTx={(tx) => {
                setSelectedTxRequest(tx);
                setView("txConfirm");
              }}
              onSelectSignature={(sig) => {
                setSelectedSignatureRequest(sig);
                setView("signatureConfirm");
              }}
              onSelectBatch={(batch) => {
                setSelectedBatchRequest(batch);
                setView("batchTxConfirm");
              }}
              onRejectAll={handleRejectAll}
            />
          </Suspense>
        </Box>
      </Box>
    );
  }

  // Transaction confirmation view
  if (view === "txConfirm" && selectedTxRequest) {
    const combinedRequests = getCombinedRequests(
      pendingRequests,
      pendingSignatureRequests,
      pendingBatchRequests,
    );
    const currentIndex = combinedRequests.findIndex(
      (r) => r.type === "tx" && r.request.id === selectedTxRequest.id,
    );
    const totalCount = combinedRequests.length;
    return (
      <Box bg="bg.base" h="100%" display="flex" flexDirection="column">
        <Box
          maxW={isFullscreenTab ? "480px" : "100%"}
          mx="auto"
          w="100%"
          h="100%"
          display="flex"
          flexDirection="column"
        >
          <Suspense fallback={<LoadingFallback />}>
            <TransactionConfirmation
              key={selectedTxRequest.id}
              txRequest={selectedTxRequest}
              currentIndex={currentIndex >= 0 ? currentIndex : 0}
              totalCount={totalCount}
              isInSidePanel={isInSidePanel || isFullscreenTab}
              accountType={activeAccount?.type}
              onBack={() => {
                if (totalCount > 1) {
                  setView("pendingTxList");
                } else {
                  setView("main");
                }
              }}
              onConfirmed={handleTxConfirmed}
              onRejected={handleTxRejected}
              onRejectAll={handleRejectAll}
              onNavigate={(direction) => {
                const currentIdx = combinedRequests.findIndex(
                  (r) =>
                    r.type === "tx" && r.request.id === selectedTxRequest.id,
                );
                const newIdx =
                  direction === "prev" ? currentIdx - 1 : currentIdx + 1;
                if (newIdx >= 0 && newIdx < combinedRequests.length) {
                  const nextRequest = combinedRequests[newIdx];
                  if (nextRequest.type === "tx") {
                    setSelectedTxRequest(nextRequest.request);
                  } else if (nextRequest.type === "batch") {
                    setSelectedTxRequest(null);
                    setSelectedBatchRequest(nextRequest.request);
                    setView("batchTxConfirm");
                  } else {
                    setSelectedTxRequest(null);
                    setSelectedSignatureRequest(nextRequest.request);
                    setView("signatureConfirm");
                  }
                }
              }}
            />
          </Suspense>
        </Box>
      </Box>
    );
  }

  // Batch transaction confirmation view (ERC-5792)
  if (view === "batchTxConfirm" && selectedBatchRequest) {
    const combinedRequests = getCombinedRequests(
      pendingRequests,
      pendingSignatureRequests,
      pendingBatchRequests,
    );
    const currentIndex = combinedRequests.findIndex(
      (r) => r.type === "batch" && r.request.id === selectedBatchRequest.id,
    );
    const totalCount = combinedRequests.length;
    return (
      <Box bg="bg.base" h="100%" display="flex" flexDirection="column">
        <Box
          maxW={isFullscreenTab ? "480px" : "100%"}
          mx="auto"
          w="100%"
          h="100%"
          display="flex"
          flexDirection="column"
        >
          <Suspense fallback={<LoadingFallback />}>
            <BatchTransactionConfirmation
              key={selectedBatchRequest.id}
              batchRequest={selectedBatchRequest}
              currentIndex={currentIndex >= 0 ? currentIndex : 0}
              totalCount={totalCount}
              isInSidePanel={isInSidePanel || isFullscreenTab}
              accountType={activeAccount?.type}
              accountAddress={address}
              onBack={() => {
                if (totalCount > 1) {
                  setView("pendingTxList");
                } else {
                  setView("main");
                }
              }}
              onConfirmed={() => {
                setSelectedBatchRequest(null);
                setActivityTabTrigger((k) => k + 1);
                if (pendingBatchRequests.length > 1) {
                  const remaining = pendingBatchRequests.filter(
                    (r) => r.id !== selectedBatchRequest.id,
                  );
                  if (remaining.length > 0) {
                    setSelectedBatchRequest(remaining[0]);
                  } else {
                    setView("main");
                  }
                } else {
                  setView("main");
                }
              }}
              onRejected={() => {
                setSelectedBatchRequest(null);
                setActivityTabTrigger((k) => k + 1);
                if (pendingBatchRequests.length > 1) {
                  const remaining = pendingBatchRequests.filter(
                    (r) => r.id !== selectedBatchRequest.id,
                  );
                  if (remaining.length > 0) {
                    setSelectedBatchRequest(remaining[0]);
                  } else if (isInSidePanel || isFullscreenTab) {
                    setView("main");
                  } else {
                    window.close();
                  }
                } else if (isInSidePanel || isFullscreenTab) {
                  setView("main");
                } else {
                  window.close();
                }
              }}
              onRejectAll={handleRejectAll}
              onNavigate={(direction) => {
                const currentIdx = combinedRequests.findIndex(
                  (r) =>
                    r.type === "batch" &&
                    r.request.id === selectedBatchRequest.id,
                );
                const newIdx =
                  direction === "prev" ? currentIdx - 1 : currentIdx + 1;
                if (newIdx >= 0 && newIdx < combinedRequests.length) {
                  const nextRequest = combinedRequests[newIdx];
                  if (nextRequest.type === "batch") {
                    setSelectedBatchRequest(nextRequest.request);
                  } else if (nextRequest.type === "tx") {
                    setSelectedBatchRequest(null);
                    setSelectedTxRequest(nextRequest.request);
                    setView("txConfirm");
                  } else {
                    setSelectedBatchRequest(null);
                    setSelectedSignatureRequest(nextRequest.request);
                    setView("signatureConfirm");
                  }
                }
              }}
            />
          </Suspense>
        </Box>
      </Box>
    );
  }

  // Signature request confirmation view
  if (view === "signatureConfirm" && selectedSignatureRequest) {
    const combinedRequests = getCombinedRequests(
      pendingRequests,
      pendingSignatureRequests,
      pendingBatchRequests,
    );
    const currentIndex = combinedRequests.findIndex(
      (r) => r.type === "sig" && r.request.id === selectedSignatureRequest.id,
    );
    const totalCount = combinedRequests.length;
    return (
      <Box bg="bg.base" h="100%" display="flex" flexDirection="column">
        <Box
          maxW={isFullscreenTab ? "480px" : "100%"}
          mx="auto"
          w="100%"
          h="100%"
          display="flex"
          flexDirection="column"
        >
          <Suspense fallback={<LoadingFallback />}>
            <SignatureRequestConfirmation
              key={selectedSignatureRequest.id}
              sigRequest={selectedSignatureRequest}
              currentIndex={currentIndex >= 0 ? currentIndex : 0}
              totalCount={totalCount}
              isInSidePanel={isInSidePanel || isFullscreenTab}
              accountType={activeAccount?.type}
              onBack={() => {
                setSelectedSignatureRequest(null);
                if (totalCount > 1) {
                  setView("pendingTxList");
                } else {
                  setView("main");
                }
              }}
              onCancelled={handleSignatureCancelled}
              onCancelAll={handleCancelAllSignatures}
              onConfirmed={handleSignatureCancelled}
              onNavigate={(direction) => {
                const currentIdx = combinedRequests.findIndex(
                  (r) =>
                    r.type === "sig" &&
                    r.request.id === selectedSignatureRequest.id,
                );
                const newIdx =
                  direction === "prev" ? currentIdx - 1 : currentIdx + 1;
                if (newIdx >= 0 && newIdx < combinedRequests.length) {
                  const nextRequest = combinedRequests[newIdx];
                  if (nextRequest.type === "sig") {
                    setSelectedSignatureRequest(nextRequest.request);
                  } else {
                    setSelectedSignatureRequest(null);
                    setSelectedTxRequest(nextRequest.request);
                    setView("txConfirm");
                  }
                }
              }}
            />
          </Suspense>
        </Box>
      </Box>
    );
  }

  if (view === "watchAssetConfirm" && pendingWatchAssetRequest) {
    return (
      <Box bg="bg.base" h="100%" display="flex" flexDirection="column">
        <Box
          maxW={isFullscreenTab ? "480px" : "100%"}
          mx="auto"
          w="100%"
          h="100%"
          display="flex"
          flexDirection="column"
        >
          <Suspense fallback={<LoadingFallback />}>
            <WatchAssetConfirmation
              request={pendingWatchAssetRequest}
              onConfirmed={() => {
                setPendingWatchAssetRequest(null);
                setView("main");
              }}
              onRejected={() => {
                setPendingWatchAssetRequest(null);
                setView("main");
              }}
            />
          </Suspense>
        </Box>
      </Box>
    );
  }

  // Main view
  return (
    <Box bg="bg.base" h="100%" display="flex" flexDirection="column">
      {/* Fullscreen centered wrapper */}
      <Box
        maxW={isFullscreenTab ? "480px" : "100%"}
        mx="auto"
        w="100%"
        h="100%"
        display="flex"
        flexDirection="column"
      >
        {/* Header */}
        <Flex
          py={3}
          px={4}
          bg="bauhaus.black"
          alignItems="center"
          position="relative"
        >
          {/* Decorative stripe */}
          <Box
            position="absolute"
            bottom="0"
            left="0"
            right="0"
            h="3px"
            bg="bauhaus.red"
          />

          <HStack spacing={2}>
            <Box bg="bauhaus.white" p={0.5}>
              <Image src="walletchan-icon-white-bg.png" h="1.75rem" />
            </Box>
            <Text
              fontWeight="900"
              color="bauhaus.white"
              textTransform="uppercase"
              letterSpacing="wider"
            >
              WalletChan
            </Text>
          </HStack>
          <Spacer />
          <HStack spacing={1}>
            {activeAccount?.type === "bankr" && (
              <Tooltip label="Chat History" placement="bottom">
                <IconButton
                  aria-label="Chat History"
                  icon={<ChatIcon />}
                  variant="ghost"
                  size="sm"
                  color="bauhaus.white"
                  _hover={{ bg: "whiteAlpha.200" }}
                  onClick={() => {
                    setStartChatWithNew(false);
                    setView("chat");
                  }}
                />
              </Tooltip>
            )}
            <Tooltip label="Lock wallet" placement="bottom">
              <IconButton
                aria-label="Lock wallet"
                icon={<LockIcon />}
                variant="ghost"
                size="sm"
                color="bauhaus.white"
                _hover={{ bg: "whiteAlpha.200" }}
                onClick={() => {
                  chrome.runtime.sendMessage({ type: "lockWallet" }, () => {
                    setView("unlock");
                  });
                }}
              />
            </Tooltip>
            {sidePanelSupported && !isFullscreenTab && (
              <Tooltip
                label={sidePanelMode ? "Switch to popup" : "Switch to sidepanel"}
                placement="bottom"
              >
                <IconButton
                  aria-label={sidePanelMode ? "Switch to popup" : "Switch to sidepanel"}
                  icon={<SidePanelIcon />}
                  variant="ghost"
                  size="sm"
                  color="bauhaus.white"
                  _hover={{ bg: "whiteAlpha.200" }}
                  onClick={toggleSidePanelMode}
                />
              </Tooltip>
            )}
            {!isFullscreenTab && (
              <Tooltip label="Open in new tab" placement="bottom">
                <IconButton
                  aria-label="Open in new tab"
                  icon={<FullscreenIcon />}
                  variant="ghost"
                  size="sm"
                  color="bauhaus.white"
                  _hover={{ bg: "whiteAlpha.200" }}
                  onClick={openInFullscreenTab}
                />
              </Tooltip>
            )}
            <IconButton
              aria-label="Settings"
              icon={<SettingsIcon />}
              variant="ghost"
              size="sm"
              color="bauhaus.white"
              _hover={{ bg: "whiteAlpha.200" }}
              onClick={() => setView("settings")}
            />
          </HStack>
        </Flex>

        {/* Powered by Banner */}
        <HStack
          bg="bauhaus.yellow"
          py={1}
          px={4}
          justify="center"
          spacing={2}
          borderBottom="3px solid"
          borderColor="bauhaus.black"
        >
          <Box w="6px" h="6px" bg="bauhaus.black" />
          <Text
            fontSize="xs"
            fontWeight="700"
            color="bauhaus.black"
            textTransform="uppercase"
            letterSpacing="wider"
          >
            Powered by
          </Text>
          <Link
            bg="bauhaus.blue"
            color="bauhaus.white"
            px={2}
            py={0.5}
            fontWeight="900"
            fontSize="xs"
            textTransform="uppercase"
            letterSpacing="wide"
            border="2px solid"
            borderColor="bauhaus.black"
            _hover={{
              bg: "#F97316",
              color: "bauhaus.white",
            }}
            transition="all 0.2s ease-out"
            cursor="pointer"
            onClick={() => {
              // Switch to Base and open swap with WCHAN as buy token
              const baseName = networksInfo
                ? Object.keys(networksInfo).find(
                    (n) => networksInfo[n].chainId === 8453,
                  )
                : "Base";
              if (baseName) {
                setChainName(baseName);
                chrome.storage.sync.set({ chainName: baseName });
              }
              setSwapInitialBuyToken({
                address: "0xBa5ED0000e1CA9136a695f0a848012A16008B032",
                name: "WalletChan",
                symbol: "WCHAN",
                decimals: 18,
                logoURI: WALLETCHAN_ICON_URL,
              });
              setView("swap");
            }}
          >
            $WCHAN
          </Link>
          <Box w="6px" h="6px" bg="bauhaus.black" />
        </HStack>

        {/* WalletChan OS Banner */}
        <HStack
          bg="linear-gradient(90deg, #1a1a2e 0%, #16213e 50%, #1a1a2e 100%)"
          py={1.5}
          px={4}
          justify="center"
          spacing={3}
          borderBottom="2px solid"
          borderColor="bauhaus.black"
          cursor="pointer"
          transition="all 0.15s ease-out"
          _hover={{ opacity: 0.85 }}
          onClick={() => {
            chrome.tabs.create({ url: WALLETCHAN_OS_URL });
          }}
        >
          <Text fontSize="sm" fontWeight="900" color="bauhaus.yellow" textTransform="uppercase" letterSpacing="wider" whiteSpace="nowrap">
            WalletChan OS
          </Text>
          <Flex direction="column" align="flex-start">
            <HStack spacing={1}>
              <Text fontSize="9px" fontWeight="600" color="gray.400">
                Your Web3 Operating System
              </Text>
              <ExternalLinkIcon boxSize={2} color="gray.500" />
            </HStack>
            <Text fontSize="8px" fontWeight="500" color="gray.500">
              All dapps in one place
            </Text>
          </Flex>
        </HStack>

        <Container
          pt={3}
          pb={4}
          flex="1"
          display="flex"
          flexDirection="column"
          overflowY="auto"
        >
          <VStack spacing={4} align="stretch">
            {/* Failed Transaction Error */}
            {failedTxError && (
              <Box
                bg="bauhaus.red"
                border="3px solid"
                borderColor="bauhaus.black"
                boxShadow="4px 4px 0px 0px #121212"
                p={3}
                position="relative"
              >
                <HStack w="full" justify="space-between" mb={2}>
                  <HStack>
                    <Box p={1} bg="bauhaus.black">
                      <WarningIcon color="bauhaus.red" boxSize={4} />
                    </Box>
                    <Text fontSize="sm" color="white" fontWeight="700">
                      Transaction Failed
                    </Text>
                  </HStack>
                  <Button
                    size="xs"
                    variant="ghost"
                    color="white"
                    _hover={{ bg: "whiteAlpha.200" }}
                    onClick={() => setFailedTxError(null)}
                  >
                    Dismiss
                  </Button>
                </HStack>
                <Text
                  fontSize="xs"
                  color="whiteAlpha.800"
                  mb={1}
                  fontWeight="500"
                >
                  {failedTxError.origin}
                </Text>
                <Text fontSize="sm" color="white" fontWeight="500">
                  {failedTxError.error}
                </Text>
              </Box>
            )}

            {/* Pending Requests Banner */}
            <PendingTxBanner
              txCount={pendingRequests.length}
              signatureCount={pendingSignatureRequests.length}
              batchCount={pendingBatchRequests.length}
              onClickTx={() => {
                if (pendingRequests.length === 1 && pendingSignatureRequests.length === 0 && pendingBatchRequests.length === 0) {
                  setSelectedTxRequest(pendingRequests[0]);
                  setView("txConfirm");
                } else {
                  setView("pendingTxList");
                }
              }}
              onClickSignature={() => {
                if (pendingSignatureRequests.length > 0) {
                  setSelectedSignatureRequest(pendingSignatureRequests[0]);
                  setView("signatureConfirm");
                }
              }}
              onClickBatch={() => {
                if (pendingBatchRequests.length === 1 && pendingRequests.length === 0 && pendingSignatureRequests.length === 0) {
                  setSelectedBatchRequest(pendingBatchRequests[0]);
                  setView("batchTxConfirm");
                } else {
                  setView("pendingTxList");
                }
              }}
            />

            {/* Account Switcher + Chain Selector Row */}
            <HStack spacing={3} align="stretch">
              {accounts.length > 0 && (
                <Box flex={1} minW={0}>
                  <Suspense fallback={null}>
                    <AccountSwitcher
                      accounts={accounts}
                      activeAccount={activeAccount}
                      onAccountSelect={handleAccountSwitch}
                      onAddAccount={() => setView("addAccount")}
                      onAccountSettings={(account) => {
                        setSettingsAccount(account);
                        onAccountSettingsOpen();
                      }}
                    />
                  </Suspense>
                </Box>
              )}

              {/* Chain Selector */}
              <Menu isLazy lazyBehavior="unmount">
                <MenuButton
                  as={Button}
                  variant="ghost"
                  bg="bauhaus.white"
                  border="3px solid"
                  borderColor="bauhaus.black"
                  boxShadow="4px 4px 0px 0px #121212"
                  _hover={{
                    transform: "translateY(-2px)",
                    boxShadow: "6px 6px 0px 0px #121212",
                  }}
                  _active={{
                    transform: "translate(2px, 2px)",
                    boxShadow: "none",
                  }}
                  rightIcon={<ChevronDownIcon />}
                  fontWeight="700"
                  h="full"
                  py={3}
                  px={3}
                  borderRadius="0"
                  transition="all 0.2s ease-out"
                  flexShrink={0}
                >
                  {chainName && networksInfo ? (
                    <HStack spacing={1.5}>
                      <Image
                        src={
                          getChainConfig(networksInfo[chainName].chainId).icon
                        }
                        alt={chainName}
                        boxSize="18px"
                      />
                      <Text fontSize="xs" fontWeight="700" noOfLines={1}>
                        {chainName}
                      </Text>
                    </HStack>
                  ) : (
                    <Text color="text.tertiary" fontSize="sm">
                      Net
                    </Text>
                  )}
                </MenuButton>
                <MenuList
                  bg="bauhaus.white"
                  border="3px solid"
                  borderColor="bauhaus.black"
                  boxShadow="4px 4px 0px 0px #121212"
                  borderRadius="0"
                  py={0}
                  minW="160px"
                >
                  {networksInfo &&
                    Object.keys(networksInfo)
                      .filter((_chainName) => {
                        if (activeAccount?.type === "bankr") {
                          return BANKR_SUPPORTED_CHAIN_IDS.has(
                            networksInfo[_chainName].chainId,
                          );
                        }
                        return true;
                      })
                      .map((_chainName, i, filteredChains) => {
                        const config = getChainConfig(
                          networksInfo[_chainName].chainId,
                        );
                        return (
                          <MenuItem
                            key={_chainName}
                            bg="bauhaus.white"
                            _hover={{ bg: "bg.muted" }}
                            borderBottom={
                              i < filteredChains.length - 1
                                ? "2px solid"
                                : "none"
                            }
                            borderColor="bauhaus.black"
                            py={3}
                            onClick={() => {
                              if (!chainName) {
                                setReloadRequired(true);
                              }
                              setChainName(_chainName);
                            }}
                          >
                            <HStack spacing={2}>
                              {config.icon && (
                                <Box
                                  bg="bauhaus.white"
                                  border="2px solid"
                                  borderColor="bauhaus.black"
                                  p={0.5}
                                >
                                  <Image
                                    src={config.icon}
                                    alt={_chainName}
                                    boxSize="18px"
                                  />
                                </Box>
                              )}
                              <Text color="text.primary" fontWeight="700">
                                {_chainName}
                              </Text>
                            </HStack>
                          </MenuItem>
                        );
                      })}
                </MenuList>
              </Menu>
            </HStack>

            {/* Address Bar — compact utility row */}
            {address && (
              <HStack spacing={2} align="center">
                {/* Address pill */}
                <HStack
                  bg="bauhaus.black"
                  px={2}
                  py={1}
                  spacing={2}
                  flex={1}
                  minW={0}
                >
                  <Flex
                    flex={1}
                    minW={0}
                    fontSize="sm"
                    fontFamily="mono"
                    color="bauhaus.white"
                  >
                    <Box
                      as="span"
                      overflow="hidden"
                      whiteSpace="nowrap"
                      flex="1 1 50%"
                      minW="6ch"
                      sx={{
                        maskImage:
                          "linear-gradient(to right, black calc(100% - 2ch), transparent 100%)",
                        WebkitMaskImage:
                          "linear-gradient(to right, black calc(100% - 2ch), transparent 100%)",
                      }}
                    >
                      <Box as="span" fontWeight="700">{addrBoldStart}</Box>
                      <Box as="span" fontWeight="400" opacity={0.5}>{addrMidStart}</Box>
                    </Box>
                    <Box
                      as="span"
                      flexShrink={0}
                      fontWeight="700"
                      opacity={0.5}
                    >
                      ...
                    </Box>
                    <Box
                      as="span"
                      overflow="hidden"
                      whiteSpace="nowrap"
                      flex="1 1 50%"
                      minW="4ch"
                      dir="rtl"
                      textAlign="left"
                      sx={{
                        maskImage:
                          "linear-gradient(to left, black calc(100% - 2ch), transparent 100%)",
                        WebkitMaskImage:
                          "linear-gradient(to left, black calc(100% - 2ch), transparent 100%)",
                      }}
                    >
                      <Box as="span" dir="ltr" display="inline-block">
                        <Box as="span" fontWeight="400" opacity={0.5}>{addrMidEnd}</Box>
                        <Box as="span" fontWeight="700">{addrBoldEnd}</Box>
                      </Box>
                    </Box>
                  </Flex>
                  <IconButton
                    aria-label="Show QR code"
                    icon={
                      <Icon viewBox="0 0 24 24" boxSize="14px">
                        <path
                          fill="currentColor"
                          fillRule="evenodd"
                          clipRule="evenodd"
                          d="M3 4.875C3 3.83947 3.83947 3 4.875 3H9.375C10.4105 3 11.25 3.83947 11.25 4.875V9.375C11.25 10.4105 10.4105 11.25 9.375 11.25H4.875C3.83947 11.25 3 10.4105 3 9.375V4.875ZM4.875 4.5C4.66789 4.5 4.5 4.66789 4.5 4.875V9.375C4.5 9.58211 4.66789 9.75 4.875 9.75H9.375C9.58211 9.75 9.75 9.58211 9.75 9.375V4.875C9.75 4.66789 9.58211 4.5 9.375 4.5H4.875ZM12.75 4.875C12.75 3.83947 13.5895 3 14.625 3H19.125C20.1605 3 21 3.83947 21 4.875V9.375C21 10.4105 20.1605 11.25 19.125 11.25H14.625C13.5895 11.25 12.75 10.4105 12.75 9.375V4.875ZM14.625 4.5C14.4179 4.5 14.25 4.66789 14.25 4.875V9.375C14.25 9.58211 14.4179 9.75 14.625 9.75H19.125C19.3321 9.75 19.5 9.58211 19.5 9.375V4.875C19.5 4.66789 19.3321 4.5 19.125 4.5H14.625ZM6 6.75C6 6.33579 6.33579 6 6.75 6H7.5C7.91421 6 8.25 6.33579 8.25 6.75V7.5C8.25 7.91421 7.91421 8.25 7.5 8.25H6.75C6.33579 8.25 6 7.91421 6 7.5V6.75ZM15.75 6.75C15.75 6.33579 16.0858 6 16.5 6H17.25C17.6642 6 18 6.33579 18 6.75V7.5C18 7.91421 17.6642 8.25 17.25 8.25H16.5C16.0858 8.25 15.75 7.91421 15.75 7.5V6.75ZM3 14.625C3 13.5895 3.83947 12.75 4.875 12.75H9.375C10.4105 12.75 11.25 13.5895 11.25 14.625V19.125C11.25 20.1605 10.4105 21 9.375 21H4.875C3.83947 21 3 20.1605 3 19.125V14.625ZM4.875 14.25C4.66789 14.25 4.5 14.4179 4.5 14.625V19.125C4.5 19.3321 4.66789 19.5 4.875 19.5H9.375C9.58211 19.5 9.75 19.3321 9.75 19.125V14.625C9.75 14.4179 9.58211 14.25 9.375 14.25H4.875ZM12.75 13.5C12.75 13.0858 13.0858 12.75 13.5 12.75H14.25C14.6642 12.75 15 13.0858 15 13.5V14.25C15 14.6642 14.6642 15 14.25 15H13.5C13.0858 15 12.75 14.6642 12.75 14.25V13.5ZM18.75 13.5C18.75 13.0858 19.0858 12.75 19.5 12.75H20.25C20.6642 12.75 21 13.0858 21 13.5V14.25C21 14.6642 20.6642 15 20.25 15H19.5C19.0858 15 18.75 14.6642 18.75 14.25V13.5ZM6 16.5C6 16.0858 6.33579 15.75 6.75 15.75H7.5C7.91421 15.75 8.25 16.0858 8.25 16.5V17.25C8.25 17.6642 7.91421 18 7.5 18H6.75C6.33579 18 6 17.6642 6 17.25V16.5ZM15.75 16.5C15.75 16.0858 16.0858 15.75 16.5 15.75H17.25C17.6642 15.75 18 16.0858 18 16.5V17.25C18 17.6642 17.6642 18 17.25 18H16.5C16.0858 18 15.75 17.6642 15.75 17.25V16.5ZM12.75 19.5C12.75 19.0858 13.0858 18.75 13.5 18.75H14.25C14.6642 18.75 15 19.0858 15 19.5V20.25C15 20.6642 14.6642 21 14.25 21H13.5C13.0858 21 12.75 20.6642 12.75 20.25V19.5ZM18.75 19.5C18.75 19.0858 19.0858 18.75 19.5 18.75H20.25C20.6642 18.75 21 19.0858 21 19.5V20.25C21 20.6642 20.6642 21 20.25 21H19.5C19.0858 21 18.75 20.6642 18.75 20.25V19.5Z"
                        />
                      </Icon>
                    }
                    size="xs"
                    variant="ghost"
                    color="bauhaus.white"
                    onClick={onQROpen}
                    _hover={{ color: "bauhaus.yellow" }}
                    minW="auto"
                    h="auto"
                    p={0}
                  />
                  <IconButton
                    aria-label="Copy address"
                    icon={copied ? <CheckIcon /> : <CopyIcon />}
                    size="xs"
                    variant="ghost"
                    color={copied ? "bauhaus.yellow" : "bauhaus.white"}
                    onClick={handleCopyAddress}
                    _hover={{ color: "bauhaus.yellow" }}
                    minW="auto"
                    h="auto"
                    p={0}
                  />
                  {chainName && networksInfo && (
                    <IconButton
                      aria-label="View on explorer"
                      icon={<ExternalLinkIcon />}
                      size="xs"
                      variant="ghost"
                      color="bauhaus.white"
                      onClick={() => {
                        const config = getChainConfig(
                          networksInfo[chainName].chainId,
                        );
                        if (config.explorer) {
                          chrome.tabs.create({
                            url: `${config.explorer}/address/${address}`,
                          });
                        }
                      }}
                      _hover={{ color: "bauhaus.yellow" }}
                      minW="auto"
                      h="auto"
                      p={0}
                    />
                  )}
                </HStack>
                {/* Explorer shortcuts */}
                <HStack spacing={1} flexShrink={0} justify="flex-end">
                  {[
                    {
                      name: "Octav",
                      icon: "octav-icon.png",
                      url: `https://pro.octav.fi/?addresses=${address}`,
                    },
                    {
                      name: "DeBank",
                      icon: "debank-icon.ico",
                      url: `https://debank.com/profile/${address}`,
                    },
                    {
                      name: "Zapper",
                      icon: "zapper-icon.png",
                      url: `https://zapper.xyz/account/${address}`,
                    },
                    {
                      name: "Nansen",
                      icon: "nansen-icon.png",
                      url: `https://app.nansen.ai/address/${address}`,
                    },
                  ].map((site) => (
                    <Box
                      key={site.name}
                      as="button"
                      bg="bauhaus.white"
                      border="2px solid"
                      borderColor="bauhaus.black"
                      boxShadow="2px 2px 0px 0px #121212"
                      p={0.5}
                      cursor="pointer"
                      transition="all 0.15s ease-out"
                      _hover={{
                        transform: "translateY(-1px)",
                        boxShadow: "3px 3px 0px 0px #121212",
                      }}
                      _active={{
                        transform: "translate(2px, 2px)",
                        boxShadow: "none",
                      }}
                      onClick={() => {
                        chrome.tabs.create({ url: site.url });
                      }}
                      title={`View on ${site.name}`}
                    >
                      <Image src={site.icon} boxSize="18px" />
                    </Box>
                  ))}
                </HStack>
              </HStack>
            )}

            {/* Swap + Send + Stake Buttons */}
            {address && activeAccount?.type !== "impersonator" && (
              <HStack spacing={2}>
                <Button
                  flex={1}
                  bg="bauhaus.blue"
                  color="bauhaus.white"
                  border="3px solid"
                  borderColor="bauhaus.black"
                  boxShadow="4px 4px 0px 0px #121212"
                  fontWeight="800"
                  fontSize="sm"
                  textTransform="uppercase"
                  letterSpacing="wider"
                  borderRadius={0}
                  leftIcon={<SwapIcon boxSize={5} />}
                  onClick={() => {
                    setSwapInitialBuyToken(undefined);
                    setView("swap");
                  }}
                  _hover={{
                    bg: "bauhaus.blue",
                    transform: "translateY(-2px)",
                    boxShadow: "6px 6px 0px 0px #121212",
                  }}
                  _active={{
                    transform: "translate(2px, 2px)",
                    boxShadow: "none",
                  }}
                >
                  Swap
                </Button>
                <Button
                  flex={1}
                  bg="bauhaus.yellow"
                  color="bauhaus.black"
                  border="3px solid"
                  borderColor="bauhaus.black"
                  boxShadow="4px 4px 0px 0px #121212"
                  fontWeight="800"
                  fontSize="sm"
                  textTransform="uppercase"
                  letterSpacing="wider"
                  borderRadius={0}
                  leftIcon={
                    <Icon viewBox="0 0 24 24" boxSize={5}>
                      <path
                        fill="currentColor"
                        d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"
                      />
                    </Icon>
                  }
                  onClick={() => {
                    setTransferToken(null);
                    setView("transfer");
                  }}
                  _hover={{
                    bg: "#e6b31c",
                    transform: "translateY(-2px)",
                    boxShadow: "6px 6px 0px 0px #121212",
                  }}
                  _active={{
                    transform: "translate(2px, 2px)",
                    boxShadow: "none",
                  }}
                >
                  Send
                </Button>
                <Box flex={1} position="relative">
                  {stakeApy !== null && (
                    <Box
                      position="absolute"
                      top="-8px"
                      right="-4px"
                      bg="bauhaus.red"
                      color="bauhaus.white"
                      fontSize="8px"
                      fontWeight="900"
                      px={1.5}
                      py="1px"
                      border="2px solid"
                      borderColor="bauhaus.black"
                      zIndex={1}
                      lineHeight="1.2"
                    >
                      {stakeApy.toFixed(1)}% APY
                    </Box>
                  )}
                  <Button
                    w="100%"
                    bg="bauhaus.white"
                    color="bauhaus.black"
                    border="3px solid"
                    borderColor="bauhaus.black"
                    boxShadow="4px 4px 0px 0px #121212"
                    fontWeight="800"
                    fontSize="sm"
                    textTransform="uppercase"
                    letterSpacing="wider"
                    borderRadius={0}
                    leftIcon={
                      <Icon viewBox="0 0 24 24" boxSize={5} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 3v12m0 0l-4-4m4 4l4-4" />
                        <path d="M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" />
                      </Icon>
                    }
                    onClick={() => {
                      chrome.tabs.create({ url: WALLETCHAN_STAKE_URL });
                    }}
                    _hover={{
                      bg: "gray.100",
                      transform: "translateY(-2px)",
                      boxShadow: "6px 6px 0px 0px #121212",
                    }}
                    _active={{
                      transform: "translate(2px, 2px)",
                      boxShadow: "none",
                    }}
                  >
                    Stake
                  </Button>
                </Box>
              </HStack>
            )}

            {/* Portfolio Tabs (Holdings + Activity) */}
            {address && (
              <PortfolioTabs
                address={address}
                activityTabTrigger={activityTabTrigger}
                onTokenClick={(token) => {
                  setTransferToken(token);
                  setView("transfer");
                }}
              />
            )}

            {/* Reload Required Alert */}
            {reloadRequired && (
              <Box
                bg="bauhaus.yellow"
                border="3px solid"
                borderColor="bauhaus.black"
                boxShadow="4px 4px 0px 0px #121212"
                p={3}
              >
                <HStack justify="space-between">
                  <HStack spacing={2}>
                    <Box p={1} bg="bauhaus.black">
                      <InfoIcon color="bauhaus.yellow" boxSize={4} />
                    </Box>
                    <Box>
                      <Text
                        fontSize="sm"
                        color="bauhaus.black"
                        fontWeight="700"
                      >
                        Reload page required
                      </Text>
                      <Text
                        fontSize="xs"
                        color="bauhaus.black"
                        opacity={0.8}
                        fontWeight="500"
                      >
                        To apply changes on the current site
                      </Text>
                    </Box>
                  </HStack>
                  <Button
                    size="sm"
                    bg="bauhaus.black"
                    color="bauhaus.yellow"
                    _hover={{ opacity: 0.9 }}
                    _active={{ transform: "translate(2px, 2px)" }}
                    onClick={async () => {
                      const tab = await currentTab();
                      const url = tab.url!;
                      chrome.tabs.create({ url });
                      chrome.tabs.remove(tab.id!);
                      setReloadRequired(false);
                    }}
                  >
                    Reload
                  </Button>
                </HStack>
              </Box>
            )}
          </VStack>
        </Container>

        {/* Sticky Footer - only show for Bankr accounts */}
        {activeAccount?.type === "bankr" && (
          <Box
            position="sticky"
            bottom={0}
            bg="bg.base"
            borderTop="3px solid"
            borderColor="bauhaus.black"
            p={3}
          >
            <Box position="relative">
              {/* Geometric decorations */}
              <Box
                position="absolute"
                top="-8px"
                left="10px"
                w="12px"
                h="12px"
                bg="bauhaus.red"
                borderRadius="full"
                border="2px solid"
                borderColor="bauhaus.black"
                zIndex={1}
              />
              <Box
                position="absolute"
                top="-6px"
                right="12px"
                w="10px"
                h="10px"
                bg="bauhaus.blue"
                transform="rotate(45deg)"
                border="2px solid"
                borderColor="bauhaus.black"
                zIndex={1}
              />
              <Box
                position="absolute"
                bottom="-8px"
                right="40px"
                w={0}
                h={0}
                borderLeft="7px solid transparent"
                borderRight="7px solid transparent"
                borderBottom="12px solid"
                borderBottomColor="bauhaus.green"
                zIndex={1}
              />

              <Button
                w="full"
                bg="bauhaus.yellow"
                color="bauhaus.black"
                border="3px solid"
                borderColor="bauhaus.black"
                boxShadow="4px 4px 0px 0px #121212"
                fontWeight="900"
                textTransform="uppercase"
                letterSpacing="wider"
                py={6}
                _hover={{
                  bg: "bauhaus.yellow",
                  transform: "translateY(-2px)",
                  boxShadow: "6px 6px 0px 0px #121212",
                }}
                _active={{
                  transform: "translate(2px, 2px)",
                  boxShadow: "none",
                }}
                onClick={() => {
                  setStartChatWithNew(true);
                  setView("chat");
                }}
                leftIcon={<ChatIcon />}
              >
                Chat with Bankr
              </Button>
            </Box>
          </Box>
        )}
      </Box>
      {/* End fullscreen centered wrapper */}

      {/* Reveal Private Key Modal */}
      <Suspense fallback={null}>
        <RevealPrivateKeyModal
          isOpen={isRevealKeyOpen}
          onClose={() => {
            onRevealKeyClose();
            setRevealAccount(null);
          }}
          account={revealAccount}
        />
      </Suspense>

      {/* Reveal Seed Phrase Modal */}
      <Suspense fallback={null}>
        <RevealSeedPhraseModal
          isOpen={isRevealSeedOpen}
          onClose={() => {
            onRevealSeedClose();
            setRevealSeedAccount(null);
          }}
          account={revealSeedAccount}
        />
      </Suspense>

      {/* QR Code Modal */}
      {address && (
        <Suspense fallback={null}>
          <QRCodeModal
            isOpen={isQROpen}
            onClose={onQRClose}
            address={address}
          />
        </Suspense>
      )}

      {/* Account Settings Modal */}
      <Suspense fallback={null}>
        <AccountSettingsModal
          isOpen={isAccountSettingsOpen}
          onClose={() => {
            onAccountSettingsClose();
            setSettingsAccount(null);
          }}
          account={settingsAccount}
          onRevealPrivateKey={(account) => {
            setRevealAccount(account);
            onRevealKeyOpen();
          }}
          onRevealSeedPhrase={(account) => {
            setRevealSeedAccount(account);
            onRevealSeedOpen();
          }}
          onAccountUpdated={loadAccounts}
          totalAccounts={accounts.length}
        />
      </Suspense>
    </Box>
  );
}

export default App;
