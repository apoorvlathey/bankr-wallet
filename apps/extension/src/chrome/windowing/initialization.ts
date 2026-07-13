import { POPUP_PATH, isSidePanelSupported } from "./browserCapabilities";
import {
  disableOpenPanelOnActionClick,
  readSidePanelModeState,
  setActionPopup,
} from "./chromeAdapter";
import { shouldInitializeInSidePanelMode } from "./modePolicy";
import type { SidePanelModeState } from "./types";

export interface SidePanelInitializationDependencies {
  disableAutomaticPanelOpen: () => Promise<void>;
  readModeState: () => Promise<SidePanelModeState>;
  isSupported: () => boolean;
  setPopup: (popup: string) => Promise<void>;
  popupPath: string;
  error: (...values: unknown[]) => void;
}

const productionDependencies: SidePanelInitializationDependencies = {
  disableAutomaticPanelOpen: disableOpenPanelOnActionClick,
  readModeState: readSidePanelModeState,
  isSupported: isSidePanelSupported,
  setPopup: setActionPopup,
  popupPath: POPUP_PATH,
  error: (...values) => console.error(...values),
};

export async function initializeSidePanelWith(
  dependencies: SidePanelInitializationDependencies,
): Promise<void> {
  try {
    try {
      await dependencies.disableAutomaticPanelOpen();
    } catch {
      // Some browsers expose only a partial side-panel API.
    }

    const state = await dependencies.readModeState();
    if (state.isArcBrowser) {
      await dependencies.setPopup(dependencies.popupPath);
      return;
    }

    await dependencies.setPopup(
      shouldInitializeInSidePanelMode(dependencies.isSupported(), state)
        ? ""
        : dependencies.popupPath,
    );
  } catch (error) {
    dependencies.error("Error during sidepanel initialization:", error);
    try {
      await dependencies.setPopup(dependencies.popupPath);
    } catch {
      // Last-resort startup fallback intentionally remains best effort.
    }
  }
}

export function initSidePanel(): Promise<void> {
  return initializeSidePanelWith(productionDependencies);
}
