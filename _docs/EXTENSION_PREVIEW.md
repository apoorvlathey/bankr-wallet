# Extension Preview Harness

Fast visual workflow for extension UI/theme work without loading the Chrome
extension through `chrome://extensions`.

## Run

```bash
pnpm dev:extension-preview
```

Open:

```text
http://localhost:4317/preview/all
```

Every preview state is URL-addressable. The canonical query parameters are:

```text
?theme=midnight&frame=popup&scenario=default&wallet=bankr
```

- `theme`: `midnight` or `bauhaus`
- `frame`: `compact`, `popup`, `window`, or `sidepanel`
- `scenario`: validated per route
- `wallet`: `bankr`, `privateKey`, or `seedPhrase`; signing routes also accept
  `viewOnly` as a separate negative-path fixture

Example:

```text
http://localhost:4317/preview/tx?theme=midnight&frame=sidepanel&scenario=default&wallet=seedPhrase
```

Useful direct routes:

- `/preview/home`
- `/preview/onboarding`
- `/preview/unlock`
- `/preview/tx`
- `/preview/signature`
- `/preview/settings`
- `/preview/portfolio`
- `/preview/tx-detail`
- `/preview/swap`
- `/preview/swap-picker`
- `/preview/components`
- `/preview/mobile-primitives`
- `/preview/decision-primitives`
- `/preview/batch`
- `/preview/cross-batch`
- `/preview/permission`
- `/preview/watch-asset`
- `/preview/add-chain`
- `/preview/send`
- `/preview/receive`
- `/preview/more`
- `/preview/connected-apps`
- `/preview/chat`
- `/preview/account-management`
- `/preview/token-management`

The top toolbar switches between the registered production themes, Bauhaus and
Midnight, and between compact reflow `320x568`, popup `360x600`, popup-window
`480x720`, and sidepanel `420x760` frames. The compact frame is the mandatory
small-viewport gate; it is not a separate production mode. The Vite server
hot-reloads token/component edits immediately.

## Architecture

Files:

- `apps/extension/preview.html` — Vite entry.
- `apps/extension/vite.config.preview.ts` — dev server/build config on port
  `4317`.
- `apps/extension/src/preview/PreviewApp.tsx` — URL-driven route/frame gallery
  and isolated canvas controller.
- `apps/extension/src/preview/previewState.ts` — canonical URL parser and
  formatter.
- `apps/extension/src/preview/routeRegistry.ts` — supported routes, scenarios,
  wallet types, and fidelity classification.
- `apps/extension/src/preview/fixtures.ts` — deterministic accounts, chains,
  txs, signatures, batches, and delegated permission requests.
- `apps/extension/src/preview/previewEnvironment.ts` — deterministic storage,
  portfolio, RPC, and route environment.
- `apps/extension/src/preview/previewChrome.ts` — fail-closed preview-only
  Chrome API shim.
- `apps/extension/src/preview/previewAssets.ts` — semantic manifest for local,
  deterministic preview assets.

The gallery renders each screen inside an iframe with the exact selected frame
dimensions. This is intentional: a same-document `Box` does not change
`window.innerWidth`, viewport units, Chakra breakpoints, portal placement, or
body mode classes. The iframe is the app viewport and prevents gallery CSS or
scrolling from changing the screen being reviewed.

The harness mounts production theme providers and production extension
components. `/preview/home` mounts the real `App` controller against the
deterministic Chrome/network environment. Settings, Portfolio, transaction
detail, Send, Swap / Bridge, Connected apps, Chat, More, approval, and picker
routes mount their real production controllers or screen components. Preview
data replaces backend state, not product markup.

`/preview/onboarding` mounts the production onboarding controller with an empty
preview vault. The welcome screen is reload-stable; continue through it to test
the real Bankr, private-key, and seed-phrase branches without storing secrets or
calling a live service.

