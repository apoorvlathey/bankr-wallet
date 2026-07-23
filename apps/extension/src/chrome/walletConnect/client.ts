import { Core } from "@walletconnect/core";
import { WalletKit } from "@reown/walletkit";
import {
  WALLETCHAN_ICON_URL,
  WALLETCHAN_SITE_URL,
} from "@/constants/externalUrls";
import type { WalletConnectProposalRejection } from "@/types/walletConnect";
import { flushWalletConnectTerminalResponses } from "./outbox";
import {
  cancelPendingRequestsForWalletConnectTopic,
  finalizeWalletConnectTopicTermination,
} from "../requests/pendingWalletConnectLifecycle";
import { summarizeWalletConnectSession } from "./sessionPolicy";
import { handleWalletConnectSessionRequest } from "./requestRouter";
import { getWalletConnectActiveChainId } from "./chainState";
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
import { handleWalletConnectSessionProposal } from "./sessionProposal";

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

function createWalletConnectCore(storageNamespace?: string) {
  return new Core({
    projectId: PROJECT_ID,
    telemetryEnabled: false,
    ...(storageNamespace ? { customStoragePrefix: storageNamespace } : {}),
  });
}

export function getActiveWalletConnectSessionSummaries() {
  if (!walletKit) return [];
  const sessions = Object.values(walletKit.getActiveSessions() || {});
  return sessions
    .filter((session: any) => session?.controller === session?.self?.publicKey)
    .map(summarizeWalletConnectSession);
}

export async function broadcastWalletConnectSessionsChanged(): Promise<void> {
  const sessions = getActiveWalletConnectSessionSummaries();
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
    void handleWalletConnectSessionProposal(
      kit,
      value,
      broadcastWalletConnectSessionsChanged,
      broadcastProposalRejected,
    );
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
        await broadcastWalletConnectSessionsChanged();
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
    void broadcastWalletConnectSessionsChanged();
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

export async function ensureWalletKit(): Promise<WalletKitInstance> {
  if (walletKit) return walletKit;
  const initialized = await initWalletConnect();
  if (!initialized || !walletKit) {
    throw new Error(initError || "WalletConnect is not available");
  }
  return walletKit;
}

export function getWalletConnectInitError(): string | null {
  return initError;
}

export function hasWalletConnectProjectId(): boolean {
  return !!PROJECT_ID;
}
