import {
  createWindow,
  focusWindow,
  getLastFocusedWindow,
  getPopupWindows,
  getRuntimeUrl,
  getWindowTabs,
} from "./chromeAdapter";
import {
  POPUP_WINDOW_HEIGHT,
  POPUP_WINDOW_WIDTH,
  popupPlacementForWindow,
} from "./popupGeometry";

export interface PopupWindowDependencies {
  getPopups: () => Promise<chrome.windows.Window[]>;
  getTabs: (windowId: number) => Promise<chrome.tabs.Tab[]>;
  focus: (windowId: number) => Promise<void>;
  getLastFocused: () => Promise<chrome.windows.Window>;
  runtimeUrl: (path: string) => string;
  create: (options: chrome.windows.CreateData) => Promise<void>;
}

const productionDependencies: PopupWindowDependencies = {
  getPopups: getPopupWindows,
  getTabs: getWindowTabs,
  focus: focusWindow,
  getLastFocused: getLastFocusedWindow,
  runtimeUrl: getRuntimeUrl,
  create: createWindow,
};

export async function focusExistingPopupWith(
  popupUrl: string,
  dependencies: PopupWindowDependencies,
): Promise<boolean> {
  const existingWindows = await dependencies.getPopups();
  for (const window of existingWindows) {
    if (!window.id) continue;
    const tabs = await dependencies.getTabs(window.id);
    if (tabs.some((tab) => tab.url?.startsWith(popupUrl))) {
      await dependencies.focus(window.id);
      return true;
    }
  }
  return false;
}

export async function createPopupWindowWith(
  popupUrl: string,
  targetWindow: chrome.windows.Window | null,
  dependencies: PopupWindowDependencies,
): Promise<void> {
  const placement = popupPlacementForWindow(targetWindow);
  const createOptions: chrome.windows.CreateData = {
    url: popupUrl,
    type: "popup",
    width: POPUP_WINDOW_WIDTH,
    height: POPUP_WINDOW_HEIGHT,
    focused: true,
  };

  if (placement.left !== undefined && placement.top !== undefined) {
    createOptions.left = placement.left;
    createOptions.top = placement.top;
  }
  await dependencies.create(createOptions);
}

export async function openOrFocusPopupWith(
  popupUrl: string,
  targetWindow: chrome.windows.Window | null,
  dependencies: PopupWindowDependencies,
): Promise<void> {
  if (await focusExistingPopupWith(popupUrl, dependencies)) return;
  await createPopupWindowWith(popupUrl, targetWindow, dependencies);
}

/** Request flow preserves getAll-before-getURL ordering from the legacy path. */
export async function openOrFocusRequestPopupWith(
  targetWindow: chrome.windows.Window | null,
  dependencies: PopupWindowDependencies,
): Promise<void> {
  const existingWindows = await dependencies.getPopups();
  const popupUrl = dependencies.runtimeUrl("index.html");
  for (const window of existingWindows) {
    if (!window.id) continue;
    const tabs = await dependencies.getTabs(window.id);
    if (tabs.some((tab) => tab.url?.startsWith(popupUrl))) {
      await dependencies.focus(window.id);
      return;
    }
  }
  await createPopupWindowWith(popupUrl, targetWindow, dependencies);
}

export async function openPopupWindowWith(
  dependencies: PopupWindowDependencies,
): Promise<void> {
  const popupUrl = dependencies.runtimeUrl("index.html");
  if (await focusExistingPopupWith(popupUrl, dependencies)) return;

  let targetWindow: chrome.windows.Window | null = null;
  try {
    targetWindow = await dependencies.getLastFocused();
  } catch {
    targetWindow = null;
  }
  await createPopupWindowWith(popupUrl, targetWindow, dependencies);
}

export function openOrFocusRequestPopup(
  targetWindow: chrome.windows.Window | null,
): Promise<void> {
  return openOrFocusRequestPopupWith(
    targetWindow,
    productionDependencies,
  );
}

export function openPopupWindow(): Promise<void> {
  return openPopupWindowWith(productionDependencies);
}
