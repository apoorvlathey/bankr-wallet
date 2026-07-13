export interface PopupTransitionResult {
  success: boolean;
  panelClosed: boolean;
}

export interface SidePanelModeState {
  isArcBrowser?: boolean;
  sidePanelMode?: boolean;
}

export type RequestWindowState = chrome.windows.Window["state"];

export type WindowBounds = Pick<
  chrome.windows.Window,
  "height" | "left" | "top" | "width"
>;

export interface PopupPlacement {
  left?: number;
  top?: number;
}
