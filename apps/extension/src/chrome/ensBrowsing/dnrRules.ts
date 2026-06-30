// Dynamic declarativeNetRequest rules that intercept `*.eth` / `*.gwei`
// navigations and bounce them to the extension's interstitial page with the
// original URL preserved in the fragment. The interstitial then messages the
// SW to do the actual name resolution.
//
// Why DNR instead of webNavigation: DNR is silent on install (no permission
// warning); webNavigation triggers "Read your browsing history" on update,
// which would disable the extension for every existing user until they
// re-approve. DNR lets us ship default-ON with zero permission UX.

const ETH_REDIRECT_RULE_ID = 1001;
const ETH_GATEWAY_REDIRECT_RULE_ID = 1002;
const ETH_GATEWAY_BYPASS_RULE_ID = 1003;
const W3ETH_REDIRECT_RULE_ID = 1004;
const W3ETH_BYPASS_RULE_ID = 1005;
const W3LINK_REDIRECT_RULE_ID = 1006;
const GWEI_DOMAINS_REDIRECT_RULE_ID = 1009;
const GWEI_DOMAINS_BYPASS_RULE_ID = 1010;

// Any host ending in `.eth` or `.gwei` (first-level or arbitrary subdomain).
// Excludes hosted gateways by construction: those hosts end in `.limo`,
// `.domains`, or `.io`, not `.eth` / `.gwei`.
const NAME_REGEX =
  "^https?://(?:[a-z0-9-]+\\.)+(?:eth|gwei)\\.?(?::\\d+)?(?:/.*)?$";

// Match `<label>.eth.limo` / `<label>.eth.link` and capture the label + path.
// We rewrite to `http://<label>.eth<path>` so the base name rule catches
// the result on the next pass and routes through our interstitial. This gives
// the user our verified-RPC resolution + local gateway path instead of the
// public eth.limo / eth.link gateways.
const ETH_GATEWAY_REGEX =
  "^https?://([a-z0-9-]+(?:\\.[a-z0-9-]+)*)\\.eth\\.(?:limo|link)\\.?(?::\\d+)?(/.*)?$";

// Match `<label>.gwei.domains` and capture the label + path. We rewrite to
// `http://<label>.gwei<path>` so NAME_REGEX catches the result on the next pass.
const GWEI_DOMAINS_REGEX =
  "^https?://([a-z0-9-]+(?:\\.[a-z0-9-]+)*)\\.gwei\\.domains\\.?(?::\\d+)?(/.*)?$";

// Match `<label>.w3eth.io` (the ERC-4804 hosted gateway). w3eth.io strips the
// `.eth` suffix from the ENS name (`vitalik.eth` → `vitalik.w3eth.io`), so we
// rewrite back to `http://<label>.eth<path>` and let the base name rule route it
// through the interstitial. We only install this rule when the local Kubo
// pinning path is fully enabled — otherwise resolveAndRedirect would route
// the request right back to w3eth.io and bounce indefinitely.
const W3ETH_REGEX =
  "^https?://([a-z0-9-]+(?:\\.[a-z0-9-]+)*)\\.w3eth\\.io\\.?(?::\\d+)?(/.*)?$";

// Match w3link's ERC-4804 mainnet gateway shape:
// `<0x-address>.1.w3link.io`. The middle label is the chain id; this resolver
// currently reads ERC-4804 from Ethereum mainnet only, so we intentionally
// accept chain id 1 rather than every numeric chain label.
const W3LINK_MAINNET_REGEX =
  "^https?://(0x[a-f0-9]{40})\\.1\\.w3link\\.io\\.?(?::\\d+)?(/.*)?$";

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
          regexFilter: NAME_REGEX,
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

export async function installEthGatewayRedirectRule(): Promise<void> {
  // Rewrites `https?://<label>.eth.(limo|link)[:port][/path]` → `http://<label>.eth[/path]`.
  // Lower priority than the base name rule (priority 2). They don't compete on
  // the same request; the base name rule fires on the second pass after this
  // rewrite. Keeping priorities distinct makes the chain easier to reason about.
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: [ETH_GATEWAY_REDIRECT_RULE_ID],
    addRules: [
      {
        id: ETH_GATEWAY_REDIRECT_RULE_ID,
        priority: 1,
        action: {
          type: chrome.declarativeNetRequest.RuleActionType.REDIRECT,
          redirect: { regexSubstitution: "http://\\1.eth\\2" },
        },
        condition: {
          regexFilter: ETH_GATEWAY_REGEX,
          resourceTypes: [chrome.declarativeNetRequest.ResourceType.MAIN_FRAME],
        },
      },
    ],
  });
  console.log("[ens] DNR eth.limo/link redirect rule installed");
}

