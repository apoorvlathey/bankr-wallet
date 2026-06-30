import {
  addBookmark,
  isBookmarked,
  normalizeBookmarkPath,
  onBookmarksChanged,
  removeBookmark,
  type EnsBookmark,
} from "./ensBrowsing/bookmarks";

// ENS identity banner — content script matched on Kubo's subdomain gateway
// (`*.ipfs.localhost` / `*.ipns.localhost`) so the user keeps seeing the
// original ENS/GNS name even though the URL bar shows the CID-subdomain target.
//
// Shadow-DOM strip pinned to the viewport top, with an editable address-bar
// field in the center that mirrors `<ensName><pathname+search+hash>` and
// auto-updates on SPA navigation. Enter submits to `http://<name>.eth/...` or
// `http://<name>.gwei/...`, which goes through the DNR -> interstitial ->
// resolver flow.
//
// Theme tokens are fetched once from the SW via `ens-get-theme-tokens`;
// Chakra isn't available in content-script land, so colors are applied as
// inline CSS variables on the shadow root.

const BANNER_ID = "walletchan-ens-banner";
const HEIGHT_PX = 44;

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
  isDark: boolean;
  bg: string;
  fg: string;
  fgMuted: string;
  border: string;
  shadow: string;
  accent: string;
};

const FALLBACK_THEME: Theme = {
  themeId: "bauhaus",
  isDark: false,
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

function currentPath(): string {
  const p = location.pathname + location.search + location.hash;
  return p === "/" ? "" : p;
}

function safeFaviconUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  if (/^https?:\/\//i.test(url) || /^data:image\//i.test(url)) return url;
  return undefined;
}

function scrapePageMetadata(): {
  title?: string;
  favicon?: string;
} {
  const title = document.title?.trim() || undefined;
  const iconSelectors = [
    'link[rel~="icon"]',
    'link[rel="shortcut icon"]',
    'link[rel="apple-touch-icon"]',
    'link[rel="apple-touch-icon-precomposed"]',
  ];
  let favicon: string | undefined;
  for (const selector of iconSelectors) {
    const el = document.querySelector(selector) as HTMLLinkElement | null;
    const href = el?.getAttribute("href");
    if (!href) continue;
    try {
      favicon = safeFaviconUrl(new URL(href, location.href).toString());
      if (favicon) break;
    } catch {
      // Malformed favicon href; skip it.
    }
  }
  return { title, favicon };
}

function sendCacheMetadata(ctx: TabContext): void {
  if (/^0x[a-f0-9]{40}$/i.test(ctx.ensName)) return;
  const metadata = scrapePageMetadata();
  if (!metadata.title && !metadata.favicon) return;
  chrome.runtime
    .sendMessage({
      type: "ens-cache-metadata",
      name: ctx.ensName,
      title: metadata.title,
      favicon: metadata.favicon,
    })
    .catch(() => undefined);
}

function scheduleCacheMetadataCapture(ctx: TabContext): void {
  const capture = () => sendCacheMetadata(ctx);
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", capture, { once: true });
  } else {
    queueMicrotask(capture);
  }
  window.addEventListener("load", capture, { once: true });
  window.setTimeout(capture, 1500);
}

