// ENS identity banner — content script matched on Kubo's subdomain gateway
// (`*.ipfs.localhost` / `*.ipns.localhost`) so the user keeps seeing the
// original ENS name even though the URL bar shows the CID-subdomain target.
//
// Slim adaptation of dapp3's `src/content/banner.ts`: shadow-DOM, body
// margin offset (with MutationObserver wait for early-paint), SPA-nav
// monkey-patch. We drop the address-bar editor, bookmarks, menus, fixed-nav
// shifter, and Helios polling — those re-land if/when Helios ships.
//
// Theme tokens are fetched once from the SW via `ens-get-theme-tokens`;
// Chakra isn't available in content-script land, so colors are applied as
// inline CSS variables on the shadow root.

const BANNER_ID = "walletchan-ens-banner";
const HEIGHT_PX = 40;
const DISMISS_KEY_PREFIX = "walletchan-ens-banner-dismiss:";

type ResolveKind = "ipfs" | "ipns" | "web3";

type TabContext = {
  ensName: string;
  kind: ResolveKind;
  value: string;
  path: string;
  trustedDirectly: boolean;
  contractAddress?: `0x${string}`;
  fromCache?: boolean;
};

type Theme = {
  themeId: "bauhaus" | "midnight";
  bg: string;
  fg: string;
  fgMuted: string;
  border: string;
  shadow: string;
  accent: string;
};

const FALLBACK_THEME: Theme = {
  themeId: "bauhaus",
  bg: "#121212",
  fg: "#FFFFFF",
  fgMuted: "#A8A8A8",
  border: "#000000",
  shadow: "0 2px 0 0 #000000",
  accent: "#F0C020",
};

async function getTabCtx(): Promise<TabContext | null> {
  try {
    const resp = await chrome.runtime.sendMessage({ type: "ens-get-tab-ctx" });
    return (resp?.ctx as TabContext) ?? null;
  } catch {
    return null;
  }
}

async function getTheme(): Promise<Theme> {
  try {
    const resp = await chrome.runtime.sendMessage({
      type: "ens-get-theme-tokens",
    });
    if (resp?.ok && resp.theme) return resp.theme as Theme;
  } catch {
    /* fall through */
  }
  return FALLBACK_THEME;
}

function shortValue(kind: ResolveKind, value: string): string {
  if (kind === "ipns") return value;
  if (value.length <= 16) return value;
  return `${value.slice(0, 8)}…${value.slice(-6)}`;
}

function isDismissedThisSession(ensName: string): boolean {
  try {
    return sessionStorage.getItem(DISMISS_KEY_PREFIX + ensName) === "1";
  } catch {
    return false;
  }
}

function markDismissed(ensName: string) {
  try {
    sessionStorage.setItem(DISMISS_KEY_PREFIX + ensName, "1");
  } catch {
    /* ignore */
  }
}

function applyBodyOffset(target = HEIGHT_PX) {
  const apply = () => {
    if (!document.body) return false;
    const cur = parseFloat(getComputedStyle(document.body).marginTop) || 0;
    document.body.style.marginTop = `${Math.max(cur, target)}px`;
    return true;
  };
  if (apply()) return;
  // Body not parsed yet — wait for it so the first paint already accounts for
  // the banner height instead of briefly rendering under it.
  const obs = new MutationObserver(() => {
    if (apply()) obs.disconnect();
  });
  obs.observe(document.documentElement, { childList: true });
}

