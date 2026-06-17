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

Useful direct routes:

- `/preview/home`
- `/preview/unlock`
- `/preview/tx`
- `/preview/signature`
- `/preview/settings`
- `/preview/portfolio`
- `/preview/batch`
- `/preview/cross-batch`

The top toolbar switches between the registered production themes, Bauhaus and
Midnight, and between popup `360x600`, popup-window `480x720`, and sidepanel
`420x760` frames. The Vite server hot-reloads token/component edits immediately.

## Architecture

Files:

- `apps/extension/preview.html` — Vite entry.
- `apps/extension/vite.config.preview.ts` — dev server/build config on port
  `4317`.
- `apps/extension/src/preview/PreviewApp.tsx` — route/frame gallery.
- `apps/extension/src/preview/PreviewHome.tsx` — production homepage replica
  with deterministic account/portfolio data.
- `apps/extension/src/preview/fixtures.ts` — deterministic accounts, chains,
  txs, signatures, and batches.
- `apps/extension/src/preview/previewChrome.ts` — preview-only Chrome API shim.

The harness mounts real theme providers and selected real extension components
with fixture props. The `/preview/home` route mirrors the production homepage
shell and placement order from `App.tsx` while replacing live portfolio/network
data with deterministic fixtures. The harness intentionally does not mount
`App.tsx`; the production popup state machine is tightly coupled to Chrome
tabs/runtime state, which makes it slow and brittle for visual iteration.

## Adding A Screen

1. Add fixture data to `fixtures.ts`.
2. Add a route ID to `ROUTES` in `PreviewApp.tsx`.
3. Render the real component when it can be fed fixture props.
4. If a component needs a benign background response, add that message type to
   `responseForMessage()` in `previewChrome.ts`.
5. Keep the shim visual-only: no real signing, no Bankr calls, no RPC calls, and
   no secret material.

Prefer production primitives/components over hand-built preview-only UI. Use
preview-only composition only for screens whose real component depends on the
full popup state machine or live portfolio APIs.

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

For automated checks, point Playwright at direct routes such as
`http://localhost:4317/preview/tx` and capture the visible `.preview` page.
The fixture data is deterministic, so screenshots should only change when UI,
theme tokens, or fixtures change.

## Limitations

- The preview shim returns deterministic success responses and mock gas/simulation
  data. It is not a wallet backend.
- Transaction confirmation, signature confirmation, batch confirmation, unlock,
  settings appearance, and dense portfolio/home surfaces are covered first.
- Browser-extension-only behavior still needs normal extension testing before
  release.
