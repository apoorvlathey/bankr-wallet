import {
  clearTabAccount,
  getActiveAccount,
  getTabAccount,
} from "./accountStorage";
import {
  DAPP_CONNECTION_REQUEST_EXPIRY_MS,
  DAPP_CONNECTION_TIMEOUT_ERROR,
  getDappPermission,
  getDappPermissions,
  getPendingDappConnectionRequests,
  grantDappPermission,
  normalizeDappOrigin,
  removePendingDappConnectionRequests,
  revokeDappPermission,
  savePendingDappConnectionRequest,
  touchDappPermission,
  type PendingDappConnectionRequest,
} from "./dappPermissionStorage";
import {
  openExtensionPopup,
  writeResultToStorage,
} from "./txHandlers";
import { tabHasDappAccountScope } from "./dappAccountScope";
import { cancelPendingRequestsForDappOrigin } from "./pendingDappRequestLifecycle";
import {
  beginDappOriginRevocation,
  finishDappOriginRevocation,
} from "./pendingRequestLifecycle";
import { withDappAccountBinding } from "./accountRemovalDappPrivacy";

function trustedOrigin(sender: chrome.runtime.MessageSender): string | null {
  return normalizeDappOrigin(sender.origin || sender.url || sender.tab?.url);
}

function safeTitle(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const title = value.trim().slice(0, 120);
  return title || undefined;
}

function safeFavicon(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 16_384) return null;
  if (/^https?:\/\//i.test(value)) return value;
  if (/^data:image\/(?:png|gif|webp|jpeg);base64,/i.test(value)) return value;
  return null;
}

async function accountForTab(tabId?: number) {
  return typeof tabId === "number"
    ? await getTabAccount(tabId)
    : await getActiveAccount();
}

async function writeConnectionResult(
  request: PendingDappConnectionRequest,
  result: {
    success: boolean;
    accounts?: string[];
    error?: string;
    code?: number;
  },
) {
  await writeResultToStorage(`dappConnectionResult:${request.id}`, result);
}

function broadcastPermissionsChanged(origin?: string) {
  chrome.runtime
    .sendMessage({ type: "dappPermissionsChanged", origin })
    .catch(() => {});
}

export async function handleGetDappAccounts(
  sender: chrome.runtime.MessageSender,
) {
  if (sender.frameId !== undefined && sender.frameId !== 0) {
    return { success: true, accounts: [] as string[] };
  }
  const origin = trustedOrigin(sender);
  if (!origin || !(await getDappPermission(origin))) {
    return { success: true, accounts: [] as string[] };
  }
  const account = await accountForTab(sender.tab?.id);
  return { success: true, accounts: account ? [account.address] : [] };
}

export async function handleRequestDappConnection(
  message: {
    requestId?: unknown;
    title?: unknown;
    favicon?: unknown;
  },
  sender: chrome.runtime.MessageSender,
) {
  const requestId =
    typeof message.requestId === "string" ? message.requestId : "";
  const origin = trustedOrigin(sender);

  if (!requestId || !origin) return;
  if (sender.frameId !== undefined && sender.frameId !== 0) {
    await writeResultToStorage(`dappConnectionResult:${requestId}`, {
      success: false,
      error: "Connect WalletChan from the top-level site",
      code: 4100,
    });
    return;
  }

  const account = await accountForTab(sender.tab?.id);
  if (!account) {
    await writeResultToStorage(`dappConnectionResult:${requestId}`, {
      success: false,
      error: "No active account",
      code: 4100,
    });
    return;
  }

  const title = safeTitle(message.title);
  const favicon = safeFavicon(message.favicon);
  if (await getDappPermission(origin)) {
    await touchDappPermission(origin, { title, favicon });
    await writeResultToStorage(`dappConnectionResult:${requestId}`, {
      success: true,
      accounts: [account.address],
    });
    broadcastPermissionsChanged(origin);
    return;
  }

  const existing = (await getPendingDappConnectionRequests()).find(
    (request) => request.origin === origin && request.tabId === sender.tab?.id,
  );
  if (existing) {
    await writeResultToStorage(`dappConnectionResult:${requestId}`, {
      success: false,
      error: "A connection request is already pending for this site",
      code: -32002,
    });
    return;
  }

  const request: PendingDappConnectionRequest = {
    id: requestId,
    origin,
    hostname: new URL(origin).hostname,
    title,
    favicon,
    tabId: sender.tab?.id,
    frameId: sender.frameId,
    timestamp: Date.now(),
  };
  await savePendingDappConnectionRequest(request);
  chrome.runtime
    .sendMessage({ type: "newPendingDappConnectionRequest", request })
    .catch(() => {});
  await openExtensionPopup(sender.tab?.windowId);
}

