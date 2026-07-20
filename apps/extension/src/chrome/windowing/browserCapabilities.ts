type ChromeWithOptionalSidePanel = Pick<typeof chrome, "sidePanel"> | undefined;

/** Firefox-family builds do not expose `chrome.sidePanel` at runtime. */
export function popupPathForBrowser(
  chromeApi: ChromeWithOptionalSidePanel,
): string {
  return chromeApi?.sidePanel === undefined ? "" : "popup-init.html";
}

export const POPUP_PATH = popupPathForBrowser(
  typeof chrome === "undefined" ? undefined : chrome,
);

export function detectSidePanelSupport(
  chromeApi: ChromeWithOptionalSidePanel,
): boolean {
  try {
    return Boolean(
      chromeApi?.sidePanel &&
        typeof chromeApi.sidePanel.setPanelBehavior === "function" &&
        typeof chromeApi.sidePanel.open === "function",
    );
  } catch {
    return false;
  }
}

/** Synchronous service-worker capability check. */
export function isSidePanelSupported(): boolean {
  return detectSidePanelSupport(
    typeof chrome === "undefined" ? undefined : chrome,
  );
}
