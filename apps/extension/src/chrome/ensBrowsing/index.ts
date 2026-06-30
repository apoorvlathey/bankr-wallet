// ENS browsing entry point — called once at SW boot from background.ts.
//
// Responsibilities:
//   - Sync the dynamic DNR rule against the master `enabled` toggle.
//   - Subscribe to settings changes so toggling `enabled` add/removes the
//     rule without a SW reload.
//   - Clean up per-tab session storage on `chrome.tabs.onRemoved`.

import {
  getEnsBrowsingSettings,
  onEnsBrowsingSettingsChanged,
} from "./settingsStorage";
import {
  installEthGatewayRedirectRule,
  installEthRedirectRule,
  installGweiDomainsRedirectRule,
  installW3linkRedirectRule,
  installW3ethRedirectRule,
  removeEthGatewayBypassForTab,
  removeEthGatewayRedirectRule,
  removeEthRedirectRule,
  removeGweiDomainsBypassForTab,
  removeGweiDomainsRedirectRule,
  removeW3linkRedirectRule,
  removeW3ethBypassForTab,
  removeW3ethRedirectRule,
} from "./dnrRules";
import type { EnsBrowsingSettings } from "./settingsStorage";

export { handleEnsBrowsingMessage } from "./handlers";

let initialized = false;

// w3eth.io interception only makes sense when the resolver can actually serve
// it from local Kubo — i.e. both local-gateway and pin-onchain-html are on.
// Otherwise we'd redirect w3eth.io → interstitial → w3eth.io in a loop.
function shouldInterceptW3eth(s: EnsBrowsingSettings): boolean {
  return s.enabled && s.useLocalGateway && s.pinOnchainHtml;
}

// Hosted gateway interception is only useful when the user has opted into local
// IPFS routing. Hosted fallback already lands on eth.limo / gwei.domains;
// rewriting those gateways while hosted routing is active creates an
// interstitial bounce loop.
function shouldInterceptEthGateway(s: EnsBrowsingSettings): boolean {
  return s.enabled && s.useLocalGateway;
}

async function syncRules(settings: EnsBrowsingSettings): Promise<void> {
  if (settings.enabled) {
    await Promise.all([
      installEthRedirectRule(),
      installW3linkRedirectRule(),
    ]);
  } else {
    await Promise.all([
      removeEthRedirectRule(),
      removeW3linkRedirectRule(),
    ]);
  }
  if (shouldInterceptEthGateway(settings)) {
    await Promise.all([
      installEthGatewayRedirectRule(),
      installGweiDomainsRedirectRule(),
    ]);
  } else {
    await Promise.all([
      removeEthGatewayRedirectRule(),
      removeGweiDomainsRedirectRule(),
    ]);
  }
  if (shouldInterceptW3eth(settings)) {
    await installW3ethRedirectRule();
  } else {
    await removeW3ethRedirectRule();
  }
}

export async function initEnsBrowsing(): Promise<void> {
  if (initialized) return;
  initialized = true;

  // Initial sync — re-install on every SW wake. Dynamic rules are persistent
  // across SW restart but the redirect target embeds `chrome.runtime.getURL`,
  // and the extension ID can change between unpacked reloads. Idempotent
  // upsert (removeRuleIds + addRules) handles both first-install and refresh.
  const settings = await getEnsBrowsingSettings();
  await syncRules(settings).catch((e) =>
    console.warn("[ens] failed to install DNR rules on boot", e),
  );

  onEnsBrowsingSettingsChanged(async (next) => {
    try {
      await syncRules(next);
    } catch (e) {
      console.warn("[ens] failed to sync DNR rules on settings change", e);
    }
  });

  chrome.tabs.onRemoved.addListener((tabId) => {
    chrome.storage.session.remove(`tab:${tabId}`).catch(() => undefined);
    removeEthGatewayBypassForTab(tabId).catch(() => undefined);
    removeGweiDomainsBypassForTab(tabId).catch(() => undefined);
    removeW3ethBypassForTab(tabId).catch(() => undefined);
  });
}
