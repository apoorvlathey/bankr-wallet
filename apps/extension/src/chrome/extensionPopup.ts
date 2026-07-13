import {
  getSidePanelMode,
  isSidePanelSupported,
  isSidePanelSupportedAsync,
} from "./sidepanelManager";

type RequestWindowState = chrome.windows.Window["state"];

/**
 * Fullscreen browser windows cannot present a normal extension popup without
 * macOS moving the user into a separate fullscreen window. Prefer the side
 * panel in that case even when the user normally uses popup mode.
 */
export function shouldUseSidePanelForRequest(
  preferenceEnabled: boolean,
  sidePanelSupported: boolean,
  windowState: RequestWindowState,
): boolean {
  return sidePanelSupported && (preferenceEnabled || windowState === "fullscreen");
}

async function getRequestWindow(
  senderWindowId?: number,
): Promise<chrome.windows.Window | null> {
  if (senderWindowId !== undefined) {
    try {
      return await chrome.windows.get(senderWindowId, { populate: false });
    } catch {
      // The sender window may have closed; fall through to the focused window.
    }
  }

  try {
    return await chrome.windows.getLastFocused({ populate: false });
  } catch {
    return null;
  }
}

/** Opens the configured confirmation surface, with popup fallback. */
export async function openExtensionPopup(
  senderWindowId?: number,
): Promise<void> {
  const targetWindow = await getRequestWindow(senderWindowId);
  const [sidePanelMode, sidePanelSupported] = await Promise.all([
    getSidePanelMode(),
    isSidePanelSupportedAsync(),
  ]);
  const fullscreenOverride =
    sidePanelSupported && targetWindow?.state === "fullscreen";
  const useSidePanel = shouldUseSidePanelForRequest(
    sidePanelMode,
    sidePanelSupported,
    targetWindow?.state,
  );

  if (useSidePanel && isSidePanelSupported()) {
    if (!fullscreenOverride) {
      try {
        const response = await chrome.runtime
          .sendMessage({ type: "ping" })
          .catch(() => null);
        if (response === "pong") return;
      } catch {
        // No extension view responded; continue opening one.
      }
    }

    try {
      if (!chrome.sidePanel?.open) {
        throw new Error("sidePanel API unavailable");
      }
      const windowId = targetWindow?.id;
      if (windowId) {
        await chrome.sidePanel.open({ windowId });

        // Arc can resolve sidePanel.open without actually opening a panel.
        await new Promise((resolve) => setTimeout(resolve, 600));
        let opened = false;
        if (chrome.runtime.getContexts) {
          const contexts = await chrome.runtime.getContexts({
            contextTypes: ["SIDE_PANEL" as chrome.runtime.ContextType],
          });
          opened = contexts.length > 0;
        } else {
          const pong = await chrome.runtime
            .sendMessage({ type: "ping" })
            .catch(() => null);
          opened = pong === "pong";
        }

        if (opened) return;
      }
    } catch (error) {
      console.warn(
        "Sidepanel failed to open for tx confirmation, falling back to popup:",
        error,
      );
    }
  }

  const existingWindows = await chrome.windows.getAll({
    windowTypes: ["popup"],
  });
  const popupUrl = chrome.runtime.getURL("index.html");

  for (const win of existingWindows) {
    if (win.id) {
      const tabs = await chrome.tabs.query({ windowId: win.id });
      if (tabs.some((tab) => tab.url?.startsWith(popupUrl))) {
        await chrome.windows.update(win.id, { focused: true });
        return;
      }
    }
  }

  await createPopupWindow(popupUrl, targetWindow);
}

/** Opens a popup explicitly when switching away from side-panel mode. */
export async function openPopupWindow(): Promise<void> {
  const popupUrl = chrome.runtime.getURL("index.html");

  const existingWindows = await chrome.windows.getAll({
    windowTypes: ["popup"],
  });
  for (const win of existingWindows) {
    if (win.id) {
      const tabs = await chrome.tabs.query({ windowId: win.id });
      if (tabs.some((tab) => tab.url?.startsWith(popupUrl))) {
        await chrome.windows.update(win.id, { focused: true });
        return;
      }
    }
  }

  let targetWindow: chrome.windows.Window | null = null;
  try {
    targetWindow = await chrome.windows.getLastFocused({ populate: false });
  } catch {
    targetWindow = null;
  }

  await createPopupWindow(popupUrl, targetWindow);
}

async function createPopupWindow(
  popupUrl: string,
  targetWindow: chrome.windows.Window | null,
): Promise<void> {
  const popupWidth = 360;
  const popupHeight = 680;

  let left: number | undefined;
  let top: number | undefined;
  if (
    targetWindow &&
    targetWindow.left !== undefined &&
    targetWindow.width !== undefined &&
    targetWindow.top !== undefined
  ) {
    left = targetWindow.left + targetWindow.width - popupWidth - 10;
    top = targetWindow.top + 80;
  }

  const createOptions: chrome.windows.CreateData = {
    url: popupUrl,
    type: "popup",
    width: popupWidth,
    height: popupHeight,
    focused: true,
  };

  if (left !== undefined && top !== undefined) {
    createOptions.left = left;
    createOptions.top = top;
  }

  await chrome.windows.create(createOptions);
}