function renderBanner(ctx: TabContext, theme: Theme) {
  let host = document.getElementById(BANNER_ID) as HTMLDivElement | null;
  if (!host) {
    host = document.createElement("div");
    host.id = BANNER_ID;
    // Pin above all page content. position:fixed survives the body margin
    // offset and leaves room for the page beneath without overlap.
    host.style.cssText = [
      "all: initial",
      "position: fixed",
      "top: 0",
      "left: 0",
      "right: 0",
      `height: ${HEIGHT_PX}px`,
      "z-index: 2147483647",
      "pointer-events: auto",
    ].join("; ");
    document.documentElement.appendChild(host);
  }
  const shadow = host.shadowRoot ?? host.attachShadow({ mode: "closed" });
  shadow.innerHTML = "";

  const style = document.createElement("style");
  style.textContent = `
    :host { all: initial; }
    .strip {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 0 14px;
      height: ${HEIGHT_PX}px;
      box-sizing: border-box;
      background: ${theme.bg};
      color: ${theme.fg};
      border-bottom: 2px solid ${theme.border};
      box-shadow: ${theme.shadow};
      font-family: "Outfit", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 12px;
      letter-spacing: 0.02em;
    }
    .brand {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 22px;
      height: 22px;
      background: ${theme.accent};
      color: #121212;
      border: 2px solid ${theme.border};
      font-weight: 900;
      font-size: 9px;
      letter-spacing: 0;
      flex-shrink: 0;
    }
    .label {
      font-weight: 700;
      color: ${theme.fgMuted};
      text-transform: uppercase;
      letter-spacing: 0.08em;
      font-size: 10px;
    }
    .name {
      font-weight: 700;
      color: ${theme.fg};
    }
    .arrow { color: ${theme.fgMuted}; }
    .value {
      font-family: "JetBrains Mono", Consolas, monospace;
      font-size: 11px;
      color: ${theme.fgMuted};
    }
    .spacer { flex: 1; }
    .updated {
      background: ${theme.accent};
      color: #121212;
      font-weight: 700;
      padding: 2px 8px;
      cursor: pointer;
      border: 2px solid ${theme.border};
      font-size: 11px;
    }
    .dismiss {
      background: transparent;
      color: ${theme.fgMuted};
      border: 0;
      cursor: pointer;
      font-size: 16px;
      padding: 0 4px;
      line-height: 1;
    }
    .dismiss:hover { color: ${theme.fg}; }
  `;
  shadow.appendChild(style);

  const strip = document.createElement("div");
  strip.className = "strip";

  const brand = document.createElement("span");
  brand.className = "brand";
  brand.textContent = "WC";
  strip.appendChild(brand);

  const label = document.createElement("span");
  label.className = "label";
  label.textContent = "WALLETCHAN · ENS";
  strip.appendChild(label);

  const name = document.createElement("span");
  name.className = "name";
  name.textContent = ctx.ensName;
  strip.appendChild(name);

  const arrow = document.createElement("span");
  arrow.className = "arrow";
  arrow.textContent = "→";
  strip.appendChild(arrow);

  const value = document.createElement("span");
  value.className = "value";
  value.textContent = `${ctx.kind}:${shortValue(ctx.kind, ctx.value)}`;
  strip.appendChild(value);

  const spacer = document.createElement("span");
  spacer.className = "spacer";
  strip.appendChild(spacer);

  const dismiss = document.createElement("button");
  dismiss.className = "dismiss";
  dismiss.textContent = "×";
  dismiss.title = "Hide for this session";
  dismiss.addEventListener("click", () => {
    markDismissed(ctx.ensName);
    teardown();
  });
  strip.appendChild(dismiss);

  shadow.appendChild(strip);
}

function teardown() {
  const host = document.getElementById(BANNER_ID);
  if (host) host.remove();
  if (document.body) document.body.style.marginTop = "";
}

let currentCtx: TabContext | null = null;

async function mount() {
  const ctx = await getTabCtx();
  if (!ctx) return;
  if (isDismissedThisSession(ctx.ensName)) return;
  currentCtx = ctx;
  const theme = await getTheme();
  applyBodyOffset();
  renderBanner(ctx, theme);
}

// Re-render on SPA navigations. Identity is per-ENS-name so for client-side
// route changes inside the same dapp we don't actually re-render — only
// re-mount if the banner got torn off by the page.
function wireSpaNav() {
  const patch = (key: "pushState" | "replaceState") => {
    const orig = history[key];
    history[key] = function (...args) {
      const r = orig.apply(this, args as never);
      queueMicrotask(checkPersisted);
      return r;
    } as typeof orig;
  };
  patch("pushState");
  patch("replaceState");
  window.addEventListener("popstate", checkPersisted);
  window.addEventListener("hashchange", checkPersisted);
}

function checkPersisted() {
  if (!currentCtx) return;
  if (!document.getElementById(BANNER_ID)) {
    // Page replaced the DOM (rare but happens). Re-mount.
    mount().catch(() => undefined);
  }
}

// Listen for content-updated push from SW (Tier 2a/2b: background re-resolve
// detected a contenthash change). We just swap in a yellow "Updated" pill
// the user can click to reload.
chrome.runtime.onMessage.addListener((msg) => {
  if (!msg || typeof msg !== "object") return;
  const m = msg as Record<string, unknown>;
  if (m.type !== "ens-content-updated") return;
  const host = document.getElementById(BANNER_ID);
  if (!host || !host.shadowRoot) return;
  const strip = host.shadowRoot.querySelector(".strip");
  const spacer = host.shadowRoot.querySelector(".spacer");
  if (!strip || !spacer) return;
  if (host.shadowRoot.querySelector(".updated")) return;
  const btn = document.createElement("button");
  btn.className = "updated";
  btn.textContent = "Updated — reload";
  btn.addEventListener("click", () => {
    const url = typeof m.gatewayUrl === "string" ? m.gatewayUrl : null;
    if (url) location.replace(url);
    else location.reload();
  });
  strip.insertBefore(btn, spacer);
});

wireSpaNav();
mount().catch((e) => console.warn("[ens-banner] mount failed", e));
