/**
 * Side panel management utilities
 * Handles browser detection, sidepanel API support, and mode toggling
 *
 * KEY DESIGN: We never use openPanelOnActionClick (it suppresses the popup completely).
 * Instead, we control behavior via chrome.action.setPopup():
 * - Popup mode: setPopup({ popup: POPUP_PATH }) → native popup opens
 * - Sidepanel mode: setPopup({ popup: '' }) → action.onClicked fires → sidePanel.open() with fallback
 *
 * POPUP_PATH differs by browser:
 * - Chrome: 'popup-init.html' — a tiny splash that sets popup dimensions then
 *   meta-refreshes to /index.html (prevents flash-of-unstyled-content while
 *   main.js loads in the inline toolbar popup).
 * - Firefox: empty string. Firefox / Firefox-forks (Zen) don't reliably render
 *   the inline toolbar popup, so we keep `default_popup` unset in the Firefox
 *   manifest and clear it at runtime too — that makes `action.onClicked` fire
 *   on icon click, and the listener routes to `openPopupWindow()` which uses
 *   `chrome.windows.create({type:"popup"})` (confirmed working in Firefox).
 *   Slight UX trade-off: detached popup window instead of toolbar-attached,
 *   but reliable across all Firefox-family browsers.
 *
 * Firefox sidepanel: deliberately NOT offered. Firefox's `sidebar_action` /
 * `chrome.sidebarAction` API exists but (a) Zen and other Firefox forks hide
 * the native sidebar UI, so the panel never surfaces, and (b) even on standard
 * Firefox the integration didn't render reliably during testing. We stay
 * popup-only on Firefox.
 */
const IS_CHROMIUM_WITH_SIDEPANEL =
  typeof chrome !== "undefined" && typeof chrome.sidePanel !== "undefined";

export const POPUP_PATH = IS_CHROMIUM_WITH_SIDEPANEL ? "popup-init.html" : "";

/**
 * Checks if this is a non-Chrome Chromium browser (Arc, Brave, Opera, etc.)
 * Arc's sidePanel API is a "perfect phantom" — sidePanel.open() resolves,
 * getContexts reports a SIDE_PANEL context, but nothing is rendered.
 * Genuine Chrome always includes "Google Chrome" in userAgentData.brands.
 */
function isNonChromeBrowser(): boolean {
  try {
    const uaData = (navigator as any).userAgentData;
    if (!uaData?.brands) return false;
    const hasGoogleChrome = uaData.brands.some(
      (b: { brand: string }) => b.brand === "Google Chrome"
    );
    return !hasGoogleChrome;
  } catch {
    return false;
  }
}

/**
 * Checks if the browser supports the sidePanel API (synchronous, for service worker context).
 * Blocks non-Chrome Chromium browsers where sidePanel silently fails (e.g. Arc).
 * Unlike the old code, this does NOT persist a lockout flag — the check is re-evaluated
 * on each service worker start, so a browser update that adds "Google Chrome" to brands
 * would immediately unblock.
 */
export function isSidePanelSupported(): boolean {
  try {
    if (isNonChromeBrowser()) {
      return false;
    }
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
    await chrome.action.setPopup({ popup: POPUP_PATH });
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
      await chrome.action.setPopup({ popup: POPUP_PATH });
      await chrome.storage.sync.set({ sidePanelMode: false });
      return true;
    }
  } catch (error) {
    console.warn("Failed to set sidepanel mode:", error);
    await chrome.storage.sync.set({ sidePanelMode: false });
    await chrome.action.setPopup({ popup: POPUP_PATH });
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
      await chrome.action.setPopup({ popup: POPUP_PATH });
      return;
    }

    // Only enable sidepanel if API is available and user has it enabled
    if (isSidePanelSupported() && sidePanelMode === true) {
      // Clear popup so action.onClicked fires → sidePanel.open() in background.ts
      await chrome.action.setPopup({ popup: "" });
    } else {
      // Default: ensure popup mode
      await chrome.action.setPopup({ popup: POPUP_PATH });
    }
  } catch (error) {
    console.error("Error during sidepanel initialization:", error);
    try {
      await chrome.action.setPopup({ popup: POPUP_PATH });
    } catch {
      // Last resort - ignore
    }
  }
}
