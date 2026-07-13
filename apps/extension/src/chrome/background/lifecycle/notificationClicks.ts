/** Notification click navigation and error-popup lifecycle. */

export type NotificationClickLifecycleDependencies = {
  notificationClickedEvent: {
    addListener: (
      listener: (notificationId: string) => Promise<void>,
    ) => void;
  };
  getLocalStorage: (keys: string[]) => Promise<Record<string, any>>;
  removeLocalStorage: (key: string) => unknown;
  sanitizeCustomExplorerUrl: (url: string) => string | null;
  createTab: (options: { url: string }) => unknown;
  getSidePanelMode: () => Promise<boolean>;
  isSidePanelSupported: () => boolean;
  getRuntimeUrl: (path: string) => string;
  createWindow: (options: {
    url: string;
    type: "popup";
    width: number;
    height: number;
    focused: boolean;
  }) => Promise<unknown>;
  clearNotification: (notificationId: string) => unknown;
};

export function registerNotificationClickLifecycle(
  dependencies: NotificationClickLifecycleDependencies,
): void {
  dependencies.notificationClickedEvent.addListener(async (notificationId) => {
    const storageKey = `notification-${notificationId}`;
    const data = await dependencies.getLocalStorage([storageKey]);
    const notificationData = data[storageKey];

    if (notificationData) {
      if (typeof notificationData === "string") {
        const safeUrl =
          dependencies.sanitizeCustomExplorerUrl(notificationData);
        if (safeUrl) dependencies.createTab({ url: safeUrl });
        dependencies.removeLocalStorage(storageKey);
      } else if (notificationData.type === "error") {
        const useSidePanel = await dependencies.getSidePanelMode();
        const popupUrl = dependencies.getRuntimeUrl(
          `index.html?showError=${notificationData.txId}`,
        );
        const openPopup = () =>
          dependencies.createWindow({
            url: popupUrl,
            type: "popup",
            width: 360,
            height: 680,
            focused: true,
          });

        if (useSidePanel && dependencies.isSidePanelSupported()) {
          await openPopup();
        } else {
          await openPopup();
        }
      }
    }
    dependencies.clearNotification(notificationId);
  });
}
