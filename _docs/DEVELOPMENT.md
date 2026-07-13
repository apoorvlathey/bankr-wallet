# Development

This is a pnpm workspaces monorepo containing the browser extension (`apps/extension`), the landing page website (`apps/website`), Ponder indexers, bots, and Solidity contracts.

## Pre-requisites

- Node.js (see `.nvmrc` for the version)
- pnpm

## Tech Stack

| App             | Framework               | UI Library | Build Tool |
| --------------- | ----------------------- | ---------- | ---------- |
| Extension       | React 18                | Chakra UI  | Vite       |
| Website         | Next.js 14 (App Router) | Chakra UI  | Next.js    |
| Indexer         | Ponder                  | Hono       | Ponder     |
| Staking Indexer | Ponder                  | Hono       | Ponder     |
| TG Bot          | Grammy + Hono           | —          | tsc        |
| Arb Bot         | Node.js + viem          | —          | tsc        |
| WalletChan RPC  | Node.js + Hono          | —          | tsc        |
| WalletChan MCP  | Node.js stdio MCP       | —          | tsc        |
| Contracts       | Solidity                | —          | Foundry    |

## Commands

```bash
# Install dependencies
pnpm install

# Development
pnpm dev:extension         # Build extension in DEVELOPMENT mode (vite build --mode development)
pnpm dev:website           # Start website dev server at localhost:3030
pnpm dev:staking-indexer   # Start staking indexer at localhost:42070
pnpm dev:tg-bot            # Start TG bot + API at localhost:3001
pnpm dev:arb-bot           # Start arb bot (requires .env with PRIVATE_KEY + BASE_RPC_URL)
pnpm dev:walletchan-rpc    # Start local JSON-RPC -> WalletConnect proxy at localhost:4209
pnpm dev:walletchan-mcp    # Start local stdio MCP adapter backed by walletchan-rpc

# Build
pnpm build              # Build both extension and website
pnpm build:extension    # Build extension in PRODUCTION mode (output: apps/extension/build/)
pnpm build:website      # Build website only
pnpm build:walletchan-rpc # Build WalletChan RPC CLI only
pnpm build:walletchan-mcp # Build WalletChan MCP CLI only

# Extension-specific
pnpm zip                # Build + zip (for GitHub Releases)
pnpm zip:cws            # Build + zip (strips `key` defensively, for CWS upload)
pnpm lint               # Lint extension code
pnpm typecheck:extension:ui # Strict semantic check for shared UI/theme primitives
pnpm typecheck:extension    # Full strict extension source gate
pnpm typecheck:extension:qa # Strict check for Playwright/axe QA scripts
pnpm --filter @walletchan/extension qa:preview # 235-state visual/a11y matrix
pnpm qa:extension           # Build + packaged Chrome runtime matrix

# Firefox build (separate output dir: apps/extension/build-firefox/)
pnpm build:extension:firefox   # Production Firefox build
pnpm dev:extension:firefox     # Dev Firefox build (uses local website)
pnpm zip:firefox               # Build + zip Firefox artifact for archival
pnpm sign:firefox              # Build + submit to AMO (requires WEB_EXT_API_KEY / WEB_EXT_API_SECRET)

# Contracts
pnpm build:contracts    # Compile Solidity contracts
pnpm test:contracts     # Run Foundry tests

# Foundry library installation (ALWAYS use git submodules)
cd apps/contracts && forge install <org>/<repo>   # Do NOT use --no-git

# Release (auto-bumps version, syncs manifest, creates tag, pushes)
pnpm release:patch      # 0.1.0 → 0.1.1
pnpm release:minor      # 0.1.0 → 0.2.0
pnpm release:major      # 0.1.0 → 1.0.0
```

See [`PUBLISHING.md`](./PUBLISHING.md) for the full release workflow.

## Extension Build Modes: Development vs Production

The extension has two build modes, selected via Vite's `--mode` flag. They produce the same output directory (`apps/extension/build/`), but some code paths gate behavior on `import.meta.env.MODE`.

| Command                | Vite mode     | `import.meta.env.MODE` | Use when                                                        |
| ---------------------- | ------------- | ---------------------- | --------------------------------------------------------------- |
| `pnpm dev:extension`   | `development` | `"development"`        | Testing changes locally against `pnpm dev:website`              |
| `pnpm build:extension` | `production`  | `"production"`         | Releases, CWS uploads, GitHub Releases (anything users install) |

**What flips between modes**:

The entire `WALLETCHAN_API_BASE` constant in `apps/extension/src/constants/externalUrls.ts` flips when `import.meta.env.MODE === "development"`. Every derived endpoint (portfolio, swap, bridge, sponsored-transfer, premium-status, vault-data, clear-signing) follows it. Development → `http://localhost:3030/api`; production → `https://walletchan.eth.sh/api` so extension APIs remain reachable on ISPs that block `walletchan.com` DNS. The dev port lives in `WALLETCHAN_DEV_PORT` and matches `apps/website/package.json`'s `dev` script (`next dev -p 3030`) — change both together if you ever need to move it.

**Rule of thumb:**

- Building to test a change end-to-end against the local website dev server → `pnpm dev:extension`.
- Building anything that will ship to users (zip, release, CWS) → `pnpm build:extension` (or `pnpm zip` / `pnpm zip:cws`, which call it internally).

Note: `import.meta.env.DEV` is **not** the right toggle — it's only true under the `vite` dev-server, not under `vite build`, so a `dev:extension` build would otherwise look like prod. Always gate on `MODE === "development"`.

## Testing Extension Changes

### TypeScript checks