export async function removeEthGatewayRedirectRule(): Promise<void> {
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: [ETH_GATEWAY_REDIRECT_RULE_ID],
  });
  console.log("[ens] DNR eth.limo/link redirect rule removed");
}

export async function installGweiDomainsRedirectRule(): Promise<void> {
  // Rewrites `https?://<label>.gwei.domains[:port][/path]` →
  // `http://<label>.gwei[/path]`. Lower priority than the base name rule
  // so the rewritten request flows through the interstitial on the next pass.
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: [GWEI_DOMAINS_REDIRECT_RULE_ID],
    addRules: [
      {
        id: GWEI_DOMAINS_REDIRECT_RULE_ID,
        priority: 1,
        action: {
          type: chrome.declarativeNetRequest.RuleActionType.REDIRECT,
          redirect: { regexSubstitution: "http://\\1.gwei\\2" },
        },
        condition: {
          regexFilter: GWEI_DOMAINS_REGEX,
          resourceTypes: [chrome.declarativeNetRequest.ResourceType.MAIN_FRAME],
        },
      },
    ],
  });
  console.log("[ens] DNR gwei.domains redirect rule installed");
}

export async function removeGweiDomainsRedirectRule(): Promise<void> {
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: [GWEI_DOMAINS_REDIRECT_RULE_ID],
  });
  console.log("[ens] DNR gwei.domains redirect rule removed");
}

export async function installW3linkRedirectRule(): Promise<void> {
  // Send `https?://<addr>.1.w3link.io[:port][/path]` straight to the
  // interstitial. Avoid a two-hop `w3link -> <addr>.eth -> interstitial`
  // redirect because Chromium does not reliably re-run DNR on the rewritten
  // main-frame URL before DNS/navigation handling.
  const interstitial = chrome.runtime.getURL("interstitial.html");
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: [W3LINK_REDIRECT_RULE_ID],
    addRules: [
      {
        id: W3LINK_REDIRECT_RULE_ID,
        priority: 1,
        action: {
          type: chrome.declarativeNetRequest.RuleActionType.REDIRECT,
          redirect: { regexSubstitution: `${interstitial}#\\0` },
        },
        condition: {
          regexFilter: W3LINK_MAINNET_REGEX,
          resourceTypes: [chrome.declarativeNetRequest.ResourceType.MAIN_FRAME],
        },
      },
    ],
  });
  console.log("[ens] DNR w3link.io redirect rule installed");
}

export async function removeW3linkRedirectRule(): Promise<void> {
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: [W3LINK_REDIRECT_RULE_ID],
  });
  console.log("[ens] DNR w3link.io redirect rule removed");
}

// Per-tab session ALLOW rule that punches through the gateway redirect for a
// specific set of tabs — used when the user clicks "Open on eth.limo" so that
// navigation actually reaches the public gateway instead of getting rewritten
// back to local. Priority 3 wins over both the .eth (2) and gateway (1) rules.

async function getEthGatewayBypassTabs(): Promise<number[]> {
  const rules = await chrome.declarativeNetRequest.getSessionRules();
  const rule = rules.find((r) => r.id === ETH_GATEWAY_BYPASS_RULE_ID);
  return (rule?.condition.tabIds as number[] | undefined) ?? [];
}

async function setEthGatewayBypassTabs(tabIds: number[]): Promise<void> {
  if (tabIds.length === 0) {
    await chrome.declarativeNetRequest.updateSessionRules({
      removeRuleIds: [ETH_GATEWAY_BYPASS_RULE_ID],
    });
    return;
  }
  await chrome.declarativeNetRequest.updateSessionRules({
    removeRuleIds: [ETH_GATEWAY_BYPASS_RULE_ID],
    addRules: [
      {
        id: ETH_GATEWAY_BYPASS_RULE_ID,
        priority: 3,
        action: { type: chrome.declarativeNetRequest.RuleActionType.ALLOW },
        condition: {
          regexFilter: ETH_GATEWAY_REGEX,
          resourceTypes: [chrome.declarativeNetRequest.ResourceType.MAIN_FRAME],
          tabIds,
        },
      },
    ],
  });
}

export async function addEthGatewayBypassForTab(tabId: number): Promise<void> {
  const current = await getEthGatewayBypassTabs();
  if (current.includes(tabId)) return;
  await setEthGatewayBypassTabs([...current, tabId]);
}

export async function removeEthGatewayBypassForTab(
  tabId: number,
): Promise<void> {
  const current = await getEthGatewayBypassTabs();
  if (!current.includes(tabId)) return;
  await setEthGatewayBypassTabs(current.filter((id) => id !== tabId));
}

// Per-tab session ALLOW rule for "Open on gwei.domains gateway".

