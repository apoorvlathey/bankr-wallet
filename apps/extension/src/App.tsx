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
const TokenTransfer = lazy(() => import("@/components/TokenTransfer"));

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
import type { Account } from "@/chrome/types";
import type { PortfolioToken } from "@/chrome/portfolioApi";

// Combined request type for unified ordering
export type CombinedRequest =
  | { type: "tx"; request: PendingTxRequest }
  | { type: "sig"; request: PendingSignatureRequest };

// Helper to combine and sort requests by timestamp
export function getCombinedRequests(
  txRequests: PendingTxRequest[],
  sigRequests: PendingSignatureRequest[],
): CombinedRequest[] {
  const combined: CombinedRequest[] = [
    ...txRequests.map((r) => ({ type: "tx" as const, request: r })),
    ...sigRequests.map((r) => ({ type: "sig" as const, request: r })),
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
  | "waitingForOnboarding"
  | "chat"
  | "addAccount"
  | "transfer";

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
  const [transferToken, setTransferToken] = useState<PortfolioToken | null>(
    null,
  );
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
      } else if (sigRequests.length > 0) {
        // Auto-open newest (last) pending signature request
        setSelectedSignatureRequest(sigRequests[sigRequests.length - 1]);
        setView("signatureConfirm");
      } else {
        setView("main");
      }

      setIsLoading(false);
    };

    init();
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
      }
    };

    chrome.storage.onChanged.addListener(handleStorageChange);
    return () => chrome.storage.onChanged.removeListener(handleStorageChange);
  }, [chainName, address, displayAddress, selectedTxRequest, selectedSignatureRequest, view]);

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

    if (requests.length > 0) {
      // Show newest (last) pending transaction request
      setSelectedTxRequest(requests[requests.length - 1]);
      setView("txConfirm");
    } else if (sigRequests.length > 0) {
      // Show newest (last) pending signature request
      setSelectedSignatureRequest(sigRequests[sigRequests.length - 1]);
      setView("signatureConfirm");
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
      // Only close popup when no more pending requests (not sidepanel or fullscreen tab)
      if (isInSidePanel || isFullscreenTab) {
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
      setPendingSignatureRequests([]);
      setSelectedTxRequest(null);
      setSelectedSignatureRequest(null);
      setView("main");
    } else {
      window.close();
    }
  }, [
    pendingRequests,
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
      // Check if there are pending transaction requests
      const txRequests = await loadPendingRequests();
      if (txRequests.length > 0) {
        setSelectedSignatureRequest(null);
        setSelectedTxRequest(txRequests[0]);
        setView("txConfirm");
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
    // Check if there are pending transaction requests
    const txRequests = await loadPendingRequests();
    if (txRequests.length > 0) {
      setPendingSignatureRequests([]);
      setSelectedSignatureRequest(null);
      setSelectedTxRequest(txRequests[0]);
      setView("txConfirm");
    } else if (isInSidePanel || isFullscreenTab) {
      setPendingSignatureRequests([]);
      setSelectedSignatureRequest(null);
      setView("main");
    } else {
      window.close();
    }
  }, [pendingSignatureRequests, isInSidePanel, isFullscreenTab]);

  const truncateAddress = (addr: string): string => {
    if (!addr) return "";
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

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
                    chrome.tabs.create({ url: "https://x.com/apoorveth" });
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
  if (view === "transfer" && transferToken) {
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
              accountType={activeAccount?.type || "bankr"}
              onBack={() => {
                setTransferToken(null);
                setView("main");
              }}
              onTransferInitiated={() => {
                setTransferToken(null);
                // The newPendingTxRequest listener will auto-switch to txConfirm
              }}
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
              onBack={() => setView("main")}
              onSelectTx={(tx) => {
                setSelectedTxRequest(tx);
                setView("txConfirm");
              }}
              onSelectSignature={(sig) => {
                setSelectedSignatureRequest(sig);
                setView("signatureConfirm");
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

  // Signature request confirmation view
  if (view === "signatureConfirm" && selectedSignatureRequest) {
    const combinedRequests = getCombinedRequests(
      pendingRequests,
      pendingSignatureRequests,
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
          mb={4}
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
            onClick={() => {
              chrome.tabs.create({
                url: "http://walletchan.com/?buyWCHAN=true",
              });
            }}
          >
            $WCHAN
          </Link>
          <Box w="6px" h="6px" bg="bauhaus.black" />
        </HStack>

        <Container
          pt={6}
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
              onClickTx={() => {
                if (pendingRequests.length === 1) {
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

            {/* Address Display */}
            <Box
              bg="bauhaus.white"
              border="3px solid"
              borderColor="bauhaus.black"
              boxShadow="4px 4px 0px 0px #121212"
              px={4}
              py={3}
              position="relative"
            >
              {/* Corner decoration */}
              <Box
                position="absolute"
                top="-3px"
                right="-3px"
                w="10px"
                h="10px"
                bg="bauhaus.blue"
                border="2px solid"
                borderColor="bauhaus.black"
              />

              {address ? (
                <VStack align="stretch" spacing={2}>
                  <Text
                    fontSize="xs"
                    color="text.secondary"
                    fontWeight="700"
                    textTransform="uppercase"
                  >
                    {activeAccount?.type === "impersonator"
                      ? "Impersonated Address"
                      : "Wallet Address"}
                  </Text>
                  {/* Two columns: address pill | explorer icons (2x2 when narrow, 1x4 when wide) */}
                  <HStack spacing={2} align="center">
                    {/* Column 1: Address pill */}
                    <HStack
                      bg="bauhaus.black"
                      px={2}
                      py={1}
                      spacing={2}
                      flexShrink={0}
                    >
                      <Code
                        fontSize="md"
                        fontFamily="mono"
                        bg="transparent"
                        color="bauhaus.white"
                        p={0}
                        fontWeight="700"
                        whiteSpace="nowrap"
                      >
                        {truncateAddress(address)}
                      </Code>
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
                    {/* Column 2: Explorer icons - 2x2 grid (<390px, centered) or 1x4 row (>=390px, right-aligned) */}
                    <Box
                      display="grid"
                      gridTemplateColumns="repeat(2, 32px)"
                      justifyContent="center"
                      gap={1}
                      flex={1}
                      sx={{
                        "@media (min-width: 390px)": {
                          gridTemplateColumns: "repeat(4, 32px)",
                          justifyContent: "flex-end",
                        },
                      }}
                    >
                      {[
                        {
                          name: "Octav",
                          icon: "octav-icon.png",
                          url: `https://pro.octav.fi/?addresses=${address}`,
                          bg: "#FFFFFF",
                        },
                        {
                          name: "DeBank",
                          icon: "debank-icon.ico",
                          url: `https://debank.com/profile/${address}`,
                          bg: "#FFFFFF",
                        },
                        {
                          name: "Zapper",
                          icon: "zapper-icon.png",
                          url: `https://zapper.xyz/account/${address}`,
                          bg: "#FFFFFF",
                        },
                        {
                          name: "Nansen",
                          icon: "nansen-icon.png",
                          url: `https://app.nansen.ai/address/${address}`,
                          bg: "#FFFFFF",
                        },
                      ].map((site) => (
                        <Box
                          key={site.name}
                          as="button"
                          bg={site.bg}
                          border="2px solid"
                          borderColor="bauhaus.black"
                          boxShadow="2px 2px 0px 0px #121212"
                          p={1}
                          cursor="pointer"
                          transition="all 0.2s ease-out"
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
                          <Image src={site.icon} boxSize="20px" />
                        </Box>
                      ))}
                    </Box>
                  </HStack>
                </VStack>
              ) : (
                <Text
                  color="text.tertiary"
                  fontSize="sm"
                  textAlign="center"
                  fontWeight="500"
                >
                  No address configured
                </Text>
              )}
            </Box>

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
