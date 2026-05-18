// Dynamic declarativeNetRequest rule that intercepts `*.eth` navigations and
// bounces them to the extension's interstitial page with the original URL
// preserved in the fragment. The interstitial then messages the SW to do
// the actual ENS resolution.
//
// Why DNR instead of webNavigation: DNR is silent on install (no permission
// warning); webNavigation triggers "Read your browsing history" on update,
// which would disable the extension for every existing user until they
// re-approve. DNR lets us ship Tier 1 default-ON with zero permission UX.

const ETH_REDIRECT_RULE_ID = 1001;

// Any host ending in `.eth` (first-level or arbitrary subdomain). Excludes
// `eth.limo` and `w3eth.io` by construction — those hosts end in `.limo` /
// `.io`, not `.eth`.
const ETH_REGEX = "^https?://(?:[a-z0-9-]+\\.)+eth\\.?(?::\\d+)?(?:/.*)?$";

export async function installEthRedirectRule(): Promise<void> {
  // The interstitial is a web-accessible resource, so DNR can redirect to it.
  // We use `regexSubstitution` to stash the entire original URL into the
  // fragment of the redirect target. Fragments tolerate arbitrary chars
  // (including further `#` and `?`), so the interstitial can recover the
  // original URL verbatim via `location.hash.slice(1)` — no encoding needed.
  const interstitial = chrome.runtime.getURL("interstitial.html");
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: [ETH_REDIRECT_RULE_ID],
    addRules: [
      {
        id: ETH_REDIRECT_RULE_ID,
        priority: 2,
        action: {
          type: chrome.declarativeNetRequest.RuleActionType.REDIRECT,
          redirect: { regexSubstitution: `${interstitial}#\\0` },
        },
        condition: {
          regexFilter: ETH_REGEX,
          resourceTypes: [chrome.declarativeNetRequest.ResourceType.MAIN_FRAME],
        },
      },
    ],
  });
  console.log("[ens] DNR redirect rule installed");
}

export async function removeEthRedirectRule(): Promise<void> {
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: [ETH_REDIRECT_RULE_ID],
  });
  console.log("[ens] DNR redirect rule removed");
}

export async function hasEthRedirectRule(): Promise<boolean> {
  const rules = await chrome.declarativeNetRequest.getDynamicRules();
  return rules.some((r) => r.id === ETH_REDIRECT_RULE_ID);
}