// Parse an address-bar input into a navigable URL.
//   - `<name>.eth[/path]` / `<name>.gwei[/path]` (incl. subdomains) →
//     `http://<name>.<tld>/path` (caught by the name DNR rule →
//     interstitial → name resolve).
//   - `0x<40hex>[/path]` (raw ERC-4804 contract) → `https://<addr>.w3eth.io/path`
//     (caught by W3ETH_REGEX when local pinning is on; otherwise goes straight
//     to the public w3eth.io gateway).
// Anything else is rejected.
function parseEthInput(raw: string): string | null {
  const trimmed = raw.trim().replace(/^https?:\/\//i, "");
  if (!trimmed) return null;
  const m = trimmed.match(/^([^/?#]+)(.*)$/);
  if (!m || !m[1]) return null;
  const host = m[1].toLowerCase();
  const rest = m[2] || "/";
  const path =
    rest.startsWith("/") || rest.startsWith("?") || rest.startsWith("#")
      ? rest
      : `/${rest}`;
  if (/^0x[a-f0-9]{40}$/.test(host)) {
    return `https://${host}.w3eth.io${path}`;
  }
  if (!/^(?:[a-z0-9-]+\.)+(?:eth|gwei)$/.test(host)) return null;
  return `http://${host}${path}`;
}

// Split `<name>.eth|.gwei/path` into host + path so the field can paint the
// host bright and dim the path — mirrors how Chrome renders its omnibox.
function splitUrl(text: string): { host: string; path: string } {
  const m = text.match(/^(.+?\.(?:eth|gwei))(.*)$/i);
  if (!m) return { host: text, path: "" };
  return { host: m[1]!, path: m[2]! };
}

function colorize(el: HTMLElement, text: string): void {
  el.textContent = "";
  if (!text) return;
  const { host, path } = splitUrl(text);
  const h = document.createElement("span");
  h.className = "u-host";
  h.textContent = host;
  el.appendChild(h);
  if (path) {
    const p = document.createElement("span");
    p.className = "u-path";
    p.textContent = path;
    el.appendChild(p);
  }
}

interface AddressField {
  setValue(text: string): void;
  getValue(): string;
  selectAll(): void;
  shake(): void;
}

// Wire a contenteditable element into an address-bar-style input: mixed
// coloring (host bright, path dim), Enter-to-submit, Escape-to-reset,
// focus-to-select-all, paste-as-plain-text.
function setupAddressField(
  el: HTMLElement,
  opts: {
    shadowRoot: ShadowRoot;
    placeholder?: string;
    onSubmit: (text: string) => void;
    onEscape?: () => void;
  },
): AddressField {
  el.setAttribute("contenteditable", "plaintext-only");
  el.setAttribute("spellcheck", "false");
  el.setAttribute("role", "textbox");
  el.setAttribute("aria-label", "Name address");
  if (opts.placeholder) el.setAttribute("data-placeholder", opts.placeholder);

  // ShadowRoot.getSelection is Chromium-only; required to read caret position
  // inside a closed shadow root.
  const getSelectionObj = (): Selection | null => {
    const sr = opts.shadowRoot as unknown as {
      getSelection?: () => Selection | null;
    };
    if (sr?.getSelection) return sr.getSelection() ?? null;
    return window.getSelection();
  };

  const getText = () => el.textContent ?? "";

  const getCaretOffset = (): number | null => {
    const sel = getSelectionObj();
    if (!sel || sel.rangeCount === 0) return null;
    const range = sel.getRangeAt(0);
    if (!el.contains(range.endContainer)) return null;
    const pre = range.cloneRange();
    pre.selectNodeContents(el);
    pre.setEnd(range.endContainer, range.endOffset);
    return pre.toString().length;
  };

  const setCaretOffset = (offset: number): void => {
    const sel = getSelectionObj();
    if (!sel) return;
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
    let remaining = offset;
    let targetNode: Text | null = null;
    let at = 0;
    let node: Text | null;
    while ((node = walker.nextNode() as Text | null)) {
      const len = node.length;
      if (remaining <= len) {
        targetNode = node;
        at = remaining;
        break;
      }
      remaining -= len;
    }
    const range = document.createRange();
    if (targetNode) range.setStart(targetNode, at);
    else {
      range.selectNodeContents(el);
      range.collapse(false);
    }
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
  };

  const rerender = () => {
    const offset = getCaretOffset();
    colorize(el, getText());
    if (offset != null) setCaretOffset(offset);
  };

  el.addEventListener("input", rerender);
  el.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      opts.onSubmit(getText());
    } else if (e.key === "Escape") {
      e.preventDefault();
      opts.onEscape?.();
    }
  });
  el.addEventListener("paste", (e) => {
    const text = e.clipboardData?.getData("text/plain");
    if (text == null) return;
    e.preventDefault();
    document.execCommand("insertText", false, text);
  });

  const api: AddressField = {
    setValue(text: string) {
      colorize(el, text);
    },
    getValue() {
      return getText();
    },
    selectAll() {
      const sel = getSelectionObj();
      if (!sel) return;
      const range = document.createRange();
      range.selectNodeContents(el);
      sel.removeAllRanges();
      sel.addRange(range);
    },
    shake() {
      el.classList.remove("shake");
      void el.offsetWidth;
      el.classList.add("shake");
      setTimeout(() => el.classList.remove("shake"), 450);
    },
  };

  el.addEventListener("focus", () => {
    setTimeout(() => api.selectAll(), 0);
  });

  return api;
}

function applyBodyOffset(target = HEIGHT_PX) {
  const apply = () => {
    if (!document.body) return false;
    const cur = parseFloat(getComputedStyle(document.body).marginTop) || 0;
    document.body.style.marginTop = `${Math.max(cur, target)}px`;
    return true;
  };
  if (apply()) return;
  // Body not parsed yet — wait so the first paint already accounts for the
  // banner height instead of briefly rendering under it.
  const obs = new MutationObserver(() => {
    if (apply()) obs.disconnect();
  });
  obs.observe(document.documentElement, { childList: true });
}

type Refs = {
  host: HTMLDivElement;
  shadow: ShadowRoot;
  bar: HTMLDivElement;
  urlInput: HTMLDivElement;
  brandImg: HTMLImageElement;
  right: HTMLSpanElement;
  starBtn: HTMLButtonElement;
  historyLink: HTMLAnchorElement;
  menuBtn: HTMLButtonElement;
  menu: HTMLDivElement;
  copyItem: HTMLButtonElement;
  openGatewayItem: HTMLButtonElement;
  copyToast: HTMLSpanElement;
};

function buildBanner(theme: Theme): Refs {
  const host = document.createElement("div");
  host.id = BANNER_ID;
  host.style.cssText = [
    "all: initial",
    "position: fixed",
    "top: 0",
    "left: 0",
    "right: 0",
    `height: ${HEIGHT_PX}px`,
    "z-index: 2147483647",
    "pointer-events: auto",
    "margin: 0",
    "padding: 0",
    "border: 0",
    "display: block",
  ].join("; ");

  const shadow = host.attachShadow({ mode: "closed" });
  const isMidnight = theme.themeId === "midnight";
  const logoRadius = theme.isDark ? "4px" : "0";

  // Strip uses the Bauhaus color palette in BOTH themes — the dark
  // `#121212` bar reads as a chrome surface on top of any page content.
  // Only the corner radii (logo, identity pill, menu, etc.) change for
  // Midnight, since soft corners are the actual theme identity.
  const stripBg = "#121212";
  const stripBorder = "#000000";
  const stripFg = "#FFFFFF";
  const stripFgMuted = "#A8A8A8";
  const stripShadow = "0 2px 0 0 #000000";

  const style = document.createElement("style");
  style.textContent = `
    :host { all: initial; }
    * { box-sizing: border-box; }
    .bar {
      display: flex;
      align-items: center;
      gap: 12px;
      height: ${HEIGHT_PX}px;
      padding: 0 14px;
      box-sizing: border-box;
      background: ${stripBg};
      color: ${stripFg};
      border-bottom: 2px solid ${stripBorder};
      box-shadow: ${stripShadow};
      font: 500 12px/1 "Outfit", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      -webkit-font-smoothing: antialiased;
      letter-spacing: 0.02em;
    }
    .left, .right {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      flex: 1 1 0;
      min-width: 0;
    }
    .right { justify-content: flex-end; }
    .brand-link {
      all: unset;
      display: inline-flex;
      align-items: center;
      gap: 10px;
      flex: none;
      height: 32px;
      padding: 0 6px 0 0;
      border-radius: ${isMidnight ? "6px" : "0"};
      color: inherit;
      cursor: pointer;
      text-decoration: none;
      transition: background-color 150ms;
    }
    .brand-link:hover,
    .brand-link:focus-visible {
      background: rgba(255,255,255,0.06);
      outline: none;
    }
    .brand {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      flex: none;
    }
    .brand img {
      width: 26px;
      height: 26px;
      display: block;
      border-radius: ${logoRadius};
      flex: none;
    }
    .label {
      font-weight: 700;
      color: ${stripFgMuted};
      text-transform: uppercase;
      letter-spacing: 0.08em;
      font-size: 10px;
      white-space: nowrap;
    }
    .identity {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      flex: 0 1 520px;
      min-width: 0;
      height: 26px;
      padding: 0 12px;
      background: rgba(0,0,0,0.25);
      border: 1px solid ${stripBorder};
      border-radius: ${isMidnight ? "13px" : "0"};
      transition: border-color 150ms, background-color 150ms;
    }
    .identity:hover { background: rgba(0,0,0,0.35); }
    .identity:focus-within {
      background: rgba(0,0,0,0.5);
      border-color: ${theme.accent};
    }
    .magnifier {
      width: 12px;
      height: 12px;
      color: ${stripFgMuted};
      flex: none;
      display: block;
    }
    .urlfield {
      flex: 1 1 auto;
      min-width: 0;
      font: 500 12px/1 "JetBrains Mono", "SF Mono", Menlo, Consolas, ui-monospace, monospace;
      color: ${stripFg};
      text-align: center;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      outline: none;
      cursor: text;
    }
    .urlfield:empty::before {
      content: attr(data-placeholder);
      color: ${stripFgMuted};
    }
    .urlfield .u-host { color: ${stripFg}; font-weight: 700; }
    .urlfield .u-path { color: ${stripFgMuted}; }
    .urlfield::selection,
    .urlfield *::selection {
      background: ${theme.accent};
      color: #121212;
    }
    .identity:has(.urlfield.shake) { border-color: #f43f5e; }
    .urlfield.shake { animation: shake 0.4s ease; }
    @keyframes shake {
      0%, 100% { transform: translateX(0); }
      25%      { transform: translateX(-3px); }
      75%      { transform: translateX(3px); }
    }
    .updated {
      background: ${theme.accent};
      color: #121212;
      font-weight: 700;
      padding: 4px 10px;
      cursor: pointer;
      border: 2px solid ${stripBorder};
      font-size: 11px;
      border-radius: ${isMidnight ? "4px" : "0"};
    }
    .star-btn {
      all: unset;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 22px;
      height: 22px;
      flex: none;
      border-radius: ${isMidnight ? "4px" : "0"};
      color: ${stripFgMuted};
      cursor: pointer;
      transition: background-color 150ms, color 150ms;
    }
    .star-btn svg {
      width: 14px;
      height: 14px;
      display: block;
    }
    .star-btn:hover,
    .star-btn:focus-visible {
      background: rgba(255,255,255,0.08);
      color: ${stripFg};
      outline: none;
    }
    .star-btn.favorited {
      color: ${theme.accent};
    }
    .ens-history-link {
      all: unset;
      display: inline-flex;
      align-items: center;
      height: 22px;
      padding: 0 10px;
      border-radius: ${isMidnight ? "4px" : "0"};
      color: ${stripFgMuted};
      cursor: pointer;
      font: 500 11px/1 inherit;
      text-decoration: none;
      transition: background-color 150ms, color 150ms;
    }
    .ens-history-link:hover {
      background: rgba(255,255,255,0.08);
      color: ${stripFg};
    }
    .menu-wrap { position: relative; flex: none; }
    .menu-btn {
      all: unset;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 26px;
      height: 26px;
      border-radius: ${isMidnight ? "4px" : "0"};
      color: ${stripFgMuted};
      cursor: pointer;
      font-size: 18px;
      line-height: 1;
      transition: background-color 150ms, color 150ms;
    }
    .menu-btn:hover {
      background: rgba(255,255,255,0.08);
      color: ${stripFg};
    }
    .menu {
      position: absolute;
      top: calc(100% + 6px);
      right: 0;
      display: none;
      min-width: 230px;
      background: ${stripBg};
      color: ${stripFg};
      border: 2px solid ${stripBorder};
      border-radius: ${isMidnight ? "6px" : "0"};
      padding: 4px;
      box-shadow: ${stripShadow};
      z-index: 1;
    }
    .menu.open { display: block; }
    .menu button {
      all: unset;
      display: flex;
      align-items: center;
      gap: 10px;
      width: 100%;
      box-sizing: border-box;
      padding: 8px 10px;
      border-radius: ${isMidnight ? "4px" : "0"};
      font: 500 12px/1.3 inherit;
      color: ${stripFg};
      cursor: pointer;
      text-align: left;
      transition: background-color 150ms;
    }
    .menu button:hover { background: rgba(255,255,255,0.08); }
    .menu button svg {
      width: 14px;
      height: 14px;
      flex: none;
      display: block;
      color: ${stripFgMuted};
    }
    .copy-toast {
      display: none;
      color: ${theme.accent};
      font-weight: 700;
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }
    .copy-toast.show { display: inline; }
  `;
  shadow.appendChild(style);

  const bar = document.createElement("div");
  bar.className = "bar";

  const left = document.createElement("span");
  left.className = "left";
  const homeLink = document.createElement("a");
  homeLink.className = "brand-link";
  homeLink.href = chrome.runtime.getURL("browse.html");
  homeLink.title = "Open WalletChan Browser";
  const brand = document.createElement("span");
  brand.className = "brand";
  const brandImg = document.createElement("img");
  brandImg.src = chrome.runtime.getURL("walletchan-icon-white-bg.png");
  brandImg.alt = "WalletChan";
  brand.appendChild(brandImg);
  const label = document.createElement("span");
  label.className = "label";
  label.textContent = "WALLETCHAN · DAPP3";
  homeLink.appendChild(brand);
  homeLink.appendChild(label);
  left.appendChild(homeLink);
  bar.appendChild(left);

  const identity = document.createElement("div");
  identity.className = "identity";
  identity.setAttribute("role", "search");
  const magnifier = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "svg",
  );
  magnifier.setAttribute("class", "magnifier");
  magnifier.setAttribute("viewBox", "0 0 16 16");
  magnifier.setAttribute("fill", "none");
  magnifier.setAttribute("stroke", "currentColor");
  magnifier.setAttribute("stroke-width", "1.6");
  magnifier.setAttribute("stroke-linecap", "round");
  magnifier.setAttribute("stroke-linejoin", "round");
  magnifier.setAttribute("aria-hidden", "true");
  magnifier.innerHTML =
    '<circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5 L14 14"/>';
  identity.appendChild(magnifier);
  const urlInput = document.createElement("div");
  urlInput.className = "urlfield";
  identity.appendChild(urlInput);
  const starBtn = document.createElement("button");
  starBtn.className = "star-btn";
  starBtn.type = "button";
  starBtn.setAttribute("aria-label", "Favorite this dapp");
  starBtn.setAttribute("aria-pressed", "false");
  starBtn.title = "Favorite this dapp";
  starBtn.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M12 3.5l2.65 5.36 5.92.86-4.28 4.17 1.01 5.89L12 17l-5.3 2.78 1.01-5.89-4.28-4.17 5.92-.86L12 3.5z"/>
    </svg>
  `;
  identity.appendChild(starBtn);
  bar.appendChild(identity);

  const right = document.createElement("span");
  right.className = "right";
  right.innerHTML = `
    <span class="copy-toast">copied</span>
    <a class="ens-history-link" target="_blank" rel="noopener noreferrer" title="View ENS History">View ENS History</a>
    <span class="menu-wrap">
      <button class="menu-btn" type="button" aria-label="banner menu" title="More options">⋯</button>
      <div class="menu" role="menu">
        <button data-act="copy" type="button">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
          </svg>
          <span>Copy underlying URL</span>
        </button>
        <button data-act="open-gateway" type="button">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
            <polyline points="15 3 21 3 21 9"/>
            <line x1="10" y1="14" x2="21" y2="3"/>
          </svg>
          <span>Open on eth.limo gateway</span>
        </button>
      </div>
    </span>
  `;
  bar.appendChild(right);

  shadow.appendChild(bar);

  const q = <T extends Element>(sel: string) =>
    shadow.querySelector(sel) as T;

  return {
    host,
    shadow,
    bar,
    urlInput,
    brandImg,
    right,
    starBtn: q<HTMLButtonElement>(".star-btn"),
    historyLink: q<HTMLAnchorElement>(".ens-history-link"),
    menuBtn: q<HTMLButtonElement>(".menu-btn"),
    menu: q<HTMLDivElement>(".menu"),
    copyItem: q<HTMLButtonElement>('button[data-act="copy"]'),
    openGatewayItem: q<HTMLButtonElement>('button[data-act="open-gateway"]'),
    copyToast: q<HTMLSpanElement>(".copy-toast"),
  };
}

let currentCtx: TabContext | null = null;
let currentField: AddressField | null = null;
let inputFocused = false;
let refreshStarState: (() => void) | null = null;

function mountedHost(): HTMLDivElement | null {
  return document.getElementById(BANNER_ID) as HTMLDivElement | null;
}

function buildCurrentValue(ctx: TabContext): string {
  return `${ctx.ensName}${currentPath()}`;
}

async function mount() {
  const ctx = await getTabCtx();
  if (!ctx) return;
  currentCtx = ctx;
  scheduleCacheMetadataCapture(ctx);
  if (mountedHost()) return;

  const theme = await getTheme();
  const refs = buildBanner(theme);
  (document.documentElement || document.body).appendChild(refs.host);
  applyBodyOffset();

  refs.urlInput.addEventListener("focus", () => (inputFocused = true));
  refs.urlInput.addEventListener("blur", () => (inputFocused = false));

  const field = setupAddressField(refs.urlInput, {
    shadowRoot: refs.shadow,
    placeholder: "name.eth or name.gwei",
    onSubmit: (text) => {
      const url = parseEthInput(text);
      if (!url) {
        field.shake();
        return;
      }
      // DNR catches *.eth / *.gwei main_frame -> interstitial -> SW resolve.
      // Same path as typing into Chrome's own address bar.
      location.assign(url);
    },
    onEscape: () => {
      if (!currentCtx) return;
      field.setValue(buildCurrentValue(currentCtx));
      refs.urlInput.blur();
    },
  });
  field.setValue(buildCurrentValue(ctx));
  currentField = field;

  wireRightSection(refs, ctx);
}

function applyStarState(refs: Refs, favorited: boolean): void {
  const icon = refs.starBtn.querySelector("svg");
  refs.starBtn.classList.toggle("favorited", favorited);
  refs.starBtn.setAttribute("aria-pressed", favorited ? "true" : "false");
  refs.starBtn.setAttribute(
    "aria-label",
    favorited ? "Remove from favorites" : "Favorite this dapp",
  );
  refs.starBtn.title = favorited
    ? "Remove from favorites"
    : "Favorite this dapp";
  icon?.setAttribute("fill", favorited ? "currentColor" : "none");
}

function currentBookmarkPath(): string {
  return normalizeBookmarkPath(currentPath());
}

function buildBookmark(ctx: TabContext, path: string): EnsBookmark {
  const metadata = scrapePageMetadata();
  return {
    ensName: ctx.ensName.toLowerCase(),
    path,
    kind: ctx.kind,
    contractAddress: ctx.contractAddress,
    title: metadata.title,
    favicon: metadata.favicon,
    addedAt: Date.now(),
  };
}

function wireStar(refs: Refs, ctx: TabContext): void {
  const ensName = ctx.ensName.toLowerCase();
  const refresh = () => {
    isBookmarked(ensName, currentBookmarkPath())
      .then((favorited) => applyStarState(refs, favorited))
      .catch(() => applyStarState(refs, false));
  };

  refreshStarState = refresh;
  refresh();
  onBookmarksChanged(refresh);

  refs.starBtn.addEventListener("click", async (e) => {
    e.stopPropagation();
    const path = currentBookmarkPath();
    const favorited = refs.starBtn.classList.contains("favorited");
    if (favorited) {
      await removeBookmark(ensName, path);
    } else {
      await addBookmark(buildBookmark(ctx, path));
    }
    refresh();
  });
}

function wireRightSection(refs: Refs, ctx: TabContext) {
  wireStar(refs, ctx);

  // ENS History link — external. Hidden for address-mode (0x... ERC-4804)
  // and `.gwei` navigations since ENS History only supports `.eth`.
  const isAddressNav = /^0x[a-f0-9]{40}$/i.test(ctx.ensName);
  const isGwei = /\.gwei$/i.test(ctx.ensName);
  if (isAddressNav || isGwei) {
    refs.historyLink.style.display = "none";
  } else {
    refs.historyLink.href = `https://ens.eth.sh/history/${ctx.ensName.toLowerCase()}`;
  }

  // Web3 (ERC-4804) dapps have no eth.limo equivalent — point at w3eth.io.
  const isWeb3 = ctx.kind === "web3" && !!ctx.contractAddress;
  if (isWeb3 || isGwei) {
    const label = refs.openGatewayItem.querySelector("span");
    if (label) {
      label.textContent = isWeb3
        ? "Open on w3eth.io gateway"
        : "Open on gwei.domains gateway";
    }
  }

  const closeMenu = () => refs.menu.classList.remove("open");
  refs.menuBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    refs.menu.classList.toggle("open");
  });
  document.addEventListener("click", closeMenu);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeMenu();
  });

  refs.copyItem.addEventListener("click", async () => {
    closeMenu();
    const url = location.href;
    try {
      await navigator.clipboard.writeText(url);
      refs.copyToast.classList.add("show");
      setTimeout(() => refs.copyToast.classList.remove("show"), 1200);
    } catch {
      // Fallback for non-secure contexts.
      const ta = document.createElement("textarea");
      ta.value = url;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body?.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
        refs.copyToast.classList.add("show");
        setTimeout(() => refs.copyToast.classList.remove("show"), 1200);
      } finally {
        ta.remove();
      }
    }
  });

  refs.openGatewayItem.addEventListener("click", () => {
    closeMenu();
    const p = currentPath() || "/";
    const path = p.startsWith("/") ? p : `/${p}`;
    // Hosted gateways can be intercepted by our DNR rules whenever this banner
    // is mounted from local Kubo. Route through the SW so it can punch a
    // per-tab ALLOW bypass before the navigation fires; otherwise the gateway
    // redirect could bounce us right back to local.
    const url =
      isWeb3 && ctx.contractAddress
        ? `https://${ctx.contractAddress}.w3eth.io${path}`
        : isGwei
          ? `https://${ctx.ensName}.domains${path}`
        : `https://${ctx.ensName}.limo${path}`;
    chrome.runtime
      .sendMessage({ type: "ens-open-on-gateway", url })
      .then((resp) => {
        if (!resp?.ok) location.assign(url);
      })
      .catch(() => location.assign(url));
  });
}

