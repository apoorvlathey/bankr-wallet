// ENS browsing entry point — called once at SW boot from background.ts.
//
// Responsibilities:
//   - Sync the dynamic DNR rule against the current Tier 1 toggle state.
//   - Subscribe to settings changes so toggling Tier 1 add/removes the rule
//     without a SW reload.
//   - Clean up per-tab session storage on `chrome.tabs.onRemoved`.

import {
  getEnsBrowsingSettings,
  onEnsBrowsingSettingsChanged,
} from "./settingsStorage";
import {
  installEthRedirectRule,
  removeEthRedirectRule,
} from "./dnrRules";

export { handleEnsBrowsingMessage } from "./handlers";

let initialized = false;

export async function initEnsBrowsing(): Promise<void> {
  if (initialized) return;
  initialized = true;

  // Initial sync — re-install on every SW wake. Dynamic rules are persistent
  // across SW restart but the redirect target embeds `chrome.runtime.getURL`,
  // and the extension ID can change between unpacked reloads. Idempotent
  // upsert (removeRuleIds + addRules) handles both first-install and refresh.
  const settings = await getEnsBrowsingSettings();
  if (settings.tier1) {
    await installEthRedirectRule().catch((e) =>
      console.warn("[ens] failed to install DNR rule on boot", e),
    );
  }

  onEnsBrowsingSettingsChanged(async (next) => {
    try {
      if (next.tier1) {
        await installEthRedirectRule();
      } else {
        await removeEthRedirectRule();
      }
    } catch (e) {
      console.warn("[ens] failed to sync DNR rule on settings change", e);
    }
  });

  chrome.tabs.onRemoved.addListener((tabId) => {
    chrome.storage.session.remove(`tab:${tabId}`).catch(() => undefined);
  });
}
