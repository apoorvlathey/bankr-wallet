// Message handlers for ENS browsing. The SW message router (background.ts)
// calls `handleEnsBrowsingMessage` first; it returns `true` only for messages
// it actually handles, preserving fall-through to the wallet's other routes.
//
// Routes:
//   - ens-resolve              : interstitial requests fresh resolution
//   - ens-cache-check          : interstitial fast-path before falling through
//                                to a fresh resolution (synchronous redirect)
//   - ens-get-tab-ctx          : banner content script asks for its identity
//   - ens-get-theme-tokens     : banner content script asks for theme colors
//
// All redirect targets are computed from the current settings:
// useLocalGateway ON + Kubo reachable → local subdomain gateway; otherwise →
// hosted gateway (eth.limo / w3eth.io).

import { getEnsBrowsingSettings } from "./settingsStorage";
import { resolveEns } from "./resolver";
import {
  buildHostedGatewayUrl,
  buildSubdomainUrl,
  parseGatewayHost,
} from "./gateway";
import { addEthGatewayBypassForTab, addW3ethBypassForTab } from "./dnrRules";
import {
  findCachedByGatewayLabel,
  getCached,
  setCached,
} from "./cache";
import {
  probeKuboGateway,
  probeKuboApi,
  removeMfsPath,
  unpinFromKubo,
} from "./kubo";
import {
  listWeb3Entries,
  mfsPathFor,
  removeWeb3CacheEntry,
} from "./web3UrlCache";
import type { ResolveKind, TabContext } from "./types";

const ERROR_PAGE = "ens-error.html";

function errorPageUrl(
  ensName: string,
  error: string,
  path: string,
  search: string,
  hash: string,
): string {
  const u = new URL(chrome.runtime.getURL(ERROR_PAGE));
  u.searchParams.set("name", ensName);
  u.searchParams.set("error", error);
  if (path && path !== "/") u.searchParams.set("path", path);
  if (search) u.searchParams.set("search", search);
  if (hash) u.searchParams.set("hash", hash);
  return u.toString();
}

// Pick the right gateway URL given current settings. When `useLocalGateway`
// is ON and Kubo is reachable (checked elsewhere), serve from the local
// subdomain gateway so the content-script banner can render. Otherwise route
// to the hosted gateway.
async function chooseGatewayUrl(
  kind: ResolveKind,
  value: string,
  ensName: string,
  path: string,
  search: string,
  hash: string,
): Promise<string> {
  const settings = await getEnsBrowsingSettings();
  if (settings.useLocalGateway && (await shouldServeLocally(kind))) {
    return buildSubdomainUrl(kind, value, path || "/", search, hash, {
      host: settings.gatewayHost,
      port: settings.gatewayPort,
    });
  }
  return buildHostedGatewayUrl(kind, ensName, path || "/", search, hash);
}

// Decide whether to use the local Kubo subdomain gateway vs the hosted one.
//   - ipfs / ipns: needs `useLocalGateway` + Kubo gateway reachable.
//   - web3 (ERC-4804): the resolver only produces an IPFS CID when
//     `pinOnchainHtml` is ON (otherwise it returns the raw contract address
//     for w3eth.io routing), so seeing a `kind: "web3"` resolution here means
//     pinning is already enabled — we just need the Kubo gateway reachable.
async function shouldServeLocally(kind: ResolveKind): Promise<boolean> {
  const settings = await getEnsBrowsingSettings();
  if (kind === "web3") {
    if (!settings.pinOnchainHtml) return false;
    return probeKuboGateway();
  }
  if (!settings.useLocalGateway) return false;
  return probeKuboGateway();
}

