import {
  sanitizeTrustedBrowserFaviconSrc,
  sanitizeUntrustedImageUrl,
} from "@/lib/remoteImagePolicy";
import { fetchAndCacheAvatarImage } from "../avatarImageCache";
import {
  DEFAULT_THEME_ID,
  SELECTED_THEME_STORAGE_KEY,
  isDarkThemeId,
  isThemeId,
  type ThemeId,
} from "@/theme/tokens";
import { handleRevokeDappPermission } from "../dapp/connectionHandlers";
import { listBrowserConnectedDapps } from "./connectedDapps";
import { searchDappDirectory } from "./dappDirectorySearch";
import {
  findCachedByGatewayLabel,
  getCached,
  updateCachedMetadata,
} from "./cache";
import { parseGatewayHost } from "./gateway";
import {
  probeKuboApi,
  probeKuboGateway,
  removeMfsPath,
  unpinFromKubo,
} from "./kubo";
import {
  chooseGatewayUrl,
  hostedGatewayKind,
  prepareHostedGatewayNavigation,
  refreshFromCache,
  resolveAndRedirect,
} from "./navigation";
import { isGweiName } from "./resolver";
import { isAuthorizedEnsBrowsingSender } from "./senderAuthorization";
import { getEnsBrowsingSettings } from "./settingsStorage";
import type { TabContext } from "./types";
import {
  listWeb3Entries,
  mfsPathFor,
  removeWeb3CacheEntry,
} from "./web3UrlCache";

