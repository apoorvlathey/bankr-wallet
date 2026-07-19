import { fetchAndCacheAvatarImage } from "../avatarImageCache";
import { handleRevokeDappPermission } from "../dapp/connectionHandlers";
import { listBrowserConnectedDapps } from "./connectedDapps";
import { searchDappDirectory } from "./dappDirectorySearch";

export function handleEnsBrowserMessage(
  message: Record<string, unknown>,
  sendResponse: (response: unknown) => void,
): boolean {
  if (message.type === "ens-list-connected-dapps") {
    listBrowserConnectedDapps().then(
      (dapps) => sendResponse({ ok: true, dapps }),
      () => sendResponse({ ok: false, dapps: [] }),
    );
    return true;
  }

  if (message.type === "ens-revoke-connected-dapp") {
    if (typeof message.origin !== "string") {
      sendResponse({ ok: false, revoked: false, error: "Invalid origin" });
      return true;
    }
    handleRevokeDappPermission(message.origin).then(
      (result) => sendResponse({ ok: result.success, revoked: result.revoked }),
      () => sendResponse({ ok: false, revoked: false }),
    );
    return true;
  }

  if (message.type === "ens-search-dapp-directory") {
    searchDappDirectory(message.query).then(
      (results) => sendResponse({ ok: true, results }),
      () => sendResponse({ ok: false, results: [] }),
    );
    return true;
  }

  if (message.type === "ens-cache-browser-image") {
    if (typeof message.url !== "string") {
      sendResponse({ dataUrl: null });
      return true;
    }
    fetchAndCacheAvatarImage(message.url).then(
      (dataUrl) => sendResponse({ dataUrl }),
      () => sendResponse({ dataUrl: null }),
    );
    return true;
  }

  if (message.type !== "ens-open-dapp-url") return false;
  if (typeof message.url !== "string" || message.url.length > 2_048) {
    sendResponse({ ok: false, error: "Invalid URL" });
    return true;
  }
  let url: URL;
  try {
    url = new URL(message.url);
  } catch {
    sendResponse({ ok: false, error: "Invalid URL" });
    return true;
  }
  if (url.protocol !== "https:" || url.username || url.password || !url.hostname) {
    sendResponse({ ok: false, error: "Invalid URL" });
    return true;
  }
  chrome.tabs.create({ url: url.href, active: true }).then(
    () => sendResponse({ ok: true }),
    () => sendResponse({ ok: false, error: "Could not open URL" }),
  );
  return true;
}
