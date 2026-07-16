# Firefox Port

WalletChan ships to both Chrome Web Store and addons.mozilla.org (AMO) from a single codebase. This doc covers everything Firefox-specific: build pipeline, manifest divergence, the `storage.session` compatibility layer, the popup-only UX choice, and the AMO release flow.

## TL;DR

- `pnpm build:extension` → `apps/extension/build/` — Chrome MV3 (service_worker, sidepanel)
- `pnpm build:extension:firefox` → `apps/extension/build-firefox/` — Firefox MV3 (event page, popup-only)
- Both build dirs co-exist; neither contaminates the other.
- The Chrome pipeline (`build`, `zip`, `zip:cws`, `release:*`) is **unchanged** from before Firefox support landed — Chrome users get a byte-identical artifact.

## Build pipeline

The same five Vite configs build both browsers. `process.env.BROWSER` is the gating env:

| Vite config | Default outDir | `BROWSER=firefox` outDir | Other gating |
|---|---|---|---|
| `vite.config.ts` (popup UI) | `build/` | `build-firefox/` | — |
| `vite.config.onboarding.ts` | `build/` | `build-firefox/` | — |
| `vite.config.background.ts` | `build/static/js/` | `build-firefox/static/js/` | Format: `es` → `iife` |
| `vite.config.inpage.ts` | `build/static/js/` | `build-firefox/static/js/` | — |
| `vite.config.inject.ts` | `build/static/js/` | `build-firefox/static/js/` | — |

**Background-bundle format gate:** Chrome MV3 wants an ES-module service worker (`type: "module"`). Firefox MV3 doesn't support service workers — it uses an event page declared via `background.scripts`, which loads as a classic script and CANNOT use ES modules. The Vite config emits `iife` for Firefox, `es` for Chrome.

**Manifest swap:** Vite copies everything in `apps/extension/public/` verbatim into the build output, so `public/manifest.json` (the Chrome manifest) lands in `build-firefox/manifest.json` initially. A post-build step (`scripts/swap-manifest.mjs`) overwrites it with the Firefox variant kept at `apps/extension/manifest.firefox.json`. The Firefox manifest is deliberately stored **outside** `public/` so it doesn't leak into the Chrome zip.

## Manifest divergence

Both manifests share `name`, `version`, `description`, `icons`, `action`,
`content_scripts`, `host_permissions`, the provider/brand-asset
`web_accessible_resources` group, and the core `activeTab` / `storage` /
`notifications` / `tabs` / `unlimitedStorage` permissions. The differences:

| Key | Chrome (`public/manifest.json`) | Firefox (`manifest.firefox.json`) |
|---|---|---|
| `background` | `{ "service_worker": "static/js/background.js", "type": "module" }` | `{ "scripts": ["static/js/background.js"] }` |
| `side_panel` | `{ "default_path": "index.html" }` | (absent) |
| `permissions` includes `"sidePanel"` | yes | no |
| `permissions` includes `"declarativeNetRequestWithHostAccess"` | yes | no |
| ENS browsing HTML in `web_accessible_resources` | `browse.html`, `interstitial.html`, `ens-error.html`, `setup-kubo.html` | absent |
| `browser_specific_settings.gecko.strict_min_version` | (irrelevant) | `"121.0"` |
| `browser_specific_settings.gecko.data_collection_permissions` | (irrelevant) | `{ "required": ["none"] }` (AMO requirement since Nov 2025) |

**Drift rule**: any edit to `public/manifest.json` that touches a shared key must be mirrored in `manifest.firefox.json`. Chrome-only keys stay out of the Firefox manifest; Firefox-only keys stay out of Chrome's. There is no generator — keep them in sync by hand.

## Runtime browser detection

We do **not** add broad Firefox-specific branching in app code. The export-only
`apps/extension/src/chrome/sidepanelManager.ts` facade delegates to
`windowing/browserCapabilities.ts`; Firefox takes the popup-only path because
`chrome.sidePanel` is absent. The Chromium-brand check separately blocks
phantom side-panel APIs in Arc/Brave/Opera-family browsers.

Direct `chrome.sidePanel.open()` call sites are now guarded for browsers where the API doesn't exist:

- `apps/extension/src/App.tsx` (sidepanel-toggle button) — early return when API absent
- `apps/extension/src/components/UnlockScreen.tsx` (sidepanel-toggle button) — early return
- `apps/extension/src/chrome/background/composition/lifecycle.ts` injects a
  nullable side-panel opener into `background/lifecycle/actionFallback.ts`,
  which falls through to `openPopupWindow()`
- `apps/extension/src/chrome/windowing/chromeAdapter.ts` guards request-surface
  panel effects; `windowing/requestSurface.ts` falls through to the reusable
  detached-popup path
- `apps/extension/src/lib/sidePanelControls.ts` treats panel closing as an
  optional browser capability

