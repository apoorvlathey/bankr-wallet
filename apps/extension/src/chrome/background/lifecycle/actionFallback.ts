/** Extension-action sidepanel open with detached-popup fallback. */

export type ActionFallbackDependencies = {
  actionClickedEvent: {
    addListener: (listener: (tab: any) => Promise<void>) => void;
  };
  openSidePanel: ((options: { windowId: number }) => Promise<unknown>) | null;
  getContexts:
    | ((options: { contextTypes: string[] }) => Promise<unknown[]>)
    | null;
  sendRuntimeMessage: (message: Record<string, unknown>) => Promise<unknown>;
  openPopupWindow: () => Promise<unknown>;
  delay: (milliseconds: number) => Promise<void>;
};

export function registerActionFallbackLifecycle(
  dependencies: ActionFallbackDependencies,
): void {
  dependencies.actionClickedEvent.addListener(async (tab) => {
    try {
      if (!dependencies.openSidePanel) {
        await dependencies.openPopupWindow();
        return;
      }
      await dependencies.openSidePanel({ windowId: tab.windowId });
      await dependencies.delay(600);

      let sidePanelActuallyOpen = false;
      if (dependencies.getContexts) {
        const contexts = await dependencies.getContexts({
          contextTypes: ["SIDE_PANEL"],
        });
        sidePanelActuallyOpen = contexts.length > 0;
      } else {
        try {
          const response = await dependencies.sendRuntimeMessage({
            type: "ping",
          });
          sidePanelActuallyOpen = response === "pong";
        } catch {
          sidePanelActuallyOpen = false;
        }
      }

      if (!sidePanelActuallyOpen) await dependencies.openPopupWindow();
    } catch {
      await dependencies.openPopupWindow();
    }
  });
}