`/preview/account-management` mounts the production account controllers. Its
`details` scenario shows the account-type-specific settings for the selected
wallet, `security` opens the valid security destination for that type (Bankr
configuration, private-key reveal, or seed-phrase reveal), and `add` mounts the
real multi-account add flow. A `viewOnly` wallet deliberately remains on its
settings screen in `security` because there is no signing secret to reveal.

`/preview/token-management` mounts the production Add, Edit, Hide, and Hidden
token surfaces through its `add`, `edit`, `hide`, and `hidden` scenarios. The
Hide screen reads the same portfolio catalog as the extension and the Hidden
screen reads deterministic preview storage. Nested network selection and
destructive removal remain navigable from those production screens instead of
being represented by copied preview JSX.

The toolbar shows each route's fidelity classification:

- `production`: production controller or screen component.
- `composed`: production component shown in a preview-owned surrounding shell.
- `synthetic`: preview-only representation; never use as a regression baseline.

There should be no synthetic baseline routes. If production code cannot yet be
mounted, mark the route honestly and keep it out of screenshot approval.

`/preview/components` is the Phase 1 component-state laboratory. It composes
real Chakra controls and WalletChan theme primitives; it is not a parallel
component library. Use it for keyboard focus, disabled/loading/error states,
long labels, overlay focus return, and cross-theme recipe review.

`/preview/mobile-primitives` is the Phase 2 interaction laboratory. Its
`journey`, `picker`, and `sheet` scenarios exercise the shared app shell,
horizontal push/Back transition, scroll and focus restoration hooks,
separator-based lists, sticky actions, full-screen searchable picker, and
bottom action sheet. It is deliberately classified as `composed`: use it to
approve shared interaction grammar, then judge migrated product screens on
their production routes.

`/preview/decision-primitives` is the shared confirmation hierarchy lab. Its
`default`, `stress`, and `error` scenarios exercise the Outcome Card,
color-independent asset deltas, context list, advanced disclosure, long
financial values, and sticky Reject/Confirm region before those primitives are
wired to transaction controllers.

## Adding A Screen

1. Add fixture data to `fixtures.ts`.
2. Add the route ID to `PreviewRoute` and register its scenarios, wallets, and
   fidelity in `routeRegistry.ts`.
3. Render the real component or production controller. Do not duplicate its
   JSX in `src/preview`.
4. If a component needs a benign background response, add that message type to
   `responseForMessage()` in `previewChrome.ts`.
5. Keep the shim visual-only: no real signing, Bankr calls, RPC calls, secret
   material, or remote baseline assets.
6. Register scenario and wallet support in `routeRegistry.ts` so invalid URLs
   fail visibly instead of silently rendering a different state.

Unknown runtime reads fail loudly in the console and return an explicit failure
shape. Add a deliberate response when a production component gains a new
read dependency; never restore a catch-all success response.

## Temporary Theme Experiments

For theme exploration, create temporary theme files and registry entries only on
an exploration branch. The preview harness is meant to make those experiments
cheap, not to expand the shipped theme contract by default.

Before merging, either remove the temporary theme or promote it deliberately:
update `THEME_IDS`, `ThemeProvider`, storage docs, implementation docs, ENS
banner flat tokens, CSS pre-paint selectors, and this preview doc. If `/preview/home`
does not match the real homepage component order and spacing, fix the preview
before judging color or contrast changes.

## Screenshot Workflow

For quick manual checks:

1. Run `pnpm dev:extension-preview`.
2. Open `/preview/all`.
3. Select the target theme and frame size.
4. Capture the browser viewport.

For automated checks, use the canonical route query. The gallery itself uses an
internal `canvas=1` iframe URL; screenshot tooling should normally capture that
iframe or use the same canvas query with an exact browser viewport.

All fixture dates use a fixed epoch and baseline logos/favicons live under
`public/preview-assets/`, so screenshots should only change when UI, theme
tokens, or fixtures change.

### Automated UI QA

