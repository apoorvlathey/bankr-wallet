import type { RequestWindowState, SidePanelModeState } from "./types";

export function effectiveSidePanelMode(
  supported: boolean,
  state: SidePanelModeState,
): boolean {
  if (!supported || state.isArcBrowser) return false;
  return state.sidePanelMode !== false;
}

/** Startup stays popup-first until onboarding explicitly enables the panel. */
export function shouldInitializeInSidePanelMode(
  supported: boolean,
  state: SidePanelModeState,
): boolean {
  return supported && !state.isArcBrowser && state.sidePanelMode === true;
}

export function shouldUseSidePanelForRequest(
  preferenceEnabled: boolean,
  sidePanelSupported: boolean,
  windowState: RequestWindowState | undefined,
): boolean {
  return (
    sidePanelSupported &&
    (preferenceEnabled || windowState === "fullscreen")
  );
}
