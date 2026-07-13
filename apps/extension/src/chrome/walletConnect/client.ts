import { Core } from "@walletconnect/core";
import { WalletKit } from "@reown/walletkit";
import { buildApprovedNamespaces } from "@walletconnect/utils";
import {
  WALLETCHAN_ICON_URL,
  WALLETCHAN_SITE_URL,
} from "@/constants/externalUrls";
import { getStoredNetworksInfo, getVisibleChains } from "@/lib/chains";
import type { WalletConnectProposalRejection } from "@/types/walletConnect";
import { getActiveAccount } from "../accountStorage";
import {
  getWalletConnectPendingRequest,
} from "./storage";
import {
  rejectSessionRequest as rejectRoutedSessionRequest,
  respondSessionRequest as respondRoutedSessionRequest,
} from "./protocol";
import { flushWalletConnectTerminalResponses } from "./outbox";
import {
  cancelPendingRequestsForWalletConnectTopic,
  finalizeWalletConnectTopicTermination,
  resumeWalletConnectTopicAfterFailedTermination,
} from "../pendingWalletConnectLifecycle";
import {
  WALLETCONNECT_SUPPORTED_EVENTS,
  WALLETCONNECT_SUPPORTED_METHODS,
  isSigningAccount,
  summarizeWalletConnectSession,
} from "./sessionPolicy";
import {
  buildProposalRejection,
  hasApprovedNamespaces,
  normalizeWalletConnectProposal,
  type WalletConnectSupportedNamespaces,
} from "./proposal";
import { handleWalletConnectSessionRequest } from "./requestRouter";
import {
  getWalletConnectActiveChainId,
  setWalletConnectActiveChainByName,
} from "./chainState";
import {
  startWalletConnectKeepalive,
  stopWalletConnectKeepalive,
} from "./keepalive";
import {
  WALLETCONNECT_STORAGE_NAMESPACE_KEY,
  createWalletConnectStorageNamespace,
  parseWalletConnectStorageNamespace,
  teardownWalletConnectSdkState,
  type WalletConnectResetSummary,
} from "./reset";

type WalletKitInstance = Awaited<ReturnType<typeof WalletKit.init>>;

const DEFAULT_PROJECT_ID = "56262dba600174595278ffdf73ceb06f";
const PROJECT_ID =
  import.meta.env.VITE_WALLETCONNECT_PROJECT_ID ||
  import.meta.env.VITE_WC_PROJECT_ID ||
  DEFAULT_PROJECT_ID;

let walletKit: WalletKitInstance | null = null;
let initPromise: Promise<WalletKitInstance | null> | null = null;
let initError: string | null = null;
let walletConnectGeneration = 0;
let walletConnectResetPromise: Promise<WalletConnectResetSummary> | null = null;
let listenerRegistration:
  | {
      kit: WalletKitInstance;
      proposal: (proposal: any) => void;
      request: (request: any) => void;
      deleted: (event: any) => void;
    }
  | undefined;

async function getWalletConnectStorageNamespace(): Promise<
  string | undefined
> {
  const stored = await chrome.storage.local.get(
    WALLETCONNECT_STORAGE_NAMESPACE_KEY,
  );
  const parsed = parseWalletConnectStorageNamespace(
    stored[WALLETCONNECT_STORAGE_NAMESPACE_KEY],
  );
  if (parsed === null) {
    // Never fall back to the legacy identity when a reset epoch is present but
    // malformed. A full reset can safely rotate and repair this value.
    throw new Error("WalletConnect storage namespace is invalid");
  }
  return parsed;
}

function createWalletConnectCore(storageNamespace?: string): Core {
  return new Core({
    projectId: PROJECT_ID,
    ...(storageNamespace ? { customStoragePrefix: storageNamespace } : {}),
  });
}