Install the repo-local Chromium binary once after installing dependencies:

```bash
pnpm --filter @walletchan/extension exec playwright install chromium
```

Run the repeatable smoke matrix from the repository root:

```bash
pnpm --filter @walletchan/extension qa:preview
```

The command builds the preview, serves that exact build on `127.0.0.1:4318`,
and derives its cases directly from `routeRegistry.ts`. It checks every route
in both themes at popup size, every route at the compact reflow size, the main
application flows at window and sidepanel sizes, every registered non-default
scenario, and every supported wallet type. It verifies:

- unexpected console errors, page errors, and failed requests;
- broken `<img>` resources;
- document-level horizontal overflow;
- clipped bottom `position: sticky` or `position: fixed` action regions;
- WCAG 2.0/2.1/2.2 A and AA rules with axe on each canonical Midnight route;
- deterministic screenshots for both popup themes and compact Midnight.

Results are written to the ignored `apps/extension/preview-qa/` directory:

- `index.html` — visual screenshot/failure gallery;
- `index.json` — machine-readable case results and accessibility findings;
- `screenshots/*.png` — exact canvas captures.

Serious and critical axe violations fail by default. Useful overrides:

```bash
# Exhaustive theme × frame × scenario × wallet Cartesian matrix
pnpm --filter @walletchan/extension qa:preview:full

# Reuse an already-running preview server instead of starting port 4318
PREVIEW_QA_BASE_URL=http://127.0.0.1:4317 \
  pnpm --filter @walletchan/extension qa:preview

# Tune concurrency or the axe impacts that fail CI
PREVIEW_QA_WORKERS=2 PREVIEW_QA_A11Y_IMPACTS=critical \
  pnpm --filter @walletchan/extension qa:preview

# Iterate on one route while preserving its theme/frame/wallet/scenario matrix
PREVIEW_QA_ROUTE=tx pnpm --filter @walletchan/extension qa:preview
```

Known fail-closed metadata lookups (`4byte`, Sourcify, `eth.sh`, Google
favicons/fonts) are allowed only at the network boundary. Runtime exceptions,
unrelated request failures, and application console errors still fail the case.

## Packaged extension runtime QA

The preview proves composition. The separate packaged gate proves that the
production manifest, service worker, content script, injected provider, storage
queues, and React surfaces still work together:

```bash
pnpm qa:extension
```

That command builds the complete Chrome package, typechecks the QA scripts, and
runs five Playwright suites against fresh browser profiles:

- transaction review/rejection for Bankr, private-key, and seed-phrase accounts;
- `personal_sign` and typed-data review/rejection for all three account types;
- view-only reject-only transaction/signature reviews and ERC-5792 batch
  rejection for all three signing account types;
- home quick actions, account/network switching, portfolio-failure resilience,
  and lock/unlock;
- master/agent authentication and wallet-specific secret restrictions for all
  three account types.

The dapp suites use a local HTTP origin, close/reopen pending review surfaces,
drive Reject with the keyboard, require exactly one `4001` settlement where
applicable, and never click Sign/Confirm or broadcast.

## Limitations

- The preview shim returns deterministic typed responses and mock
  gas/simulation data. It is not a wallet backend.
- Onboarding, transaction, signature, batch, delegated-permission, add-network,
  watch-asset, unlock, settings, home/portfolio, Send, Receive, Swap, Connected apps, Chat, More,
  account-management, and token-management surfaces have production-backed
  routes.
- Portfolio RPC reads use deterministic preview responses. They validate visual
  composition, not provider correctness or balance-fetch behavior.
- Google Fonts remain a network dependency for Bauhaus and mono typography;
  Midnight falls back to the native system UI stack. UI images and fixture
  favicons/token logos are local.
- Successful signing/broadcast, genuine WebAuthn ceremonies, native headed
  popup behavior, assistive technology, and production dapp smoke remain
  manual release checks.
