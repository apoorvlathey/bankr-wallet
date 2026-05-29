import {
  useState,
  useEffect,
  useCallback,
  useRef,
  lazy,
  Suspense,
  type ReactNode,
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
  Image,
  IconButton,
  VStack,
  Tooltip,
  Icon,
  Link,
  Spinner,
  useDisclosure,
} from "@chakra-ui/react";

import {
  SettingsIcon,
  CopyIcon,
  CheckIcon,
  ExternalLinkIcon,
  LockIcon,
  WarningIcon,
  InfoIcon,
  ChatIcon,
} from "@chakra-ui/icons";

import { useTheme, useStripTokens } from "@/theme";

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

// More icon (four app tiles)
const MoreIcon = (props: any) => (
  <Icon viewBox="0 0 24 24" {...props}>
    <path
      fill="currentColor"
      d="M4 4h7v7H4V4zm9 0h7v7h-7V4zM4 13h7v7H4v-7zm9 0h7v7h-7v-7z"
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
const CrossDappBatchConfirmation = lazy(
  () => import("@/components/CrossDappBatchConfirmation"),
);
const ChatView = lazy(() => import("@/components/Chat/ChatView"));
const AccountNetworkControls = lazy(() => import("@/components/AccountNetworkControls"));
const AddAccount = lazy(() => import("@/components/AddAccount"));
const AccountSettings = lazy(
  () => import("@/components/AccountSettings"),
);
const QRCodeModal = lazy(() =>
  import("@/components/QRCodeModal").then((m) => ({ default: m.QRCodeModal })),
);
const TokenTransfer = lazy(() => import("@/components/TokenTransfer"));
const SwapView = lazy(() => import("@/components/Swap/SwapView"));
const MoreActionsView = lazy(() => import("@/components/MoreActionsView"));
const HideTokensView = lazy(() => import("@/components/HideTokensView"));
const HiddenPortfolioTokensView = lazy(
  () => import("@/components/HiddenPortfolioTokensView"),
);
const WalletConnectView = lazy(() => import("@/components/WalletConnectView"));
const WatchAssetConfirmation = lazy(() => import("@/components/WatchAssetConfirmation"));
const AddChain = lazy(() => import("@/components/Settings/AddChain"));

// Preload every lazy screen chunk on idle. Without this, the Suspense
// fallback renders mid-slide when the user navigates for the first time —
// the chunk fetches while the screen is already animating in, so content
// pops into place halfway through the transition. Firing these imports as
// soon as the popup is idle means chunks are cached by the time the user
// triggers any navigation and Suspense never has to render its fallback.
if (typeof window !== "undefined") {
  const schedule =
    (window as Window & {
      requestIdleCallback?: (cb: () => void) => number;
    }).requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 300));
  schedule(() => {
    void import("@/components/Settings");
    void import("@/components/TransactionConfirmation");
    void import("@/components/SignatureRequestConfirmation");
    void import("@/components/PendingTxList");
    void import("@/components/BatchTransactionConfirmation");
    void import("@/components/CrossDappBatchConfirmation");
    void import("@/components/Chat/ChatView");
    void import("@/components/AccountNetworkControls");
    void import("@/components/AddAccount");
    void import("@/components/AccountSettings");
    void import("@/components/QRCodeModal");
    void import("@/components/TokenTransfer");
    void import("@/components/Swap/SwapView");
    void import("@/components/MoreActionsView");
    void import("@/components/HideTokensView");
    void import("@/components/HiddenPortfolioTokensView");
    void import("@/components/WalletConnectView");
    void import("@/components/WatchAssetConfirmation");
    void import("@/components/Settings/AddChain");
  });
}

// Eager load components needed immediately
import UnlockScreen from "@/components/UnlockScreen";
import { ScreenStack, type AppView } from "@/components/ScreenTransition";
import PendingTxBanner from "@/components/PendingTxBanner";
import WalletConnectBanner from "@/components/WalletConnectBanner";
import PortfolioTabs from "@/components/PortfolioTabs";
import MiddleTruncatedAddress from "@/components/MiddleTruncatedAddress";
import { useNetworks } from "@/contexts/NetworksContext";
import ChainIcon from "@/components/ChainIcon";
import { hasEncryptedApiKey } from "@/chrome/crypto";
import { PendingTxRequest } from "@/chrome/pendingTxStorage";
import { PendingSignatureRequest } from "@/chrome/pendingSignatureStorage";
import type { PendingBatchTxRequest } from "@/chrome/erc5792Types";
import {
  getCrossDappBatch,
  type CrossDappBatch,
} from "@/chrome/crossDappBatchStorage";
import { PendingWatchAssetRequest } from "@/chrome/pendingWatchAssetStorage";
import { PendingAddChainRequest } from "@/chrome/pendingAddChainStorage";
import type { Account, PasswordType } from "@/chrome/types";
import type { PortfolioToken } from "@/chrome/portfolioApi";
import type {
  WalletConnectAddChainContext,
  WalletConnectRetryNotice,
  WalletConnectSessionSummary,
} from "@/types/walletConnect";
import { TWITTER_URL, WALLETCHAN_ICON_URL, WALLETCHAN_OS_URL, WALLETCHAN_VAULT_DATA_API } from "@/constants/externalUrls";
import {
  getDefaultChainName,
  getResolvedChainById,
  getResolvedChainByName,
  getVisibleChains,
} from "@/lib/chains";

// Combined request type for unified ordering
export type CombinedRequest =
  | { type: "tx"; request: PendingTxRequest }
  | { type: "sig"; request: PendingSignatureRequest }
  | { type: "batch"; request: PendingBatchTxRequest }
  | { type: "crossDappBatch"; request: CrossDappBatch };

type AddChainReturnTarget = {
  view: "walletConnect";
  dappName?: string;
};

// Helper to combine and sort requests by timestamp.
// The cross-dapp batch (when present) is always prepended as the FIRST element
// so it has a dedicated, prominent slot in the carousel.
// eslint-disable-next-line react-refresh/only-export-components
export function getCombinedRequests(
  txRequests: PendingTxRequest[],
  sigRequests: PendingSignatureRequest[],
  batchRequests: PendingBatchTxRequest[] = [],
  crossDappBatch?: CrossDappBatch | null,
): CombinedRequest[] {
  const rest: CombinedRequest[] = [
    ...txRequests.map((r) => ({ type: "tx" as const, request: r })),
    ...sigRequests.map((r) => ({ type: "sig" as const, request: r })),
    ...batchRequests.map((r) => ({ type: "batch" as const, request: r })),
  ];
  // Sort the rest by timestamp ascending (oldest first)
  rest.sort((a, b) => a.request.timestamp - b.request.timestamp);

  if (crossDappBatch && crossDappBatch.entries.length > 0) {
    return [{ type: "crossDappBatch", request: crossDappBatch }, ...rest];
  }
  return rest;
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
    <Spinner size="lg" color="accent.secondary" thickness="3px" />
  </Box>
);

