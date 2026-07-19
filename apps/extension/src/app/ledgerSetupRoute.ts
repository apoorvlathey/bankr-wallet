import { closeSidePanelForWindow } from "@/lib/sidePanelControls";
import {
  getCurrentExtensionViewKind,
  type ExtensionViewKind,
} from "@/app/extensionSurface";

const LEDGER_SETUP_ROUTE = "add-ledger";

interface LedgerSetupTabDependencies {
  getRuntimeUrl(path: string): string;
  createTab(options: { url: string; active: boolean }): Promise<{
    windowId?: number;
  }>;
  getViewKind(): ExtensionViewKind;
  closeSidePanel(windowId: number | undefined): Promise<boolean>;
  closeWindow(): void;
}

export function isLedgerSetupRoute(search: string): boolean {
  return new URLSearchParams(search).get("route") === LEDGER_SETUP_ROUTE;
}

export function getLedgerSetupUrl(
  getRuntimeUrl: (path: string) => string,
): string {
  const url = new URL(getRuntimeUrl("index.html"));
  url.searchParams.set("route", LEDGER_SETUP_ROUTE);
  return url.href;
}

export async function openLedgerSetupTabWith(
  dependencies: LedgerSetupTabDependencies,
): Promise<void> {
  const sourceView = dependencies.getViewKind();
  const tab = await dependencies.createTab({
    url: getLedgerSetupUrl(dependencies.getRuntimeUrl),
    active: true,
  });
  if (sourceView !== "sidepanel") return;

  const closed = await dependencies.closeSidePanel(tab.windowId);
  if (!closed) dependencies.closeWindow();
}

export async function openLedgerSetupTab(): Promise<void> {
  return openLedgerSetupTabWith({
    getRuntimeUrl: (path) => chrome.runtime.getURL(path),
    createTab: (options) => chrome.tabs.create(options),
    getViewKind: getCurrentExtensionViewKind,
    closeSidePanel: closeSidePanelForWindow,
    closeWindow: () => window.close(),
  });
}
