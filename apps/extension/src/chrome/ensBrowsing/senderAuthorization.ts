const ERROR_PAGE = "ens-error.html";

function extensionPagePath(sender: chrome.runtime.MessageSender): string | null {
  const senderUrl = sender.url;
  if (!senderUrl?.startsWith(chrome.runtime.getURL("/"))) return null;
  try {
    return new URL(senderUrl).pathname;
  } catch {
    return null;
  }
}

function isExtensionPage(
  sender: chrome.runtime.MessageSender,
  page: string,
): boolean {
  return extensionPagePath(sender) === `/${page}`;
}

function isTopLevelExtensionPage(
  sender: chrome.runtime.MessageSender,
  page: string,
): boolean {
  if (sender.frameId !== 0 || !isExtensionPage(sender, page)) return false;
  const tabUrl = sender.tab?.url;
  if (!tabUrl) return false;
  try {
    return (
      new URL(tabUrl).pathname === `/${page}` &&
      tabUrl.startsWith(chrome.runtime.getURL("/"))
    );
  } catch {
    return false;
  }
}

function isTopLevelEnsGatewayContent(
  sender: chrome.runtime.MessageSender,
): boolean {
  if (sender.frameId !== 0 || !sender.url || !sender.tab?.url) return false;
  try {
    const senderUrl = new URL(sender.url);
    const tabUrl = new URL(sender.tab.url);
    if (senderUrl.origin !== tabUrl.origin) return false;
    if (senderUrl.protocol !== "http:" && senderUrl.protocol !== "https:") {
      return false;
    }
    const host = senderUrl.hostname.toLowerCase().replace(/\.$/, "");
    return (
      /\.(?:ipfs|ipns)\.localhost$/.test(host) ||
      /\.eth\.(?:limo|link)$/.test(host) ||
      /\.gwei\.domains$/.test(host) ||
      /\.w3eth\.io$/.test(host) ||
      /^0x[a-f0-9]{40}\.1\.w3link\.io$/.test(host)
    );
  } catch {
    return false;
  }
}

/** Authorize each ENS message at its exact visible page/content boundary. */
export function isAuthorizedEnsBrowsingSender(
  type: string,
  sender: chrome.runtime.MessageSender,
): boolean {
  const extensionSender = extensionPagePath(sender) !== null;
  if (!extensionSender) {
    if (
      type !== "ens-cache-metadata" &&
      type !== "ens-get-tab-ctx" &&
      type !== "ens-open-on-gateway" &&
      type !== "ens-get-theme-tokens"
    ) {
      return false;
    }
    return isTopLevelEnsGatewayContent(sender);
  }

  switch (type) {
    case "ens-cache-check":
    case "ens-resolve":
      return isTopLevelExtensionPage(sender, "interstitial.html");
    case "ens-open-on-gateway":
      return isTopLevelExtensionPage(sender, ERROR_PAGE);
    case "ens-probe-kubo":
      return isExtensionPage(sender, "index.html");
    case "ens-probe-kubo-api":
      return (
        isExtensionPage(sender, "index.html") ||
        isTopLevelExtensionPage(sender, "setup-kubo.html")
      );
    case "ens-web3-list":
    case "ens-web3-evict":
      return (
        isExtensionPage(sender, "index.html") ||
        isTopLevelExtensionPage(sender, "browse.html")
      );
    case "ens-list-connected-dapps":
    case "ens-revoke-connected-dapp":
    case "ens-search-dapp-directory":
    case "ens-cache-browser-image":
    case "ens-open-dapp-url":
      return isTopLevelExtensionPage(sender, "browse.html");
    default:
      return false;
  }
}
