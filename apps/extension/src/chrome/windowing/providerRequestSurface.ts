import { isSidePanelSupported } from "./browserCapabilities";

export const FULLSCREEN_REQUEST_NOTIFICATION_PREFIX =
  "walletchan-fullscreen-request-";

export type ProviderRequestSurfaceType =
  | "i_sendTransaction"
  | "i_signatureRequest"
  | "i_walletSendCalls"
  | "i_walletExecutionPermissions";

export type ProviderRequestSurfaceHint = {
  requestType: ProviderRequestSurfaceType;
  createdAt: number;
};

const PROVIDER_REQUEST_SURFACE_HINT_TTL_MS = 10_000;
const providerRequestSurfaceHints = new Map<
  number,
  ProviderRequestSurfaceHint
>();

export function recordProviderRequestSurfaceHint(
  windowId: number,
  requestType: ProviderRequestSurfaceType,
  now = Date.now(),
): void {
  providerRequestSurfaceHints.set(windowId, { requestType, createdAt: now });
}

export function takeProviderRequestSurfaceHint(
  windowId: number,
  now = Date.now(),
): ProviderRequestSurfaceHint | null {
  const hint = providerRequestSurfaceHints.get(windowId) ?? null;
  providerRequestSurfaceHints.delete(windowId);
  if (!hint || now - hint.createdAt > PROVIDER_REQUEST_SURFACE_HINT_TTL_MS) {
    return null;
  }
  return hint;
}

export function clearProviderRequestSurfaceHint(
  windowId: number | undefined,
): void {
  if (windowId !== undefined) providerRequestSurfaceHints.delete(windowId);
}

export function fullscreenRequestNotificationWindowId(
  notificationId: string,
): number | null {
  if (!notificationId.startsWith(FULLSCREEN_REQUEST_NOTIFICATION_PREFIX)) {
    return null;
  }
  const windowId = Number(
    notificationId.slice(FULLSCREEN_REQUEST_NOTIFICATION_PREFIX.length),
  );
  return Number.isSafeInteger(windowId) && windowId >= 0 ? windowId : null;
}

/**
 * Must call sidePanel.open() before yielding from the runtime message event.
 * Chrome enforces that the call retains the originating content-script user
 * activation; even an otherwise harmless await can make it reject.
 */
export function openProviderRequestSidePanel(
  sender: chrome.runtime.MessageSender,
  requestType: ProviderRequestSurfaceType,
): void {
  const windowId = sender.tab?.windowId;
  if (windowId === undefined || !isSidePanelSupported()) return;
  if (!chrome.sidePanel?.open) return;

  recordProviderRequestSurfaceHint(windowId, requestType);
  void chrome.sidePanel.open({ windowId }).catch((error) => {
    console.warn("Failed to open provider-request sidepanel:", error);
  });
}

export async function showFullscreenRequestNotification(
  targetWindow: chrome.windows.Window | null,
): Promise<void> {
  const windowId = targetWindow?.id;
  if (windowId === undefined) return;
  await chrome.notifications.create(
    `${FULLSCREEN_REQUEST_NOTIFICATION_PREFIX}${windowId}`,
    {
      type: "basic",
      iconUrl: chrome.runtime.getURL("icons/icon128.png"),
      title: "Wallet approval required",
      message: "Click to review this request in the WalletChan side panel.",
      priority: 2,
    },
  );
}