function getActiveSessionSummaries() {
  if (!walletKit) return [];
  const sessions = Object.values(walletKit.getActiveSessions() || {});
  return sessions
    .filter((session: any) => session?.controller === session?.self?.publicKey)
    .map(summarizeWalletConnectSession);
}

async function broadcastSessionsChanged(): Promise<void> {
  const sessions = getActiveSessionSummaries();
  if (sessions.length > 0) {
    startWalletConnectKeepalive(() => walletKit);
  } else {
    stopWalletConnectKeepalive();
  }

  const activeChainId = await getWalletConnectActiveChainId();
  chrome.runtime
    .sendMessage({
      type: "walletConnectSessionsChanged",
      sessions,
      activeChainId,
    })
    .catch(() => {});
}

function broadcastProposalRejected(
  rejection: WalletConnectProposalRejection,
): void {
  chrome.runtime
    .sendMessage({
      type: "walletConnectProposalRejected",
      rejection,
    })
    .catch(() => {});
}

function detachWalletKitListeners(): void {
  if (!listenerRegistration) return;
  const current = listenerRegistration;
  current.kit.off("session_proposal", current.proposal);
  current.kit.off("session_request", current.request);
  current.kit.off("session_delete", current.deleted);
  listenerRegistration = undefined;
}

function attachWalletKitListeners(
  kit: WalletKitInstance,
  generation: number,
): void {
  if (listenerRegistration?.kit === kit) return;
  detachWalletKitListeners();

  const proposal = (value: any) => {
    if (generation !== walletConnectGeneration) return;
    void handleSessionProposal(value);
  };
  const request = (value: any) => {
    if (generation !== walletConnectGeneration) return;
    void handleWalletConnectSessionRequest(kit, value);
  };
  const deleted = (value: any) => {
    if (generation !== walletConnectGeneration) return;
    const topic = typeof value?.topic === "string" ? value.topic : "";
    void (async () => {
      try {
        if (topic) {
          await cancelPendingRequestsForWalletConnectTopic(topic);
          await finalizeWalletConnectTopicTermination(topic);
        }
      } catch (error) {
        console.warn(
          "[WalletConnect] Failed to clean up deleted-session requests",
          error,
        );
      } finally {
        await broadcastSessionsChanged();
      }
    })();
  };
  listenerRegistration = { kit, proposal, request, deleted };
  kit.on("session_proposal", proposal);
  kit.on("session_request", request);
  kit.on("session_delete", deleted);
}

export async function resetWalletConnectForWalletReset(): Promise<
  WalletConnectResetSummary
> {
  if (walletConnectResetPromise) return walletConnectResetPromise;

  const operation = (async () => {
    walletConnectGeneration += 1;
    stopWalletConnectKeepalive();

    const currentKit = walletKit;
    detachWalletKitListeners();
    walletKit = null;
    initPromise = null;
    initError = null;

    let currentNamespace: string | undefined;
    try {
      currentNamespace = await getWalletConnectStorageNamespace();
    } catch {
      // SDK storage uses one dedicated IndexedDB. An un-prefixed Core still
      // gives reset access to purge it when the epoch marker is corrupted.
      currentNamespace = undefined;
    }
    const currentCore =
      currentKit?.core || createWalletConnectCore(currentNamespace);

    const summary = await teardownWalletConnectSdkState(
      currentCore,
      currentKit,
    );

    // Persist the cutover before background.ts is allowed to wipe wallet
    // secrets. Cleanup failures remain safe because the old namespace is never
    // selected again; a failed namespace write aborts the wallet reset.
    const replacementNamespace = createWalletConnectStorageNamespace();
    await chrome.storage.local.set({
      [WALLETCONNECT_STORAGE_NAMESPACE_KEY]: replacementNamespace,
    });
    if (summary.warnings.length > 0) {
      console.warn(
        `[WalletConnect] Reset completed with ${summary.warnings.length} best-effort cleanup warning(s)`,
      );
    }
    return summary;
  })();

  walletConnectResetPromise = operation;
  try {
    return await operation;
  } finally {
    if (walletConnectResetPromise === operation) {
      walletConnectResetPromise = null;
    }
  }
}

