import { isSidePanelSupported } from "./browserCapabilities";

export const FULLSCREEN_REQUEST_NOTIFICATION_PREFIX =
  "walletchan-fullscreen-request-";

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

export async function getProviderWindowState(
  sender: chrome.runtime.MessageSender,
): Promise<{ fullscreen: boolean }> {
  const windowId = sender.tab?.windowId;
  if (windowId === undefined) return { fullscreen: false };

  try {
    const window = await chrome.windows.get(windowId, { populate: false });
    return { fullscreen: window.state === "fullscreen" };
  } catch {
    return { fullscreen: false };
  }
}

/**
 * Must call sidePanel.open() before yielding from the runtime message event.
 * Chrome enforces that the call retains the originating content-script user
 * activation; even an otherwise harmless await can make it reject.
 */
export function openFullscreenRequestSidePanel(
  sender: chrome.runtime.MessageSender,
): void {
  const windowId = sender.tab?.windowId;
  if (windowId === undefined || !isSidePanelSupported()) return;
  if (!chrome.sidePanel?.open) return;

  void chrome.sidePanel.open({ windowId }).catch((error) => {
    console.warn("Failed to open fullscreen transaction sidepanel:", error);
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
      title: "Transaction approval required",
      message: "Click to review this request in the WalletChan side panel.",
      priority: 2,
    },
  );
}
