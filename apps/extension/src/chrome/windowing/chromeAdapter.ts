import type { SidePanelModeState } from "./types";

const MODE_KEYS = ["isArcBrowser", "sidePanelMode"] as const;

export async function readArcBrowserFlag(): Promise<boolean> {
  const { isArcBrowser } = await chrome.storage.sync.get(["isArcBrowser"]);
  return Boolean(isArcBrowser);
}

export async function readSidePanelModeState(): Promise<SidePanelModeState> {
  return chrome.storage.sync.get([...MODE_KEYS]);
}

export async function writeSidePanelMode(enabled: boolean): Promise<void> {
  await chrome.storage.sync.set({ sidePanelMode: enabled });
}

export async function setActionPopup(popup: string): Promise<void> {
  await chrome.action.setPopup({ popup });
}

export async function disableOpenPanelOnActionClick(): Promise<void> {
  if (chrome.sidePanel?.setPanelBehavior) {
    await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false });
  }
}

export function getSidePanelCloser():
  | ((windowId: number) => Promise<void>)
  | null {
  const sidePanel = chrome.sidePanel as
    | (typeof chrome.sidePanel & {
        close?: (options: { windowId: number }) => Promise<void>;
      })
    | undefined;
  if (typeof sidePanel?.close !== "function") return null;
  return async (windowId) => {
    await sidePanel.close!({ windowId });
  };
}

export async function getBrowserWindow(
  windowId: number,
): Promise<chrome.windows.Window> {
  return chrome.windows.get(windowId, { populate: false });
}

export async function getLastFocusedWindow(): Promise<chrome.windows.Window> {
  return chrome.windows.getLastFocused({ populate: false });
}

export async function pingExtensionView(): Promise<unknown> {
  return chrome.runtime.sendMessage({ type: "ping" }).catch(() => null);
}

export async function openSidePanel(windowId: number): Promise<void> {
  if (!chrome.sidePanel?.open) {
    throw new Error("sidePanel API unavailable");
  }
  await chrome.sidePanel.open({ windowId });
}

export async function delay(milliseconds: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export async function getSidePanelContexts(): Promise<unknown[] | null> {
  if (!chrome.runtime.getContexts) return null;
  return chrome.runtime.getContexts({
    contextTypes: ["SIDE_PANEL" as chrome.runtime.ContextType],
  });
}

export async function getPopupWindows(): Promise<chrome.windows.Window[]> {
  return chrome.windows.getAll({ windowTypes: ["popup"] });
}

export async function getWindowTabs(
  windowId: number,
): Promise<chrome.tabs.Tab[]> {
  return chrome.tabs.query({ windowId });
}

export async function focusWindow(windowId: number): Promise<void> {
  await chrome.windows.update(windowId, { focused: true });
}

export function getRuntimeUrl(path: string): string {
  return chrome.runtime.getURL(path);
}

export async function createWindow(
  options: chrome.windows.CreateData,
): Promise<void> {
  await chrome.windows.create(options);
}
