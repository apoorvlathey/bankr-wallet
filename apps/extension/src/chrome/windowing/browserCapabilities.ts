type NavigatorWithBrands = Navigator & {
  userAgentData?: {
    brands?: Array<{ brand: string }>;
  };
};

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

/**
 * Arc and other non-Chrome Chromium browsers can expose a phantom sidePanel
 * API. Genuine Chrome always advertises the `Google Chrome` brand.
 */
export function isNonChromeChromiumBrowser(
  navigatorApi: NavigatorWithBrands | undefined,
): boolean {
  try {
    const brands = navigatorApi?.userAgentData?.brands;
    if (!brands) return false;
    return !brands.some(({ brand }) => brand === "Google Chrome");
  } catch {
    return false;
  }
}

export function detectSidePanelSupport(
  chromeApi: ChromeWithOptionalSidePanel,
  navigatorApi: NavigatorWithBrands | undefined,
): boolean {
  try {
    if (isNonChromeChromiumBrowser(navigatorApi)) return false;
    return Boolean(
      chromeApi?.sidePanel &&
        typeof chromeApi.sidePanel.setPanelBehavior === "function",
    );
  } catch {
    return false;
  }
}

/** Synchronous service-worker capability check. */
export function isSidePanelSupported(): boolean {
  return detectSidePanelSupport(
    typeof chrome === "undefined" ? undefined : chrome,
    typeof navigator === "undefined"
      ? undefined
      : (navigator as NavigatorWithBrands),
  );
}