UX choice: **popup-only on Firefox.** We evaluated using Firefox's native `sidebar_action` / `chrome.sidebarAction` as a sidepanel equivalent and rejected it. Findings:

- **Zen and other Firefox forks** hide or replace the native sidebar UI, so `sidebarAction.toggle()` succeeds internally but the panel never surfaces. Sidebery ships [a separate Zen-only build](https://addons.mozilla.org/en-US/firefox/addon/sidebery-zen/) for this reason; [zen-browser/desktop#2307](https://github.com/zen-browser/desktop/issues/2307) tracks the broader extension-sidebar gap.
- Even on **standard Firefox**, the integration did not render reliably during testing.
- No feature-detection signal works — `isOpen()` returns `true` whether or not the panel is visible — so the only mitigation would be UA-sniffing every fork. Not worth it for a wallet UI.

Popup-only on all Firefox-family browsers is the supported path.

## Two real-world Firefox bugs found during the port

Both are easy to reintroduce, so they live in this doc.

### 1. URL-scheme assumption in the extension-message auth gate

`apps/extension/src/chrome/background.ts` has an `isExtensionPage(sender)` check used by `EXTENSION_ONLY_MESSAGES` to reject any message that didn't originate from a popup/onboarding page. The original implementation hardcoded the URL scheme:

```ts
// BROKEN on Firefox:
return !!sender.url?.startsWith(`chrome-extension://${chrome.runtime.id}/`);
```

In Firefox extension pages live at `moz-extension://<UUID>/...`, so this returned `false` for every sendMessage from onboarding/popup, and 40+ message types (`addBankrAccount`, `addPrivateKeyAccount`, `unlockWallet`, `onboardingComplete`, ...) were short-circuited to `{success: false, error: "Unauthorized"}` before any handler ran.

The fix:

```ts
const EXTENSION_ORIGIN_PREFIX = chrome.runtime.getURL("/");
function isExtensionPage(sender: chrome.runtime.MessageSender): boolean {
  return !!sender.url?.startsWith(EXTENSION_ORIGIN_PREFIX);
}
```

`chrome.runtime.getURL("/")` returns the extension root with the correct scheme + identifier for whichever browser the extension is running in. **Never hardcode `chrome-extension://` anywhere — always derive the origin from `chrome.runtime.getURL("/")`.**

The same lesson applies to any "is this an extension page" filter elsewhere — the broadcast-tabs filter in `background.ts` already had to skip `chrome-extension://` URLs; it now also skips `moz-extension://` and `about:`.

### 2. Firefox toolbar action popup is unreliable; use `windows.create` instead

The Chrome path uses `action.default_popup` (an inline popup attached to the toolbar icon). In Firefox-family browsers — at least in Zen, and likely others — clicking the toolbar icon with `default_popup` set does not reliably render the popup. The popup also can't survive a `meta http-equiv="refresh"` navigation (the indirection through `popup-init.html` to `index.html` produces a blank window).

Firefox solution (in this codebase): **no `default_popup` in the Firefox manifest, and `POPUP_PATH = ""` at runtime.** That makes `chrome.action.onClicked` fire on icon click, and the existing handler in `background.ts` routes Firefox through `openPopupWindow()` → `chrome.windows.create({type: "popup", width: 360, height: 680})`. The detached popup window is positioned near the top-right of the active Firefox window. UX trade-off: detached window instead of toolbar-attached panel, but it works reliably across Firefox / Zen / etc.

Chrome path is **unchanged**: `default_popup: "popup-init.html"` in the Chrome manifest, `POPUP_PATH = "popup-init.html"` at runtime. The Chrome inline-popup UX is unaffected.

This is also why every direct `chrome.sidePanel.open()` call site has a `chrome.sidePanel?.open` guard — Firefox's `chrome.sidePanel` is undefined, so unguarded access throws and the user sees a noisy console error.

## `chrome.storage.session` compatibility layer

Firefox added `storage.session` in Firefox 115. WalletChan's declared minimum
is Firefox 121, so supported Firefox builds use the native memory-backed area.
Wallet authentication/session records still go through
`apps/extension/src/chrome/session/storage.ts` so the security behavior is
explicit and other browser/fork environments without the API fail safely:

```ts
import { getSessionItems, setSessionItems, removeSessionItems, clearSession } from "./storage";
```

On supported Chrome and Firefox, every call passes through to native
`chrome.storage.session.*`. If a browser/fork lacks that area, the fallback may
read/write `chrome.storage.local` with a `__session__` key prefix for
**non-secret** session metadata/context and registers a
`chrome.runtime.onStartup` listener that wipes those prefixed keys on browser
restart.

**Security note:** password and passkey-vault session restoration are
deliberately disabled when native `chrome.storage.session` is unavailable.
Those fallback environments keep Never-session credentials only in
service-worker memory; `encryptedSessionPassword`,
`encryptedSessionVaultKey`, and `sessionEncKey` are not written by the fallback.
Current workers proactively remove either secret half left by an older
fallback build. This cleanup also runs after a browser upgrade adds native
`storage.session`: stale `__session__*` local records are removed, while an
already-valid current native password or passkey Never session is preserved.
On supported Chrome and Firefox, the ciphertext half remains
memory-backed in `storage.session` and disappears on browser close; only its
random AES key half is in `storage.local`.

**Rule:** credential/session-auth code must not call
`chrome.storage.session.*` directly or send password material through the
non-native local fallback. Keep the adapter in `session/storage.ts`, use it
through `session/persistence.ts`, and retain the explicit
`hasNativeSessionStorage()` gate there (passkey capability wrapping is split
into `session/passkeyPersistence.ts`). Other non-secret feature
state must independently handle browsers where the native area is absent.

## AMO release flow

1. **One-time setup**
   - Apply for AMO API credentials at https://addons.mozilla.org/developers/addon/api/key/
   - Add `WEB_EXT_API_KEY` and `WEB_EXT_API_SECRET` to GitHub Actions secrets
   - First listing: submit manually via the AMO Developer Hub UI to claim the addon name and complete metadata (description, screenshots, source-code submission if AMO asks)

2. **Per release**
   - `pnpm sign:firefox` (after `pnpm release:*` produces the new version)
   - This runs `web-ext sign --channel listed` against AMO with the credentials above
   - On AMO's side: review queue 24h–7 days for crypto wallets (Mozilla applies extra scrutiny since the 2025 GreedyBear campaign)
   - Once approved, AMO auto-updates installed users via Mozilla's update server

3. **Failure handling**
   - If AMO signing fails (validation errors, review queue rejection), the Chrome release pipeline is unaffected. Investigate, fix, re-sign.
   - For local smoke tests before submitting to AMO, use `--channel unlisted` and install the returned XPI manually in a clean profile.

## Local testing

Load the unpacked Firefox extension:

1. `pnpm build:extension:firefox`
2. Open Firefox → `about:debugging` → "This Firefox" → "Load Temporary Add-on..."
3. Pick `apps/extension/build-firefox/manifest.json`
4. The extension loads under the WalletChan icon in the toolbar

`web-ext run` is also wired up (`firefox:run` script in `apps/extension/package.json`) and launches a clean Firefox profile with the extension auto-loaded — useful for the standard test pass below.

**Test all four wallet types in Firefox before releasing**:

1. Onboarding wizard completes end-to-end
2. Bankr account: create, view balances, send a tx
3. PrivateKey account: import, send a tx with a custom gas tier
4. SeedPhrase account: import, derive an account, sign an EIP-712 typed-data message
5. Impersonator account: signing/execution paths are blocked (view-only)
6. ERC-5792 batch tx flow works
7. Auto-lock = "Never" survives a Firefox event-page restart within the same
   browser session, but closing/restarting the browser requires unlock
8. EIP-6963 announcement: WalletChan appears in dapps' wallet picker (test on Aave / Uniswap)

## Known gaps (intentional, v1)

- **No Firefox sidebar UX.** Firefox's `sidebar_action` is a different API from `chrome.sidePanel`. We evaluated it and it didn't render reliably (especially on Zen forks), so Firefox is popup-only.
- **No `webextension-polyfill`.** The codebase uses callback-style `chrome.*` throughout, which Firefox accepts directly. A migration to Promise-style `browser.*` would be a large refactor with no concrete benefit.
- **No Firefox ESR < 121 support.** `strict_min_version: "121.0"` excludes older ESR. v1 targets current Firefox.
- **No automated manifest-diff check.** Drift between `public/manifest.json` and `manifest.firefox.json` is caught by hand-review. A linter script (`scripts/check-manifests.mjs`) is a reasonable follow-up if drift becomes a problem.

## Files

| Path | Role |
|---|---|
| `apps/extension/public/manifest.json` | Chrome manifest (unchanged from pre-Firefox era) |
| `apps/extension/manifest.firefox.json` | Firefox manifest variant (outside public/ to avoid Chrome leak) |
| `apps/extension/scripts/swap-manifest.mjs` | Post-build manifest swap for Firefox |
| `apps/extension/src/chrome/session/storage.ts` | `chrome.storage.session` compatibility layer |
| `apps/extension/vite.config.ts` | Defines per-browser `buildDir` |
| `apps/extension/vite.config.background.ts` | Per-browser format gate (`es` ↔ `iife`) |
| `apps/extension/package.json` | `build:firefox`, `dev:firefox`, `zip:firefox`, `sign:firefox` scripts |
| `package.json` (root) | Workspace pass-through: `build:extension:firefox`, `dev:extension:firefox`, `zip:firefox`, `sign:firefox` |