async function resolveAndRedirect(
  tabId: number,
  ensName: string,
  path: string,
  search: string,
  hash: string,
): Promise<{ ok: true } | { ok: false; error: string; code?: string }> {
  const result = await resolveEns(ensName);
  if (!result.ok) {
    if (result.code === "kubo-cors-blocked") {
      return { ok: false, error: result.error, code: result.code };
    }
    await chrome.tabs.update(tabId, {
      url: errorPageUrl(ensName, result.error, path, search, hash),
    });
    return { ok: false, error: result.error };
  }

  const target = await chooseGatewayUrl(
    result.kind,
    result.value,
    result.ensName,
    path,
    search,
    hash,
  );

  const ctx: TabContext = {
    ensName: result.ensName,
    kind: result.kind,
    value: result.value,
    path: path + search + hash,
    trustedDirectly: result.trustedDirectly,
    contractAddress: result.contractAddress,
  };
  await chrome.storage.session.set({ [`tab:${tabId}`]: ctx });

  // Skip the ENS-resolve cache for raw-address resolutions: there's no ENS
  // lookup to cache, and `fetchPinAndCacheErc4804` has its own sha256-based
  // per-contract dedup that handles unchanged re-resolves cheaply.
  if (!/^0x[a-f0-9]{40}$/i.test(result.ensName)) {
    await setCached({
      ensName: result.ensName,
      kind: result.kind,
      value: result.value,
      resolvedAt: Date.now(),
      contractAddress: result.contractAddress,
    }).catch((e) => console.warn("[ens] cache write failed", e));
  }

  await chrome.tabs.update(tabId, { url: target });
  return { ok: true };
}

// Stale-while-revalidate. On a cache-hit redirect we kick this off; if the
// fresh value differs from the cached one, we update the cache + session ctx
// and notify the banner (local-gateway path only) so it can offer a reload.
async function refreshFromCache(
  tabId: number,
  ensName: string,
  path: string,
  search: string,
  hash: string,
  cachedValue: string,
) {
  const result = await resolveEns(ensName);
  if (!result.ok) {
    console.log(`[ens] background refresh of ${ensName} failed: ${result.error}`);
    return;
  }
  await setCached({
    ensName: result.ensName,
    kind: result.kind,
    value: result.value,
    resolvedAt: Date.now(),
    contractAddress: result.contractAddress,
  }).catch(() => undefined);

  if (result.value === cachedValue) return;

  const fresh: TabContext = {
    ensName: result.ensName,
    kind: result.kind,
    value: result.value,
    path: path + search + hash,
    trustedDirectly: result.trustedDirectly,
    contractAddress: result.contractAddress,
  };
  await chrome.storage.session.set({ [`tab:${tabId}`]: fresh });

  const newGateway = await chooseGatewayUrl(
    result.kind,
    result.value,
    result.ensName,
    path,
    search,
    hash,
  );
  chrome.tabs
    .sendMessage(tabId, {
      type: "ens-content-updated",
      ensName: result.ensName,
      kind: result.kind,
      value: result.value,
      gatewayUrl: newGateway,
    })
    .catch(() => {
      // Banner content script may not be listening (hosted-gateway route or
      // page still loading); the next hydrate will see the fresh ctx anyway.
    });
}

