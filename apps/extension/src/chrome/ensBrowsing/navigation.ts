import { setCached } from "./cache";
import {
  addEthGatewayBypassForTab,
  addGweiDomainsBypassForTab,
  addW3ethBypassForTab,
  removeEthGatewayRedirectRule,
  removeGweiDomainsRedirectRule,
  removeW3ethRedirectRule,
} from "./dnrRules";
import { buildHostedGatewayUrl, buildSubdomainUrl } from "./gateway";
import { probeKuboGateway } from "./kubo";
import { isGweiName, resolveEns, resolveGwei } from "./resolver";
import { getEnsBrowsingSettings } from "./settingsStorage";
import type { ResolveKind, TabContext } from "./types";

const ERROR_PAGE = "ens-error.html";

function errorPageUrl(
  ensName: string,
  error: string,
  path: string,
  search: string,
  hash: string,
): string {
  const url = new URL(chrome.runtime.getURL(ERROR_PAGE));
  url.searchParams.set("name", ensName);
  url.searchParams.set("error", error);
  if (path && path !== "/") url.searchParams.set("path", path);
  if (search) url.searchParams.set("search", search);
  if (hash) url.searchParams.set("hash", hash);
  return url.toString();
}

async function shouldServeLocally(kind: ResolveKind): Promise<boolean> {
  const settings = await getEnsBrowsingSettings();
  if (kind === "web3") {
    if (!settings.pinOnchainHtml) return false;
    return probeKuboGateway();
  }
  if (!settings.useLocalGateway) return false;
  return probeKuboGateway();
}

export async function chooseGatewayUrl(
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

export function hostedGatewayKind(
  url: string,
): "eth" | "gwei" | "w3eth" | null {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (/\.eth\.(?:limo|link)\.?$/.test(host)) return "eth";
    if (/\.gwei\.domains\.?$/.test(host)) return "gwei";
    if (/\.w3eth\.io\.?$/.test(host)) return "w3eth";
  } catch {
    return null;
  }
  return null;
}

export async function prepareHostedGatewayNavigation(
  tabId: number,
  url: string,
): Promise<void> {
  const kind = hostedGatewayKind(url);
  if (!kind) return;
  try {
    if (kind === "eth") {
      await addEthGatewayBypassForTab(tabId);
    } else if (kind === "gwei") {
      await addGweiDomainsBypassForTab(tabId);
    } else {
      await addW3ethBypassForTab(tabId);
    }
  } catch (error) {
    console.warn(
      "[ens] hosted gateway bypass failed; removing redirect rule",
      error,
    );
    if (kind === "eth") {
      await removeEthGatewayRedirectRule().catch(() => undefined);
    } else if (kind === "gwei") {
      await removeGweiDomainsRedirectRule().catch(() => undefined);
    } else {
      await removeW3ethRedirectRule().catch(() => undefined);
    }
  }
}

export async function resolveAndRedirect(
  tabId: number,
  ensName: string,
  path: string,
  search: string,
  hash: string,
): Promise<{ ok: true } | { ok: false; error: string; code?: string }> {
  const result = isGweiName(ensName)
    ? await resolveGwei(ensName)
    : await resolveEns(ensName);
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
  const context: TabContext = {
    ensName: result.ensName,
    kind: result.kind,
    value: result.value,
    path: path + search + hash,
    trustedDirectly: result.trustedDirectly,
    contractAddress: result.contractAddress,
  };
  await chrome.storage.session.set({ [`tab:${tabId}`]: context });
  await setCached({
    ensName: result.ensName,
    kind: result.kind,
    value: result.value,
    resolvedAt: Date.now(),
    contractAddress: result.contractAddress,
  }).catch((error) => console.warn("[ens] cache write failed", error));
  await prepareHostedGatewayNavigation(tabId, target);
  await chrome.tabs.update(tabId, { url: target });
  return { ok: true };
}

export async function refreshFromCache(
  tabId: number,
  ensName: string,
  path: string,
  search: string,
  hash: string,
  cachedValue: string,
): Promise<void> {
  const result = isGweiName(ensName)
    ? await resolveGwei(ensName)
    : await resolveEns(ensName);
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
  const gatewayUrl = await chooseGatewayUrl(
    result.kind,
    result.value,
    result.ensName,
    path,
    search,
    hash,
  );
  await prepareHostedGatewayNavigation(tabId, gatewayUrl);
  chrome.tabs
    .sendMessage(tabId, {
      type: "ens-content-updated",
      ensName: result.ensName,
      kind: result.kind,
      value: result.value,
      gatewayUrl,
    })
    .catch(() => undefined);
}
