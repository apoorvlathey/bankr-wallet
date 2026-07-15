import { bridgeState } from "./bridgeState";
import { providerRequestPassesSurfacePreflight } from "./requestSurfacePreflight";

type NavigatorWithUserActivation = Navigator & {
  userActivation?: { isActive: boolean };
};

export type ProviderSidePanelModeState = {
  isArcBrowser?: boolean;
  sidePanelMode?: boolean;
};

let sidePanelModeState: ProviderSidePanelModeState | null = null;

export function isProviderSidePanelModeEnabled(
  state: ProviderSidePanelModeState | null,
): boolean {
  return (
    state !== null &&
    state.isArcBrowser !== true &&
    state.sidePanelMode !== false
  );
}

async function hydrateSidePanelMode(): Promise<void> {
  try {
    sidePanelModeState = await new Promise<ProviderSidePanelModeState>(
      (resolve) => {
        chrome.storage.sync.get(
          ["isArcBrowser", "sidePanelMode"],
          (state) => resolve(state),
        );
      },
    );
  } catch {
    sidePanelModeState = null;
  }
}

/**
 * Keep the user's request-surface preference warm before a dapp request occurs.
 * Chrome only accepts sidePanel.open() while the original user activation is
 * live, so the request path cannot stop to read sync storage first.
 */
export function startProviderRequestSurfaceTracking(): void {
  void hydrateSidePanelMode();
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "sync" || sidePanelModeState === null) return;
    if (changes.isArcBrowser) {
      sidePanelModeState.isArcBrowser = changes.isArcBrowser.newValue;
    }
    if (changes.sidePanelMode) {
      sidePanelModeState.sidePanelMode = changes.sidePanelMode.newValue;
    }
  });
}

export function shouldRequestProviderSidePanel(
  type: string,
  message: unknown,
  modeEnabled: boolean,
  userActivationActive: boolean | undefined,
  requestAccepted = true,
): boolean {
  if (!modeEnabled || userActivationActive === false || !requestAccepted) {
    return false;
  }
  if (
    type === "i_sendTransaction" ||
    type === "i_signatureRequest" ||
    type === "i_walletSendCalls"
  ) {
    return true;
  }
  return (
    type === "i_walletExecutionPermissions" &&
    (message as { method?: unknown } | null)?.method ===
      "wallet_requestExecutionPermissions"
  );
}

/**
 * Runs synchronously from the page-message event. Do not await before this
 * call: Chromium drops the transient user activation across async work.
 */
export function requestProviderSidePanel(type: string, message: unknown): void {
  const userActivation = (navigator as NavigatorWithUserActivation)
    .userActivation;
  if (
    !shouldRequestProviderSidePanel(
      type,
      message,
      isProviderSidePanelModeEnabled(sidePanelModeState),
      userActivation?.isActive,
      providerRequestPassesSurfacePreflight(type, message, bridgeState),
    )
  ) {
    return;
  }

  chrome.runtime
    .sendMessage({
      type: "openProviderRequestSidePanel",
      requestType: type,
      permissionMethod:
        type === "i_walletExecutionPermissions"
          ? (message as { method?: unknown } | null)?.method
          : undefined,
    })
    .catch(() => undefined);
}