export function handleEnsBrowsingMessage(
  msg: unknown,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response: unknown) => void,
): boolean {
  if (!msg || typeof msg !== "object") return false;
  const m = msg as Record<string, unknown>;

  if (m.type === "ens-get-tab-ctx") {
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
      // Reverse lookup for users who navigate straight to a gateway URL.
      const senderUrl = sender.tab?.url ?? sender.url;
      if (!senderUrl) {
        sendResponse({ ctx: null });
        return;
      }
      let u: URL;
      try {
        u = new URL(senderUrl);
      } catch {
        sendResponse({ ctx: null });
        return;
      }
      const settings = await getEnsBrowsingSettings();
      const parsed = parseGatewayHost(u.hostname, settings.gatewayHost);
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
          path: u.pathname + u.search + u.hash,
          trustedDirectly: false,
        } satisfies TabContext,
      });
    })();
    return true;
  }

  if (m.type === "ens-cache-check") {
    const tabId = sender.tab?.id ?? (m.tabId as number | undefined);
    const name = String(m.name ?? "").toLowerCase();
    const path = String(m.path ?? "/");
    const search = String(m.search ?? "");
    const hash = String(m.hash ?? "");
    if (tabId == null || !name) {
      sendResponse({ cached: false });
      return true;
    }
    (async () => {
      const c = await getCached(name).catch(() => null);
      if (!c) {
        sendResponse({ cached: false });
        return;
      }
      const gatewayUrl = await chooseGatewayUrl(
        c.kind,
        c.value,
        c.ensName,
        path,
        search,
        hash,
      );
      const ctx: TabContext = {
        ensName: c.ensName,
        kind: c.kind,
        value: c.value,
        path: path + search + hash,
        trustedDirectly: false,
        contractAddress: c.contractAddress,
        fromCache: true,
      };
      await chrome.storage.session.set({ [`tab:${tabId}`]: ctx });
      sendResponse({ cached: true, gatewayUrl });
      refreshFromCache(tabId, name, path, search, hash, c.value).catch((e) =>
        console.warn("[ens] refreshFromCache threw", e),
      );
    })();
    return true;
  }

  if (m.type === "ens-resolve") {
    const tabId = sender.tab?.id ?? (m.tabId as number | undefined);
    if (tabId == null) {
      sendResponse({ ok: false, error: "no tabId" });
      return true;
    }
    resolveAndRedirect(
      tabId,
      String(m.name),
      String(m.path ?? "/"),
      String(m.search ?? ""),
      String(m.hash ?? ""),
    ).then(
      (result) => sendResponse(result),
      (e) => sendResponse({ ok: false, error: e?.message ?? String(e) }),
    );
    return true;
  }

  if (m.type === "ens-open-on-gateway" && typeof m.url === "string") {
    // User clicked "Open on eth.limo" / "Open on w3eth.io gateway" from the
    // banner menu. Install per-tab ALLOW rule(s) so our gateway-redirect rules
    // don't rewrite the navigation straight back to local, then navigate.
    const tabId = sender.tab?.id ?? (m.tabId as number | undefined);
    const url = m.url;
    if (tabId == null) {
      sendResponse({ ok: false, error: "no tabId" });
      return true;
    }
    (async () => {
      try {
        let host = "";
        try {
          host = new URL(url).hostname.toLowerCase();
        } catch {
          /* keep host empty — fall through with no bypass */
        }
        if (/\.eth\.(?:limo|link)\.?$/.test(host)) {
          await addEthGatewayBypassForTab(tabId);
        } else if (/\.w3eth\.io\.?$/.test(host)) {
          await addW3ethBypassForTab(tabId);
        }
        await chrome.tabs.update(tabId, { url });
        sendResponse({ ok: true });
      } catch (e) {
        sendResponse({ ok: false, error: e instanceof Error ? e.message : String(e) });
      }
    })();
    return true;
  }

  if (m.type === "ens-probe-kubo") {
    probeKuboGateway({ force: true }).then(
      (reachable) => sendResponse({ ok: true, reachable }),
      (e) => sendResponse({ ok: false, error: e?.message ?? String(e) }),
    );
    return true;
  }

  if (m.type === "ens-get-theme-tokens") {
    // Banner content script asks for the active theme's colors so it can
    // paint without loading Chakra. We hand it a flat token set; the banner
    // re-renders on `chrome.storage.onChanged` when the user switches theme.
    (async () => {
      const stored = (await chrome.storage.local.get("selectedThemeId")) as {
        selectedThemeId?: "bauhaus" | "midnight";
      };
      const themeId = stored.selectedThemeId === "midnight" ? "midnight" : "bauhaus";
      const theme =
        themeId === "midnight"
          ? {
              themeId,
              bg: "#0F1320",
              fg: "#E6E8EF",
              fgMuted: "#8C92A8",
              border: "#202637",
              shadow: "0 4px 14px 0 rgba(0,0,0,0.45)",
              accent: "#F0C020",
            }
          : {
              themeId,
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

  if (m.type === "ens-probe-kubo-api") {
    probeKuboApi().then(
      (probe) => sendResponse({ ok: true, probe }),
      (e) => sendResponse({ ok: false, error: e?.message ?? String(e) }),
    );
    return true;
  }

  if (m.type === "ens-web3-list") {
    listWeb3Entries().then(
      (entries) => sendResponse({ ok: true, entries }),
      (e) => sendResponse({ ok: false, error: e?.message ?? String(e) }),
    );
    return true;
  }

  if (m.type === "ens-web3-evict" && typeof m.contractAddress === "string") {
    const addr = m.contractAddress;
    (async () => {
      const entry = await removeWeb3CacheEntry(addr).catch(() => null);
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