`pnpm typecheck:extension:ui` is the green, strict semantic gate for the shared
mobile UI primitives, theme implementation, copy control, and full-screen
portal layer. Its boundary is explicit in `apps/extension/tsconfig.ui.json` and
keeps fast UI iteration available.

`pnpm typecheck:extension` runs strict TypeScript across all extension source,
including background, signing, storage, swap, and preview code. It is a required
green gate. Do not weaken strictness or add blanket suppressions to make it pass.

`pnpm typecheck:extension:qa` checks the Playwright/axe scripts under
`apps/extension/scripts/*-qa.ts`. Keep this green whenever preview or packaged
extension coverage changes.

### Packaged extension QA

`pnpm qa:extension` builds every manifest target, loads that exact production
package into fresh Chromium profiles, and runs the transaction, signature,
view-only/batch, daily-use, and authentication suites. The matrix covers Bankr,
private-key, and seed-phrase accounts. It uses a local dapp and rejects every
transaction/signature/batch request, so it never signs or broadcasts test work.

The packaged checks include pending-request persistence across UI close/reopen,
keyboard rejection, exactly-once EIP-1193 responses, view-only restrictions,
home actions under failed portfolio/RPC traffic, account/network switching,
manual lock, master/agent unlock, and agent-session secret restrictions. Real
WebAuthn ceremonies, assistive-technology smoke, and successful onchain sends
remain manual release checks.

1. `pnpm dev:extension` (for local testing against `pnpm dev:website`) or `pnpm build:extension` (production-mode build)
2. Go to `chrome://extensions`
3. Click refresh icon on WalletChan card
4. Test in a dapp (e.g., app.aave.com)

**Never use `pnpm build:web` to verify changes.** It only rebuilds the popup/sidepanel bundle (`main.js`) and leaves `inject.js` / `inpage.js` / `background.js` / `ens-banner.js` orphaned — Chrome then refuses to load the extension with `Could not load javascript 'static/js/inject.js' for script. Could not load manifest.` Always run `pnpm dev:extension` (dev mode) or `pnpm build:extension` (prod mode) so every script the manifest references is present in `apps/extension/build/`.

## Browser Targets (Chrome + Firefox)

The same Vite pipeline produces two artifacts:

- `pnpm build:extension` → `apps/extension/build/` (Chrome MV3 — `service_worker` background, `side_panel`)
- `pnpm build:extension:firefox` → `apps/extension/build-firefox/` (Firefox MV3 — `background.scripts` event page, no sidepanel)

`BROWSER=firefox` is the gating env. It flips Vite's `outDir` to `build-firefox/` and switches the background bundle from ES module to IIFE (Firefox event pages can't load ES modules). A post-build script (`scripts/swap-manifest.mjs`) overwrites the Chrome manifest in `build-firefox/` with the Firefox variant kept at `apps/extension/manifest.firefox.json` (deliberately stored OUTSIDE `public/` so it doesn't leak into the Chrome zip).

**Manifest drift control**: whenever you edit `apps/extension/public/manifest.json`, mirror the equivalent change in `apps/extension/manifest.firefox.json`. Chrome-only keys (`side_panel`, `permissions: ["sidePanel"]`, `background.service_worker`/`type:"module"`) MUST stay out of the Firefox manifest; Firefox-only keys (`background.scripts`, `browser_specific_settings.gecko.*`) stay out of the Chrome manifest.

See [`FIREFOX.md`](./FIREFOX.md) for the full Firefox port doc (port rationale, sidepanel/popup divergence, the `chrome.storage.session` compatibility layer, `chrome-extension://` → `moz-extension://` URL handling, AMO release flow, known gaps).

## Loading the extension in your browser

After building:

- **Chrome / Brave / Arc**: Go to `chrome://extensions`, enable Developer mode, click "Load unpacked", select `apps/extension/build/`.
- **Firefox**: `pnpm --filter @walletchan/extension firefox:run` or load `apps/extension/build-firefox/` via `about:debugging` → "This Firefox" → "Load Temporary Add-on" (point at `manifest.json`).

## Running the website in development mode

```bash
pnpm dev:website
```

Starts the Next.js dev server at `http://localhost:3030`. The port is intentionally non-default — it must match `WALLETCHAN_DEV_PORT` in `apps/extension/src/constants/externalUrls.ts` so `pnpm dev:extension` can round-trip API calls against your local dev server.

## Environment Variables

When adding or using new environment variables in any app, always update (or create) the `.env.example` file in that app's directory. This ensures developers know what env vars are needed.

## WalletChan RPC / MCP

Implementation details for the local agent tooling live in:

- [`WALLETCHAN_RPC.md`](./WALLETCHAN_RPC.md) - local JSON-RPC to WalletConnect bridge
- [`WALLETCHAN_MCP.md`](./WALLETCHAN_MCP.md) - local stdio MCP adapter, managed RPC, and Base skill wrapping

## Releasing & Publishing

See [`PUBLISHING.md`](./PUBLISHING.md) for the full release workflow, Chrome Web Store upload process, and self-hosted auto-update system. Storage migration rules and the pre-release checklist live there too.

Quick reference:

```bash
pnpm release:patch  # 0.2.0 → 0.2.1 (bug fixes)
pnpm release:minor  # 0.2.0 → 0.3.0 (new features)
pnpm release:major  # 0.2.0 → 1.0.0 (breaking changes)
```

## Deploying long-running services (Railway)

See [`RAILWAY.md`](./RAILWAY.md). Use a Dockerfile + `railway.toml` — Nixpacks does not work with this pnpm workspace.
