import {
  useState,
  useEffect,
  useCallback,
  useRef,
  Suspense,
  type ReactNode,
} from "react";
import {
  useUpdateEffect,
  Container,
  Box,
  VStack,
  useDisclosure,
} from "@chakra-ui/react";

import { isDarkThemeId, useTheme } from "@/theme";
import {
  closeSidePanelForWindow,
  switchSidePanelToPopup,
} from "@/lib/sidePanelControls";
import TransactionConfirmationErrorBoundary from "@/components/TransactionConfirmationErrorBoundary";
import AccountNetworkControls from "@/components/AccountNetworkControls";
import AppHeaderBar from "@/components/AppHeaderBar";
import HomeQuickActions from "@/components/HomeQuickActions";
import HomeDappDock, {
  type ActiveDappConnectionContext,
} from "@/components/HomeDappDock";
import type { PortfolioChainRelinkRequest } from "@/components/portfolioChainFilterState";
import {
  AccountSettings,
  AddAccount,
  AddChain,
  BatchTransactionConfirmation,
  ChatView,
  DappConnectionConfirmation,
  Erc7715PermissionConfirmation,
  HiddenPortfolioTokensView,
  HideTokensView,
  LedgerSetupScreen,
  MoreActionsView,
  PendingTxList,
  preloadApprovalRequestScreen,
  QRCodeModal,
  Settings,
  SignatureRequestConfirmation,
  SwapView,
  StakingScreen,
  TokenTransfer,
  TransactionConfirmation,
  WalletConnectView,
  WatchAssetConfirmation,
} from "@/app/lazyScreens";
import { resolveSendEntryToken } from "@/components/Transfer/model/sendEntry";
import LoadingFallback from "@/app/LoadingFallback";
import AppFeatureFrame from "@/app/AppFeatureFrame";
import { isArcBrowser } from "@/app/isArcBrowser";
import { findPendingShieldConfirmation } from "@/components/Shield/model/pendingShield";

// Eager load components needed immediately
import UnlockScreen from "@/components/UnlockScreen";
import { ScreenStack, type AppView } from "@/components/ScreenTransition";
import type { SettingsTab } from "@/components/Settings";
import type {
  AccountSettingsSubView,
  BankrConfigDraft,
} from "@/components/AccountSettings";
import PendingTxBanner from "@/components/PendingTxBanner";
import PortfolioTabs from "@/components/PortfolioTabs";
import { useNetworks } from "@/contexts/NetworksContext";
import { hasEncryptedApiKey } from "@/chrome/crypto";
import { PendingTxRequest } from "@/chrome/requests/pendingTxStorage";
import { PendingSignatureRequest } from "@/chrome/requests/pendingSignatureStorage";
import type { PendingErc7715PermissionRequest } from "@/chrome/pendingErc7715PermissionStorage";
import type { PendingBatchTxRequest } from "@/chrome/erc5792Types";
import {
  getCrossDappBatch,
  type CrossDappBatch,
} from "@/chrome/crossDappBatch/storage";
import { PendingWatchAssetRequest } from "@/chrome/requests/pendingWatchAssetStorage";
import { PendingAddChainRequest } from "@/chrome/requests/pendingAddChainStorage";
import type { PendingDappConnectionRequest } from "@/chrome/requests/dappPermissionStorage";
import type { Account, PasswordType } from "@/chrome/types";
import { isPrivacyPoolsMutationAccount } from "@/chrome/privacy/deployment/accountPolicy";
import type { PortfolioToken } from "@/chrome/portfolio/api";
import type { CompletedTransaction } from "@/chrome/txHistoryStorage";
import type {
  WalletConnectAddChainContext,
  WalletConnectRetryNotice,
  WalletConnectSessionSummary,
} from "@/types/walletConnect";

import { WALLETCHAN_OS_URL } from "@/constants/externalUrls";
import {
  getDefaultChainName,
  getResolvedChainById,
  getResolvedChainByName,
  getVisibleChains,
} from "@/lib/chains";
import { playInteractionSound } from "@/sounds/soundManager";
import { createBatchRequestSoundGate } from "@/sounds/batchRequestSoundGate";
import { getCombinedRequests } from "@/app/requestModel";
import {
  FailedTransactionAlert,
  ReloadRequiredAlert,
  RpcIssueAlert,
  type FailedTransactionError,
} from "@/app/home/HomeAlerts";
import { useRpcIssueAlert } from "@/app/home/useRpcIssueAlert";
import WaitingForOnboardingScreen from "@/app/screens/WaitingForOnboardingScreen";
import CrossDappBatchRequestScreen from "@/app/screens/CrossDappBatchRequestScreen";
import {
  applyExtensionSurfaceClass,
  detectExtensionSurface,
} from "@/app/extensionSurface";
import AppBootstrapTransition from "@/app/AppBootstrapTransition";
import { useRuntimeMessaging } from "@/app/hooks/useRuntimeMessaging";
import { useManualWalletLock } from "@/app/hooks/useManualWalletLock";
import ManualWalletLockScreen from "@/app/screens/ManualWalletLockScreen";
import {
  loadInitialApprovalRequests,
  takeInitialApprovalRequestHint,
} from "@/app/initialApprovalRequests";
import { applyInitialApprovalRoute, resolveHintedInitialApprovalRoute } from "@/app/initialApprovalRoute";
import { openOrFocusOnboarding } from "@/app/openOnboarding";
import { isLedgerSetupRoute } from "@/app/ledgerSetupRoute";
import {
  UNLOCK_SUCCESS_HOLD_MS,
  UNLOCK_SUCCESS_REDUCED_MOTION_HOLD_MS,
  type AddChainReturnTarget,
  type UnlockReturnTarget,
} from "@/app/unlockRouting";
import { SafeApprovalsSurface, SafeFeatureUnavailable, SafeHomeActivity, SafeHomeApprovalRail, SafeHomeQuickActions } from "@/app/SafeAppSurfaces";
import { toLegacyAccountType } from "@/app/safeAccountType";
import { PrivatePortfolioHome, useWalletHomeMode, WalletModeToggle } from "@/app/home";
import type { UnshieldOperation } from "@/components/Shield/model/unshield";
import PrivacyActionRoute from "@/app/screens/PrivacyActionRoute";
import TransactionDetailRoute from "@/app/screens/TransactionDetailRoute";
import { clearRendererMemoryCache } from "@/app/rendererMemoryCache";

