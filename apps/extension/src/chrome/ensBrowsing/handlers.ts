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
// All redirect targets are computed from the current settings: Tier 2a ON +
// Kubo reachable → local subdomain gateway; otherwise → hosted gateway
// (eth.limo / w3eth.io).

import { getEnsBrowsingSettings } from "./settingsStorage";
import { resolveEns } from "./resolver";
import {
  buildHostedGatewayUrl,
  buildSubdomainUrl,
  parseGatewayHost,
} from "./gateway";
import {
  findCachedByGatewayLabel,
  getCached,
  setCached,
} from "./cache";
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

// Pick the right gateway URL given current settings. Tier 2a (when ON and
// Kubo reachable, checked elsewhere) uses local subdomain serving so the
// content-script banner can render. Tier 1 routes to the hosted gateway.
//
// In this initial Tier-1-only build the local-IPFS branch is wired through a
// stub `shouldServeLocally` that always returns false; Tier 2a tasks (11-13)
// flip the actual probe logic on.
async function chooseGatewayUrl(
  kind: ResolveKind,
  value: string,
  ensName: string,
  path: string,
  search: string,
  hash: string,
): Promise<string> {
  const settings = await getEnsBrowsingSettings();
  if (settings.tier2aLocalIpfs && (await shouldServeLocally(kind))) {
    return buildSubdomainUrl(kind, value, path || "/", search, hash);
  }
  return buildHostedGatewayUrl(kind, ensName, path || "/", search, hash);
}

// Tier 2a probe stub — flipped on in task 12 with the Kubo gateway probe.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function shouldServeLocally(_kind: ResolveKind): Promise<boolean> {
  return false;
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

  await setCached({
    ensName: result.ensName,
    kind: result.kind,
    value: result.value,
    resolvedAt: Date.now(),
    contractAddress: result.contractAddress,
  }).catch((e) => console.warn("[ens] cache write failed", e));

  await chrome.tabs.update(tabId, { url: target });
  return { ok: true };
}

// Stale-while-revalidate. On a cache-hit redirect we kick this off; if the
// fresh value differs from the cached one, we update the cache + session ctx
// and notify the banner (Tier 2a/2b only) so it can offer the user a reload.
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
      // Banner content script may not be listening (Tier 2a off or page
      // still loading); the next hydrate will see the fresh ctx anyway.
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
      const parsed = parseGatewayHost(u.hostname);
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

  // Tier 2a / 2b handlers (ens-get-theme-tokens, ens-probe-kubo, etc.) wire in
  // alongside their tier implementation. This router falls through for them
  // until added.
  return false;
}