async function getGweiDomainsBypassTabs(): Promise<number[]> {
  const rules = await chrome.declarativeNetRequest.getSessionRules();
  const rule = rules.find((r) => r.id === GWEI_DOMAINS_BYPASS_RULE_ID);
  return (rule?.condition.tabIds as number[] | undefined) ?? [];
}

async function setGweiDomainsBypassTabs(tabIds: number[]): Promise<void> {
  if (tabIds.length === 0) {
    await chrome.declarativeNetRequest.updateSessionRules({
      removeRuleIds: [GWEI_DOMAINS_BYPASS_RULE_ID],
    });
    return;
  }
  await chrome.declarativeNetRequest.updateSessionRules({
    removeRuleIds: [GWEI_DOMAINS_BYPASS_RULE_ID],
    addRules: [
      {
        id: GWEI_DOMAINS_BYPASS_RULE_ID,
        priority: 3,
        action: { type: chrome.declarativeNetRequest.RuleActionType.ALLOW },
        condition: {
          regexFilter: GWEI_DOMAINS_REGEX,
          resourceTypes: [chrome.declarativeNetRequest.ResourceType.MAIN_FRAME],
          tabIds,
        },
      },
    ],
  });
}

export async function addGweiDomainsBypassForTab(
  tabId: number,
): Promise<void> {
  const current = await getGweiDomainsBypassTabs();
  if (current.includes(tabId)) return;
  await setGweiDomainsBypassTabs([...current, tabId]);
}

export async function removeGweiDomainsBypassForTab(
  tabId: number,
): Promise<void> {
  const current = await getGweiDomainsBypassTabs();
  if (!current.includes(tabId)) return;
  await setGweiDomainsBypassTabs(current.filter((id) => id !== tabId));
}

// w3eth.io gateway interception. Mirrors the eth.limo/link rule above but only
// installs when both `useLocalGateway` and `pinOnchainHtml` settings are on —
// the resolver only routes ERC-4804 traffic to local Kubo under that combo, so
// installing the rule otherwise would just bounce w3eth.io → interstitial →
// w3eth.io indefinitely.

export async function installW3ethRedirectRule(): Promise<void> {
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: [W3ETH_REDIRECT_RULE_ID],
    addRules: [
      {
        id: W3ETH_REDIRECT_RULE_ID,
        priority: 1,
        action: {
          type: chrome.declarativeNetRequest.RuleActionType.REDIRECT,
          redirect: { regexSubstitution: "http://\\1.eth\\2" },
        },
        condition: {
          regexFilter: W3ETH_REGEX,
          resourceTypes: [chrome.declarativeNetRequest.ResourceType.MAIN_FRAME],
        },
      },
    ],
  });
  console.log("[ens] DNR w3eth.io redirect rule installed");
}

export async function removeW3ethRedirectRule(): Promise<void> {
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: [W3ETH_REDIRECT_RULE_ID],
  });
  console.log("[ens] DNR w3eth.io redirect rule removed");
}

// Per-tab session ALLOW rule for "Open on w3eth.io gateway" — mirrors the
// eth.limo bypass infra. Priority 3 wins over the w3eth.io redirect (1).

async function getW3ethBypassTabs(): Promise<number[]> {
  const rules = await chrome.declarativeNetRequest.getSessionRules();
  const rule = rules.find((r) => r.id === W3ETH_BYPASS_RULE_ID);
  return (rule?.condition.tabIds as number[] | undefined) ?? [];
}

async function setW3ethBypassTabs(tabIds: number[]): Promise<void> {
  if (tabIds.length === 0) {
    await chrome.declarativeNetRequest.updateSessionRules({
      removeRuleIds: [W3ETH_BYPASS_RULE_ID],
    });
    return;
  }
  await chrome.declarativeNetRequest.updateSessionRules({
    removeRuleIds: [W3ETH_BYPASS_RULE_ID],
    addRules: [
      {
        id: W3ETH_BYPASS_RULE_ID,
        priority: 3,
        action: { type: chrome.declarativeNetRequest.RuleActionType.ALLOW },
        condition: {
          regexFilter: W3ETH_REGEX,
          resourceTypes: [chrome.declarativeNetRequest.ResourceType.MAIN_FRAME],
          tabIds,
        },
      },
    ],
  });
}

export async function addW3ethBypassForTab(tabId: number): Promise<void> {
  const current = await getW3ethBypassTabs();
  if (current.includes(tabId)) return;
  await setW3ethBypassTabs([...current, tabId]);
}

export async function removeW3ethBypassForTab(tabId: number): Promise<void> {
  const current = await getW3ethBypassTabs();
  if (!current.includes(tabId)) return;
  await setW3ethBypassTabs(current.filter((id) => id !== tabId));
}
