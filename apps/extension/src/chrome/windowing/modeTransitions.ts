import { isSidePanelSupported } from "./browserCapabilities";
import {
  getSidePanelCloser,
  readArcBrowserFlag,
  readSidePanelModeState,
  setActionPopup,
  writeSidePanelMode,
} from "./chromeAdapter";
import { POPUP_PATH } from "./browserCapabilities";
import { effectiveSidePanelMode } from "./modePolicy";
import type { PopupTransitionResult, SidePanelModeState } from "./types";

export interface SidePanelModeDependencies {
  isSupported: () => boolean;
  readArcFlag: () => Promise<boolean>;
  readModeState: () => Promise<SidePanelModeState>;
  writeMode: (enabled: boolean) => Promise<void>;
  setPopup: (popup: string) => Promise<void>;
  getCloser: () => ((windowId: number) => Promise<void>) | null;
  popupPath: string;
  warn: (...values: unknown[]) => void;
}

const productionDependencies: SidePanelModeDependencies = {
  isSupported: isSidePanelSupported,
  readArcFlag: readArcBrowserFlag,
  readModeState: readSidePanelModeState,
  writeMode: writeSidePanelMode,
  setPopup: setActionPopup,
  getCloser: getSidePanelCloser,
  popupPath: POPUP_PATH,
  warn: (...values) => console.warn(...values),
};

export async function isSidePanelSupportedAsyncWith(
  dependencies: SidePanelModeDependencies,
): Promise<boolean> {
  if (!dependencies.isSupported()) return false;
  return !(await dependencies.readArcFlag());
}

export async function getSidePanelModeWith(
  dependencies: SidePanelModeDependencies,
): Promise<boolean> {
  if (!dependencies.isSupported()) return false;
  return effectiveSidePanelMode(true, await dependencies.readModeState());
}

export async function setSidePanelModeWith(
  enabled: boolean,
  dependencies: SidePanelModeDependencies,
): Promise<boolean> {
  const storedIsArc = await dependencies.readArcFlag();
  if (storedIsArc && enabled) return false;

  if (!dependencies.isSupported()) {
    if (enabled) return false;
    await dependencies.writeMode(false);
    await dependencies.setPopup(dependencies.popupPath);
    return true;
  }

  try {
    if (enabled) {
      await dependencies.setPopup("");
      await dependencies.writeMode(true);
    } else {
      await dependencies.setPopup(dependencies.popupPath);
      await dependencies.writeMode(false);
    }
    return true;
  } catch (error) {
    dependencies.warn("Failed to set sidepanel mode:", error);
    await dependencies.writeMode(false);
    await dependencies.setPopup(dependencies.popupPath);
    return false;
  }
}

export async function transitionSidePanelToPopupWith(
  windowId: number | undefined,
  openDetachedPopup: () => Promise<void>,
  dependencies: SidePanelModeDependencies,
): Promise<PopupTransitionResult> {
  if (!(await setSidePanelModeWith(false, dependencies))) {
    return { success: false, panelClosed: false };
  }

  try {
    await openDetachedPopup();
  } catch (error) {
    dependencies.warn("Failed to open detached popup window:", error);
    return { success: false, panelClosed: false };
  }

  let panelClosed = false;
  const closeSidePanel = dependencies.getCloser();
  if (windowId !== undefined && closeSidePanel) {
    try {
      await closeSidePanel(windowId);
      panelClosed = true;
    } catch (error) {
      dependencies.warn(
        "Failed to close sidepanel after opening popup:",
        error,
      );
    }
  }
  return { success: true, panelClosed };
}

export function isSidePanelSupportedAsync(): Promise<boolean> {
  return isSidePanelSupportedAsyncWith(productionDependencies);
}

export function getSidePanelMode(): Promise<boolean> {
  return getSidePanelModeWith(productionDependencies);
}

export function setSidePanelMode(enabled: boolean): Promise<boolean> {
  return setSidePanelModeWith(enabled, productionDependencies);
}

export function transitionSidePanelToPopup(
  windowId: number | undefined,
  openDetachedPopup: () => Promise<void>,
): Promise<PopupTransitionResult> {
  return transitionSidePanelToPopupWith(
    windowId,
    openDetachedPopup,
    productionDependencies,
  );
}
