type SidePanelCloseOptions = {
  windowId?: number;
  tabId?: number;
};

type SidePanelWithClose = typeof chrome.sidePanel & {
  close?: (options: SidePanelCloseOptions) => Promise<void>;
};

function sendRuntimeMessage<T>(message: unknown): Promise<T | undefined> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response: T | undefined) => {
      if (chrome.runtime.lastError) {
        resolve(undefined);
        return;
      }
      resolve(response);
    });
  });
}

export async function closeSidePanelForWindow(
  windowId: number | undefined,
): Promise<boolean> {
  if (windowId === undefined || typeof chrome === "undefined") {
    return false;
  }

  const sidePanel = chrome.sidePanel as SidePanelWithClose | undefined;
  if (typeof sidePanel?.close !== "function") {
    return false;
  }

  try {
    await sidePanel.close({ windowId });
    return true;
  } catch (error) {
    console.warn("Failed to close sidepanel:", error);
    return false;
  }
}

/**
 * Switches the extension back to popup mode and opens the popup immediately.
 * The service worker creates a detached popup before closing the sidepanel so
 * the sidepanel document can be destroyed without interrupting the switch.
 */
export async function switchSidePanelToPopup(): Promise<boolean> {
  const [activeTab] = await chrome.tabs.query({
    active: true,
    currentWindow: true,
  });
  const windowId = activeTab?.windowId;
  const result = await sendRuntimeMessage<{
    success?: boolean;
    panelClosed?: boolean;
  }>({
    type: "switchSidePanelToPopup",
    windowId,
  });

  if (result?.success && !result.panelClosed) {
    window.close();
  }
  return result?.success === true;
}