function syncFieldFromLocation() {
  if (!currentCtx || !currentField) return;
  if (!inputFocused) currentField.setValue(buildCurrentValue(currentCtx));
  refreshStarState?.();
}

// Re-render on SPA navigations so the path-on-the-right portion stays current
// as the user clicks around inside the dapp.
function wireSpaNav() {
  const patch = (key: "pushState" | "replaceState") => {
    const orig = history[key];
    history[key] = function (
      this: History,
      ...args: Parameters<typeof orig>
    ) {
      const r = orig.apply(this, args as never);
      queueMicrotask(onChange);
      return r;
    } as typeof orig;
  };
  const onChange = () => {
    if (!mountedHost()) {
      // Page replaced the DOM (rare but happens).
      mount().catch(() => undefined);
      return;
    }
    syncFieldFromLocation();
  };
  patch("pushState");
  patch("replaceState");
  window.addEventListener("popstate", onChange);
  window.addEventListener("hashchange", onChange);
}

// Listen for content-updated push from SW (background re-resolve detected
// a contenthash change). Show a yellow "Updated — reload" pill on the right.
chrome.runtime.onMessage.addListener((msg) => {
  if (!msg || typeof msg !== "object") return;
  const m = msg as Record<string, unknown>;
  if (m.type !== "ens-content-updated") return;
  const host = mountedHost();
  if (!host || !host.shadowRoot) return;
  const right = host.shadowRoot.querySelector(".right");
  if (!right) return;
  if (right.querySelector(".updated")) return;
  const btn = document.createElement("button");
  btn.className = "updated";
  btn.textContent = "Updated — reload";
  btn.addEventListener("click", () => {
    const url = typeof m.gatewayUrl === "string" ? m.gatewayUrl : null;
    if (url) location.replace(url);
    else location.reload();
  });
  right.appendChild(btn);
});

wireSpaNav();
mount().catch((e) => console.warn("[ens-banner] mount failed", e));
