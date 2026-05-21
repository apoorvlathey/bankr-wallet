# WalletChan

Browser wallet extension + landing page website in a pnpm workspace monorepo.

## Project Overview

**What it does**: WalletChan is a Wallet Chrome extension that enables and executing transactions through the Bankr API on all the dapps. Like MetaMask, but AI-powered. Supports Private Keys and Seed phrases as well.

**Supported chains**: Base (8453), Ethereum (1), MegaETH, Polygon (137), Unichain (130)

## Critical: Test ALL Wallet Types

**Supported wallet types**:

1. **Bankr API accounts** (`type: "bankr"`) — API-based signing, per-account API key
2. **Private Key accounts** (`type: "privateKey"`) — local signing
3. **Seed Phrase accounts** (`type: "seedPhrase"`) — local HD-wallet signing
4. **Impersonator accounts** (`type: "impersonator"`) — **view-only**, address-only metadata, cannot execute transactions or sign messages

**When implementing ANY feature that touches transactions, signatures, or authentication:**

- **Test with all four wallet types** before considering it done
- Different wallet types use different code paths (e.g., `confirmTransactionAsync` vs `confirmTransactionAsyncPK`)
- Agent password must work for signing transactions/messages for ALL signing types (not just Bankr API accounts)
- Private key reveal is blocked for agent password regardless of wallet type
- Execution features must reject impersonator accounts (they're view-only)

**Common mistake**: Fixing something only for Bankr API accounts and forgetting that private key/seed phrase accounts have separate handlers, or forgetting that impersonator accounts must be blocked from any execution path.

## Critical: Tx-Confirmation UI Consistency

**ALL transaction confirmation screens must offer the same gas-fee UX.** The wallet has multiple confirmation surfaces and they must stay in lockstep — when one ships a new gas feature, the others have to ship it too, or users get inconsistent behavior depending on how they triggered the tx.

**Confirmation surfaces today:**

| Surface | File | Underlying gas component |
|---|---|---|
| Single-tx confirmation (dapp-initiated) | `apps/extension/src/components/TransactionConfirmation.tsx` | `GasEstimateDisplay.tsx` |
| Batch tx confirmation (ERC-5792, dapp-initiated) | `apps/extension/src/components/BatchTransactionConfirmation.tsx` | `MultiTxGasEstimateDisplay.tsx` |
| Cross-dapp batch confirmation (user-assembled) | `apps/extension/src/components/CrossDappBatchConfirmation.tsx` | `MultiTxGasEstimateDisplay.tsx` (wraps BatchTransactionConfirmation) |
| **Swap confirmation (internal)** | `apps/extension/src/components/Swap/SwapConfirmation.tsx` | `MultiTxGasEstimateDisplay.tsx` |

**When you change anything about gas params, the tier picker, validity, or override plumbing in ANY of these screens, audit the others.** The swap path in particular is easy to miss — it's its own confirmation UI separate from the dapp-initiated batch flow but uses the same underlying `MultiTxGasEstimateDisplay`.

**Required wiring for any tx-confirmation surface (PK / Seed accounts)**:

1. Pass `isNonAtomic={true}` to `MultiTxGasEstimateDisplay` (or use `GasEstimateDisplay` for single tx) so the tier picker actually renders.
2. Wire `onGasEstimates` (or `onGasOverrides` for single tx) to a parent state.
3. Wire `onValidityChange` to a `gasValid` state and disable the Confirm button on `!gasValid`.
4. Send the gas estimates / overrides through to the background handler that signs the tx.
5. Make sure the background handler actually applies them at sign time (clears legacy `gasPrice`, sets `maxFeePerGas` / `maxPriorityFeePerGas` / `gas` from the override).

**Bankr / impersonator paths are exempt:** Bankr handles gas server-side; impersonator can't broadcast. The gas component handles these gracefully (picker auto-hides), but the parent should still set `isNonAtomic` correctly so the picker only fires its callbacks for PK / Seed.

**When adding a NEW tx-confirmation surface**: list it in the table above and make sure every gas feature here works on it before merging.

## AI Session Workflow

**At the start of each session**, before writing any code:

1. **Read `_docs/IMPLEMENTATION.md`** when working on extension logic, message passing, background handlers, or crypto
2. **Read `_docs/STYLING.md`** when working on any UI components or styling
3. **Read `_docs/WEBSITE.md`** when working on the landing page

**Before every commit** that touches extension code:

4. **Read `_docs/SECURITY.md`** and verify changes against the pre-commit security checklist. This is critical for any changes to message handlers, storage, crypto, content scripts, or session management.

**After making significant changes:**

- **Update `_docs/IMPLEMENTATION.md`** if you modified:
  - Message types or message flow
  - Background handler logic
  - Storage keys or encryption patterns
  - New features or architectural decisions
- **Update `_docs/SECURITY.md`** if you modified:
  - Message handlers that touch secrets or account data
  - Agent password access control (new blocked/allowed operations)
  - Storage keys (add to the storage keys reference)
  - Content script message filtering (new message types forwarded)
  - Encryption parameters or crypto logic
- Keep the documentation in sync with the code - future sessions depend on accurate docs

## Monorepo Structure

```
walletchan/
├── apps/
│   ├── extension/        # Browser extension (Vite + React + Chakra UI)
│   ├── website/          # Landing page (Next.js + Chakra UI)
│   ├── indexer/          # Ponder indexer for coin launches
│   ├── staking-indexer/  # Ponder indexer for sBNKRW vault staking
│   ├── tg-bot/           # Token-gated Telegram bot (Grammy + Hono)
│   ├── arb-bot/          # WETH↔WCHAN/BNKRW cross-pool arbitrage bot (Base)
│   └── contracts/        # Solidity smart contracts (Foundry)
├── packages/
│   ├── shared/           # Shared design tokens, assets, and contract constants
│   └── wchan-swap/       # Shared swap logic (quoting, encoding, permit2)
├── _docs/                # LLM-facing documentation
│   ├── IMPLEMENTATION.md  # Extension architecture and message flows
│   ├── SECURITY.md        # Security audit guide, threat model, pre-commit checklists
│   ├── STYLING.md         # Bauhaus design system (colors, typography, components)
│   ├── WEBSITE.md         # Website PRD and section specs
│   ├── DEVELOPMENT.md     # Build and dev environment setup
│   └── PUBLISHING.md      # Release workflow, CWS upload, auto-update system
```

## Tech Stack

| App             | Framework               | UI Library | Build Tool |
| --------------- | ----------------------- | ---------- | ---------- |
| Extension       | React 18                | Chakra UI  | Vite       |
| Website         | Next.js 14 (App Router) | Chakra UI  | Next.js    |
| Indexer         | Ponder                  | Hono       | Ponder     |
| Staking Indexer | Ponder                  | Hono       | Ponder     |
| TG Bot          | Grammy + Hono           | —          | tsc        |
| Arb Bot         | Node.js + viem          | —          | tsc        |
| Contracts       | Solidity                | —          | Foundry    |

**Design System**: Token-driven theme engine. Two themes ship today — **Bauhaus** (light, geometric, primary colors, hard shadows, thick borders) and **Midnight** (dark, modern, soft luminous shadows, rounded corners). User picks one in Settings → Appearance. Components consume *intent* tokens (`accent.primary`, `surface.raised`, `chart.numeric`, etc.) — never theme-color literals. See `_docs/THEME.md` for the engine handbook (architecture, public API, authoring rules, recipes, how to add a new theme), `_docs/STYLING.md` for the full token vocabulary, and `_docs/THEMING_PRD.md` for the phased rollout history.

## Commands

```bash
# Install dependencies
pnpm install

# Development
pnpm dev:extension         # Build extension in DEVELOPMENT mode (vite build --mode development)
pnpm dev:website           # Start website dev server at localhost:3000
pnpm dev:staking-indexer   # Start staking indexer at localhost:42070
pnpm dev:tg-bot            # Start TG bot + API at localhost:3001
pnpm dev:arb-bot           # Start arb bot (requires .env with PRIVATE_KEY + BASE_RPC_URL)

# Build
pnpm build              # Build both extension and website
pnpm build:extension    # Build extension in PRODUCTION mode (output: apps/extension/build/)
pnpm build:website      # Build website only

# Extension-specific
pnpm zip                # Build + zip (for GitHub Releases)
pnpm zip:cws            # Build + zip (strips `key` defensively, for CWS upload)
pnpm lint               # Lint extension code

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

## Extension Architecture

The extension has 5 build targets (see `apps/extension/vite.config.*.ts`):

| Script        | Purpose                                            |
| ------------- | -------------------------------------------------- |
| main.js       | Popup/sidepanel UI (React app)                     |
| onboarding.js | Full-page onboarding wizard                        |
| inpage.js     | Injected provider (EIP-6963 + window.ethereum)     |
| inject.js     | Content script (bridges inpage ↔ background)       |
| background.js | Service worker / event page (API calls, storage, notifications) |

**Message flow**: Dapp → inpage.js → inject.js → background.js → Bankr API

For detailed architecture, message types, and flows, see `_docs/IMPLEMENTATION.md`.

### Browser targets (Chrome + Firefox)

The same Vite pipeline produces two artifacts:

- `pnpm build:extension` → `apps/extension/build/` (Chrome MV3 — `service_worker` background, `side_panel`)
- `pnpm build:extension:firefox` → `apps/extension/build-firefox/` (Firefox MV3 — `background.scripts` event page, no sidepanel)

`BROWSER=firefox` is the gating env. It flips Vite's `outDir` to `build-firefox/` and switches the background bundle from ES module to IIFE (Firefox event pages can't load ES modules). A post-build script (`scripts/swap-manifest.mjs`) overwrites the Chrome manifest in `build-firefox/` with the Firefox variant kept at `apps/extension/manifest.firefox.json` (deliberately stored OUTSIDE `public/` so it doesn't leak into the Chrome zip).

**Drift control**: whenever you edit `apps/extension/public/manifest.json`, mirror the equivalent change in `apps/extension/manifest.firefox.json`. They share `name`, `version`, `description`, `icons`, `action`, `content_scripts`, `host_permissions`, `web_accessible_resources`, and the non-Chrome-only entries of `permissions`. Chrome-only keys (`side_panel`, `permissions: ["sidePanel"]`, `background.service_worker`/`type:"module"`) MUST stay out of the Firefox manifest; Firefox-only keys (`background.scripts`, `browser_specific_settings.gecko.*`) stay out of the Chrome manifest.

**Sidepanel is Chrome-only.** Firefox has no `chrome.sidePanel` (and its `sidebar_action` equivalent didn't render reliably across Firefox-family browsers in testing, including Zen). Firefox UX is popup-only — toolbar icon → `chrome.action.onClicked` → `openPopupWindow()` → `chrome.windows.create({type:"popup"})`. Don't reintroduce `sidebar_action` to the Firefox manifest.

Firefox does not provide `chrome.storage.session`. All session storage goes through `apps/extension/src/chrome/sessionStorage.ts` — a shim that passes through to `chrome.storage.session` on Chrome and falls back to `chrome.storage.local` (with a `__session__` key prefix + `runtime.onStartup` clear) on Firefox. Direct `chrome.storage.session.*` calls are forbidden in `src/`; the only place that file legitimately appears is `sessionStorage.ts` itself.

**Never hardcode `chrome-extension://` anywhere.** Firefox extension pages live at `moz-extension://<UUID>/...`, so any URL-prefix check that bakes in `chrome-extension://` silently breaks on Firefox (the `isExtensionPage()` auth gate hit exactly this — 40+ message types started returning "Unauthorized"). Always derive the extension origin from `chrome.runtime.getURL("/")`, which returns the correct scheme + identifier for whichever browser is running. Filters that skip extension/internal URLs should also include `moz-extension://` and `about:` alongside `chrome-extension://` and `chrome://`.

**The toolbar popup uses different mechanisms per browser.** Chrome uses `action.default_popup` (inline popup attached to the toolbar icon). Firefox-family browsers don't render that reliably (confirmed broken in Zen), so the Firefox manifest has no `default_popup` — clicking the icon fires `chrome.action.onClicked`, which routes through `openPopupWindow()` to `chrome.windows.create({type: "popup"})`. `POPUP_PATH` in `sidepanelManager.ts` controls the runtime equivalent: `"popup-init.html"` on Chrome, `""` on Firefox.

See `_docs/FIREFOX.md` for the full Firefox port doc (port rationale, AMO release flow, known gaps).

## Key Extension Files

```
apps/extension/src/
├── chrome/
│   ├── background.ts        # Service worker (message router)
│   ├── authHandlers.ts      # Unlock, password change, vault key migration
│   ├── sessionCache.ts      # Credential caching, auto-lock, session restore
│   ├── txHandlers.ts        # Transaction/signature handling, account mgmt
│   ├── chatHandlers.ts      # Bankr AI chat prompt handling
│   ├── sidepanelManager.ts  # Sidepanel/popup mode, Arc browser detection
│   ├── crypto.ts            # AES-256-GCM encryption for API keys
│   ├── cryptoUtils.ts       # Shared crypto utilities (PBKDF2, base64)
│   ├── vaultCrypto.ts       # Vault encryption for private keys
│   ├── bankrApi.ts          # Bankr API client
│   ├── txSimulation.ts      # Asset change simulation (state override injection)
│   ├── gasEstimation.ts     # Gas estimation + native token price
│   ├── batchTxHandlers.ts   # ERC-5792 batch tx handlers + ERC-7821 encoding
│   ├── erc5792Types.ts      # ERC-5792 type definitions
│   ├── pendingBatchTxStorage.ts  # Pending dapp-initiated batch request persistence
│   ├── crossDappBatchStorage.ts  # User-assembled cross-dapp batch (single batch, Bankr only)
│   ├── crossDappBatchHandlers.ts # Add/remove/reject/confirm handlers for the cross-dapp batch
│   ├── bundleStatusStorage.ts    # Bundle status for getCallsStatus
│   ├── forceInclusion.ts     # OP Stack L1 deposit for force inclusion
│   ├── batchForceInclusion.ts # Force inclusion for ERC-5792 batch txs
│   ├── impersonator.ts      # Inpage provider (EIP-6963 + ERC-5792)
│   └── inject.ts            # Content script bridge
├── components/
│   ├── TransactionConfirmation.tsx     # Single tx confirmation (incl. + Add to Batch button)
│   ├── BatchTransactionConfirmation.tsx  # Batch tx confirmation UI (ERC-5792)
│   ├── CrossDappBatchConfirmation.tsx  # Thin wrapper around BatchTransactionConfirmation for user-assembled batches
│   ├── AssetChangesDisplay.tsx    # Simulated token flow display
│   ├── SignatureRequestConfirmation.tsx
│   ├── UnlockScreen.tsx
│   └── Settings/
├── pages/
│   └── Onboarding.tsx
├── theme/                       # Theme engine (see _docs/THEME.md)
│   ├── tokens.ts                # ThemeTokens interface — contract every theme satisfies
│   ├── createTheme.ts           # Factory: tokens → Chakra theme (Button/Input/Modal/Menu/Popover/Slider configs)
│   ├── ThemeProvider.tsx        # React context + ChakraProvider wrapper
│   ├── useThemeSelection.ts     # Read/write selectedThemeId from chrome.storage.local
│   ├── useStripTokens.ts        # Shared dark CTA strip color pair (used by tx/sig confirmations, chat header, etc.)
│   ├── bootstrap.ts             # Pre-React paint sync to avoid theme flash
│   ├── index.ts                 # Public API barrel (incl. primitives + useStripTokens re-exports)
│   ├── themes/
│   │   ├── bauhaus.ts           # Default theme (light, geometric)
│   │   └── midnight.ts          # Dark theme
│   └── primitives/              # Theme-aware atoms consumed by migrated screens
│       ├── ThemedCard.tsx       # Surface card (default/raised/sunken + interactive)
│       ├── ThemedPanel.tsx      # Larger-padding section container
│       ├── ThemedField.tsx      # FormControl + Label + Input + helper/error
│       ├── IconBox.tsx          # Bordered+shadowed icon square
│       └── Decorator.tsx        # Theme-aware corner ornament (Bauhaus only)
├── hooks/
│   └── useThemedToast.tsx       # Theme-aware toast (replaces useBauhausToast — uses status accent tokens)
└── App.tsx                   # Main popup app
```

## Key Website Files

```
apps/website/
├── app/
│   ├── layout.tsx
│   ├── page.tsx
│   ├── components/        # Hero, Features, TokenSection, etc.
│   └── lib/
│       ├── siteRouting.ts # Subdomain registry + pure URL resolution functions
│       ├── useSiteNav.ts  # React hook wrapping siteRouting for client components
│       └── theme.ts       # Chakra UI Bauhaus theme
```

## Documentation References

When working on features, refer to these docs:

| Doc                                                      | When to read                                              |
| -------------------------------------------------------- | --------------------------------------------------------- |
| `_docs/IMPLEMENTATION.md`                                | Extension internals, message types, tx flow               |
| `_docs/SECURITY.md`                                      | Threat model, access control, pre-commit checklists       |
| `_docs/CHAT.md`                                          | Chat interface to directly chat & prompt to bankr api     |
| `_docs/STYLING.md`                                       | UI components, design tokens, Bauhaus system              |
| `_docs/THEME.md`                                         | Theme engine handbook: architecture, public API, authoring rules, recipes, adding a new theme |
| `_docs/THEMING_PRD.md`                                   | Theme engine PRD: ADR, design briefs, phased rollout history |
| `_docs/WEBSITE.md`                                       | Website sections, layout specs, animations                |
| `_docs/APPS.md`                                          | Apps page data source, fetch script, adding chains        |
| `_docs/SWAP.md`                                          | Swap page: 0x API integration, fees, slippage, UI         |
| `_docs/BRIDGE.md`                                        | Bridge page: Bungee API, cross-chain quote/build/submit/status, atomic-batch vs Permit2 paths |
| `_docs/COINS.md`                                         | Coins page: SSE streaming, indexer API, pagination        |
| `_docs/CALLDATA.md`                                      | Calldata decoder UI, param components, type routing       |
| `_docs/ASSET_CHANGES_SIMULATION.md`                      | Tx simulation: state override injection, metadata retry   |
| `_docs/ERC5792.md`                                       | ERC-5792 batch txs: message flow, ERC-7821 encoding, 7702 plan |
| `_docs/ERC5792-DAPP-SUPPORT.md`                          | Dapp-side guide: upgrade any dapp from multi-popup → single-popup batched txs via wagmi (`useCapabilities`/`useSendCalls`/`useCallsStatus`) with graceful fallback |
| `_docs/L2_FORCE_INCLUSION.md`                            | OP Stack force inclusion: L1 deposit flow, portal encoding, 2-step status |
| `apps/staking-indexer/STAKING_INDEXER_IMPLEMENTATION.md` | Staking indexer: sBNKRW vault events, balance tracking (legacy) |
| `apps/wchan-vault-indexer/IMPLEMENTATION.md`             | WCHAN vault indexer: sWCHAN balance tracking, APY, snapshots    |
| `_docs/DEVELOPMENT.md`                                   | Build process, dev environment setup                      |
| `_docs/PUBLISHING.md`                                    | Release workflow, CWS upload, auto-update, signing        |
| `_docs/FIREFOX.md`                                       | Firefox port: build pipeline, manifest divergence, storage.session shim, AMO release |
| `_docs/STORAGE.md`                                       | Every chrome.storage key, shapes, version history         |
| `_docs/ADD_CHAIN.md`                                     | How to add a new chain (single registry entry)            |
| `apps/tg-bot/IMPLEMENTATION.md`                          | TG bot: verification flow, commands, API, balance checker |
| `apps/arb-bot/IMPLEMENTATION.md`                         | Arb bot: cross-pool arb strategy, batched RPC, encoding   |
| `_docs/TOKEN_GATED_TG.md`                                | Token-gated TG system: architecture, DB schema, security  |
| `openclaw-skills/bankr/SKILL.md`                         | Bankr API interactions, workflows, error handling         |
| [github.com/apoorvlathey/walletchan-skill](https://github.com/apoorvlathey/walletchan-skill) | Public agent skill for driving the WalletChan extension via CDP. Canonical source lives in this separate repo; the website links directly to its raw `SKILL.md` (`https://raw.githubusercontent.com/apoorvlathey/walletchan-skill/main/skills/walletchan/SKILL.md`) and does not host its own copy. |

## Important Patterns

- **API key encryption**: AES-256-GCM with PBKDF2 (600k iterations)
- **Session caching**: Decrypted API key cached in background worker memory with auto-lock timeout
- **Per-tab chain state**: Each browser tab maintains its own selected chain
- **Transaction persistence**: Pending transactions survive popup close (stored in chrome.storage.local)
- **EIP-6963**: Modern wallet discovery alongside legacy window.ethereum
- **Shared contract constants**: `packages/shared/src/contracts.ts` is the single source of truth for `BASE_CHAIN_ID`, `BNKRW_TOKEN_ADDRESS`, `SBNKRW_VAULT_ADDRESS`, `BNKRW_POOL_ADDRESS`. Import via `@walletchan/shared/contracts`.
- **Address display standard**: Whenever a `0x` address is shown in the UI, always include a **copy button** (CopyIcon/CheckIcon toggle) and a **view on explorer** link (ExternalLinkIcon, opens `${chainConfig.explorer}/address/${addr}`). See `TypedDataDisplay.tsx` `AddressValue` component for the reference pattern.
- **Copy button feedback**: NEVER use toast notifications for copy actions — toasts block nearby buttons (e.g., Reject/Confirm on tx confirmation, Chat button on homepage). Instead, toggle the icon from `CopyIcon` → `CheckIcon` (with `accent.highlight` color) for 2 seconds. Use the shared `CopyButton` component from `components/CopyButton.tsx` when possible. For inline copy buttons, follow the same pattern: `setCopied(true)` + `setTimeout(() => setCopied(false), 2000)`.
- **Token-driven theming**: Components must consume *intent* tokens (`accent.primary/secondary/highlight`, `surface.base/raised/sunken`, `fg.primary/secondary/muted/inverse`, `border.default/focus`, `status.success/warning/error/info.{bg,fg,border,tint}`, `chart.positive/negative/neutral/numeric`) — NEVER hardcoded hex literals or theme-specific names like `bauhaus.red`. The factory in `theme/createTheme.ts` translates intent tokens to a Chakra theme per the active `ThemeTokens` shape. To add a new theme: write `theme/themes/{name}.ts` satisfying the `ThemeTokens` interface, register it in `theme/ThemeProvider.tsx`. Zero component edits required. See `_docs/THEMING_PRD.md` for the full architecture.
- **Reject All button color**: Use `chart.negative` (NOT `status.error.fg`) for any "destructive ghost button" text. `status.error.fg` is WHITE in Bauhaus (it pairs with the RED bg) and would render invisibly. `chart.negative` is RED in both themes.
- **Dark CTA strip pattern**: For inverted bars (tx confirmation count badges, chat headers, "Add Token" CTAs, etc.), use `useStripTokens()` from `@/theme` which returns `{ bg, fg }` — Bauhaus paints a literal black bar with white text; Midnight uses recessed `surface.sunken` with primary fg text on top. Don't duplicate the `themeId === "midnight" ? ... : ...` ternary inline.

## Writing Conventions

- **Use "onchain", not "on-chain".** Project-wide spelling — applies to user-facing strings (notifications, UI copy), code comments, doc files, and identifiers. Same for derived forms: "onchain balance", "confirmed onchain", etc. Don't reintroduce the hyphenated form.

## Code Quality Guidelines

### File Size & Modularity

- **Keep files under ~400 lines.** If a file grows beyond that, split it into focused modules by responsibility.
- **One concern per file.** Each module should have a clear, single purpose (e.g., `sessionCache.ts` owns all credential caching, `authHandlers.ts` owns all unlock/password logic).
- **background.ts is a message router only.** It registers Chrome event listeners and delegates to handler modules. Never add business logic directly to it.

### Reuse Over Duplication

**Default to reusing existing code over writing parallel implementations.** Before building a new component, hook, utility, storage helper, or handler, search the codebase for something that already does ~80% of what's needed. If you find a near-match, prefer making it slightly more flexible (add an optional override prop, accept a callback, extract a sub-component) over duplicating its logic in a sibling.

- **Search first, build second.** Use `Grep` / `find` for keywords (component names, hook prefixes, function names) before writing anything new. Check `components/`, `hooks/`, `lib/`, `chrome/`. If you're unsure whether a thing exists, spend the 30 seconds to look.
- **Extend existing components via optional override props instead of forking them.** When an existing component does what you need but writes to the wrong storage / fires the wrong action, add an optional callback prop (e.g., `onSaveCalldata?: (data) => Promise<...>`) that — when set — replaces the default behavior. Callers that don't supply it get the legacy behavior unchanged. Reference: `ERC20ApproveDisplay` accepts an `onSaveCalldata` override so the same component renders the single-tx approve UI AND the per-call approve editor inside batches.
- **Reuse existing React components** before creating new ones. Check `components/` for existing UI patterns. If you catch yourself reimplementing token-info fetching, an edit/save toggle, a "copy + explorer" address pill, an avatar resolver, etc., stop — those primitives already exist (`CopyButton`, `useCachedAvatarSrc`, `useCachedAvatarMap`, `ERC20ApproveDisplay`, `TokenAmount`, `AddressValue`, `useThemedToast`, `useStripTokens`, etc.).
- **Extract shared utilities** when the same logic appears in 2+ files. See `cryptoUtils.ts` for the pattern (shared constants + functions used by both `crypto.ts` and `vaultCrypto.ts`).
- **Centralize external lookups behind a single cached helper.** When more than one surface fetches the same external resource, build a shared cache helper rather than letting each surface fire its own request. Reference: `getEthShLabels()` (`lib/ethShLabelsCache.ts`) wraps eth.sh label fetches with memory + in-flight dedup + chrome.storage TTL. Same pattern for token metadata (`fetchTokenInfo`) and token logos (`getCachedTokenLogo`).
- **Use dependency injection** to avoid circular imports (e.g., `tryRestoreSession(unlockFn)` in `sessionCache.ts` takes a callback instead of importing `authHandlers.ts` directly).
- **Smell check before merging:** if the new code reads two `useState`s + a `useEffect` that already appear verbatim in a sibling file, you're forking instead of reusing. Refactor the sibling to be more general and consume it.

### Naming & Organization

- **Handler files**: `*Handlers.ts` (e.g., `authHandlers.ts`, `txHandlers.ts`, `chatHandlers.ts`)
- **State/cache files**: descriptive names (e.g., `sessionCache.ts`, `pendingTxStorage.ts`)
- **Utility files**: `*Utils.ts` (e.g., `cryptoUtils.ts`)
- **Keep related functions together** - if functions share state (like in-memory Maps), they belong in the same module.

### When Adding New Features

- Place new message handlers in the appropriate `*Handlers.ts` file, not in `background.ts`.
- Add the message routing case to the switch in `background.ts` (just a 1-3 line delegation).
- If a feature doesn't fit existing modules, create a new focused module rather than growing an existing one.
- Update `_docs/IMPLEMENTATION.md` and this file's Key Extension Files section if you add new modules.

### When Adding New Handlers That Need Credentials

**CRITICAL**: Any message handler that uses `getCachedPassword()` or `getCachedApiKey()` MUST include session restoration logic. Without it, the handler will fail when auto-lock is "Never" and Chrome restarts the service worker.

**Required pattern:**

```typescript
let password = getCachedPassword();

// If no cached password, try session restoration (for "Never" auto-lock mode)
if (!password) {
  const autoLockTimeout = await getAutoLockTimeout();
  if (autoLockTimeout === 0) {
    const restored = await tryRestoreSession(handleUnlockWallet);
    if (restored) {
      password = getCachedPassword();
    }
  }
}

if (!password) {
  sendResponse({ success: false, error: "Wallet must be unlocked" });
  return;
}
```

See `_docs/IMPLEMENTATION.md` → "Handlers with Session Restoration" for the full list of handlers that implement this pattern.

## Development Practices

### Environment Variables

**When adding or using new environment variables in any app**, always update (or create) the `.env.example` file in that app's directory. This ensures developers know what env vars are needed.

### Storage/Encryption Changes

**CRITICAL**: Chrome extensions auto-update silently — users on ANY previous version will receive new code. Before adding, removing, renaming, or changing the shape of ANY `chrome.storage` key, you **MUST**:

1. **Read [`_docs/STORAGE.md`](/_docs/STORAGE.md)** — full reference of every key, its shape, and which version introduced it
2. **Read [`_docs/PUBLISHING.md`](/_docs/PUBLISHING.md)** — migration rules, how to write an idempotent migration, and the pre-release storage checklist
3. **Write a migration** in `background.ts` (called from the `onInstalled` `"update"` handler) if old users would break without one
4. **Update `_docs/STORAGE.md`** with any new/changed keys and their version

Failure to do this **will brick the extension** for existing users (they get stuck in an onboarding loop or lose data).

Additional checks when modifying storage:

1. **Audit ALL read AND write paths** - grep for storage key names (`encryptedApiKey`, `encryptedApiKeyVault`, etc.)
2. **Check every file** that touches the data - `background.ts` has multiple handlers, `AccountSettingsModal.tsx` can save directly
3. **Common mistake**: updating read paths but forgetting write paths in different files/handlers

### Key Storage Locations

| Key                       | Purpose                                           |
| ------------------------- | ------------------------------------------------- |
| `encryptedApiKeyVault`    | API key encrypted with vault key (current format) |
| `encryptedApiKey`         | API key encrypted with password (legacy format)   |
| `encryptedVaultKeyMaster` | Vault key encrypted with master password          |

**Rule**: Check `cachedVaultKey` to determine which system is active before saving API keys.

### User-Reported Anomalies

When a user reports something unexpected (like a wrong value appearing):

- Don't dismiss it - trace the full data flow
- Ask: "Where does this value come from? What code path could produce it?"
- The anomaly is often a symptom of a deeper storage/migration issue

### Website Pages with Wagmi/RainbowKit Hooks

**CRITICAL**: Any website page (`page.tsx`) that uses wagmi hooks (`useAccount`, `useChainId`, `useReadContract`, etc.) or RainbowKit components (`ConnectButton`) will **fail on Vercel** during `next build` static prerendering with `WagmiProviderNotFoundError`.

**Required pattern** for new pages that use wagmi:

1. Put all page content in a separate `"use client"` file (e.g., `MyPageContent.tsx`)
2. Make `page.tsx` a **Server Component** that imports the content and exports `force-dynamic`:

```tsx
// page.tsx (Server Component — no "use client")
import MyPageContent from "./MyPageContent";

export const dynamic = "force-dynamic";

export default function MyPage() {
  return <MyPageContent />;
}
```

**Why**: `next build` statically prerenders pages at build time. Even though `WagmiProvider` is in the layout, wagmi's config initialization can fail during Node.js prerendering. `force-dynamic` skips prerendering entirely. These pages are inherently dynamic (wallet state) so there's no benefit to static generation.

**Existing pages using this pattern**: `migrate`, `admin`, `coins`, `stake`, `verify`

**Note**: Pages that only import child components using wagmi (like `swap/page.tsx` importing `SwapCard`) don't need this — only pages that directly use wagmi hooks in the page file itself.

### Adding New Website Subdomains

When adding a new page that should be accessible via a subdomain (e.g., `foo.walletchan.com`), you must update **four things**:

1. **Add a `beforeFiles` rewrite** in `apps/website/next.config.js` to map the subdomain to the route:
   ```js
   { source: "/:path((?!_next|api|images|og|screenshots).*)", has: [{ type: "host", value: "foo.walletchan.com" }], destination: "/foo/:path*" }
   ```
2. **Add a redirect** in `apps/website/next.config.js` from the old `bankrwallet.app` subdomain:
   ```js
   { source: "/:path*", has: [{ type: "host", value: "foo.bankrwallet.app" }], destination: "https://foo.walletchan.com/:path*", permanent: true }
   ```
3. **Add the route to the subdomain registry** in `apps/website/app/lib/siteRouting.ts`:
   ```ts
   { path: "/foo", subdomain: "foo.walletchan.com" }
   ```
   This is the single source of truth for client-side subdomain routing. All navigation helpers (`resolveHref`, `useSiteNav` hook, `getBasePath`) derive from this array.
4. **Add the subdomain in Vercel** project domain settings.

**Existing subdomains**: `os`, `stake`, `migrate`, `compare`, `mainnet`, `admin`

### Cross-Subdomain URL Routing

**CRITICAL**: Never construct subdomain URLs manually or use raw `window.location.hostname` checks for routing. Always use the centralized routing helpers:

- **`useSiteNav()` hook** (`apps/website/app/lib/useSiteNav.ts`) — for React components. Provides:
  - `href(path)` — resolves any internal path to the correct URL (handles localhost vs subdomain vs main site)
  - `homeHref` — logo/home link (`"/"` on localhost, `"https://walletchan.com"` on subdomains)
  - `isOnPage(route)` — checks if on a specific page (works with both pathname and subdomain)
  - `getRouteBasePath(route)` — returns `""` on own subdomain, `"/os"` etc. elsewhere
  - `isLocalhost`, `isOnSubdomain`, `currentRoute`
- **`siteRouting.ts`** (`apps/website/app/lib/siteRouting.ts`) — pure functions for non-React code. Same logic, takes `hostname` as parameter.

**Examples:**
```tsx
// In a component on any page/subdomain:
const { href, homeHref, isOnPage } = useSiteNav();
<Link href={href("/stake")}>Stake</Link>        // → "/stake" on localhost, "https://stake.walletchan.com" on prod
<Link href={href("#install")}>Install</Link>     // → "#install" on homepage, "https://walletchan.com/#install" on subdomains
<Link href={homeHref}>Home</Link>                // → "/" on localhost, "https://walletchan.com" on subdomains
const isOnStake = isOnPage("/stake");            // → true on /stake path OR stake.walletchan.com
```

## Ponder Indexer Performance

**CRITICAL**: When indexing events from **shared contracts** (contracts used by many users, like ClankerFeeLocker), always use Ponder's `filter` option in `ponder.config.ts` to filter by indexed event parameters at the RPC level — do NOT rely solely on filtering inside the event handler.

Without config-level filtering, Ponder fetches **all** events from the contract via `eth_getLogs` and your handler discards 99%+ of them. With `filter.args`, the RPC node uses topic filtering to only return matching events, which is orders of magnitude faster.

```ts
// BAD: fetches ALL ClaimTokens events, filters in handler
ClankerFeeLocker: {
  abi, address, startBlock,
}

// GOOD: RPC node filters by indexed args before returning
ClankerFeeLocker: {
  abi, address, startBlock,
  filter: {
    event: "ClaimTokens",
    args: { feeOwner: "0x...", token: ["0x...", "0x..."] },
  },
}
```

**Rule of thumb**: If an event parameter is `indexed` in the ABI and you only care about specific values, put it in `filter.args`. Keep the handler-level filter as a safety net if you want.

## Railway Deployment (pnpm Monorepo)

Railway's default Nixpacks builder does NOT work for this pnpm monorepo with `workspace:*` dependencies. Always use a **Dockerfile** + **`railway.toml`**.

**Pattern** (see `apps/indexer/` for reference):

- `Dockerfile`: `node:20-slim`, enable corepack/pnpm, copy workspace root files + the app + any `packages/*` workspace deps, `pnpm install --frozen-lockfile --filter <pkg>`
- `railway.toml`: sets `dockerfilePath` (from repo root), deploy config
- Do NOT set Root Directory, Build Command, or Start Command in Railway UI — `railway.toml` handles it
- For Ponder indexers: start command uses `--schema $RAILWAY_DEPLOYMENT_ID` for zero-downtime deploys

## Extension Build Modes: Development vs Production

The extension has two build modes, selected via Vite's `--mode` flag. They produce the same output directory (`apps/extension/build/`), but some code paths gate behavior on `import.meta.env.MODE`.

| Command               | Vite mode    | `import.meta.env.MODE` | Use when                                 |
| --------------------- | ------------ | ---------------------- | ---------------------------------------- |
| `pnpm dev:extension`  | `development`| `"development"`        | Testing changes locally against `pnpm dev:website` |
| `pnpm build:extension`| `production` | `"production"`         | Releases, CWS uploads, GitHub Releases (anything users install) |

**What flips between modes** (grep for `import.meta.env.MODE` to find current usages):

- **Clear-signing descriptor API** (`apps/extension/src/constants/externalUrls.ts`) — development hits `http://localhost:3000/api/clearsigning/descriptor` (your local Next.js dev server), production hits `https://walletchan.com/api/clearsigning/descriptor`.

**Rule of thumb:**
- Building to test a change end-to-end against the local website dev server → `pnpm dev:extension`.
- Building anything that will ship to users (zip, release, CWS) → `pnpm build:extension` (or `pnpm zip` / `pnpm zip:cws`, which call it internally).

Note: `import.meta.env.DEV` is **not** the right toggle — it's only true under the `vite` dev-server, not under `vite build`, so a `dev:extension` build would otherwise look like prod. Always gate on `MODE === "development"`.

## Testing Extension Changes

1. `pnpm dev:extension` (for local testing against `pnpm dev:website`) or `pnpm build:extension` (production-mode build)
2. Go to `chrome://extensions`
3. Click refresh icon on WalletChan card
4. Test in a dapp (e.g., app.aave.com)
