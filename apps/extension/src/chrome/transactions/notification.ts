interface ShowNotificationOptions {
  iconUrl?: string;
}

/** Creates a wallet notification, retrying once with the bundled icon. */
export async function showNotification(
  notificationId: string,
  title: string,
  message: string,
  options: ShowNotificationOptions = {},
): Promise<string> {
  const fallbackIconUrl = chrome.runtime.getURL("icons/icon128.png");

  return new Promise((resolve) => {
    const create = (iconUrl: string, allowFallback: boolean) => {
      chrome.notifications.create(
        notificationId,
        {
          type: "basic",
          iconUrl,
          title,
          message,
          priority: 2,
        },
        (createdId) => {
          if (chrome.runtime.lastError) {
            console.error("Notification error:", chrome.runtime.lastError);
            if (allowFallback && iconUrl !== fallbackIconUrl) {
              create(fallbackIconUrl, false);
              return;
            }
          }
          resolve(createdId || notificationId);
        },
      );
    };

    create(options.iconUrl || fallbackIconUrl, true);
  });
}