export function handleEnsBrowsingMessage(
  msg: unknown,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response: unknown) => void,
): boolean {
  if (!msg || typeof msg !== "object") return false;
  const message = msg as Record<string, unknown>;
  const type = typeof message.type === "string" ? message.type : "";
  const recognizedTypes = new Set([
    "ens-cache-metadata",
    "ens-get-tab-ctx",
    "ens-cache-check",
    "ens-resolve",
    "ens-open-on-gateway",
    "ens-probe-kubo",
    "ens-get-theme-tokens",
    "ens-probe-kubo-api",
    "ens-web3-list",
    "ens-web3-evict",
    "ens-list-connected-dapps",
    "ens-revoke-connected-dapp",
    "ens-search-dapp-directory",
    "ens-cache-browser-image",
    "ens-open-dapp-url",
  ]);
  if (!recognizedTypes.has(type)) return false;

  if (!isAuthorizedEnsBrowsingSender(type, sender)) {
    sendResponse({ ok: false, error: "Unauthorized" });
    return true;
  }

  if (message.type === "ens-cache-metadata") {
    const name = String(message.name ?? "").toLowerCase().slice(0, 255);
    const title =
      typeof message.title === "string"
        ? message.title.trim().slice(0, 120) || undefined
        : undefined;
    const favicon =
      typeof message.favicon === "string"
        ? sanitizeUntrustedImageUrl(message.favicon) ??
          sanitizeTrustedBrowserFaviconSrc(message.favicon) ??
          undefined
        : undefined;
    if (
      !/^(?:[a-z0-9-]+\.)+(?:eth|gwei)$/.test(name) &&
      !/^0x[a-f0-9]{40}$/.test(name)
    ) {
      sendResponse({ ok: false, error: "invalid name" });
      return true;
    }
    updateCachedMetadata(name, { title, favicon }).then(
      () => sendResponse({ ok: true }),
      (error) =>
        sendResponse({ ok: false, error: error?.message ?? String(error) }),
    );
    return true;
  }

  if (message.type === "ens-get-tab-ctx") {
    const tabId = sender.tab?.id;
    if (tabId == null) {
      sendResponse({ ctx: null });
      return true;
    }
    (async () => {
      const key = `tab:${tabId}`;
      const stored = (await chrome.storage.session.get(key))[key] as
        | TabContext
        | undefined;
      if (stored) {
        sendResponse({ ctx: stored });
        return;
      }
      const senderUrl = sender.tab?.url ?? sender.url;
      if (!senderUrl) {
        sendResponse({ ctx: null });
        return;
      }
      let url: URL;
      try {
        url = new URL(senderUrl);
      } catch {
        sendResponse({ ctx: null });
        return;
      }
      const settings = await getEnsBrowsingSettings();
      const parsed = parseGatewayHost(url.hostname, settings.gatewayHost);
      if (!parsed) {
        sendResponse({ ctx: null });
        return;
      }
      const hit = await findCachedByGatewayLabel(parsed.kind, parsed.label).catch(
        () => null,
      );
      if (!hit) {
        sendResponse({ ctx: null });
        return;
      }
      sendResponse({
        ctx: {
          ensName: hit.ensName,
          kind: hit.kind,
          value: hit.value,
          path: url.pathname + url.search + url.hash,
          trustedDirectly: false,
        } satisfies TabContext,
      });
    })();
    return true;
  }

  if (message.type === "ens-cache-check") {
    const tabId = sender.tab?.id;
    const name = String(message.name ?? "").toLowerCase();
    const path = String(message.path ?? "/");
    const search = String(message.search ?? "");
    const hash = String(message.hash ?? "");
    if (tabId == null || !name) {
      sendResponse({ cached: false });
      return true;
    }
    (async () => {
      if (isGweiName(name)) {
        sendResponse({ cached: false });
        return;
      }
      const cached = await getCached(name).catch(() => null);
      if (!cached) {
        sendResponse({ cached: false });
        return;
      }
      const gatewayUrl = await chooseGatewayUrl(
        cached.kind,
        cached.value,
        cached.ensName,
        path,
        search,
        hash,
      );
      const context: TabContext = {
        ensName: cached.ensName,
        kind: cached.kind,
        value: cached.value,
        path: path + search + hash,
        trustedDirectly: false,
        contractAddress: cached.contractAddress,
        fromCache: true,
      };
      await chrome.storage.session.set({ [`tab:${tabId}`]: context });
      await prepareHostedGatewayNavigation(tabId, gatewayUrl);
      sendResponse({ cached: true, gatewayUrl });
      refreshFromCache(tabId, name, path, search, hash, cached.value).catch(
        (error) => console.warn("[ens] refreshFromCache threw", error),
      );
    })();
    return true;
  }

  if (message.type === "ens-resolve") {
    const tabId = sender.tab?.id;
    const name = String(message.name);
    if (tabId == null) {
      sendResponse({ ok: false, error: "no tabId" });
      return true;
    }
    resolveAndRedirect(
      tabId,
      name,
      String(message.path ?? "/"),
      String(message.search ?? ""),
      String(message.hash ?? ""),
    ).then(
      (result) => sendResponse(result),
      (error) =>
        sendResponse({ ok: false, error: error?.message ?? String(error) }),
    );
    return true;
  }

  if (
    message.type === "ens-open-on-gateway" &&
    typeof message.url === "string"
  ) {
    const tabId = sender.tab?.id;
    const url = message.url;
    if (tabId == null) {
      sendResponse({ ok: false, error: "no tabId" });
      return true;
    }
    (async () => {
      try {
        if (!hostedGatewayKind(url)) {
          sendResponse({ ok: false, error: "invalid hosted gateway URL" });
          return;
        }
        await prepareHostedGatewayNavigation(tabId, url);
        await chrome.tabs.update(tabId, { url });
        sendResponse({ ok: true });
      } catch (error) {
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    })();
    return true;
  }

  if (message.type === "ens-probe-kubo") {
    probeKuboGateway({ force: true }).then(
      (reachable) => sendResponse({ ok: true, reachable }),
      (error) =>
        sendResponse({ ok: false, error: error?.message ?? String(error) }),
    );
    return true;
  }

  if (message.type === "ens-get-theme-tokens") {
    (async () => {
      const stored = (await chrome.storage.local.get(
        SELECTED_THEME_STORAGE_KEY,
      )) as { selectedThemeId?: string };
      const themeId: ThemeId = isThemeId(stored.selectedThemeId)
        ? stored.selectedThemeId
        : DEFAULT_THEME_ID;
      const isDark = isDarkThemeId(themeId);
      const theme = isDark
        ? {
            themeId,
            isDark,
            bg: "#0F1320",
            fg: "#E6E8EF",
            fgMuted: "#8C92A8",
            border: "#202637",
            shadow: "0 4px 14px 0 rgba(0,0,0,0.45)",
            accent: "#F0C020",
          }
        : {
            themeId,
            isDark,
            bg: "#121212",
            fg: "#FFFFFF",
            fgMuted: "#A8A8A8",
            border: "#000000",
            shadow: "0 2px 0 0 #000000",
            accent: "#F0C020",
          };
      sendResponse({ ok: true, theme });
    })();
    return true;
  }

  if (message.type === "ens-probe-kubo-api") {
    probeKuboApi().then(
      (probe) => sendResponse({ ok: true, probe }),
      (error) =>
        sendResponse({ ok: false, error: error?.message ?? String(error) }),
    );
    return true;
  }

  if (message.type === "ens-web3-list") {
    listWeb3Entries().then(
      (entries) => sendResponse({ ok: true, entries }),
      (error) =>
        sendResponse({ ok: false, error: error?.message ?? String(error) }),
    );
    return true;
  }

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

  if (message.type === "ens-open-dapp-url") {
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
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      !url.hostname
    ) {
      sendResponse({ ok: false, error: "Invalid URL" });
      return true;
    }
    chrome.tabs.create({ url: url.href, active: true }).then(
      () => sendResponse({ ok: true }),
      () => sendResponse({ ok: false, error: "Could not open URL" }),
    );
    return true;
  }

  if (
    message.type === "ens-web3-evict" &&
    typeof message.contractAddress === "string"
  ) {
    const address = message.contractAddress;
    (async () => {
      const entry = await removeWeb3CacheEntry(address).catch(() => null);
      if (entry) {
        await Promise.allSettled([
          unpinFromKubo(entry.cid),
          removeMfsPath(mfsPathFor(entry.contractAddress, entry.contentHash)),
        ]);
      }
      sendResponse({ ok: true });
    })();
    return true;
  }

  return false;
}
