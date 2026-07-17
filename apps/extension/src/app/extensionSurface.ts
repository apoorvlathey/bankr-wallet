export type ExtensionSurface =
  | "action-popup"
  | "popup-window"
  | "sidepanel"
  | "fullscreen-tab";

export type ExtensionViewKind = "action-popup" | "sidepanel" | "tab" | "unknown";

interface ExtensionViewLookup {
  getViews(fetchProperties?: { type?: "popup" | "tab" }): Window[];
}

interface SurfaceInputs {
  viewKind: ExtensionViewKind;
  currentWindowType?: chrome.windows.windowTypeEnum;
  sidePanelSupported: boolean;
  sidePanelPreferenceEnabled: boolean;
  viewportWidth: number;
  isTopLevel: boolean;
}

/**
 * Classifies the renderer from Chrome's extension-view identity. Viewport size
 * is only a final fallback because a side panel can be shorter than a popup.
 */
export function resolveExtensionSurface({
  viewKind,
  currentWindowType,
  sidePanelSupported,
  sidePanelPreferenceEnabled,
  viewportWidth,
  isTopLevel,
}: SurfaceInputs): ExtensionSurface {
  if (currentWindowType === "popup") return "popup-window";
  if (viewKind === "action-popup") return "action-popup";
  if (viewKind === "tab") return "fullscreen-tab";
  if (viewKind === "sidepanel") return "sidepanel";

  if (viewportWidth > 500 && isTopLevel) return "fullscreen-tab";
  if (sidePanelSupported && sidePanelPreferenceEnabled) return "sidepanel";
  return "action-popup";
}

export function getCurrentExtensionViewKind(
  currentView: Window = window,
  extensionApi: ExtensionViewLookup | undefined =
    typeof chrome !== "undefined" ? chrome.extension : undefined,
): ExtensionViewKind {
  if (typeof extensionApi?.getViews !== "function") return "unknown";

  try {
    if (extensionApi.getViews({ type: "popup" }).includes(currentView)) {
      return "action-popup";
    }
    if (extensionApi.getViews({ type: "tab" }).includes(currentView)) {
      return "tab";
    }

    // index.html is the only remaining foreground renderer and is the
    // manifest's side_panel.default_path.
    return "sidepanel";
  } catch {
    return "unknown";
  }
}

export async function detectExtensionSurface({
  sidePanelSupported,
  sidePanelPreferenceEnabled,
}: {
  sidePanelSupported: boolean;
  sidePanelPreferenceEnabled: boolean;
}): Promise<ExtensionSurface> {
  let currentWindowType: chrome.windows.windowTypeEnum | undefined;
  try {
    currentWindowType = (await chrome.windows.getCurrent()).type;
  } catch {
    currentWindowType = undefined;
  }

  return resolveExtensionSurface({
    viewKind: getCurrentExtensionViewKind(),
    currentWindowType,
    sidePanelSupported,
    sidePanelPreferenceEnabled,
    viewportWidth: window.innerWidth,
    isTopLevel: window.top === window.self,
  });
}

export function applyExtensionSurfaceClass(surface: ExtensionSurface): void {
  document.body.classList.remove(
    "sidepanel-mode",
    "fullscreen-mode",
    "popup-window-mode",
  );

  if (surface === "sidepanel") {
    document.body.classList.add("sidepanel-mode");
  } else if (surface === "fullscreen-tab") {
    document.body.classList.add("fullscreen-mode");
  } else if (surface === "popup-window") {
    document.body.classList.add("popup-window-mode");
  }
}

/** Apply the side-panel viewport before React's first paint. */
export function bootstrapExtensionSurfaceClass(): void {
  if (getCurrentExtensionViewKind() === "sidepanel") {
    applyExtensionSurfaceClass("sidepanel");
  }
}
