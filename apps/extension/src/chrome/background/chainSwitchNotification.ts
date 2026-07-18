/** Connected-dapp chain-switch portfolio and user-notification side effects. */

const CHAIN_SWITCH_NOTIFICATION_COOLDOWN_MS = 10_000;

export type ChainSwitchNotificationDependencies = {
  getNetworksInfo: () => Promise<any>;
  getResolvedChainById: (chainId: number, networksInfo: any) => any;
  sendRuntimeMessage: (message: Record<string, unknown>) => Promise<unknown>;
  showNotification: (
    id: string,
    title: string,
    message: string,
    options: { iconUrl?: string },
  ) => Promise<unknown>;
  getRuntimeUrl: (path: string) => string;
  now: () => number;
};

function getSenderUrl(
  sender: chrome.runtime.MessageSender,
): string | undefined {
  return sender.url || sender.tab?.url || sender.origin || undefined;
}

function getDappLabel(sender: chrome.runtime.MessageSender): string {
  const source = getSenderUrl(sender);
  if (!source) return "A dapp";
  try {
    return new URL(source).hostname || "A dapp";
  } catch {
    return "A dapp";
  }
}

function getNotificationIconUrl(
  iconPath: string | undefined,
  getRuntimeUrl: (path: string) => string,
): string | undefined {
  if (!iconPath || /^https?:\/\//i.test(iconPath)) return undefined;
  if (/^(?:chrome|moz)-extension:\/\//i.test(iconPath)) {
    const extensionRoot = getRuntimeUrl("/");
    return iconPath.startsWith(extensionRoot) ? iconPath : undefined;
  }

  const normalizedPath = iconPath.replace(/^\/+/, "");
  const bundledSvgMatch = normalizedPath.match(
    /^chainIcons\/([^/]+)\.svg$/i,
  );

  // Chrome's native notification bridge does not reliably render SVG icons
  // (notably on macOS). Use the generated raster copy for notifications while
  // retaining the sharper SVG everywhere inside the extension UI.
  const notificationPath = bundledSvgMatch
    ? `notificationChainIcons/${bundledSvgMatch[1]}.png`
    : normalizedPath;
  return getRuntimeUrl(notificationPath);
}

export function createDappChainSwitchNotificationHandler(
  dependencies: ChainSwitchNotificationDependencies,
): (
  message: any,
  sender: chrome.runtime.MessageSender,
) => Promise<{ success: boolean; skipped?: boolean; error?: string }> {
  const recentNotifications = new Map<string, number>();

  return async (message, sender) => {
    const chainId = Number(message.chainId);
    if (!Number.isInteger(chainId) || chainId <= 0) {
      return { success: false, error: "Invalid chain ID" };
    }
    if (!sender.tab?.id) {
      return { success: false, error: "Missing tab context" };
    }

    const networksInfo = await dependencies.getNetworksInfo();
    const chain = dependencies.getResolvedChainById(chainId, networksInfo);
    if (!chain) return { success: false, error: "Unknown chain" };

    void dependencies
      .sendRuntimeMessage({
        type: "portfolioDappChainChanged",
        tabId: sender.tab.id,
        chainId: chain.chainId,
      })
      .catch(() => {});

    const source = sender.origin || getSenderUrl(sender) || "unknown";
    const cooldownKey = `${sender.tab.id}:${source}:${chain.chainId}`;
    const now = dependencies.now();
    const previous = recentNotifications.get(cooldownKey);
    if (
      previous &&
      now - previous < CHAIN_SWITCH_NOTIFICATION_COOLDOWN_MS
    ) {
      return { success: true, skipped: true };
    }

    recentNotifications.set(cooldownKey, now);
    for (const [key, timestamp] of recentNotifications) {
      if (now - timestamp > CHAIN_SWITCH_NOTIFICATION_COOLDOWN_MS * 6) {
        recentNotifications.delete(key);
      }
    }

    await dependencies.showNotification(
      `chain-switch-${sender.tab.id}-${chain.chainId}-${now}`,
      `Switched to ${chain.name}`,
      `${getDappLabel(sender)} switched WalletChan network`,
      {
        iconUrl: getNotificationIconUrl(chain.icon, dependencies.getRuntimeUrl),
      },
    );
    return { success: true };
  };
}