export async function initWalletConnect(): Promise<boolean> {
  if (walletConnectResetPromise) await walletConnectResetPromise;
  if (walletKit) {
    void flushWalletConnectTerminalResponses(walletKit);
    return true;
  }
  if (!PROJECT_ID) {
    initError = "WalletConnect project ID is not configured";
    return false;
  }

  const generation = walletConnectGeneration;
  let pendingInit = initPromise;
  if (!pendingInit) {
    pendingInit = (async () => {
      const storageNamespace = await getWalletConnectStorageNamespace();
      if (generation !== walletConnectGeneration) return null;
      const core = createWalletConnectCore(storageNamespace);
      const kit = await WalletKit.init({
        core,
        metadata: {
          name: "WalletChan",
          description: "WalletChan browser wallet extension",
          url: WALLETCHAN_SITE_URL,
          icons: [WALLETCHAN_ICON_URL],
        },
      });
      if (generation === walletConnectGeneration) {
        attachWalletKitListeners(kit, generation);
      }
      return kit;
    })();
    initPromise = pendingInit;
  }

  try {
    const initializedKit = await pendingInit;
    if (!initializedKit) return false;
    if (generation !== walletConnectGeneration) {
      // A reset won the race. Retire this old-namespace client without touching
      // the freshly rotated namespace's shared IndexedDB entries.
      await teardownWalletConnectSdkState(
        initializedKit.core,
        initializedKit,
        { purgeStorage: false },
      );
      return false;
    }
    walletKit = initializedKit;
    initError = null;
    void flushWalletConnectTerminalResponses(initializedKit);
    void broadcastSessionsChanged();
    return true;
  } catch (error) {
    if (generation === walletConnectGeneration) {
      initError =
        error instanceof Error
          ? error.message
          : "Failed to initialize WalletConnect";
      walletKit = null;
      detachWalletKitListeners();
      stopWalletConnectKeepalive();
    }
    return false;
  } finally {
    if (initPromise === pendingInit) initPromise = null;
  }
}

export async function isWalletConnectSessionActive(
  topic: string,
): Promise<boolean> {
  if (!topic) return false;
  const kit = walletKit ?? ((await initWalletConnect()) ? walletKit : null);
  return !!kit?.getActiveSessions()?.[topic];
}

async function ensureWalletKit(): Promise<WalletKitInstance> {
  if (walletKit) return walletKit;
  const initialized = await initWalletConnect();
  if (!initialized || !walletKit) {
    throw new Error(initError || "WalletConnect is not available");
  }
  return walletKit;
}

export async function handleWalletConnectGetSessions() {
  const initialized = await initWalletConnect();
  return {
    success: initialized,
    sessions: getActiveSessionSummaries(),
    activeChainId: await getWalletConnectActiveChainId(),
    error: initialized ? undefined : initError || "WalletConnect is not available",
    missingProjectId: !PROJECT_ID,
  };
}

export async function handleWalletConnectPair(uri: string) {
  const trimmed = uri.trim();
  if (!trimmed.startsWith("wc:")) {
    return { success: false, error: "Enter a valid WalletConnect URI" };
  }
  try {
    const kit = await ensureWalletKit();
    await kit.core.pairing.pair({ uri: trimmed });
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to connect dapp",
    };
  }
}

export async function handleWalletConnectDisconnectSession(topic: string) {
  try {
    const kit = await ensureWalletKit();
    await cancelPendingRequestsForWalletConnectTopic(topic);
    await kit.disconnectSession({
      topic,
      reason: { code: 6000, message: "User disconnected the session" },
    });
    try {
      await finalizeWalletConnectTopicTermination(topic);
    } catch (error) {
      // The SDK already confirmed termination. Keep the synchronous topic gate
      // closed; normal outbox/session cleanup can retry the storage removal.
      console.warn(
        "[WalletConnect] Session disconnected; pending-route cleanup deferred",
        error,
      );
    }
    void broadcastSessionsChanged();
    return { success: true };
  } catch (error) {
    resumeWalletConnectTopicAfterFailedTermination(topic);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to disconnect dapp",
    };
  }
}

