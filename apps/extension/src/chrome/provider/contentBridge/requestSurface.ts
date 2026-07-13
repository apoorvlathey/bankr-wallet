type NavigatorWithUserActivation = Navigator & {
  userActivation?: { isActive: boolean };
};

let browserWindowFullscreen = false;
let refreshTimer: ReturnType<typeof setTimeout> | null = null;

async function refreshBrowserWindowState(): Promise<void> {
  try {
    const response = await chrome.runtime.sendMessage({
      type: "getProviderWindowState",
    });
    browserWindowFullscreen = response?.fullscreen === true;
  } catch {
    browserWindowFullscreen = false;
  }
}

function scheduleBrowserWindowStateRefresh(): void {
  if (refreshTimer !== null) clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => {
    refreshTimer = null;
    void refreshBrowserWindowState();
  }, 50);
}

/**
 * Keep the browser-window state warm before a dapp request occurs. Chrome only
 * accepts sidePanel.open() while the original user activation is live, so the
 * transaction message path cannot stop to query chrome.windows first.
 */
export function startProviderRequestSurfaceTracking(): void {
  void refreshBrowserWindowState();
  window.addEventListener("resize", scheduleBrowserWindowStateRefresh);
  window.addEventListener("focus", scheduleBrowserWindowStateRefresh);
  window.addEventListener("pageshow", scheduleBrowserWindowStateRefresh);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      scheduleBrowserWindowStateRefresh();
    }
  });
}

export function shouldRequestFullscreenTransactionSidePanel(
  type: string,
  fullscreen: boolean,
  userActivationActive: boolean | undefined,
): boolean {
  return (
    type === "i_sendTransaction" &&
    fullscreen &&
    userActivationActive !== false
  );
}

/**
 * Runs synchronously from the page-message event. Do not await before this
 * call: Chromium drops the transient user activation across async work.
 */
export function requestFullscreenTransactionSidePanel(type: string): void {
  const userActivation = (navigator as NavigatorWithUserActivation)
    .userActivation;
  if (
    !shouldRequestFullscreenTransactionSidePanel(
      type,
      browserWindowFullscreen,
      userActivation?.isActive,
    )
  ) {
    return;
  }

  chrome.runtime
    .sendMessage({
      type: "openFullscreenRequestSidePanel",
      fullscreen: true,
    })
    .catch(() => undefined);
}
