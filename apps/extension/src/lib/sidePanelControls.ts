type SidePanelCloseOptions = {
  windowId?: number;
  tabId?: number;
};

type SidePanelWithClose = typeof chrome.sidePanel & {
  close?: (options: SidePanelCloseOptions) => Promise<void>;
};

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