function App() {
  const { themeId } = useTheme();
  const isDarkTheme = isDarkThemeId(themeId);
  const { networksInfo, reloadRequired, setReloadRequired } = useNetworks();
  const { mode: walletHomeMode, setMode: setWalletHomeMode } = useWalletHomeMode();
  const [view, setView] = useState<AppView>("main");
  const ledgerSetupRequestedRef = useRef(
    isLedgerSetupRoute(window.location.search),
  );
  const batchRequestSoundGateRef = useRef(createBatchRequestSoundGate());
  const [isLoading, setIsLoading] = useState(true);
  const [isApprovalRequestLoading, setIsApprovalRequestLoading] = useState(false);
  const [address, setAddress] = useState<string>("");
  const [displayAddress, setDisplayAddress] = useState<string>("");
  const [chainName, setChainName] = useState<string>();
  const [hasApiKey, setHasApiKey] = useState(false);
  const [pendingRequests, setPendingRequests] = useState<PendingTxRequest[]>([]);
  const [selectedTxRequest, setSelectedTxRequest] = useState<PendingTxRequest | null>(null);
  const [selectedCompletedTx, setSelectedCompletedTx] = useState<CompletedTransaction | null>(null);
  const [selectedUnshieldOperation, setSelectedUnshieldOperation] = useState<UnshieldOperation | null>(null);
  const [pendingSignatureRequests, setPendingSignatureRequests] = useState<PendingSignatureRequest[]>([]);
  const [selectedSignatureRequest, setSelectedSignatureRequest] = useState<PendingSignatureRequest | null>(null);
  const [pendingErc7715PermissionRequests, setPendingErc7715PermissionRequests] = useState<PendingErc7715PermissionRequest[]>([]);
  const [selectedErc7715PermissionRequest, setSelectedErc7715PermissionRequest] = useState<PendingErc7715PermissionRequest | null>(null);
  const [pendingWatchAssetRequest, setPendingWatchAssetRequest] = useState<PendingWatchAssetRequest | null>(null);
  const [pendingAddChainRequest, setPendingAddChainRequest] = useState<PendingAddChainRequest | null>(null);
  const [pendingDappConnectionRequest, setPendingDappConnectionRequest] = useState<PendingDappConnectionRequest | null>(null);
  const [activeDappContext, setActiveDappContext] = useState<ActiveDappConnectionContext | null>(null);
  const [homeChainBalances, setHomeChainBalances] = useState<ReadonlyMap<number, number>>(new Map());
  const [homeChainBalancesHidden, setHomeChainBalancesHidden] = useState(false);
  const {
    visibleChainIds: visibleRpcIssueChainIds,
    reportRpcIssues,
    dismissRpcIssues,
    clearRpcIssue,
  } = useRpcIssueAlert();
  const [pendingBatchRequests, setPendingBatchRequests] = useState<PendingBatchTxRequest[]>([]);
  const [selectedBatchRequest, setSelectedBatchRequest] = useState<PendingBatchTxRequest | null>(null);
  // User-assembled cross-dapp batch (Bankr/impersonator accounts only).
  // Single batch at a time, locked to the from + chainId of whatever was added first.
  const [crossDappBatch, setCrossDappBatch] = useState<CrossDappBatch | null>(null);
  const [activityTabTrigger, setActivityTabTrigger] = useState(0);
  const [holdingsTabTrigger, setHoldingsTabTrigger] = useState(0);
  const [privateHomeTab, setPrivateHomeTab] = useState<"assets" | "activity">("assets");
  const openPrivateActivity = useCallback(() => {
    setWalletHomeMode("private");
    setPrivateHomeTab("activity");
  }, [setWalletHomeMode]);
  const [portfolioRefreshTrigger, setPortfolioRefreshTrigger] = useState(0);
  const [portfolioChainRelinkRequest, setPortfolioChainRelinkRequest] = useState<PortfolioChainRelinkRequest | null>(null);
  const portfolioChainRelinkRevisionRef = useRef(0);
  // Set by navigateToAdjacentRequest when the popup has already pre-switched
  // to an adjacent pending request. The async onRejected/onCancelled handlers
  // consume & reset this flag so they skip their fallback routing (which
  // would otherwise cause a second transition after the pre-nav).
  const preNavigatedRef = useRef(false);
  // Storage changes can arrive before or after the reject callback. Remember
  // explicit rejections so removal does not masquerade as submission.
  const rejectingTxIdsRef = useRef(new Set<string>());
  const rejectingBatchIdsRef = useRef(new Set<string>());

  const [sidePanelSupported, setSidePanelSupported] = useState(false);
  const [sidePanelMode, setSidePanelMode] = useState(false);
  const [isInSidePanel, setIsInSidePanel] = useState(false);
  const [isFullscreenTab, setIsFullscreenTab] = useState(false);
  const [failedTxError, setFailedTxError] =
    useState<FailedTransactionError | null>(null);
  const [settingsInitialTab, setSettingsInitialTab] =
    useState<SettingsTab>("main");
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
  const [suppressPasskeyAutoPrompt, setSuppressPasskeyAutoPrompt] =
    useState(false);
  const [showUnlockMascotSuccess, setShowUnlockMascotSuccess] =
    useState(false);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [activeAccount, setActiveAccount] = useState<Account | null>(null);
  const [settingsAccount, setSettingsAccount] = useState<Account | null>(null);
  const [accountSettingsReturnTarget, setAccountSettingsReturnTarget] = useState<"home" | "settingsAccounts">("home");
  const [isAccountPickerOpen, setIsAccountPickerOpen] = useState(false);
  const [accountSettingsInitialView, setAccountSettingsInitialView] =
    useState<AccountSettingsSubView>("settings");
  const [accountSettingsApiKeyDraft, setAccountSettingsApiKeyDraft] =
    useState<BankrConfigDraft | null>(null);
  const unlockReturnTargetRef = useRef<UnlockReturnTarget | null>(null);
  const unlockRouteHandledRef = useRef(false);
  const isWalletUnlockedRef = useRef(isWalletUnlocked);
  const selectedChain = getResolvedChainByName(chainName, networksInfo);
  const visibleChains = getVisibleChains(networksInfo, activeAccount?.type);

  const openAccountSettingsView = (account: Account, returnTarget: "home" | "settingsAccounts") => { setAccountSettingsReturnTarget(returnTarget); setAccountSettingsInitialView("settings"); setAccountSettingsApiKeyDraft(null); setSettingsAccount(account); setView("accountSettings"); };

  const requestPortfolioChainRelink = useCallback(
    (tabId: number, chainId: number) => {
      portfolioChainRelinkRevisionRef.current += 1;
      setPortfolioChainRelinkRequest({
        revision: portfolioChainRelinkRevisionRef.current,
        tabId,
        chainId,
      });
    },
    [],
  );
  const handleHomepageChainSelect = useCallback(
    (nextChainName: string) => {
      if (!chainName) {
        setReloadRequired(true);
      }
      const nextChain = getResolvedChainByName(nextChainName, networksInfo);
      if (activeDappContext?.connected && nextChain) {
        requestPortfolioChainRelink(activeDappContext.tabId, nextChain.chainId);
      }
      setChainName(nextChainName);
    },
    [
      activeDappContext,
      chainName,
      networksInfo,
      requestPortfolioChainRelink,
      setReloadRequired,
    ],
  );
  const {
    isOpen: isQROpen,
    onOpen: onQROpen,
    onClose: onQRClose,
  } = useDisclosure();
  const [transferToken, setTransferToken] = useState<PortfolioToken | null>(
    null,
  );
  const [selectedSafeProposalId, setSelectedSafeProposalId] = useState<string | null>(null);
  const [safeProposalEntryPoint, setSafeProposalEntryPoint] = useState<"requests" | "activity">("requests");
  const openSafeApprovals = (proposalId: string | null, entryPoint: "requests" | "activity" = "requests") => {
    setSelectedSafeProposalId(proposalId);
    setSafeProposalEntryPoint(entryPoint);
    setView("safeApprovals");
  };
  const [swapInitialBuyToken, setSwapInitialBuyToken] = useState<
    { address: string; name: string; symbol: string; decimals: number; logoURI?: string } | undefined>();
  const [swapInitialSellToken, setSwapInitialSellToken] = useState<PortfolioToken | undefined>();
  const [privacyAction, setPrivacyAction] = useState<{ mode: "shield" | "unshield" | "status"; unshieldTarget: NonNullable<CompletedTransaction["privacyShieldMeta"]> | null }>({ mode: "shield", unshieldTarget: null });
  const openPrivacyAction = (mode: "shield" | "unshield" | "status", unshieldTarget: CompletedTransaction["privacyShieldMeta"] | null = null) => {
    const pendingShield = mode === "shield" ? findPendingShieldConfirmation(pendingRequests) : null;
    if (pendingShield) { setSelectedTxRequest(pendingShield); setView("txConfirm"); return; }
    setPrivacyAction({ mode, unshieldTarget }); setView("shield");
  };
  const [walletConnectSessionCount, setWalletConnectSessionCount] = useState(0);
  const [walletConnectChainId, setWalletConnectChainId] = useState<number | null>(null);
  const { establishKeepalivePort, sendMessageWithRetry } =
    useRuntimeMessaging();
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
    const [current] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    const isWebTab =
      current?.id !== undefined &&
      !current.url?.startsWith("chrome-extension://") &&
      !current.url?.startsWith("moz-extension://");
    if (isWebTab) return current;

    // Detached confirmation windows are extension pages. Resolve the active
    // tab in the last normal browser window instead of binding account state
    // to the extension's own tab.
    const normalWindow = await chrome.windows.getLastFocused({
      populate: true,
      windowTypes: ["normal"],
    });
    return normalWindow.tabs?.find((tab) => tab.active) || current;
  };

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

  const loadPendingErc7715PermissionRequests = async () => {
    const requests = await sendMessageWithRetry<
      PendingErc7715PermissionRequest[]
    >({
      type: "getPendingErc7715PermissionRequests",
    });
    setPendingErc7715PermissionRequests(requests || []);
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

  const loadPendingDappConnectionRequests = async () => {
    const requests = await sendMessageWithRetry<PendingDappConnectionRequest[]>({
      type: "getPendingDappConnectionRequests",
    });
    return requests || [];
  };

  const loadActiveDappContext = useCallback(
    async (knownTabId?: number) => {
      const tabId = knownTabId ?? (await currentTab()).id;
      if (typeof tabId !== "number") {
        setActiveDappContext(null);
        return null;
      }
      const response = await sendMessageWithRetry<{
        success: boolean;
        context?: ActiveDappConnectionContext;
      }>({ type: "getDappConnectionContext", tabId });
      const context = response?.success ? response.context || null : null;
      setActiveDappContext(context);
      return context;
    },
    [sendMessageWithRetry],
  );

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
    const nextAccounts = accountList || [];
    setAccounts(nextAccounts);
    setSettingsAccount((current) =>
      current
        ? nextAccounts.find((account) => account.id === current.id) || current
        : current,
    );

    const tab = await currentTab();
    const active = await sendMessageWithRetry<Account | null>(
      typeof tab?.id === "number"
        ? { type: "getTabAccount", tabId: tab.id, activate: true }
        : { type: "getActiveAccount" },
    );
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

    return { accounts: nextAccounts, activeAccount: active };
  };

  const handleAccountSwitch = async (account: Account, targetTabId?: number) => {
    const tab = targetTabId === undefined ? await currentTab() : undefined;
    const resolvedTabId = targetTabId ?? tab?.id;
    let switchResult: { success?: boolean; error?: string } | null;
    if (typeof resolvedTabId === "number") {
      switchResult = await sendMessageWithRetry<{
        success?: boolean;
        error?: string;
      }>({
        type: "setTabAccount",
        tabId: resolvedTabId,
        accountId: account.id,
      });
    } else {
      switchResult = await sendMessageWithRetry<{
        success?: boolean;
        error?: string;
      }>({
        type: "setActiveAccount",
        accountId: account.id,
      });
    }
    if (!switchResult || switchResult.success === false) {
      throw new Error(switchResult?.error || "Failed to select account");
    }
    setActiveAccount(account);

    // Update address and displayAddress
    setAddress(account.address);
    setDisplayAddress(account.displayName || account.address);

    // If switching to a Bankr account, ensure current chain is supported
    if (account.type === "bankr" && chainName && networksInfo) {
      const currentChain = getResolvedChainByName(chainName, networksInfo);
      if (currentChain && !currentChain.isBankrSupported) {
        const firstSupported = getDefaultChainName(networksInfo, "bankr");
        if (firstSupported) setChainName(firstSupported);
      }
    }

    // Notify content script about the account change
    if (typeof resolvedTabId === "number") {
      chrome.tabs
        .sendMessage(resolvedTabId, {
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

    const initSidePanel = async () => {
      const supported = await checkSidePanelSupport();
      setSidePanelSupported(supported);
      let preferenceEnabled = false;

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
              preferenceEnabled = true;
              console.log("Sidepanel mode enabled by default");
            } else {
              setSidePanelMode(false);
            }
          } catch {
            setSidePanelMode(false);
          }
        } else {
          setSidePanelMode(storedMode);
          preferenceEnabled = storedMode;
        }
      }

      const surface = await detectExtensionSurface({
        sidePanelSupported: supported,
        sidePanelPreferenceEnabled: preferenceEnabled,
      });
      const inFullscreen = surface === "fullscreen-tab";
      setIsFullscreenTab(inFullscreen);
      const inSidePanel = surface === "sidepanel";
      setIsInSidePanel(inSidePanel);
      applyExtensionSurfaceClass(surface);
    };

    initSidePanel();
    // Surface identity is fixed for the lifetime of this renderer document.
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
    const tab = await chrome.tabs.create({ url: extensionUrl });
    if (isInSidePanel) {
      const closed = await closeSidePanelForWindow(tab.windowId);
      if (!closed) {
        window.close();
      }
      return;
    }

    // Close popup if we're in popup mode
    if (!isFullscreenTab) {
      window.close();
    }
  };

  const leaveLedgerSetupRoute = () => {
    ledgerSetupRequestedRef.current = false;
    window.history.replaceState({}, "", window.location.pathname);
    setView("main");
  };

  const toggleSidePanelMode = async () => {
    if (sidePanelMode) {
      // DISABLING: restore and immediately open the popup before closing the panel
      const switched = await switchSidePanelToPopup();
      if (!switched) {
        console.warn("Failed to switch from sidepanel to popup mode");
      }
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
      const approvalRequestHintPromise = takeInitialApprovalRequestHint();
      const apiKeyConfigured = await hasEncryptedApiKey();
      setHasApiKey(apiKeyConfigured);

      if (!apiKeyConfigured) {
        await openOrFocusOnboarding(setOnboardingTabId);
        setView("waitingForOnboarding");
        setIsLoading(false);
        return;
      }

      const approvalRequestHint = await approvalRequestHintPromise;
      setIsApprovalRequestLoading(approvalRequestHint !== null);
      if (approvalRequestHint) {
        void preloadApprovalRequestScreen(approvalRequestHint.requestType);
      }

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

      await establishKeepalivePort();

      const isUnlocked = await checkLockState();
      const initialApprovalRequests = await loadInitialApprovalRequests([
          loadPendingRequests,
          loadPendingSignatureRequests,
          loadPendingErc7715PermissionRequests,
          loadPendingBatchRequests,
          loadPendingDappConnectionRequests,
        ], approvalRequestHint);
      const [requests, sigRequests, permissionRequests, batchRequests, dappConnectionRequests] =
        initialApprovalRequests;
      const hintedApprovalRoute = resolveHintedInitialApprovalRoute(
        approvalRequestHint,
        initialApprovalRequests,
      );
      if (hintedApprovalRoute && !ledgerSetupRequestedRef.current) {
        setIsWalletUnlocked(isUnlocked);
        if (isUnlocked) {
          applyInitialApprovalRoute(hintedApprovalRoute, {
            setTransaction: setSelectedTxRequest,
            setSignature: setSelectedSignatureRequest,
            setPermission: setSelectedErc7715PermissionRequest,
            setBatch: setSelectedBatchRequest,
            setDappConnection: setPendingDappConnectionRequest,
            setView,
          });
        } else setView("unlock");
        setIsLoading(false);
      }

      const [
        watchAssetRequests,
        addChainRequests,
        ,
        loadedCrossDappBatch,
        ,
        loadedAccountState,
      ] = await Promise.all([
        loadPendingWatchAssetRequests(),
        loadPendingAddChainRequests(),
        loadActiveDappContext(),
        loadCrossDappBatch(),
        loadWalletConnectSessionCount(),
        loadAccounts(),
      ]);

      const hasUnannouncedBatchRequest = batchRequests.some((request) =>
        batchRequestSoundGateRef.current.claim(request.id),
      );
      if (
        requests.length > 0 ||
        sigRequests.length > 0 ||
        permissionRequests.length > 0 ||
        hasUnannouncedBatchRequest ||
        watchAssetRequests.length > 0 ||
        addChainRequests.length > 0 ||
        dappConnectionRequests.length > 0 ||
        (loadedCrossDappBatch?.entries.length ?? 0) > 0
      ) {
        void playInteractionSound("requestReceived");
      }

      // Load accounts
      let { accounts: loadedAccounts, activeAccount: loadedActive } =
        loadedAccountState;

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

      if (loadedAccounts.length === 0) {
        await openOrFocusOnboarding();
        setView("waitingForOnboarding");
        setIsLoading(false);
        return;
      }

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

      setIsWalletUnlocked(isUnlocked);

      if (ledgerSetupRequestedRef.current) {
        setView(isUnlocked ? "addAccount" : "unlock");
      } else if (hintedApprovalRoute) {
        // The matching request is already visible; finish hydration in place.
        if (hintedApprovalRoute.kind === "dappConnection" &&
            typeof hintedApprovalRoute.request.tabId === "number") {
          const requestAccount = await sendMessageWithRetry<Account | null>(
            { type: "getTabAccount", tabId: hintedApprovalRoute.request.tabId },
          );
          if (requestAccount) setActiveAccount(requestAccount);
        }
      } else if (!isUnlocked) {
        setView("unlock");
      } else if (requests.length > 0) {
        // Auto-open newest (last) pending transaction request
        setSelectedTxRequest(requests[requests.length - 1]);
        setView("txConfirm");
      } else if (batchRequests.length > 0) {
        setSelectedBatchRequest(batchRequests[batchRequests.length - 1]);
        setView("batchTxConfirm");
      } else if (permissionRequests.length > 0) {
        setSelectedErc7715PermissionRequest(
          permissionRequests[permissionRequests.length - 1],
        );
        setView("erc7715PermissionConfirm");
      } else if (dappConnectionRequests.length > 0) {
        const request = dappConnectionRequests[dappConnectionRequests.length - 1];
        setPendingDappConnectionRequest(request);
        if (typeof request.tabId === "number") {
          const requestAccount = await sendMessageWithRetry<Account | null>({
            type: "getTabAccount",
            tabId: request.tabId,
          });
          if (requestAccount) setActiveAccount(requestAccount);
        }
        setView("dappConnectionConfirm");
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

  // Listen for new pending tx/signature requests (when sidepanel/popup is already open)
  // Also respond to ping messages so background knows a view is open
  // Also listen for onboarding completion
  useEffect(() => {
    const handleMessage = (
      message: {
        type: string;
        txRequest?: PendingTxRequest;
        sigRequest?: PendingSignatureRequest;
        request?:
          | PendingErc7715PermissionRequest
          | PendingWatchAssetRequest
          | PendingAddChainRequest
          | PendingDappConnectionRequest;
        batchRequest?: PendingBatchTxRequest;
        sessions?: WalletConnectSessionSummary[];
        activeChainId?: number | null;
        chainId?: number;
        tabId?: number;
        proposalId?: string;
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
        void playInteractionSound("requestReceived");
        const txRequest = message.txRequest;
        setPendingRequests((current) =>
          current.some((request) => request.id === txRequest.id) ? current : [...current, txRequest]
        );
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
      if (message.type === "newSafeProposalRequest" && message.proposalId) {
        void playInteractionSound("requestReceived");
        openSafeApprovals(message.proposalId);
        return;
      }
      if (message.type === "newPendingSignatureRequest" && message.sigRequest) {
        void playInteractionSound("requestReceived");
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
        if (batchRequestSoundGateRef.current.claim(batchReq.id)) {
          void playInteractionSound("requestReceived");
        }
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
      if (
        message.type === "newPendingErc7715PermissionRequest" &&
        message.request
      ) {
        void playInteractionSound("requestReceived");
        const permissionRequest =
          message.request as PendingErc7715PermissionRequest;
        (async () => {
          const isUnlocked = await checkLockState();
          setIsWalletUnlocked(isUnlocked);
          if (isUnlocked) {
            setSelectedErc7715PermissionRequest(permissionRequest);
            setView("erc7715PermissionConfirm");
          } else {
            setView("unlock");
          }
        })();
        return;
      }
      if (message.type === "newPendingWatchAssetRequest" && message.request) {
        void playInteractionSound("requestReceived");
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
        void playInteractionSound("requestReceived");
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
      if (
        message.type === "newPendingDappConnectionRequest" &&
        message.request
      ) {
        void playInteractionSound("requestReceived");
        const connectionRequest =
          message.request as PendingDappConnectionRequest;
        (async () => {
          const isUnlocked = await checkLockState();
          setIsWalletUnlocked(isUnlocked);
          if (isUnlocked) {
            if (typeof connectionRequest.tabId === "number") {
              const requestAccount = await sendMessageWithRetry<Account | null>({
                type: "getTabAccount",
                tabId: connectionRequest.tabId,
              });
              if (requestAccount) setActiveAccount(requestAccount);
            }
            setPendingDappConnectionRequest(connectionRequest);
            setView("dappConnectionConfirm");
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
      if (message.type === "dappPermissionsChanged") {
        void loadActiveDappContext();
        return;
      }
      const relinkTabId = message.tabId;
      const relinkChainId = message.chainId;
      if (
        message.type === "portfolioDappChainChanged" &&
        typeof relinkTabId === "number" &&
        Number.isInteger(relinkTabId) &&
        relinkTabId >= 0 &&
        typeof relinkChainId === "number" &&
        Number.isInteger(relinkChainId) &&
        relinkChainId > 0
      ) {
        requestPortfolioChainRelink(relinkTabId, relinkChainId);
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
            const wasUserRejected = rejectingTxIdsRef.current.delete(
              selectedTxRequest.id,
            );
            if (
              !wasUserRejected &&
              (selectedTxRequest.privacyShieldMeta ||
                selectedTxRequest.privacyRagequitMeta ||
                selectedTxRequest.privacyUnshieldMeta)
            ) {
              openPrivateActivity();
            }
            if (updated.length > 0) {
              setSelectedTxRequest(updated[0]);
            } else {
              // Popup confirmation owns its success animation and close.
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
                  pendingErc7715PermissionRequests.length > 0 ||
                  pendingSignatureRequests.length > 0 ||
                  (crossDappBatch != null &&
                    crossDappBatch.entries.length > 0);
                if (
                  !hasOtherPending &&
                  (view === "txConfirm" || view === "pendingTxList")
                ) {
                  if (wasUserRejected && !selectedTxRequest.replacement) {
                    setHoldingsTabTrigger((current) =>
                      Math.max(current + 1, activityTabTrigger + 1),
                    );
                  } else {
                    setActivityTabTrigger((current) =>
                      Math.max(current + 1, holdingsTabTrigger + 1),
                    );
                  }
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
                  pendingErc7715PermissionRequests.length > 0 ||
                  (crossDappBatch != null &&
                    crossDappBatch.entries.length > 0);
                if (view === "signatureConfirm" && !hasOtherPending) {
                  setView("main");
                }
              }
            }
          }
        }
        if (changes.pendingErc7715PermissionRequests) {
          const updated: PendingErc7715PermissionRequest[] =
            changes.pendingErc7715PermissionRequests.newValue || [];
          setPendingErc7715PermissionRequests(updated);
          if (
            selectedErc7715PermissionRequest &&
            !updated.find(
              (r) => r.id === selectedErc7715PermissionRequest.id,
            )
          ) {
            if (updated.length > 0) {
              setSelectedErc7715PermissionRequest(updated[0]);
            } else if (
              view === "erc7715PermissionConfirm" &&
              !isInSidePanel &&
              !isFullscreenTab
            ) {
              // Popup mode: let the confirmation callback close or route.
            } else {
              setSelectedErc7715PermissionRequest(null);
              const hasOtherPending =
                pendingRequests.length > 0 ||
                pendingBatchRequests.length > 0 ||
                pendingSignatureRequests.length > 0 ||
                (crossDappBatch != null &&
                  crossDappBatch.entries.length > 0);
              if (view === "erc7715PermissionConfirm" && !hasOtherPending) {
                setView("main");
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
            const wasUserRejected = rejectingBatchIdsRef.current.delete(
              selectedBatchRequest.id,
            );
            if (
              !wasUserRejected &&
              selectedBatchRequest.privacyRagequitMeta
            ) {
              openPrivateActivity();
            }
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
                pendingErc7715PermissionRequests.length > 0 ||
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
  }, [chainName, address, displayAddress, selectedTxRequest, selectedSignatureRequest, selectedErc7715PermissionRequest, selectedBatchRequest, pendingWatchAssetRequest, pendingRequests, pendingBatchRequests, pendingSignatureRequests, pendingErc7715PermissionRequests, crossDappBatch, view, isInSidePanel, isFullscreenTab, activityTabTrigger, holdingsTabTrigger, openPrivateActivity]);

  // Keep the Home dapp context synchronized with both tab switches and
  // same-tab navigations (for example New Tab -> app.aave.com).
  useEffect(() => {
    let navigationRefreshTimer: number | null = null;

    const handleTabActivated = (activeInfo: chrome.tabs.TabActiveInfo) => {
      void loadActiveDappContext(activeInfo.tabId);
      void sendMessageWithRetry<Account | null>({
        type: "getTabAccount",
        tabId: activeInfo.tabId,
        activate: true,
      }).then((account) => {
        if (!account) return;
        setActiveAccount(account);
        setAddress(account.address);
        setDisplayAddress(account.displayName || account.address);
      });
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

    const handleTabUpdated = (
      tabId: number,
      changeInfo: chrome.tabs.TabChangeInfo,
    ) => {
      if (
        !changeInfo.url &&
        !changeInfo.title &&
        !changeInfo.favIconUrl &&
        changeInfo.status !== "complete"
      ) {
        return;
      }

      if (navigationRefreshTimer !== null) {
        window.clearTimeout(navigationRefreshTimer);
      }
      navigationRefreshTimer = window.setTimeout(() => {
        void currentTab().then((activeTab) => {
          if (activeTab.id === tabId) {
            void loadActiveDappContext(tabId);
          }
        });
      }, 75);
    };

    chrome.tabs.onActivated.addListener(handleTabActivated);
    chrome.tabs.onUpdated.addListener(handleTabUpdated);
    return () => {
      chrome.tabs.onActivated.removeListener(handleTabActivated);
      chrome.tabs.onUpdated.removeListener(handleTabUpdated);
      if (navigationRefreshTimer !== null) {
        window.clearTimeout(navigationRefreshTimer);
      }
    };
  }, [loadActiveDappContext, sendMessageWithRetry]);

  useUpdateEffect(() => {
    const updateChainId = async () => {
      if (networksInfo && chainName) {
        const chain = getResolvedChainByName(chainName, networksInfo);

        if (
          !chain ||
          chain.hidden ||
          (activeAccount?.type === "bankr" && !chain.isBankrSupported)
        ) {
          const fallbackChainName = getDefaultChainName(
            networksInfo,
            activeAccount?.type,
          );
          if (fallbackChainName && fallbackChainName !== chainName) {
            setChainName(fallbackChainName);
            await chrome.storage.sync.set({ chainName: fallbackChainName });
          }
          return;
        }

        const tab = await currentTab();

        chrome.tabs
          .sendMessage(tab.id!, {
            type: "setChainId",
            msg: { chainName: chain.name, chainId: chain.chainId },
          })
          .catch(() => {
            // Ignore errors if content script not injected (e.g. chrome:// pages)
          });

        await chrome.storage.sync.set({ chainName });
      }
    };

    updateChainId();
  }, [activeAccount?.type, chainName, networksInfo]);

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
    if (unlockRouteHandledRef.current) return;
    unlockRouteHandledRef.current = true;

    // Commit the success pose before root navigation starts. The background
    // unlock broadcast can reach this surface before the originating callback,
    // so the presentation signal belongs at this shared routing boundary. One
    // committed frame lets ScreenStack capture it, then visible surfaces hold
    // briefly so the approved success burst can read before the root fade.
    // Authentication is already complete; hidden sibling surfaces never wait
    // on presentation timing.
    setShowUnlockMascotSuccess(true);
    if (document.visibilityState === "visible") {
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => resolve());
      });
      const prefersReducedMotion = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;
      await new Promise<void>((resolve) => {
        window.setTimeout(
          resolve,
          prefersReducedMotion
            ? UNLOCK_SUCCESS_REDUCED_MOTION_HOLD_MS
            : UNLOCK_SUCCESS_HOLD_MS,
        );
      });
    }

    // Mark wallet as unlocked
    isWalletUnlockedRef.current = true;
    setIsWalletUnlocked(true);
    setSuppressPasskeyAutoPrompt(false);

    if (ledgerSetupRequestedRef.current) {
      setView("addAccount");
      return;
    }

    const unlockReturnTarget = unlockReturnTargetRef.current;
    if (unlockReturnTarget) {
      unlockReturnTargetRef.current = null;
      setReturnToChatAfterUnlock(false);
      setReturnToConversationId(null);

      if (unlockReturnTarget.view === "settings") {
        setSettingsInitialTab(unlockReturnTarget.tab);
        setView("settings");
        return;
      }

      if (unlockReturnTarget.view === "settingsAddChain") {
        setView("settingsAddChain");
        return;
      }

      if (unlockReturnTarget.view === "privacyAction") {
        void chrome.runtime.sendMessage({ type: "privacySyncShield" }); setView("shield"); return;
      }

      setAccountSettingsInitialView(unlockReturnTarget.subView);
      setView("accountSettings");
      return;
    }

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
    const permissionRequests = await loadPendingErc7715PermissionRequests();
    const batchReqs = await loadPendingBatchRequests();
    const watchAssetRequests = await loadPendingWatchAssetRequests();
    const addChainReqs = await loadPendingAddChainRequests();
    const dappConnectionReqs = await loadPendingDappConnectionRequests();

    if (requests.length > 0) {
      setSelectedTxRequest(requests[requests.length - 1]);
      setView("txConfirm");
    } else if (batchReqs.length > 0) {
      setSelectedBatchRequest(batchReqs[batchReqs.length - 1]);
      setView("batchTxConfirm");
    } else if (permissionRequests.length > 0) {
      setSelectedErc7715PermissionRequest(
        permissionRequests[permissionRequests.length - 1],
      );
      setView("erc7715PermissionConfirm");
    } else if (dappConnectionReqs.length > 0) {
      const request = dappConnectionReqs[dappConnectionReqs.length - 1];
      setPendingDappConnectionRequest(request);
      if (typeof request.tabId === "number") {
        const requestAccount = await sendMessageWithRetry<Account | null>({
          type: "getTabAccount",
          tabId: request.tabId,
        });
        if (requestAccount) setActiveAccount(requestAccount);
      }
      setView("dappConnectionConfirm");
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

  const { status: manualLockStatus, requestLock: requestManualLock } =
    useManualWalletLock({
      isWalletUnlocked,
      isWalletUnlockedRef,
      unlockRouteHandledRef,
      handleUnlock,
      setShowUnlockMascotSuccess,
      setIsWalletUnlocked,
      setPasswordType,
      setAccountSettingsApiKeyDraft,
      setSuppressPasskeyAutoPrompt,
      setView,
    });

  const returnToActivity = useCallback(() => {
    setActivityTabTrigger((current) => Math.max(current + 1, holdingsTabTrigger + 1));
    setView("main");
  }, [holdingsTabTrigger]);

  // Before rejection, move to Activity for replacements or an adjacent prompt.
  // This prevents prompt removal from briefly leaving an invalid selection.
  const navigateToAdjacentRequest = useCallback(() => {
    if (selectedTxRequest?.replacement) {
      setSelectedTxRequest(null);
      preNavigatedRef.current = true;
      returnToActivity();
      return;
    }
    const combined = getCombinedRequests(
      pendingRequests,
      pendingSignatureRequests,
      pendingBatchRequests,
      crossDappBatch,
      pendingErc7715PermissionRequests,
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
    } else if (
      view === "erc7715PermissionConfirm" &&
      selectedErc7715PermissionRequest
    ) {
      currentIdx = combined.findIndex(
        (r) =>
          r.type === "permission" &&
          r.request.id === selectedErc7715PermissionRequest.id,
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
      setSelectedErc7715PermissionRequest(null);
      setSelectedTxRequest(target.request);
      if (view !== "txConfirm") setView("txConfirm");
    } else if (target.type === "batch") {
      setSelectedTxRequest(null);
      setSelectedSignatureRequest(null);
      setSelectedErc7715PermissionRequest(null);
      setSelectedBatchRequest(target.request);
      if (view !== "batchTxConfirm") setView("batchTxConfirm");
    } else if (target.type === "permission") {
      setSelectedTxRequest(null);
      setSelectedBatchRequest(null);
      setSelectedSignatureRequest(null);
      setSelectedErc7715PermissionRequest(target.request);
      if (view !== "erc7715PermissionConfirm") {
        setView("erc7715PermissionConfirm");
      }
    } else if (target.type === "sig") {
      setSelectedTxRequest(null);
      setSelectedBatchRequest(null);
      setSelectedErc7715PermissionRequest(null);
      setSelectedSignatureRequest(target.request);
      if (view !== "signatureConfirm") setView("signatureConfirm");
    } else if (target.type === "crossDappBatch") {
      setSelectedTxRequest(null);
      setSelectedBatchRequest(null);
      setSelectedSignatureRequest(null);
      setSelectedErc7715PermissionRequest(null);
      if (view !== "crossDappBatchConfirm") setView("crossDappBatchConfirm");
    }
    preNavigatedRef.current = true;
  }, [
    pendingRequests,
    pendingSignatureRequests,
    pendingErc7715PermissionRequests,
    pendingBatchRequests,
    crossDappBatch,
    selectedTxRequest,
    selectedBatchRequest,
    selectedSignatureRequest,
    selectedErc7715PermissionRequest,
    returnToActivity,
    view,
  ]);

  const handleBeforeTxReject = useCallback(() => {
    if (selectedTxRequest?.id) {
      rejectingTxIdsRef.current.add(selectedTxRequest.id);
    }
    if (selectedTxRequest?.privacyUnshieldMeta) {
      clearRendererMemoryCache();
      return;
    }
    navigateToAdjacentRequest();
  }, [navigateToAdjacentRequest, selectedTxRequest]);

  const handleBeforeBatchReject = useCallback(() => {
    if (selectedBatchRequest?.id) {
      rejectingBatchIdsRef.current.add(selectedBatchRequest.id);
    }
    navigateToAdjacentRequest();
  }, [navigateToAdjacentRequest, selectedBatchRequest?.id]);

  const handleTxConfirmed = useCallback(async () => {
    const currentTxId = selectedTxRequest?.id;
    if (
      selectedTxRequest?.privacyShieldMeta ||
      selectedTxRequest?.privacyRagequitMeta ||
      selectedTxRequest?.privacyUnshieldMeta
    ) {
      openPrivateActivity();
    }
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
  }, [openPrivateActivity, selectedTxRequest?.id]);

  const handleTxRejected = useCallback(async () => {
    // If onBeforeReject pre-navigated to an adjacent pending request, the
    // popup is already showing the correct next view. Skip all fallback
    // routing to avoid a second transition.
    if (preNavigatedRef.current) {
      preNavigatedRef.current = false;
      if (selectedTxRequest?.id) {
        rejectingTxIdsRef.current.delete(selectedTxRequest.id);
      }
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
      } else {
        const permissionReqs = await loadPendingErc7715PermissionRequests();
        if (permissionReqs.length > 0) {
          setSelectedTxRequest(null);
          setSelectedErc7715PermissionRequest(permissionReqs[0]);
          setView("erc7715PermissionConfirm");
          return;
        }
        if (isInSidePanel || isFullscreenTab) {
          setSelectedTxRequest(null);
          setHoldingsTabTrigger((current) =>
            Math.max(current + 1, activityTabTrigger + 1),
          );
          setView("main");
        } else {
          window.close();
        }
      }
    }
  // Rejection fallback routing reads the current pending-request helpers.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    selectedTxRequest?.id,
    isInSidePanel,
    isFullscreenTab,
    activityTabTrigger,
  ]);

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
    for (const request of pendingErc7715PermissionRequests) {
      await new Promise<void>((resolve) => {
        chrome.runtime.sendMessage(
          { type: "rejectErc7715PermissionRequest", requestId: request.id },
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
      setPendingErc7715PermissionRequests([]);
      setCrossDappBatch(null);
      setSelectedTxRequest(null);
      setSelectedBatchRequest(null);
      setSelectedSignatureRequest(null);
      setSelectedErc7715PermissionRequest(null);
      setView("main");
    } else {
      window.close();
    }
  }, [
    pendingRequests,
    pendingBatchRequests,
    pendingSignatureRequests,
    pendingErc7715PermissionRequests,
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
      } else {
        const permissionReqs = await loadPendingErc7715PermissionRequests();
        if (permissionReqs.length > 0) {
          setSelectedSignatureRequest(null);
          setSelectedErc7715PermissionRequest(permissionReqs[0]);
          setView("erc7715PermissionConfirm");
        } else if (isInSidePanel || isFullscreenTab) {
          setSelectedSignatureRequest(null);
          setView("main");
        } else {
          window.close();
        }
      }
    }
  // Signature completion fallback routing reads the current pending-request helpers.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSignatureRequest?.id, isInSidePanel, isFullscreenTab]);

  const handleErc7715PermissionCancelled = useCallback(async () => {
    if (preNavigatedRef.current) {
      preNavigatedRef.current = false;
      return;
    }

    const currentRequestId = selectedErc7715PermissionRequest?.id;
    const permissionRequests = await loadPendingErc7715PermissionRequests();
    const remaining = permissionRequests.filter(
      (request) => request.id !== currentRequestId,
    );

    if (remaining.length > 0) {
      setSelectedErc7715PermissionRequest(remaining[0]);
      return;
    }

    const txRequests = await loadPendingRequests();
    if (txRequests.length > 0) {
      setSelectedErc7715PermissionRequest(null);
      setSelectedTxRequest(txRequests[0]);
      setView("txConfirm");
      return;
    }

    const batchReqs = await loadPendingBatchRequests();
    if (batchReqs.length > 0) {
      setSelectedErc7715PermissionRequest(null);
      setSelectedBatchRequest(batchReqs[0]);
      setView("batchTxConfirm");
      return;
    }

    const sigRequests = await loadPendingSignatureRequests();
    if (sigRequests.length > 0) {
      setSelectedErc7715PermissionRequest(null);
      setSelectedSignatureRequest(sigRequests[0]);
      setView("signatureConfirm");
      return;
    }

    setSelectedErc7715PermissionRequest(null);
    if (isInSidePanel || isFullscreenTab) {
      setView("main");
    } else {
      window.close();
    }
  // Permission completion fallback routing reads the current pending-request helpers.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedErc7715PermissionRequest?.id, isInSidePanel, isFullscreenTab]);

  const handleHomeChainBalancesChange = useCallback(
    (totals: ReadonlyMap<number, number>, hidden: boolean) => {
      setHomeChainBalances(totals);
      setHomeChainBalancesHidden(hidden);
    },
    [],
  );

  const handleChainSaved = useCallback((chain: { chainName: string; chainId: number }) => {
    const returnTarget = settingsAddChainReturnTarget;
    clearRpcIssue(chain.chainId);
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
  }, [clearRpcIssue, settingsAddChainReturnTarget]);

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

  const requestUnlockReturn = useCallback((target: UnlockReturnTarget) => {
    unlockReturnTargetRef.current = target;
    isWalletUnlockedRef.current = false;
    unlockRouteHandledRef.current = false;
    setAccountSettingsApiKeyDraft(null);
    setIsWalletUnlocked(false);
    setView("unlock");
  }, []);

  const handleSettingsSessionExpired = useCallback(
    (returnTab: SettingsTab = "main") => {
      setSettingsInitialTab(returnTab);
      requestUnlockReturn({ view: "settings", tab: returnTab });
    },
    [requestUnlockReturn],
  );

  const handleSettingsAddChainSessionExpired = useCallback(() => {
    requestUnlockReturn({ view: "settingsAddChain" });
  }, [requestUnlockReturn]);

  const handleAccountSettingsSessionExpired = useCallback(
    (returnView: AccountSettingsSubView = "settings") => {
      setAccountSettingsInitialView(returnView);
      requestUnlockReturn({ view: "accountSettings", subView: returnView });
    },
    [requestUnlockReturn],
  );

  const handleHiddenTokensChanged = useCallback(() => {
    setPortfolioRefreshTrigger((prev) => prev + 1);
    setHoldingsTabTrigger((prev) => prev + 1);
  }, []);

  if (isLoading) {
    return (
      <AppBootstrapTransition
        isLoading
        showRequestSkeleton={isApprovalRequestLoading}
      />
    );
  }

  if (manualLockStatus !== "idle") {
    return (
      <ManualWalletLockScreen
        status={manualLockStatus}
        isFullscreenTab={isFullscreenTab}
        onRetry={requestManualLock}
      />
    );
  }

  // Render the current screen's JSX — wrapped in ScreenStack below so each
  // view transitions smoothly (horizontal push/Back for hierarchy and fade
  // for root/auth replacement). See components/ScreenTransition.tsx.
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
            showMascotSuccess={showUnlockMascotSuccess}
            suppressPasskeyAutoPrompt={suppressPasskeyAutoPrompt}
            pendingTxCount={pendingRequests.length}
            pendingSignatureCount={pendingSignatureRequests.length}
            pendingBatchCount={pendingBatchRequests.length}
            pendingPermissionCount={pendingErc7715PermissionRequests.length}
          />
        </Box>
      </Box>
    );
  }

  // Waiting for onboarding to complete
  if (view === "waitingForOnboarding") {
    return (
      <WaitingForOnboardingScreen
        isDarkTheme={isDarkTheme}
        isFullscreenTab={isFullscreenTab}
      />
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
                accountsView={{ accounts, activeAccount, onAddAccount: () => setView("addAccount"), onAccountSettings: (account) => openAccountSettingsView(account, "settingsAccounts"), onAccountsReordered: setAccounts }}
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
                    await establishKeepalivePort();

                    const unlocked = await checkLockState();

                    if (unlocked) {
                      setIsWalletUnlocked(true);
                      setView("main");
                    } else {
                      // Check if this was unexpected (auto-lock is "Never")
                      // If so, try to restore the session
                      const { autoLockTimeout } =
                        await chrome.storage.sync.get("autoLockTimeout");

                      if (autoLockTimeout === 0) {
                        // An explicitly selected "Never" timeout permits
                        // session restoration. A missing setting uses the
                        // finite security default and must stay locked.
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
                onSessionExpired={handleSettingsSessionExpired}
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
                accountsView={{ accounts, activeAccount, onAddAccount: () => setView("addAccount"), onAccountSettings: (account) => openAccountSettingsView(account, "settingsAccounts"), onAccountsReordered: setAccounts }}
                close={async () => {
                  setSettingsAddChainInitialRequest(undefined);
                  setSettingsAddChainReturnTarget(null);
                  const has = await hasEncryptedApiKey();
                  setHasApiKey(has);

                  if (has) {
                    await establishKeepalivePort();
                    const isUnlocked = await checkLockState();
                    setIsWalletUnlocked(isUnlocked);
                    setView(isUnlocked ? "main" : "unlock");
                  } else {
                    setView("main");
                  }
                }}
                onSessionExpired={handleSettingsAddChainSessionExpired}
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
                setAccountSettingsInitialView("settings");
                setAccountSettingsApiKeyDraft(null);
                if (accountSettingsReturnTarget === "settingsAccounts") { setSettingsInitialTab("accounts"); setView("settings"); }
                else { setIsAccountPickerOpen(true); setView("main"); }
              }}
              onAccountUpdated={loadAccounts}
              accounts={accounts}
              initialView={accountSettingsInitialView}
              onSessionExpired={handleAccountSettingsSessionExpired}
              apiKeyDraft={accountSettingsApiKeyDraft}
              onApiKeyDraftChange={setAccountSettingsApiKeyDraft}
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

  // Ledger setup runs in a full extension tab so Chrome can display WebHID's
  // device chooser. Popup and side-panel renderers only launch this route.
  if (view === "addAccount" && ledgerSetupRequestedRef.current) {
    return (
      <Suspense fallback={<LoadingFallback />}>
        <LedgerSetupScreen onBack={leaveLedgerSetupRoute} onComplete={async () => {
          const added = await sendMessageWithRetry<Account | null>({ type: "getActiveAccount" });
          if (added) await handleAccountSwitch(added);
          await loadAccounts(true);
          leaveLedgerSetupRoute();
        }} />
      </Suspense>
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
            <AddAccount onBack={() => setView("main")}
              onOpenBiometricSettings={() => { setSettingsInitialTab("biometricUnlock"); setView("settings"); }}
              onAccountAdded={async () => {
                // Account creation makes the new account the global default.
                // Adopt it only in the tab where the user completed the flow;
                // every other established tab keeps its own binding.
                const addedAccount = await sendMessageWithRetry<Account | null>({
                  type: "getActiveAccount",
                });
                if (addedAccount) await handleAccountSwitch(addedAccount);
                await loadAccounts(true);
                setView("main");
              }}
            />
          </Suspense>
        </Box>
      </Box>
    );
  }

  // Safe approvals view
  if (view === "safeApprovals") {
    if (activeAccount?.type !== "safe") {
      return <SafeFeatureUnavailable title="Safe account is no longer selected" onBack={() => setView("main")} />;
    }
    const shouldReturnToActivity = safeProposalEntryPoint === "activity";
    const leaveSafeApprovals = () => { setSelectedSafeProposalId(null); setSafeProposalEntryPoint("requests"); if (shouldReturnToActivity) returnToActivity(); else setView("main"); };
    return <SafeApprovalsSurface account={activeAccount} chainId={selectedChain?.chainId ?? 8453} accounts={accounts} proposalId={selectedSafeProposalId} fullscreen={isFullscreenTab} onBack={leaveSafeApprovals} onProposalBack={shouldReturnToActivity ? leaveSafeApprovals : undefined} onExecutionSubmitted={() => { setWalletHomeMode("public"); setSelectedSafeProposalId(null); setSafeProposalEntryPoint("requests"); setActivityTabTrigger((current) => current + 1); setView("main"); }} onExecutionConfirmed={() => { setWalletHomeMode("public"); setSelectedSafeProposalId(null); setSafeProposalEntryPoint("requests"); setActivityTabTrigger((current) => current + 1); setView("main"); }} />;
  }

  // Transfer view
  if (view === "transfer") {
    return (
      <AppFeatureFrame isFullscreenTab={isFullscreenTab}>
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
            />
      </AppFeatureFrame>
    );
  }

  // Swap view
  if (view === "swap") {
    return (
      <AppFeatureFrame isFullscreenTab={isFullscreenTab}>
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
              onSafeProposalCreated={(proposalId) => {
                setSwapInitialBuyToken(undefined);
                setSwapInitialSellToken(undefined);
                openSafeApprovals(proposalId);
              }}
              onChainChange={(name) => {
                setChainName(name);
                chrome.storage.sync.set({ chainName: name });
              }}
              initialBuyToken={swapInitialBuyToken}
              initialSellToken={swapInitialSellToken}
            />
      </AppFeatureFrame>
    );
  }

  if (view === "staking") {
    return (
      <AppFeatureFrame isFullscreenTab={isFullscreenTab}>
            <StakingScreen
              fromAddress={address}
              accountId={activeAccount?.id}
              accountType={activeAccount?.type || "bankr"}
              onBack={() => setView("more")}
              onTransactionInitiated={() => {
                setView("main");
                setActivityTabTrigger((value) => value + 1);
                setHoldingsTabTrigger((value) => value + 1);
              }}
            />
      </AppFeatureFrame>
    );
  }

  // Privacy Pools Shield, Unshield, and deposit-status routes.
  if (view === "shield") {
    return (
      <PrivacyActionRoute
        isFullscreenTab={isFullscreenTab} mode={privacyAction.mode}
        unshieldTarget={privacyAction.unshieldTarget}
        account={activeAccount && isPrivacyPoolsMutationAccount(activeAccount) ? activeAccount : null}
        accounts={accounts} fallback={<LoadingFallback />}
        onBack={() => setView("main")}
        onUnlockRequired={() => requestUnlockReturn({ view: "privacyAction" })}
        onOpenBiometricSettings={() => { setSettingsInitialTab("biometricUnlock"); setView("settings"); }}
        onUnshieldSubmitted={() => { openPrivateActivity(); setActivityTabTrigger((current) => current + 1); setView("main"); }}
      />
    );
  }

  // More actions view
  if (view === "more") {
    return (
      <AppFeatureFrame isFullscreenTab={isFullscreenTab}>
            <MoreActionsView
              fromAddress={address}
              walletConnectSessionCount={walletConnectSessionCount}
              onBack={() => setView("main")}
              onWalletConnect={() => setView("walletConnect")}
              onStake={() => setView("staking")}
            />
      </AppFeatureFrame>
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
              onBack={() => setView("main")}
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
              onAccountSettings={(account) => openAccountSettingsView(account, "home")}
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
  if (view === "txDetail" && (selectedUnshieldOperation || selectedCompletedTx)) {
    return (
      <TransactionDetailRoute
        isFullscreenTab={isFullscreenTab} transaction={selectedCompletedTx}
        unshieldOperation={selectedUnshieldOperation} fallback={<LoadingFallback />}
        onUnshield={() => { openPrivacyAction("unshield", selectedCompletedTx?.privacyShieldMeta ?? null); setSelectedCompletedTx(null); }}
        onBackUnshield={() => { setSelectedUnshieldOperation(null); openPrivateActivity(); setActivityTabTrigger((current) => current + 1); setView("main"); }}
        onBackTransaction={() => { setSelectedCompletedTx(null); returnToActivity(); }}
      />
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
              permissionRequests={pendingErc7715PermissionRequests}
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
              onSelectPermission={(request) => {
                setSelectedErc7715PermissionRequest(request);
                setView("erc7715PermissionConfirm");
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
      pendingErc7715PermissionRequests,
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
            <TransactionConfirmationErrorBoundary
              txId={selectedTxRequest.id}
              totalCount={totalCount}
              onRejected={handleTxRejected}
              onRejectAll={handleRejectAll}
              onBeforeReject={handleBeforeTxReject}
            >
              <TransactionConfirmation
                key={selectedTxRequest.id}
                txRequest={selectedTxRequest}
                currentIndex={currentIndex >= 0 ? currentIndex : 0}
                totalCount={totalCount}
                isInSidePanel={isInSidePanel || isFullscreenTab}
                accountType={
                  selectedTxRequest.accountType ??
                  toLegacyAccountType(activeAccount?.type)
                }
                crossDappBatch={crossDappBatch}
                onBack={() => {
                  if (selectedTxRequest.replacement) {
                    setSelectedTxRequest(null); returnToActivity();
                  } else setView(totalCount > 1 ? "pendingTxList" : "main");
                }}
                onConfirmed={handleTxConfirmed}
                onRejected={handleTxRejected}
                onRejectAll={handleRejectAll}
                onBeforeReject={handleBeforeTxReject}
                onAddedToBatch={() => {
                  setSelectedTxRequest(null);
                  setView("crossDappBatchConfirm");
                }}
                onNavigate={(direction) => {
                  const currentIdx = combinedRequests.findIndex(
                    (r) =>
                      r.type === "tx" &&
                      r.request.id === selectedTxRequest.id,
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
                    } else if (nextRequest.type === "permission") {
                      setSelectedTxRequest(null);
                      setSelectedErc7715PermissionRequest(nextRequest.request);
                      setView("erc7715PermissionConfirm");
                    } else {
                      setSelectedTxRequest(null);
                      setSelectedSignatureRequest(nextRequest.request);
                      setView("signatureConfirm");
                    }
                  }
                }}
              />
            </TransactionConfirmationErrorBoundary>
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
      pendingErc7715PermissionRequests,
    );
    const currentIndex = combinedRequests.findIndex(
      (r) => r.type === "batch" && r.request.id === selectedBatchRequest.id,
    );
    const totalCount = combinedRequests.length;
    const storedBatchAccount = selectedBatchRequest.accountId
      ? accounts.find((account) => account.id === selectedBatchRequest.accountId)
      : undefined;
    const batchAccountAddress =
      selectedBatchRequest.accountAddress ??
      storedBatchAccount?.address ??
      (selectedBatchRequest.accountId ? "" : address);
    const batchAccountType =
      selectedBatchRequest.accountType ??
      toLegacyAccountType(storedBatchAccount?.type) ??
      (selectedBatchRequest.accountId
        ? undefined
        : toLegacyAccountType(activeAccount?.type));
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
              accountType={batchAccountType}
              accountAddress={batchAccountAddress}
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
                if (selectedBatchRequest.privacyRagequitMeta) {
                  openPrivateActivity();
                }
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
              onBeforeReject={handleBeforeBatchReject}
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
                  } else if (nextRequest.type === "permission") {
                    setSelectedBatchRequest(null);
                    setSelectedErc7715PermissionRequest(nextRequest.request);
                    setView("erc7715PermissionConfirm");
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
      pendingErc7715PermissionRequests,
    );
    const currentIndex = combinedRequests.findIndex(
      (r) => r.type === "crossDappBatch",
    );
    const totalCount = combinedRequests.length;
    return (
      <CrossDappBatchRequestScreen
        batch={crossDappBatch}
        currentIndex={currentIndex >= 0 ? currentIndex : 0}
        totalCount={totalCount}
        isInSidePanel={isInSidePanel}
        isFullscreenTab={isFullscreenTab}
        onBack={() => setView(totalCount > 1 ? "pendingTxList" : "main")}
        onConfirmed={() => {
          setActivityTabTrigger((k) => k + 1);
          if (isInSidePanel || isFullscreenTab) setView("main");
        }}
        onRejected={() => {
          setActivityTabTrigger((k) => k + 1);
          if (preNavigatedRef.current) {
            preNavigatedRef.current = false;
            return;
          }
          if (isInSidePanel || isFullscreenTab) setView("main");
          else window.close();
        }}
        onRejectAll={handleRejectAll}
        onBeforeReject={navigateToAdjacentRequest}
        onNavigate={(direction) => {
          const currentIdx = combinedRequests.findIndex(
            (request) => request.type === "crossDappBatch",
          );
          const nextRequest =
            combinedRequests[
              direction === "prev" ? currentIdx - 1 : currentIdx + 1
            ];
          if (nextRequest?.type === "tx") {
            setSelectedTxRequest(nextRequest.request);
            setView("txConfirm");
          } else if (nextRequest?.type === "batch") {
            setSelectedBatchRequest(nextRequest.request);
            setView("batchTxConfirm");
          } else if (nextRequest?.type === "sig") {
            setSelectedSignatureRequest(nextRequest.request);
            setView("signatureConfirm");
          } else if (nextRequest?.type === "permission") {
            setSelectedErc7715PermissionRequest(nextRequest.request);
            setView("erc7715PermissionConfirm");
          }
        }}
      />
    );
  }

  // Delegated permission confirmation view (ERC-7715)
  if (
    view === "erc7715PermissionConfirm" &&
    selectedErc7715PermissionRequest
  ) {
    const combinedRequests = getCombinedRequests(
      pendingRequests,
      pendingSignatureRequests,
      pendingBatchRequests,
      crossDappBatch,
      pendingErc7715PermissionRequests,
    );
    const currentIndex = combinedRequests.findIndex(
      (r) =>
        r.type === "permission" &&
        r.request.id === selectedErc7715PermissionRequest.id,
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
            <Erc7715PermissionConfirmation
              key={selectedErc7715PermissionRequest.id}
              permissionRequest={selectedErc7715PermissionRequest}
              currentIndex={currentIndex >= 0 ? currentIndex : 0}
              totalCount={totalCount}
              isInSidePanel={isInSidePanel || isFullscreenTab}
              accountType={selectedErc7715PermissionRequest.accountType}
              onBack={() => {
                setSelectedErc7715PermissionRequest(null);
                if (totalCount > 1) {
                  setView("pendingTxList");
                } else {
                  setView("main");
                }
              }}
              onCancelled={handleErc7715PermissionCancelled}
              onCancelAll={handleRejectAll}
              onBeforeCancel={navigateToAdjacentRequest}
              onConfirmed={handleErc7715PermissionCancelled}
              onNavigate={(direction) => {
                const currentIdx = combinedRequests.findIndex(
                  (r) =>
                    r.type === "permission" &&
                    r.request.id === selectedErc7715PermissionRequest.id,
                );
                const newIdx =
                  direction === "prev" ? currentIdx - 1 : currentIdx + 1;
                if (newIdx >= 0 && newIdx < combinedRequests.length) {
                  const nextRequest = combinedRequests[newIdx];
                  if (nextRequest.type === "permission") {
                    setSelectedErc7715PermissionRequest(nextRequest.request);
                  } else if (nextRequest.type === "tx") {
                    setSelectedErc7715PermissionRequest(null);
                    setSelectedTxRequest(nextRequest.request);
                    setView("txConfirm");
                  } else if (nextRequest.type === "batch") {
                    setSelectedErc7715PermissionRequest(null);
                    setSelectedBatchRequest(nextRequest.request);
                    setView("batchTxConfirm");
                  } else if (nextRequest.type === "crossDappBatch") {
                    setSelectedErc7715PermissionRequest(null);
                    setView("crossDappBatchConfirm");
                  } else if (nextRequest.type === "sig") {
                    setSelectedErc7715PermissionRequest(null);
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
      pendingErc7715PermissionRequests,
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
              accountType={
                selectedSignatureRequest.accountType ??
                toLegacyAccountType(activeAccount?.type)
              }
              onBack={() => {
                setSelectedSignatureRequest(null);
                if (totalCount > 1) {
                  setView("pendingTxList");
                } else {
                  setView("main");
                }
              }}
              onCancelled={handleSignatureCancelled}
              onRejectAll={handleRejectAll}
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
                  } else if (nextRequest.type === "permission") {
                    setSelectedSignatureRequest(null);
                    setSelectedErc7715PermissionRequest(nextRequest.request);
                    setView("erc7715PermissionConfirm");
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

  if (
    view === "dappConnectionConfirm" &&
    pendingDappConnectionRequest &&
    activeAccount
  ) {
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
            <DappConnectionConfirmation
              request={pendingDappConnectionRequest}
              accounts={accounts}
              account={activeAccount}
              sidePanelSupported={sidePanelSupported}
              sidePanelMode={sidePanelMode}
              isFullscreenTab={isFullscreenTab}
              onAccountSelect={(nextAccount) =>
                handleAccountSwitch(nextAccount, pendingDappConnectionRequest.tabId)
              }
              onToggleSidePanel={toggleSidePanelMode}
              onOpenFullscreen={openInFullscreenTab}
              onFinished={() => {
                setPendingDappConnectionRequest(null);
                void loadActiveDappContext();
                if (isInSidePanel || isFullscreenTab) setView("main");
                else window.close();
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
  const openWchanSwap = () => {
    const baseName = getResolvedChainById(8453, networksInfo)?.name ?? "Base";
    setChainName(baseName);
    chrome.storage.sync.set({ chainName: baseName });
    setSwapInitialBuyToken({
      address: "0xBa5ED0000e1CA9136a695f0a848012A16008B032",
      name: "WalletChan",
      symbol: "WCHAN",
      decimals: 18,
      logoURI: "/walletchan-icon.png",
    });
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
  };
  const walletModeToggle = <WalletModeToggle mode={walletHomeMode} publicDappConnected={Boolean(activeDappContext?.connected)} onChange={setWalletHomeMode} />;
  return (
    <Box bg="surface.base" h="100%" minH={0} display="flex" flexDirection="column">
      <Box
        maxW={isFullscreenTab ? "480px" : "100%"}
        mx="auto"
        w="100%"
        h="100%"
        minH={0}
        display="flex"
        flexDirection="column"
      >
        <AppHeaderBar
          isAgentSession={passwordType === "agent"}
          canChat={walletHomeMode === "public" && activeAccount?.type === "bankr"}
          sidePanelSupported={sidePanelSupported}
          sidePanelMode={sidePanelMode}
          isFullscreenTab={isFullscreenTab}
          onChat={() => {
            setStartChatWithNew(false);
            setView("chat");
          }}
          onLock={requestManualLock}
          onSettings={() => setView("settings")}
          onToggleSidePanel={toggleSidePanelMode}
          onOpenFullscreen={openInFullscreenTab}
          onBuyWchan={openWchanSwap}
          onOpenWalletChanOs={() => {
            chrome.tabs.create({ url: WALLETCHAN_OS_URL });
          }}
        />
        <Container
          data-screen-scroll-owner data-wallet-mode={walletHomeMode}
          pt={3}
          pb={4}
          flex="1"
          minH={0}
          display="flex"
          flexDirection="column"
          overflowY="auto"
          bg="surface.base"
        >
          <VStack spacing={4} align="stretch">
            {walletHomeMode === "public" && failedTxError && (
              <FailedTransactionAlert
                error={failedTxError}
                onDismiss={() => setFailedTxError(null)}
              />
            )}

            <PendingTxBanner
              txCount={pendingRequests.length}
              signatureCount={pendingSignatureRequests.length}
              permissionCount={pendingErc7715PermissionRequests.length}
              batchCount={pendingBatchRequests.length}
              crossDappBatchCount={crossDappBatch?.entries.length ?? 0}
              onClickTx={() => {
                const onlyOneTx =
                  pendingRequests.length === 1 &&
                  pendingSignatureRequests.length === 0 &&
                  pendingErc7715PermissionRequests.length === 0 &&
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
              onClickPermission={() => {
                const onlyOnePermission =
                  pendingErc7715PermissionRequests.length === 1 &&
                  pendingRequests.length === 0 &&
                  pendingSignatureRequests.length === 0 &&
                  pendingBatchRequests.length === 0 &&
                  !crossDappBatch;
                if (onlyOnePermission) {
                  setSelectedErc7715PermissionRequest(
                    pendingErc7715PermissionRequests[0],
                  );
                  setView("erc7715PermissionConfirm");
                } else {
                  setView("pendingTxList");
                }
              }}
              onClickBatch={() => {
                const onlyOneBatch =
                  pendingBatchRequests.length === 1 &&
                  pendingRequests.length === 0 &&
                  pendingErc7715PermissionRequests.length === 0 &&
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

            {walletHomeMode === "public" && <RpcIssueAlert
              chainIds={visibleRpcIssueChainIds}
              networksInfo={networksInfo}
              isDarkTheme={isDarkTheme}
              onEditChain={(chainName) => {
                setSettingsInitialTab("chains");
                setSettingsInitialEditChainName(chainName);
                setView("settings");
              }}
              onDismiss={dismissRpcIssues}
            />}

            {walletHomeMode === "public" && <AccountNetworkControls
              accounts={accounts}
              activeAccount={activeAccount}
              selectedChain={selectedChain}
              visibleChains={visibleChains}
              onAccountSelect={handleAccountSwitch}
              onAddAccount={() => setView("addAccount")}
              onAccountSettings={(account) => openAccountSettingsView(account, "home")}
              onShowQr={onQROpen}
              onChainSelect={handleHomepageChainSelect}
              onAddChain={() => openSettingsAddChain()}
              showNetworkSelector={false}
              isAccountPickerOpen={isAccountPickerOpen}
              onAccountPickerOpenChange={setIsAccountPickerOpen}
              onAccountsReordered={setAccounts}
            />}

            {walletHomeMode === "public" && activeAccount?.type === "safe" && (
              <SafeHomeApprovalRail
                accountId={activeAccount.id}
                onOpen={() => openSafeApprovals(null)}
              />
            )}

            {/* Portfolio balance, primary actions, assets, positions, and activity */}
            {walletHomeMode === "public" && address && (
              <PortfolioTabs
                address={address}
                accounts={accounts}
                connectedDappChainId={
                  activeDappContext?.connected
                    ? selectedChain?.chainId ?? null
                    : null
                }
                connectedDappTabId={
                  activeDappContext?.connected
                    ? activeDappContext.tabId
                    : null
                }
                chainRelinkRequest={portfolioChainRelinkRequest}
                onChainBalancesChange={handleHomeChainBalancesChange}
                onHideTokens={() => setView("hideTokens")}
                modeToggle={walletModeToggle}
                quickActions={
                  activeAccount?.type !== "safe" ? (
                    <HomeQuickActions
                      hasConnectedApps={walletConnectSessionCount > 0}
                      onSend={() => { setTransferToken(resolveSendEntryToken(null, networksInfo)); setView("transfer"); }}
                      onSwap={() => { setSwapInitialBuyToken(undefined); setSwapInitialSellToken(undefined); setView("swap"); }}
                      onShield={activeAccount && isPrivacyPoolsMutationAccount(activeAccount) ? () => openPrivacyAction("shield") : undefined}
                      onMore={() => setView("more")}
                    />
                  ) : activeAccount?.type === "safe" ? (
                    <SafeHomeQuickActions
                      accountId={activeAccount.id}
                      chainId={selectedChain?.chainId ?? 8453}
                      hasConnectedApps={walletConnectSessionCount > 0}
                      onSend={() => { setTransferToken(resolveSendEntryToken(null, networksInfo)); setView("transfer"); }}
                      onSwap={() => { setSwapInitialBuyToken(undefined); setSwapInitialSellToken(undefined); setView("swap"); }}
                      onMore={() => setView("more")}
                    />
                  ) : undefined
                }
                activityTabTrigger={activityTabTrigger}
                activitySupplement={activeAccount?.type === "safe" ? (filterChainId, onVisibilityChange) => (
                  <SafeHomeActivity
                    accountId={activeAccount.id}
                    accounts={accounts}
                    chainId={filterChainId}
                    onVisibilityChange={onVisibilityChange}
                    onOpen={(proposalId) => openSafeApprovals(proposalId, "activity")}
                  />
                ) : undefined}
                holdingsTabTrigger={holdingsTabTrigger}
                refreshTrigger={portfolioRefreshTrigger}
                onRpcIssuesChange={reportRpcIssues}
                onTransactionClick={(tx) => {
                  setSelectedUnshieldOperation(null);
                  setSelectedCompletedTx(tx);
                  setView("txDetail");
                }}
                onTokenClick={(token) => {
                  const tokenChain = getResolvedChainById(token.chainId, networksInfo);
                  if (tokenChain && tokenChain.name !== chainName) {
                    setChainName(tokenChain.name);
                    chrome.storage.sync.set({ chainName: tokenChain.name });
                  }
                  setTransferToken(resolveSendEntryToken(token, networksInfo));
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
            {walletHomeMode === "private" && (
              <PrivatePortfolioHome
                accounts={accounts}
                modeToggle={walletModeToggle}
                onShield={() => openPrivacyAction("shield")}
                onUnshield={() => openPrivacyAction("unshield")}
                onDeposits={() => openPrivacyAction("status")}
                onTransactionClick={(tx) => {
                  setSelectedUnshieldOperation(null);
                  setSelectedCompletedTx(tx);
                  setView("txDetail");
                }}
                onUnshieldTransactionClick={(operation) => {
                  setSelectedCompletedTx(null);
                  setSelectedUnshieldOperation(operation);
                  setView("txDetail");
                }}
                activeTab={privateHomeTab} onTabChange={setPrivateHomeTab}
              />
            )}
            {reloadRequired && (
              <ReloadRequiredAlert
                onReload={async () => {
                  const tab = await currentTab();
                  const url = tab.url!;
                  chrome.tabs.create({ url });
                  chrome.tabs.remove(tab.id!);
                  setReloadRequired(false);
                }}
              />
            )}
          </VStack>
        </Container>

        {walletHomeMode === "public" && activeDappContext?.connected && (
          <HomeDappDock
            context={activeDappContext}
            selectedChain={selectedChain}
            visibleChains={visibleChains}
            chainBalances={homeChainBalances}
            hideBalances={homeChainBalancesHidden}
            onChainSelect={handleHomepageChainSelect}
            onDisconnect={async (origin) => {
              await sendMessageWithRetry({ type: "revokeDappPermission", origin });
              await loadActiveDappContext();
            }}
          />
        )}
      </Box>
    </Box>
  );
  })();

  return (
    <AppBootstrapTransition
      isLoading={false}
      showRequestSkeleton={isApprovalRequestLoading}
    >
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

    </AppBootstrapTransition>
  );
}

export default App;