export async function handleWalletConnectSwitchChain(chainName: string) {
  try {
    const kit = await ensureWalletKit();
    const chain = await setWalletConnectActiveChainByName(kit, chainName);
    return { success: true, chainId: chain.chainId, chainName: chain.name };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to switch chain",
    };
  }
}

async function handleSessionProposal(proposal: any): Promise<void> {
  const kit = await ensureWalletKit();
  const account = await getActiveAccount();
  if (!isSigningAccount(account)) {
    await kit.rejectSession({
      id: proposal.id,
      reason: { code: 4001, message: "No signing account is active" },
    });
    return;
  }

  try {
    const networksInfo = await getStoredNetworksInfo();
    const visibleChains = getVisibleChains(networksInfo, account.type);
    const chains = visibleChains.map(
      (chain) => `eip155:${chain.chainId}`,
    );
    const accounts = chains.map((chain) => `${chain}:${account.address}`);
    const supportedNamespaces: WalletConnectSupportedNamespaces = {
      eip155: {
        chains,
        accounts,
        methods: WALLETCONNECT_SUPPORTED_METHODS,
        events: WALLETCONNECT_SUPPORTED_EVENTS,
      },
    };
    const namespaces = buildApprovedNamespaces({
      proposal: normalizeWalletConnectProposal(
        proposal.params,
        supportedNamespaces,
      ),
      supportedNamespaces,
    });
    if (!hasApprovedNamespaces(namespaces)) {
      throw new Error(
        "No supported WalletConnect chains or methods matched this dapp",
      );
    }

    await kit.approveSession({ id: proposal.id, namespaces });
    void broadcastSessionsChanged();
  } catch (error) {
    const rejection = await buildProposalRejection(
      proposal,
      account.type,
      error,
    );
    broadcastProposalRejected(rejection);
    await kit.rejectSession({
      id: proposal.id,
      reason: {
        code: 5000,
        message: rejection.error,
      },
    });
  }
}

export async function completeWalletConnectRequestIfNeeded(
  key: string,
  result: Record<string, unknown>,
): Promise<void> {
  const txPrefix = "txResult:";
  const sigPrefix = "sigResult:";
  const erc7715Prefix = "erc7715PermissionResult:";
  const id = key.startsWith(txPrefix)
    ? key.slice(txPrefix.length)
    : key.startsWith(sigPrefix)
      ? key.slice(sigPrefix.length)
      : key.startsWith(erc7715Prefix)
        ? key.slice(erc7715Prefix.length)
        : null;
  if (!id) return;

  const pending = await getWalletConnectPendingRequest(id);
  if (!pending) return;

  try {
    const kit = await ensureWalletKit();
    const args = { topic: pending.topic, id: pending.requestId };
    const payload =
      pending.kind === "transaction"
        ? result.txHash
        : pending.kind === "signature"
          ? result.signature
          : result.result;
    if (
      result.success === true &&
      (typeof payload === "string" || Array.isArray(payload))
    ) {
      await respondRoutedSessionRequest(kit, args, payload);
    } else {
      const error =
        typeof result.error === "string" ? result.error : "Request failed";
      await rejectRoutedSessionRequest(
        kit,
        args,
        /reject|cancel/i.test(error) ? 4001 : -32000,
        error,
      );
    }
  } catch (error) {
    // The protocol layer stored the first terminal response before attempting
    // relay delivery. Keep the route/outbox so init, reconnect, or a duplicate
    // relay event can replay it without another signature/broadcast.
    console.warn(
      "[WalletConnect] Response delivery deferred; terminal outbox retained",
      error,
    );
  }
}
