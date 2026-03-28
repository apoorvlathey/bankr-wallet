/**
 * Side panel management utilities
 * Handles browser detection, sidepanel API support, and mode toggling
 *
 * KEY DESIGN: We never use openPanelOnActionClick (it suppresses the popup completely).
 * Instead, we control behavior via chrome.action.setPopup():
 * - Popup mode: setPopup({ popup: 'popup-init.html' }) → native popup opens
 * - Sidepanel mode: setPopup({ popup: '' }) → action.onClicked fires → sidePanel.open() with fallback
 */

/**
 * Checks if the browser exposes the sidePanel API (synchronous, for service worker context).
 * Arc detection is handled separately via the isArcBrowser storage flag set by UI context.
 */
export function isSidePanelSupported(): boolean {
  try {
    return (
      typeof chrome !== "undefined" &&
      typeof chrome.sidePanel !== "undefined" &&
      chrome.sidePanel !== null &&
      typeof chrome.sidePanel.setPanelBehavior === "function"
    );
  } catch {
    return false;
  }
}

/**
 * Async version that also checks the stored Arc browser flag.
 * Use this from message handlers that need to account for Arc detection from UI context.
 */
export async function isSidePanelSupportedAsync(): Promise<boolean> {
  if (!isSidePanelSupported()) {
    return false;
  }
  const { isArcBrowser: storedIsArc } = await chrome.storage.sync.get(["isArcBrowser"]);
  return !storedIsArc;
}

/**
 * Gets the current sidepanel mode setting
 */
export async function getSidePanelMode(): Promise<boolean> {
  if (!isSidePanelSupported()) {
    return false;
  }
  const { isArcBrowser: storedIsArc, sidePanelMode } = await chrome.storage.sync.get([
    "isArcBrowser",
    "sidePanelMode",
  ]);
  if (storedIsArc) {
    return false;
  }
  // Default to true (sidepanel mode) if supported and not explicitly set to false
  return sidePanelMode !== false;
}

/**
 * Sets the sidepanel mode setting
 * Uses chrome.action.setPopup to control behavior:
 * - Sidepanel mode: popup = '' (action.onClicked fires, which calls sidePanel.open)
 * - Popup mode: popup = 'popup-init.html' (native popup opens)
 * Returns false if sidepanel mode cannot be enabled
 */
export async function setSidePanelMode(enabled: boolean): Promise<boolean> {
  // Check Arc browser flag - sidepanel is broken there
  const { isArcBrowser: storedIsArc } = await chrome.storage.sync.get(["isArcBrowser"]);
  if (storedIsArc && enabled) {
    return false;
  }

  if (!isSidePanelSupported()) {
    if (enabled) {
      return false;
    }
    await chrome.storage.sync.set({ sidePanelMode: false });
    await chrome.action.setPopup({ popup: "popup-init.html" });
    return true;
  }

  try {
    if (enabled) {
      // Clear popup so action.onClicked fires → sidePanel.open() in background.ts
      await chrome.action.setPopup({ popup: "" });
      await chrome.storage.sync.set({ sidePanelMode: true });
      return true;
    } else {
      // Restore native popup
      await chrome.action.setPopup({ popup: "popup-init.html" });
      await chrome.storage.sync.set({ sidePanelMode: false });
      return true;
    }
  } catch (error) {
    console.warn("Failed to set sidepanel mode:", error);
    await chrome.storage.sync.set({ sidePanelMode: false });
    await chrome.action.setPopup({ popup: "popup-init.html" });
    return false;
  }
}

/**
 * Initialize sidepanel behavior on startup
 * IMPORTANT: Never use openPanelOnActionClick — it's an all-or-nothing setting that
 * suppresses the popup completely. Instead, we control behavior via chrome.action.setPopup():
 * - Popup mode: setPopup({ popup: 'popup-init.html' }) → native popup opens
 * - Sidepanel mode: setPopup({ popup: '' }) → action.onClicked fires → sidePanel.open() with fallback
 */
export async function initSidePanel(): Promise<void> {
  try {
    // Always disable openPanelOnActionClick — we handle sidepanel opening manually
    if (chrome.sidePanel?.setPanelBehavior) {
      try {
        await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false });
      } catch {
        // Ignore errors - some browsers don't have this API
      }
    }

    // Check stored flags
    const { isArcBrowser: storedIsArc, sidePanelMode } = await chrome.storage.sync.get([
      "isArcBrowser",
      "sidePanelMode",
    ]);

    if (storedIsArc) {
      await chrome.action.setPopup({ popup: "popup-init.html" });
      return;
    }

    // Only enable sidepanel if API is available and user has it enabled
    if (isSidePanelSupported() && sidePanelMode === true) {
      // Clear popup so action.onClicked fires → sidePanel.open() in background.ts
      await chrome.action.setPopup({ popup: "" });
    } else {
      // Default: ensure popup mode
      await chrome.action.setPopup({ popup: "popup-init.html" });
    }
  } catch (error) {
    console.error("Error during sidepanel initialization:", error);
    try {
      await chrome.action.setPopup({ popup: "popup-init.html" });
    } catch {
      // Last resort - ignore
    }
  }
}
