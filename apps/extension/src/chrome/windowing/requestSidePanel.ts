import {
  delay,
  getSidePanelContexts,
  openSidePanel,
  pingExtensionView,
} from "./chromeAdapter";

export interface RequestSidePanelDependencies {
  pingView: () => Promise<unknown>;
  openPanel: (windowId: number) => Promise<void>;
  delay: (milliseconds: number) => Promise<void>;
  getContexts: () => Promise<unknown[] | null>;
  warn: (...values: unknown[]) => void;
}

const productionDependencies: RequestSidePanelDependencies = {
  pingView: pingExtensionView,
  openPanel: openSidePanel,
  delay,
  getContexts: getSidePanelContexts,
  warn: (...values) => console.warn(...values),
};

export async function openRequestSidePanelWith(
  targetWindow: chrome.windows.Window | null,
  fullscreenOverride: boolean,
  dependencies: RequestSidePanelDependencies,
): Promise<boolean> {
  if (fullscreenOverride) {
    try {
      const contexts = await dependencies.getContexts();
      if (contexts !== null && contexts.length > 0) return true;
    } catch {
      // The early user-activated open may still need the legacy path below.
    }
  } else {
    try {
      if ((await dependencies.pingView()) === "pong") return true;
    } catch {
      // No extension view responded; continue opening one.
    }
  }

  try {
    const windowId = targetWindow?.id;
    if (windowId) {
      await dependencies.openPanel(windowId);
      await dependencies.delay(600);

      const contexts = await dependencies.getContexts();
      if (contexts !== null) return contexts.length > 0;
      return (await dependencies.pingView()) === "pong";
    }
  } catch (error) {
    dependencies.warn(
      "Sidepanel failed to open for tx confirmation, falling back to popup:",
      error,
    );
  }
  return false;
}

export function openRequestSidePanel(
  targetWindow: chrome.windows.Window | null,
  fullscreenOverride: boolean,
): Promise<boolean> {
  return openRequestSidePanelWith(
    targetWindow,
    fullscreenOverride,
    productionDependencies,
  );
}
