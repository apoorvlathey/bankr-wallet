import { isSidePanelSupported } from "./browserCapabilities";
import {
  getBrowserWindow,
  getLastFocusedWindow,
} from "./chromeAdapter";
import {
  getSidePanelMode,
  isSidePanelSupportedAsync,
} from "./modeTransitions";
import { shouldUseSidePanelForRequest } from "./modePolicy";
import { openOrFocusRequestPopup } from "./popupWindow";
import { openRequestSidePanel } from "./requestSidePanel";

export interface RequestSurfaceDependencies {
  getWindow: (windowId: number) => Promise<chrome.windows.Window>;
  getLastFocused: () => Promise<chrome.windows.Window>;
  getMode: () => Promise<boolean>;
  isSupportedAsync: () => Promise<boolean>;
  isSupported: () => boolean;
  openPanel: (
    targetWindow: chrome.windows.Window | null,
    fullscreenOverride: boolean,
  ) => Promise<boolean>;
  openPopup: (
    targetWindow: chrome.windows.Window | null,
  ) => Promise<void>;
}

const productionDependencies: RequestSurfaceDependencies = {
  getWindow: getBrowserWindow,
  getLastFocused: getLastFocusedWindow,
  getMode: getSidePanelMode,
  isSupportedAsync: isSidePanelSupportedAsync,
  isSupported: isSidePanelSupported,
  openPanel: openRequestSidePanel,
  openPopup: openOrFocusRequestPopup,
};

export async function resolveRequestWindowWith(
  senderWindowId: number | undefined,
  dependencies: Pick<RequestSurfaceDependencies, "getWindow" | "getLastFocused">,
): Promise<chrome.windows.Window | null> {
  if (senderWindowId !== undefined) {
    try {
      return await dependencies.getWindow(senderWindowId);
    } catch {
      // The sender window may have closed; use the focused window instead.
    }
  }
  try {
    return await dependencies.getLastFocused();
  } catch {
    return null;
  }
}

export async function openExtensionPopupWith(
  senderWindowId: number | undefined,
  dependencies: RequestSurfaceDependencies,
): Promise<void> {
  const targetWindow = await resolveRequestWindowWith(
    senderWindowId,
    dependencies,
  );
  const [sidePanelMode, sidePanelSupported] = await Promise.all([
    dependencies.getMode(),
    dependencies.isSupportedAsync(),
  ]);
  const fullscreenOverride =
    sidePanelSupported && targetWindow?.state === "fullscreen";
  const useSidePanel = shouldUseSidePanelForRequest(
    sidePanelMode,
    sidePanelSupported,
    targetWindow?.state,
  );

  if (
    useSidePanel &&
    dependencies.isSupported() &&
    (await dependencies.openPanel(targetWindow, fullscreenOverride))
  ) {
    return;
  }

  await dependencies.openPopup(targetWindow);
}

export function openExtensionPopup(
  senderWindowId?: number,
): Promise<void> {
  return openExtensionPopupWith(senderWindowId, productionDependencies);
}
