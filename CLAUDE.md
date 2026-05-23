# WalletChan

Browser wallet extension + landing page website in a pnpm workspace monorepo. The extension signs txs via the Bankr API on all dapps; also supports Private Keys, Seed Phrases, and view-only Impersonator accounts.

**Chains**: 8 built-in (Ethereum, Arbitrum, Base, BNB Chain, Optimism, MegaETH, Polygon, Unichain). PK / Seed Phrase / Impersonator accounts can also add custom EVM chains; Bankr API accounts are locked to the Bankr-supported subset (`isBankrSupported: true` in `chainRegistry.ts`). Single source of truth: `apps/extension/src/constants/chainRegistry.ts` — see [`_docs/ADD_CHAIN.md`](./_docs/ADD_CHAIN.md).

## Always-on guardrails (read these first)

These rules apply to almost every change. The detailed docs are listed in [Documentation References](#documentation-references) — read the one that matches the area you're touching.

### Test ALL four wallet types

Account types: `bankr` (API signing), `privateKey` (local), `seedPhrase` (local HD), `impersonator` (view-only).

- Features that touch transactions, signatures, or auth must be tested against **all four**. Different types use different code paths (e.g., `confirmTransactionAsync` vs `confirmTransactionAsyncPK`).
- Agent password must work for signing across ALL signing types, not just Bankr.
- Private-key reveal is blocked for the agent password regardless of wallet type.
- Execution features must reject impersonator accounts.

Common mistake: fixing only the Bankr path and forgetting PK/Seed have separate handlers, or forgetting impersonator must be blocked from execution.

### Tx-confirmation UI must stay consistent across surfaces

There are four confirmation surfaces (single, batch, cross-dapp batch, swap/bridge) — when one ships a new gas feature, the others must too. The swap path is the one most often missed. See [`_docs/TX_CONFIRMATION.md`](./_docs/TX_CONFIRMATION.md) for the surface table and required wiring (`isNonAtomic`, `onGasEstimates`, `onValidityChange`, applying overrides at sign time).

### Storage changes can brick existing users

Chrome auto-updates silently. Before adding/removing/renaming/reshaping ANY `chrome.storage` key, read [`_docs/STORAGE.md`](./_docs/STORAGE.md) (key reference + audit checklist) and [`_docs/PUBLISHING.md`](./_docs/PUBLISHING.md) (migration rules + pre-release checklist). Write an idempotent migration in `background.ts` if old users would break. Audit ALL read AND write paths — `background.ts` has multiple handlers and `AccountSettingsModal.tsx` can save directly.

### Handlers that need credentials need session restoration

Any new message handler using `getCachedPassword()` / `getCachedApiKey()` must include the session restoration block (for "Never" auto-lock mode after service worker restart). Canonical pattern + handler list in [`_docs/IMPLEMENTATION.md`](./_docs/IMPLEMENTATION.md) → "Adding New Handlers".

### Pre-commit security check

Before any commit that touches extension code (message handlers, storage, crypto, content scripts, session management), verify against the checklist in [`_docs/SECURITY.md`](./_docs/SECURITY.md).

## AI Session Workflow

At the **start of each session**, before writing code, read the doc that matches your area:

1. Extension logic / message passing / background handlers / crypto → [`_docs/IMPLEMENTATION.md`](./_docs/IMPLEMENTATION.md)
2. UI components / styling → [`_docs/STYLING.md`](./_docs/STYLING.md) (and [`_docs/THEME.md`](./_docs/THEME.md) if touching theme tokens)
3. Landing page → [`_docs/WEBSITE.md`](./_docs/WEBSITE.md)
4. Build/dev environment / commands / Firefox / Railway → [`_docs/DEVELOPMENT.md`](./_docs/DEVELOPMENT.md)

After making significant changes, **update the corresponding doc** if you modified message types, storage keys, handler logic, encryption, content-script filtering, or storage shapes. Future sessions depend on accurate docs.

## Monorepo Structure

```
walletchan/
├── apps/
│   ├── extension/             # Browser extension (Vite + React + Chakra UI)
│   ├── website/               # Landing page (Next.js + Chakra UI)
│   ├── indexer/               # Ponder indexer for coin launches
│   ├── staking-indexer/       # Ponder indexer for sBNKRW vault staking (legacy)
│   ├── wchan-vault-indexer/   # Ponder indexer for sWCHAN
│   ├── tg-bot/                # Token-gated Telegram bot (Grammy + Hono)
│   ├── arb-bot/               # WETH↔WCHAN/BNKRW cross-pool arbitrage bot (Base)
│   └── contracts/             # Solidity smart contracts (Foundry)
├── packages/
│   ├── shared/                # Shared design tokens, assets, contract constants
│   └── wchan-swap/            # Shared swap logic (quoting, encoding, permit2)
└── _docs/                     # LLM-facing documentation (start here)
```

Extension has 5 Vite build targets (main / onboarding / inpage / inject / background). Message flow: Dapp → inpage.js → inject.js → background.js → Bankr API. Full details in [`_docs/IMPLEMENTATION.md`](./_docs/IMPLEMENTATION.md).

Design system is token-driven with two themes (Bauhaus + Midnight). Components consume *intent* tokens (`accent.primary`, `surface.raised`, etc.) — never theme-color literals. See [`_docs/THEME.md`](./_docs/THEME.md).

## Documentation References

When working on features, refer to these docs.

| Doc | When to read |
| --- | --- |
| [`_docs/IMPLEMENTATION.md`](./_docs/IMPLEMENTATION.md) | Extension internals, message types, tx flow, file structure, session restoration |
| [`_docs/SECURITY.md`](./_docs/SECURITY.md) | Threat model, access control, pre-commit security checklist |
| [`_docs/STORAGE.md`](./_docs/STORAGE.md) | Every chrome.storage key, shape, version history, audit checklist |
| [`_docs/PUBLISHING.md`](./_docs/PUBLISHING.md) | Release workflow, CWS upload, auto-update, storage migrations |
| [`_docs/DEVELOPMENT.md`](./_docs/DEVELOPMENT.md) | Commands, build modes (dev vs prod), testing changes, browser targets |
| [`_docs/TX_CONFIRMATION.md`](./_docs/TX_CONFIRMATION.md) | Tx confirmation surfaces + gas-fee UX wiring (must audit all surfaces) |
| [`_docs/CHAT.md`](./_docs/CHAT.md) | Chat interface to Bankr API |
| [`_docs/STYLING.md`](./_docs/STYLING.md) | UI components, design tokens, Bauhaus system |
| [`_docs/THEME.md`](./_docs/THEME.md) | Theme engine handbook (architecture, authoring rules, adding a new theme) |
| [`_docs/THEMING_PRD.md`](./_docs/THEMING_PRD.md) | Theme engine PRD: ADR, design briefs, phased rollout history |
| [`_docs/WEBSITE.md`](./_docs/WEBSITE.md) | Website sections, subdomains, wagmi `force-dynamic` pattern, useSiteNav |
| [`_docs/APPS.md`](./_docs/APPS.md) | Apps page data source, fetch script, adding chains |
| [`_docs/SWAP.md`](./_docs/SWAP.md) | Swap page: 0x API integration, fees, slippage, UI |
| [`_docs/BRIDGE.md`](./_docs/BRIDGE.md) | Bridge: Bungee API, cross-chain quote/build/submit/status |
| [`_docs/COINS.md`](./_docs/COINS.md) | Coins page: SSE streaming, indexer API, pagination |
| [`_docs/CALLDATA.md`](./_docs/CALLDATA.md) | Calldata decoder UI, param components, type routing |
| [`_docs/CLEAR_SIGNING.md`](./_docs/CLEAR_SIGNING.md) | ERC-7730 clear-signing pipeline |
| [`_docs/ASSET_CHANGES_SIMULATION.md`](./_docs/ASSET_CHANGES_SIMULATION.md) | Tx simulation: state-override injection, metadata retry |
| [`_docs/ERC5792.md`](./_docs/ERC5792.md) | ERC-5792 batch txs: message flow, ERC-7821 encoding, 7702 plan |
| [`_docs/ERC5792-DAPP-SUPPORT.md`](./_docs/ERC5792-DAPP-SUPPORT.md) | Dapp-side wagmi upgrade guide for batched txs |
| [`_docs/L2_FORCE_INCLUSION.md`](./_docs/L2_FORCE_INCLUSION.md) | OP Stack force inclusion: L1 deposit flow |
| [`_docs/FIREFOX.md`](./_docs/FIREFOX.md) | Firefox port: pipeline, manifest divergence, storage.session shim, AMO release |
| [`_docs/PK_ACCOUNTS.md`](./_docs/PK_ACCOUNTS.md) | Private-key / Seed phrase account architecture & flows |
| [`_docs/ADD_CHAIN.md`](./_docs/ADD_CHAIN.md) | Adding a new chain (single registry entry) |
| [`_docs/INDEXER.md`](./_docs/INDEXER.md) | Ponder indexer conventions (filter.args perf rule) |
| [`_docs/RAILWAY.md`](./_docs/RAILWAY.md) | Railway deploy: Dockerfile + railway.toml pattern for pnpm monorepo |
| [`_docs/TOKEN_GATED_TG.md`](./_docs/TOKEN_GATED_TG.md) | Token-gated TG system: architecture, DB schema, security |
| [`apps/tg-bot/IMPLEMENTATION.md`](./apps/tg-bot/IMPLEMENTATION.md) | TG bot: verification flow, commands, API, balance checker |
| [`apps/arb-bot/IMPLEMENTATION.md`](./apps/arb-bot/IMPLEMENTATION.md) | Arb bot: cross-pool strategy, batched RPC, encoding |
| [`apps/wchan-vault-indexer/IMPLEMENTATION.md`](./apps/wchan-vault-indexer/IMPLEMENTATION.md) | WCHAN vault indexer: sWCHAN balance tracking, APY, snapshots |
| [`apps/staking-indexer/STAKING_INDEXER_IMPLEMENTATION.md`](./apps/staking-indexer/STAKING_INDEXER_IMPLEMENTATION.md) | Staking indexer (legacy) |
| `openclaw-skills/bankr/SKILL.md` | Bankr API interactions, workflows, error handling |
| [github.com/apoorvlathey/walletchan-skill](https://github.com/apoorvlathey/walletchan-skill) | Public agent skill for driving the extension via CDP (canonical source lives in that repo) |

## Important Patterns (extension)

- **API key encryption**: AES-256-GCM with PBKDF2 (600k iterations). Vault-key system layered on top — see [`_docs/STORAGE.md`](./_docs/STORAGE.md).
- **Session caching**: decrypted creds cached in background-worker memory with auto-lock timeout.
- **Per-tab chain state**: each tab maintains its own selected chain.
- **Transaction persistence**: pending txs survive popup close (`chrome.storage.local`).
- **EIP-6963** modern wallet discovery alongside legacy `window.ethereum`.
- **Shared contract constants**: `packages/shared/src/contracts.ts` is the single source of truth (`BASE_CHAIN_ID`, `BNKRW_TOKEN_ADDRESS`, `SBNKRW_VAULT_ADDRESS`, `BNKRW_POOL_ADDRESS`). Import via `@walletchan/shared/contracts`.
- **Address display**: any `0x` shown in the UI must include a CopyIcon/CheckIcon copy button AND an explorer link (`${chainConfig.explorer}/address/${addr}`). Reference: `TypedDataDisplay.tsx` `AddressValue`.
- **Copy button feedback**: NEVER use toasts for copy (they block nearby Reject/Confirm buttons). Toggle `CopyIcon` → `CheckIcon` (`accent.highlight`) for 2s. Use the shared `CopyButton` component when possible.
- **Token-driven theming**: consume intent tokens (`accent.*`, `surface.*`, `fg.*`, `border.*`, `status.*`, `chart.*`) — never hex literals or `bauhaus.red`. See [`_docs/THEME.md`](./_docs/THEME.md).
- **Reject All button color**: use `chart.negative` (not `status.error.fg` — that's WHITE in Bauhaus and renders invisibly).
- **Dark CTA strip**: use `useStripTokens()` from `@/theme` for inverted bars (tx count badges, chat headers, "Add Token" CTAs). Don't inline `themeId === "midnight" ? ... : ...` ternaries.
- **External lookups go through a single cached helper** (e.g., `getEthShLabels`, `fetchTokenInfo`, `getCachedTokenLogo`) — never let multiple surfaces fire their own request for the same resource.

## Writing Conventions

- **Use "onchain", not "on-chain".** Project-wide spelling — user-facing strings, comments, doc files, identifiers. Same for derived forms ("onchain balance", "confirmed onchain"). Don't reintroduce the hyphenated form.

## Code Quality Rules

- **Keep files under ~400 lines.** Split into focused modules by responsibility.
- **One concern per file.** E.g., `sessionCache.ts` owns credential caching; `authHandlers.ts` owns unlock/password.
- **`background.ts` is a message router only.** It registers Chrome listeners and delegates to `*Handlers.ts`. Never add business logic to it.
- **Search before you build.** Before writing any new component, hook, utility, storage helper, or handler, grep the codebase. If something does ~80% of what you need, extend it (add an optional override callback) instead of forking it. Primitives that already exist: `CopyButton`, `useCachedAvatarSrc`, `useCachedAvatarMap`, `ERC20ApproveDisplay`, `TokenAmount`, `AddressValue`, `useThemedToast`, `useStripTokens`, `getEthShLabels`, `fetchTokenInfo`, `getCachedTokenLogo`.
- **Extract shared utilities** when the same logic appears in 2+ files (see `cryptoUtils.ts`).
- **Use dependency injection** to avoid circular imports (e.g., `tryRestoreSession(unlockFn)` takes a callback).
- **Naming**: `*Handlers.ts` for handlers; `*Storage.ts` / `*Cache.ts` for state; `*Utils.ts` for utilities. Functions sharing state belong in the same module.
- **New message handlers**: add to the appropriate `*Handlers.ts` and add a 1-3 line case to the `background.ts` switch. Update [`_docs/IMPLEMENTATION.md`](./_docs/IMPLEMENTATION.md) if you add new modules.

## Foundry libraries

Always install via git submodules: `cd apps/contracts && forge install <org>/<repo>` — do NOT use `--no-git`.