function App() {
  const { themeId, tokens } = useTheme();
  const isDarkTheme = themeId === "midnight";
  const stripTokens = useStripTokens();
  const addressPillTokens = useStripTokens("elevated");
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
  const [pendingAddChainRequest, setPendingAddChainRequest] =
    useState<PendingAddChainRequest | null>(null);
  const [rpcIssueChainIds, setRpcIssueChainIds] = useState<number[]>([]);
  const [dismissedRpcIssueChainIds, setDismissedRpcIssueChainIds] = useState<number[]>([]);
  const [pendingBatchRequests, setPendingBatchRequests] = useState<
    PendingBatchTxRequest[]
  >([]);
  const [selectedBatchRequest, setSelectedBatchRequest] =
    useState<PendingBatchTxRequest | null>(null);
  // User-assembled cross-dapp batch (Bankr/impersonator accounts only).
  // Single batch at a time, locked to the from + chainId of whatever was added first.
  const [crossDappBatch, setCrossDappBatch] = useState<CrossDappBatch | null>(
    null,
  );
  const [activityTabTrigger, setActivityTabTrigger] = useState(0);
  const [holdingsTabTrigger, setHoldingsTabTrigger] = useState(0);
  const [portfolioRefreshTrigger, setPortfolioRefreshTrigger] = useState(0);
  // Set by navigateToAdjacentRequest when the popup has already pre-switched
  // to an adjacent pending request. The async onRejected/onCancelled handlers
  // consume & reset this flag so they skip their fallback routing (which
  // would otherwise cause a second transition after the pre-nav).
  const preNavigatedRef = useRef(false);

  const [copied, setCopied] = useState(false);
  const [sidePanelSupported, setSidePanelSupported] = useState(false);
  const [sidePanelMode, setSidePanelMode] = useState(false);
  const [isInSidePanel, setIsInSidePanel] = useState(false);
  const [isFullscreenTab, setIsFullscreenTab] = useState(false);
  const [, setIsPopupWindow] = useState(false);
  const [failedTxError, setFailedTxError] = useState<{
    error: string;
    origin: string;
  } | null>(null);
  const [settingsInitialTab, setSettingsInitialTab] = useState<"main" | "chains">("main");
  const [settingsInitialEditChainName, setSettingsInitialEditChainName] = useState<string | undefined>(undefined);
  const [settingsAddChainInitialRequest, setSettingsAddChainInitialRequest] =
    useState<PendingAddChainRequest | undefined>(undefined);
  const [settingsAddChainReturnTarget, setSettingsAddChainReturnTarget] =
    useState<AddChainReturnTarget | null>(null);
  const [walletConnectRetryNotice, setWalletConnectRetryNotice] =
    useState<WalletConnectRetryNotice | null>(null);
  const [, setOnboardingTabId] = useState<number | null>(null);
  const [startChatWithNew, setStartChatWithNew] = useState(false);
  const [returnToChatAfterUnlock, setReturnToChatAfterUnlock] = useState(false);
  const [returnToConversationId, setReturnToConversationId] = useState<
    string | null
  >(null);
  const [isWalletUnlocked, setIsWalletUnlocked] = useState(false);
  const [passwordType, setPasswordType] = useState<PasswordType | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [activeAccount, setActiveAccount] = useState<Account | null>(null);
  const [settingsAccount, setSettingsAccount] = useState<Account | null>(null);
  const selectedChain = getResolvedChainByName(chainName, networksInfo);
  const visibleChains = getVisibleChains(networksInfo, activeAccount?.type);

  const visibleRpcIssueChainIds = rpcIssueChainIds.filter(
    (chainId) => !dismissedRpcIssueChainIds.includes(chainId),
  );
  const visibleRpcIssueChainNames = visibleRpcIssueChainIds
    .map((chainId) => getResolvedChainById(chainId, networksInfo)?.name)
    .filter((name): name is string => !!name);
  const handleHomepageChainSelect = useCallback((nextChainName: string) => {
    if (!chainName) {
      setReloadRequired(true);
    }
    setChainName(nextChainName);
  }, [chainName, setChainName, setReloadRequired]);
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
  const [walletConnectSessionCount, setWalletConnectSessionCount] = useState(0);
  const [walletConnectChainId, setWalletConnectChainId] = useState<number | null>(null);
  const keepAlivePortRef = useRef<chrome.runtime.Port | null>(null);
  const reconnectingRef = useRef(false);
  const isPopupWindowRef = useRef(false);

  const walletConnectStoredChain = walletConnectChainId
    ? getResolvedChainById(walletConnectChainId, networksInfo)
    : undefined;
  const walletConnectSelectedChain =
    walletConnectStoredChain &&
    visibleChains.some((chain) => chain.chainId === walletConnectStoredChain.chainId)
      ? walletConnectStoredChain
      : selectedChain &&
          visibleChains.some((chain) => chain.chainId === selectedChain.chainId)
        ? selectedChain
        : visibleChains[0];

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

  const loadCrossDappBatch = async () => {
    const batch = await getCrossDappBatch();
    setCrossDappBatch(batch);
    return batch;
  };

  const loadPendingWatchAssetRequests = async () => {
    const requests = await sendMessageWithRetry<PendingWatchAssetRequest[]>({
      type: "getPendingWatchAssetRequests",
    });
    return requests || [];
  };

  const loadPendingAddChainRequests = async () => {
    const requests = await sendMessageWithRetry<PendingAddChainRequest[]>({
      type: "getPendingAddChainRequests",
    });
    return requests || [];
  };

  const loadWalletConnectSessionCount = async () => {
    const response = await sendMessageWithRetry<{
      success: boolean;
      sessions?: WalletConnectSessionSummary[];
      activeChainId?: number | null;
    }>({
      type: "walletConnectGetSessions",
    });
    setWalletConnectSessionCount(
      response?.success ? response.sessions?.length || 0 : 0,
    );
    if (response?.success && response.activeChainId) {
      setWalletConnectChainId(response.activeChainId);
    }
    return response?.success ? response.sessions || [] : [];
  };

  const handleWalletConnectChainSelect = async (nextChainName: string) => {
    const chain = getResolvedChainByName(nextChainName, networksInfo);
    if (!chain) return;
    setWalletConnectChainId(chain.chainId);
    const response = await sendMessageWithRetry<{
      success: boolean;
      chainId?: number;
      error?: string;
    }>({
      type: "walletConnectSwitchChain",
      chainName: nextChainName,
    });
    if (response?.success && response.chainId) {
      setWalletConnectChainId(response.chainId);
    } else if (response?.error) {
      console.warn("[WalletConnect] Failed to switch chain:", response.error);
      await loadWalletConnectSessionCount();
    }
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
      const currentChain = getResolvedChainByName(chainName, networksInfo);
      if (currentChain && !currentChain.isBankrSupported) {
        const firstSupported = getDefaultChainName(networksInfo, "bankr");
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
    // The viewport mode listener is registered once for this popup instance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        if (!chrome.sidePanel?.open) return; // Firefox / unsupported browser
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
      const addChainRequests = await loadPendingAddChainRequests();
      await loadCrossDappBatch();
      await loadWalletConnectSessionCount();

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
      } else if (addChainRequests.length > 0) {
        setPendingAddChainRequest(addChainRequests[addChainRequests.length - 1]);
        setView("addChainConfirm");
      } else {
        setView("main");
      }

      setIsLoading(false);
    };

    init();
    // Startup bootstrap intentionally runs once for the active popup.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        sessions?: WalletConnectSessionSummary[];
        activeChainId?: number | null;
        chainId?: number;
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
      if (message.type === "newPendingAddChainRequest" && message.request) {
        const addChainReq = message.request as PendingAddChainRequest;
        (async () => {
          const isUnlocked = await checkLockState();
          setIsWalletUnlocked(isUnlocked);
          if (isUnlocked) {
            setPendingAddChainRequest(addChainReq);
            setView("addChainConfirm");
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
      if (message.type === "walletConnectSessionsChanged") {
        setWalletConnectSessionCount(message.sessions?.length || 0);
        if (message.activeChainId) {
          setWalletConnectChainId(message.activeChainId);
        }
        return;
      }
      if (message.type === "walletConnectChainChanged") {
        if (message.chainId) {
          setWalletConnectChainId(message.chainId);
        }
        return;
      }
      // Return undefined for unrecognized messages — critical so this listener
      // doesn't intercept messages meant for the background service worker
      // (an async handler always returns a Promise/truthy, which Chrome treats
      // as "I'll respond", stealing the response from the background)
    };

    chrome.runtime.onMessage.addListener(handleMessage);
    return () => chrome.runtime.onMessage.removeListener(handleMessage);
    // Cross-surface sync listener is registered once per popup instance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        if (changes.walletConnectChainId) {
          const nextChainId = Number(changes.walletConnectChainId.newValue);
          setWalletConnectChainId(
            Number.isInteger(nextChainId) && nextChainId > 0 ? nextChainId : null,
          );
        }
        if (changes.pendingTxRequests) {
          const updated: PendingTxRequest[] =
            changes.pendingTxRequests.newValue || [];
          setPendingRequests(updated);
          // If the selected tx is still present but its contents changed
          // (e.g. user edited the approval amount → tx.data was updated in
          // storage), refresh selectedTxRequest so downstream views like
          // CalldataDecoder re-render with the new data.
          const stillPresent = selectedTxRequest
            ? updated.find((r) => r.id === selectedTxRequest.id)
            : null;
          if (stillPresent && stillPresent !== selectedTxRequest) {
            setSelectedTxRequest(stillPresent);
          }
          // If the currently selected tx was removed, clear it
          if (
            selectedTxRequest &&
            !updated.find((r) => r.id === selectedTxRequest.id)
          ) {
            if (updated.length > 0) {
              setSelectedTxRequest(updated[0]);
            } else {
              // In popup mode during tx confirm, don't clear state —
              // TransactionConfirmation shows the success animation then
              // closes the popup itself via window.close()
              if (view === "txConfirm" && !isInSidePanel && !isFullscreenTab) {
                // Let the animation play; popup will close itself
              } else {
                setSelectedTxRequest(null);
                // Only route to "main" if there are no other pending request
                // types. If batch/sig/crossDappBatch are still queued, let the
                // async handler (handleTxRejected / handleTxConfirmed) navigate
                // directly to the next view — going via "main" first would
                // cause a visible txConfirm→main→next slide instead of a
                // single txConfirm→next transition.
                const hasOtherPending =
                  pendingBatchRequests.length > 0 ||
                  pendingSignatureRequests.length > 0 ||
                  (crossDappBatch != null &&
                    crossDappBatch.entries.length > 0);
                if (
                  !hasOtherPending &&
                  (view === "txConfirm" || view === "pendingTxList")
                ) {
                  setActivityTabTrigger((k) => k + 1);
                  setView("main");
                }
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
              // In popup mode, don't switch view — the handler will
              // close the popup via window.close()
              if (view === "signatureConfirm" && !isInSidePanel && !isFullscreenTab) {
                // Let the popup close itself
              } else {
                setSelectedSignatureRequest(null);
                // Skip "main" routing when tx/batch/crossDappBatch requests
                // remain — handleSignatureCancelled will navigate directly to
                // the next view, avoiding a visible signatureConfirm→main→next
                // intermediate slide.
                const hasOtherPending =
                  pendingRequests.length > 0 ||
                  pendingBatchRequests.length > 0 ||
                  (crossDappBatch != null &&
                    crossDappBatch.entries.length > 0);
                if (view === "signatureConfirm" && !hasOtherPending) {
                  setView("main");
                }
              }
            }
          }
        }
        if (changes.pendingBatchTxRequests) {
          const updated: PendingBatchTxRequest[] =
            changes.pendingBatchTxRequests.newValue || [];
          setPendingBatchRequests(updated);
          // If the currently selected batch is still in storage but its
          // params changed (e.g. user removed a call), swap in the latest
          // snapshot so the confirmation screen re-renders with the new
          // calls list and the asset/gas displays re-simulate.
          const stillPresent = selectedBatchRequest
            ? updated.find((r) => r.id === selectedBatchRequest.id)
            : null;
          if (stillPresent && stillPresent !== selectedBatchRequest) {
            setSelectedBatchRequest(stillPresent);
          }
          if (
            selectedBatchRequest &&
            !updated.find((r) => r.id === selectedBatchRequest.id)
          ) {
            if (updated.length > 0) {
              setSelectedBatchRequest(updated[0]);
            } else if (view === "batchTxConfirm" && !isInSidePanel && !isFullscreenTab) {
              // Popup mode: let BatchTransactionConfirmation play its "sent"
              // animation and close the window itself. Clearing state here
              // would unmount the component before the animation runs.
            } else {
              setSelectedBatchRequest(null);
              // Skip "main" routing when tx/sig/crossDappBatch requests
              // remain — the async onRejected/onConfirmed handler will
              // navigate directly to the next view, avoiding a visible
              // batchTxConfirm→main→next intermediate slide.
              const hasOtherPending =
                pendingRequests.length > 0 ||
                pendingSignatureRequests.length > 0 ||
                (crossDappBatch != null &&
                  crossDappBatch.entries.length > 0);
              if (view === "batchTxConfirm" && !hasOtherPending) {
                setActivityTabTrigger((k) => k + 1);
                setView("main");
              }
            }
          }
        }
        if (changes.crossDappBatch) {
          const updated: CrossDappBatch | null =
            changes.crossDappBatch.newValue ?? null;
          // Popup mode on the confirm screen: if the batch was just cleared
          // (ship/reject), skip the state update so the confirmation screen's
          // "sent" animation keeps its `batch` prop populated until the
          // component fires window.close() itself. Clearing here would fail
          // the render guard (`view === "crossDappBatchConfirm" && crossDappBatch`)
          // and unmount mid-animation.
          const skipUpdate =
            !updated &&
            view === "crossDappBatchConfirm" &&
            !isInSidePanel &&
            !isFullscreenTab;
          if (!skipUpdate) {
            setCrossDappBatch(updated);
          }
          // If the cross-dapp batch was just cleared (ship/reject/last-removed)
          // and we're on its dedicated screen, bounce back home — only in
          // sidepanel/fullscreen where there's no popup to close.
          if (
            !updated &&
            view === "crossDappBatchConfirm" &&
            (isInSidePanel || isFullscreenTab)
          ) {
            setActivityTabTrigger((k) => k + 1);
            setView("main");
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
  }, [chainName, address, displayAddress, selectedTxRequest, selectedSignatureRequest, selectedBatchRequest, pendingWatchAssetRequest, pendingRequests, pendingBatchRequests, pendingSignatureRequests, crossDappBatch, view, isInSidePanel, isFullscreenTab]);

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
        const chain = getResolvedChainByName(chainName, networksInfo);
        if (!chain) return;

        chrome.tabs
          .sendMessage(tab.id!, {
            type: "setChainId",
            msg: { chainName: chain.name, chainId: chain.chainId, rpcUrl: chain.rpcUrl },
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
    if (
      activeAccount?.type === "bankr" &&
      networksInfo &&
      chainName
    ) {
      const currentChain = getResolvedChainByName(chainName, networksInfo);
      if (currentChain && !currentChain.isBankrSupported) {
        const fallbackChainName = getDefaultChainName(networksInfo, "bankr");
        if (fallbackChainName && fallbackChainName !== chainName) {
          setChainName(fallbackChainName);
        }
      }
    }
  }, [activeAccount?.type, networksInfo, chainName]);

  useUpdateEffect(() => {
    if (reloadRequired && networksInfo) {
      setChainName(getDefaultChainName(networksInfo, activeAccount?.type));
    }
  }, [reloadRequired, networksInfo, activeAccount?.type]);

  // Track agent vs master session so the header can show the agent badge.
  useEffect(() => {
    if (!isWalletUnlocked) {
      setPasswordType(null);
      return;
    }
    chrome.runtime.sendMessage(
      { type: "getPasswordType" },
      (response: { passwordType: PasswordType | null }) => {
        if (chrome.runtime.lastError) return;
        setPasswordType(response?.passwordType ?? null);
      },
    );
  }, [isWalletUnlocked]);

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
    const addChainReqs = await loadPendingAddChainRequests();

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
    } else if (addChainReqs.length > 0) {
      setPendingAddChainRequest(addChainReqs[addChainReqs.length - 1]);
      setView("addChainConfirm");
    } else {
      setView("main");
    }
    // Routing uses fresh loads from the current popup session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [returnToChatAfterUnlock]);

  // Cross-surface lock/unlock sync. The originating surface also receives
  // its own broadcast, so guard the unlock branch with isWalletUnlocked to
  // avoid re-running handleUnlock and clobbering its view.
  const isWalletUnlockedRef = useRef(isWalletUnlocked);
  useEffect(() => {
    isWalletUnlockedRef.current = isWalletUnlocked;
  }, [isWalletUnlocked]);
  useEffect(() => {
    const handler = (
      message: { type?: string },
      _sender: chrome.runtime.MessageSender,
      sendResponse: (response?: unknown) => void,
    ) => {
      if (message?.type === "walletLockedExternal") {
        setIsWalletUnlocked(false);
        setPasswordType(null);
        setView("unlock");
        sendResponse({ ok: true });
      } else if (message?.type === "walletUnlockedExternal") {
        if (!isWalletUnlockedRef.current) {
          handleUnlock();
        }
        sendResponse({ ok: true });
      }
      return false; // synchronous response
    };
    chrome.runtime.onMessage.addListener(handler);
    return () => {
      chrome.runtime.onMessage.removeListener(handler);
    };
  }, [handleUnlock]);

  const handleCopyAddress = async () => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Ignore clipboard failures in restricted browser contexts.
    }
  };

  // Called by confirmation screens BEFORE they fire a reject message to the
  // background. Pre-switches the popup to the adjacent request in the combined
  // carousel so that once the rejected request is removed from storage, the UI
  // is already showing a valid peer — no "selectedX=null while view still
  // X-confirm" intermediate render that would flash the main screen before
  // the async onRejected handler catches up. If this is the only pending
  // request (combined.length <= 1), we bail — onRejected will route to main
  // or close the popup, which is the correct end state anyway.
  const navigateToAdjacentRequest = useCallback(() => {
    const combined = getCombinedRequests(
      pendingRequests,
      pendingSignatureRequests,
      pendingBatchRequests,
      crossDappBatch,
    );
    if (combined.length <= 1) return;

    let currentIdx = -1;
    if (view === "txConfirm" && selectedTxRequest) {
      currentIdx = combined.findIndex(
        (r) => r.type === "tx" && r.request.id === selectedTxRequest.id,
      );
    } else if (view === "batchTxConfirm" && selectedBatchRequest) {
      currentIdx = combined.findIndex(
        (r) => r.type === "batch" && r.request.id === selectedBatchRequest.id,
      );
    } else if (view === "signatureConfirm" && selectedSignatureRequest) {
      currentIdx = combined.findIndex(
        (r) =>
          r.type === "sig" && r.request.id === selectedSignatureRequest.id,
      );
    } else if (view === "crossDappBatchConfirm") {
      currentIdx = combined.findIndex((r) => r.type === "crossDappBatch");
    }
    if (currentIdx === -1) return;

    const targetIdx = currentIdx > 0 ? currentIdx - 1 : 1;
    if (targetIdx >= combined.length) return;

    const target = combined[targetIdx];
    if (target.type === "tx") {
      setSelectedBatchRequest(null);
      setSelectedSignatureRequest(null);
      setSelectedTxRequest(target.request);
      if (view !== "txConfirm") setView("txConfirm");
    } else if (target.type === "batch") {
      setSelectedTxRequest(null);
      setSelectedSignatureRequest(null);
      setSelectedBatchRequest(target.request);
      if (view !== "batchTxConfirm") setView("batchTxConfirm");
    } else if (target.type === "sig") {
      setSelectedTxRequest(null);
      setSelectedBatchRequest(null);
      setSelectedSignatureRequest(target.request);
      if (view !== "signatureConfirm") setView("signatureConfirm");
    } else if (target.type === "crossDappBatch") {
      setSelectedTxRequest(null);
      setSelectedBatchRequest(null);
      setSelectedSignatureRequest(null);
      if (view !== "crossDappBatchConfirm") setView("crossDappBatchConfirm");
    }
    preNavigatedRef.current = true;
  }, [
    pendingRequests,
    pendingSignatureRequests,
    pendingBatchRequests,
    crossDappBatch,
    selectedTxRequest,
    selectedBatchRequest,
    selectedSignatureRequest,
    view,
  ]);

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
  // Follow-up routing reads the current pending-request helpers.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTxRequest?.id]);

  const handleTxRejected = useCallback(async () => {
    // If onBeforeReject pre-navigated to an adjacent pending request, the
    // popup is already showing the correct next view. Skip all fallback
    // routing to avoid a second transition.
    if (preNavigatedRef.current) {
      preNavigatedRef.current = false;
      return;
    }
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
  // Rejection fallback routing reads the current pending-request helpers.
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
    // Reject the cross-dapp batch (if any). The handler fans out a rejection
    // to every dapp that contributed a tx to the batch.
    if (crossDappBatch) {
      await new Promise<void>((resolve) => {
        chrome.runtime.sendMessage({ type: "rejectCrossDappBatch" }, () =>
          resolve(),
        );
      });
    }
    // Only close popup after rejecting all (not sidepanel or fullscreen tab)
    if (isInSidePanel || isFullscreenTab) {
      setPendingRequests([]);
      setPendingBatchRequests([]);
      setPendingSignatureRequests([]);
      setCrossDappBatch(null);
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
    crossDappBatch,
    isInSidePanel,
    isFullscreenTab,
  ]);

  const handleSignatureCancelled = useCallback(async () => {
    // Pre-nav has already routed to an adjacent pending request; skip
    // fallback routing so we don't stack transitions.
    if (preNavigatedRef.current) {
      preNavigatedRef.current = false;
      return;
    }
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
  // Signature completion fallback routing reads the current pending-request helpers.
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
  // Bulk cancellation fallback routing reads the current pending-request helpers.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingSignatureRequests, isInSidePanel, isFullscreenTab]);

  const handleRpcIssuesChange = useCallback((chainIds: number[]) => {
    setRpcIssueChainIds(chainIds);
    setDismissedRpcIssueChainIds([]);
  }, []);

  const handleChainSaved = useCallback((chain: { chainName: string; chainId: number }) => {
    const returnTarget = settingsAddChainReturnTarget;
    setRpcIssueChainIds((prev) => prev.filter((id) => id !== chain.chainId));
    setDismissedRpcIssueChainIds((prev) => prev.filter((id) => id !== chain.chainId));
    setSettingsInitialEditChainName(undefined);
    setSettingsAddChainInitialRequest(undefined);
    setSettingsAddChainReturnTarget(null);
    setSettingsInitialTab("main");
    setPortfolioRefreshTrigger((prev) => prev + 1);
    if (returnTarget?.view === "walletConnect") {
      setWalletConnectRetryNotice({
        dappName: returnTarget.dappName,
        chainName: chain.chainName,
        chainId: chain.chainId,
      });
      setView("walletConnect");
    }
  }, [settingsAddChainReturnTarget]);

  const openSettingsAddChain = useCallback(
    (request?: PendingAddChainRequest) => {
      setSettingsAddChainInitialRequest(request);
      setSettingsAddChainReturnTarget(null);
      setView("settingsAddChain");
    },
    [],
  );

  const openWalletConnectAddChain = useCallback(
    (
      request?: PendingAddChainRequest,
      context?: WalletConnectAddChainContext,
    ) => {
      setSettingsAddChainInitialRequest(request);
      setSettingsAddChainReturnTarget({
        view: "walletConnect",
        dappName: context?.dappName,
      });
      setWalletConnectRetryNotice(null);
      setView("settingsAddChain");
    },
    [],
  );

  const dismissWalletConnectRetryNotice = useCallback(() => {
    setWalletConnectRetryNotice(null);
  }, []);

  const handleHiddenTokensChanged = useCallback(() => {
    setPortfolioRefreshTrigger((prev) => prev + 1);
    setHoldingsTabTrigger((prev) => prev + 1);
  }, []);

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

  // Render the current screen's JSX — wrapped in ScreenStack below so each
  // view transitions smoothly (slide for hierarchical nav, sheet-up for dapp
  // confirmations, fade for unlock). See components/ScreenTransition.tsx.
  const screen: ReactNode = (() => {
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
            bg="surface.base"
            display="flex"
            flexDirection="column"
            alignItems="center"
            justifyContent="center"
            p={6}
            textAlign="center"
            position="relative"
            flex="1"
          >
            {/* Geometric decorations — Bauhaus only */}
            {!isDarkTheme && (
              <>
                <Box
                  position="absolute"
                  top={4}
                  left={4}
                  w="12px"
                  h="12px"
                  bg="accent.primary"
                  border="2px solid"
                  borderColor="border.default"
                />
                <Box
                  position="absolute"
                  top={4}
                  right={4}
                  w="12px"
                  h="12px"
                  bg="accent.secondary"
                  border="2px solid"
                  borderColor="border.default"
                  borderRadius="full"
                />
              </>
            )}

            <VStack spacing={4}>
              <Box
                bg="accent.highlight"
                border="3px solid"
                borderColor="border.default"
                boxShadow="card"
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
            overflowY="auto"
            minH={0}
          >
            <Suspense fallback={<LoadingFallback />}>
              <Settings
                initialTab={settingsInitialTab}
                initialEditChainName={settingsInitialEditChainName}
                onChainSaved={handleChainSaved}
                close={async () => {
                  setSettingsInitialTab("main");
                  setSettingsInitialEditChainName(undefined);
                  setSettingsAddChainInitialRequest(undefined);
                  setSettingsAddChainReturnTarget(null);
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

  if (view === "settingsAddChain") {
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
            overflowY="auto"
            minH={0}
          >
            <Suspense fallback={<LoadingFallback />}>
              <Settings
                initialTab="chains"
                initialChainsTab="add"
                initialAddChainRequest={settingsAddChainInitialRequest}
                initialEditChainName={undefined}
                onChainSaved={handleChainSaved}
                onInitialAddChainCancelled={() =>
                  setSettingsAddChainReturnTarget(null)
                }
                close={async () => {
                  setSettingsAddChainInitialRequest(undefined);
                  setSettingsAddChainReturnTarget(null);
                  const has = await hasEncryptedApiKey();
                  setHasApiKey(has);

                  if (has) {
                    establishKeepalivePort();
                    const isUnlocked = await checkLockState();
                    setIsWalletUnlocked(isUnlocked);
                    setView(isUnlocked ? "main" : "unlock");
                  } else {
                    setView("main");
                  }
                }}
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

  // Account Settings view
  if (view === "accountSettings") {
    return (
      <Box bg="bg.base" h="100%" display="flex" flexDirection="column">
        <Box
          maxW={isFullscreenTab ? "480px" : "100%"}
          mx="auto"
          w="100%"
          h="100%"
          display="flex"
          flexDirection="column"
          minH={0}
        >
          <Suspense fallback={<LoadingFallback />}>
            <AccountSettings
              account={settingsAccount}
              onClose={() => {
                setSettingsAccount(null);
                setView("main");
              }}
              onAccountUpdated={loadAccounts}
              totalAccounts={accounts.length}
            />
          </Suspense>
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
              chainId={selectedChain?.chainId || 8453}
              accountType={activeAccount?.type || "bankr"}
              accounts={accounts}
              onBack={() => {
                setTransferToken(null);
                setView("main");
                setHoldingsTabTrigger((n) => n + 1);
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
                const tokenChain = getResolvedChainById(token.chainId, networksInfo);
                if (tokenChain && tokenChain.name !== chainName) {
                  setChainName(tokenChain.name);
                  chrome.storage.sync.set({ chainName: tokenChain.name });
                }
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
              accountId={activeAccount?.id}
              accountType={activeAccount?.type || "bankr"}
              chainId={selectedChain?.chainId || 8453}
              chainName={chainName || "Base"}
              onBack={() => {
                setSwapInitialBuyToken(undefined);
                setSwapInitialSellToken(undefined);
                setView("main");
                setHoldingsTabTrigger((n) => n + 1);
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

  // More actions view
  if (view === "more") {
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
            <MoreActionsView
              fromAddress={address}
              stakeApy={stakeApy}
              onBack={() => setView("main")}
              onWalletConnect={() => setView("walletConnect")}
              onHideTokens={() => setView("hideTokens")}
            />
          </Suspense>
        </Box>
      </Box>
    );
  }

  if (view === "hideTokens") {
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
            <HideTokensView
              address={address}
              onBack={() => setView("more")}
              onOpenHidden={() => setView("hiddenTokens")}
              onHiddenTokensChanged={handleHiddenTokensChanged}
            />
          </Suspense>
        </Box>
      </Box>
    );
  }

  if (view === "hiddenTokens") {
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
            <HiddenPortfolioTokensView
              address={address}
              onBack={() => setView("hideTokens")}
              onHiddenTokensChanged={handleHiddenTokensChanged}
            />
          </Suspense>
        </Box>
      </Box>
    );
  }

  if (view === "walletConnect") {
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
            <WalletConnectView
              accounts={accounts}
              activeAccount={activeAccount}
              selectedChain={walletConnectSelectedChain}
              visibleChains={visibleChains}
              onBack={() => setView("more")}
              onAccountSelect={handleAccountSwitch}
              onAddAccount={() => setView("addAccount")}
              onAccountSettings={(account) => {
                setSettingsAccount(account);
                setView("accountSettings");
              }}
              onChainSelect={handleWalletConnectChainSelect}
              onAddChain={() => openWalletConnectAddChain()}
              onAddChainRequest={openWalletConnectAddChain}
              retryNotice={walletConnectRetryNotice}
              onDismissRetryNotice={dismissWalletConnectRetryNotice}
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
              crossDappBatch={crossDappBatch}
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
              onSelectCrossDappBatch={() => setView("crossDappBatchConfirm")}
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
      crossDappBatch,
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
              crossDappBatch={crossDappBatch}
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
              onBeforeReject={navigateToAdjacentRequest}
              onAddedToBatch={() => {
                setSelectedTxRequest(null);
                setView("crossDappBatchConfirm");
              }}
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
                  } else if (nextRequest.type === "crossDappBatch") {
                    setSelectedTxRequest(null);
                    setView("crossDappBatchConfirm");
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
      crossDappBatch,
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
              crossDappBatch={crossDappBatch}
              onAddedToBatch={() => {
                setSelectedBatchRequest(null);
                setView("crossDappBatchConfirm");
              }}
              onRemoveCall={(callIndex) => {
                // Background updates pendingBatchTxRequests; the storage
                // listener above swaps in the new params so the UI re-renders.
                // If the user removes the last call, the handler rejects the
                // whole batch and the listener clears the selection.
                chrome.runtime.sendMessage(
                  {
                    type: "removeCallFromPendingBatch",
                    bundleId: selectedBatchRequest.id,
                    callIndex,
                  },
                  () => {},
                );
              }}
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
                setActivityTabTrigger((k) => k + 1);
                // Pre-nav has already routed to an adjacent request (if any).
                // Skip fallback routing to avoid a second transition.
                if (preNavigatedRef.current) {
                  preNavigatedRef.current = false;
                  return;
                }
                setSelectedBatchRequest(null);
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
              onBeforeReject={navigateToAdjacentRequest}
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
                  } else if (nextRequest.type === "crossDappBatch") {
                    setSelectedBatchRequest(null);
                    setView("crossDappBatchConfirm");
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

  // Cross-dapp batch confirmation view (user-assembled)
  if (view === "crossDappBatchConfirm" && crossDappBatch) {
    const combinedRequests = getCombinedRequests(
      pendingRequests,
      pendingSignatureRequests,
      pendingBatchRequests,
      crossDappBatch,
    );
    const currentIndex = combinedRequests.findIndex(
      (r) => r.type === "crossDappBatch",
    );
    const totalCount = combinedRequests.length;
    // Distinctive tinted background so this screen is instantly recognizable
    // as the user-assembled cross-dapp batch (vs the standard surface.base
    // used by every other tx/sig/batch confirmation screen). Sourced from
    // status.warning.tint — Bauhaus = cornsilk wash, Midnight = recessed surface.
    const crossDappBg = "status.warning.tint";
    return (
      <Box bg={crossDappBg} h="100%" display="flex" flexDirection="column">
        {/* Theme-accent strip across the top of the page — vivid yellow in
            Bauhaus, warm amber in Midnight (both via accent.highlight). */}
        <Box
          h="6px"
          w="100%"
          bg="accent.highlight"
          borderBottom="2px solid"
          borderColor="border.default"
          flexShrink={0}
        />
        <Box
          maxW={isFullscreenTab ? "480px" : "100%"}
          mx="auto"
          w="100%"
          h="100%"
          display="flex"
          flexDirection="column"
        >
          <Suspense fallback={<LoadingFallback />}>
            <CrossDappBatchConfirmation
              batch={crossDappBatch}
              currentIndex={currentIndex >= 0 ? currentIndex : 0}
              totalCount={totalCount}
              isInSidePanel={isInSidePanel || isFullscreenTab}
              onBack={() => {
                if (totalCount > 1) {
                  setView("pendingTxList");
                } else {
                  setView("main");
                }
              }}
              onConfirmed={() => {
                setActivityTabTrigger((k) => k + 1);
                if (isInSidePanel || isFullscreenTab) {
                  setView("main");
                }
                // Popup: CrossDappBatchConfirmation plays its "sent" animation
                // and closes the window itself via window.close().
              }}
              onRejected={() => {
                setActivityTabTrigger((k) => k + 1);
                if (preNavigatedRef.current) {
                  preNavigatedRef.current = false;
                  return;
                }
                if (isInSidePanel || isFullscreenTab) {
                  setView("main");
                } else {
                  window.close();
                }
              }}
              onBeforeReject={navigateToAdjacentRequest}
              onNavigate={(direction) => {
                const currentIdx = combinedRequests.findIndex(
                  (r) => r.type === "crossDappBatch",
                );
                const newIdx =
                  direction === "prev" ? currentIdx - 1 : currentIdx + 1;
                if (newIdx >= 0 && newIdx < combinedRequests.length) {
                  const nextRequest = combinedRequests[newIdx];
                  if (nextRequest.type === "tx") {
                    setSelectedTxRequest(nextRequest.request);
                    setView("txConfirm");
                  } else if (nextRequest.type === "batch") {
                    setSelectedBatchRequest(nextRequest.request);
                    setView("batchTxConfirm");
                  } else if (nextRequest.type === "sig") {
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
      crossDappBatch,
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
              onBeforeCancel={navigateToAdjacentRequest}
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
                  } else if (nextRequest.type === "tx") {
                    setSelectedSignatureRequest(null);
                    setSelectedTxRequest(nextRequest.request);
                    setView("txConfirm");
                  } else if (nextRequest.type === "batch") {
                    setSelectedSignatureRequest(null);
                    setSelectedBatchRequest(nextRequest.request);
                    setView("batchTxConfirm");
                  } else if (nextRequest.type === "crossDappBatch") {
                    setSelectedSignatureRequest(null);
                    setView("crossDappBatchConfirm");
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

  if (view === "addChainConfirm" && pendingAddChainRequest) {
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
            <AddChain
              initialRequest={pendingAddChainRequest}
              mode="dapp"
              back={(options) => {
                if (!options?.added) {
                  chrome.runtime.sendMessage({
                    type: "rejectAddChain",
                    requestId: pendingAddChainRequest.id,
                  });
                }
                setPendingAddChainRequest(null);
                if (isInSidePanel || isFullscreenTab) {
                  setView("main");
                } else {
                  window.close();
                }
              }}
              onAdded={() => {
                setPendingAddChainRequest(null);
                setView("main");
              }}
            />
          </Suspense>
        </Box>
      </Box>
    );
  }

  // Main view
  // Header bar — same dark CTA strip pair used by tx/sig confirmation badges,
  // chat header, etc. (see useStripTokens). The hover overlay is the only
  // non-shared bit so it stays inline.
  const headerBg = stripTokens.bg;
  const headerFg = stripTokens.fg;
  const headerHoverBg = isDarkTheme ? "whiteAlpha.100" : "whiteAlpha.200";

  return (
    <Box bg="surface.base" h="100%" display="flex" flexDirection="column">
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
          bg={headerBg}
          alignItems="center"
          position="relative"
        >
          {/* Decorative stripe — Bauhaus paints a thick violet poster stripe;
              Midnight uses a 1px subtle divider so the header doesn't shout. */}
          <Box
            position="absolute"
            bottom="0"
            left="0"
            right="0"
            h={isDarkTheme ? "1px" : "3px"}
            bg={isDarkTheme ? "border.subtle" : "accent.primary"}
          />

          <HStack spacing={2}>
            <Box
              bg={isDarkTheme ? "white" : "surface.raised"}
              p={0.5}
              borderRadius={isDarkTheme ? "md" : undefined}
              overflow="visible"
              position="relative"
            >
              <Image
                src="walletchan-icon-white-bg.png"
                h="1.75rem"
                borderRadius={isDarkTheme ? "md" : undefined}
              />
              {passwordType === "agent" && (
                <Tooltip
                  label="Agent session — limited permissions. Master-only actions (reveal keys, rotate API key, add/remove accounts) are blocked."
                  placement="bottom"
                  hasArrow
                >
                  <Box
                    position="absolute"
                    bottom="-6px"
                    right="-8px"
                    p="3px"
                    borderRadius="full"
                    bg={headerBg}
                    border="1.5px solid"
                    borderColor={headerFg}
                    color={headerFg}
                    cursor="help"
                    aria-label="Agent session"
                    lineHeight={0}
                  >
                    <Icon
                      viewBox="0 0 24 24"
                      boxSize="0.7rem"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2.25}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      display="block"
                    >
                      <path d="M12 8V4H8" />
                      <rect width="16" height="12" x="4" y="8" rx="2" />
                      <path d="M2 14h2" />
                      <path d="M20 14h2" />
                      <path d="M15 13v2" />
                      <path d="M9 13v2" />
                    </Icon>
                  </Box>
                </Tooltip>
              )}
            </Box>
            <Text
              fontWeight="900"
              color={headerFg}
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
                  color={headerFg}
                  _hover={{ bg: headerHoverBg }}
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
                color={headerFg}
                _hover={{ bg: headerHoverBg }}
                onClick={() => {
                  chrome.runtime.sendMessage({ type: "lockWallet" }, () => {
                    setIsWalletUnlocked(false);
                    setPasswordType(null);
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
                  color={headerFg}
                  _hover={{ bg: headerHoverBg }}
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
                  color={headerFg}
                  _hover={{ bg: headerHoverBg }}
                  onClick={openInFullscreenTab}
                />
              </Tooltip>
            )}
            <IconButton
              aria-label="Settings"
              icon={<SettingsIcon />}
              variant="ghost"
              size="sm"
              color={headerFg}
              _hover={{ bg: headerHoverBg }}
              onClick={() => setView("settings")}
            />
          </HStack>
        </Flex>

        {/* Top credits strip — shared constructivist two-color block across
            both themes. Left half carries POWERED BY + $WCHAN in the amber
            family; right half carries WalletChan OS in the navy family.
            A dedicated 28px diagonal transition block between the two
            halves gives the hard 45° hand-off. Each half is flex=1 with
            minW=max-content on the left so content never wraps on narrow
            popups but the split lands near center on wide viewports.
            Bauhaus uses saturated poster colors; Midnight dims each to
            a dark tint of the same hue so the geometry reads the same
            but the aesthetic stays calm. */}
        <HStack
          spacing={0}
          align="stretch"
          borderBottom={isDarkTheme ? "1px solid" : "3px solid"}
          borderColor={isDarkTheme ? "border.subtle" : "border.default"}
        >
          <HStack
            flex="1"
            minW="max-content"
            bg={isDarkTheme ? "#2C1E06" : "accent.highlight"}
            py={isDarkTheme ? 1.5 : 1}
            pl={3}
            pr={2}
            spacing={2}
          >
            <Text
              fontSize="xs"
              fontWeight="700"
              color={isDarkTheme ? "#C9B27D" : "accentFg.highlight"}
              textTransform="uppercase"
              letterSpacing="wider"
              whiteSpace="nowrap"
            >
              Powered by
            </Text>
            {isDarkTheme ? (
              <Link
                color="accent.highlight"
                fontWeight="800"
                fontSize="xs"
                textTransform="uppercase"
                letterSpacing="wide"
                px={1}
                py={0}
                border="1px solid transparent"
                borderRadius="sm"
                _hover={{
                  bg: "accent.highlight",
                  color: "accentFg.highlight",
                  borderColor: "accent.highlight",
                  textDecoration: "none",
                }}
                transition="all 0.15s ease-out"
                cursor="pointer"
                onClick={() => {
                  const baseName = getResolvedChainById(8453, networksInfo)?.name ?? "Base";
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
                  // Auto-fill the sell side with native ETH on Base so the
                  // user lands on a ready-to-quote pair. Balance/price are
                  // hydrated by SwapView's onchain + price-fetch effects.
                  setSwapInitialSellToken({
                    symbol: "ETH",
                    name: "Ether",
                    contractAddress: "native",
                    chainId: 8453,
                    decimals: 18,
                    balance: "0",
                    balanceFormatted: "0",
                    priceUsd: 0,
                    valueUsd: 0,
                  });
                  setView("swap");
                }}
              >
                $WCHAN
              </Link>
            ) : (
              <Link
                bg="accent.secondary"
                color="accentFg.secondary"
                px={2}
                py={0.5}
                fontWeight="900"
                fontSize="xs"
                textTransform="uppercase"
                letterSpacing="wide"
                border="2px solid"
                borderColor="border.default"
                _hover={{
                  bg: "accent.primary",
                  color: "accentFg.primary",
                }}
                transition="all 0.2s ease-out"
                cursor="pointer"
                onClick={() => {
                  const baseName = getResolvedChainById(8453, networksInfo)?.name ?? "Base";
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
                  // Auto-fill the sell side with native ETH on Base so the
                  // user lands on a ready-to-quote pair. Balance/price are
                  // hydrated by SwapView's onchain + price-fetch effects.
                  setSwapInitialSellToken({
                    symbol: "ETH",
                    name: "Ether",
                    contractAddress: "native",
                    chainId: 8453,
                    decimals: 18,
                    balance: "0",
                    balanceFormatted: "0",
                    priceUsd: 0,
                    valueUsd: 0,
                  });
                  setView("swap");
                }}
              >
                $WCHAN
              </Link>
            )}
          </HStack>
          <Box
            w="28px"
            alignSelf="stretch"
            bgGradient={
              isDarkTheme
                ? "linear(110deg, #2C1E06 50%, #141833 50%)"
                : "linear(110deg, #F0C020 50%, #1a1a2e 50%)"
            }
            flexShrink={0}
          />
          <HStack
            flex="1"
            bg={isDarkTheme ? "#141833" : undefined}
            bgGradient={
              isDarkTheme
                ? undefined
                : "linear(90deg, #1a1a2e 0%, #16213e 60%, #1a1a2e 100%)"
            }
            py={isDarkTheme ? 1.5 : 1}
            pl={2}
            pr={3}
            spacing={1}
            justify="flex-end"
            cursor="pointer"
            role="group"
            minW={0}
            onClick={() => {
              chrome.tabs.create({ url: WALLETCHAN_OS_URL });
            }}
          >
            <Text
              fontSize="xs"
              fontWeight={isDarkTheme ? "800" : "900"}
              color="accent.highlight"
              textTransform="uppercase"
              letterSpacing="wide"
              whiteSpace="nowrap"
              _groupHover={{ textDecoration: "underline" }}
            >
              WalletChan OS
            </Text>
            <ExternalLinkIcon boxSize={3} color="accent.highlight" />
          </HStack>
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
                bg="accent.primary"
                border="3px solid"
                borderColor="border.default"
                boxShadow="card"
                p={3}
                position="relative"
              >
                <HStack w="full" justify="space-between" mb={2}>
                  <HStack>
                    <Box p={1} bg="border.default">
                      <WarningIcon color="accent.primary" boxSize={4} />
                    </Box>
                    <Text fontSize="sm" color="accentFg.primary" fontWeight="700">
                      Transaction Failed
                    </Text>
                  </HStack>
                  <Button
                    size="xs"
                    variant="ghost"
                    color="accentFg.primary"
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
                <Text fontSize="sm" color="accentFg.primary" fontWeight="500">
                  {failedTxError.error}
                </Text>
              </Box>
            )}

            {/* Pending Requests Banner */}
            <PendingTxBanner
              txCount={pendingRequests.length}
              signatureCount={pendingSignatureRequests.length}
              batchCount={pendingBatchRequests.length}
              crossDappBatchCount={crossDappBatch?.entries.length ?? 0}
              onClickTx={() => {
                const onlyOneTx =
                  pendingRequests.length === 1 &&
                  pendingSignatureRequests.length === 0 &&
                  pendingBatchRequests.length === 0 &&
                  !crossDappBatch;
                if (onlyOneTx) {
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
                const onlyOneBatch =
                  pendingBatchRequests.length === 1 &&
                  pendingRequests.length === 0 &&
                  pendingSignatureRequests.length === 0 &&
                  !crossDappBatch;
                if (onlyOneBatch) {
                  setSelectedBatchRequest(pendingBatchRequests[0]);
                  setView("batchTxConfirm");
                } else {
                  setView("pendingTxList");
                }
              }}
              onClickCrossDappBatch={() => {
                // The cross-dapp batch always has its own dedicated screen.
                if (crossDappBatch) {
                  setView("crossDappBatchConfirm");
                }
              }}
            />

            <WalletConnectBanner
              sessionCount={walletConnectSessionCount}
              onClick={() => setView("walletConnect")}
            />

            {visibleRpcIssueChainIds.length > 0 && (
              <Box
                bg={isDarkTheme ? "status.warning.bg" : "status.info.bg"}
                border={isDarkTheme ? "1px solid" : "2px solid"}
                borderColor={isDarkTheme ? "status.warning.border" : "border.default"}
                borderRadius={isDarkTheme ? "md" : undefined}
                boxShadow={isDarkTheme ? undefined : "card"}
                px={3}
                py={2}
              >
                <HStack align="start" spacing={2}>
                  <Box
                    p={1}
                    bg={isDarkTheme ? "status.warning.fg" : "accent.secondary"}
                    display="flex"
                    alignItems="center"
                    justifyContent="center"
                    flexShrink={0}
                    borderRadius={isDarkTheme ? "sm" : undefined}
                  >
                    <WarningIcon
                      color={isDarkTheme ? "fg.inverse" : "accentFg.secondary"}
                      boxSize={3}
                    />
                  </Box>
                  <Box flex={1} minW={0}>
                    <Text
                      fontSize="2xs"
                      fontWeight="800"
                      color={isDarkTheme ? "status.warning.fg" : "status.info.fg"}
                      textTransform="uppercase"
                      letterSpacing="wide"
                      mb={1}
                    >
                      RPC Issue Detected
                    </Text>
                    {visibleRpcIssueChainNames.length > 0 ? (
                      <VStack align="start" spacing={1}>
                        <HStack spacing={2} flexWrap="wrap">
                          {visibleRpcIssueChainIds.slice(0, 2).map((chainId) => {
                            const chain = getResolvedChainById(chainId, networksInfo);
                            if (!chain) return null;
                            return (
                              <HStack
                                key={chainId}
                                spacing={1.5}
                                bg="surface.raised"
                                border="1.5px solid"
                                borderColor="border.default"
                                borderRadius={isDarkTheme ? "md" : undefined}
                                px={1.5}
                                py={1}
                                cursor="pointer"
                                _hover={{ bg: "bg.muted" }}
                                onClick={() => {
                                  setSettingsInitialTab("chains");
                                  setSettingsInitialEditChainName(chain.name);
                                  setView("settings");
                                }}
                              >
                                <ChainIcon
                                  chainId={chain.chainId}
                                  chainName={chain.name}
                                  size="14px"
                                  withChip
                                />
                                <Text
                                  fontSize="xs"
                                  fontWeight="800"
                                  color="text.primary"
                                  textTransform="uppercase"
                                  letterSpacing="wide"
                                >
                                  {chain.name}
                                </Text>
                              </HStack>
                            );
                          })}
                          {visibleRpcIssueChainIds.length > 2 && (
                            <Text
                              fontSize="2xs"
                              fontWeight="700"
                              color={isDarkTheme ? "fg.secondary" : "status.info.fg"}
                              opacity={0.8}
                            >
                              +{visibleRpcIssueChainIds.length - 2} more
                            </Text>
                          )}
                        </HStack>
                        <Text
                          fontSize="xs"
                          color={isDarkTheme ? "fg.secondary" : "status.info.fg"}
                          fontWeight="600"
                          opacity={isDarkTheme ? 1 : 0.9}
                        >
                          Balance fetch failed. Edit the chain RPC if this persists.
                        </Text>
                      </VStack>
                    ) : (
                      <Text
                        fontSize="xs"
                        color={isDarkTheme ? "fg.secondary" : "status.info.fg"}
                        fontWeight="600"
                        opacity={isDarkTheme ? 1 : 0.9}
                      >
                        Balance fetch failed for one or more chains. Edit the chain RPC if this persists.
                      </Text>
                    )}
                  </Box>
                  <Button
                    size="xs"
                    variant="ghost"
                    color={isDarkTheme ? "status.warning.fg" : "status.info.fg"}
                    fontWeight="700"
                    _hover={{ bg: "whiteAlpha.200" }}
                    onClick={() => setDismissedRpcIssueChainIds(rpcIssueChainIds)}
                  >
                    Dismiss
                  </Button>
                </HStack>
              </Box>
            )}

            {/* Account Switcher + Chain Selector Row */}
            <Suspense fallback={null}>
              <AccountNetworkControls
                accounts={accounts}
                activeAccount={activeAccount}
                selectedChain={selectedChain}
                visibleChains={visibleChains}
                onAccountSelect={handleAccountSwitch}
                onAddAccount={() => setView("addAccount")}
                onAccountSettings={(account) => {
                  setSettingsAccount(account);
                  setView("accountSettings");
                }}
                onChainSelect={handleHomepageChainSelect}
                onAddChain={() => openSettingsAddChain()}
              />
            </Suspense>

            {/* Address Bar — compact utility row.
                Uses the `elevated` strip variant so Bauhaus keeps its stark
                black band while Midnight gets a framed raised card (sunken
                was too close to the page wash and blended in). Both per-theme
                details live in `useStripTokens`. */}
            {address && (
              <HStack spacing={2} align="center">
                {/* Address pill */}
                <HStack
                  bg={addressPillTokens.bg}
                  color={addressPillTokens.fg}
                  border="1px solid"
                  borderColor={addressPillTokens.border}
                  borderRadius="md"
                  px={2}
                  py={1}
                  spacing={2}
                  flex={1}
                  minW={0}
                >
                  <MiddleTruncatedAddress address={address} />
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
                    color="inherit"
                    onClick={onQROpen}
                    _hover={{ color: "accent.highlight" }}
                    minW="auto"
                    h="auto"
                    p={0}
                  />
                  <IconButton
                    aria-label="Copy address"
                    icon={copied ? <CheckIcon /> : <CopyIcon />}
                    size="xs"
                    variant="ghost"
                    color={copied ? "accent.highlight" : "inherit"}
                    onClick={handleCopyAddress}
                    _hover={{ color: "accent.highlight" }}
                    minW="auto"
                    h="auto"
                    p={0}
                  />
                  {selectedChain && (() => {
                    const explorer = selectedChain.explorer;
                    return explorer ? (
                      <IconButton
                        aria-label="View on explorer"
                        icon={<ExternalLinkIcon />}
                        size="xs"
                        variant="ghost"
                        color="inherit"
                        onClick={() => {
                          chrome.tabs.create({
                            url: `${explorer}/address/${address}`,
                          });
                        }}
                        _hover={{ color: "accent.highlight" }}
                        minW="auto"
                        h="auto"
                        p={0}
                      />
                    ) : null;
                  })()}
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
                      bg="surface.raised"
                      border={tokens.borders.thin}
                      borderColor="border.default"
                      borderRadius="sm"
                      boxShadow="card"
                      p={0.5}
                      cursor="pointer"
                      transition="all 0.15s ease-out"
                      _hover={{
                        transform: "translateY(-1px)",
                        boxShadow: "cardHover",
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

            {/* Swap + Send + More Buttons */}
            {address && activeAccount?.type !== "impersonator" && (
              <Box
                display="grid"
                gridTemplateColumns={
                  "minmax(0, 1.55fr) minmax(0, 1fr) minmax(0, 1fr)"
                }
                columnGap={2}
                alignItems="stretch"
              >
                <Button
                  w="100%"
                  minW={0}
                  bg="accent.secondary"
                  color="accentFg.secondary"
                  border="3px solid"
                  borderColor="border.default"
                  boxShadow="card"
                  fontWeight="800"
                  fontSize="xs"
                  textTransform="uppercase"
                  letterSpacing="normal"
                  iconSpacing={1.5}
                  px={1.5}
                  whiteSpace="nowrap"
                  leftIcon={<SwapIcon boxSize={4} />}
                  onClick={() => {
                    setSwapInitialBuyToken(undefined);
                    setView("swap");
                  }}
                  _hover={{
                    bg: "accent.secondary",
                    transform: "translateY(-2px)",
                    boxShadow: "cardHover",
                  }}
                  _active={{
                    transform: "translate(2px, 2px)",
                    boxShadow: "none",
                  }}
                >
                  Swap / Bridge
                </Button>
                <Button
                  w="100%"
                  minW={0}
                  bg={isDarkTheme ? "accent.primary" : "accent.highlight"}
                  color={
                    isDarkTheme ? "accentFg.primary" : "accentFg.highlight"
                  }
                  border="3px solid"
                  borderColor="border.default"
                  boxShadow="card"
                  fontWeight="800"
                  fontSize="xs"
                  textTransform="uppercase"
                  letterSpacing="normal"
                  iconSpacing={1.5}
                  px={1.5}
                  whiteSpace="nowrap"
                  leftIcon={
                    <Icon viewBox="0 0 24 24" boxSize={4}>
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
                    bg: isDarkTheme ? "accent.primary" : "accent.highlight",
                    opacity: 0.9,
                    transform: "translateY(-2px)",
                    boxShadow: "cardHover",
                  }}
                  _active={{
                    transform: "translate(2px, 2px)",
                    boxShadow: "none",
                  }}
                >
                  Send
                </Button>
                <Button
                  w="100%"
                  bg="surface.raised"
                  color="text.primary"
                  border="3px solid"
                  borderColor="border.default"
                  boxShadow="card"
                  fontWeight="800"
                  fontSize="xs"
                  textTransform="uppercase"
                  letterSpacing="normal"
                  iconSpacing={1.5}
                  px={1.5}
                  minW={0}
                  whiteSpace="nowrap"
                  leftIcon={<MoreIcon boxSize={4} />}
                  onClick={() => setView("more")}
                  _hover={{
                    bg: "surface.raisedHover",
                    transform: "translateY(-2px)",
                    boxShadow: "cardHover",
                  }}
                  _active={{
                    transform: "translate(2px, 2px)",
                    boxShadow: "none",
                  }}
                >
                  More
                </Button>
              </Box>
            )}

            {/* Portfolio Tabs (Holdings + Activity) */}
            {address && (
              <PortfolioTabs
                address={address}
                activityTabTrigger={activityTabTrigger}
                holdingsTabTrigger={holdingsTabTrigger}
                refreshTrigger={portfolioRefreshTrigger}
                onRpcIssuesChange={handleRpcIssuesChange}
                onTokenClick={(token) => {
                  const tokenChain = getResolvedChainById(token.chainId, networksInfo);
                  if (tokenChain && tokenChain.name !== chainName) {
                    setChainName(tokenChain.name);
                    chrome.storage.sync.set({ chainName: tokenChain.name });
                  }
                  setTransferToken(token);
                  setView("transfer");
                }}
                onSwapClick={(token) => {
                  const tokenChain = getResolvedChainById(token.chainId, networksInfo);
                  if (tokenChain && tokenChain.name !== chainName) {
                    setChainName(tokenChain.name);
                    chrome.storage.sync.set({ chainName: tokenChain.name });
                  }
                  setSwapInitialSellToken(token);
                  setView("swap");
                }}
              />
            )}

            {/* Reload Required Alert */}
            {reloadRequired && (
              <Box
                bg="accent.highlight"
                border="3px solid"
                borderColor="border.default"
                boxShadow="card"
                p={3}
              >
                <HStack justify="space-between">
                  <HStack spacing={2}>
                    <Box p={1} bg="border.default">
                      <InfoIcon color="accent.highlight" boxSize={4} />
                    </Box>
                    <Box>
                      <Text
                        fontSize="sm"
                        color="accentFg.highlight"
                        fontWeight="700"
                      >
                        Reload page required
                      </Text>
                      <Text
                        fontSize="xs"
                        color="accentFg.highlight"
                        opacity={0.8}
                        fontWeight="500"
                      >
                        To apply changes on the current site
                      </Text>
                    </Box>
                  </HStack>
                  <Button
                    size="sm"
                    bg="border.default"
                    color="accent.highlight"
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
            bg="surface.base"
            borderTop="3px solid"
            borderColor="border.default"
            p={3}
          >
            <Box position="relative">
              {/* Geometric flourishes — circle, diamond, triangle. These are
                  pure Bauhaus exuberance; Midnight stays restrained, so we hide
                  the whole group when the corner ornament token is absent. */}
              {!isDarkTheme && (
                <>
                  <Box
                    position="absolute"
                    top="-8px"
                    left="10px"
                    w="12px"
                    h="12px"
                    bg="accent.primary"
                    borderRadius="full"
                    border="2px solid"
                    borderColor="border.default"
                    zIndex={1}
                  />
                  <Box
                    position="absolute"
                    top="-6px"
                    right="12px"
                    w="10px"
                    h="10px"
                    bg="accent.secondary"
                    transform="rotate(45deg)"
                    border="2px solid"
                    borderColor="border.default"
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
                    borderBottomColor="status.success.fg"
                    zIndex={1}
                  />
                </>
              )}

              <Button
                w="full"
                bg="accent.highlight"
                color="accentFg.highlight"
                border="3px solid"
                borderColor="border.default"
                boxShadow="card"
                fontWeight="900"
                textTransform="uppercase"
                letterSpacing="wider"
                py={6}
                _hover={{
                  bg: "accent.highlight",
                  opacity: 0.9,
                  transform: "translateY(-2px)",
                  boxShadow: "cardHover",
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
    </Box>
  );
  })();

  return (
    <>
      <ScreenStack view={view}>{screen}</ScreenStack>

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

    </>
  );
}

export default App;