async function confirmDappConnectionUnderBindingLock(requestId: string) {
  const pending = (await getPendingDappConnectionRequests()).find(
    (request) => request.id === requestId,
  );
  if (!pending) {
    return { success: false, error: "Connection request not found" };
  }
  if (
    Date.now() - pending.timestamp >= DAPP_CONNECTION_REQUEST_EXPIRY_MS
  ) {
    await removePendingDappConnectionRequests(
      (request) => request.id === pending.id,
    );
    await writeConnectionResult(pending, {
      success: false,
      error: DAPP_CONNECTION_TIMEOUT_ERROR,
      code: -32000,
    });
    return { success: false, error: DAPP_CONNECTION_TIMEOUT_ERROR };
  }

  const requestTab =
    typeof pending.tabId === "number"
      ? await chrome.tabs.get(pending.tabId).catch(() => null)
      : null;
  if (
    !requestTab ||
    normalizeDappOrigin(requestTab.url) !== pending.origin ||
    (pending.frameId !== undefined && pending.frameId !== 0)
  ) {
    await removePendingDappConnectionRequests(
      (request) => request.id === pending.id,
    );
    await writeConnectionResult(pending, {
      success: false,
      error: "Connection request is no longer active",
      code: 4100,
    });
    return { success: false, error: "Connection request is no longer active" };
  }

  const account = await accountForTab(pending.tabId);
  if (!account) {
    await removePendingDappConnectionRequests(
      (request) => request.origin === pending.origin,
    );
    await writeConnectionResult(pending, {
      success: false,
      error: "No active account",
      code: 4100,
    });
    return { success: false, error: "No active account" };
  }

  await grantDappPermission(pending);
  const matching = await removePendingDappConnectionRequests(
    (request) => request.origin === pending.origin,
  );
  await Promise.all(
    matching.map(async (request) => {
      const requestAccount = await accountForTab(request.tabId);
      await writeConnectionResult(request, {
        success: true,
        accounts: requestAccount ? [requestAccount.address] : [account.address],
      });
    }),
  );
  broadcastPermissionsChanged(pending.origin);
  return { success: true };
}

export async function handleConfirmDappConnection(requestId: string) {
  return withDappAccountBinding(() =>
    confirmDappConnectionUnderBindingLock(requestId),
  );
}

export async function handleRejectDappConnection(requestId: string) {
  const removed = await removePendingDappConnectionRequests(
    (request) => request.id === requestId,
  );
  if (removed.length === 0) {
    return { success: false, error: "Connection request not found" };
  }
  await Promise.all(
    removed.map((request) =>
      writeConnectionResult(request, {
        success: false,
        error: "User rejected the connection request",
        code: 4001,
      }),
    ),
  );
  await Promise.all(
    removed.map(async (request) => {
      if (
        typeof request.tabId === "number" &&
        !(await tabHasDappAccountScope(request.tabId))
      ) {
        await clearTabAccount(request.tabId);
      }
    }),
  );
  return { success: true };
}

export async function handleRevokeDappPermission(origin: string) {
  const normalizedOrigin = beginDappOriginRevocation(origin);
  let revoked = false;
  try {
    revoked = normalizedOrigin
      ? await revokeDappPermission(normalizedOrigin)
      : false;
    if (normalizedOrigin) {
      // Deleting visibility alone is insufficient: confirmations already open
      // in another surface must not remain signable under the old grant.
      await cancelPendingRequestsForDappOrigin(normalizedOrigin);
    }
  } finally {
    if (normalizedOrigin) finishDappOriginRevocation(normalizedOrigin);
  }
  if (revoked) {
    const tabs = await chrome.tabs.query({});
    await Promise.all(
      tabs.map(async (tab) => {
        if (!tab.id || normalizeDappOrigin(tab.url) !== normalizedOrigin) {
          return;
        }
        await clearTabAccount(tab.id);
        await chrome.tabs
          .sendMessage(tab.id, { type: "dappPermissionRevoked" })
          .catch(() => {});
      }),
    );
    broadcastPermissionsChanged(normalizedOrigin || undefined);
  }
  return { success: true, revoked };
}

export async function handleGetDappConnectionContext(tabId: number) {
  if (!Number.isInteger(tabId) || tabId < 0) {
    return { success: false, error: "A valid tab id is required" };
  }
  const tab = await chrome.tabs.get(tabId).catch(() => null);
  const origin = normalizeDappOrigin(tab?.url);
  if (!tab || !origin) {
    return {
      success: true,
      context: {
        tabId,
        origin: null,
        hostname: "No active site",
        title: undefined,
        favicon: null,
        connected: false,
      },
    };
  }
  const permission = await getDappPermission(origin);
  return {
    success: true,
    context: {
      tabId,
      origin,
      hostname: new URL(origin).hostname,
      title: permission?.title || safeTitle(tab.title),
      favicon: permission?.favicon || safeFavicon(tab.favIconUrl),
      connected: !!permission,
    },
  };
}

export { getDappPermissions, getPendingDappConnectionRequests };
