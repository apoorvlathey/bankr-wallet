import { Core } from "@walletconnect/core";
import { WalletKit } from "@reown/walletkit";
import { buildApprovedNamespaces } from "@walletconnect/utils";
import { WALLETCHAN_ICON_URL } from "@/constants/externalUrls";
import { getStoredNetworksInfo, getVisibleChains } from "@/lib/chains";
import type { WalletConnectProposalRejection } from "@/types/walletConnect";
import { getActiveAccount } from "./accountStorage";
import {
  getWalletConnectPendingRequest,
  removeWalletConnectPendingRequest,
} from "./walletConnectStorage";
import {
  WALLETCONNECT_SUPPORTED_EVENTS,
  WALLETCONNECT_SUPPORTED_METHODS,
  isSigningAccount,
  summarizeWalletConnectSession,
} from "./walletConnectHelpers";
import {
  buildProposalRejection,
  hasApprovedNamespaces,
  normalizeWalletConnectProposal,
  type WalletConnectSupportedNamespaces,
} from "./walletConnectProposal";
import { handleWalletConnectSessionRequest } from "./walletConnectRequestHandlers";
import {
  getWalletConnectActiveChainId,
  setWalletConnectActiveChainByName,
} from "./walletConnectChainState";
import {
  startWalletConnectKeepalive,
  stopWalletConnectKeepalive,
} from "./walletConnectKeepalive";

type WalletKitInstance = Awaited<ReturnType<typeof WalletKit.init>>;

const DEFAULT_PROJECT_ID = "56262dba600174595278ffdf73ceb06f";
const PROJECT_ID =
  import.meta.env.VITE_WALLETCONNECT_PROJECT_ID ||
  import.meta.env.VITE_WC_PROJECT_ID ||
  DEFAULT_PROJECT_ID;

let walletKit: WalletKitInstance | null = null;
let initPromise: Promise<WalletKitInstance | null> | null = null;
let initError: string | null = null;
let listenersAttached = false;

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

function attachWalletKitListeners(kit: WalletKitInstance): void {
  if (listenersAttached) return;
  listenersAttached = true;
  kit.on("session_proposal", (proposal: any) => {
    void handleSessionProposal(proposal);
  });
  kit.on("session_request", (request: any) => {
    void handleWalletConnectSessionRequest(kit, request);
  });
  kit.on("session_delete", () => {
    void broadcastSessionsChanged();
  });
}

export async function initWalletConnect(): Promise<boolean> {
  if (walletKit) return true;
  if (!PROJECT_ID) {
    initError = "WalletConnect project ID is not configured";
    return false;
  }
  if (!initPromise) {
    initPromise = (async () => {
      const core = new Core({ projectId: PROJECT_ID });
      const kit = await WalletKit.init({
        core,
        metadata: {
          name: "WalletChan",
          description: "WalletChan browser wallet extension",
          url: "https://walletchan.com",
          icons: [WALLETCHAN_ICON_URL],
        },
      });
      attachWalletKitListeners(kit);
      return kit;
    })();
  }

  try {
    walletKit = await initPromise;
    initError = null;
    void broadcastSessionsChanged();
    return true;
  } catch (error) {
    initError =
      error instanceof Error ? error.message : "Failed to initialize WalletConnect";
    walletKit = null;
    listenersAttached = false;
    stopWalletConnectKeepalive();
    return false;
  } finally {
    initPromise = null;
  }
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
    await kit.disconnectSession({
      topic,
      reason: { code: 6000, message: "User disconnected the session" },
    });
    void broadcastSessionsChanged();
    return { success: true };
  } catch (error) {
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

async function respondSessionRequest(
  topic: string,
  requestId: number,
  result: unknown,
): Promise<void> {
  const kit = await ensureWalletKit();
  await kit.respondSessionRequest({
    topic,
    response: { id: requestId, jsonrpc: "2.0", result },
  });
}

async function rejectSessionRequest(
  topic: string,
  requestId: number,
  code: number,
  message: string,
): Promise<void> {
  const kit = await ensureWalletKit();
  await kit.respondSessionRequest({
    topic,
    response: { id: requestId, jsonrpc: "2.0", error: { code, message } },
  });
}

export async function completeWalletConnectRequestIfNeeded(
  key: string,
  result: Record<string, unknown>,
): Promise<void> {
  const txPrefix = "txResult:";
  const sigPrefix = "sigResult:";
  const id = key.startsWith(txPrefix)
    ? key.slice(txPrefix.length)
    : key.startsWith(sigPrefix)
      ? key.slice(sigPrefix.length)
      : null;
  if (!id) return;

  const pending = await getWalletConnectPendingRequest(id);
  if (!pending) return;

  try {
    const payload =
      pending.kind === "transaction" ? result.txHash : result.signature;
    if (result.success === true && typeof payload === "string") {
      await respondSessionRequest(pending.topic, pending.requestId, payload);
    } else {
      const error =
        typeof result.error === "string" ? result.error : "Request failed";
      await rejectSessionRequest(
        pending.topic,
        pending.requestId,
        /reject|cancel/i.test(error) ? 4001 : -32000,
        error,
      );
    }
  } catch (error) {
    console.warn("[WalletConnect] Failed to respond to session request", error);
  } finally {
    await removeWalletConnectPendingRequest(id);
  }
}
