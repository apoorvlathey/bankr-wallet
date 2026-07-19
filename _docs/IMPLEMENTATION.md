# WalletChan Transaction Handling Implementation

## Overview

WalletChan is a browser extension that supports five account types:

1. **Bankr API Accounts** - AI-powered wallets that execute transactions through the Bankr API
2. **Private Key Accounts** - Standard wallets with local key storage for transaction signing
3. **Seed Phrase Accounts** - BIP39/BIP44 groups whose derived keys sign locally
4. **Ledger Accounts** - Hardware-backed accounts that sign on a connected Ledger in Chromium
5. **Impersonator Accounts** - View-only addresses that cannot sign or send

This document describes the core architecture and transaction handling implementation.

**Related Documentation:**

- [SECURITY.md](./SECURITY.md) - Security audit guide, threat model, and pre-commit checklists
- [SECURITY_ARCHITECTURE.md](./SECURITY_ARCHITECTURE.md) - Audit map, critical module boundaries, and safe refactor sequence
- [PK_ACCOUNTS.md](./PK_ACCOUNTS.md) - Private key accounts implementation (security, signing, storage)
- [LEDGER.md](./LEDGER.md) - Ledger WebHID/offscreen architecture, storage, signing, and support boundaries
- [CHAT.md](./CHAT.md) - Chat feature implementation (AI conversations with Bankr agent)
- [CALLDATA.md](./CALLDATA.md) - Calldata decoder UI (rich param components, type routing, unit conversion)
- [STYLING.md](./STYLING.md) - Token vocabulary, theme authoring rules, design system
- [THEMING_PRD.md](./THEMING_PRD.md) - Theme engine architecture, token contract, phased rollout history

## Theme Engine

As of v3.2.0 the extension ships a token-driven theme engine. Current themes:
**Bauhaus** (light, geometric, primary colors, hard shadows), **Midnight**
(dark, neutral financial surfaces, blue action focus, quiet elevation). Users select a theme
from Settings → Appearance; the choice persists in
`chrome.storage.local` and does NOT sync across devices.

**Architecture:**

```
apps/extension/src/theme/
├── tokens.ts                # ThemeTokens interface — every theme satisfies this contract
├── createTheme.ts           # Orchestrator: tokens → Chakra extendTheme config
├── recipes/                 # Internal Chakra recipes: actions, fields, selection,
│                            #   content, feedback, and overlays
├── ThemeProvider.tsx        # React context + ChakraProvider wrapper, switches at runtime
├── useThemeSelection.ts     # chrome.storage.local read/write; missing selection falls back to Bauhaus
├── useStripTokens.ts        # Shared dark CTA strip color pair (used in 8+ places)
├── bootstrap.ts             # Pre-React paint sync to avoid theme flash
├── themes/
│   ├── bauhaus.ts           # Light geometric fallback for existing installs with no stored selection
│   └── midnight.ts          # Default dark theme for fresh installs
└── primitives/              # Theme-aware atoms (ThemedCard, ThemedField, IconBox, …)
```

**Pre-paint flow:** `index.tsx` and `onboarding.tsx` call `bootstrapThemeAttribute()`
synchronously before React renders, which reads a localStorage mirror of the
canonical `chrome.storage.local` selection and sets `<html data-theme=...>`.
The CSS in `index.css` / `onboarding.css` uses theme-attribute selectors so
the very first paint matches the user's choice — no flash of the wrong theme.
Fresh installs initialize `selectedThemeId` to Midnight from the service
worker/onboarding path. Existing installs that predate the setting and still
lack `selectedThemeId` fall back to Bauhaus so updates do not auto-change their
appearance.

**Component contract:** Components must consume **intent tokens** —
`accent.primary`, `surface.raised`, `chart.numeric`, etc. — never theme-color
literals or names like `bauhaus.red`. The factory translates tokens to a
Chakra theme per the active `ThemeTokens` shape. To add a new theme, drop a
file in `themes/` satisfying the contract and register it in `ThemeProvider.tsx`.
Zero component edits.

For dark-theme-specific behavior, use `isDarkThemeId(themeId)` or
`tokens.colorMode === "dark"` instead of comparing directly to `"midnight"`.
This keeps future dark variants on the same contrast/ornament rules.

### Mobile screen layer

`apps/extension/src/components/ui/` is the public, domain-free mobile
application layer. It contains the screen/header/body/sticky-action shell,
separator-based list slots, empty/loading states, a full-screen picker, and a
bottom action sheet. These components accept renderable content and callbacks;
they never own wallet, transaction, message, storage, or signing state.

`components/ScreenTransition.tsx` remains the production screen-stack owner.
Hierarchy transitions move horizontally, root/auth replacement fades, covered
layers are inert, and the shared `data-screen-scroll-owner` /
`data-screen-heading` hooks support scroll and focus restoration. See
`_docs/STYLING.md` for component anatomy and `_docs/IMPROVE_UI.md` for the
frozen Phase 2 contract.

## Extension Preview Harness

The extension includes a Vite preview harness for fast theme iteration without
loading the browser extension:

```bash
pnpm dev:extension-preview
```

Open `http://localhost:4317/preview/all` to compare the key popup screens in
fixed popup/sidepanel frames. Each frame is an isolated iframe document, so
viewport units, Chakra breakpoints, portals, focus, body mode classes, and
scroll ownership use the real target dimensions rather than the outer gallery
viewport.

The harness lives in `apps/extension/src/preview/` and mounts production
controllers/components against deterministic URL-selected fixtures. Home uses
the production `App`; Settings and Portfolio use their production roots;
transaction detail, Swap/Bridge, standalone Swap picker, and confirmation
screens use their production components. A fail-closed Chrome and network
adapter supplies public fixture state, blocks real Bankr/RPC/API calls,
and reports unknown read dependencies instead of silently returning success.
Preview state is reproducible with `theme`, `frame`, `scenario`, and `wallet`
query parameters. See `_docs/EXTENSION_PREVIEW.md` for the workflow and rules
for adding preview screens.

The composed `/preview/mobile-primitives` route exercises the shared mobile
interaction grammar before individual production destinations adopt it. It is
not a synthetic replacement for any product screen.

See `_docs/STYLING.md` for the full token vocabulary and authoring rules.
See `_docs/THEMING_PRD.md` for the engine architecture and phased rollout history.

## Interaction Sounds

The renderer uses `cuelume` plus one WalletChan-owned Web Audio voice for a
deliberately small set of synthesized cues. Feature components never import
the package or custom synthesizer directly. They call
`playInteractionSound()` with a product-level cue from
`src/sounds/soundManager.ts`, which owns the cue-to-recipe mapping and applies
the global preference before playback.

`chrome.storage.local.soundsEnabled` is the canonical preference. Missing or
invalid values default to enabled, so this additive key needs no migration.
The manager listens to `chrome.storage.onChanged`, keeping popup, sidepanel, and
full-page extension views aligned. `useSoundsEnabled()` exposes the same state
to Settings → Sounds. Cuelume failures or browser autoplay restrictions remain
silent no-ops; sound never gates authentication or any other wallet behavior.

Current semantic cues:

| Cue | Cuelume recipe | Trigger |
| --- | --- | --- |
| `unlockSuccess` | `sparkle` | Successful password or biometric unlock |
| `transactionConfirm` | `sparkle` | User presses Confirm on a single, batch, or split transaction |
| `requestReceived` | `chime` | A dapp connection, transaction, signature, permission, asset-watch, or chain-add request reaches the renderer |
| `actionSheetTransition` | `bloom` | A bottom action sheet or connected-site chain drawer opens or closes |
| `chartValueChange` | Custom value pulse | Portfolio-chart NumberFlow value changes |
| `sliderValueChange` | Short custom tick | Send/Swap slider moves through non-snap values |
| `sliderSnap` | `release` | Send/Swap slider enters a different 0/25/50/75/100 snap stop |
| `portfolioTokenHover` | Custom value click | Fine-pointer entry into a portfolio token row; rate-limited |
| `quickActionHover` | `press` | Fine-pointer entry into Send, Swap, Shield, or More; rate-limited |

The manager owns per-cue cooldowns and fine-pointer eligibility as well as the
recipe mapping. A newly opened renderer plays `requestReceived` when it
bootstraps with pending dapp work; an already-open renderer plays it from the
corresponding `newPending*` runtime message.

`customValueSound.ts` synthesizes the value sounds as a 520Hz sine routed
through a 1500Hz low-pass filter. The chart retains its 5ms attack and 45ms
decay; the slider uses a quieter 3ms attack and 18ms decay so adjacent movement
ticks stay discrete. Both semantic cues can evolve independently. The chart cue
is capped at one pulse per 26ms and plays only when the visible NumberFlow value
changes, not on every raw pointer event.

`useSliderValueSound()` normalizes raw slider input before state updates or
playback. Values within three percentage points of 0/25/50/75/100 collapse to
the same snap value, and repeated events for that normalized value return early
without rewriting the amount or replaying audio. Entering a different snap
stop plays Cuelume `release` once. Actual non-snap value changes play the short
`sliderValueChange` tick, capped at one per 26ms. The hook uses
Chakra's `onChangeStart`/`onChangeEnd` lifecycle rather than inferred pointer
state, so mouse, touch, and keyboard input follow the same rules. Its initial
0% value is seeded as the resting snap point, preventing Chakra's first value
callback from playing `release` before the user has actually moved the slider.

The same synthesizer exposes a portfolio-token value-click variant: the same
520Hz sine and 1500Hz low-pass with a 2ms attack, 12ms decay, and 0.02 peak
gain. It retains the token-hover cue's fine-pointer gating and 140ms cooldown.

New cues should be added to the central mapping only after confirming they fit
the restraint rules in `_docs/WARM_MIDNIGHT.md`.

## Account Types

### Send entry selection

- The homepage Send quick action opens with Ethereum mainnet (`chainId: 1`)
  and its native ETH token, independent of the homepage's current chain state.
- Sending from an Assets row preserves that row's exact token and chain.
- The initial native placeholder is refreshed from the shared portfolio token
  catalog after load so current balance, price, and metadata replace its
  zero-value bootstrap fields without changing the selected asset identity.
- For native assets, Send's MAX action and 100% slider reserve gas before
  filling the input. The renderer reuses the trusted-wallet gas estimator,
  prices its already-buffered gas limit at the highest available fee tier,
  adds 10% fee headroom, and subtracts the result with bigint precision. The
  estimate refreshes for the resolved recipient or calldata; ERC-20 MAX remains
  the full token balance.

The extension supports five distinct account types that can be used simultaneously:

| Feature               | Bankr API Account          | Private Key Account                 | Seed Phrase Account                   | Ledger Account                         | Impersonator Account    |
| --------------------- | -------------------------- | ----------------------------------- | ------------------------------------- | -------------------------------------- | ----------------------- |
| Transaction Execution | Via Bankr API              | Local signing + RPC broadcast       | Local signing + RPC broadcast         | Device signing + RPC broadcast         | ❌ Disabled (view-only) |
| Message Signing       | ✅ Via API (`/wallet/sign`) | ✅ Full support                     | ✅ Full support                       | ✅ Personal sign + EIP-712             | ❌ Disabled (view-only) |
| Key Storage           | API key encrypted locally  | Private key encrypted locally       | Mnemonic + derived keys encrypted     | Keys remain on device; public metadata only | No secrets stored       |
| Setup                 | API key + wallet address   | Private key import or generate      | 12-word BIP39 import or generate      | Chrome WebHID pairing + address scan   | Address only            |
| Use Case              | AI-powered transactions    | Agent wallets, bots, standard usage | HD wallets, multiple derived accounts | Hardware-backed daily signing          | Viewing portfolio/dApps |

### Ledger Architecture

- **Browser boundary:** Ledger setup and signing require Chromium with WebHID
  and `chrome.offscreen` (Chrome 124+). Firefox keeps all non-Ledger wallet
  behavior but does not advertise Ledger setup.
- **Setup surface:** selecting Ledger from a popup or side panel opens the
  dedicated `index.html?route=add-ledger` full-tab route. A side-panel launcher
  closes through the shared side-panel control after the tab opens. The route
  persists across unlock and takes priority over normal pending-request startup
  routing.
- **First-account onboarding:** Chromium onboarding already runs in a full
  extension tab, so Ledger appears after View-only in the initial account list.
  The shared Ledger flow pairs and scans there, retains only selected public
  device/path metadata in renderer state, then defers `addLedgerAccounts` until
  the master credential has been initialized inside the rollback-safe
  onboarding transaction. Unsupported browsers do not advertise the option.
- **Permission gesture:** the full-tab `components/Ledger/AddLedgerFlow.tsx`
  calls `navigator.hid.requestDevice()` only from the Connect button's user
  gesture. Popup and side-panel contexts never request WebHID permission.
- **Transport isolation:** `chrome/ledger/offscreenBridge.ts` lazily creates
  `offscreen.html`; `src/offscreen/ledgerSigner.ts` owns the Ledger SDK and
  WebHID session. Its message listener authorizes the exact extension ID and
  service-worker script URL before dispatch, rejecting UI/content-script and
  URL-lookalike senders. The document closes after 30 seconds idle.
- **Device binding:** the stable device identity is the lowercase address at
  `m/44'/60'/0'/0/0`. Every scan/sign session re-derives and checks it before
  using the connected device.
- **Persistence:** Ledger accounts extend public `accounts` metadata with
  `deviceId`, `hdPath`, and `hdIndex`. `ledgerDevices` stores only public label,
  model, and creation metadata; no hardware secret enters extension storage.
  Account/device persistence is the import commit boundary; active-account
  selection is best-effort after commit and cannot turn a successful import
  into a false failure.
- **Authority:** adding Ledger accounts requires a live master session. Signing
  works under master or agent sessions and retains the normal pinned-account,
  origin/WalletConnect, reset lease, signer-recovery, history, and receipt gates.
- **Hardware-wait boundary:** transaction and signature rows remain pending
  while the Ledger device is waiting for approval, so the request review stays
  mounted. The UI shows a Ledger action banner with the branded black logo tile
  and dark trailing spinner, changes the primary action to a dark three-dot `Waiting`
  state, and keeps the broadcast-only submitting banner hidden. Approval, gas,
  queue, rejection, and warning-override controls are locked, while Back remains
  available and only navigates away from the still-active request. The background
  first-action claim independently rejects competing edits or terminal actions.
  A transaction moves into processing history only
  after the recovered hardware signature reaches the final pre-broadcast
  callback; a message request is removed only after final authorization passes.
  Safe device/preparation failures therefore leave the request available for a
  deliberate retry instead of creating a failed Activity row.
- **Initial exclusions:** Ledger fails closed for ERC-5792/cross-dapp batches,
  EIP-7702/ERC-7715 authority, force inclusion, sponsored transfers, and the
  direct in-extension swap shortcut. A dapp swap that submits one normal
  transaction uses the supported single-transaction path.

Wallet-UI messages `ledgerConnect`, `ledgerScan`, `ledgerCancel`,
`addLedgerAccounts`, and `getLedgerDevices` are handled by
`background/ledgerRouter.ts`. A pinned Ledger transaction confirms through
`confirmTransactionAsyncLedger`; Ledger signatures branch inside the existing
trusted `confirmSignatureRequest` route.

### Seed Phrase Architecture

- **BIP39**: 12-word mnemonics (128-bit entropy) using `@scure/bip39`
- **BIP44**: Derivation path `m/44'/60'/0'/0/{index}` using `@scure/bip32`
- **Seed Groups**: Each mnemonic creates a "group" that can derive multiple accounts. Groups have user-editable names (default "Seed #N").
- **Storage**: Mnemonics are encrypted separately in `mnemonicVault`. V2 uses a dedicated random mnemonic key (not the general/agent vault key), with a master-password wrapper in the vault and an independent V2 passkey wrapper. Each phrase ciphertext is bound to its key/group ID with AES-GCM AAD. V1 master-password-encrypted entries remain readable and are converted to V2 only during an atomic successful passkey setup; password-only users are not rewritten on unlock. V1 passkey records existed only in unreleased/local development builds. They remain readable to avoid stranding developer profiles, but all new local-account setup is intentionally upgrade-gated until biometric unlock is re-enabled as V2. Derived private keys remain in `pkVault` for routine signing.
- **Byte conversion**: Uses native `bytesToHex()` from `cryptoUtils.ts` instead of Node.js `Buffer` (not available in browser service worker)
- **Files**: the stable `mnemonicStorage.ts` encrypted-vault facade over the `mnemonic/` audit domain: `derivation.ts` (BIP39/44), `record.ts` / `crypto.ts` / `repository.ts` / `operations.ts` / `recovery.ts` (encrypted storage and recovery), `masterAccess.ts` (master-only call-stack capability), `integrity.ts` (master-wrapper/account proof), `addressPreview.ts` (secret-free public address derivation), `accountPersistence.ts` (shared collision, compensation, and cache-refresh boundary), and `accountHandlers.ts` (add/derive orchestration). UI entry points remain `SeedPhraseSetup.tsx` and `RevealSeedPhraseModal.tsx`.
- **Display**: Account dropdown shows seed group name + derivation index (e.g., "Seed #1 · #0"). Account settings shows derivation index in type label.
- **Generated phrase setup order**: Settings → Add Account generates and shows
  the recovery phrase first. After the user acknowledges saving it, a separate
  optional naming step labels the seed group and its first derived account.
  The mnemonic remains only in renderer memory until that final step submits
  `addSeedPhraseGroup`; backing out before submission persists nothing. The
  generated phrase starts concealed, and an amber backup checkbox in the
  sticky action region must be checked before Continue advances to naming.
- **Address picker (shared)**: `components/SeedAddressPicker.tsx` is the single picker UI used by both flows: (1) new-import in `SeedPhraseSetup`, and (2) "Derive Addresses" on an existing seed group in `AddAccount`. Each row renders avatar (ENS or blockie), ENS name, BIP44 index, truncated address, portfolio USD total (`fetchPortfolio`, aborted on unmount), a copy button, and an Etherscan-mainnet link. Selected new addresses use the amber commitment checkbox treatment, and the import/derive submit action uses `brand`. The picker calls the background `previewSeedAddresses` handler, which accepts EITHER a raw `mnemonic` (import flow, no auth) OR a `seedGroupId` (existing-group flow, decrypts the stored mnemonic — requires an unlocked master session, including biometric). Paginates 5 at a time. Existing-group mode initial-fetches `0..maxExistingIndex + 5` so users see their already-added real accounts in context (locked as "added"). `addSeedPhraseGroup` and `deriveSeedAccount` both accept `indices: number[]` — bankr/seed collisions are silently skipped, PK collisions still convert in place, and view-only impersonators are ignored so they can coexist with imported seed accounts. `addSeedPhraseGroup` prevalidates that at least one selected index can be imported or converted before creating a seed group or writing `mnemonicVault`; duplicate-only imports fail without persisting seed material. Generate flow is unchanged (always derives index 0; nothing to discover on a fresh mnemonic).

#### PK → Seed Phrase Account Conversion

When importing a seed phrase whose derived address matches an existing private key account, the extension converts the PK account to a seed phrase account **in-place** rather than creating a duplicate or throwing an error:

1. Derive private key + address at index N as usual
2. Check if the address already exists in non-impersonator accounts
3. If it matches a `privateKey` account → call `convertToSeedPhraseAccount()` to update type, add seedGroupId/derivationIndex, preserve same account ID, display name, and vault entry. Skip `addKeyToVault` (key already in vault under same ID).
4. If it matches a `bankr` or `seedPhrase` account → skip/error as a duplicate; if it matches only a view-only `impersonator`, import the seed account alongside it
5. This applies to both `addSeedPhraseGroup` (index 0) and `deriveSeedAccount` (index N) handlers

### Account Selection

- Users can configure supported account types during onboarding and add Ledger
  or view-only accounts later from Account Settings
- When both accounts are set up, the first account added becomes the default active account
- Only tabs whose current origin has an approved dapp connection (or an active
  connection prompt) maintain an account selection in `tabAccounts`. Their
  first scoped lookup snapshots the current global account so later global
  changes cannot redirect that dapp.
- Tabs without a connected dapp always resolve and update the shared global
  account. Activating or navigating an ordinary tab clears any stale per-tab
  override; rejecting/disconnecting a dapp does the same. Activating a connected
  dapp tab promotes its scoped account to the shared global fallback, so the
  next ordinary tab follows the most recently active connected account without
  retaining an account of its own.
- The popup/sidepanel resolves the account for the currently active browser tab,
  including when rendered from a detached extension popup.
- Provider initialization, `eth_accounts`, connection approval, transaction and
  signature intake, ERC-5792 capabilities/batches, and ERC-7715 all resolve the
  sender tab's account. Pending signing requests remain pinned to that account.
- Account switching emits `accountsChanged` only in that tab and only when its
  top-level origin has a dapp permission grant. Closing a tab removes its map.
- Removing an account first revokes every exact-origin dapp grant for currently
  connected tabs mapped to that account. Revocation emits `accountsChanged([])`
  before account metadata is deleted; the tab is never silently remapped to the
  wallet's unrelated global fallback account. Because grants are origin-wide,
  every open tab for an affected exact origin is disconnected together. A
  pending connection prompt whose tab selected the removed account is cancelled
  with `4100`; connection approval and removal share one account-binding lock,
  so a queued approval cannot grant the fallback account after deletion.

### Address Synchronization

The extension maintains address consistency between storage and the active account:

1. **On Onboarding**: When both account types are configured, the first account's address (PK account) is saved to `chrome.storage.sync.address` since it becomes the active account.

2. **On Account Switch**: The extension asks the background worker to select
   the account for the active browser tab. `accounts/tabResolver.ts` stores a
   `tabAccounts` override only when that tab has a connected/pending dapp;
   otherwise it clears any stale override and updates the shared
   `activeAccountId` / `address` / `displayAddress`. A connected-tab selection
   also refreshes those global fallback fields while preserving every other
   connected tab's override. The UI sends `setAccount` only to the selected tab.
   Global address writes are never broadcast to every tab.

3. **On Bankr API Key & Address Change**: The Account Settings form calls
   `saveBankrApiKeyAndAddress`, which saves the new API key and updates the
   Bankr account's `accounts[].address` entry. If that account is active, the
   background worker also syncs `chrome.storage.sync.address/displayAddress`
   and broadcasts `accountsUpdated`.

4. **On Content Script Init**: `inject.ts` asks the background for the
   sender-bound tab account before announcing the provider. The global synced
   address is used only as a legacy fallback if no account metadata is available.

5. **On Address Change**: The inject.ts `setAddress` handler updates the provider's private address state for every tab, but emits `accountsChanged` only when the exact top-level site origin has a stored `dappPermissions` grant.

### Injected dapp connection permissions

- `eth_accounts` is a non-interactive privacy check. It returns `[]` until the exact trusted page origin has been approved.
- The first `eth_requestAccounts` call crosses `impersonator.ts` → `inject.ts` → `background.ts`, synchronously opens the side panel from the original page gesture when sidepanel mode is enabled, persists a durable `pendingDappConnectionRequests` record, and opens the extension connection-confirmation screen. A window-bound request-family hint makes a cold renderer wait for that queue so persistence cannot race panel startup. The prompt has no age-based timeout. Non-interactive `eth_accounts` reads and already-connected account requests never trigger the early open.
- Background derives the canonical `http(s)` origin, tab, and frame from `chrome.runtime.MessageSender`; page-provided origin values are never authorization inputs. Cross-origin/subframe requests currently fail closed and must connect from the top-level site.
- Approval stores an origin-only `dappPermissions` grant and resolves the request through `dappConnectionResult:{id}`. Future visits reuse the grant without prompting and receive the account currently selected for that tab/fallback active account.
- A pending connection request sets the Chrome action badge to `1` only when
  there are no pending transaction, signature, batch, ERC-7715 permission, or
  cross-dapp batch approvals. Connection requests never increment or replace
  the existing approval count; approving, rejecting, or explicitly
  invalidating the request
  refreshes the badge.
- Account switches remain visible to an approved origin through `accountsChanged`; unapproved origins receive no account-change event. Revocation sends `accountsChanged([])` to matching open tabs.
- Account removal uses the same exact-origin revocation path before deleting a
  mapped account, so it disconnects affected sites instead of exposing the next
  global account as an implicit replacement.
- Injected `eth_sendTransaction` and signature intake re-check the exact
  browser-attested, top-level sender origin against `dappPermissions` before a
  pending request is created. Page-provided `origin` fields are display-only;
  unconnected, subframe, and navigation-race requests fail with EIP-1193 code
  `4100` through the normal storage result channel.
- Site title and favicon are bounded, display-only metadata. The canonical hostname is always the primary identity in confirmation and management UI.
- Connection prompts opened from an exact `*.eth.limo` / `*.eth.link` origin
  always show a non-blocking contenthash provenance pill. Configured
  local/custom IPFS gateways show it while WalletChan Browser is enabled and
  the gateway maps back to a cached `.eth` IPFS/IPNS resolution.
  Trusted wallet UI calls `getEnsContenthashLastUpdated`; the service worker
  queries the ENS subgraph for the current resolver's newest
  `ContenthashChanged` block and resolves that block timestamp through the
  bounded Ethereum RPC client. The pill mounts immediately with `Checking…`,
  then shows the elapsed time or a quiet `Unavailable` state; network failure
  never delays connection approval. The background build accepts the
  public `VITE_THE_GRAPH_API_KEY` / `NEXT_PUBLIC_THE_GRAPH_API_KEY` used by
  swiss-knife and compiles it only into the service-worker bundle; without a
  configured key it falls back to the legacy public ENS subgraph endpoint.
- Request surfaces share the same origin presentation formatter. When
  WalletChan Browser is disabled, hosted and local gateway origins are not
  rewritten through the ENS resolution cache: connection, transaction,
  signature, batch, permission, watch-asset, pending-request, and activity
  identities show the literal requesting hostname. Hosted/local gateway marks
  use Chrome's processed favicon endpoint for that exact page URL, so display
  does not depend on a configured or running local IPFS gateway. Public
  `.eth.limo` / `.eth.link` origins retain their underlying ENS name only for
  contenthash provenance lookup even while their displayed identity is literal.
- Pending prompt storage is globally and per-origin bounded before mutation.
  Connection prompts allow one outstanding request per exact origin; add-chain
  and watch-asset prompts allow five per exact origin (with twenty globally).
  Existing transaction/signature/batch queues retain their stricter family
  limits. Capacity errors are returned durably to the waiting provider rather
  than silently dropping or replacing another origin's request.

### Transaction Routing

When a dApp initiates a transaction:

1. Extension checks the active account type for that tab
2. **Bankr Account**: Transaction submitted to Bankr API → API executes → returns tx hash
3. **PK Account**: Transaction signed locally with viem → broadcast to RPC → returns tx hash

For detailed implementation of private key accounts, see [PK_ACCOUNTS.md](./PK_ACCOUNTS.md).

## Architecture

### Source organization contract

Extension background logic is organized by audit domain, not by a flat prefix
convention. `apps/extension/src/chrome/README.md` is the root map. The
`src/chrome/` root is reserved for build entrypoints, documented compatibility
facades, and truly shared primitives; implementations belong in named folders
with a local `README.md` that records responsibilities, dependency direction,
effects, facade, and matching tests.

Implementation files stay below roughly 400 lines. Transitional composition
roots have enforced ratcheting budgets and may not grow while being decomposed.
A facade may preserve imports and exact export identities, but it owns no
authorization, cryptography, persistence, networking, or business policy.
Dependencies flow from entry router → domain coordinator → policy/repository or
pure transformation, never back toward the router.

Tests mirror the source domains under `apps/extension/tests/`; the test root is
kept empty, and every test domain has an audit-map README. Architecture tests
freeze facade identity, forbidden dependency direction, and size ceilings so a
later feature cannot silently collapse the domains back into a large file.

For any behavior-neutral move, storage keys, serialized records, message names,
public exports, and irreversible-effect ordering remain unchanged. A storage or
message-contract change is a separate migration/feature and follows the storage
and security checklists.

### Renderer source organization contract

The React renderer follows the parallel feature-domain contract in
[`EXTENSION_UI_ARCHITECTURE.md`](./EXTENSION_UI_ARCHITECTURE.md) and
`apps/extension/src/components/README.md`. `App.tsx` and page roots compose;
feature implementations live in named component folders with audit maps;
feature-only hooks and pure models stay colocated; `components/ui/` remains
domain-free. Existing flat imports may survive as re-export-only facades while
their implementations move incrementally.

New renderer implementation files stay below roughly 400 lines. Current
oversized screen roots have exact ratcheting budgets in
`tests/ui/moduleSizeBudget.test.ts` and may not grow. UI moves preserve props,
exports, lazy boundaries, request ordering, message/effect ordering,
popup-versus-sidepanel lifecycles, and Bankr/private-key/seed-phrase behavior.
Pure renderer models are covered with Node tests; visual behavior remains in
the production-backed preview and packaged extension QA.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                  Dapp                                        │
│                         (e.g., app.aave.com)                                │
│                                                                             │
│  Provider Discovery:                                                        │
│    - EIP-6963: Listen for eip6963:announceProvider events (modern)          │
│    - Legacy: Access window.ethereum directly                                │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼ eth_sendTransaction / RPC calls
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Inpage Script (inpage.js)                           │
│                         ImpersonatorProvider class                          │
│                         - Announces via EIP-6963 events                     │
│                         - Sets window.ethereum (legacy)                     │
│                         - Intercepts wallet methods                         │
│                         - Proxies RPC calls via postMessage                 │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼ postMessage (i_sendTransaction, i_rpcRequest)
┌─────────────────────────────────────────────────────────────────────────────┐
│                        Content Script (inject.js)                           │
│                        - Bridges inpage ↔ background                        │
│                        - Forwards messages via chrome.runtime               │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼ chrome.runtime.sendMessage
┌─────────────────────────────────────────────────────────────────────────────┐
│                     Background Service Worker (background.js)               │
│                     - Message router + Chrome event listeners               │
│                     - Delegates through background composition into         │
│                       focused account/auth/tx/windowing domains             │
│                     - Makes Bankr API calls, proxies RPC calls              │
│                     - Manages encrypted credential cache                    │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┴───────────────┐
                    ▼                               ▼
┌──────────────────────────────┐    ┌──────────────────────────────┐
│    Extension Popup           │    │       Bankr API              │
│    (index.html)              │    │  api.bankr.bot               │
│    - Unlock screen           │    │  - POST /wallet/submit       │
│    - Pending tx banner       │    │  - POST /wallet/sign         │
│    - In-popup tx confirm     │    │  - POST /agent/prompt (chat) │
│    - Settings management     │    │  - GET /agent/job/{id} (chat)│
└──────────────────────────────┘    └──────────────────────────────┘
```

Security-critical service-worker code follows the dependency and testing
contract in [`SECURITY_ARCHITECTURE.md`](./SECURITY_ARCHITECTURE.md). In
particular, message transport, authorization, domain orchestration, validated
storage, and cryptography are separate layers. Compatibility facades preserve
existing imports while large modules are decomposed incrementally; they must
not introduce new policy or persistence behavior.

## Supported Chains

The following chains are supported for transaction signing (listed in dropdown order):

| Chain | Chain ID | Default RPC | Bankr API | PK/Seed/Impersonator | OP Stack |
| --- | ---: | --- | :---: | :---: | :---: |
| Ethereum | 1 | https://eth.drpc.org | ✅ | ✅ | |
| Abstract | 2741 | https://api.mainnet.abs.xyz | | ✅ | |
| Arbitrum | 42161 | https://arb1.arbitrum.io/rpc | ✅ | ✅ | |
| Avalanche | 43114 | https://api.avax.network/ext/bc/C/rpc | | ✅ | |
| Base | 8453 | https://base.drpc.org | ✅ | ✅ | ✅ |
| Berachain | 80094 | https://rpc.berachain.com | | ✅ | |
| Blast | 81457 | https://rpc.blast.io | | ✅ | ✅ |
| BNB Chain | 56 | https://bsc-dataseed.binance.org | ✅ | ✅ | |
| HyperEVM | 999 | https://rpc.hyperliquid.xyz/evm | | ✅ | |
| Ink | 57073 | https://rpc-gel.inkonchain.com | | ✅ | ✅ |
| Linea | 59144 | https://rpc.linea.build | | ✅ | |
| Mantle | 5000 | https://rpc.mantle.xyz | | ✅ | ✅ |
| MegaETH | 4326 | https://mainnet.megaeth.com/rpc | | ✅ | ✅ |
| Mode | 34443 | https://mainnet.mode.network | | ✅ | ✅ |
| Monad | 143 | https://rpc.monad.xyz | | ✅ | |
| Optimism | 10 | https://mainnet.optimism.io | | ✅ | ✅ |
| Plasma | 9745 | https://rpc.plasma.to | | ✅ | |
| Polygon | 137 | https://polygon.drpc.org | ✅ | ✅ | |
| Robinhood Chain | 4663 | https://rpc.mainnet.chain.robinhood.com | ✅ | ✅ | |
| Scroll | 534352 | https://rpc.scroll.io | | ✅ | |
| Sonic | 146 | https://rpc.soniclabs.com | | ✅ | |
| Tempo | 4217 | https://rpc.presto.tempo.xyz | | ✅ | |
| Unichain | 130 | https://mainnet.unichain.org | ✅ | ✅ | ✅ |
| World Chain | 480 | https://worldchain-mainnet.g.alchemy.com/public | | ✅ | ✅ |
| ZKsync Era | 324 | https://mainnet.era.zksync.io | | ✅ | |

These are configured in `src/constants/chainRegistry.ts` (the single source of truth for built-in chain data) and normalized into `networksInfo` by the service-worker bootstrap if storage is missing.

### Runtime Chain Resolution

Built-in chain metadata and user-customized chain state are intentionally split:

- `src/constants/chainRegistry.ts` defines the canonical built-in chains and all derived static maps. Each entry also owns an ID-only `testnetChainIds` array; custom-added networks matching one of those IDs reuse the mainnet entry's local icon/colors while retaining the testnet overlay, without bundling duplicate testnet RPC/explorer/currency metadata.
- `chrome.storage.sync.networksInfo` stores runtime overrides only: the active `rpcUrl`, hidden flags, and user-added custom chains. Every runtime RPC consumer continues to resolve only `rpcUrl`. Built-in-chain RPC selection/add/edit/remove actions autosave through the validated `updateNetwork` route, while custom-chain name, chain ID, endpoint, explorer, and currency changes remain staged until Save changes. Changing a custom chain ID re-keys its `networkRpcUrls` history in the service-worker mutation so saved endpoints remain attached to that network.
- `chrome.storage.local.networkRpcUrls` stores the optional Settings-only endpoint history as a decimal-chain-ID keyed record of `{ url, name? }` objects. Each list is deduplicated by URL and limited to ten endpoints; names are display-only and bounded to 64 characters. The repository still decodes the released `string[]` shape, so metadata is upgraded lazily on the next successful save. Keeping this auxiliary data local avoids expanding the quota-constrained synced `networksInfo` item.
- `src/lib/chains.ts` is the required merge layer for runtime code. It normalizes `networksInfo`, keeps built-in chains keyed by their registry name, and exposes helpers like `getVisibleChains`, `getResolvedChainById`, and `getStoredRpcUrl`
- `src/chrome/network/networkRepository.ts` alone reads and writes `networksInfo`/`chainName`; `rpcHistoryRepository.ts` owns `networkRpcUrls`; and `networkMutations.ts` owns locked service-worker mutations and composes pure `customNetworkValidation.ts` and `networkPolicy.ts`. Every saved endpoint URL and optional name is validated before persistence. Missing history is the normal legacy shape and Edit Network resolves it as a one-item list containing the active `rpcUrl`, so no eager migration is required. Settings UI and dapp `wallet_addEthereumChain` confirmations call extension-only background messages (`addNetwork`, `updateNetwork`, `setNetworkHidden`, `deleteNetwork`, `confirmAddChain`) instead of writing a full popup snapshot back to storage.
- `src/chrome/network/rpcClient.ts` is the final configured-RPC egress boundary. Direct JSON-RPC calls and every viem HTTP transport are request/streamed-response/timeout/concurrency bounded; the viem adapter also pins the validated URL against request-hook retargeting. All paths reject redirects and omit ambient credentials/referrers. New public RPC writes require HTTPS, while existing synced public-HTTP entries remain readable for upgrade compatibility and local/private Settings RPCs may use HTTP. URL userinfo and non-HTTP(S) schemes fail closed even when malformed legacy sync state reaches a read path.
- Remote dapps cannot propose or proxy a private-network RPC unless the dapp is itself local: loopback dapps may use loopback RPCs, while LAN dapps are restricted to another port on the exact same hostname. Settings remains the explicit escape hatch for user-owned localhost/LAN RPC development.
- Custom explorer navigation is normalized separately from RPC configuration. Dapp proposals require public HTTPS. Settings may additionally retain explicit loopback HTTP(S) for local development; unsafe legacy explorer values are ignored rather than rendered.
- `src/contexts/NetworksContext.tsx` is a read-through mirror: it initializes via `ensureNetworksInfo` and subscribes to `chrome.storage.onChanged` for `networksInfo`, so long-lived sidepanels pick up chains added by other extension flows.
- Registry entries may set `hiddenByDefault: true`. The default is applied only when that built-in chain has no stored `networksInfo` entry, so newly introduced low-usage chains do not trigger homepage balance RPC calls until enabled, while an existing user visibility choice remains authoritative. Blast, Mantle, Mode, Scroll, and Sonic currently use this default.

**Important:** Do not read `CHAIN_REGISTRY` and `networksInfo` separately in components/handlers to rebuild chain lists or look up RPC/explorer/native currency data. That is what caused custom-chain support to drift across screens. New runtime chain logic should go through `src/lib/chains.ts`, and new network mutations should go through `src/chrome/network/networkMutations.ts` so stale popup snapshots cannot delete chains added by the background.

**Default Network**: Base is set as the default network for new installations.

### Custom Chain UX Rules

- `wallet_addEthereumChain` requests open the same Add Chain form used in Settings, prefilled with the dapp-provided values
- The user can edit the proposed chain name, RPC, explorer, and native currency fields before saving
- Chain deduplication is by `chainId`, not by dapp-provided name. If the chain already exists, the add flow resolves to the existing chain instead of creating a duplicate entry
- Dapp-initiated add-chain confirmation auto-switches the active wallet chain after the save succeeds. Settings-based add-chain does not auto-switch
- If the active chain is hidden or a custom active chain is deleted, the wallet immediately falls back to the first visible chain allowed for the current account type and shows a toast explaining the switch
- Do not allow a hide/delete action to leave the current account type with zero visible chains

### CoinGecko Resolution Service

Native asset price/logo resolution is centralized in the
`src/chrome/portfolio/` audit domain and exposed by
`src/chrome/portfolio/coingecko.ts`.

- All direct CoinGecko traffic goes through the background service worker
- `gasEstimation.ts` asks the service for built-in native token USD prices
- `portfolio/tokenCatalog.ts` sends a single batched background message for custom-chain native assets instead of hitting CoinGecko from the popup
- The service batches CoinGecko `coins/markets` requests across a short buffer window, caches market data in memory + `chrome.storage.local`, and caches search/resolution results for unknown custom assets
- ERC-20 batch price resolution tries GeckoTerminal's batched endpoint first, then falls back to CoinGecko one contract address at a time because CoinGecko's public `/simple/token_price/{platform}` endpoint rejects multi-address requests
- On CoinGecko `429`, the service falls back to cached/stale data and backs off briefly instead of hammering the API
- `coingeckoState.ts` owns the shared native/ERC-20 cache and backoff state;
  `coingeckoNative.ts`, `coingeckoErc20.ts`, and `directTokenPricing.ts` own
  bounded provider effects. The public facade contains no storage or network
  policy.
- Persistent metadata/image cache writes are best-effort. The stable
  `src/chrome/storageCachePruner.ts` facade delegates to
  `storage/cachePolicy.ts` and `storage/cachePruner.ts`, which run on
  service-worker startup and every 6 hours to delete expired non-critical
  entries so cache bloat cannot block vault/account/pending-request writes.
- `portfolioHoldingsCache` is also pruned there; it stores only public Holdings display snapshots for faster popup/sidepanel first paint and is safe to drop at any time.

ERC-20 display metadata is centralized behind the stable
`src/chrome/tokenMetadata.ts` facade and implemented in
`src/chrome/tokens/tokenMetadata.ts`.

- Resolves name/symbol/decimals via `fetchTokenInfo`
- Resolves logos through the swap token list, Bungee token list, watched-asset
  custom tokens, `tokens/tokenLogoConstants.ts`, then the WalletChan API's
  verified deterministic token-icon fallback
- Portfolio catalog calls skip the Bungee token-list fallback so holdings render from the portfolio API/RPC without waiting on bridge token metadata
- Used by receipt asset-change extraction, tx details backfill, clear-signed snapshots, batch call summaries, approve cards, and portfolio auto-add stubs so custom swap/bridge chains do not diverge by page
- Logo image bytes are warmed through the shared `ensAvatarImageCache` sanitizer as soon as a metadata lookup finds a URL. Renderer pages read only the reset-aware `chrome.storage.local` cache through `src/lib/avatarCacheClient.ts`; legacy DOM-localStorage mirrors are purged and never rehydrated.

The remaining released token utilities share the `chrome/tokens/` audit
domain while retaining their root import paths as export-only facades.
`customTokenStorage.ts` alone owns the unchanged `customTokens` array and
`local:customTokens` lock. NFT URI parsing/field/raster policy is pure in
`nftMetadataPolicy.ts`; `nftMetadata.ts` alone owns the public-HTTPS fetch,
manual redirect revalidation, five-second deadline, and 256 KiB body cap.
Unknown calldata scanning remains capped at 64 unique ABI-padded addresses.
One Multicall3 preflight keeps contracts whose `balanceOf(address)` succeeds or
whose ERC-165 response identifies ERC-1155, caches only complete ERC-20
name/symbol/decimals for ten minutes, and deliberately returns the original
bounded candidates when Multicall3 is unavailable.

### Per-Account-Type Chain Restrictions

Not all chains are supported by all account types. The Bankr API only supports a subset of built-in chains (currently Ethereum, Arbitrum, Base, BNB Chain, Polygon, Robinhood Chain, and Unichain — see `isBankrSupported: true` in `chainRegistry.ts`). The remaining built-ins are available for PK, Seed Phrase, Ledger, and Impersonator accounts. PK / Seed / Ledger / Impersonator accounts can additionally add arbitrary custom EVM chains via Settings → Chains; Bankr accounts cannot use custom chains. Ledger still applies the execution exclusions documented above.

**Constants** (derived from `src/constants/chainRegistry.ts`, re-exported via `src/constants/networks.ts`):

| Constant                    | Purpose                                                        |
| --------------------------- | -------------------------------------------------------------- |
| `ALLOWED_CHAIN_IDS`         | All supported chain IDs (superset, used for global validation) |
| `BANKR_SUPPORTED_CHAIN_IDS` | Chain IDs supported by Bankr API accounts only                 |
| `OP_STACK_CHAIN_IDS`        | OP Stack L2 chains (for L1 fee breakdown in gas display)       |

**Enforcement points:**

1. **UI dropdown** (`App.tsx`): Chain dropdown filters by `activeAccount.type` — Bankr accounts only see `BANKR_SUPPORTED_CHAIN_IDS` chains
2. **Account switch** (`App.tsx`): When switching to a Bankr account, if current chain isn't supported, auto-switches to first supported chain
3. **Background validation** (`transactions/bankrConfirmation.ts`): `handleConfirmTransactionAsync` (Bankr path) rejects chains not in `BANKR_SUPPORTED_CHAIN_IDS`
4. **Inpage validation** (`impersonator.ts`): Validates against `ALLOWED_CHAIN_IDS` (imports from constants, no longer hardcoded)

**When adding a new built-in chain:** Add a single entry to `CHAIN_REGISTRY` in `src/constants/chainRegistry.ts`. All derived maps and runtime resolvers auto-populate. See [ADD_CHAIN.md](./ADD_CHAIN.md) for the full checklist.

**When adding runtime chain behavior:** Extend `src/lib/chains.ts` instead of duplicating another `networksInfo` merge in a component or background handler.

## Provider Discovery (EIP-6963)

WalletChan implements [EIP-6963](https://eips.ethereum.org/EIPS/eip-6963) for multi-wallet discovery, allowing dapps to detect and display the wallet alongside other installed wallets.

### How It Works

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                  Dapp                                        │
│                   1. Listens for eip6963:announceProvider                   │
│                   2. Dispatches eip6963:requestProvider                      │
└─────────────────────────────────────────────────────────────────────────────┘
                                    ▲
                                    │ CustomEvent with provider detail
                                    │
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Inpage Script (inpage.js)                           │
│                                                                             │
│  On init:                                                                   │
│    1. Set window.ethereum (legacy support)                                  │
│    2. Dispatch eip6963:announceProvider event                               │
│                                                                             │
│  On eip6963:requestProvider event:                                          │
│    → Re-announce provider                                                   │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Provider Info

The wallet announces itself with the following EIP-6963 provider info:

| Property | Value                                      |
| -------- | ------------------------------------------ |
| uuid     | Random UUIDv4 (generated per page session) |
| name     | "Bankr Wallet"                             |
| icon     | Data URI of wallet icon (128x128 PNG)      |
| rdns     | "com.walletchan"                           |

### Implementation Details

Provider state and discovery live under `src/chrome/provider/inpage/`:
`announcement.ts` owns the frozen provider info, legacy claim, and EIP-6963
listener; `resultRouter.ts` announces after correlated initialization.
`impersonator.ts` is only the Vite entrypoint. The wallet announces on init and
re-announces on `eip6963:requestProvider` events.

### Backward Compatibility

The wallet maintains backward compatibility by:

1. Setting `window.ethereum` for legacy dapps
2. Announcing via EIP-6963 for modern dapps

Dapps that support EIP-6963 will show Bankr Wallet in their wallet selection UI. Legacy dapps will still work via `window.ethereum`.

### Multi-Wallet Conflict Handling

Some injected providers aggressively claim `window.ethereum` using
`Object.defineProperty` with a getter-only descriptor, which prevents another
provider from setting it via direct assignment. WalletChan handles this
gracefully:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      window.ethereum Claim Strategy                          │
│                                                                             │
│  1. Try to delete existing window.ethereum property                         │
│     (clears getter-only descriptors if configurable)                        │
│                                                                             │
│  2. Try direct assignment: window.ethereum = provider                       │
│     (works if property doesn't exist or has a setter)                       │
│                                                                             │
│  3. If direct assignment fails, use Object.defineProperty with:             │
│     - configurable: true                                                    │
│     - writable: true                                                        │
│     - enumerable: true                                                      │
│                                                                             │
│  4. If all attempts fail:                                                   │
│     - Log a warning (not an error)                                          │
│     - Continue with EIP-6963 announcements                                  │
│     - Modern dapps will still discover the wallet                           │
└─────────────────────────────────────────────────────────────────────────────┘
```

**See**: `src/chrome/provider/inpage/announcement.ts` →
`setWindowEthereum()` for the full claim strategy implementation.

**Internal Provider References**:

To avoid issues with other wallets intercepting `window.ethereum`, all internal operations use the `providerInstance` variable directly:

- `setAddress` and `setChainId` message handlers use `providerInstance`
- `wallet_switchEthereumChain` captures `this` reference before async operations
- EIP-6963 announcements use `providerInstance`

This ensures the wallet functions correctly even when `window.ethereum` is claimed by another extension.

## File Structure

```
src/
├── chrome/
│   ├── impersonator.ts      # Thin inpage build entrypoint
│   ├── provider/inpage/     # EIP-1193 state, routing, results, discovery
│   ├── provider/contentBridge/ # Page/runtime allowlists and request adapters
│   ├── dapp/rpcForwarding.ts # Page-local dapp RPC discovery + safe read-only forwarding
│   ├── inject.ts            # Thin content-script build entrypoint
│   ├── background.ts        # Five-line MV3 bootstrap entrypoint
│   ├── background/          # Message transport audit domain (see README.md)
│   │   ├── bootstrap.ts     # Route/pipeline/lifecycle composition only
│   │   ├── messagePipeline.ts # Ordered ENS/audience/provider/route pipeline
│   │   ├── composition/     # Audit-sized route-family and lifecycle wiring
│   │   ├── messageAccessPolicy.ts # Exhaustive wallet-UI/provider audience
│   │   ├── authRouter.ts    # Wallet-UI auth/session delegation
│   │   ├── bankrCredentialRouter.ts # Atomic Bankr credential/account update transport
│   │   ├── onboardingRouter.ts # Fresh-wallet lifecycle transport
│   │   ├── accountStateRouter.ts # Non-secret account state/selection
│   │   ├── accountManagementRouter.ts # Master-gated account/seed mutations
│   │   ├── secretManagementRouter.ts # Reveal and signing confirmation transport
│   │   ├── batchRequestRouter.ts # ERC-5792 intake/status/decisions
│   │   ├── delegationRouter.ts # EIP-7702 status/probe/set/revoke transport
│   │   ├── crossDappBatchRouter.ts # Multi-source batch assembly/decisions
│   │   ├── gasSimulationRouter.ts # Gas and asset-preview transport
│   │   ├── swapBridgeDataRouter.ts # Swap/bridge quote and catalog transport
│   │   ├── tokenDataRouter.ts # Token metadata/storage/price/balance transport
│   │   ├── dappPermissionRouter.ts # Dapp connection/permission prompts
│   │   ├── providerRpcRouter.ts # Origin-authorized durable read-only RPC transport
│   │   ├── providerIngress.ts # Connected-origin/rejection/ERC-7715 ingress helpers
│   │   ├── signatureValidation.ts # Provider signature/EIP-712 intake validation
│   │   ├── chainSwitchNotification.ts # Connected-site chain-change effects/cooldown
│   │   ├── resetRouter.ts # Master-only reset barrier and destructive ordering
│   │   ├── lifecycle/      # Chrome registration/startup audit domain (see README.md)
│   │   ├── watchAssetRouter.ts # EIP-747 prompt transport
│   │   ├── chainPromptRouter.ts # EIP-3085 and chain notices
│   │   ├── signingRequestRouter.ts # Single tx/signature intake, reads, rejection/cancel
│   │   ├── transactionExecutionRouter.ts # Bankr/local confirmation and transfer intake
│   │   ├── swapExecutionRouter.ts # Account-bound Bankr/local swap transport
│   │   ├── sponsoredTransferRouter.ts # Sponsored submission/status/ACK transport
│   │   ├── internalOperationBarrier.ts # Reset-aware internal effect claims
│   │   └── transactionStatusRouter.ts # History, processing, result, receipt transport
│   ├── authTransition.ts    # Serialized auth mutations + WebAuthn ceremony invalidation
│   ├── sessionCache.ts      # Export-only auth-session compatibility facade
│   ├── session/             # Session-state audit domain (see README.md)
│   │   ├── inMemoryCache.ts # Decrypted capability state + expiry timestamps
│   │   ├── autoLockPolicy.ts # Timeout normalization and synced setting cache
│   │   ├── cacheAccess.ts  # Expiry-aware selectors and wallet predicates
│   │   ├── teardown.ts     # All-or-nothing memory/session clearing
│   │   ├── timeoutTransitions.ts # Default and timed/Never transitions
│   │   ├── restoration.ts # Serialized password-Never/passkey timed recovery
│   │   ├── persistence.ts   # Native Never password envelope/shared recovery half
│   │   ├── passkeyPersistence.ts # Native Never passkey-vault envelope
│   │   ├── passkeyCredentialRecord.ts # Exact passkey-session record codec
│   │   └── storage.ts       # Cross-browser session-storage adapter
│   ├── authHandlers.ts      # Stable factor/credential/password-management facade
│   ├── auth/                # Authentication audit domain (see README.md)
│   │   ├── walletUnlock.ts  # Modern master/agent and legacy unlock routing
│   │   ├── sessionHydration.ts # Atomic credential/key cache hydration
│   │   ├── legacyVaultKeyMigration.ts # Legacy general/private-key migration
│   │   ├── masterPasswordVerification.ts # Side-effect-free current/legacy master proof
│   │   ├── agentFactorHandlers.ts # Agent-password setup/removal policy and commits
│   │   ├── bankrCredentialUpdate.ts # Prepared Bankr credential mutation boundary
│   │   ├── masterPasswordRotation.ts # Atomic current/legacy password rotation
│   │   └── sessionTermination.ts # Manual lock ordered with secret/account mutations
│   ├── secretRevealHandlers.ts # Stable master-only reveal facade
│   ├── masterAuthorization.ts # Stable exact-epoch/live-master facade
│   ├── secrets/             # Linearized plaintext release (see README.md)
│   ├── delegatedAuthorityPolicy.ts # Stable delegated-authority policy facade
│   ├── delegationHandlers.ts # Stable EIP-7702 handler facade
│   ├── delegationStorage.ts # Stable custom-delegate storage facade
│   ├── delegation/          # EIP-7702 management audit domain (see README.md)
│   │   ├── authorityPolicy.ts # Canonical-default/custom master + epoch rules
│   │   ├── status.ts       # Onchain delegation status projection
│   │   ├── probe.ts        # ERC-7821 capability probe
│   │   ├── setRequest.ts   # Set validation, re-probe, and authorization capture
│   │   ├── revokeRequest.ts # Agent-capable authority-reducing request intake
│   │   ├── requestConstruction.ts # Pure pinned type-4 self-call builder
│   │   ├── requestQueue.ts # Locked durable save-before-notify boundary
│   │   └── storage.ts      # Locked exact-shape customDelegates repository
│   ├── onboardingInitialization.ts # Stable fresh-wallet initialization facade
│   ├── onboarding/          # Fresh-wallet setup audit domain (see README.md)
│   │   ├── state.ts         # Marker codec, completeness, and recovery state
│   │   ├── lifecycle.ts     # Begin/status/complete/rollback orchestration
│   │   └── credential.ts    # First general-vault credential commit
│   ├── passkeyUnlock.ts     # Stable biometric orchestration facade
│   ├── passkeyUnlockCrypto.ts # Compatibility facade for passkey record/crypto/storage APIs
│   ├── passkey/             # WebAuthn-PRF audit domain (see README.md)
│   │   ├── status.ts        # Status and explicit/cached-master preflight
│   │   ├── setup.ts         # Atomic V1/V2 setup and mnemonic-vault commit
│   │   ├── hydration.ts     # V1/V2 unwrap and master-session hydration
│   │   ├── removal.ts       # Recovery proofs and factor removal
│   │   ├── record.ts        # Passkey V1/V2 record codec
│   │   ├── keyWrapping.ts   # Purpose-separated PRF/HKDF key wrapping
│   │   ├── sessionBinding.ts # Stable passkey-factor/session fingerprint
│   │   └── repository.ts    # Validated passkey record storage
│   ├── mnemonicStorage.ts # Stable mnemonic-vault compatibility facade
│   ├── mnemonic/            # Mnemonic/seed-account audit domain (see README.md)
│   │   ├── record.ts        # Validated released/current V1/V2 record codec
│   │   ├── crypto.ts        # Pure password/key/AAD/key-check transformations
│   │   ├── repository.ts    # Locked mnemonicVault storage repository
│   │   ├── operations.ts    # Store/read/remove coordination
│   │   ├── recovery.ts      # V2 preparation, verification, and password rotation
│   │   ├── derivation.ts    # Pure bounded BIP39/BIP44 operations
│   │   ├── masterAccess.ts  # Master-only call-stack mnemonic capability
│   │   ├── integrity.ts     # Master recovery + seed-account binding proof
│   │   ├── addressPreview.ts # Secret-free public-address preview
│   │   ├── accountPersistence.ts # Collision, compensation, and cache refresh
│   │   └── accountHandlers.ts # Master-only add/derive orchestration
│   ├── vaultCrypto.ts       # Stable private-key vault compatibility facade
│   ├── vault/               # Private-key vault audit domain (see README.md)
│   │   ├── entryCrypto.ts   # Released password/vault-key transformations
│   │   ├── accountIntegrity.ts # Stored local-key/account binding validation
│   │   ├── generalIntegrity.ts # Master recovery proof for API/private-key secrets
│   │   ├── repository.ts    # Exact pkVault V1 storage authority
│   │   └── operations.ts    # Serialized mutation/hydration/migration prep
│   ├── txHandlers.ts        # Stable transaction/signature compatibility facade
│   ├── transactions/        # Transaction coordinator audit domain (see README.md)
│   │   ├── requestIntake.ts # Provider validation and pinned prompt intake
│   │   ├── runtime.ts       # Results, pinned accounts, and process state
│   │   ├── localConfirmation.ts # PK/seed preflight and key/session recovery
│   │   ├── localExecution.ts # Sign-once preparation, final authority gate, and publication
│   │   ├── bankrConfirmation.ts # Pinned Bankr confirmation and effect leasing
│   │   ├── bankrProcessing.ts # Remote result/history publication
│   │   ├── requestActions.ts # Reject and cancellation terminalization
│   │   ├── swaps/           # Locked direct, Bankr batch, and atomic-7702 swaps
│   │   └── failure.ts       # Durable failure/history/notification publication
│   ├── batchTxHandlers.ts   # Implementation-free ERC-5792 compatibility facade
│   ├── batch/               # ERC-5792 audit domain (see README.md)
│   │   ├── batchCapabilities.ts # Connected-account capability/delegate probes
│   │   ├── batchRequestIntake.ts # Pinned two-record wallet_sendCalls commit
│   │   ├── batchBankrExecution.ts # Bankr confirmation and publication
│   │   ├── batchLocalConfirmation.ts # PK/seed recovery and path selection
│   │   ├── batchLocalAuthorization.ts # Final account/transport RPC gate
│   │   ├── batchSingleExecution.ts # One-call local shortcut
│   │   ├── batchSequentialExecution.ts # Ordered ambiguity-aware local legs
│   │   ├── batchAtomic7702Execution.ts # EIP-7702 atomic sign-once execution
│   │   └── batchCompletionTracking.ts # Receipt-to-bundle terminal mirroring
│   ├── crossDappBatchHandlers.ts # Export-only cross-dapp batch facade
│   ├── crossDappBatch/      # User-assembled multi-origin batch audit domain
│   │   ├── storage.ts       # Released staged-call schema and storage key
│   │   ├── lifecycle.ts     # Source grouping, cancellation, epoch commits
│   │   ├── intake.ts        # Pinned tx/bundle staging
│   │   ├── staging.ts       # Edit, remove, and reject terminalization
│   │   ├── confirmation.ts  # Lock, encode, history, signer composition
│   │   ├── bankr.ts         # Pinned Bankr submit boundary
│   │   ├── local.ts         # PK/seed EIP-7702 sign-once boundary
│   │   └── completion.ts    # Source-aware result and receipt fan-out
│   ├── signatures/          # Signature confirmation audit domain (see README.md)
│   │   ├── requestSigner.ts # Method-specific signer parameter selection
│   │   ├── confirmationPolicy.ts # Shared signer, SIWE, and pinned-account preflight
│   │   ├── confirmationHandlers.ts # Local/Bankr orchestration and final release gate
│   │   └── eip712/          # Pure typed-data policy audit domain (see README.md)
│   │       ├── validator.ts # Bounded parsing and validation ordering
│   │       ├── delegationPolicy.ts # Raw ERC-7710 rejection
│   │       ├── schemaValidation.ts # Graph/type/depth validation
│   │       ├── sanitization.ts # Schema-only signing projection
│   │       └── types.ts     # Validation result contract
│   ├── erc7715PermissionHandlers.ts # Stable ERC-7715 permission facade
│   ├── pendingErc7715PermissionStorage.ts # Stable ERC-7715 persistence facade
│   ├── erc7715/             # ERC-7715/ERC-7710 audit domain (see README.md)
│   │   ├── methods.ts       # Method recognition and capabilities
│   │   ├── preflight.ts     # Stable local preflight facade
│   │   ├── preflightNormalization.ts # Pure request normalization
│   │   ├── preflightRpc.ts  # Bounded delegate/Permit2 RPC reads
│   │   ├── preflightEligibility.ts # Account/delegate eligibility orchestration
│   │   ├── pendingPermissionRequest.ts # Account-pinned prompt construction
│   │   ├── requestHandler.ts # Provider dispatch and durable prompt intake
│   │   ├── confirmation.ts  # Master-only approval/rejection
│   │   ├── revocation.ts    # Account-pinned revoke transaction intake
│   │   ├── onchainStatus.ts # Live grant verification and revocation sync
│   │   ├── registry.ts      # Stable local validation facade
│   │   ├── permissionTypes.ts # Fixed permission/rule vocabulary
│   │   ├── ruleValidation.ts # Expiry rule validation
│   │   ├── permissionValidation.ts # Permission schema/exposure validation
│   │   ├── caveats.ts       # Stable local caveat facade
│   │   ├── caveatDefinitions.ts # Canonical enforcers and caveat types
│   │   ├── caveatEncoding.ts # Fixed-width DeleGator term encoding
│   │   ├── caveatBuilder.ts # Permission-to-caveat selection
│   │   ├── delegationSigning.ts # WalletChan-owned ERC-7710 encoding
│   │   ├── grantStorage.ts  # Master-authorized atomic grant commits
│   │   ├── pendingRequestStorage.ts # Locked prompt repository
│   │   └── resultStorage.ts # Injected/WalletConnect result bridge
│   ├── sidepanelManager.ts  # Stable export-only sidepanel compatibility facade
│   ├── extensionPopup.ts    # Stable export-only request-surface facade
│   ├── windowing/           # Browser/mode policy, panel verification, popup effects
│   ├── cryptoUtils.ts       # Stable cryptographic-codec/KDF facade
│   ├── crypto.ts            # Stable credential/vault-key crypto facade
│   ├── cryptography/        # Bounded codecs, PBKDF2, AES-GCM, credential IO
│   ├── vaultCrypto.ts       # Stable private-key vault compatibility facade
│   ├── vault/               # Private-key vault audit domain (see README.md)
│   │   ├── entryCrypto.ts   # Released password/vault-key transformations
│   │   ├── accountIntegrity.ts # Local key/account binding validation
│   │   ├── generalIntegrity.ts # Master recovery proof
│   │   ├── repository.ts    # Exact pkVault V1 storage authority
│   │   └── operations.ts    # Serialized mutation/hydration/migration prep
│   ├── mnemonicStorage.ts   # Stable facade over the focused mnemonic-vault layers above
│   ├── types.ts             # Account and vault type definitions
│   ├── localSigner.ts       # Stable local-signing compatibility facade
│   ├── localSigning/        # Local signer audit domain (see README.md)
│   │   ├── messageSigner.ts # Personal-message and EIP-712 policy
│   │   ├── transactionSigner.ts # Transaction and EIP-7702 preparation
│   │   ├── transactionBroadcast.ts # Sign-once raw-RPC effect boundary
│   │   └── client.ts       # Viem client and bounded RPC transport
│   ├── eip712Validator.ts # Stable policy-free typed-data facade
│   ├── accountStorage.ts    # Stable account-metadata compatibility facade
│   ├── accounts/            # Account identity/selection audit domain (see README.md)
│   │   ├── repository.ts    # accounts record, normalization, ordering, queries
│   │   ├── selectionStorage.ts # Global/per-tab selection and stale-ID repair
│   │   ├── bankrStorage.ts  # Atomic Bankr account + credential metadata
│   │   ├── localStorage.ts  # Private-key/view-only metadata mutations
│   │   ├── seedStorage.ts   # Seed-derived account metadata
│   │   ├── seedGroupStorage.ts # Non-secret recovery-group metadata
│   │   ├── legacyMigration.ts # Serialized pre-multi-account migration
│   │   ├── tabResolver.ts   # Connected-dapp-only per-tab account scope
│   │   ├── localKeyResolver.ts # Session-restoring local signer key lookup
│   │   └── localEffectBoundary.ts # Final identity check before local effects
│   ├── dapp/                # Dapp authorization/privacy audit domain (see README.md)
│   │   ├── requestPolicy.ts # Exact top-level Chrome origin authorization
│   │   ├── accountScope.ts  # Approved/pending per-tab scope
│   │   ├── connectionHandlers.ts # Connection queue/results and revocation
│   │   ├── accountRemovalPrivacy.ts # Disconnect-before-delete boundary
│   │   └── rpcForwarding.ts # Narrow page-discovered read-only RPC path
│   ├── ensBanner.ts         # Thin Vite entrypoint for the local-gateway identity strip
│   ├── ensBrowsing/banner/  # Content-script banner audit domain (see README.md)
│   │   ├── controller.ts    # Mount order and SPA path synchronization
│   │   ├── pageState.ts     # Restricted name/address parser and safe metadata
│   │   ├── transport.ts     # Exact outbound runtime-message contracts
│   │   ├── contentUpdates.ts # Exact background content-update push contract
│   │   ├── bookmarkActions.ts # Path-normalized bookmark behavior
│   │   ├── menuActions.ts   # Copy/history/hosted-gateway actions
│   │   ├── addressField.ts  # Closed-shadow-root plaintext field behavior
│   │   └── view.ts          # Isolated banner DOM (styles/layout split nearby)
│   ├── storageLock.ts       # Stable shared storage-lock facade
│   ├── walletResetStorage.ts # Stable wallet-reset manifest facade
│   ├── storageCachePruner.ts # Stable non-critical cache-pruner facade
│   ├── storageResultWaiter.ts # Stable durable-result waiter facade
│   ├── storage/             # Cross-domain storage primitives (see README.md)
│   │   ├── lock.ts          # Per-key in-process RMW serializer
│   │   ├── resetManifest.ts # Exact wallet-owned keys and transient prefixes
│   │   ├── cachePolicy.ts   # Pure TTL/schema/LRU prune plan
│   │   ├── cachePruner.ts   # Ordered local-storage prune effects
│   │   └── resultWaiter.ts  # Durable result listener and expiry retry handshake
│   ├── network/             # Bounded HTTP/RPC/network-config audit domain
│   │   ├── boundedHttp.ts   # Shared deadline/stream-byte response reader
│   │   ├── rpcClient.ts     # Configured-RPC URL/SSRF/bounds policy
│   │   ├── safeRpcForwarding.ts # Provider/WC read-only allowlist
│   │   ├── proxyResolver.ts # Proxy implementation lookup
│   │   ├── customNetworkValidation.ts # Custom-chain schema validation
│   │   ├── networkRepository.ts # networksInfo/chainName storage
│   │   ├── networkPolicy.ts # Pure fallback/mutation policy
│   │   └── networkMutations.ts # Locked network mutations
│   ├── transactionValidation.ts # Dapp transaction quantity validation/normalization
│   ├── gasEstimation.ts  # Stable single-gas compatibility facade
│   ├── feeEstimation.ts  # Stable fee-tier compatibility facade
│   ├── batchGasEstimation.ts # Stable sequential-batch gas facade
│   ├── gas/              # Gas/fee estimation audit domain (see README.md)
│   │   ├── feePolicy.ts  # Priority floors, percentiles, spacing, base prediction
│   │   ├── feeRpc.ts     # feeHistory/maxPriority/legacy gasPrice fallbacks
│   │   ├── feeEstimator.ts # Fee-tier coordinator
│   │   ├── client.ts     # Cached bounded client, native price, buffered estimate
│   │   ├── singlePolicy.ts # 7702/non-standard gas policy and tier serialization
│   │   ├── singleEstimator.ts # Single-transaction orchestration
│   │   ├── batchSimulation.ts # eth_simulateV1 capability and gas results
│   │   ├── batchInjection.ts # TxSimulator state-override gas measurement
│   │   ├── batchFallback.ts # Independent estimates + dependent-call fallback
│   │   └── batchEstimator.ts # Three-tier sequential coordinator
│   ├── swapApi.ts         # Stable swap/token compatibility facade
│   ├── swap/              # Swap transport, chain reads, and cache audit domain
│   │   ├── transport.ts   # Bounded JSON and released remote-error handling
│   │   ├── quotes.ts      # Exact price/quote query contracts
│   │   ├── rpcClient.ts   # Configured bounded RPC client factory
│   │   ├── erc20.ts       # Balance/allowance reads and approval calldata
│   │   ├── permit2.ts     # Permit2 reads, clamp, expiry, and calldata
│   │   ├── tokenInfo.ts   # Native/onchain metadata plus 30-day cache
│   │   ├── tokenList.ts   # Raw upstream 24-hour token-list cache
│   │   ├── tokenListPolicy.ts # Pure pinned-token precedence
│   │   ├── tokenLogo.ts   # Per-address 30-day logo-result cache
│   │   └── tokenPrice.ts  # Proxy price plus direct CoinGecko fallback
│   ├── txSimulation.ts    # Stable asset-change simulation coordinator/facade
│   ├── simulation/        # Transaction simulation audit domain (see README.md)
│   │   ├── types.ts       # Normalized asset-change and raw simulator shapes
│   │   ├── constants.ts   # Shared gas caps and canonical infrastructure addresses
│   │   ├── stateOverrides.ts # ERC-20/Permit2 retry override construction
│   │   ├── ethSimulateLogs.ts # Pure eth_simulateV1 transfer-log parser
│   │   ├── client.ts      # Bounded RPC client cache
│   │   ├── nativeCurrency.ts # Built-in/custom native metadata
│   │   ├── portfolioPrices.ts # Reset-aware cached price map
│   │   ├── assetChangeNormalization.ts # Pure result normalization
│   │   ├── nftEnrichment.ts # NFT detection and post-state metadata
│   │   ├── tokenEnrichment.ts # Ordered token/NFT/price enrichment
│   │   ├── metadataRetry.ts # Token/NFT/native retry flow
│   │   ├── resultBuilder.ts # Raw-to-public simulation result mapping
│   │   ├── simulatorContract.ts # Canonical bytecode and ABIs
│   │   ├── erc7715Preview.ts # Narrow delegated-redemption preview
│   │   ├── singleSimulation.ts # Single access-list/eth_call orchestration
│   │   ├── batchSimulation.ts # Atomic batch simulation fallback
│   │   ├── ethSimulateBatch.ts # Bounded eth_simulateV1 path
│   │   └── nonAtomicBatch.ts # Dual-path merge precedence
│   ├── forceInclusion/    # L1 deposit, nonce, receipt, and split recovery domain
│   │   ├── single.ts      # Stable single-deposit export facade
│   │   ├── l1Client.ts    # L1 chain/RPC selection and progress persistence
│   │   ├── deposit.ts     # Zero-mint OptimismPortal calldata + separate L1-gas/L2-value balance estimation
│   │   ├── singleBankr.ts # Remote-signer single-deposit execution
│   │   ├── singleLocal.ts # Final-authorized sign-once local execution
│   │   ├── singleOutcome.ts # Durable confirmed/ambiguous/failure outcomes
│   │   ├── recovery.ts    # Startup L1 and aggregate-bundle reconciliation
│   │   ├── batch.ts       # Stable ERC-5792 force-inclusion export facade
│   │   ├── batchBankr.ts  # Atomic remote-signer batch deposit
│   │   ├── batchLocalPreparation.ts # L2/L1 gas, nonce, and history preparation
│   │   ├── batchLocalBroadcast.ts # Ordered local sends and tail-halting policy
│   │   ├── batchLocalReceipts.ts # Recoverable L1 receipt observation
│   │   ├── batchCompletion.ts # Aggregate ERC-5792 terminal status
│   │   ├── nonceManager.ts # Pending-nonce cache and explicit reset boundaries
│   │   ├── receiptPoller.ts # Stable receipt export facade
│   │   ├── receiptPolling.ts # Poller lifecycle, backoff, and restart resume
│   │   ├── receiptFinalizer.ts # Receipt/ambiguity/drop classification
│   │   ├── receiptHistory.ts # Terminal history and gas application
│   │   ├── receiptSideEffects.ts # 7702/7715, split, and bridge follow-up
│   │   ├── broadcastPolicy.ts # Pure ambiguous-broadcast retention/halt policy
│   │   └── splitBatchSequencer.ts # Durable one-at-a-time split execution
│   ├── bankr/               # Remote signer/agent audit domain (see README.md)
│   │   ├── client.ts        # Policy-free aggregate domain facade
│   │   ├── response.ts      # Strict bounded response/error schemas
│   │   ├── transport.ts     # Redirect/deadline/byte-bounded HTTP transport
│   │   ├── signing.ts       # Request mapping + recovered-signer proof
│   │   ├── submission.ts    # Irreversible submit + ambiguity boundary
│   │   ├── jobs.ts          # Bounded polling and cancellation
│   │   ├── credentialBinding.ts # Encrypted-credential generation tags
│   │   ├── pendingAuthorization.ts # Final signer/account/transport/tag gate
│   │   └── chat/            # Chat client, storage, and handlers (see README.md)
│   ├── avatarImageCache.ts # Stable privileged-image cache compatibility facade
│   ├── avatar/             # Remote raster image cache audit domain (see README.md)
│   │   ├── constants.ts    # Exact key, TTL/LRU, byte, redirect, and queue limits
│   │   ├── types.ts        # Exact ensAvatarImageCache entry schema
│   │   ├── policy.ts       # Public HTTPS, raster MIME, and cached-data validation
│   │   ├── bodyReader.ts   # Streaming response allocation ceiling
│   │   ├── rasterSignature.ts # Generic-binary raster signature policy
│   │   ├── scheduler.ts    # Two-wide FIFO, same-URL flight, reset abort/epoch
│   │   ├── transport.ts    # Manual redirects and credentialless fetch
│   │   ├── rasterizer.ts   # Pixel decode, 128px resize, bounded WebP output
│   │   ├── repository.ts   # Locked best-effort TTL/LRU cache authority
│   │   └── coordinator.ts  # Cache-first null-on-error orchestration
│   ├── customTokenStorage.ts # Stable custom-token storage facade
│   ├── tokenMetadata.ts    # Stable shared token metadata facade
│   ├── tokenLogoConstants.ts # Stable hardcoded-logo facade
│   ├── nftMetadata.ts      # Stable bounded NFT metadata facade
│   ├── erc20CandidatePreflight.ts # Stable asset preflight facade
│   ├── calldataAddressCandidates.ts # Stable calldata scanner facade
│   ├── tokens/             # Token metadata/discovery audit domain (see README.md)
│   │   ├── types.ts        # Custom/ERC-20/NFT/preflight contracts
│   │   ├── customTokenStorage.ts # Locked customTokens repository
│   │   ├── tokenMetadata.ts # Exact onchain/Bungee/custom source precedence
│   │   ├── tokenLogoConstants.ts # Canonical packaged logo fallbacks
│   │   ├── nftMetadataPolicy.ts # Pure URI/field/raster policy
│   │   ├── nftMetadata.ts  # Public-only manual-redirect transport
│   │   ├── calldataAddressCandidates.ts # Pure bounded ABI-word scan
│   │   └── erc20CandidatePreflight.ts # Multicall3 filter and metadata cache
│   ├── portfolio/           # Portfolio display-state audit domain (see README.md)
│   │   ├── api.ts           # Bounded provider-agnostic portfolio client
│   │   ├── tokenCatalog.ts  # Shared API/custom/recent/native merge coordinator
│   │   ├── catalogTransforms.ts # Pure metadata and visibility transforms
│   │   ├── onchainBalances.ts # Onchain balance verification via Multicall3
│   │   ├── hiddenTokens.ts  # Global hidden-token storage for Holdings
│   │   ├── recentTokens.ts  # Short-lived received-token overlay
│   │   ├── holdingsCache.ts # Best-effort Holdings first-paint cache
│   │   ├── snapshotStorage.ts # Per-address portfolio value snapshots
│   │   ├── snapshotRefresh.ts # Catalog → onchain → forced snapshot refresh
│   │   ├── coingeckoState.ts # Shared price cache and rate-limit state
│   │   └── coingecko.ts     # Native/ERC-20 price facade
│   ├── transferUtils.ts     # ERC20/native token transfer calldata builders
│   ├── requests/            # Durable pending-request audit domain (see README.md)
│   │   ├── pinnedRequest.ts # Account-bound tx/signature/batch factories
│   │   ├── pendingRequestResolution.ts # First-action claims, leases, reset barrier
│   │   ├── pendingRequestLifecycle.ts # Confirm-time origin/account/WC authorization
│   │   ├── pendingRequestTerminalization.ts # Remove-before-result publication
│   │   ├── pendingTxStorage.ts # Persistent transaction prompts
│   │   ├── pendingSignatureStorage.ts # Persistent signature prompts
│   │   ├── pendingBatchTxStorage.ts # Persistent ERC-5792 prompts
│   │   ├── pendingWatchAssetStorage.ts # Persistent EIP-747 prompts
│   │   ├── pendingAddChainStorage.ts # Persistent EIP-3085 prompts
│   │   ├── dappPermissionStorage.ts # Approved and pending dapp connections
│   │   ├── pendingDappRequestLifecycle.ts # Exact-origin cancellation
│   │   ├── pendingMetadataPromptLifecycle.ts # Metadata provenance and origin invalidation
│   │   ├── pendingWalletConnectLifecycle.ts # Topic termination and cancellation
│   │   └── pendingBridgeStorage.ts # In-flight bridge settlement records
│   ├── trustedWalletUiSender.ts # Exact index/onboarding runtime sender boundary
│   ├── walletConnect/       # WalletConnect relay audit domain (see README.md)
│   │   ├── client.ts        # SDK lifecycle, listeners, generation, reset cutover
│   │   ├── sessionCommands.ts # Trusted-UI list/pair/disconnect/chain commands
│   │   ├── sessionProposal.ts # Signing-account namespace approval policy
│   │   ├── requestRouter.ts # Claimed, validated session-request dispatch
│   │   ├── pendingRequests.ts # Pinned tx/signature confirmation prompts
│   │   ├── batchRequests.ts # ERC-5792 request adapters
│   │   ├── rpcRequests.ts   # Chain mutation and bounded safe-RPC adapters
│   │   ├── storage.ts       # Durable request claims/routes/terminal outbox
│   │   ├── protocol.ts      # Persist-before-relay JSON-RPC responses
│   │   ├── resultBridge.ts  # Injected-result to relay delivery bridge
│   │   ├── keepalive.ts     # Active-session relay liveness
│   │   └── reset.ts         # SDK teardown and replacement namespace rotation
│   ├── sponsoredTransfers/ # ERC-3009 sponsored-transfer audit domain (see README.md)
│   │   ├── handlers.ts     # Intake and existing-intent coordinator
│   │   ├── authorization.ts # Account-pinned signing and encryption
│   │   ├── intentStorage.ts # Encrypted recovery/ACK repository
│   │   ├── submission.ts   # Sole relayer POST and ambiguity boundary
│   │   ├── reconciliation.ts # Finalized dual-RPC authorization checks
│   │   ├── recovery.ts     # Consumed/expired history reconciliation
│   │   └── status.ts       # Trusted-UI recovery and acknowledgment
│   ├── txHistoryStorage.ts  # Stable transaction-history compatibility facade
│   ├── assetChangesExtractor.ts # Stable post-confirm enrichment facade
│   ├── history/nftTransferMetadata.ts # Confirmed NFT collection/token metadata enrichment
│   ├── receiptEnrichment.ts # Stable receipt retry/backfill facade
│   ├── history/             # Transaction history and receipt enrichment audit domain
│   │   ├── types.ts         # Released additive txHistory record shape
│   │   ├── repository.ts    # Locked newest-first storage authority
│   │   ├── maintenance.ts   # Stale processing and clear-history policy
│   │   ├── assetTransferParser.ts # Pure fungible Transfer-log decoder
│   │   ├── rpc.ts           # Bounded receipt/balance/block helpers
│   │   ├── assetChangeExtraction.ts # ERC-20/native delta assembly
│   │   ├── assetChangePersistence.ts # Recent-token and history writes
│   │   ├── receiptTransport.ts # Configured receipt and bundle projection
│   │   └── receiptEnrichment.ts # Retry and old-entry backfill policy
│   ├── bridgeApi.ts         # Stable bridge API/catalog compatibility facade
│   ├── bridgeChainsResolver.ts # Stable bridge-chain compatibility facade
│   ├── bridgeStatusPoller.ts # Stable bridge-settlement compatibility facade
│   ├── bridge/              # Bridge client/cache/status audit domain (see README.md)
│   │   ├── client.ts        # Bounded quote/status/catalog API transport
│   │   ├── catalogCache.ts  # Released 24h chain/token caches and WCHAN pin
│   │   ├── chainPolicy.ts   # Pure EVM and source/destination eligibility
│   │   ├── chainResolver.ts # Runtime configured-chain composition
│   │   ├── statusNotification.ts # Terminal copy, explorer, notification
│   │   ├── statusApplication.ts # Ordered status/history/pending transition
│   │   └── statusPolling.ts # Backoff, dedupe, resume, and registration
│   ├── clearSigningHandlers.ts # Stable descriptor/settings compatibility facade
│   ├── clearSignedMetaSnapshot.ts # Stable Activity snapshot compatibility facade
│   └── clearSigning/        # ERC-7730 descriptor/snapshot audit domain (see README.md)
│   │   ├── types.ts         # Transport, lookup, and snapshot input contracts
│   │   ├── descriptorCache.ts # Exact v3 key/schema/TTL repository
│   │   ├── settings.ts      # Default-on preference and disable-time purge
│   │   ├── descriptorClient.ts # Bounded public descriptor transport
│   │   ├── deploymentExtension.ts # Pure proxy deployment binding
│   │   ├── descriptorResolver.ts # Direct then configured-RPC proxy fallback
│   │   ├── handlers.ts      # Validation/cache/resolution coordinator
│   │   ├── counterparty.ts  # Best-effort label/name enrichment
│   │   ├── assetSnapshotBuilders.ts # Approve/transfer/native summaries
│   │   ├── erc7730Snapshot.ts # Remote-plus-built-in descriptor summary
│   │   ├── snapshot.ts      # Summary precedence and null-on-error boundary
│   │   └── historyAttachment.ts # Fire-and-forget history patch
├── constants/
│   ├── chainRegistry.ts     # Single source of truth for all chain data
│   ├── networks.ts          # Re-exports network constants from chainRegistry
│   └── chainConfig.ts       # Re-exports chain UI config from chainRegistry
├── lib/
│   ├── privateNetworkPolicy.ts # Literal/reserved IPv4/IPv6/hostname classifier
│   ├── externalNavigation.ts # Public-HTTPS/loopback-safe external URL sanitizer
│   ├── remoteImagePolicy.ts # Public-HTTPS and raster-data URL policy
│   ├── avatarCacheClient.ts # Renderer access to sanitized reset-aware raster cache
│   └── siwe/                # EIP-4361 parser + validation shared by UI and signing handlers
├── sounds/
│   ├── customValueSound.ts  # WalletChan-owned Web Audio value-pulse synthesizer
│   ├── soundManager.ts      # Semantic cue mapping, Cuelume playback, and local preference
│   ├── useSliderValueSound.ts # Drag-aware slider sound lifecycle
│   └── useSoundsEnabled.ts  # React subscription for the global sound preference
├── pages/
│   └── Onboarding.tsx       # Full-page onboarding wizard for first-time setup
├── app/
│   ├── requestModel.ts      # Pure pending-request ordering/model
│   ├── lazyScreens.ts       # Route lazy imports and idle preloading
│   ├── hooks/               # App-owned renderer runtime boundaries
│   ├── home/                # App-owned home presentation
│   └── screens/             # Small App-owned route screens
├── components/
│   ├── README.md            # Renderer feature-domain audit map
│   ├── Activity/            # Transaction-history presentation
│   ├── BatchConfirmation/   # ERC-5792 review and decisions
│   ├── Chat/
│   │   ├── ChatView.tsx     # Main chat orchestrator (list/chat modes)
│   │   ├── ChatList.tsx     # Past conversations list
│   │   ├── ChatHeader.tsx   # Navigation and actions
│   │   ├── ChatInput.tsx    # Text input + send button
│   │   ├── MessageList.tsx  # Scrollable message container
│   │   ├── MessageBubble.tsx # Individual message display
│   │   └── ShapesLoader.tsx # Animated Bauhaus loading indicator
│   ├── ClearSigning/        # Descriptor loading and focused renderers
│   ├── Portfolio/Holdings/  # Portfolio lifecycle, transforms, and rows
│   ├── Settings/
│   │   ├── index.tsx        # Main settings page (includes clear history)
│   │   ├── Chains.tsx       # Chain RPC management
│   │   ├── AddChain.tsx     # Add new chain
│   │   ├── EditChain.tsx    # Edit existing chain
│   │   ├── RpcEndpointManager.tsx # Saved RPC selection/add/remove UI
│   │   ├── CustomNetworkDetails.tsx # Custom explorer/native metadata fields
│   │   ├── ChangePassword.tsx # Password change flow
│   │   ├── AutoLockSettings.tsx # Auto-lock timeout configuration
│   │   ├── AgentPasswordSettings.tsx # Agent password set/remove (master only)
│   │   └── SoundsSettings.tsx # Global interaction-sound preference
│   ├── TransactionConfirmation/ # Single-tx review and decision domain
│   ├── TransactionDetails/  # Activity detail modal/screen domain
│   ├── Transfer/            # Transfer preparation and intake domain
│   ├── AccountSwitcher.tsx  # Account dropdown with ENS avatars/names, seed group labels
│   ├── AccountSettingsModal.tsx # Account settings (rename, reveal key/seed, remove, change API key, refresh ENS)
│   ├── RevealPrivateKeyModal.tsx # Password-protected private key reveal
│   ├── RevealSeedPhraseModal.tsx # Password-protected seed phrase reveal (master only)
│   ├── AddAccount.tsx       # Add new account screen
│   ├── UnlockScreen.tsx     # Wallet unlock (password entry)
│   ├── PendingTxBanner.tsx  # Banner showing pending tx/signature count
│   ├── WalletConnectBanner.tsx # Home banner for active WalletConnect sessions
│   ├── WalletConnectView.tsx # Pair URI entry + connected dapp session list
│   ├── PendingTxList.tsx    # List of pending transactions and signature requests
│   ├── TxStatusList.tsx     # Re-export-only Activity compatibility facade
│   ├── TxDetailModal.tsx    # Re-export-only TransactionDetails facade
│   ├── GasEstimateDisplay.tsx # Collapsible gas fee display with editable params (PK/Seed)
│   ├── TransactionConfirmation.tsx # Re-export-only confirmation facade
│   ├── TransactionConfirmationErrorBoundary.tsx # Last-resort reject UI for malformed tx renders
│   ├── BatchTransactionConfirmation.tsx # Re-export-only batch facade
│   ├── SignatureRequestConfirmation.tsx # Signature request display for Bankr/PK/Seed signing
│   ├── Erc7715PermissionConfirmation.tsx # Re-export-only delegated-permission facade
│   ├── Erc7715PermissionEditableControls.tsx # Re-export-only permission-editor facade
│   ├── Erc7715PermissionConfirmation/ # ERC-7715 review, adjustment, and decision domain
│   ├── DelegatedPermissionsSection.tsx # Account-settings grant management/revoke section
│   ├── DelegatedPermissionGrantCard.tsx # Active grant card with copy/explorer actions
│   ├── SiweMessageDisplay.tsx # Human-readable SIWE auth review + raw message disclosure
│   ├── SiweValidationIssues.tsx # SIWE validation issue list
│   ├── TokenHoldings.tsx    # Re-export-only Portfolio/Holdings facade
│   ├── TokenTransfer.tsx    # Re-export-only Transfer facade
│   ├── NativeCalldataDecodeModal.tsx # Send-form native calldata preview (clear-signing + decoder)
│   ├── SeedPhraseSetup.tsx  # Seed phrase generate/import flow (12-word grid)
│   ├── CalldataDecoder.tsx  # Decoded/Raw tab for transaction calldata (eth.sh API)
│   ├── TypedDataDisplay.tsx # Structured typed data display for EIP-712 signatures
│   ├── HideTokenModal.tsx   # Portfolio hide-token confirmation
│   └── shared/
│       ├── AccountTypeIcons.tsx # SVG icons per account type (Robot, Key, Seed, Eye)
│       └── PrivateKeyInput.tsx  # Reusable PK import/generate input with address derivation
├── utils/
│   ├── privateKeyUtils.ts   # generatePrivateKey(), validateAndDeriveAddress()
│   ├── wei.ts               # Wei/Gwei Name Service SDK (forward/reverse .wei/.gwei resolution)
│   └── mega.ts              # MegaNames utility (.mega resolution on MegaETH chain 4326)
├── hooks/
│   ├── useChat.ts           # Chat state management hook
│   └── useEnsIdentities.ts  # ENS/Basename/WNS/GNS/Mega identity resolution + caching hook
├── lib/
│   ├── ensUtils.ts          # ENS/Basename/WNS/GNS/Mega resolution (name, avatar, forward/reverse)
│   ├── ensIdentityCache.ts  # ENS identity cache (chrome.storage.local, 6-hour TTL)
│   ├── erc7715PermissionEditing.ts # Editable ERC-7715 request guardrails
│   ├── erc7715PermissionDisplay.ts # ERC-7715 grant display formatting helpers
│   └── gasFormatUtils.ts    # Gas formatting utilities (formatEth, formatGwei, formatNumber)
├── onboarding.tsx           # React entry point for onboarding page
└── App.tsx                  # Main popup application

public/
├── onboarding.html          # HTML entry point for onboarding page
└── manifest.json            # Extension manifest
```

## Onboarding Flow

When the extension is first installed or reset, users are guided through a step-by-step onboarding wizard in a full-page browser tab.

### Auto-Open on Install

The background service worker listens for the `onInstalled` event:

```typescript
chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === "install") {
    const onboardingUrl = chrome.runtime.getURL("onboarding.html");
    await chrome.tabs.create({ url: onboardingUrl });
  }
});
```

### Onboarding Steps

The onboarding flow varies based on account type selection:

**Step 1: Account Type Selection**

- Choose one initial account in this order: Seed Phrase, Private Key,
  View-only, or Bankr API
- Additional account types can be added later from Settings
- The full-page layout keeps Choose account, Add details, and Secure wallet
  visible in a persistent desktop progress rail

**Step 2a: Bankr Setup** (if Bankr or both selected)

- API key input field
- Wallet address input (supports ENS, Basename, WNS `.wei`, GNS `.gwei`, and MegaNames `.mega` resolution)
- Display name (optional) - allows custom naming like "My Bankr Wallet"
- Links to bankr.bot for API key and terminal

**Step 2b: Private Key Setup** (if PK selected)

- Uses shared `PrivateKeyInput` component (import existing or generate new)
- Auto-derives and displays address
- Display name (optional) - allows custom naming like "My Trading Wallet"
- Security warning about local storage

**Step 2c: Seed Phrase Setup** (if Seed Phrase selected)

- Uses `SeedPhraseSetup` component (import existing or generate new 12-word mnemonic)
- Display name (optional) for the first derived account

**Step 2d: View-only Setup** (if View-only selected)

- Address or supported name input (view-only, no signing key stored)
- Display name (optional)
- The same master-password vault is initialized with the non-Bankr sentinel so
  the account-management authorization model remains consistent

**Step 3: Create Password**

- Password + Confirm password fields (current shared password policy)
- Security warning about password recovery

**Step 4: Success**

- Animated green checkmark
- "You're all set!" message
- Floating arrow pointing to extension area
- "Pin & click the extension" instruction

### Tab Auto-Close

When the user opens the extension popup after completing onboarding, the onboarding tab is automatically closed:

```typescript
// In App.tsx init()
const onboardingUrlPattern = chrome.runtime.getURL("onboarding.html") + "*";
const onboardingTabs = await chrome.tabs.query({ url: onboardingUrlPattern });
for (const tab of onboardingTabs) {
  if (tab.id) {
    chrome.tabs.remove(tab.id).catch(() => {});
  }
}
```

**Note**: This requires the `tabs` permission in manifest.json to query and close `chrome-extension://` URLs.

### Already Configured Check

`getOnboardingInitializationStatus` asks the service worker to verify a
structurally complete wallet: at least one account, a valid credential/master
wrapper shape, and every private/seed account backed by the required encrypted
key/group records. It does not infer completion from one ciphertext key. A
complete wallet goes directly to success without exposing account secrets.

### Transactional Fresh-Wallet Initialization

The policy-free `onboardingInitialization.ts` facade exposes the focused
`onboarding/state.ts`, `onboarding/lifecycle.ts`, and
`onboarding/credential.ts` boundaries. Together they prevent crashes, reloads,
or two onboarding tabs from leaving an invisible generated key/phrase or a
half-configured wallet:

1. `beginOnboardingInitialization` distinguishes authoritative wallet state
   (credentials, key wrappers, passkey records, PK/mnemonic vaults, accounts,
   and seed groups) from disposable pre-marker residue. Any unmarked
   authoritative state fails closed and requires explicit recovery/reset; it is
   never deleted as presumed setup debris. If no authoritative state exists,
   old dapp permissions, pending/result routes, wallet-scoped caches, session
   recovery, and synced account mirrors are cleared before the non-secret
   `{ version: 1, id, startedAt }` marker is written. Unrelated preferences are
   preserved, so ENS/avatar cache writes from the seed-address preview cannot
   strand a genuinely fresh setup.
2. The initial general vault-key wrapper and encrypted credential commit in one
   `chrome.storage.local.set()`. Subsequent account/seed mutations must still
   own the same initialization ID.
3. Generated private keys and mnemonics are staged in renderer memory and shown
   for backup before persistence. The background save routes have no hidden
   generation fallback.
4. Completion removes the marker only after the full wallet is structurally
   complete. If that housekeeping removal fails, later status checks recognize
   the complete wallet and remove only the marker—they never roll keys back.
5. Before the marker is written, WalletConnect sessions/pairings are torn down
   and its SDK storage namespace is rotated. Failure to persist that cutover
   aborts setup before any new credential exists, so an older wallet's peer
   sessions cannot attach to the replacement wallet.
6. The owning surface may roll back its incomplete transaction; another live
   onboarding surface is blocked. An abandoned marker becomes recoverable after
   15 minutes. Rollback, completion, manual lock, and secret/account mutations
   share the wallet-secret operation serializer so stale work cannot resurrect
   removed state.

The v0.x single-account migration lives in `accounts/legacyMigration.ts`. Both
the `onInstalled` path and the renderer safety-net serialize through the wallet
secret-operation lock and re-read storage inside it, so overlapping invocations
cannot commit different account IDs. `getActiveAccount()` also repairs a stale
or missing `activeAccountId` left by older builds by selecting the first intact account;
valid Bankr, private-key, seed, and view-only selections are never changed. A malformed
legacy sync address fails closed without creating an unusable account row or
deleting the encrypted credential.

### Build Configuration

The onboarding page has its own Vite build config:

| Target     | Config File               | Output                        |
| ---------- | ------------------------- | ----------------------------- |
| Onboarding | vite.config.onboarding.ts | build/static/js/onboarding.js |

Build command: `pnpm build:onboarding` (included in `pnpm build`)

## dapp3 ENS Browser

WalletChan includes the dapp3 ENS browsing resolver inside the extension. The
More screen exposes `dapp3 Browser`, which opens the standalone extension page
`browse.html` in a browser tab. That page is a WalletChan-branded search-bar
launcher accepting a normal `https://` URL, `.eth` name, `.gwei` name, or raw
`0x` contract address, with optional path/query/hash suffixes. It is
intentionally not rendered inside the popup. Ordinary HTTPS URLs navigate
directly; credentials, HTTP URLs, malformed URLs, and inputs over 2,048
characters fail closed.

The launcher intentionally reuses the same resolver path as address-bar
browsing:

1. `pages/Dapp3Browser.tsx` parses input using the dapp3 launcher rules:
   - `name.eth[/path]` -> `http://name.eth[/path]`
   - `name.gwei[/path]` -> `http://name.gwei[/path]`
   - `0x<address>[/path]` -> `https://0x<address>.w3eth.io[/path]`
   - pasted `*.eth.limo`, `*.eth.link`, `*.gwei.domains`, `*.w3eth.io`, and
     `0x<address>.1.w3link.io` gateway URLs are normalized back to the
     underlying ENS/GNS/address target.
   - other valid `https://` URLs navigate directly without entering the
     resolver/interstitial path.
2. Resolver-backed inputs navigate the current browser tab to
   `interstitial.html#<target-url>`.
3. `EnsInterstitial` parses the fragment and sends `ens-cache-check` followed
   by `ens-resolve` to the service worker.
4. `ensBrowsing/resolver.ts` is the stable resolver facade.
   `resolverSupport.ts` owns the bounded direct RPC client and Ethereum mainnet
   Universal Resolver `resolveWithGateways` call. `nameResolvers.ts` resolves
   ENS `contenthash` records so CCIP-Read / ENSv2-backed names such as
   `.base.eth` can expose IPFS/IPNS content. If no supported contenthash is
   present, it falls back to viem `getEnsAddress` (same Universal Resolver
   path), while `erc4804Resolver.ts` probes, fetches, pins, and caches ERC-4804
   / ERC-5219 onchain HTML via the resolved address. `.gwei` names resolve
   through the GNS NameNFT resolver contract on Ethereum mainnet by reading
   `contenthash(namehash(name.gwei))` directly; `.gwei` supports IPFS/IPNS
   contenthashes only, with no ERC-4804 fallback.
5. The service worker chooses either the hosted gateway (`eth.limo`,
   `gwei.domains`, or `w3eth.io`) or the configured local Kubo gateway based on
   the existing `ensBrowsing` settings. Raw `0x` address mode follows the same split:
   `pinOnchainHtml` OFF probes support and routes to hosted `w3eth.io`;
   `pinOnchainHtml` ON fetches and pins the HTML body to local Kubo.
   Local Kubo API calls use a 10-second abort and a 64 KiB streaming response
   cap, so a non-Kubo or malicious localhost service cannot pin the service
   worker indefinitely or feed an unbounded control response.
   Navigations to w3link's mainnet pattern (`0x<address>.1.w3link.io`) are
   also redirected to the interstitial and normalized into this raw-address
   path when ENS browsing is enabled.
6. Local Kubo pages load `static/js/ens-banner.js`. Its source entrypoint,
   `chrome/ensBanner.ts`, only initializes `ensBrowsing/banner/controller.ts`.
   The banner's restricted input grammar and page metadata live in
   `pageState.ts`; exact runtime requests in `transport.ts`; bookmark and
   hosted-gateway behavior in dedicated action modules; and closed-shadow DOM,
   styling, and SPA synchronization in view/controller modules. The content
   script still performs no name resolution, remote fetch, DNR mutation, or
   script evaluation. Hosted gateway navigation continues through
   `ens-open-on-gateway` so the authorized service-worker path installs the
   per-tab bypass before navigation.

Hosted-gateway redirect rules are deliberately conditional. The base `.eth` /
`.gwei` and w3link rules are installed whenever ENS browsing is enabled. The
`*.eth.limo` / `*.eth.link` and `*.gwei.domains` rewrites are installed only
when `useLocalGateway` is ON, because WalletChan's hosted fallback already
targets eth.limo or gwei.domains and rewriting that target back to `.eth` /
`.gwei` creates an interstitial reload loop. Before the resolver, cache
fast-path, or content-refresh flow intentionally navigates a tab to eth.limo,
gwei.domains, or w3eth.io, the service worker installs the matching per-tab DNR
ALLOW bypass. That bypass protects tabs from WalletChan's old Dapp3-style
gateway rewrite state after WalletChan has chosen a hosted gateway.

The launcher lists user-pinned `ensBookmarks` entries as "Favorite dapps"
first, ordinary injected sites from `dappPermissions` as "Connected dapps"
second, then the freshest valid `ensResolveCache` entries as "Recently cached
dapps". Favorite cards expose a drag grip that supports mouse, touch, and
keyboard grid reordering. The resulting zero-based `sortOrder` is stored on the
existing non-secret bookmark records; legacy entries remain newest-first and a
new unranked favorite appears before an established custom order. The existing
`ensBookmarks` storage listener keeps open launcher tabs synchronized. The
resolver input also filters connected sites by hostname, title, or
origin while the user types. Connected results use a three-row scroll region so
larger permission sets do not push the rest of the launcher out of view.
`browse.html` obtains the permission list only through the narrow
`ens-list-connected-dapps` route: `ensBrowsing/senderAuthorization.ts` requires
the exact top-level launcher, and `connectedDapps.ts` returns at most 24
origin-derived hostnames with bounded title, sanitized favicon, and last-used
time. It never returns account addresses or arbitrary permission fields.
Connected-site tiles open canonical HTTPS origins in a new active tab through
the same exact-launcher route used by directory results; legacy HTTP origins
retain same-page navigation. Their
hover/focus actions can create a non-secret favorite or disconnect the exact
origin through `ens-revoke-connected-dapp`. That mutation is also restricted to
the exact top-level launcher and delegates to the same complete revocation
lifecycle as More → Connected dapps, including pending-request cancellation,
tab account cleanup, page notification, and permission-change broadcast.
Favoriting adds a normalized HTTP(S) `launchUrl` to the existing bookmark
record; permission revocation never deletes that bookmark, so it remains until
the user explicitly removes it from Favorite dapps.
ENS/GNS/onchain tile clicks still submit the name/address back through the same
interstitial path rather than constructing gateway URLs in the page. Gateway
visits can attach optional title/favicon metadata to the cache. Favorite cards
replace the generic saved-state caption with the normalized hostname or
resolver name/path. Local IPFS/IPNS favicon paths are remapped onto the matching
public eth.limo, gwei.domains, or w3eth.io gateway before crossing the raster
cache. When Chrome has already rendered the exact local gateway page's favicon,
the banner stores Chrome's `/_favicon/` projection for that page instead. The
launcher accepts the same processed projection for exact `*.eth.limo`,
`*.eth.link`, `*.gwei.domains`, and `*.w3eth.io` hosted gateway pages. This
allows inline SVG favicons to appear without assigning SVG metadata to the
extension DOM. Missing icons fall back to the hosted gateway `/favicon.ico` and
then a letter tile. Raw `0x` ERC-4804 address-mode resolutions are cached here too so
onchain HTML dapps opened without ENS still appear in the recent tiles.

The same input also performs a 250 ms debounced directory lookup using the
DefiLlama endpoint already used by the website OS page. Only the exact
top-level `browse.html` page can send `ens-search-dapp-directory`. The service
worker normalizes the query to 120 characters, posts it to the exact
`https://search-core.defillama.com/multi-search` endpoint with a 5-second
deadline and 64 KiB response cap, and returns no more than eight bounded
name/HTTPS-route/sanitized-logo records. The key is the public DefiLlama search
client key: the background build accepts `VITE_DEFILLAMA_SEARCH_KEY` or
`NEXT_PUBLIC_DEFILLAMA_SEARCH_KEY` and otherwise reuses the website OS
`NEXT_PUBLIC_DEFILLAMA_SEARCH_KEY`; it is not delivered to the browser-page
renderer. Arrow keys cycle suggestions, Escape dismisses them, and Enter opens
the active result (or the first directory match for free-text searches).
Suggestion activation sends `ens-open-dapp-url`; the exact top-level launcher
is retained while the bounded credential-free HTTPS result opens in a new
active tab. Each suggestion exposes an independent hover/focus star action.
That action stores or removes an origin-normalized ordinary-dapp bookmark and
does not open the suggestion; the existing bookmark storage listener promotes
it into Favorite dapps immediately.
Suggestion and tile logos then use `ens-cache-browser-image`, an exact
top-level-`browse.html` route into the shared avatar raster cache. The page
shows only the decoded/re-encoded data URL written by that cache and never
assigns the DefiLlama or favicon URL directly to an image element.

Bookmark/cache storage listeners plus connected-permission runtime, storage,
focus, and visibility reconciliation keep an open launcher current without a
manual reload.

The launcher keeps a bookmark-page reminder fixed to the viewport's upper-right
corner and shows the platform-native bookmark shortcut. Dismissing it writes
only the non-secret
`walletchan:browseBookmarkReminderDismissed:v1` DOM-localStorage flag; it does
not request Chrome's broad bookmarks permission or invoke a privileged route.

Renderer dapp identity uses the shared display-only
`lib/dappOriginDisplay.ts` projection and `useDappOriginDisplay.ts` storage
adapter. When an exact HTTP origin matches the user's configured Kubo
subdomain gateway host **and port**, the projection matches its IPFS/IPNS label
against retained `ensResolveCache` metadata and displays the original `.eth`,
`.gwei`, or raw `0x` ERC-4804 identity. The storage adapter keeps browser
cards, connection and signing prompts, pending requests, delegated permissions,
activity, and transaction details synchronized after cache or gateway-setting
changes. Resolver records older than the one-hour navigation TTL may be used
for this label only; they are never restored to the navigation cache path.
Exact `*.eth.limo` and `*.eth.link` hosts are also projected back to their
underlying `.eth` identity. That hosted match, or a cached local IPFS/IPNS
match, is the sole renderer eligibility signal for the connection prompt's
contenthash-history lookup; ordinary sites, lookalike suffixes, `.gwei`, and
ERC-4804 address-mode pages do not trigger it.
The same projection supplies favicon sources across those surfaces: a safe
cached raster or processed Chrome favicon first, a local asset path projected
onto the matching public eth.limo/gwei.domains/w3eth.io gateway next, Chrome's
fixed-size `/_favicon/` endpoint for the exact local page as fallback, and then
the public favicon service or letter tile. Inline SVG page favicons remain
excluded from renderer image sources. `DappSiteIcon`, `RequestIdentity`, batch
call identities, pending requests, activity, and watch-asset prompts all
consume this shared order rather than resolving local dapp icons independently.
The underlying origin remains unchanged everywhere authorization, SIWE checks,
permission revocation, history persistence, or tab navigation depends on it.

On local-gateway pages, the injected WalletChan · Browser banner links its left
logo/title cluster to `browse.html` in the same tab. The right side includes a
star button that writes/removes a local `ensBookmarks` entry for the current
ENS/GNS/address identity and path. Bookmarks store only non-secret display
metadata such as title and favicon; connected-site favorites may additionally
store their normalized HTTP(S) origin.

No wallet credentials are used by this flow. It reads the bounded public
display projection of exact-origin dapp grants, reads Ethereum mainnet via the
configured RPC, and optionally writes non-secret ENS / ERC-4804 caches and
bookmarks.

## Transaction Flow

### 1. Dapp Discovers & Connects to Wallet

Modern dapps (EIP-6963):

```javascript
// Dapp listens for wallet announcements
window.addEventListener("eip6963:announceProvider", (event) => {
  const { info, provider } = event.detail;
  // info.name === "Bankr Wallet"
  // provider is the EIP-1193 provider
});

// Dapp requests wallets to announce
window.dispatchEvent(new Event("eip6963:requestProvider"));
```

Legacy dapps:

```javascript
// Direct access to injected provider
const provider = window.ethereum;
```

### 2. Dapp Initiates Transaction

```javascript
// Dapp calls (works with both EIP-6963 provider or window.ethereum)
await provider.request({
  method: "eth_sendTransaction",
  params: [
    {
      to: "0x...", // null for contract deployment
      data: "0x...",
      value: "0x0",
      // Optional gas params (forwarded through full pipeline if present):
      // gas, gasPrice, maxFeePerGas, maxPriorityFeePerGas
    },
  ],
});
```

**Contract Deployment**: When the `to` field is `null` (not address zero), the transaction is treated as a contract deployment. This is supported across both Bankr API and Private Key accounts. The confirmation UI shows a "Contract Deployment" badge instead of a recipient address.

**Gas Parameters**: Dapp-provided gas fields (`gas`, `gasPrice`, `maxFeePerGas`, `maxPriorityFeePerGas`) are forwarded through the full pipeline (impersonator → inject → background → pending storage). These are used as defaults in gas estimation and sent to the Bankr API or local signer.

### 3. Impersonator Validates & Forwards

`src/chrome/provider/inpage/transactionAdapter.ts`:

- Validates chain ID is in allowed list (1, 137, 8453, 130)
- Creates unique transaction ID
- Allows `to` to be null for contract deployment transactions
- Forwards dapp-provided gas parameters (`gas`, `gasPrice`, `maxFeePerGas`, `maxPriorityFeePerGas`) if present
- Posts message to content script
- Returns Promise that resolves when tx completes

### 4. Content Script Bridges to Background

`src/chrome/provider/contentBridge/signingRoutes.ts`:

- Receives `i_sendTransaction` message
- Generates a unique `txId` (UUID) in the content script
- Immediately starts watching `chrome.storage.onChanged` for a `txResult:{txId}` key (via `waitForStorageResult`)
- Sends a **fire-and-forget** `chrome.runtime.sendMessage` to background (no callback) with the `txId` included
- When the storage result appears, forwards it back to inpage via `postMessage`
- Installs no age-based timeout. The listener remains active until the user or
  an explicit authorization/session/account/reset lifecycle resolves the
  request and publishes its durable terminal result.
- **Security**: Only forwards whitelisted message types from background to the webpage (`setAddress`, `setChainId`, `setAccount`). All other background broadcasts are not forwarded, preventing dapps from eavesdropping on wallet events.

> **Why no sendMessage callback?** Chrome MV3 swallows `sendResponse` calls when multiple `onMessage` listeners exist across extension contexts (background + popup/sidepanel). The storage-based approach is immune to this because it bypasses the message channel entirely.

### 5. Background Stores Pending Transaction & Opens the Request Surface

`src/chrome/background.ts`:

- Uses the `txId` provided in the message (generated by content script)
- Validates and normalizes `tx.value` through `src/chrome/transactionValidation.ts`; malformed values write a `txResult:{txId}` error and are not stored as pending requests
- Stores pending transaction in `chrome.storage.local`
- Updates extension badge with pending count
- Opens the configured confirmation surface for user confirmation. On browsers
  with side-panel support, missing `sidePanelMode` defaults to enabled; an
  explicit `false` preserves popup mode. When enabled, the content bridge sends
  `openProviderRequestSidePanel` synchronously from the original user gesture
  for dapp connection prompts, single transactions, ERC-5792 batches, signatures, and
  `wallet_requestExecutionPermissions`. Before sending that presentation-only
  signal, `contentBridge/requestSurfacePreflight.ts` synchronously reuses the
  bounded provider envelope validation plus the content-script-attested active
  chain, connected-origin state, account address, and account type. Connection
  preflight requires an unconnected `eth_requestAccounts` call with a valid
  active account; `eth_accounts` remains non-interactive. Invalid
  payloads, disconnected origins, stale/wrong-chain requests, unsupported
  batch versions, ineligible ERC-7715 account types, and signer/`from`
  mismatches therefore return through the normal provider error. Signature
  preflight also runs the complete bounded EIP-712 schema/raw-delegation policy
  and requires a finite typed-data `domain.chainId` to match the request's
  active chain, mirroring every synchronous signature rejection before storage.
  Batch preflight mirrors wallet-type/chain support, caller binding, and unsafe
  self-recursion policy. ERC-7715 preflight mirrors request count, account type,
  supported delegate chain, address binding, permission data, and rule policy
  before its network-backed delegation eligibility checks.
  These failures return without opening a sidepanel or recording a loading
  hint. The background
  repeats all validation authoritatively before persistence. The early signal
  still runs before authorization or storage awaits can consume Chromium's
  transient user activation. This policy is identical in normal and fullscreen
  browser windows. If a fullscreen
  side-panel open still fails after the gesture is consumed, WalletChan leaves
  the dapp in place and shows a native notification whose click retries the
  panel open with a fresh user gesture.
- The synchronous open also records a ten-second, window-scoped, one-shot
  request-family hint. A cold popup/sidepanel consumes it through the trusted-UI
  `getProviderRequestSurfaceHint` route before loading the five approval queues.
  If the hinted queue is not persisted yet, `app/initialApprovalRequests.ts`
  keeps the request-shaped skeleton visible and polls only that queue for up to
  five seconds. `app/lazyScreens.ts` simultaneously preloads the hinted review
  chunk. As soon as the matching durably pinned request and current lock state
  are available, `app/initialApprovalRoute.ts` selects that exact review family
  and releases the skeleton; homepage, WalletConnect, secondary request,
  account-list, and active-dapp hydration continue concurrently behind the
  visible review. ERC-5792 intake persists its pinned request with
  `intakeStatus: "validating"` before any network-backed atomic-delegate probe,
  so the actual batch review paints immediately. Confirm, edit, split, move,
  and reject-all controls remain unavailable until transport/capability
  validation, the bundle-status commit, and final authorization revalidation
  succeed and atomically remove that marker. The request's own Reject action
  remains available during gas estimation and provisional intake; removal wins
  safely if it races validation. Bankr and both local wallet paths
  also reject a validating record in the service worker, so renderer state can
  never make the provisional prompt actionable. Successful request persistence clears any hint the
  renderer did not already consume. The renderer therefore never paints Home
  between panel open and the transaction, batch, signature, or ERC-7715 review
  screen. The hint contains no request payload, origin, account, or
  authorization data and can never produce an actionable confirmation by
  itself.

### 6. Confirmation Surface Auto-Opens

The extension automatically opens the configured confirmation surface when a
single transaction, batch transaction, signature, or ERC-7715 permission
request is received:

- Popup positioned at **top-right of the dapp's browser window**
- Works correctly across **multiple monitors** (follows the dapp's window)
- Sidepanel mode opens the panel in both normal and fullscreen Chrome windows;
  explicit popup mode and unsupported browsers retain the popup path
- If popup already exists, focuses the existing window instead of creating a new one
- Shows the **newest transaction** by default (e.g., "2/2" not "1/2")

### 7. User Confirms Transaction in Popup

`src/App.tsx` + `src/components/TransactionConfirmation.tsx`:

- If wallet locked (API key not cached): shows unlock screen first
- Shows pending transaction banner if requests exist
- Displays: origin (with favicon), network, to address (with labels), value, data
- **Gas estimation** fetched on mount via `estimateGas` message to background (see Gas Estimation below)
- User clicks Confirm or Reject
- Closing popup does NOT cancel transaction (persisted)

#### Address Labels

The "to" address displays labels fetched from eth.sh API:

```typescript
const response = await fetch(
  `https://eth.sh/api/labels/${tx.to}?chainId=${tx.chainId}`,
);
const labels = await response.json();
// Displays as badges below the address (e.g., "Uniswap V3: Router")
```

#### Multiple Transaction Handling

When multiple transactions are pending:

- **Navigation**: Arrow buttons (`<` `>`) to switch between transactions
- **Counter**: Badge showing position (e.g., "2/2")
- **Reject All**: Button to reject all pending transactions at once
- **Header Layout**: Back arrow (left) | "Tx Request < 2/2 >" (center) | "Reject All" (right)

Each transaction maintains its own storage-based result channel (`txResult:{txId}`) — rejecting/confirming one transaction only affects that specific dapp's request.

### 7. Background Submits to Bankr API

`src/chrome/bankr/submission.ts`:

- POST to `https://api.bankr.bot/wallet/submit` with transaction object and `waitForConfirmation: true`
- Synchronous response — returns tx hash directly (no polling needed)
- Value converted from hex to decimal string (wei)
- Drops dapp-provided gas params on this path because Bankr manages gas server-side; gas overrides apply only to local-signing PK/Seed accounts

### 8. Result Returned to Dapp

- Transaction hash returned directly from `/wallet/submit` response
- Background writes result to `chrome.storage.local` under key `txResult:{txId}` (via `writeResultToStorage`)
- Content script's `chrome.storage.onChanged` listener picks up the result and forwards it to the inpage provider
- Dapp receives the tx hash from `eth_sendTransaction`
- Content script removes the `txResult:{txId}` key after reading

## WalletConnect Bridge

WalletConnect support is a parallel dapp transport for sites that do not list WalletChan through ERC-6963. It intentionally reuses the same pending request and confirmation machinery as the injected provider.

**UX flow:**

1. Popup → More → WalletConnect.
2. User pastes a `wc:` URI from the dapp.
3. Background `walletConnectPair` pairs through `@reown/walletkit`.
4. The service worker auto-approves the session for the current active signing account and visible chains.
5. Active sessions render on `WalletConnectView`. While any session exists, the home screen shows `WalletConnectBanner` below the pending-request banner.

**Background modules:**

- `walletConnect/client.ts` owns WalletKit initialization, generation-bound SDK listeners, relay recovery, and reset cutover. `sessionCommands.ts` exposes the four UI-only list/pair/disconnect/switch operations; `resultBridge.ts` delivers final `txResult:*`, `sigResult:*`, and `erc7715PermissionResult:*` values without creating another signing path.
- `walletConnect/proposal.ts` normalizes and bounds proposal metadata. `sessionProposal.ts` applies signing-account and visible-chain namespace policy before approval. Proposals with no approvable namespace are rejected and a sanitized `walletConnectProposalRejected` summary is broadcast for the UI.
- `walletConnect/requestRouter.ts` claims and validates every `session_request` before dispatch. `pendingRequests.ts` alone creates pinned transaction/signature confirmation records, keeping account binding and popup effects out of the method router. Duplicate in-flight requests receive `-32002`; stored terminal results replay exactly.
- `walletConnect/batchRequests.ts` adapts ERC-5792 methods to `batchTxHandlers.ts`; `rpcRequests.ts` owns chain mutation and allowlisted bounded read-only RPC forwarding.
- `walletConnect/protocol.ts` persists the first terminal JSON-RPC response before relay delivery. `outbox.ts` replays retained terminal responses and removes them only after successful delivery or confirmed session absence. `sessionPolicy.ts` owns CAIP/account/method rules and sanitized bounded peer metadata.
- `walletConnect/chainState.ts` maintains the WalletConnect-specific `walletConnectChainId`, separate from injected per-tab state, and emits supported `chainChanged` events.
- `walletConnect/keepalive.ts` sends the active-session relay fetch pulse while at least one session exists; it has no credential or wallet-secret dependency.
- `walletConnect/storage.ts` owns the bounded durable claim/route/terminal map and active WalletConnect chain key. Claim-to-route transfer is atomic and the first terminal response wins.
- `walletConnect/reset.ts` tears down sessions/pairings, purges the current SDK
  store best-effort, and commits a fresh `walletConnectStorageNamespace` before
  wallet reset removes secrets. Existing installs with no namespace continue
  to use WalletConnect's legacy unprefixed store until reset; a present
  malformed namespace fails closed rather than silently selecting that legacy
  identity.

**Environment:** WalletConnect uses `VITE_WALLETCONNECT_PROJECT_ID` (or `VITE_WC_PROJECT_ID`) when provided, and otherwise falls back to WalletChan's default public WalletConnect project ID.

**Supported request behavior:**

- `eth_sendTransaction` uses the same confirmation screens and Bankr/PK/Seed signing paths as injected dapp transactions.
- ERC-5792 batching is supported over WalletConnect through `wallet_getCapabilities`, `wallet_sendCalls`, `wallet_getCallsStatus`, and `wallet_showCallsStatus`. `wallet_sendCalls` responds with the bundle id only after the pending request and status are durably queued and the live session is revalidated; the response is persisted before relay delivery so a delivery retry returns the same bundle id without enqueueing a second batch. The dapp polls `wallet_getCallsStatus` just like the injected-provider route. Each inner call's native `value` is normalized through `transactionValidation.ts` before the batch is stored; malformed values return a `batchTxAck` error and older malformed pending batches are blocked in the confirmation UI.
- `personal_sign`, `eth_signTypedData_v3`, and `eth_signTypedData_v4` use the same signature confirmation screens. EIP-712 validation/sanitization is shared with the injected-provider path.
- `eth_sign` and deprecated `eth_signTypedData` v1 are rejected.
- `eth_accounts`, `eth_requestAccounts`, `eth_chainId`, `net_version`, `wallet_switchEthereumChain`, and a small read-only RPC allowlist are answered directly in the background.
- WalletConnect chain selection is shared across all WC sessions, not per browser tab. Injected dapps continue to use their existing per-tab content-script chain state.

**Security model:** WalletConnect is a transport only. Request account binding is still pinned at arrival (`accountId`, `accountAddress`, `accountType`), and confirm-time signing resolves the pinned account rather than the currently active account. View-only impersonator accounts cannot approve sessions or sign requests.

### Swap API and token metadata

Swap eligibility follows the exact chain IDs checked in 0x's **Swap and
Gasless APIs** table. `chainRegistry.ts` derives `ZEROX_SUPPORTED_CHAIN_IDS`
from built-in `isSwapSupported` flags, while the website price and quote
proxies share `api/swap/supportedChains.ts`. The separate 0x Cross-Chain API
table is not evidence of single-chain Swap API support; accordingly, Blast and
Mode are built-in networks but are not swap-eligible.

`src/chrome/swapApi.ts` is an implementation-free compatibility facade over
the focused `chrome/swap/` domain. The split preserves its released exports,
query construction, error text, response ceilings, RPC fallbacks, storage keys,
TTLs, pinned-token precedence, and approval calldata. See
`chrome/swap/README.md` for ownership and effect flow.

Price and firm quote reads use the fixed WalletChan swap proxy through
`network/boundedHttp.ts`: GET only, redirects rejected, ambient credentials and
referrers omitted, a 15-second deadline, and a 2 MiB response ceiling. Token
catalog responses use the same deadline with an 8 MiB ceiling; token-price
responses use 10 seconds and 64 KiB. Invalid JSON and non-object top-level
responses retain distinct released errors, and remote error/reason strings are
truncated to 1,000 characters.

ERC-20 and Permit2 balance/allowance reads resolve only the extension's
configured chain RPC and use `network/rpcClient.ts` with an 8-second timeout and
no retries. A missing RPC or failed read retains the released zero fallback;
these helpers never sign or broadcast. Approval builders remain pure: standard
ERC-20 approval preserves the requested amount, while Permit2 clamps to
`uint160` and sets the released 30-day expiry.

Token metadata caches remain non-secret and behavior-compatible:
`tokenInfo:{chainId}:{lowercaseAddress}` and positive
`tokenLogo:{chainId}:{lowercaseAddress}` results use 30-day TTLs, while logo
misses use six hours and `swapTokenList:{chainId}` uses 24 hours. Pinned WalletChan
tokens merge at read time so canonical metadata wins without a cache migration.
Negative logo records carry a fallback version; older empty records created
before the deterministic external source are treated as stale immediately.
When the catalog has no ERC-20 logo, the extension asks the address-aware form
of `/api/swap/token-list`; the website verifies the deterministic external
token-icon PNG with a bounded HEAD request before returning its URL. This
fallback also feeds simulation rows, while NFT imagery stays on its separate
metadata path. Cache writes are best-effort; stale token lists remain the
offline fallback.

### Gas Estimation

`src/chrome/gasEstimation.ts` + `src/components/GasEstimateDisplay.tsx`:

Pre-confirmation gas estimation shown on the transaction confirmation screen. Fetches gas limit, EIP-1559 fees, sender balance, and native token USD price.

The historical `gasEstimation.ts`, `feeEstimation.ts`, and
`batchGasEstimation.ts` paths are policy-free compatibility facades. Focused
implementations live under `chrome/gas/`: fee math and fee RPC fallbacks,
single transaction policy/orchestration, and the sequential batch
`eth_simulateV1` -> TxSimulator injection -> independent-estimate fallback
ladder are separately auditable. See `chrome/gas/README.md`.

**Background estimation (`gasEstimation.ts` + `feeEstimation.ts`):**

- Uses viem `createPublicClient` with cached clients (keyed by chainId) and the shared configured-RPC resolver
- Parallel RPC calls: `estimateGas` (gas limit + 20% buffer), `estimateFeeTiers` (EIP-1559 fees from `eth_feeHistory`), `getBalance` (sender balance)
- CoinGecko price fetch with 60s in-memory cache for USD display
- Background CoinGecko service with shared storage-backed cache for native asset prices/logos
- If dapp provided gas params (`gas`, `maxFeePerGas`, `maxPriorityFeePerGas`, `gasPrice`), uses them as defaults and suppresses the tier picker
- Legacy dapp `gasPrice` is treated as the total per-gas price when translated to EIP-1559: `maxFeePerGas = gasPrice` and `maxPriorityFeePerGas = max(gasPrice - baseFee, 0)`. It must never be copied into both fields, which would double-count base fee and falsely block confirmation.
- Returns `GasEstimate` with `dappProvidedGas` flag, optional `tiers` (Slow / Standard / Fast preset fees), and `predictedNextBaseFee`

**Fee estimation (`feeEstimation.ts`):**

`estimateFeeTiers(client, chainId)` is the single source of truth for EIP-1559 fees. It runs `eth_feeHistory` over the last 10 blocks at the 50p reward, applies an IQR outlier filter + zero-tip drop, and emits three tiers: **slow = p25 / standard = p60 / fast = p90** of the cleaned sample. Each tier's `maxFeePerGas` is `predictedNextBaseFee × multiplier + tip` (multipliers: slow 1.25× / standard 1.50× / fast 2.00×). Per-chain priority fee floors prevent the broken-near-zero values that quiet RPCs return on ETH mainnet from producing stuck txs. `estimateFees()` is a thin wrapper that returns the standard tier — used by force-inclusion paths and any caller that doesn't want the picker. The `predictedNextBaseFee` is the EIP-1559 next-block predictor (no decreases — sticky downward to avoid stuck-tx pathology).

**UI component (`GasEstimateDisplay.tsx`) + tier picker (`GasTierPicker.tsx`):**

- Collapsible box showing estimated gas fee in ETH + USD (collapsed) with detailed breakdown (expanded)
- **PK/Seed accounts** with tiers available: 4-button segmented control (Slow / Standard / Fast / Custom) at the top of the expanded panel. Tier selection auto-populates the Priority + Max Fee inputs from the corresponding preset. Last preset choice persists to `chrome.storage.sync.defaultGasTier`.
- **Custom tier** opens the editable Priority + Max Fee + Gas Limit rows. Priority and Max Fee are coupled: editing Priority recomputes Max Fee = predictedNextBaseFee × 1.5 + Priority unless the user has manually edited Max Fee (sticky-edit; flips a `[linked] → [manual]` badge). The relink icon next to the badge restores the formula. Max Fee < Base Fee + Priority blocks Confirm (bubbled to parent via `onValidityChange`).
- **Bankr accounts**: All read-only with "Gas managed by Bankr API" note. Picker hidden.
- **Impersonator accounts**: All read-only. No Confirm button.
- When dapp provided gas params, picker is suppressed and the editable fields show in Custom-style mode.

**Batch tx tier picker (`MultiTxGasEstimateDisplay.tsx`):**

For non-atomic PK/SP batches (and cross-dapp batches), one shared `<GasTierPicker>` at the top applies its Priority / Max Fee uniformly to every call. Per-call gas limit editor stays as before. Atomic Bankr batches keep their server-managed gas UX. Same Custom-tier coupling rules as the single-tx editor.

**Dapp-provided gas as a floor (non-atomic path):** When the input transactions carry a `tx.gas` value (e.g., a swap response from `/api/swap/quote` whose gas was already estimated + buffered server-side), the component clamps each per-call gas limit to `max(simulated × buffer, dapp_tx_gas)` after `estimateBatchGasSequential` returns. This prevents simulator under-estimates — `eth_simulateV1` has been observed ~25% below real need for Uniswap V4-with-hooks swaps on Base, regardless of RPC provider — from silently downgrading a correct API value at signing time. The user can still edit downward in the picker. See `_docs/SWAP.md` ("Gas budgeting") for the full background.

**Ordered local multi-tx broadcast:** Non-atomic PK/SP dapp batches and direct
swap/bridge multi-tx submissions pre-assign sequential nonces, then broadcast
one raw transaction at a time. Each signed tx still carries explicit gas and fee
params so no gas/fee estimation runs during broadcast. If nonce N fails before
the raw tx is accepted, the nonce cache is reset and nonce N+1... rows are
marked failed/skipped instead of being signed; this prevents stale higher-nonce
transactions from executing later after a future user tx fills the gap. If the
RPC may have accepted nonce N but its response was lost, the locally derived
hash is retained as `broadcastUncertain`, the higher-nonce tail is skipped, and
the current row remains pending instead of inviting a retry at another nonce.

**Warnings:**
| Condition | Display |
|---|---|
| `eth_estimateGas` reverts | Red banner: "TX MAY REVERT: {reason}" |
| gas cost + tx value > balance | Yellow banner: "INSUFFICIENT BALANCE FOR GAS" |
| RPC unreachable | Muted text: "Gas estimate unavailable" (non-blocking) |
| CoinGecko fails | ETH amount shown, no USD |
| Invalid user gas input | Red border on field, overrides nullified |

**Gas overrides flow (PK/Seed accounts only):**

```
GasEstimateDisplay → onGasOverrides(overrides) → TransactionConfirmation state
  → confirmTransactionAsyncPK message includes gasOverrides
  → transactions/localExecution.ts merges into tx (clears legacy gasPrice to avoid EIP-1559 conflict)
  → signAndBroadcastTransaction(privateKey, txWithGas, rpcUrl)
```

**Shared utilities (`lib/gasFormatUtils.ts`):** `formatEth()`, `formatGwei()`, `formatNumber()` — extracted from `TxDetailModal.tsx` for reuse.

### Fee-token gas payment (Pimlico ERC-4337 v0.7)

`src/chrome/feePayment/` is the isolated ERC-4337/Pimlico domain for paying a
transaction fee in an address-pinned Pimlico token while retaining the current native-gas path.
The complete architecture and rollout gates are in
[`_docs/GAS_ABSTRACTION.md`](./GAS_ABSTRACTION.md).

The implemented domain contains:

- `constants.ts`: WalletChan's official Stateless DeleGator and its immutable
  EntryPoint v0.7 address;
- `tokens.ts`: address-pinned native/ERC-20 capability catalog. The current
  live-verified matrix is Ethereum (USDC, USDT, stETH, wstETH, WETH), Optimism
  (USDC, USDC.e, USDT, stETH, wstETH), Base/Polygon/Arbitrum (USDC, USDT), BNB
  Chain/Linea (USDT), MegaETH (USDm, USDT0), Monad (USDC, WMON), and USDC on
  Ethereum Sepolia, Optimism Sepolia, Arbitrum Sepolia, and Polygon Amoy. Base
  Sepolia remains native-only because its live quote result is empty;
- `pimlicoTypes.ts`: local v0.7 PackedUserOperation, EIP-7702 authorization,
  quote, paymaster, gas-estimate, and receipt shapes;
- `pimlicoClient.ts`: bounded JSON-RPC transport for token quotes, paymaster
  stub/final data, gas-price tiers, UserOperation estimation/submission, and
  receipts;
- `userOperation.ts`: byte-compatible single/batch DeleGator calldata, v0.7
  packing, the official recoverable estimation stub,
  and `EIP7702StatelessDeleGator` EIP-712 signing;
- `authorization.ts`: converts WalletChan's existing local EIP-7702 signature
  into Pimlico RPC shape and enforces the third-party-sender rule: the tuple
  uses the EOA's current nonce, not the direct type-4 path's `txNonce + 1`;
- `paymaster.ts`: Pimlico singleton-paymaster maximum-cost arithmetic and exact
  selected-token approval construction;
- `prepareUserOperation.ts`: quote -> unsigned dummy-approval simulation ->
  allowance-aware bounded approval -> stub paymaster data -> final gas estimate
  -> signed paymaster data. The signed paymaster response is always applied
  last; no UserOperation field is estimated or mutated afterward. Optional gas
  limits omitted by the final paymaster response preserve the last successful
  estimate instead of being reset to zero.
- `chainState.ts`: configured-RPC reads for the official onchain delegate,
  EntryPoint nonce, EOA authorization nonce, token balance, and paymaster
  allowance;
- `quotes.ts`: 45-second in-memory quotes pinned to request family/id, exact
  calls, account, chain, EntryPoint nonce, and delegation state. Fresh accounts
  use a dummy `eip7702Auth` plus an exact sender-code state override during
  estimation, so the official delegate executes for gas/paymaster simulation
  without creating or exposing a real authorization signature before the final
  Confirm action. The proxy permits only the operation sender and the official
  `0xef0100 || delegate` designator in that override, and never permits an
  override on submission;
- `signing.ts`: local PK/seed EIP-712 signing or Bankr `/wallet/sign` signing,
  with recovered-signer verification inherited from `bankr/signing.ts`;
- `execution.ts` and `batchExecution.ts`: consume a quote once, recheck account,
  nonce, delegation, balance, allowance, and pending-request authorization,
  then sign and submit the exact final UserOperation;
- `submission.ts`: computes the exact EntryPoint v0.7 UserOperation hash,
  persists that hash and public routing fields immediately before broadcast,
  removes it after a definite rejection, and retains it when the submit
  response is outcome-unknown;
- `receiptValidation.ts`: independently fetches the chain receipt and requires
  a matching EntryPoint `UserOperationEvent` for the exact hash and sender
  before Activity or ERC-5792 status becomes terminal;
- `pendingOperations.ts` and `recovery.ts`: serialize bounded recovery-record
  mutations and reconcile deterministic hashes after MV3 restarts without
  persisting calldata, authorization tuples, or UserOperation signatures;
- `capabilities.ts`: native/token eligibility for pinned single and batch
  requests, including precise fresh-account, different-delegate, Bankr, RPC,
  deployment, and unsupported-chain outcomes.

The client accepts only an HTTPS WalletChan proxy URL (localhost is allowed for
development), uses the shared bounded HTTP reader, omits ambient credentials
and referrers, pins JSON-RPC IDs, validates all returned hex/address fields,
rejects unrequested token quotes, and rejects a paymaster address that changes
after quote selection. A Pimlico API key must never be compiled into the
extension.

`FeePaymentSelector.tsx` is shared by normal and ERC-5792 confirmation. It uses
the standard bottom action sheet, keeps native payment as the default, shows
amount, stablecoin fiat equivalence, live balance, and insufficiency for native
and every catalog token, identifies assets with their token logos where available, discloses a one-time
official smart-account upgrade, and disables Confirm until a current
request-pinned quote exists. The parent confirmation owns the completed quote;
the selector derives its displayed maximum and balance from that same object
instead of keeping a second copy. Native and force-inclusion paths remain
unchanged; there is no silent fallback from a failed token operation to native
payment.

The options request reads every catalog-token balance independently of Pimlico quote
preparation, so the action sheet shows each before selection. Once a token is
selected, the compact decision row is reserved for the bounded maximum fee;
the balance is not repeated there. The shared estimating loader is centered
across that row while preparation is pending.

When simulation shows that the requested transaction would spend too much of the selected token
for the paymaster to collect its fee (`AA50 postOp reverted 0x7939f424`), the
confirmation replaces the provider code with recovery guidance: reduce the
transaction amount or choose another fee token. Other provider errors remain
unchanged for accurate diagnosis.

Fee-option discovery has a 10-second renderer deadline and quote preparation
has a 30-second renderer deadline. A missing response invalidates that request,
stops the loading state, and presents an explicit Retry action. Quote errors do
not automatically retry. A per-request attempt guard prevents the renderer
from interpreting the callback's completion render as a new idle request, and
selector rerenders never clear a completed parent-owned quote. A valid quote
remains usable until its actual expiry; expiry disables Confirm and presents
explicit Retry without starting another provider request. While preparation is
pending, the row uses the shared three-shape/dot loader with “Estimating Fees”.
Switching back to native also cancels the renderer's pending quote state.
Provider calls remain independently bounded in the background transport.

Private-key and seed-phrase accounts can attach the one-time official
authorization in the same submitted UserOperation. Bankr accounts use the
remote typed-data signer only when the official delegate is already active;
fresh Bankr accounts receive a precise setup requirement because Bankr does
not expose the special EIP-7702 authorization signer. View-only impersonator
accounts cannot quote or confirm. Contract deployments, cross-dapp custom
batches, swaps, bridges, Max calculations, and force inclusion remain outside
this first execution gate.

The dummy approval uses `uint256.max` only in an unsigned estimation envelope,
matching Pimlico's maintained `permissionless.js` helper. It is always replaced
before typed-data signing: the submitted calls contain either no approval when
the current allowance is sufficient, or `approve(quotedPaymaster,
maximumTokenCost)` for the computed bound. If final paymaster data changes the
bound, preparation rebuilds once and fails closed if the cost does not
stabilize. Every rebuild repeats stub -> estimate -> final paymaster data, so
Pimlico never signs an envelope whose gas fields are subsequently replaced.
Quotes above the selected catalog token's absolute base-unit ceiling are
rejected before signing (100 units for stablecoins and one unit for the
currently enabled non-stable assets).

The website proxy at `/api/gas/pimlico/[chainId]` keeps `PIMLICO_API_KEY`
server-side and is policy-constrained rather than a general authenticated RPC.
Its `tokens.ts` mirrors the extension's exact chain/token address catalog. It
pins every allowed method to WalletChan's EntryPoint and that catalog, bounds
bodies/time/rate, and authenticates submission by recovering the
exact WalletChan sender EIP-712 signature before forwarding
`eth_sendUserOperation`. Attached 7702 authorizations must cryptographically
recover to that same sender and use the official delegate and exact route
chain. `PIMLICO_PROXY_DISABLED=true` is the operational kill switch.

Every built-in EVM chain addition runs the Pimlico discovery and live-quote
gate in `.agents/skills/walletchan-chain-research/SKILL.md`. The extension fee
catalog and website proxy catalog must change together; the fee-payment token
test compares their normalized chain/address sets so one-sided updates fail.

## Signature Request Handling

Signature support differs by account type:

| Account Type | Signature Support                        |
| ------------ | ---------------------------------------- |
| Bankr API    | ✅ Via `/wallet/sign` API                |
| Private Key  | ✅ Full support (sign locally with viem) |
| Seed Phrase  | ✅ Full support (sign locally with viem) |
| Impersonator | ❌ Disabled (view-only)                  |

When dapps request signatures, the extension displays the request details. For Bankr accounts, signing is handled via the `/wallet/sign` API endpoint. For Private Key and Seed Phrase accounts, signing is done locally with viem. Impersonator accounts can only reject.

### Supported Signature Methods

| Method                 | Description                      |
| ---------------------- | -------------------------------- |
| `personal_sign`        | Sign a plain text message        |
| `eth_sign`             | Sign arbitrary data (deprecated) |
| `eth_signTypedData`    | Sign typed data (EIP-712)        |
| `eth_signTypedData_v3` | Sign typed data v3               |
| `eth_signTypedData_v4` | Sign typed data v4               |

### Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      Signature Request Flow                                  │
│                                                                             │
│  1. Dapp calls personal_sign, eth_signTypedData_v4, etc.                    │
│  2. Impersonator creates pending promise with sigId                         │
│  3. Request forwarded to background via content script                      │
│  4. Background stores in pendingSignatureRequests storage                   │
│  5. Popup/sidepanel shows SignatureRequestConfirmation                      │
│  6. User action depends on account type:                                    │
│     ┌─────────────────────────────────────────────────────────────────┐    │
│     │  Bankr API Account:                                              │    │
│     │    - SIGN and REJECT buttons shown                               │    │
│     │    - Sign: Calls POST /wallet/sign with message/typedData        │    │
│     │    - Signature returned to dapp                                  │    │
│     ├─────────────────────────────────────────────────────────────────┤    │
│     │  Private Key / Seed Phrase Account:                              │    │
│     │    - SIGN and REJECT buttons shown                               │    │
│     │    - Sign: Signs message locally using viem                      │    │
│     │    - Signature returned to dapp                                  │    │
│     └─────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────┘
```

### UI Display

The SignatureRequestConfirmation component shows:

- The standard request header and shared combined-queue controls
- Centered requesting-app identity via `RequestIdentity`
- A plain-language signature summary before any raw data
- Readable personal-message, SIWE, clear-signed, delegation, or structured
  EIP-712 fields as the primary content
- Network, method, raw payload/parameters, typed-data domain/types, and hashes
  under the shared Advanced details disclosure
- The same compact `Signing with` footer geometry as transaction requests
- Secondary Reject and amber `brand` Sign actions in `StickyActionBar`

The flat `SignatureRequestConfirmation.tsx` path is a compatibility facade. The
implementation and presentation modules live in
`components/SignatureConfirmation/`; they compose `ConfirmationScreen`,
`RequestConfirmation/QueueNavigation`, `RequestIdentity`, `StickyActionBar`,
and `shared/LabeledAddressPopover` instead of cloning transaction markup.

External ERC-7710 `Delegation` typed-data requests are rejected before they are
stored as pending signatures. Dapps must use ERC-7715 permission methods
instead; WalletChan-generated delegation signing must stay on an internal path.

**For Bankr API Accounts:**

- Sign button (yellow): Signs via `/wallet/sign` API
- Reject button (white/secondary): Cancels the request

**For Private Key / Seed Phrase Accounts:**

- Sign button (yellow): Signs the message locally
- Reject button (white/secondary): Cancels the request

### SIWE Validation and Display

`personal_sign` messages that match EIP-4361 ("Sign-In With Ethereum") are parsed
with `src/lib/siwe` and rendered by `SiweMessageDisplay` instead of the generic
raw-message block.

**Human-readable display:**

- "Sign in to {domain}" summary followed by the SIWE statement
- URI, issued/expiration times, request ID, nonce, and resources without
  repeating the already-visible requesting site, pinned signer, or network
- Validation status and issue list
- Raw SIWE message and request parameters inside shared Advanced details

**Validation performed:**

1. EIP-4361 required structure and field ordering
2. Domain, address, URI, version, chain ID, nonce, and RFC 3339 timestamps
3. Expiration / not-before timing
4. Message domain ↔ URI host consistency
5. Connected site origin, connected chain, and signing account match. For
   dapp-originated requests, SIWE uses the Chrome-attested `sender.origin`
   captured as `senderOrigin` when available, falling back to the persisted
   request origin for legacy entries and WalletConnect peers.

Validation is run in the UI for user review and again in
`signatures/confirmationPolicy.ts` before signing for every signing-capable
account type. Both the local and Bankr confirmation handlers consume this same
preflight, so request presence, pinned-account resolution, raw ERC-7710 rejection, signer
matching, and SIWE origin checks cannot drift between transports. If a SIWE
message has validation errors, the Sign button stays disabled until the user
opens the sticky decision-bar warning popover and checks its explicit
acknowledgement checkbox. Confirmation then sends the extension-only `allowUnsafeSiwe`
confirmation flag so the background handler can skip SIWE validation for that
request. The dapp-supplied signer parameter must still match the pinned account;
that check is separate from SIWE validation and is not bypassable.

### Combined Navigation

When both transaction and signature requests are pending:

- Counter shows combined total (e.g., "1/3" for 2 tx + 1 sig)
- Transaction requests appear first in the list
- Navigation arrows allow moving between all request types
- "Reject all" uses App's global queue handler and rejects transactions,
  batches, signatures, permissions, and a cross-dapp batch represented by the
  combined counter
- Pending list shows both types with TX/SIG badges

### EIP-712 Validation (v1.4.0+)

Before storing or displaying EIP-712 signature requests, typed data is validated to prevent malicious attacks.

**When**: Before storing in `pendingSignatureRequests`
**Methods validated**: `eth_signTypedData_v3`, `eth_signTypedData_v4`
**Location**: `transactions/requestIntake.ts:handleSignatureRequest()`

**Checks performed**:

1. Schema structure (domain, types, primaryType, message fields exist)
2. Circular reference detection (DFS traversal)
3. Nesting depth limit (50 levels maximum)
4. Type definition conformance (all referenced types exist and are valid)

**On validation failure**:

- Console error with details logged
- Background writes error to `chrome.storage.local` under `sigResult:{sigId}` so the content script picks it up
- Dapp receives: `{ success: false, error: "Data must conform to EIP-712 schema" }`
- No popup shown
- Request not stored in pending signature requests

`eip712Validator.ts` is the stable policy-free facade. Validation ownership is
split under `signatures/eip712/` across `validator.ts` (bounded orchestration),
`delegationPolicy.ts` (raw delegation rejection), `schemaValidation.ts` (pure
graph/type checks), and `sanitization.ts` (schema-only projection). Request
intake owns only the integration and durable rejection result.

**Files**: `eip712Validator.ts` (stable facade),
`signatures/eip712/` (validation policy),
`transactions/requestIntake.ts` (integration)

## Async Transaction Confirmation

When a user confirms a transaction, the extension uses an async flow that allows the popup to close immediately while processing continues in the background.

### Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     Async Transaction Confirmation Flow                      │
│                                                                             │
│  1. User clicks "Confirm" in popup/sidepanel                                │
│  2. Popup sends "confirmTransactionAsync" to background                     │
│  3. Background immediately responds with { success: true }                  │
│  4. Popup behavior:                                                         │
│     - Sidepanel: Navigate back to main view immediately                     │
│     - Popup: Show success animation, then close after 1 second              │
│  5. Background processes transaction in parallel:                           │
│     a. Adds to history with status: "processing"                            │
│     b. Calls Bankr API and polls for result                                 │
│     c. On success: Updates history, shows notification,                     │
│        writes result to chrome.storage.local (txResult:{txId})              │
│     d. On failure: Updates history with error, shows notification,          │
│        writes error to chrome.storage.local (txResult:{txId})               │
│  6. Content script picks up result from storage.onChanged listener          │
│     and forwards to the dapp                                                │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Success Animation (Popup Mode Only)

When confirming a transaction in popup mode, a full-screen success animation is shown:

```typescript
// Animation keyframes
const scaleIn = keyframes`
  0% { transform: scale(0); opacity: 0; }
  50% { transform: scale(1.2); }
  100% { transform: scale(1); opacity: 1; }
`;

const checkmarkDraw = keyframes`
  0% { stroke-dashoffset: 50; }
  100% { stroke-dashoffset: 0; }
`;
```

The animation shows:

- Green circular badge with animated checkmark
- "Transaction Sent" heading
- "Your transaction has been submitted" subtext
- Auto-closes popup after 1 second

In sidepanel mode, the view navigates back immediately without the animation (sidepanel stays open for further interactions).

### Receipt Polling & Flashblocks

After a tx is broadcast, `txReceiptPoller.startReceiptPolling(txId, txHash, chainId)` polls `eth_getTransactionReceipt` until a receipt is found or the 10-minute timeout elapses. Default cadence: 2s initial, 1.5× exponential backoff up to 30s. OP Stack force-inclusion L2 hashes are derived from the confirmed L1 deposit rather than broadcast into the L2 mempool, so a missing `eth_getTransactionByHash` result is expected during derivation and is never classified as a mempool drop. Those hashes receive a 15-minute polling window around the expected 1-10 minute inclusion delay. The fee-bearing L1 deposit receipt is projected into the transaction's existing `gasData` history field as soon as it confirms; derived L2 finalization preserves that record instead of replacing it with the zero-cost L2 deposit receipt. Startup recovery backfills the L1 gas record for older successful force-inclusion entries as well as reopening entries incorrectly terminalized by the former 60-second mempool heuristic.

Local PK/seed broadcasts are prepared and signed exactly once. The transaction
hash is derived from those serialized bytes before the RPC effect. A transport
timeout/disconnect after `eth_sendRawTransaction` is therefore an ambiguous
success, not a definite failure: history stores the deterministic hash plus
`broadcastUncertain: true`. Repeated `eth_getTransactionByHash` misses cannot
classify that row as dropped until an RPC first observes the hash; a receipt or
observed transaction clears the marker. This prevents a user retry from
executing the same approved intent again at a different nonce.

For dapp, WalletConnect, cross-dapp, and force-inclusion local paths,
`prepareSignAndBroadcastTransaction` invokes an async `beforeBroadcast` hook
after RPC preparation and local signing, immediately before the raw send. The
hook re-resolves the pinned account and performs the final transport
authorization/epoch commit before beginning the effect lease. A navigation,
permission revoke, WalletConnect disconnect, account removal, or wallet reset
during transaction preparation therefore discards the signed bytes without
broadcasting them. The shared wallet-secret operation lock is held across
preparation, this final check, and the raw send, so account removal/conversion,
session termination, password change, and reset cannot interleave in the
validation-to-send gap.

Chains marked with `supportsFlashblocks: true` in `CHAIN_REGISTRY` (Base, Unichain, Optimism) get an additional **fast phase**: 250ms polling for the first ~5s before the standard schedule kicks in. This delivers ~250ms user-perceived confirmation. The default RPCs for all three (`mainnet.base.org`, `mainnet.unichain.org`, `mainnet.optimism.io`) are already Flashblocks-aware — `eth_getTransactionReceipt` resolves at Flashblock pace without any URL change. Premium providers (Alchemy, QuickNode, Chainstack) also serve Flashblocks data. On a non-Flashblocks-aware RPC the fast phase is harmless polling overhead — the receipt arrives at the normal ~2s mark and the loop transitions to standard backoff.

To enable Flashblocks for another chain, set `supportsFlashblocks: true` on its `CHAIN_REGISTRY` entry. The `FLASHBLOCKS_CHAIN_IDS` set auto-derives, no other code changes required.

### Sync Send (EIP-7966)

Chains marked with `supportsSyncSend: true` (MegaETH today) skip the receipt poller entirely on local-signed (PK/Seed) txs. `signAndBroadcastTransaction` in `localSigner.ts` signs the tx locally, then posts `eth_sendRawTransactionSync` directly to the RPC — the response is the **full receipt** in a single round trip (~100ms on MegaETH). The receipt is written directly to tx history via `applyReceiptToHistory()` in `forceInclusion/receiptPoller.ts`, no polling.

To avoid an intermediate "pending" flash on the activity tab, all three broadcast call sites (`processLocalTransactionInBackground` in `transactions/localExecution.ts`, `broadcastSwapTxLocal`, and the batch broadcast loop in `batch/batchSequentialExecution.ts`) branch on `result.receipt`: when present, jump straight to the final state via `applyReceiptToHistory`; otherwise mark the tx as `pending` and start the poller. The history's `txHash` field is now also written by `applyReceiptToHistory` so the sync-send path doesn't need a placeholder write.

**MegaETH RPC quirk:** EIP-7966 specifies the `timeout` param as a hex-encoded Quantity (`"0x1388"` for 5000ms), and viem's `sendRawTransactionSync` follows the spec via `numberToHex(timeout)`. MegaETH's RPC rejects this with `Invalid params: timeout must be a positive number` and only accepts a plain integer. We bypass viem's wrapper and call `client.request({ method: "eth_sendRawTransactionSync", params: [serialized, 5000] })` directly. The receipt comes back in raw RPC shape (status `"0x1"`/`"0x0"`, hex bigints) which `applyReceiptToHistory` already normalizes for both viem-formatted and raw receipts.

If the sync call throws or times out (5s), the broadcaster retries the **same
serialized transaction bytes** through `eth_sendRawTransaction`; it never
re-prepares or re-signs. If that fallback response is also lost, the
deterministic local hash is persisted under the ambiguity rules above and
receipt polling continues.

The same path covers ERC-5792 batched txs because the ERC-7821 wrapper is itself a single signed tx. For PK/SP EIP-7702 wrappers, inner `Call.value` amounts stay encoded and visible to the user, but the signed outer EOA self-call uses `value: 0x0` to avoid a redundant native transfer to self. Bankr-API accounts are unaffected (MegaETH is `isBankrSupported: false`).

### Post-confirm Asset Changes Extraction

After a tx confirms successfully, the receipt path fires-and-forgets `extractAndStoreAssetChanges` through the stable `chrome/assetChangesExtractor.ts` facade. The implementation is split under `chrome/history/`: pure ERC-20/ERC-721/ERC-1155 Transfer-log parsing, bounded receipt/balance RPC helpers, asset-change assembly, recent-token/history persistence, and delayed receipt/backfill policy are independently auditable (see `chrome/history/README.md`). Most txs flow through `applyReceiptToHistory` (in `forceInclusion/receiptPoller.ts`). Bankr direct-success paths (`transactions/bankrProcessing.ts`, `transactions/swaps/bankrLeg.ts`, `batch/batchBankrExecution.ts`, and `crossDappBatch/completion.ts`) use the stable `receiptEnrichment.ts` facade to retry `eth_getTransactionReceipt` asynchronously, because Bankr can return `success` before the user's configured RPC has indexed the receipt. For ERC-5792 responses, an immediately available raw receipt is converted to the sanitized `BundleReceipt` shape before storing it for `wallet_getCallsStatus`, while the raw receipt is kept for internal extraction. `TxDetailModal` also sends the extension-only `backfillAssetChanges` message when a confirmed history entry has a `txHash` but no current-version `assetChanges`, so old entries, legacy ERC-20-only snapshots, and service-worker-interrupted retries can repair themselves on open. The extractor:

1. Decodes the receipt's `logs[]` for ERC-20 `Transfer(from, to, amount)` events (topic0 = `0xddf252ad…`, exactly 3 topics — ERC-721 logs have 4 and are skipped naturally) where the lowercased `from` OR `to` matches the sender. Internal pool routing is filtered out.
2. Resolves `symbol/decimals/logoUrl` per unique token via `tokenMetadata.ts`, which shares swap-list, Bungee-list, watched-asset, and hardcoded-logo fallbacks.
3. Computes the sender's pure native-value flow as `balance(blockNumber) - balance(blockNumber-1) + gasCost`, where `gasCost = gasUsed * effectiveGasPrice + (l1Fee || 0)`. The historical-balance call retries up to 3× with 2s backoff to absorb load-balanced RPCs that briefly don't yet know about `blockNumber-1`; if it never resolves, `nativeDelta` is left undefined and the modal silently hides the row. For chains marked `supportsFlashblocks`, receipt-derived history first waits for one following block and verifies that a refreshed receipt's `blockHash` matches the canonical block before using its fee fields. This prevents a preconfirmed L1-fee estimate from surviving as a false native transfer. Opening Transaction details queues one reconciliation per mounted Flashblocks entry, including already-enriched history, so older gas/native snapshots are repaired from the same settled receipt; ordinary-chain snapshots remain immutable.
4. Attempts to seed `recentlyReceivedTokens` (5-minute TTL cache) for every inbound ERC-20 so `loadPortfolioTokenCatalog` (`chrome/portfolio/tokenCatalog.ts`) can inject a synthetic stub into the portfolio before the upstream portfolio API has re-indexed. This happens before the tx-history broadcast when storage succeeds, so Holdings can merge the stub immediately. A seed failure is logged but must not block writing `assetChanges`. The on-chain balance multicall in `TokenHoldings` overwrites balance with the live value; CoinGecko/GeckoTerminal backfills price while `tokenMetadata.ts` backfills any missing symbol/logo.
5. Decodes ERC-721 `Transfer` plus ERC-1155 `TransferSingle`/`TransferBatch` and persists only immutable transfer identity: contract, token ID, standard, amount, direction, and counterparty. NFT token URI, image, and display metadata are never durable history.
6. Writes the versioned `AssetChangeRecord` onto the existing history entry. Missing versions remain readable and are lazily re-enriched. If detailed transfer persistence fails, a best-effort `detailsIncomplete` marker preserves the settled summary without changing transaction success.

For native-flow reconciliation, direct transactions add the sender's outer
transaction gas back to the block-to-block balance delta. USDC-funded ERC-4337
history rows do not: the Pimlico bundler paid that outer gas, so adding its
receipt gas to the wallet's unchanged ETH balance would fabricate an inbound
ETH transfer. Initial extraction, receipt retries, and Activity backfill all
derive this distinction from `feePaymentToken`.

**Bridge destination leg.** When `bridgeStatusPoller.checkAndApplyStatus` sees a destination `txHash` arrive for the first time (`!priorEntry?.bridge?.destinationTxHash`), it fires `extractAndStoreDestinationAssetChanges` against the destination chain's RPC (resolved via `getRpcUrl`). Same decoder, `payerForGas: false` (the receiver didn't pay gas on the dest chain), written to `destAssetChanges`. The modal renders a second `AssetChangesCard` titled "On {destChainName}".

**Refresh wiring.** `updateTxInHistory()` broadcasts only `{ txId, ownerAddress, chainId, changedKeys }`; it never copies the history record or transfer arrays through runtime messaging. Activity refreshes the changed row with `getTxHistoryItem`. Holdings uses the compact identity/change fields for its delayed refresh policy.

**Durable history and lazy details.** IndexedDB database `walletchan-history` stores compact transaction summaries separately from ERC-20/NFT transfer rows. The first history access idempotently imports the released `chrome.storage.local.txHistory` array, then removes that legacy key only after all valid records commit. Settled rows omit full calldata and retain only the selector; NFT rows omit token URI, image, collection, symbol, and token name. Activity uses 30-row indexed cursor pages and an intersection sentinel for automatic loading. Retention keeps at most 1,000 settled entries per account/network and 50 MiB overall, without evicting processing/pending recovery rows. Transaction Details fetches calldata by stored transaction hash through the configured RPC and validates hash/from/to before using it. NFT display metadata is resolved through the configured RPC at the receipt block with latest-state fallback and a 24-hour, 500-entry, 10 MiB best-effort display cache; raw token URI is never sent to the renderer or stored.

Holdings keeps successful RPC balance reads (including zero-balance tombstones) authoritative across subsequent API revalidations. A lagging portfolio response may update token metadata and price, but it cannot overwrite a verified balance or resurrect a token that RPC already reported as zero. Failed per-token RPC reads are never marked authoritative, so a transient RPC error cannot freeze an API fallback as an onchain value. The same overlay is applied to the fast API paint and the detached enrichment pass, preventing either async stage from causing post-confirm balance flicker.

**Failure surface.** Both extraction paths are wrapped in try/catch + `console.warn`. A failing RPC, malformed receipt, or transient storage error must never block the confirmation notification (source path) or the bridge state machine (destination path).

### Per-chain gas buffer

All chains add a 20% buffer on top of `eth_estimateGas` to absorb state changes between estimate and inclusion. The buffer can be overridden per-chain via `gasBufferPct` on the registry entry (default 20). No chain currently overrides it.

### Non-standard gas models (MegaETH)

Some chains use gas accounting that differs from standard EVM. MegaETH uses a [dual gas model](https://github.com/megaeth-labs/mega-evm/blob/main/docs/DUAL_GAS_MODEL.md) — compute gas and storage gas tracked separately, plus SSTORE bucket multipliers that scale storage cost. Locally-computed gas values (dapp-provided, GAS-opcode-based simulation tricks) miss the storage component and systematically under-estimate, causing OOG reverts on storage-heavy ops like ERC20 approve.

Chains with `usesNonStandardGasModel: true` on the registry entry get three behavioral changes that all defer gas computation to the chain's own `eth_estimateGas` (which knows its model and is accurate):

1. **Intake strip** (`transactions/requestIntake.ts` `handleTransactionRequest`): the dapp's `tx.gas` field is removed before storing as a pending request. All downstream code (UI estimation, signing) sees `gas: undefined` and re-estimates via the chain.
2. **Single-tx UI estimation** (`gasEstimation.ts`): `dappGas` is forced to `null` so the standard `eth_estimateGas + 20% buffer` path always runs.
3. **Batch UI estimation** (`batchGasEstimation.ts`): tier 1 (`eth_simulateV1`) and tier 2 (TxSimulator bytecode injection via state override) are skipped. Tier 2 in particular counts gas via the GAS opcode, which only sees compute gas — wrong on dual-model chains. Falls through to tier 3's per-call `eth_estimateGas`. For dependent calls (e.g., swap-after-approve) where the prior call hasn't been broadcast yet, the per-call estimate fails and tier 3's `DEPENDENT_CALL_GAS_LIMIT` (500k) fallback kicks in with `fallbackUsed: true` flagged to the UI.

Fee fields (`maxFeePerGas`, `maxPriorityFeePerGas`, `gasPrice`) are still honored — under-priced fees only delay inclusion, they don't cause reverts.

MegaETH is the only chain with this flag set today.

## Browser Notifications

The extension uses Chrome's Notifications API to alert users when transactions complete while the popup/sidepanel is closed.

### Notification Types

| Event                 | Title                   | Message                                          |
| --------------------- | ----------------------- | ------------------------------------------------ |
| Transaction Confirmed | "Transaction Confirmed" | "Your transaction on {chainName} was successful" |
| Transaction Failed    | "Transaction Failed"    | "Error: {errorMessage}"                          |
| Dapp Chain Switch     | "Switched to {chainName}" | "{origin} switched WalletChan network"         |

**See**: `src/chrome/transactions/notification.ts` -> `showNotification()` for the shared
helper and `src/chrome/background/chainPromptRouter.ts` plus
`background/chainSwitchNotification.ts` for dapp-initiated chain switch
notifications. Chain switch notifications pass the
resolved local chain icon as `iconUrl` when one is available, and fall back to
the WalletChan icon if Chrome rejects the asset.

### macOS Permissions Note

On macOS, Chrome notifications require explicit permission in System Preferences:

- **System Preferences → Notifications → Google Chrome → Allow Notifications**

Without this permission, `chrome.notifications.create()` will execute without error but no notification will appear.

### Manifest Permission

The `"notifications"` permission is required in `manifest.json`.

## Transaction History

Completed transactions (confirmed or failed) are stored persistently and displayed on the homepage.

### Data Model

**See**: `src/chrome/history/types.ts` for the released `CompletedTransaction` interface and `TxStatus` type; `src/chrome/txHistoryStorage.ts` remains the compatibility import path. Each entry tracks the transaction params, origin, chain, status (processing/success/failed), timestamps, and result (txHash or error).

Additional fields populated after transaction submission:

- `accountType` — `"bankr" | "privateKey" | "seedPhrase"` — which account type submitted the tx
- `functionName` — Human-readable function name extracted from decoded calldata (see Function Name Resolution below)
- `batchCallOrigins` — optional `{ origin, favicon }[]` captured for cross-dapp batch history entries. It aligns one-to-one with the encoded ERC-7821 calls so TxDetailModal can render each contributing dapp in the decoded call list; old entries fall back to the batch-level `origin/favicon`.
- `gasData` — Gas fee breakdown fetched asynchronously after tx confirms (see Gas Data Fetching below)
- `clearSignedMeta.tokenDecimals` — optional additive precision snapshot used
  by Activity to distinguish exact base-unit values from merely small decimal
  values. Older entries fall back to receipt transfer metadata or known native
  chain metadata and remain compatible when precision cannot be proven.

#### GasData Interface

```typescript
interface GasData {
  gasUsed: string; // decimal string
  gasLimit: string; // decimal string
  effectiveGasPrice: string; // decimal string (wei)
  feeSource?: "forceInclusionL1"; // authoritative paid L1 deposit fee
  // OP Stack L2 only (Base 8453, Unichain 130)
  l1Fee?: string; // decimal string (wei)
  l1GasUsed?: string; // decimal string
  l1GasPrice?: string; // decimal string (wei)
}
```

#### Function Name Resolution

Function names are resolved via a two-phase approach:

**Phase 1 (UI-driven)**: `TransactionConfirmation` decodes calldata locally via `CalldataDecoder`. If decoded, the `functionName` is passed in the confirmation message to background.

**Phase 2 (Background fallback)**: If the UI didn't provide a function name, `lookupFunctionName()` runs after tx submission and queries:

1. Sourcify 4byte API (`https://api.4byte.sourcify.dev/signature-database/v1/lookup`)
2. 4byte.directory (`https://www.4byte.directory/api/v1/signatures/`) as fallback

The resolved name is stored in tx history via `updateTxInHistory()`.

#### Gas Data Fetching

Gas data is not available at confirmation time (tx hasn't been mined). It's fetched asynchronously:

1. **After tx success**: `fetchAndStoreGasData()` in `transactions/displayMetadata.ts` runs fire-and-forget, calling `eth_getTransactionByHash` (gasLimit) and `eth_getTransactionReceipt` (gasUsed, effectiveGasPrice). For OP Stack L2s (Base 8453, Unichain 130), L1 fee fields (`l1Fee`, `l1GasUsed`, `l1GasPrice`) are extracted from the receipt. Flashblocks-capable chains pass through the shared sealed-receipt gate before gas data is persisted; transaction, batch, and receipt-polling paths share the same receipt projection, and Transaction details reconciliation updates cached gas data alongside asset changes. Force inclusion is the exception: its paid L1 deposit receipt is tagged with `feeSource: "forceInclusionL1"`, and the history repository preserves it against every later untagged L2 gas enrichment while still accepting asset-change updates.
2. **On-demand in TxDetailModal**: For older transactions missing `gasData`, the modal fetches directly via RPC when opened.
3. **Graceful degradation**: Errors are silently ignored (non-critical data).

### Storage Functions

`history/repository.ts` owns reads, adds, updates, and the shared mutation lock.
`history/database.ts` owns IndexedDB migration, paging, and retention. `history/maintenance.ts` owns stale
processing cleanup and full/per-address deletion. The root facade re-exports
their functions without wrappers so existing callers retain export identity.

| Function                           | Description                               |
| ---------------------------------- | ----------------------------------------- |
| `getTxHistory()`                   | Compatibility/recovery compact read       |
| `getTxHistoryPage(options)`        | Get a 30-row indexed cursor page           |
| `getTxById(txId)`                  | Hydrate one row with its transfer records  |
| `addTxToHistory(tx)`               | Add new entry with "processing" status    |
| `updateTxInHistory(txId, updates)` | Update status, txHash, error, completedAt |
| `clearTxHistory()`                 | Remove all history entries                |

### Storage Details

- **Database**: IndexedDB `walletchan-history`
- **Stores**: `transactions`, `assetTransfers`
- **Retention**: 1,000 settled entries per account/network; 50 MiB overall
- **Sort order**: Newest first (by `createdAt`)

### Chrome Storage RMW Locks

Any helper that reads a `chrome.storage` array/map/object, mutates it, and
writes the full value back must serialize that key through
the stable `src/chrome/storageLock.ts` facade. `storage/lock.ts` owns the one
shared in-process queue. Use a lock key that includes the storage area and
storage key (for example `local:pendingTxRequests` or `sync:tabAccounts`) so
unrelated stores can still write in parallel while same-key read-modify-write
operations cannot clobber each other.

This applies to pending request queues (`pendingTxRequests`,
`pendingSignatureRequests`, `pendingBatchTxRequests`,
`pendingWatchAssetRequests`, `pendingAddChainRequests`,
`walletConnectPendingRequests`), account metadata (`accounts`, `tabAccounts`,
`seedGroups`), `customTokens`, `networksInfo`, `txHistory`, `bundleStatuses`,
and `pendingBridges`. Because popup pages and the background are separate JS
contexts, `customTokens` and `networksInfo` mutations are routed through
background messages (`addCustomToken`, `updateCustomToken`,
`removeCustomToken`; `addNetwork`, `updateNetwork`, `setNetworkHidden`,
`deleteNetwork`, `confirmAddChain`) so all writes share the service worker's
lock instance.

Durable provider results use the stable `storageResultWaiter.ts` facade over
`storage/resultWaiter.ts`. The listener reads `chrome.storage.local`, removes
the exact result key after settlement, and retries an expiry handshake only for
bounded non-prompt operations. Every user-review request passes a null timeout
and remains subscribed until an explicit confirm, reject, authorization
revocation, session termination, account removal, or reset path publishes a
durable result. Bounded read-only operations retain their ordinary
`Request timed out` error.

### UI Component

`src/components/TxStatusList.tsx` displays the transaction history:

- **Default view**: 5 most recent transactions
- **Expandable**: Show/hide older transactions
- **Empty state**: "No recent transactions" message
- **Account filtering**: Only shows transactions from the currently selected account (filtered by `tx.from` address)

Each transaction card shows:

- Origin favicon and hostname (or function name if available)
- Chain badge with icon
- Status badge:
  - **Processing**: Blue badge with spinner
  - **Confirmed**: Green badge with checkmark, explorer link
  - **Failed**: Red badge with warning icon, error message
- Relative timestamp ("Just now", "5m ago", "2h ago")

**Clickable detail**: Clicking a completed transaction card opens `TxDetailModal`, which shows:

- Status badge, chain info, and explorer link
- Function name (if decoded)
- From/To addresses with `AddressParam` (ENS/Basename/WNS/GNS/Mega resolution, labels, copy + explorer links)
- Value in ETH
- Gas fee breakdown: total fee, gas price (Gwei), gas limit & usage with percentage
- **OP Stack L2 breakdown** (Base, Unichain): separate L2 fees, L1 fees, L1 gas price, L1 gas used
- Calldata decoder (reuses `CalldataDecoder` component)
- Contract deployment detection
- Error display for failed transactions

### Real-time Updates

The component listens for `txHistoryUpdated` messages to refresh automatically:

```typescript
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "txHistoryUpdated") {
    chrome.runtime.sendMessage({ type: "getTxHistory" }, (result) => {
      setHistory(result || []);
    });
  }
});
```

### Clear History

Users can clear transaction history via Settings:

- Navigate to Settings → "Clear Transaction History"
- Confirmation modal prevents accidental deletion
- Message: "This will permanently delete all transaction records. This action cannot be undone."

## ERC-5792 Bundle Status Storage

ERC-5792 orchestration continues to enter through the stable
`batchTxHandlers.ts` import path. Deterministic ERC-7821 encoding is isolated in
`batch/batchTxEncoding.ts`, including native-value canonicalization, exact plain-mode
calldata construction, contract-creation rejection, the payload-bearing EOA
self-call recursion guard, and EIP-7702 outer-value omission. The module has no
wallet state or side effects; the compatibility facade re-exports its original
function identities so UI, Bankr, local-signing, cross-dapp, and force-inclusion
callers remain unchanged.
Pending bundle rejection/call editing and origin-scoped status lookup/explorer
opening are isolated in `batch/batchRequestStatusHandlers.ts`; it operates on the
existing `pendingBatchTxRequests`, `bundleStatuses`, and durable result records
without changing any storage shape.
`batch/batchRequestIntake.ts` owns the injected and WalletConnect
`wallet_sendCalls` queue operation. It acknowledges the bundle id only after
both the pending request and initial bundle status are durable and the pinned
transport authorization is still current; failures remove either partial
record before publishing the exact error acknowledgement.
Atomic PK/seed execution is isolated in `batch/batchAtomic7702Execution.ts`:
it performs delegate revalidation, optional guarded EIP-7702 authorization,
the single signed ERC-7821 broadcast, and receipt/status publication while
`batchLocalCoordinator.ts` supplies the final pinned-request authorization and
completion callbacks. `batchCapabilities.ts` owns exact-address capability
advertisement; `batchSingleExecution.ts` owns the one-call shortcut;
`batchCompletionTracking.ts` mirrors terminal transaction history to bundle
status. `batchTxHandlers.ts` remains export-only.

User-assembled multi-origin batches enter through the export-only
`crossDappBatchHandlers.ts` facade and live under `crossDappBatch/`.
`storage.ts` preserves the single `crossDappBatch` key and released entry
schema. `intake.ts` persists a pinned transaction or complete
`wallet_sendCalls` sibling group before removing its source prompt;
`staging.ts` routes edit/remove/reject outcomes by source kind.
`lifecycle.ts` groups distinct sources, captures injected/WalletConnect epochs,
and removes unauthorized staging before terminal publication.
`confirmation.ts` acquires duplicate-confirm exclusion before asynchronous
reads, validates the stored account/from/chain lock, encodes the reviewed calls,
and composes either `bankr.ts` or `local.ts`. Both signer paths re-resolve the
exact account and perform the final transport/epoch commit at their irreversible
effect boundary. `completion.ts` fans one shared hash or failure to transaction
results and ERC-5792 bundle statuses independently and owns delayed receipt
mirroring.

`bundleStatuses` is stored as a single array in `chrome.storage.local` and is
read by `wallet_getCallsStatus`. The stable `bundleStatusStorage.ts` facade
delegates to `batch/bundleStatusStorage.ts`, which serializes
`saveBundleStatus`, `updateBundleStatus`, and cleanup writes with an in-process
lock so concurrent read-modify-write operations cannot clobber each other. This
is required for cross-dapp batches where one confirmed onchain transaction fans
out terminal status updates to multiple source `wallet_sendCalls` bundle IDs.

## Token Holdings & Transfers

### Portfolio API

Token holdings are fetched via a provider-agnostic website API route:

- **Website route**: `apps/website/app/api/portfolio/route.ts` (GET `/api/portfolio?address=0x...`)
- **Extension client**: `portfolio/api.ts` fetches from `https://walletchan.eth.sh/api/portfolio`
- **Response format**: Provider-agnostic `PortfolioResponse` with `tokens[]`, `defiPositions[]`, and `totalValueUsd`
- **Provider order**: Zerion primary, Dune SIM temporary fallback, Alchemy final token-only fallback

Zerion is queried without `filter[chain_ids]` so balances and DeFi positions on
new Zerion-supported EVM chains can appear without changing the WalletChan API.
The provider resolves Zerion string chain IDs to numeric EVM chain IDs using the
Zerion `/v1/chains/` endpoint plus static fallbacks for known slugs; positions
that cannot be represented as a numeric EVM `chainId` are skipped because the
public `PortfolioResponse` contract uses numeric chain IDs.

### Onchain Balance Verification

API portfolio data is shown immediately, while onchain balances are verified in the background via `portfolio/onchainBalances.ts`:

- **Multicall3** (`0xcA11bde05977b3631167028862bE2a173976CA11`, same address on all chains) batches native `getEthBalance` and ERC20 `balanceOf` calls into a single multicall per chain. Registry entries with `hasNativeToken: false` are excluded before RPC work; Tempo uses this policy because its `eth_getBalance` response is a compatibility sentinel, not a user-owned asset. Tempo's USD/6 EVM currency metadata remains available to fee and transaction renderers; only balance-bearing/selectable native-token paths are disabled.
- Calls are chunked into batches of 100 to avoid oversized RPC requests
- Parallel execution across all chains with 8s timeout and no retries
- Cached viem clients per chainId for performance
- Falls back to API values on any error (per-token or per-batch)
- A failed token read does not by itself label the chain RPC unhealthy. The
  home warning is eligible only when every attempted balance read for a chain
  fails and a final `eth_blockNumber` health probe also fails.
- `fetchOnchainBalances(..., { preserveZeroBalanceTokens: true })` keeps zero-balance entries when selector UIs need the full token catalog instead of a non-zero-only holdings list

### Shared Portfolio Token Catalog

`portfolio/tokenCatalog.ts` is the single source of truth for wallet token lists shown across the extension. It builds a shared catalog consumed by `TokenHoldings`, `TokenTransfer`, and `SwapView` by merging:

- Portfolio API tokens
- User-added custom ERC-20 tokens from `chrome.storage.local.customTokens`
- Recently received ERC-20 stubs from `chrome.storage.local.recentlyReceivedTokens`
- Native token placeholders for visible chains whose registry policy permits a real native token
- On upgrade, a v3.19 user-added Tempo record is canonicalized into the built-in `Tempo` entry by chain ID. Its RPC override and hidden/visible preference survive, while stale custom explorer/native-currency metadata is replaced by the registry policy. If the user renamed the custom record, its active-chain selection is migrated to the canonical `Tempo` name in the same locked storage update. The generated add-network catalog excludes Tempo mainnet so it cannot reintroduce the released ETH/18 metadata.
- CoinGecko USD price fallback for custom-chain native tokens when the portfolio API has no price (for example `MON` on Monad)
- ERC-20 metadata fallback via `tokenMetadata.ts` so recently received/custom tokens can reuse the same logo/name source as Swap/Bridge selectors
- The CoinGecko fallback runs through the background `portfolio/coingecko.ts` facade, which shares rate-limit/cache state across focused native and ERC-20 services and persists market/search caches in `chrome.storage.local` so reopening the popup doesn't cold-start CoinGecko traffic each time
- `TokenHoldings` first calls the catalog with enrichment disabled so Portfolio API data renders immediately, then runs metadata/native-price enrichment and onchain balance refresh in detached background work. Holdings deliberately skips ERC-20 price fallback during enrichment to avoid fan-out/rate limits from token-price APIs; it keeps Portfolio API prices until the portfolio backend indexes newer values.
- Fresh popup/sidepanel mounts hydrate asynchronously from the reset-aware `chrome.storage.local.portfolioHoldingsCache` before the live fetch starts. The cache is keyed by address plus the visible-chain reload key, capped to 12 entries, TTL-pruned after 24 hours, and treated as optional display data. Older `walletchan:portfolioHoldingsCache:v1` renderer-localStorage mirrors are purged and never read, preventing a replacement wallet from inheriting prior addresses/balances/token imagery. Missing/invalid entries fall back to the normal live portfolio load.
- Cached RPC issue IDs are display metadata only and are not replayed into the
  home warning. Live issue reports wait three seconds before rendering, so a
  normal cache-to-live refresh or short-lived RPC failure clears without a
  distracting banner flash. Repeated identical reports preserve both the
  original reveal deadline and an in-renderer dismissal.

After the merged catalog is built, `portfolio/tokenCatalog.ts` filters global hidden tokens from `chrome.storage.local.hiddenPortfolioTokens` before calculating `totalValueUsd`. This keeps Holdings, Send, Swap holdings, current totals, and newly-written balance snapshots aligned across every wallet address. Recently received token keys are returned alongside the catalog so Holdings can still RPC-refresh those tokens immediately even if their current USD value would normally place them in the collapsed low-value group. `AddTokenModal` removes a matching hidden entry before adding a token; if the Portfolio API already returned that token, no custom token record is created.

Users can hide tokens from the Holdings row overflow menu or from More → Hide Tokens. The More screen reuses the shared portfolio catalog and onchain balance verification, lets users select multiple visible ERC-20 tokens, and writes them to the global hidden-token list in one batch. Its Currently Hidden sub-screen lists hidden tokens across all accounts and can show a token again globally. Bulk hide/show paths force-record a visibility-adjusted current snapshot without deleting existing chart history, then refresh the Holdings tab/chart.

This prevents the send/swap/holdings views from drifting when custom tokens, custom chains, or hidden-token preferences are added.

### Shared Chain Icon Resolution

`lib/chainIcons.ts` is the single source of truth for chain icon rendering across the extension. `ChainIcon.tsx` consumes it everywhere instead of screens reading `config.icon` directly.

Resolution order:

- Built-in registry icon from `CHAIN_REGISTRY`
- Static alias map for common user-added chains and testnets (for example Base Sepolia reuses the Base icon)
- Testnet overlay label on top of the base icon (`SEP`, `FUJI`, `T`)
- Deterministic initials fallback with stable Bauhaus colors for unknown custom chains

Important constraints:

- No chain icons are stored in `chrome.storage`; icon rendering is fully derived from chain ID + chain name
- Known testnets should reuse the mainnet icon with an overlay instead of adding a separate storage concept
- Chain logos that need a contrast surface declare optional theme-aware `logoStyle` metadata on their `CHAIN_REGISTRY` entry. Each light/dark scheme owns its `surface`, `border`, and `insetOutline`; dark themes fall back to the light scheme when no dark override exists. `resolveChainIconMeta` carries the complete treatment to every registered testnet parent mapping, and `ChainIcon` applies the active scheme without requiring a caller-specific chip flag.
- Any new UI that needs a chain icon should render `ChainIcon`, not `config.icon` directly

### TokenHoldings Component

- Shows token list with symbol, balance, USD value, chain badge
- The portfolio network filter starts linked to the active connected dapp's chain. A manual chain or "All networks" selection detaches that link and survives browser-tab changes. A later chain switch requested by that dapp or from the connected-site bottom dock explicitly relinks the filter to the new chain. The background emits the verified internal `portfolioDappChainChanged` event after authorizing a provider switch notification; tab IDs prevent a switch in another tab from relinking the active tab's filter.
- Hover actions include Swap, Send, custom-token Edit, and an overflow menu for hiding ERC-20 tokens
- Hiding a token stores a global hidden-token entry, removes it from totals, clears cached holdings, and force-appends a current aggregate snapshot so future chart points reflect the hidden-token view without deleting existing chart history
- Total portfolio value header with hide/show toggle (persisted in `chrome.storage.sync.hidePortfolioValue`)
- Canonical ETH, USDC, and USDT balances are unified across networks by
  default. The checkmarked Portfolio options → Unify Balances row toggles the
  grouped presentation and dismisses the sheet so the result is immediately
  visible; disabling it renders every chain/token entry separately. The
  preference is persisted in `chrome.storage.sync.unifyPortfolioBalances`, and
  missing or malformed values resolve to `true` for released installs.
- 60-second client-side cache plus a best-effort local `portfolioHoldingsCache` for first paint after popup/sidepanel reopen
- Refresh button, loading skeletons, empty state
- Click token → opens TokenTransfer view

### Portfolio Snapshot Storage

`portfolio/snapshotStorage.ts` silently records `totalValueUsd` snapshots per address over time in `chrome.storage.local` under the key `portfolioSnapshotsV2`. The legacy `portfolioSnapshots` key is removed on read/write because its aggregate-only records cannot be repaired after the Tempo native-balance sentinel bug. Forced refreshes preserve the explicit `tokenCatalog` → `onchainBalances` → `snapshotStorage` sequence in `portfolio/snapshotRefresh.ts`.

**How it works:**

- `recordSnapshot(address, totalValueUsd, options?)` is called from `TokenHoldings.tsx` after each portfolio load (preferring onchain enhanced value, falling back to API-only)
- Hidden-token visibility changes call `recordSnapshot(..., { force: true })` to append the current visible total immediately while preserving prior chart history
- Snapshots are deduplicated by default: skipped if the last snapshot for the address is <1 hour old unless `force` is set
- Entries older than 8 days are pruned on each write
- Addresses are normalized to lowercase

**Storage shape:**

```typescript
// chrome.storage.local key: "portfolioSnapshotsV2"
{ [address: string]: { timestamp: number; totalValueUsd: number }[] }
```

**Exports:**

- `recordSnapshot(address, totalValueUsd, options?)` — append snapshot (with dedup + prune, or forced append)
- `getSnapshots(address)` — read all snapshots for an address

**Future expansion:**

- **7-day holdings chart**: Use `getSnapshots()` to render a sparkline or area chart on the portfolio view showing value over the past week
- **Per-token snapshots**: Extend the snapshot shape to include per-token breakdowns (`{ symbol, valueUsd }[]`) for individual token performance charts
- **Snapshot on background alarm**: Register a `chrome.alarms` periodic task (e.g., every 4 hours) that fetches portfolio in the background service worker and records a snapshot, so data is captured even when the popup isn't opened
- **Export/analytics**: Expose snapshot data for CSV export or aggregate statistics (daily high/low, % change)

### Token Transfer Flow

#### Address Contact Book

More → Address book manages the optional local-only `addressContacts` list.
The trusted-UI `contactBookRouter.ts` exposes bounded create, label-update,
delete, and exact-permutation reorder operations; mutations broadcast
`addressContactsUpdated`, and wallet reset removes the key. Address display
priority is user contact, WalletChan account display name, cached reverse name,
eth.sh label, then a middle-truncated address. The shared eth.sh client checks
the contact repository before egress, so a saved contact never triggers the
public label endpoint. The add-contact dialog accepts either a raw EVM address
or any name supported by the shared forward resolver (ENS, Basenames, `.wei`,
`.gwei`, and `.mega`). It displays the resolved address before submission and
persists only that normalized address in the contact record. A successfully
entered service name also seeds the public `ensIdentityCache` as a partial
identity so the Address book can skip reverse resolution and batch only its
avatar lookup.

Address book enrichment uses the shared six-hour identity cache. Cache misses
are reverse-resolved in Multicall3 batches per chain across ENS, Basenames,
WNS/GNS, and MegaNames; winning-name avatar records are then fetched in batched
contract reads where the service supports them. The contact label remains the
primary text, the public primary name replaces the truncated secondary address,
and a safely rasterized cached avatar replaces the blockie when available.
Address Book and Send consume the same `useAddressContactIdentities` projection
and `AddressContactAvatar` renderer, which keeps public-name text, safe avatars,
and deterministic blockie fallback synchronized across both lists.
They also mount the same `AddressContactList` for row presentation, label edits,
deletion confirmation, and pointer/touch/keyboard ordering. Send supplies its
eligible contact subset to that component; the shared pure order model replaces
only those contacts' slots in the complete saved order before calling the
background exact-permutation route. Contacts hidden because they duplicate a
wallet account therefore retain their stored position. Active search filters
disable reordering while edit, delete, and selection remain available.

Send exposes My contacts with canonical WalletChan accounts first and saved
contacts second. Recipient typing uses a keyboard-operable local combobox over
wallet names, contact labels, cached public primary names, and addresses. Its
suggestion rows reuse the same safe onchain avatar, deterministic blockie, and
public-name secondary text as the full contact picker; selection still supplies
the exact raw address to the existing recipient validation, contract detection,
pending transaction intake, and Bankr/private-key/seed-phrase signing paths.
An exact address already present in eligible contacts or wallet accounts uses
that local identity immediately and passes an empty input to the remote name
resolver, so picker/autocomplete selections never flash “Resolving…” or issue a
redundant reverse-name/avatar request. Manual unknown addresses and typed names
retain the normal resolver path; contract-address detection still runs for both.

1. User clicks a token in TokenHoldings
2. App.tsx switches to `"transfer"` view with selected token state
3. TokenTransfer form: recipient address input, amount input with MAX button
   - Native-token sends can include optional hex calldata. The send form shows
     a **Decode Calldata** modal for valid non-deploy native calldata once the
     recipient resolves. The modal reuses `ClearSigningView` against
     `{ chainId, recipient, calldata }` and `CalldataDecoder`; the decoder is
     collapsed by default when clear signing renders.
4. On submit, `buildTransferTx()` creates calldata:
   - **Native**: `{ to, value: parseEther(amount), data: "0x" }` or the
     user-provided hex calldata
   - **ERC20**: `{ to: contractAddress, data: encodeFunctionData("transfer", [to, amount]), value: "0x0" }`
5. Sends `initiateTransfer` message to background
6. Background creates a `PendingTxRequest` with origin "WalletChan"
7. Normal TransactionConfirmation flow takes over

The Base USDC sponsored-send feature gate is currently disabled in
`Transfer/model/sponsoredTransferPolicy.ts`. Base USDC therefore follows the
same standard ERC-20 `initiateTransfer` path as other ERC-20 tokens for Bankr,
private-key, and seed-phrase accounts, and the Send UI does not request premium
status or show sponsorship messaging. When enabled, eligible premium Base USDC
sends may use the sponsored ERC-3009 path instead. The background validates and
pins the account/from/to/
amount, signs one `TransferWithAuthorization`, encrypts the exact relay payload
with the general vault key, and stores it in bounded
`sponsoredTransferIntents` recovery state before starting the relay request.
If the relay result is ambiguous, WalletChan does not submit again or offer a
normal ERC-20 fallback. A status check decrypts the original nonce and asks two
fixed Base RPCs for the USDC authorization state at each endpoint's exact
finalized block. Only agreement that the nonce was consumed completes the
history item; only agreement that it was unused after `validBefore` permits a
new authorization. RPC failure/disagreement and malformed recovery state stay
fail-closed. Submitted/consumed records remain semantic dedupe markers until
the trusted renderer acknowledges the returned stored intent ID, covering a
popup that closes after the background commits but before it receives success.
Unacknowledged records block account removal/reset and are never pruned by
renderer wall time.

### Calldata Decoder

Transaction calldata is decoded using the eth.sh API:

- **API**: POST `https://eth.sh/api/calldata/decoder-recursive` with `{ calldata, address, chainId }`
- **Component**: `CalldataDecoder.tsx` with Decoded/Raw tab toggle
- **Native send preview**: `NativeCalldataDecodeModal.tsx` composes
  `ClearSigningView` + `CalldataDecoder` from the send form before the pending
  tx is created. It is hidden while the same native calldata is marked as a
  contract deployment because deployment bytecode has no recipient contract to
  resolve clear signing or ABI decoding against.
- **Parameter display**: Color-coded by type (addresses=blue with labels, numbers=gold, bools=green/red, bytes=muted)
- **Fallback**: Raw hex if decode fails or for contract deployments (no `to` address)

### Clear Signing Descriptors

`ClearSigningView` renders ERC-7730-style descriptors for transaction calldata
and EIP-712 messages before the raw decoder/typed-data panel. Descriptor
resolution is remote-first, local-second:

- `chrome/clearSigningHandlers.ts` is the stable facade over the focused
  `chrome/clearSigning/` audit domain. `descriptorCache.ts` owns the exact v3
  key/schema and 7-day hit / 1-day miss TTL; `descriptorClient.ts` owns the
  10-second, 512 KiB bounded public request; `descriptorResolver.ts` owns the
  configured-RPC proxy fallback and immutable deployment extension; and
  `handlers.ts` coordinates opt-out, validation, cache, and resolution.
- `lib/clearSigning/builtinDescriptors.ts` is the local descriptor registry.
  It contains generic selector descriptors (ERC-20 transfer/approve, Safe
  MultiSend) and address-bound custom descriptors (GNS NameNFT,
  SubdomainRegistrar, HumanRegistrar, Multicall3). Address-bound descriptors
  must match both chain ID and deployed contract address before rendering.
- `getBuiltinCalldataDescriptor()` is the single local fallback used by the UI
  and by history snapshots. Add future custom local clear-signing coverage
  there so confirmation screens, nested calls, and Activity metadata stay in
  sync.
- GNS descriptors render `tokenId` / `parentId` fields with the custom
  `gweiName` value format. `ClearSigningView` resolves those IDs through
  `NameNFT.getFullName(tokenId)` and displays the `.gwei` domain, falling back
  to a compact token ID only if the name cannot be resolved.
- GNS `setContenthash` renders the `hash` bytes as a `Website` field using the
  custom `contentHash` value format. The pure formatter in
  `lib/clearSigning/contentHashFormat.ts` decodes EIP-1577 contenthash bytes
  into URI-style text such as `ipfs://...` or `ipns://...`, falling back to raw
  bytes if a malformed or future codec cannot be decoded.
- `isGenericBuiltinCalldataCall()` is intentionally narrower than
  `getBuiltinCalldataDescriptor()`: it only identifies selector-generic calls
  for batch UI de-duplication. Custom address-bound descriptors are not treated
  as generic, which prevents selector collisions like ERC-721
  `approve(address,uint256)` being displayed as an ERC-20 allowance.
- `chrome/clearSignedMetaSnapshot.ts` is the stable facade over the snapshot
  builders and fire-and-forget history attachment in `chrome/clearSigning/`.
  Approve, transfer, native-send, and ERC-7730 metadata retain that priority.
  Asset snapshot builders persist `tokenDecimals` alongside the formatted
  amount so compact Activity formatting never has to infer ERC-20 precision.
  If the remote registry misses or has no matching format, the ERC-7730 builder
  falls back to the local registry before recording `clearSignedMeta`; builder
  or history-write failures remain optional and never delay transaction flow.

### Typed Data Display

EIP-712 typed data signatures show structured display:

- **Primary content**: primary type plus recursive message fields for nested
  objects/arrays
- **Address tools**: eth.sh labels use the shared transaction-style
  `LabeledAddressPopover`; unlabeled addresses use shared copy/explorer actions
- **Advanced details**: domain, types, exact raw typed data, and EIP-712 hashes
- `personal_sign` shows safe decoded text first; invalid UTF-8, control-heavy,
  `eth_sign`, and otherwise unreadable payloads display a warning and keep exact
  bytes in Advanced details

### ERC-7710 / ERC-7715 Delegated Permissions

Raw ERC-7710 delegation typed data is not a dapp signing surface.
`eip712Validator.ts` rejects external `eth_signTypedData_v3` /
`eth_signTypedData_v4` requests whose primary type and fields match the
Delegation Framework `Delegation` schema, and `txHandlers.ts` repeats the check
at confirm time for persisted legacy requests.

Dapps must use ERC-7715 provider methods:

- `wallet_getSupportedExecutionPermissions`: returns WalletChan's fixed
  supported permission types and chain IDs that have a known default 7702
  DeleGator deployment.
- `wallet_getGrantedExecutionPermissions`: returns active, non-expired grants
  scoped to the requesting origin, active account, and chain.
- `wallet_requestExecutionPermissions`: is routed through
  `erc7715PermissionHandlers.ts`. It runs preflight in
  the stable `erc7715/preflight.ts` facade: local signer account only, valid ERC-7715
  request shape, fixed permission/rule allowlist from
  the stable `erc7715/registry.ts` facade, `from` matching the active account, supported
  chain, configured RPC URL, and live `eth_getCode(activeEOA)` showing
  WalletChan's default Stateless DeleGator. If preflight passes, the request is
  stored in `pendingErc7715PermissionRequests`, shown in
  `Erc7715PermissionConfirmation.tsx`, and resolved after user approval or
  rejection. Permission prompts have no age-based timeout. Final approval,
  rejection, or explicit authorization/session invalidation results are written to
  `erc7715PermissionResult:{id}` so injected and WalletConnect callers do not
  depend on a long-lived MV3 `sendMessage` response channel.

While a `wallet_requestExecutionPermissions` request is in progress,
WalletChan blocks additional external dapp requests with the same
standard in-process error. The injected provider holds an inpage lock so
locally answered methods like `eth_chainId` cannot bypass the block, and the
background router enforces the same lock for injected transaction, signature,
batch, RPC proxy, capabilities/status, watch-asset, add-chain, and execution
permission requests. The lock is also derived from all valid pending
`pendingErc7715PermissionRequests`, so it survives MV3 service-worker restarts;
until that storage-backed state is loaded, external provider RPCs fail closed.
The enqueue path synchronizes the derived storage lock from the saved pending
request list before releasing the temporary in-memory lock, avoiding an
enqueue-to-storage-change window where another external request could slip in.
The WalletConnect router also checks `erc7715/requestLock.ts` before
processing session requests.

Current permission vocabulary is deliberately narrow:

- `native-token-allowance`: `data.allowanceAmount`, optional
  `data.startTime`
- `native-token-periodic`: `data.periodAmount`, `data.periodDuration`,
  optional `data.startTime`
- `native-token-stream`: optional `data.initialAmount`, optional
  `data.maxAmount`, `data.amountPerSecond`, optional `data.startTime`
- `erc20-token-allowance`: `data.tokenAddress`, `data.allowanceAmount`,
  optional `data.startTime`
- `erc20-token-periodic`: `data.tokenAddress`, `data.periodAmount`,
  `data.periodDuration`, optional `data.startTime`
- `erc20-token-stream`: `data.tokenAddress`, optional `data.initialAmount`,
  optional `data.maxAmount`, `data.amountPerSecond`, optional
  `data.startTime`
- `token-approval-revocation`: boolean revocation primitives
  `erc20Approve`, `erc721Approve`, `erc721SetApprovalForAll`,
  `permit2Approve`, `permit2Lockdown`, and `permit2InvalidateNonces`. The
  `permit2InvalidateNonces` flag must currently be `false`; WalletChan rejects
  broad Permit2 nonce invalidation until a later phase can scope it to exact
  token/spender pairs.

The registry rejects unknown fields, `MAX_UINT256` / zero amounts for
non-stream allowances, periodic durations over ten years, malformed token
addresses, duplicate/expired `expiry` rules, and start times that are not
before expiry. All stream grants require an expiry. This keeps the exposure
time-bounded and prevents the DeleGator stream enforcers from later reverting
because their elapsed-time multiplication happens before the max-amount clamp.
EVM addresses are accepted in any valid `0x` 20-byte hex capitalization and
normalized to EIP-55 checksum form before storage, display, caveat terms, and
responses. Omitted `startTime` values follow WalletChan's Advanced Permissions
behavior and are normalized to the preflight timestamp.
Token approval revocation requires at least one revocation primitive and an
expiry, and broad Permit2 nonce invalidation is rejected because it can cancel
unrelated pending Permit2 signatures without token/spender pinning. If any
enabled Permit2 primitive is requested, preflight requires a WalletChan built-in
chain and live code at canonical Permit2
`0x000000000022D473030F116dDEE9F6B43aC78BA3` on the configured RPC.
The field names follow the Delegation Framework permission payloads so later caveat
construction and UI work can line up with the same semantics.
`permission.justification` is accepted as optional display-only metadata
(WalletChan also tolerates legacy `permission.data.justification` and
normalizes it out of `data`). It is bounded, shown to the user, persisted with
the request/response, and never used as a caveat input.

`erc7715/caveats.ts` is the stable local facade for the phase-one
permission-to-caveat mapping. Canonical addresses/types live in
`caveatDefinitions.ts`, fixed-width terms in `caveatEncoding.ts`, and the
permission switch in `caveatBuilder.ts`.
It uses the deployed DeleGator v1.3.0 `DelegationManager`, `ROOT_AUTHORITY`,
`TimestampEnforcer`, `ExactCalldataEnforcer`, `ValueLteEnforcer`,
`NativeTokenPeriodTransferEnforcer`, `NativeTokenStreamingEnforcer`,
`ERC20PeriodTransferEnforcer`, `ERC20StreamingEnforcer`,
`ApprovalRevocationEnforcer`, and `NonceEnforcer` constants and encodes terms
with the same fixed-width layouts as the installed delegation-core package.
Native-token permissions always include `ExactCalldataEnforcer(0x)` because the
native enforcers constrain `value` but not target/calldata. ERC-20 permissions
always include `ValueLteEnforcer(0)` because the ERC-20 enforcers constrain
token transfers but should not allow native value. Standard grants include a
`NonceEnforcer` term read from `currentNonce(DelegationManager, delegator)` at
preflight/confirmation so nonce invalidation can revoke them. Allowance grants
use the relevant periodic enforcer with `periodDuration = uint256.max`, which
matches the current Delegation Framework permission decoder shape. Timestamp caveats
are expiry-only for the current ERC-7715 vocabulary; start time is enforced by
the period/stream enforcer terms. Token approval revocation terms are the
DeleGator one-byte bitmask, also paired with `NonceEnforcer`.
On approval, `erc7715/delegationSigning.ts` constructs the ERC-7710 typed data
internally with `delegator = active account`, `delegate = request.to`,
`authority = ROOT_AUTHORITY`, canonical `DelegationManager`, and only the
WalletChan-derived caveats. The EIP-712 `Caveat` type intentionally contains
only `enforcer` and `terms`; `args` are not signed by ERC-7710 and are added
only to the ABI-encoded signed delegation context. The local private-key/seed
signer signs that typed data after confirmation, the signed delegation chain is
ABI-encoded as the ERC-7715 `context`, and `dependencies` is currently `[]`
because the EOA must already be EIP-7702-authorized to WalletChan's default
delegate. Grant records are stored in `erc7715PermissionGrants` with the
original request, returned response, signed delegation, typed data, caveats,
expiry, and context hash.
Dapps cannot submit arbitrary enforcer addresses through the ERC-7715 path.

Because the returned ERC-7710 context is reusable authority rather than a
one-time signature, approval is master-session-only. Password and biometric
master sessions are accepted (including signing-compatible V1 passkeys and V2
purpose-separated records); agent sessions are rejected even when the prompt
was originally queued under a master session. `delegation/authorityPolicy.ts`
(re-exported by the stable `delegatedAuthorityPolicy.ts` facade)
captures the auth epoch before key recovery/signing, and the grant storage
helper re-checks the epoch plus live master type synchronously at one atomic
storage commit that writes the grant, removes the pending prompt, and publishes
the success result. That commit is the capability-issuance linearization point,
so timed expiry, manual lock, or a master-to-agent transition cannot publish
after master authority is lost; post-commit cleanup cannot report a false
failure or leave a retryable prompt that issues a duplicate grant.

Account Settings includes a delegated-permissions management section for
private-key and seed-phrase accounts. It lists active, non-expired grants for
the selected account grouped by requesting origin, displays the chain,
permission type, delegate, token, amount/frequency, and expiry, and exposes an
onchain revoke action. Active grant reads call `eth_getCode(account)`,
`disabledDelegations(hash)`, and any stored `NonceEnforcer` term over the
configured chain RPC. If the EOA is no longer delegated to WalletChan's default
DeleGator, the delegation hash is disabled, or the stored nonce no longer
matches the current nonce, WalletChan marks the grant revoked before returning
results to Account Settings or `wallet_getGrantedExecutionPermissions`. If the
RPC cannot verify onchain delegate/disabled/nonce state, active grant reads and
onchain revoke initiation fail closed instead of returning an unverified grant
as active.
`initiateErc7715PermissionRevoke`
validates account/grant ownership, checks the stored delegation manager, encodes
the `disableDelegation((...))` call for the signed ERC-7710 delegation,
checks `disabledDelegations(hash)` through the onchain revoke path, and queues
a normal WalletChan transaction to the canonical `DelegationManager` only when
the delegation is not already disabled and no revoke tx for that grant is
already pending. The receipt poller marks the grant
`status: "revoked"` only after that tx succeeds. Queued revoke transactions
carry `erc7715PermissionRevokeMeta` with display-safe grant details
(`grantId`, original origin, permission type, delegate, token/amount/frequency,
and expiry). `TransactionConfirmation.tsx` uses that snapshot to show a
dedicated human-readable "Revoke delegated permission" summary and keeps the
generic calldata decoder collapsed for audit access instead of making
`disableDelegation((...))` the primary review surface. `TxDetailModal.tsx`
reuses the same snapshot after submission so the Activity tab shows the
delegated-permission revoke summary above the raw transaction details.

The confirmation UI composes the same Warm Midnight request primitives as
transaction, batch, and signature review. The screen uses shared top queue
navigation and Reject all, centered `RequestIdentity`, a plain-language summary
of the reusable authority, one chain-qualified permission-limits section,
delegate and site-justification rows, scroll-aware Advanced details, and the
same compact `Signing with` sticky footer with secondary Reject and amber Grant
permission actions. Origin, account, and chain are each shown once. Shared
`LabeledAddressPopover` tools own delegate, token, manager, and enforcer copy /
explorer actions. Request type, manager, WalletChan-derived caveats and terms,
and exact raw request JSON remain behind Advanced details.
`Erc7715PermissionConfirmation/Erc7715PermissionEditableControls.tsx`
lets users adjust supported permission terms before approval only when
`permission.isAdjustmentAllowed === true`. Locked requests keep amount,
frequency, start time, stream caps, and identity fields immutable. To match
WalletChan Advanced Permissions behavior, users may still add, remove, extend, or
shorten expiry on non-stream grants; stream expiry remains required and guarded
with the streaming terms because it changes total exposure. Adjustable requests
can set any positive bounded amount, change periodic frequency, move start time
later, and move an already-past start time earlier within the past. For token
approval revocation, the revocation method flags are immutable and the user can
only adjust the required expiry. Background confirmation
re-validates the edited ERC-7715 request with
`erc7715/preflight.ts`, checks it with
`lib/erc7715PermissionEditing.ts`, recomputes caveats from the edited request,
and signs only that recomputed delegation. Raw delegation/caveat details live
behind an advanced accordion for auditability. ERC-20 token amounts are not
formatted or signable with guessed decimals: if metadata lookup cannot verify a
token's decimals, the UI shows the token address and blocks amount editing /
approval until metadata is verified. The renderer feature domain is documented
in `components/Erc7715PermissionConfirmation/README.md`; root imports remain
policy-free compatibility facades.

Injected-provider calls bridge through `i_walletExecutionPermissions` in
`provider/inpage/executionPermissionAdapter.ts` and
`provider/contentBridge/executionPermissionRoute.ts`. The background route resolves the sender tab's
selected account with `getTabAccount(tabId)` before preflight/listing so an
omitted ERC-7715 `from` is scoped to the same account the dapp sees, not a
mutable global popup account. For `wallet_requestExecutionPermissions`,
the content bridge creates the pending permission id, sends it to background, and waits
on `erc7715PermissionResult:{id}` just like tx/signature result keys. The
inpage provider also rejects a second concurrent permission request immediately
with `-32002`.

WalletConnect requests use the same handler from
`walletConnect/requestRouter.ts` after session method allowlisting in
`walletConnect/sessionPolicy.ts`; the WalletConnect adapter resolves the account from
the session-authorized account set before preflight/listing so permission grants
cannot drift to the popup's currently active account. WalletConnect
`wallet_requestExecutionPermissions` requests are stored in
`walletConnectPendingRequests` with kind `erc7715Permission` and completed when
`erc7715PermissionResult:{id}` is written, so service-worker restarts do not
orphan the dapp response. The result is committed to the WalletConnect terminal
outbox before relay delivery, and the original `(topic, requestId)` claim means
a replay cannot produce a second permission grant/signature. WalletConnect grants are stored under
`walletconnect:<topic>` instead of peer-supplied URLs; peer metadata is
display-only (`senderOrigin` / favicon) because WalletConnect metadata is
self-reported.

ERC-7715 `redeemDelegations(bytes[],bytes32[],bytes[])` transactions use a
decoded asset-change preview in `txSimulation.ts` instead of the normal
bytecode-injection simulator. DelegationManager redemption can depend on the
delegator EOA's EIP-7702 smart-account code, and injecting `TxSimulator`
bytecode at that same address can create false simulated reverts. WalletChan
therefore decodes only supported single-default and batch-default executions,
nets direct native sends plus canonical `ERC20.transfer(address,uint256)` sends
against the delegator encoded in the permission context, and shows those through
the same token metadata/logo/USD enrichment pipeline as simulated transfers. Any
unsupported mode, non-zero outer DelegationManager tx value, self-transfer with
non-zero value/amount, or arbitrary calldata remains "simulation unavailable"
rather than showing a partial preview.

### Tenderly Simulation

Transaction confirmation includes a "Simulate on Tenderly" button:

- Opens `https://dashboard.tenderly.co/simulator/new` with pre-filled tx params
- No API key needed (URL-based simulation)
- Skipped for contract deployments (no `to` address)

## ENS/Basename/WNS/GNS/Mega Identity Resolution

Accounts in the dropdown automatically resolve ENS names, Basenames, WNS `.wei` names, GNS `.gwei` names, MegaNames `.mega` names, and avatars. Results are cached in `chrome.storage.local` for 6 hours.

### Resolution Priority

ENS (Ethereum mainnet) takes precedence over Basename (Base L2), which takes precedence over WNS (Wei Name Service), then GNS (Gwei Name Service), then MegaNames (MegaETH):

1. **Name**: ENS name > Basename > WNS `.wei` name > GNS `.gwei` name > MegaNames `.mega` name > truncated address
2. **Avatar**: ENS avatar (when ENS name exists) > Basename avatar (when only Basename exists) > GNS avatar text record (when only a GNS name exists) > Mega avatar (when only Mega name exists) > BankrAvatar (Bankr accounts) > BlockieAvatar (wallet-account fallback only). WNS names have no avatar support.

Normal cache misses are resolved through per-chain Multicall3 batches in
`ensBatchIdentity.ts`; explicit single-address refreshes retain the parallel
`resolveEnsIdentity()` path in `ensUtils.ts`. If ENS name exists, ENS avatar is
fetched; Basename avatar is only fetched when no ENS name is found; GNS and Mega
avatars are fetched through their `text(tokenId, "avatar")` records when their
names win resolution priority. WNS names have no avatar support. Shared request
address pills prioritize the local contact label, then a matching WalletChan
account's `displayName`, then the cached resolved name, then the caller's
contract/address label. Resolved avatars are available for wallet and external
addresses; Bankr/blockie fallbacks are restricted to addresses present in the
user's account list.

### Display Priority in AccountSwitcher

| Condition                       | Primary Name      | Secondary         | Tag                                |
| ------------------------------- | ----------------- | ----------------- | ---------------------------------- |
| Contact label exists            | contact label     | truncated address | account type                         |
| User-set displayName + ENS name | displayName       | truncated address | ENS name (gray tag) + account type   |
| User-set displayName, no ENS    | displayName       | truncated address | account type only                  |
| No displayName, ENS name exists | ENS name          | truncated address | account type only                  |
| No displayName, no ENS          | truncated address | (none)            | account type only                  |

### Architecture

```
AccountSwitcher.tsx
  └── useEnsIdentities(addresses)         # React hook
        └── ensIdentityCache.ts           # Cache read/write (chrome.storage.local)
              ├── ensBatchIdentity.ts     # Multicall reverse-name/avatar enrichment
              └── ensUtils.ts             # Single-identity/manual-refresh RPC calls
                    ├── getEnsName()      # mainnet reverse resolution
                    ├── getBasename()     # Base L2 reverse resolution
                    ├── getWeiName()      # WNS/GNS reverse resolution (via wei.ts SDK)
                    ├── getMegaName()     # MegaNames reverse resolution (MegaETH chain 4326)
                    ├── getEnsAvatar()    # mainnet avatar lookup
                    ├── getBasenameAvatar() # Base L2 avatar lookup
                    ├── getGweiAvatar()   # GNS avatar text-record lookup
                    └── getMegaAvatar()   # MegaNames avatar lookup (text record)
```

### Cache

- **Storage key**: `ensIdentityCache` in `chrome.storage.local`
- **TTL**: 6 hours per entry
- **Schema**: `Record<lowercaseAddress, { name, avatar, resolvedAt, needsAvatar? }>`
- **Forward-name hint**: Add contact may write `needsAvatar: true`; the next
  batch keeps that name and fetches only its avatar before clearing the flag.
- **Manual refresh**: "Refresh ENS Data" button in Account Settings forces re-resolution (ignores cache)

### Remote Image Sanitization

Identity avatars, dapp favicons, and token logos are untrusted metadata. Remote
HTTP(S) images are never rendered while a background fetch is pending; the UI
uses an inert pixel until `avatarImageCache.ts` has produced a safe raster.

- `remoteImagePolicy.ts` accepts public HTTPS on the default TLS port with no
  URL credentials. It rejects reserved/private IPv4, IPv6, IPv4-mapped IPv6,
  localhost/local hostname suffixes, `.test`, `.invalid`, and `.onion`.
- The background follows at most three redirects manually, revalidates each
  target, and omits credentials/referrers. It permits explicit raster MIME
  types; misconfigured `application/octet-stream` responses must additionally
  carry a recognized JPEG, PNG, GIF, or WebP byte signature. SVG and other
  document bytes remain rejected before decoding.
- Downloads are streamed under 2 MiB, decoded to pixels, resized to at most
  128×128, re-encoded as WebP under 512 KiB, and cached for 14 days. The cache
  is limited to 200 entries / 5 MiB and only two remote image fetches may run at
  once. `chrome.storage.local` is the only cache read by renderers; legacy
  DOM-localStorage mirrors are purged and never read.
- Decode/fetch failure stays inert and falls back to the normal letter/blockie
  treatment; it never falls back to rendering the untrusted remote URL.
- `SafeImage.tsx` is the shared renderer primitive for metadata-controlled
  images. Packaged image paths and bounded raster data are allowed directly;
  public HTTPS stays inert until the background returns re-encoded bytes.
- `tokens/nftMetadata.ts` resolves onchain tokenURI metadata under the same public
  HTTPS and manual-redirect policy. JSON is streamed under 256 KiB, inline
  data/name/description fields are bounded, and SVG/HTML image markup is
  discarded. NFT previews then use `SafeImage` rather than a raw iframe.

### RPC Configuration

`ensUtils.ts` reads user-configured RPCs from `chrome.storage.sync` (`networksInfo`), falling back to `DEFAULT_NETWORKS` defaults. This ensures ENS, WNS/GNS, and MegaNames resolution uses the same RPC endpoints configured in Settings → Chains. MegaNames uses the user's MegaETH RPC (chain 4326, default `https://mainnet.megaeth.com/rpc`). WNS/GNS resolution uses the user's Ethereum mainnet RPC and the service contracts configured in `src/utils/wei.ts`.

### Files

| File                                      | Purpose                                                                     |
| ----------------------------------------- | --------------------------------------------------------------------------- |
| `src/lib/ensUtils.ts`                     | ENS/Basename/WNS/GNS/Mega name + avatar resolution, `resolveEnsIdentity()`  |
| `src/lib/ensBatchIdentity.ts`             | Per-chain Multicall3 reverse-name and avatar-record resolution              |
| `src/lib/ensIdentityCache.ts`             | Cache read/write, batch refresh, and forward-name hint seeding              |
| `src/utils/wei.ts`                        | Wei/Gwei Name Service SDK — forward/reverse `.wei` and `.gwei` resolution   |
| `src/utils/mega.ts`                       | MegaNames utility — ABI, constants, `isMega()` for `.mega` resolution       |
| `src/hooks/useEnsIdentities.ts`           | React hook: loads cache, resolves stale entries, exposes `refreshAddress()` |
| `src/components/AccountSwitcher.tsx`      | Integrates hook, renders ENS avatars/names/tags                             |
| `src/components/AccountSettingsModal.tsx` | "Refresh ENS Data" button                                                   |

## RPC Proxy (CSP Bypass)

Many dapps have strict Content Security Policy that blocks connections to RPC endpoints. The inpage script runs in the page's context and is subject to these restrictions.

**Solution**: Proxy RPC calls through the background worker, with a narrow
page-local fast path for non-critical dapp reads.

The inpage bootstrap (`provider/inpage/bootstrap.ts`) installs the
`dapp/rpcForwarding.ts` `window.fetch` observer in
the page context and records HTTP(S) URLs whose request bodies look like
JSON-RPC. `dapp/rpcForwarding.ts` validates each discovered URL with
`eth_chainId` and may forward only allowlisted dapp-originated read methods to
the matching dapp RPC. Forwarded calls have a 3s timeout and fall back to the
normal background proxy on any error.

The dapp RPC fast path is intentionally not used for WalletChan-critical data:
account/chain state, signing, transaction submission, raw tx broadcast, gas
estimation, nonce reads, `eth_getCode`/delegation reads, stateful filter
lifecycle methods, `wallet_*`, and all internal confirmation/simulation/receipt
logic continue through extension-controlled RPCs.

```
Inpage                    Content Script              Background
   │                           │                          │
   │ i_rpcRequest              │                          │
   │ {rpcUrl, method, params}  │                          │
   ├──────────────────────────►│                          │
   │                           │ rpcRequest               │
   │                           ├─────────────────────────►│
   │                           │                          │ fetch(rpcUrl)
   │                           │                          │
   │                           │ {result}                 │
   │                           │◄─────────────────────────┤
   │ rpcResponse               │                          │
   │◄──────────────────────────┤                          │
```

The background worker is not subject to page CSP.
`network/safeRpcForwarding.ts`
accepts only extension-configured RPC URLs and a public read/simulation method
allowlist. It rejects URL credentials and redirects, and uses
`privateNetworkPolicy.ts` to block public sites from loopback/private IPv4,
IPv6, IPv4-mapped-IPv6, and reserved local-hostname targets. A private-origin
site may use a private configured RPC; loopback additionally requires a
loopback origin. Serialized requests are capped at 524,288 characters,
responses are streamed under 8,000,000 bytes, concurrency is capped at 16, and
each request has a 15-second timeout.

## Chain Switching

The extension supports dapp-initiated chain switching via `wallet_switchEthereumChain`. Each tab maintains its own selected chain, and the popup/sidepanel reflects the chain for the currently active tab.

### Dapp-Initiated Chain Switch

When a dapp calls `wallet_switchEthereumChain`:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      Dapp Chain Switch Flow                                  │
│                                                                             │
│  1. Dapp calls wallet_switchEthereumChain({ chainId: "0x2105" })            │
│  2. Impersonator sends i_switchEthereumChain to content script              │
│  3. Content script looks up chainId in networksInfo:                        │
│     - If FOUND: Save chainName to storage, send switchEthereumChain         │
│     - If NOT FOUND: Send switchEthereumChainError with error message        │
│  4. If the chain actually changed, content script asks background to show   │
│     a browser notification using the resolved chain icon when available     │
│  5. Impersonator receives response:                                         │
│     - Success: Updates provider chainId, emits chainChanged event           │
│     - Error: Rejects promise with error (dapp can catch and handle)         │
│  6. Popup/sidepanel storage listener detects chainName change               │
│  7. Network dropdown updates to reflect new chain                           │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Unsupported Chain Handling

If the dapp requests an unsupported chain ID:

- Content script checks `networksInfo` for the chain
- If not found, sends `switchEthereumChainError` message
- Impersonator rejects the promise with EIP-1193 error code `4902` and
  message: `"Chain {chainId} is not supported"`
- Dapps/libraries such as viem can then follow up with
  `wallet_addEthereumChain`; the add-chain confirmation persists arbitrary
  custom EVM chains into `networksInfo` and auto-switches only when the active
  account type can use that chain

### Per-Tab Chain State

Each browser tab maintains its own chain selection:

- **Content script store**: `store.chainName` holds the chain for that tab
- **Storage sync**: When chain changes, `chainName` is saved to `chrome.storage.sync`
- **Tab switching**: Popup listens for `chrome.tabs.onActivated` events
- **State query**: On tab switch, popup queries new tab via `getInfo` message
- **UI update**: Network dropdown updates to show the active tab's chain

### Popup/Sidepanel Chain Sync

The extension UI stays in sync with chain changes through multiple mechanisms:

| Trigger             | Mechanism                  | Description                          |
| ------------------- | -------------------------- | ------------------------------------ |
| Dapp switches chain | `chrome.storage.onChanged` | Detects `chainName` storage updates  |
| User switches tabs  | `chrome.tabs.onActivated`  | Queries new tab's content script     |
| User selects chain  | `useUpdateEffect`          | Sends `setChainId` to content script |
| Popup opens         | `init()`                   | Queries current tab via `getInfo`    |

## Sensitive Data Encryption

Both the Bankr API key and private keys are encrypted using AES-256-GCM with PBKDF2 key derivation.

The stable `src/chrome/crypto.ts` and `cryptoUtils.ts` facades expose the
focused `src/chrome/cryptography/` implementation: bounded persisted-field
codecs, fixed PBKDF2 policy, legacy password ciphertext, 32-byte vault-key
wrapping/direct encryption, and vault-first Bankr credential lookup are
separate review boundaries. Private-key entry encryption remains behind the
stable `src/chrome/vaultCrypto.ts` facade over
`src/chrome/vault/entryCrypto.ts`, `repository.ts`, and `operations.ts`:

### Legacy System (Pre-Vault Key)

```
User Password
      │
      ▼
PBKDF2 (600,000 iterations, random salt)
      │
      ▼
AES-256-GCM Key
      │
      ▼
Encrypt Sensitive Data (random IV)
      │
      ▼
Store in chrome.storage.local:
{
  encryptedApiKey: { ... },    // API key encrypted with password
  encryptedVault: { ... },      // Private keys encrypted with password
}
```

### Vault Key System (Current)

After migration, the vault key system is used for better multi-password support:

```
Master/Agent Password
      │
      ▼
PBKDF2 (600,000 iterations)
      │
      ▼
Decrypt Vault Key from encryptedVaultKeyMaster or encryptedVaultKeyAgent
      │
      ▼
Vault Key (32-byte AES)
      │
      ▼
Decrypt Sensitive Data:
{
  encryptedVaultKeyMaster: { ... },  // Vault key encrypted with master password
  encryptedVaultKeyAgent: { ... },   // Vault key encrypted with agent password (optional)
  encryptedApiKeyVault: { ... },     // API key encrypted with vault key
  pkVault: {                         // Private keys encrypted with vault key
    entries: [
      { id: "...", keystore: { ciphertext, iv, salt: "" } }  // salt="" indicates vault-key encryption
    ]
  },
  accounts: [...]                    // Account metadata (no sensitive data)
}
```

**Migration Process**:

1. On first unlock with master password after v1.3.0+, vault key system is created
2. API key is re-encrypted with vault key → saved to `encryptedApiKeyVault`
3. All private keys are re-encrypted with vault key → `pkVault` entries updated with `salt: ""`
4. Agent password can decrypt the general vault key → that key decrypts the API key and routine-signing private keys
5. Master and agent passwords can both perform routine signing, while account/secret mutations, recovery-phrase access, factor management, and master-password rotation remain master-only

**Storage Format Detection**:

- `salt === ""` in keystore → vault-key encrypted (current format)
- `salt !== ""` in keystore → password encrypted (legacy format, backward compatible)

**IMPORTANT**: When saving credentials after vault key migration:

- API keys: Use `encryptedApiKeyVault` (encrypted with vault key), NOT `encryptedApiKey`
- Private keys: Use vault-key encryption via `encryptPrivateKeyWithVaultKey()`, NOT password encryption
- The system automatically detects which format is in use and saves to the correct location

**Security Note**: Private keys are decrypted only in the service worker for
normal signing. An explicit reveal action may return one key to the exact
trusted WalletChan UI only after fresh master-password verification; keys are
never exposed to content scripts, inpage scripts, webpages, or unrelated
extension documents. See [PK_ACCOUNTS.md](./PK_ACCOUNTS.md) for detailed
security architecture.

### Passkey/Biometric Unlock

Passkey unlock is an optional local wrapper around wallet key capabilities:

```
WebAuthn PRF output
      ├─ HKDF("vault") ─────→ unwrap general vault key
      └─ HKDF("mnemonic") ─→ unwrap dedicated mnemonic key (V2 only)
                                      │
                                      ▼
                         Hydrate normal master session caches
```

- Chrome + platform authenticator + WebAuthn PRF are required. WebAuthn omits
  explicit `rp.id` / `rpId`, so Chrome uses the extension origin as the
  relying party and native prompts show `chrome-extension://...`.
- V1 records wrap only the general vault key. They existed only in
  unreleased/local development builds, not any published extension version.
  The compatibility decoder avoids stranding those local profiles and retains
  routine signing, but Add Account deliberately blocks every new local-account
  path until biometric unlock is removed and re-enabled as V2 with the master
  password.
- V2 records use purpose-separated HKDF subkeys to wrap both the general vault
  key and a dedicated mnemonic key. Setup also creates/converts the matching V2
  `mnemonicVault` in the same `chrome.storage.local.set()` call; neither half can
  commit without the other.
- New V2 mnemonic vaults include an authenticated key check. This proves that
  the independently master-wrapped and passkey-wrapped mnemonic keys match even
  before the first phrase is stored. Populated early V2 records without the
  check remain readable by authenticating their existing entries; an empty
  early V2 passkey record requires an explicit master-password upgrade before
  biometric seed access. `getPasskeyUnlockStatus.mnemonicCapable` reports this
  stored-record distinction, while `mnemonicSessionReady` reports whether the
  current in-memory authorization generation actually holds the matching key.
  Settings offers the upgrade instead of claiming full access.
  Settings → Add Account uses the same status to hide private-key and seed
  create/import/derive controls before any secret enters renderer state; a
  signing-only legacy biometric session instead links directly to Biometric
  Unlock settings for master-password reconfiguration.
- `passkeyUnlock` lives only in `chrome.storage.local`; it is not synced.
- Passkey unlock sets `passwordType` to `"master"` but does not cache or store the master password.
- Passkey setup stores the local wrapper only after backend master-session
  validation and hydration succeed.
- Passkey creation requests the wrapping PRF output during the user-verifying
  registration ceremony and uses it directly when the authenticator returns
  it, avoiding a second biometric prompt. Authenticators that omit
  creation-time PRF results fall back to one assertion to obtain the output.
- Passkey unlock re-reads the authoritative configured `autoLockTimeout`
  before hydration and again before committing success. With native
  `storage.session`, every passkey session persists only an encrypted 32-byte
  general vault capability. A fresh AES-GCM key is split between the
  memory-backed session ciphertext and `local.sessionEncKey`; V2 AAD binds the
  ciphertext to the session ID, master authority, current validated passkey
  fingerprint, session start, selected timeout, and absolute expiry. Finite
  restoration requires an exact current-timeout match and `now < expiresAt`;
  repeated worker restarts preserve rather than reset that deadline. V1
  session envelopes remain accepted only for explicit Never compatibility.
  No master password, PRF output, Bankr API key, private/derived key, seed
  phrase, or mnemonic key is persisted.
- After MV3 service-worker suspension, the restored general capability
  rehydrates Bankr/private-key/already-derived seed signing without another
  WebAuthn ceremony. V2 mnemonic-decryption authority is intentionally not
  restored, so seed creation/import/derive and phrase recovery require a fresh
  V2 assertion or explicit master-password path. Browser close, manual lock,
  factor removal, password rotation, reset, malformed state,
  passkey-record replacement, expiry, or any timeout change revokes/fails the
  capability closed. Browsers without native `storage.session` retain only
  non-secret metadata and cannot cold-restore either finite or Never sessions.
- Add Account checks `mnemonicSessionReady` before entering seed setup, before
  generating/importing, before opening an existing-group address picker, and
  again before persistence. When a cold-restored V2 session lacks the live-only
  key, the renderer runs the same WebAuthn PRF assertion and `unlockWithPasskey`
  hydration used by the unlock screen, then proceeds only after refreshed
  status proves the mnemonic key is live. Cancelling leaves all staged input in
  the current trusted renderer and performs no background mutation.
- Normal transaction/signature confirmations use the hydrated API key/private-key vault caches.
- Master-authorized vault mutations that only need the vault key work after
  biometric unlock without a cached plaintext password. This includes adding
  private-key accounts and adding/updating Bankr API credentials. UI preflights
  must check `isWalletUnlocked`, not `getCachedPassword`, for these operations.
- V2 mnemonic ciphertext is encrypted by the cached mnemonic key, so a V2
  biometric master session can create/import/preview/derive without caching the
  plaintext master password. V1 password-only vaults continue using the cached
  master password. Seed-phrase accounts sign through derived keys in `pkVault`.
- Recovery-phrase reveal always requires explicit master-password verification,
  even when a V2 mnemonic key is cached.
- Key/phrase reveal captures the auth epoch before that verification and uses
  `secretRevealHandlers.ts` to hold the wallet-secret operation lock through
  the final master-session check, decryption, and response invocation. A lock,
  password/factor mutation, or reset that linearizes first cannot receive a
  stale plaintext response afterward.
- Explicit master-password verification proves the unwrapped general key
  against every current Bankr/private/derived key and proves V2 mnemonic
  recovery. Merely decrypting a syntactically valid but unrelated replacement
  wrapper cannot authorize revealing a key already cached by biometrics.
- Secret reveal, master password changes, and passkey removal still require explicit master password verification.
- Master password change and passkey removal first prove that the general
  master wrapper recovers the Bankr credential plus every private/derived key
  with its correct account address. They also prove that the V2 mnemonic master
  wrapper decrypts every valid phrase and reproduces every seed account. A
  corrupt or mismatched-but-decryptable wrapper fails closed and preserves the
  passkey. A valid password change rewraps the dedicated mnemonic key and clears
  the passkey; reset clears all wallet material.
- Passkey and agent-factor removal revoke `local.sessionEncKey` after every
  recovery/epoch proof but before deleting the factor. A failed revocation
  leaves the factor intact. After the factor commit, in-memory authority is
  cleared synchronously; remaining native-session ciphertext is
  non-restorable residue and cleanup is best-effort. Master-password rotation
  is not vulnerable to restoration by its old envelope because its atomic
  commit replaces the master wrapper and clears the agent wrapper before
  reporting success.
- Settings → Change Password uses an explicit two-step master-password flow:
  verify the current password locally, then enter the replacement. It never
  routes a biometric session through the generic unlock screen, because a
  successful passkey assertion cannot recover the plaintext master password.
  The serialized rotation verifies the current password again before writing.
- Settings → Biometric Unlock uses the same in-Settings step-up pattern when
  enabling the factor. The shared `BiometricUnlockSetup` screen collects the
  explicit master password, calls `verifyPasskeySetupPassword`, then binds the
  WebAuthn ceremony to `setupPasskeyUnlockWithPassword`. A biometric session
  therefore stays in Settings instead of being routed through the generic
  unlock screen. Cancelling returns to the biometric status screen.
- Settings → Agent Password also collects the explicit current master password
  even when the active master session came from a passkey. The serialized
  setter unwraps and validates complete general-vault and V2 mnemonic recovery
  before writing `encryptedVaultKeyAgent`; passkey authority alone never stands
  in for plaintext master-password proof.
- `authTransition.ts` serializes session restoration plus
  lock/unlock/setup/removal/agent-factor/password/reset mutations across open
  views. Each WebAuthn ceremony carries a random
  per-service-worker epoch; any newer lock, password change, reset, factor
  removal, successful unlock, or worker restart makes the older result stale.
- Passkey payloads and stored wrappers are decoded and length-checked before
  cryptographic use (32-byte PRF input/output, 12-byte GCM IV, 48-byte wrapped
  general/mnemonic key, and WebAuthn credential IDs capped at 1023 bytes).
- Updating `lastUsedAt` is best-effort after successful hydration. Storage
  metadata failure cannot leave the UI reporting failure while caches remain
  silently unlocked, and every router branch returns a structured error.
- Explicit `lockWallet` broadcasts `suppressPasskeyAutoPrompt: true` after
  clearing auth state. Each UI surface that was already open keeps that flag
  only in renderer memory, so its unlock page skips the automatic prompt while
  retaining the manual biometric button. Closing and reopening the popup
  creates a fresh surface and auto-prompts again.
- `auth/sessionTermination.ts` acquires the wallet-secret operation lock before
  invalidating the auth epoch or clearing cached keys. This linearizes manual
  lock with account/seed mutations: a mutation that acquired the lock first
  finishes with its original key material, while a queued mutation observes a
  stale epoch and fails. Cached vault keys are never cleared halfway through a
  secret-state commit.
- `addKeyToVault` uses password encryption only for genuinely pre-migration
  wallets. If `encryptedVaultKeyMaster` exists but its cached data key has
  expired, account creation fails and asks for re-unlock; it cannot create a
  fresh mixed-format legacy entry at the auto-lock boundary.
- Automatic and manual biometric unlock share a renderer-local single-flight
  prompt gate. Starting either ceremony consumes that Unlock screen's automatic
  prompt. This prevents a successful manual unlock from scheduling a second
  WebAuthn prompt while the old Unlock screen remains mounted for its fade to
  Home; failed or cancelled ceremonies can still be retried explicitly.
- The unlock mascot is presentation-only and observes existing UI lifecycle
  state. Empty password remains sleeping even when focused; typing or an active
  password/passkey check becomes attentive; incorrect credentials become
  invalid; passkey cancellation falls back to sleeping/password mode; and a
  successful unlock commits one visual frame before the existing root fade.
  The mascot never starts, retries, cancels, or timer-gates authentication. The
  success frame is signaled at App's shared unlock-routing boundary because the
  secret-free cross-surface unlock broadcast can beat the originating callback.
  That committed success state also closes the outgoing Unlock screen's
  automatic passkey-prompt window before App clears renderer-local suppression
  for the next session, preventing a biometric prompt from appearing over Home
  after password unlock. Visible surfaces hold the completed success pose for
  500ms before the existing root fade so the sparkle reaction is legible;
  reduced-motion surfaces use a short 120ms static acknowledgment, and hidden
  sibling extension pages route immediately.

### Session Caching (Wallet Lock/Unlock)

Wallet lock flow for secure credential management:

`sessionCache.ts` remains the export-only compatibility API used by handlers.
Under `chrome/session/`, `inMemoryCache.ts` owns one decrypted capability
generation, `timeoutValues.ts` owns the pure duration allowlist,
`autoLockPolicy.ts` owns timeout normalization/storage caching,
`cacheAccess.ts` owns expiry-aware selectors, including the authenticated hard
expiry installed by finite passkey restoration, and `teardown.ts` owns complete
memory/persistence clearing. `timeoutTransitions.ts` owns finite-default and
timed/Never transitions; `restoration.ts` owns serialized authoritative
password-Never/passkey finite-or-Never recovery, unlock proof, password-type
binding, post-unlock timeout/expiry rechecks, and
auth-epoch invalidation. `persistence.ts` owns password/shared recovery state,
`passkeyPersistence.ts` plus `passkeyCredentialRecord.ts` own the exact
factor-bound general-vault capability, and `storage.ts` owns the cross-browser
adapter. Lower layers never import the facade or authentication handlers.

- Decrypted API key, **private keys vault**, and password are cached in background worker memory
- **Private keys are NEVER sent to UI** - only used internally for signing
- Cache expires based on **configurable auto-lock timeout** (default: 15 minutes)
- Cache cleared on browser close or extension suspend
- When locked, user must enter password before:
  - Viewing the main wallet interface
  - Confirming any pending transactions or signature requests
- Unlock persists across popup open/close cycles (until cache expires)
- With native `storage.session`, passkey sessions survive service-worker
  suspension until their authenticated finite deadline, or for the browser
  session under explicit Never. Password restoration remains Never-only.
  Passkey restoration rehydrates routine signing authority without persisting
  wallet plaintext secrets.
- Switching a live passwordless biometric session from timed to Never cannot
  export its non-extractable cached key or synthesize a persisted capability.
  It remains live in the current worker; the next explicit passkey unlock under
  Never establishes secure resume. The UI discloses this one-time edge.

#### Agent Password (Optional Secondary Password)

Users can optionally configure an **agent password** that allows AI agents to unlock the wallet for normal operations while protecting private key reveal:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Agent Password Architecture                          │
│                                                                             │
│  Vault Key System:                                                          │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  Master Password → PBKDF2 → encrypts vault key → encryptedVaultKeyMaster│
│  │  Agent Password  → PBKDF2 → encrypts vault key → encryptedVaultKeyAgent │
│  │                                    ↓                                    │
│  │                              Vault Key (32-byte AES)                    │
│  │                                    ↓                                    │
│  │                    Decrypts: API key, private key vault                 │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  Access Levels:                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  Master Password:                                                    │   │
│  │    ✅ Unlock wallet                                                  │   │
│  │    ✅ Sign transactions                                              │   │
│  │    ✅ Sign messages                                                  │   │
│  │    ✅ Create ERC-7715 / custom EIP-7702 authority                   │   │
│  │    ✅ Reveal private keys                                            │   │
│  │    ✅ Reveal seed phrases                                            │   │
│  │    ✅ Add seed phrase / derive accounts                              │   │
│  │    ✅ Manage agent password settings                                 │   │
│  │    ✅ Change master password                                         │   │
│  │    ✅ Change Bankr API key & address                                 │   │
│  ├─────────────────────────────────────────────────────────────────────┤   │
│  │  Agent Password:                                                     │   │
│  │    ✅ Unlock wallet                                                  │   │
│  │    ✅ Sign transactions                                              │   │
│  │    ✅ Sign messages                                                  │   │
│  │    ❌ Create ERC-7715 / custom EIP-7702 authority (blocked)         │   │
│  │    ❌ Reveal private keys (blocked)                                  │   │
│  │    ❌ Reveal seed phrases (blocked)                                  │   │
│  │    ❌ Add seed phrase / derive accounts (blocked)                    │   │
│  │    ❌ Manage agent password settings (blocked)                       │   │
│  │    ❌ Change master password (blocked)                               │   │
│  │    ❌ Change Bankr API key & address (blocked)                       │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Storage Schema** (in `chrome.storage.local`):

| Key                       | Description                                                  |
| ------------------------- | ------------------------------------------------------------ |
| `encryptedVaultKeyMaster` | Vault key encrypted with master password                     |
| `encryptedVaultKeyAgent`  | Vault key encrypted with agent password (optional)           |
| `encryptedApiKeyVault`    | API key encrypted with vault key (current format)            |
| `encryptedApiKey`         | API key encrypted with password (legacy, kept for migration) |
| `agentPasswordEnabled`    | Boolean flag for UI                                          |
| `mnemonicVault`           | V1 password-encrypted phrases or V2 dedicated-key phrases + master wrapper |
| `passkeyUnlock`           | V1 general-key wrapper or V2 general/mnemonic wrappers       |

**Migration**: Existing users are automatically migrated to the vault key system on first unlock with master password. The migration:

1. Generates a new 256-bit vault key
2. Encrypts vault key with master password → saved to `encryptedVaultKeyMaster`
3. Re-encrypts API key with vault key → saved to `encryptedApiKeyVault`
4. Re-encrypts all private keys with vault key → `pkVault` entries updated (v1.3.0+)
5. Keeps V1 seed phrases master-password encrypted; derived private keys in `pkVault` are migrated for routine signing. Explicit biometric setup later converts the complete V1 mnemonic vault to V2 atomically.

**Partial Migration Detection**: If the general vault-key system exists but private keys are still password-encrypted (e.g., upgraded from v1.2.0 to v1.3.0), the system automatically detects this on next master password unlock and completes the migration. Agent password unlock fails closed until migration completes. V1 mnemonics are a supported format, not a partial migration. If an interrupted older migration left only legacy `encryptedApiKey`, master-password rotation decrypts it with the old password, re-encrypts it with the unchanged general key, and clears the legacy ciphertext in the same atomic write.

**Credential Saving** (v1.3.0+): When saving/updating credentials after wallet setup:

**API Keys**:

- If `cachedVaultKey` exists → encrypt with vault key → save to `encryptedApiKeyVault`
- If no vault key and no `encryptedVaultKeyMaster` exists (pre-migration setup/legacy) → encrypt with password → save to `encryptedApiKey`
- `saveEncryptedApiKey()` refuses to write legacy `encryptedApiKey` once `encryptedVaultKeyMaster` exists, so post-migration callers must use the vault-key path
- `prepareApiKeyUpdateWithCachedPassword()` encrypts without publishing;
  account settings then commit the ciphertext and Bankr account address in one
  `chrome.storage.local.set()`, and update the in-memory API-key cache only
  after that write succeeds. A failed write therefore preserves both the old
  address and old credential. Biometric master sessions use the cached general
  vault key and refresh the API-key cache timestamp without requiring a
  plaintext password.
- Before adding or updating a Bankr account, `/wallet/sign` signs a fixed,
  harmless WalletChan challenge. WalletChan cryptographically recovers the
  signer from that signature and requires it to equal the proposed address;
  the API's self-reported `signer` field is not trusted as proof. Only one new
  Bankr account may be added because the encrypted API credential is
  wallet-wide. Existing profiles that already contain multiple Bankr rows stay
  readable, but each submission is preflight-verified against its pinned row.
- The legacy `saveApiKeyWithCachedPassword` message returns an explicit error
  and performs no mutation. Credential-only updates cannot bypass the combined
  key/address verification path.

**Private Keys**:

- If `cachedVaultKey` exists → encrypt with vault key via `encryptPrivateKeyWithVaultKey()` → save to `pkVault` with `salt: ""`
- If no vault key (legacy) → encrypt with password via `encryptPrivateKey()` → save to `pkVault` with `salt: "base64..."`
- `vault/recordCodec.ts` is the bounded released-V1 decoder. It accepts only
  version 1, at most 10,000 entries, non-empty IDs of at most 512 characters,
  12-byte IVs, bounded AES-GCM ciphertext, and either the released 16-byte
  password salt or the current empty vault-key salt. Unknown versions and
  malformed fields fail closed before decryption.
- A structurally valid V1 record with duplicate IDs remains readable so a
  profile affected by a historical read/modify/write race is not locked out.
  Add/remove/save and password/vault-key migration preparation require unique
  bounded IDs and perform zero writes for an ambiguous record. The V1 key,
  schema, ciphertext bytes, and encryption parameters are unchanged.
- Handled automatically by `addKeyToVault()` in `vault/operations.ts` and
  re-exported from `vaultCrypto.ts`; callers do
  not need a plaintext password when a biometric master session has cached the
  vault key.

**Seed Phrases**:

- V1 password-only vaults use master-password PBKDF2 + AES-256-GCM and remain readable without an eager migration.
- V2 vaults use a dedicated mnemonic key with per-group AAD. Master password and V2 passkey wrap that key independently; the agent/general vault key cannot decrypt it.
- V2 biometric master sessions may create/import/preview/derive; agent sessions remain blocked. Reveal always requires explicit master-password verification.
- `addSeedPhraseGroup` requires the trusted renderer to supply an already
  generated/entered valid phrase. Generation happens first through the
  extension-only `generateMnemonic` handler, and persistence occurs only after
  the renderer's explicit backup acknowledgement; the save handler has no
  silent-generation fallback.

**Security Invariants**:

1. Private key reveal is **always blocked** when unlocked with agent password
2. Seed phrase reveal is **always blocked** when unlocked with agent password
3. Adding seed phrases / deriving accounts is **blocked** with agent password
4. Agent password management requires the master password and proves that the
   master-wrapped general key recovers every current credential/local key before
   creating or deleting the secondary wrapper
5. Master password change requires master password (agent cannot change it)
6. Bankr API key & address change requires master password
7. Both passwords use the same auto-lock timeout
8. ERC-7715 grants and non-default/custom EIP-7702 Set operations require a
   live master session through their durable grant/raw-send boundary. Routine
   canonical-default EIP-7702 batching and all authority revocations remain
   available to agent sessions.
8. Master and agent wrapper decryption are attempted in parallel to avoid a
   password-type timing oracle
9. Changing the master password invalidates the agent and passkey wrappers; the
   user must explicitly set those secondary factors up again

#### Auto-Lock Timeout Configuration

Users can configure the auto-lock timeout via Settings → Auto-Lock:

| Option         | Value (ms) | Description                        |
| -------------- | ---------- | ---------------------------------- |
| 1 minute       | 60,000     | Quick lock for high security       |
| 5 minutes      | 300,000    | Short timeout                      |
| **15 minutes** | 900,000    | **Default**                        |
| 30 minutes     | 1,800,000  | Medium timeout                     |
| 1 hour         | 3,600,000  | Extended session                   |
| 4 hours        | 14,400,000 | Long session                       |
| Never          | 0          | Never auto-lock (manual lock only) |

**Implementation Details**:

- Setting stored in `chrome.storage.sync` with key `autoLockTimeout`
- Missing or invalid values resolve to and are initialized as 15 minutes on
  install/update. A stored `0` is preserved only as an explicit Never choice;
  absence never enables persisted-session restoration.
- Background worker caches the timeout value in memory for performance
- Storage change listener keeps cached value in sync across tabs
- When timeout is `0` ("Never"), cache validation always passes
- All credential getters enforce the same timeout, including the vault key
  and cached password type. When a timed session expires, the background
  worker clears the cached API key, password, private-key vault, vault key,
  and password type together.
- `isWalletUnlocked()` accepts the legacy Bankr/private-key cache paths or one
  coherent, expiry-checked `{ general vault key, password type }` generation.
  This keeps view-only-only wallets unlocked after master, agent, biometric,
  and native-session hydration while rejecting either partial capability alone.
- Changes take effect immediately (no restart required)
- **Validation**: `setAutoLockTimeout` validates against allowed values and returns `false` for invalid values

**Message Types**:

| Type                 | Description                                              |
| -------------------- | -------------------------------------------------------- |
| `getAutoLockTimeout` | Get current timeout value                                |
| `setAutoLockTimeout` | Set new timeout value (validated against allowed values) |

#### Native Session Restoration (Password Never; Passkey Finite/Never)

The extension stores a split encrypted session capability in
`chrome.storage.session` to recover from MV3 service-worker restarts without
mistaking worker lifetime for the configured auto-lock policy. Password
sessions are restorable only under explicit Never. Passkey sessions are
restorable under finite settings only before their authenticated absolute
deadline, and under Never until browser-session storage is cleared.

This restoration is enabled only when the browser provides native,
memory-backed `chrome.storage.session`. Supported Chrome and Firefox builds do.
The local-storage compatibility fallback for browsers/forks without that API
remains available for non-secret session state, but restoration is unavailable
there: persisting both recovery halves in the profile
would expose them to an offline profile copy after the browser closes. Updated
workers proactively delete fallback password artifacts written by older builds.
That cleanup also crosses browser capability upgrades: stale `__session__*`
local ciphertext/metadata is removed after native session storage appears, and
the local key half is removed only when it is not protecting a valid current
native restorable session.

**Why This Is Needed**:

Chrome MV3 service workers are frequently suspended/restarted to save resources. When this happens:

1. All in-memory state is cleared (`cachedApiKey`, `cachedVault`, `cachedVaultKey`, etc.)
2. The `suspend` event clears cached credentials
3. Without session restoration, a finite passkey session would be shortened to
   worker lifetime, and Never would not survive a worker restart

**How It Works**:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     Session Restoration Architecture                         │
│                                                                             │
│  On Unlock:                                                                 │
│    1. Generate session ID: crypto.randomUUID()                              │
│    2. Never password: encrypt password with a random AES-256-GCM key        │
│       Finite/Never passkey: encrypt only the 32-byte general vault key      │
│    3. Store in chrome.storage.session:                                      │
│       - sessionId: unique session identifier                                │
│       - sessionStartedAt: timestamp                                         │
│       - autoLockNever: outer consistency marker                            │
│       - encryptedSessionPassword OR encryptedSessionVaultKey                │
│       - passwordType: "master" or "agent"                                  │
│    4. Store the random AES key separately as local.sessionEncKey            │
│    5. Passkey V2 AAD authenticates start, timeout, and absolute expiry      │
│                                                                             │
│  On Service Worker Restart (credentials lost):                              │
│    1. Handler confirms no coherent live wallet capability remains           │
│    2. Call tryRestoreSession():                                             │
│       - Password requires timeout === 0                                     │
│       - Passkey requires exact timeout match and now < authenticated expiry │
│       - Recover either the password or factor-bound general vault key       │
│       - Call handleUnlockWallet(credential) to restore credentials          │
│       - Re-store it without changing the passkey's original deadline        │
│    3. Operation continues with restored credentials                         │
│                                                                             │
│  During A Live Passkey Session:                                             │
│    1. Plaintext cached password is null by design                           │
│    2. Coherent vault-key + master-type state still means unlocked           │
│    3. tryRestoreSession() is a no-op and preserves epoch/mnemonic authority │
│                                                                             │
│  On Manual Lock:                                                            │
│    1. Wait for any earlier wallet-secret mutation to finish                 │
│    2. Set the worker restore barrier, rotate the epoch, and purge secrets   │
│    3. Remove local recovery key first, then session half independently      │
│    4. Either deletion confirms lock; neither broadcasts failure to all UIs  │
│    5. Every open UI blocks/retries; routine restore stays blocked in worker │
│                                                                             │
│  On Auto-Lock Setting Change:                                               │
│    - Any timeout change revokes the old authenticated envelope              │
│    - Timed → "Never": persist a cached password; passkey needs assertion    │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Security Considerations**:

- Password is encrypted with a random key (not stored in plain text)
- Session envelope parsing is exact and allocation-bounded before decoding:
  `sessionEncKey` must decode to 32 bytes, the IV to 12 bytes, and the
  authenticated ciphertext is capped at 1 MiB plus the AES-GCM tag. Malformed,
  oversized, or torn records fail closed as a locked session.
- `chrome.storage.session` is cleared when the browser closes
- Session storage is not synced across devices
- Native session storage is readable by privileged extension contexts: the
  background service worker and extension-origin pages. It is hidden from
  content scripts by default. Every privileged extension page is therefore
  inside the secret-bearing trust boundary; `TRUSTED_CONTEXTS` is the default
  access level and does not narrow storage to the worker alone.
- Browsers without native `storage.session` do not persist a restorable
  password or passkey capability; a worker restart safely returns them to the
  unlock screen.
- Restoration runs through the same serialized auth-transition queue as
  manual lock and factor/password changes. A lock that arrives during restore
  executes immediately afterward and clears the restored state; a restore
  arriving after lock sees no session to recover.
- Passkey and agent-factor removal delete the local recovery-key half before
  their factor commit. If that pre-commit removal fails, the factor is not
  changed; after commit, stale session ciphertext cannot restore a password.
- Manual lock always attempts both recovery-half deletions. Either confirmed
  deletion makes the session non-restorable. If neither succeeds, the worker
  broadcasts `walletLockFailedExternal`; every open renderer purges its auth
  state, suppresses biometric auto-prompting, and stays on a blocking retry
  surface. A worker-local barrier also rejects background restoration
  until a fresh explicit password or passkey authentication succeeds.
- Manual lock shares the wallet-secret operation serializer with account and
  recovery-material mutations. It never clears a cached data key underneath a
  mutation that already linearized first.
- A fresh passkey assertion creates a passwordless master session. A missing
  `getCachedPassword()` value is therefore not evidence that the wallet is
  locked. `tryRestoreSession()` first re-reads the authoritative timeout and
  then returns success without rehydrating when one coherent, expiry-checked
  live capability generation already exists. This preserves the current auth
  epoch and the live-only V2 mnemonic key. Only genuinely cold state consumes
  the persisted envelope; cold passkey restore intentionally recovers the
  general vault capability but not mnemonic authority.

**Handlers with Session Restoration**:

The following message handlers may attempt centralized, expiry-checked session
restoration when their required coherent capability is not live. Passwordless
passkey sessions must not restore merely because `getCachedPassword()` is null:

| Handler                            | Purpose                                  |
| ---------------------------------- | ---------------------------------------- |
| `isWalletUnlocked`                 | Main lock state check (used by UI)       |
| `getCachedPassword`                | Check if password is cached (used by UI) |
| `getCachedApiKey`                  | Display API key in settings              |
| `submitChatPrompt`                 | Chat with Bankr AI                       |
| `saveApiKeyWithCachedPassword`     | Update API key while unlocked            |
| `saveBankrApiKeyAndAddress`        | Update Bankr API key and account address while unlocked |
| `verifyMasterPassword`             | Verify an explicitly entered master password without changing session state |
| `changePassword`                   | Rotate the master password after explicit current-password verification |
| `addBankrAccount`                  | Add new Bankr account with API key       |
| `addPrivateKeyAccount`             | Add new private key account              |
| `addSeedPhraseGroup`               | Generate/import seed phrase              |
| `deriveSeedAccount`                | Derive new account from seed phrase      |
| `revealPrivateKey`                 | Reveal private key (security-sensitive)  |
| `revealSeedPhrase`                 | Reveal seed phrase (security-sensitive)  |
| `setAgentPassword`                 | Set agent password after live-master authorization plus explicit current-master-password recovery proof |
| `cancelTransaction`                | Cancel in-progress transaction           |
| `confirmCrossDappBatch`            | Ship the user-assembled cross-dapp batch via Bankr API or PK/SP EIP-7702 local signing |
| `initiateSetDelegation` / `initiateRevokeDelegation` | Queue Smart Account Set/Revoke txs; custom/non-default Set is master-only at queue and confirm/broadcast, while canonical default and revoke retain routine agent-capable signing; final storage mirror is reconciled from `eth_getCode(EOA)` after receipt |

The stable `delegationHandlers.ts`, `delegationStorage.ts`, and
`delegatedAuthorityPolicy.ts` files are compatibility facades over the
`delegation/` audit domain. Set intake validates a private-key/seed account,
captures master authority only for custom/non-default targets, resolves the
chain, and re-probes ERC-7821 before constructing a pinned type-4 self-call.
Queue persistence is serialized with the wallet-secret operation lock for
master-bound custom Set requests, stores the auth epoch with the pending
request, and only then notifies the UI. Revoke and canonical-default Set remain
agent-capable. `delegation/storage.ts` owns the unchanged nested
`customDelegates` record and linearizes each read-modify-write under the shared
`local:customDelegates` storage lock.

**Account pinning for prepared work**:

- Dapp-created pending txs and `wallet_sendCalls` batches are pinned at request creation with `accountId`, `accountAddress`, and `accountType`. Cross-dapp batch add/confirm handlers must resolve that pinned account directly; they must never fall back to the current active account when `params.from` is omitted or when the user switches accounts while the request is open.
- Internal swap/bridge confirmations capture `{ accountId, fromAddress }` when the quote is prepared. `executeSwapDirect`, `executeSwapBatch`, and `executeSwapAtomicPK` must resolve that locked account directly and reject if the stored account address differs from the lock, or if any prepared transaction's `tx.from` / `chainId` differs from the locked values.

**CRITICAL: Adding New Handlers**

When adding a message handler that consumes cached authorization, distinguish a
genuinely cold worker from a live passwordless passkey session. A passkey
session intentionally has no cached plaintext password. Never use
`getCachedPassword() === null` alone as a locked-state or restoration signal.

**Required pattern:**

```typescript
// Restore only when the coherent wallet capability generation is absent.
if (!isWalletUnlocked()) {
  // The primitive owns password-Never and passkey finite/Never policy.
  await tryRestoreSession(handleUnlockWallet);
}

const password = getCachedPassword();
const vaultKey = getCachedVaultKey();
if (!isWalletUnlocked() || (!password && !vaultKey)) {
  sendResponse({ success: false, error: "Wallet must be unlocked" });
  return;
}

// Capture an auth epoch only after any necessary cold restoration.
const operationAuthEpoch = getAuthCeremonyEpoch();
```

Then validate the operation-specific capability: Bankr work needs an API key;
general-vault writes may use either a password or vault key; V2 seed writes need
the live mnemonic key. `tryRestoreSession()` cannot synthesize an explicit
master password and cold passkey restoration deliberately cannot restore the
mnemonic key.

**Why this matters**: Chrome MV3 service workers are frequently suspended and
restarted, so a genuinely cold handler must recover an eligible session. Rehydrating
an already-live passkey session is also unsafe: it changes the authorization
generation and replaces its richer fresh-assertion capabilities with the
narrower cold-restored capability set.

**Storage Schema** (in `chrome.storage.session`):

| Key                        | Type    | Description                          |
| -------------------------- | ------- | ------------------------------------ |
| `sessionId`                | string  | Unique session identifier            |
| `sessionStartedAt`         | number  | Timestamp when session started       |
| `autoLockNever`            | boolean | Outer Never/finite consistency marker |
| `encryptedSessionPassword` | object  | Encrypted password `{ data, iv }`; the separate 32-byte key half is `chrome.storage.local.sessionEncKey` |
| `encryptedSessionVaultKey` | object  | Exact encrypted passkey general-key capability; V2 authenticates binding and finite timing metadata |

**Message Types**:

| Type                | Description                                              |
| ------------------- | -------------------------------------------------------- |
| `validateSession`   | Check if session is valid (returns { valid, sessionId }) |
| `tryRestoreSession` | Attempt to restore session (returns boolean)             |

**UI Port Heartbeat and Reconnection**:

The main wallet UI (`app/hooks/useRuntimeMessaging.ts`) and onboarding page
maintain trusted keepalive ports to the service worker. Chrome 114+ no longer
counts opening a long-lived port as worker activity, so
`app/uiKeepalive.ts` sends an immediate, secret-free
`wallet-ui-keepalive` pulse and repeats it every 20 seconds while the renderer
is open. This is below Chrome's 30-second MV3 idle deadline. The pulse keeps the
worker hosting the in-memory session alive but never refreshes auth cache
timestamps, so 1/5/15/30-minute and longer finite settings still expire through
the normal cache getters. If Chrome nevertheless suspends the worker, an
unexpired passkey session may cold-restore only to its original authenticated
deadline; password sessions remain cold-restorable only under exact Never.

When the service worker restarts unexpectedly:

1. The port disconnects
2. `onDisconnect` listener detects this
3. After 100ms delay, `establishKeepalivePort()` reconnects
4. The new port sends its immediate pulse and resumes the 20-second heartbeat
5. This ensures `activeUIConnections` tracking remains accurate

The port does not make expired credentials valid. Cache getters still enforce
`autoLockTimeout`; reconnecting the sidepanel after the timeout has elapsed
must route to unlock, not revive the previous session. When the last UI port
disconnects, the cache timestamps are reset so the idle countdown starts from
close time.

**See**: `src/app/hooks/useRuntimeMessaging.ts` and
`src/app/uiKeepalive.ts` for heartbeat/reconnection behavior, and
`src/chrome/background/lifecycle/trustedUiPorts.ts` for exact trusted-sender and
pulse-shape enforcement.

#### Password Caching for API Key Changes

When changing the API key while the wallet is unlocked:

- Uses the **cached password** to encrypt the new API key
- No need to re-enter password if session is active
- If cache expires, prompts for "Current Password" with message "Session expired"
- Existing API key is **pre-filled** in the form (decrypted from cache)

#### Password Change Flow

When changing the wallet password (Settings → Change Password):

- **Explicit current password required**: A biometric session proves possession of
  the vault key but does not contain the plaintext master password. The user must
  enter the current master password before rotation.
- **Two-step verification**: `verifyMasterPassword` advances the Settings UI,
  while `changePassword` independently re-verifies the same password inside the
  serialized mutation. The first check is never treated as authorization for the
  second step.
- **Agent sessions are blocked in the background**: The guard restores a persisted
  "Never" session first, so a service-worker restart cannot turn an agent session
  into an untyped session that bypasses the restriction.
- **Cache cleared**: After password change, user must unlock with new password
- Password handling stays entirely in background worker (never exposed to UI)

**With Vault Key System** (current) — atomic write pattern:

1. Decrypt the master vault-key wrapper with the explicitly entered current password.
   Require the result to be a 32-byte key that recovers the current non-empty
   Bankr credential and every `pkVault` entry, with every local key reproducing
   its account address. Abort without writes on malformed/missing/mismatched data.
2. If a V2 mnemonic vault exists, unwrap its mnemonic key through the current
   master wrapper, validate every BIP39 phrase and seed-group record, and
   re-derive every seed-account address. Abort without writes on any mismatch.
3. Compute the new general vault-key wrapper and either a new V2 mnemonic-key
   master wrapper (ciphertext entries unchanged) or replacement V1 phrase
   ciphertext (all in memory)
4. If a partial migration left `encryptedApiKey` without
   `encryptedApiKeyVault`, migrate the credential to the unchanged general key
   and clear the legacy ciphertext in the final atomic write. If `pkVault`
   contains legacy password-encrypted entries from a partial migration, migrate
   only those entries to the vault key in memory; existing vault-key entries
   are preserved byte-for-byte
5. Decrypt and byte-compare the prepared master wrapper before any storage
   write, so a verification failure cannot be reported after rotation commits
6. **Single atomic `chrome.storage.local.set()`** writes all changed encrypted data
   and clears the agent/passkey wrappers together
7. **Capability-encrypted data stays unchanged**:
   - API key (in `encryptedApiKeyVault`) unchanged
   - Private keys (in `pkVault` with `salt: ""`) unchanged
   - V2 seed-phrase ciphertext unchanged; only `masterWrappedKey` changes
8. **Secondary factors are cleared** - `encryptedVaultKeyAgent` and
   `passkeyUnlock` must be set up again after the master password changes
9. In-memory credentials and the restorable session record are cleared, and all
   open extension surfaces are told to route to unlock

**Why atomic**: If any re-encryption step fails (OOM, crypto error), no storage writes happen. Without atomicity, the vault key could be updated to the new password while legacy entries remain encrypted with the old password, making data inaccessible.

**Note (v1.3.0+)**: After migration, `pkVault` entries are encrypted with the
general vault key (`salt: ""`). V1 `mnemonicVault` phrases are re-encrypted on
password changes; V2 phrase ciphertext stays under its dedicated mnemonic key
and only the master wrapper is rotated.

**Legacy System** (pre-vault key migration):

1. Decrypt API key, private-key vault, and mnemonic vault with old password
2. Re-encrypt all present legacy secrets with new password in memory
3. Persist `encryptedApiKey`, `pkVault`, and `mnemonicVault` together in one `chrome.storage.local.set()` call

### Pending User-Review Request Storage

Transactions, signatures, ERC-5792 batches, cross-dapp batches, dapp
connections, add-chain prompts, watch-asset prompts, and ERC-7715 permission
requests are stored persistently in `chrome.storage.local`:

- Closing popup does NOT reject/cancel pending transactions
- Pending requests survive popup close, browser restart
- Extension badge shows count of pending requests
- User-review prompts do not auto-expire. Injected dapps wait without a local
  timer, persisted rows survive browser/service-worker restarts, and every
  Bankr/private-key/seed confirmation path ignores request age.
- WalletConnect transaction/signature/permission routing records also remain
  until the prompt resolves. Only short-lived pre-prompt intake claims and
  already-terminal relay response records retain bounded cleanup.
- A prompt remains pending until the user confirms/rejects it or an
  explicit authorization, WalletConnect-session, account, reset, or
  cancellation lifecycle terminalizes it.
- Save/remove writes are serialized with `storageLock.ts`.
- ERC-5792 batch intake may briefly persist a non-actionable
  `intakeStatus: "validating"` row after account/origin pinning. This lets a
  cold sidepanel render the real request before an atomic EIP-7702 RPC probe
  returns. The marker is removed only after the second pending authorization
  check, bundle-status write, durable reread, and final authorization check;
  every Bankr/private-key/seed confirmation path fails closed while it exists.
- `requests/pendingRequestResolution.ts` installs a synchronous, first-action-wins
  claim before any confirmation/rejection work starts. Popup, side panel, and
  full-page surfaces therefore cannot concurrently confirm/reject the same
  transaction, signature, `wallet_sendCalls` bundle, dapp connection, or
  cross-dapp batch. The Bankr, private-key, seed-phrase, and legacy transaction
  routes share the same per-request claim namespace.
- Request editing/splitting uses the same claim. Moving a transaction or
  `wallet_sendCalls` bundle into the cross-dapp batch atomically claims both the
  source request and destination batch, preventing a direct confirmation from
  racing the move and submitting the call twice.
- Terminal handlers remove durable pending state before the claim is released;
  late actions treat a missing request as a tombstone and never overwrite its
  result. Fulfilled pre-effect failures (for example an invalid password) leave
  the request pending and release the claim for retry. Unexpected exceptions
  retain the claim fail-closed for the service-worker lifetime because a remote
  signer or RPC broadcast may already have accepted the operation.
- The older `processingTxIds` / `processingBundleIds` guards remain as
  defense-in-depth for background processing, but they are not the atomic
  resolution boundary.
- Async transaction and batch handlers install a short-lived effect lease
  before returning to the router. The lease keeps rejection and wallet
  reset excluded after durable pending state is consumed and until the
  background signer/submission path reaches its final authorization check.
  Signature handlers remain awaited by the router and also hold an explicit
  lease across local or Bankr signing. Local transaction preparation invokes
  its final account + transport authorization from an after-sign,
  before-broadcast hook. Effect guards release for failures proven to occur
  before publication. Once raw bytes cross the RPC boundary, a lost response
  is committed as a durable pending `broadcastUncertain` hash rather than a
  retryable failure.
- `resetExtension` owns a global resolution barrier before its first password
  or storage await. Reset fails visibly while any confirm/reject/expiry/grant or
  background effect lease is active; a resolving request likewise cannot start
  while reset owns the barrier. Extension-internal direct swap/bridge,
  sponsored-transfer, and atomic swap paths enter the same barrier even though
  they do not originate from a persisted dapp prompt. Fire-and-forget Bankr and
  EIP-7702 swap processors transfer the router claim to an effect lease before
  returning.
- Every externally sourced pending record carries either exact injected
  `{tabId, frameId, senderOrigin}` provenance, exact WalletConnect
  `{topic, requestId, method}` provenance, or an explicit `trustedInternal`
  marker written by the service worker. Legacy/partial external records fail
  closed at confirmation. Cross-dapp entries preserve this provenance when
  moved out of their original queue.
- Bankr transaction, signature, and ERC-5792 pending rows also carry a
  non-secret SHA-256 tag of the authenticated API-key ciphertext generation.
  ERC-5792 intake attaches this tag before its first authorization check and
  persists that same generation; the storage boundary rejects a pre-bound row
  if credential rotation made its tag stale instead of silently retargeting
  the reviewed request.
  Confirmation recomputes that tag at the last safe point; changing the global
  Bankr credential invalidates every older prompt instead of silently signing
  it through a different remote wallet. Pre-upgrade Bankr prompts without a
  tag fail closed. Cross-dapp entries copy the tag before their source row is
  removed. Bankr submit performs its harmless signature challenge first, then
  acquires the wallet-secret operation lock, revalidates pinned account plus
  transport/tag authority, and starts `/wallet/submit` synchronously before
  releasing that lock. A credential rotation during the challenge therefore
  cannot cross the irreversible boundary. Local and Bankr signature handlers
  likewise revalidate after signing and discard the capability if account,
  dapp/WalletConnect authority, or credential generation changed meanwhile.
- Cross-dapp confirmation revalidates each distinct source. It captures all
  injected revocation and WalletConnect termination epochs before async reads,
  then performs one synchronous collective commit immediately before submit.
  A source revoked while another source is still awaiting is removed and
  terminalized without broadcasting; unrelated source groups remain queued.
- User can review and confirm/reject at any time

#### Pending Requests List

When multiple transactions are pending:

- Shows all pending requests with **request numbers** (#1, #2, etc.)
- Displays: origin favicon, hostname, chain badge, timestamp, target address
- Click any request to view full details
- **Reject All** button at the bottom to reject all pending transactions

## Request Surface Positioning

When a dapp connection, transaction, batch, signature, or ERC-7715 permission request is
received, the background worker opens the configured surface. Sidepanel mode
uses the early user-activated route described above at every browser window
size. Popup mode uses a detached window positioned at the top-right of the
dapp's window, including when the user explicitly selected popup mode while
fullscreen.

**See**: `src/chrome/windowing/requestSurface.ts` for surface selection and
`windowing/popupGeometry.ts` / `popupWindow.ts` for placement, reuse, and
creation. `provider/contentBridge/requestSurface.ts` caches the non-secret
sidepanel preference and recognizes the five approval families;
`windowing/providerRequestSurface.ts` consumes the original request gesture,
owns the short-lived cold-renderer hint, and owns the fullscreen notification
fallback. `app/initialApprovalRequests.ts` gates initial routing on the hinted
queue without moving request payloads into the renderer. `extensionPopup.ts`
is an export-only compatibility facade.

**Multi-Monitor Support**:

- Uses `senderWindowId` from the message sender's tab to identify the correct window
- Falls back to `chrome.windows.getLastFocused()` if sender window not available
- Allows negative `left` coordinates for monitors positioned left of primary
- Clamps the fixed-size popup to the sender window's work area when that window
  is narrower or shorter than the preferred placement
- Popup appears on the same monitor as the dapp requesting the transaction

## Cancellation

Users can cancel in-progress transactions (PK/Seed Phrase accounts only):

1. **Local Abort**: `AbortController` aborts the in-flight RPC broadcast

**Bankr API accounts** cannot be cancelled — `/wallet/submit` is synchronous (tx is already broadcast onchain by the time the response returns). The cancel button is hidden in the UI for Bankr account transactions.

## Response Handling

The `/wallet/submit` API returns a structured response:

- `status: "success"` — transaction confirmed onchain, `transactionHash` contains the hash
- `status: "reverted"` — transaction confirmed but reverted, treated as failure
- `status: "pending"` — transaction submitted but not yet confirmed, treated as success
- `submitTransactionDirect()` normalizes `txHash` to `transactionHash`, requires a valid EVM transaction hash for every accepted status, and throws `BankrApiError` for missing/invalid `status`, `success !== true` on non-reverted responses, invalid JSON, or ambiguous pending bodies. This prevents Activity rows from being left pending without a pollable transaction hash.
- Bankr `/wallet/sign`, `/wallet/submit`, and job bodies are streamed under
  fixed byte ceilings and conservative deadlines. Signatures must be 65-byte
  EVM signatures, self-reported signer/type fields must match the request, and
  WalletChan recovers personal-sign/EIP-712 signatures locally before use.
  Submit responses must include the exact reviewed signer, chain ID, and valid
  transaction hash. A harmless signer challenge runs before the irreversible
  submit request; only the submit request flips the effect lease to ambiguous.
  Abort, timeout, oversized, or malformed post-submit responses retain the
  lease and tell the user the outcome is unknown and to check Activity before
  retrying. HTTP 408/409/425/429 and 5xx are also ambiguous; bounded,
  non-retryable 4xx validation/auth failures remain
  definite. Bankr requests reject redirects so the API key cannot follow a
  backend redirect to another origin. Chat prompt submission uses the same
  deadline/byte/error-text bounds and validates the returned job ID before
  polling.

## Build Configuration

The extension has 5 build targets:

| Target     | Config File               | Output                        |
| ---------- | ------------------------- | ----------------------------- |
| Popup      | vite.config.ts            | build/static/js/main.js       |
| Onboarding | vite.config.onboarding.ts | build/static/js/onboarding.js |
| Inpage     | vite.config.inpage.ts     | build/static/js/inpage.js     |
| Inject     | vite.config.inject.ts     | build/static/js/inject.js     |
| Background | vite.config.background.ts | build/static/js/background.js |

Build command: `pnpm build`

## Manifest Configuration

`public/manifest.json` key configurations:

```json
{
  "background": {
    "service_worker": "static/js/background.js",
    "type": "module"
  },
  "permissions": [
    "activeTab",
    "favicon",
    "storage",
    "sidePanel",
    "notifications",
    "tabs",
    "declarativeNetRequestWithHostAccess",
    "unlimitedStorage"
  ]
}
```

### Permissions

| Permission                         | Purpose                                                                 |
| ---------------------------------- | ----------------------------------------------------------------------- |
| `activeTab`                        | Access to the currently active tab                                      |
| `favicon`                          | Read Chrome's processed favicon for exact local IPFS/IPNS and approved hosted gateway pages |
| `storage`                          | Store encrypted API key, settings, transaction history                  |
| `sidePanel`                        | Enable sidepanel mode (Chrome 114+)                                     |
| `notifications`                    | Show transaction success/failure notifications                          |
| `tabs`                             | Query and close extension tabs (e.g., onboarding page)                  |
| `declarativeNetRequestWithHostAccess` | Scope ENS Browsing redirects and local IPFS HTTPS-upgrade exemptions |
| `unlimitedStorage`                 | Keep storage.local quota headroom for wallet-critical persistent writes |

## Message Types

### Inpage → Content Script (postMessage)

| Type                    | Description          |
| ----------------------- | -------------------- |
| `i_sendTransaction`     | Transaction request  |
| `i_signatureRequest`    | Signature request    |
| `i_rpcRequest`          | RPC call request     |
| `i_switchEthereumChain` | Chain switch request |
| `i_addEthereumChain`    | Add/switch chain request |
| `i_watchAsset`          | Watch asset request |
| `i_walletGetCapabilities` | ERC-5792 capability query |
| `i_walletSendCalls`     | ERC-5792 batch request |
| `i_walletGetCallsStatus` | ERC-5792 bundle status query |
| `i_walletShowCallsStatus` | ERC-5792 status UI request |
| `i_walletExecutionPermissions` | ERC-7715 delegated-permission methods |

### Content Script → Inpage (postMessage)

**SECURITY**: `inject.ts` only forwards whitelisted message types to the webpage. Background broadcast messages like `newPendingTxRequest`, `accountsUpdated`, `txHistoryUpdated` are NOT forwarded, preventing malicious dapps from eavesdropping on wallet activity.

| Type                       | Description                                          |
| -------------------------- | ---------------------------------------------------- |
| `sendTransactionResult`    | Transaction result                                   |
| `signatureRequestResult`   | Signature result (rejection or signature for PK)     |
| `rpcResponse`              | RPC call response                                    |
| `switchEthereumChain`      | Chain switch success (chainId, rpcUrl)               |
| `switchEthereumChainError` | Chain switch error (unsupported chain)               |
| `setAddress`               | Account changed (forwarded from background)          |
| `setChainId`               | Chain changed (forwarded from background)            |
| `accountsChanged`          | Emitted when address changes (for dApp notification) |
| `walletExecutionPermissionsResult` | ERC-7715 delegated-permission result or error |

### Content Script → Background (chrome.runtime)

| Type                    | Description                                                                                                      |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `openProviderRequestSidePanel` | Synchronously consume an active approval gesture to open the supported Chrome side panel for a dapp connection, single tx, batch tx, signature, or ERC-7715 permission review when sidepanel mode is enabled |
| `sendTransaction`       | Submit transaction. Fire-and-forget (no callback). Includes `txId` generated by content script. Result via storage (`txResult:{txId}`)  |
| `signatureRequest`      | Submit signature request. Fire-and-forget (no callback). Includes `sigId` generated by content script. Result via storage (`sigResult:{sigId}`) |
| `rpcRequest`            | Proxy an allowlisted public read/simulation RPC method through an extension-configured URL (15s timeout); signing, submission, debug/admin, and filter-lifecycle methods are rejected |
| `addEthereumChain`      | Queue a user-confirmed `wallet_addEthereumChain` request                                                          |
| `watchAsset`            | Queue a user-confirmed `wallet_watchAsset` request                                                                |
| `walletGetCapabilities` | ERC-5792 capability response path                                                                                 |
| `walletSendCalls`       | Queue ERC-5792 batch request. Includes `bundleId` generated by content script. Ack/result via storage keys.       |
| `walletGetCallsStatus`  | ERC-5792 bundle status response path                                                                              |
| `walletShowCallsStatus` | Opens/raises WalletChan status UI for an existing bundle                                                          |
| `walletExecutionPermissions` | ERC-7715 delegated-permission discovery, active-grant listing, and user-confirmed request route             |

### Popup → Background (chrome.runtime)

`background/messageAccessPolicy.ts` is the exhaustive audience declaration for
the main service-worker router: every route in `background/messagePipeline.ts` and every
declared delegated-router route is classified exactly once as `wallet-ui` or
`provider`. Popup/sidepanel/onboarding routes are accepted
only from the exact top-level extension documents recognized by
`trustedWalletUiSender.ts`; an unknown or wallet-UI route from a content script
fails closed. Provider-classified routes still pass through the effect-free
`provider/messageValidation.ts` dispatcher before dispatch. Its focused
transaction, signature, batch, metadata, identifier/URL, resource-limit, and
chain-boundary modules are shared directly with injected-provider and
WalletConnect callers; there are no root compatibility shims. ENS browsing messages remain a
deliberate pre-router exception with their own page-specific sender policy.

Provider rejection delivery is described by the pure mapping in
`background/providerRequestRejection.ts`, which fixes each provider method to its existing
storage result key/payload, direct response, or intentional no-write behavior.
This keeps the injected-provider transport auditable without loading the full
service worker. `getActiveAccount` remains provider-reachable only for provider
initialization address correction.

After the ENS, audience, provider-validation, and ERC-7715 gates, the main
listener delegates unlock, lock, passkey, password, agent-password,
session-status, and auto-lock messages to `background/authRouter.ts`.
That router returns an explicit `handled/keepChannelOpen` result, preserving
Chrome's synchronous versus asynchronous `sendResponse` contract while all
authentication, storage, and locking behavior stays in the existing services.

Wallet-wide Bankr credential reads and replacement are isolated in
`background/bankrCredentialRouter.ts`. Replacement still validates the account
row and proves the remote signer before entering the wallet-secret lock; inside
that lock it rechecks the prepared master-auth epoch, atomically commits the
account address plus encrypted credential, and only then publishes the prepared
credential to memory. Sync mirrors, mapped-tab updates, and the UI broadcast
remain best effort after that commit. Cached-key reads retain exact Wallet UI
sender checks, Never-session restoration, and the agent-session plaintext
block. The retired credential-only mutation remains an explicit no-op error for
stale popup builds.

The same post-validation boundary delegates fresh-wallet marker inspection,
credential initialization, completion, rollback, and the completion broadcast
to `background/onboardingRouter.ts`. WalletConnect identity retirement and
ephemeral avatar-cache invalidation are injected by
`background/composition/identityRoutes.ts`, keeping
build-environment and SDK state out of the testable transport module. The
non-secret account read/order/name/global-selection/tab-selection routes are
delegated separately to `background/accountStateRouter.ts`.
`background/accountManagementRouter.ts` owns the trusted-UI transport and
orchestration for the serialized legacy migration, master-gated Bankr,
view-only, private-key, and seed account/group mutations, centralized
private-key import recovery, and disconnect-before-delete removal. Storage locks,
credential preparation, auth epochs, sponsored-intent exclusion, dapp
revocation, and mutation handlers remain injected boundaries.
`background/secretManagementRouter.ts` separately owns direct trusted-sender
checks for mnemonic generation and secret reveal, pinned-account signature
confirmation with terminal-only result publication, and ERC-7715 confirm/reject
transport. Plaintext, signing, and delegated-authority policy remain in their
domain handlers.

ERC-5792 provider capability/send/status/show routes and trusted-UI batch
confirmation, rejection, edit, and split decisions are delegated to
`background/batchRequestRouter.ts`. Injected calls preserve the exact authorized
origin, tab/frame/window, favicon, and sender-tab account; provider responses
stay on their existing durable result keys. Every decision retains its
`batchTransaction` or `transaction` first-action claim before invoking Bankr,
local signer, edit, or split handlers. WalletConnect adapters continue to enter
the same batch domain with their session metadata rather than this injected
sender transport.

`background/delegationRouter.ts` forwards the trusted-UI EIP-7702
status/probe/set/revoke calls without moving authorization or transaction
preparation out of the delegation domain. `background/crossDappBatchRouter.ts`
retains the two-claim source-plus-active-batch lease for moving a transaction
or ERC-5792 bundle, and the single active-batch claim for edit/reject/confirm.
Password, gas-estimate, source fan-out, and conflict semantics are passed
unchanged to the injected handlers.

`background/settingsRouter.ts` handles only trusted Wallet UI network
registry mutations and popup/sidepanel display-mode messages. Network
normalization, RPC URL policy, and the `networksInfo` storage lock stay in the
`network/` validation/repository/mutation modules. Browser capability, display
mode, panel verification, and popup placement stay in `windowing/` behind the
export-only `sidepanelManager.ts` / `extensionPopup.ts` facades. Chrome
storage/action/window calls are isolated in `windowing/chromeAdapter.ts` and
injected into focused policies; `background/composition/identityRoutes.ts`
consumes only the stable public functions.
Provider-originated add-chain intake,
confirmation, rejection, and per-tab chain notifications remain in the main
provider-aware flow.

Dapp account exposure, durable connection intake, permission reads, connection
confirmation/rejection, and revocation are
delegated to `background/dappPermissionRouter.ts` only after the existing
audience and external-provider validation gates. The router passes the exact
Chrome sender into origin/tab-bound domain handlers; result persistence,
pending-request claims, popup/badge effects, and permission broadcasts remain
in those handlers. `background/walletConnectSessionRouter.ts` separately
forwards the four trusted-UI WalletConnect list/pair/disconnect/chain-selection
routes to injected SDK handlers, avoiding relay SDK initialization when the
router is imported in isolation.

Injected read-only RPC transport is delegated separately to
`background/providerRpcRouter.ts`. It forwards the exact Chrome sender into the
connected-dapp authorization boundary, uses only the returned canonical origin
for bounded safe-RPC forwarding, and publishes success or rejection on the
existing `rpcResult:{id}` durable channel. It intentionally does not hold a
Chrome response channel open.

Shared provider-ingress policy is split into audit-sized helpers without
changing the ordered `background/messagePipeline.ts`. `background/providerIngress.ts` owns
connected-origin resolution, durable provider rejection, and the ERC-7715
in-progress block. `background/signatureValidation.ts` owns method rejection,
bounded EIP-712 validation/sanitization, and exact sender-scope forwarding.
`background/chainSwitchNotification.ts` owns chain validation, the
portfolio-refresh signal that precedes notification cooldown, safe extension
icon resolution, and the existing per-tab/origin/chain cooldown.

Metadata prompts are split because the combined transport exceeds the 400-line
audit budget. `background/watchAssetRouter.ts` owns EIP-747 intake,
pending reads, and first-action-wins confirmation/rejection, including durable
provider results and custom-token/unhide commits. `background/chainPromptRouter.ts`
owns EIP-3085 intake and decisions plus connected-site chain-switch notices,
including origin-bound RPC validation and network registry commits. Both run
after provider validation and pass the exact sender/authorization metadata
into existing policy boundaries. Their persisted prompts have no age-based
expiry; the shared metadata lifecycle service only handles explicit origin
invalidation.

Single transaction and signature transport is delegated to
`background/signingRequestRouter.ts`. Provider intake keeps the exact sender,
tab, frame, window, and authorized origin supplied by the composition root;
trusted-UI reads, rejection, and cancellation preserve the synchronous
first-action claim and durable-result ordering of the underlying domain
services. The three single-transaction confirmation paths move together through
`background/transactionExecutionRouter.ts`: immediate Bankr submission,
background Bankr submission, and local private-key/seed-phrase execution all
claim `transaction:<id>` with action `confirm` before invoking their injected
domain handler. Immediate confirmation retains the existing terminal-result
non-overwrite check, and local confirmation retains explicit-tab then sender-tab
resolution plus function, gas, and force-inclusion arguments. Internal transfer
intake forwards the complete message without creating a false signing claim.

`background/swapExecutionRouter.ts` forwards exact account/address locks to the
direct Bankr/local, Bankr batch, and local atomic paths. Every path first enters
the injected `internalOperation` reset barrier; signer-specific effect leases
remain below it in `transactions/swaps/`. `background/sponsoredTransferRouter.ts`
uses the same barrier only for relayer submission, while status reconciliation
stays fail-closed with `hasUnresolved: true` and acknowledgement remains
retryable. `background/transactionStatusRouter.ts` separately handles only
trusted-UI history, processing, failed-notification, nonce-cache, enrichment,
and receipt-status messages. These transport routers do not resolve credentials
or perform signing, submission, receipt polling, or request authorization
themselves.

`background/resetRouter.ts` owns the trusted-UI `resetExtension` route. It
installs the global pending-resolution barrier synchronously, then performs the
serialized restored-master proof, unresolved sponsored-intent guard, auth and
WalletConnect invalidation, secret-locked security reset, exact local/sync
manifest deletion, badge cleanup, and notification cleanup in released order.
Its response channel remains open for the complete asynchronous sequence.

Read-only quote and token helper transport is also separated from effectful
execution. `background/swapBridgeDataRouter.ts` owns exact swap/bridge request
shapes, source/destination chain discovery, cached bridge tokens/chains, and
swap token-list reads. `background/tokenDataRouter.ts` owns token metadata and
custom-token CRUD, price/image/CoinGecko/logo helpers, and allowance/balance
reads. Both run only after the exhaustive audience gate; avatar proxying keeps
its defense-in-depth exact Wallet UI check, while all asynchronous response
shapes and Chrome channel lifetimes remain unchanged.

`background.ts` is now a five-line MV3 entrypoint that only invokes
`background/bootstrap.ts`. Bootstrap constructs the audit-sized route families
under `background/composition/`, creates the ENS-first/audience/provider-gated
`background/messagePipeline.ts`, and hands it to
`background/composition/lifecycle.ts`. That lifecycle composition registers
storage/auth-lock, tab-account, maintenance, install/update, startup recovery,
action fallback, trusted-UI ports, the single ordered `onMessage` listener, then
notification clicks. The focused callback implementations remain under
`background/lifecycle/`, whose README records service-worker execution order.

| Type                               | Description                                                                                     |
| ---------------------------------- | ----------------------------------------------------------------------------------------------- |
| `getProviderRequestSurfaceHint`    | Consume the current window's short-lived request-family hint so a cold renderer waits for the matching approval queue |
| `getPendingTxRequests`             | Get all pending tx requests                                                                     |
| `getPendingTransaction`            | Get specific tx details                                                                         |
| `isApiKeyCached`                   | Check if password needed                                                                        |
| `unlockWallet`                     | Unlock wallet with password                                                                     |
| `getPasskeyUnlockStatus`           | Get local passkey wrapper status and WebAuthn credential metadata                                |
| `canSetupPasskeyUnlock`            | Preflight cached-master-session passkey setup before opening the platform credential prompt       |
| `verifyPasskeySetupPassword`       | Verify explicit master password before creating a passkey credential from a step-up setup screen  |
| `verifyMasterPassword`             | Verify an explicitly entered master password for sensitive Settings step-up flows                |
| `setupPasskeyUnlock`               | Store passkey wrapper from an active master-password session                                     |
| `setupPasskeyUnlockWithPassword`   | Verify master password, store passkey wrapper, and hydrate the master session from an explicit-password setup flow |
| `unlockWithPasskey`                | Hydrate a master session from V1 general-key or V2 general+mnemonic WebAuthn PRF wrappers         |
| `removePasskeyUnlock`              | After explicit master verification, prove complete general-vault and V2 mnemonic recovery before removing the local passkey; V1/no-mnemonic stays compatible |
| `lockWallet`                       | Lock wallet (clear cached credentials)                                                          |
| `resetExtension`                   | Reset wallet identity state using the exact `storage/resetManifest.ts` key/prefix manifest through `walletResetStorage.ts`; clears secrets, accounts, pending requests, WalletConnect routing, cross-dapp batches, tx history, wallet portfolio state, transient result keys, and session auth state |
| `confirmTransaction`               | User approved tx (sync, waits)                                                                  |
| `confirmTransactionAsync`          | User approved tx (async, Bankr API). Optional `functionName` field                              |
| `confirmTransactionAsyncPK`        | User approved tx (async, PK/seed local sign). Optional `functionName` and `gasOverrides` fields |
| `estimateGas`                      | Estimate gas for pending tx (returns `GasEstimate` with fees, balance, USD price)               |
| `updatePendingTxRequestData`       | Persist edited calldata for a pending single transaction                                        |
| `rejectTransaction`                | User rejected tx                                                                                |
| `getPendingSignatureRequests`      | Get all pending signature requests                                                              |
| `rejectSignatureRequest`           | User rejected signature request                                                                 |
| `cancelTransaction`                | User cancelled in-progress tx                                                                   |
| `clearApiKeyCache`                 | Legacy alias for full auth-state teardown (`clearAllAuthState`)                                 |
| `getCachedPassword`                | Check if password is cached                                                                     |
| `getCachedApiKey`                  | Get decrypted API key (if cached). **Sender-verified**: extension pages only                    |
| `saveApiKeyWithCachedPassword`     | Save new API key using cached password                                                          |
| `saveBankrApiKeyAndAddress`        | Save a Bankr account's API key and update that account's wallet address in `accounts[]`         |
| `changePassword`                   | Re-verify the master password, prove general-vault and V2 mnemonic/account recovery, complete partial legacy migrations, atomically rotate wrappers/V1 ciphertext, clear secondary factors, and lock |
| `isSidePanelSupported`             | Check if browser supports sidepanel                                                             |
| `getSidePanelMode`                 | Get current sidepanel mode setting                                                              |
| `setSidePanelMode`                 | Set sidepanel mode (true/false)                                                                 |
| `setArcBrowser`                    | Mark browser as Arc (disables sidepanel)                                                        |
| `getAutoLockTimeout`               | Get current auto-lock timeout (ms)                                                              |
| `setAutoLockTimeout`               | Set auto-lock timeout (ms)                                                                      |
| `getTxHistory`                     | Get completed transaction history                                                               |
| `clearTxHistory`                   | Clear all transaction history                                                                   |
| `fetchTokenInfo`                   | Resolve ERC-20 name/symbol/decimals through background RPC helpers                              |
| `resolveTokenMetadata`             | Resolve token metadata and logo, including user custom tokens                                   |
| `lookupCustomToken`                | Read-only lookup in `customTokens`                                                              |
| `addCustomToken`                   | Add a manual/custom token through the background-owned `customTokens` write path                 |
| `updateCustomToken`                | Edit a manual/custom token through the background-owned `customTokens` write path                |
| `removeCustomToken`                | Remove a manual/custom token through the background-owned `customTokens` write path              |
| `getAccounts`                      | Get all accounts (metadata only)                                                                |
| `reorderAccounts`                  | Persist an exact permutation of all account IDs as the canonical picker order; rejects stale, missing, duplicate, or unknown IDs |
| `getAddressContacts`               | Read the sanitized local-only EVM contact list |
| `createAddressContact`             | Validate and alphabetically insert a unique address/label contact |
| `updateAddressContactLabel`        | Update a contact label without changing its manual position |
| `removeAddressContact`             | Remove a contact by normalized address |
| `reorderAddressContacts`           | Persist an exact permutation of all saved contact addresses |
| `getActiveAccount`                 | Get currently active account                                                                    |
| `setActiveAccount`                 | Set active account by ID (also updates storage address)                                         |
| `addPrivateKeyAccount`             | Import new private key account                                                                  |
| `removeAccount`                    | Remove account by ID                                                                            |
| `getTabAccount`                    | Get account for specific tab                                                                    |
| `setTabAccount`                    | Set account for specific tab                                                                    |
| `confirmSignatureRequest`          | Sign message (PK accounts only)                                                                 |
| `revealPrivateKey`                 | Reveal private key (requires password verification). **Sender-verified**                        |
| `updateAccountDisplayName`         | Update account display name                                                                     |
| `addImpersonatorAccount`           | Add view-only impersonator account (address only)                                               |
| `generateMnemonic`                 | Generate fresh BIP39 mnemonic (no storage). **Sender-verified**                                 |
| `addSeedPhraseGroup`               | Generate/import mnemonic, prevalidate that at least one requested index is importable, create seed group, derive the requested set of indices (defaults to `[0]`; handles PK collision, silently skips already-imported non-PK addresses) |
| `previewSeedAddresses`             | Derive a paginated range of addresses from a candidate mnemonic without persisting anything (used by the import picker). **Sender-verified** |
| `deriveSeedAccount`                | Derive next account from existing seed group (handles PK collision)                             |
| `revealSeedPhrase`                 | Reveal mnemonic (requires master password verification). **Sender-verified**                    |
| `getSeedGroups`                    | Get all seed group metadata                                                                     |
| `renameSeedGroup`                  | Rename a seed group (broadcasts accountsUpdated)                                                |
| `initiateTransfer`                 | Create pending tx for extension-initiated token transfer                                        |
| `GET_CLEAR_SIGNING_DESCRIPTOR`     | Resolve an ERC-7730 descriptor for `{ chainId, address, kind }`, optionally disambiguated by calldata `selector` or EIP-712 `formatKey`. Public metadata only; no credentials. |

### Background → Views (chrome.runtime broadcast)

| Type                         | Description                                     |
| ---------------------------- | ----------------------------------------------- |
| `txHistoryUpdated`           | Notifies views with compact `txId`, `ownerAddress`, `chainId`, and optional `changedKeys`; no transaction or transfer payload is broadcast. |
| `newPendingTxRequest`        | Notifies views of new pending transaction       |
| `newPendingSignatureRequest` | Notifies views of new pending signature request |
| `accountsUpdated`            | Notifies views that accounts list changed       |
| `addressContactsUpdated`     | Notifies views that the ordered contact list changed |
| `walletLockedExternal`       | Force-lock signal (password rotation, agent removal, manual lock) — all surfaces route to unlock screen. Manual lock adds `suppressPasskeyAutoPrompt: true` so only already-open surfaces skip their automatic biometric prompt. |
| `walletLockFailedExternal`   | Fail-closed manual-lock signal — every open wallet surface purges renderer auth state, suppresses automatic biometric prompting, and shows the blocking retry screen. |
| `walletUnlockedExternal`     | Unlock-sync signal — sibling surfaces (sidepanel + full-screen tab) auto-unlock by re-running their post-unlock flow against the SW credential cache |
| `ping`                       | Check if any extension view is open             |

### Views → Background (response)

| Type   | Description                      |
| ------ | -------------------------------- |
| `pong` | Response indicating view is open |

## Sidepanel Support

The extension supports Chrome's Side Panel API (Chrome 114+). Sidepanel mode is only enabled on genuine Google Chrome — other Chromium browsers (Arc, Brave, Opera, Edge) may expose `chrome.sidePanel` but it silently fails to render. The extension uses `navigator.userAgentData.brands` to detect genuine Chrome and multiple fallback layers to ensure the popup always works.

### Browser Compatibility

| Browser       | Sidepanel Support       | Default Mode |
| ------------- | ----------------------- | ------------ |
| Google Chrome | ✅ Full support         | Sidepanel    |
| Arc           | ❌ Phantom API (silent) | Popup        |
| Brave / Edge  | ❌ Blocked (unverified) | Popup        |
| Firefox       | ❌ No API               | Popup        |

### Non-Chrome Browser Detection

Arc's sidePanel API is a "perfect phantom" — `sidePanel.open()` resolves successfully, `getContexts()` reports a `SIDE_PANEL` context, but nothing is rendered. Arc also removed its UA string (`Arc/`) and CSS variable (`--arc-palette-title`) signals, making those detection methods unreliable.

The primary detection uses `navigator.userAgentData.brands`:

```typescript
function isNonChromeBrowser(): boolean {
  const uaData = (navigator as any).userAgentData;
  if (!uaData?.brands) return false;
  // Genuine Chrome always includes "Google Chrome" in brands
  return !uaData.brands.some(
    (b: { brand: string }) => b.brand === "Google Chrome",
  );
}
```

The renderer retains the legacy **CSS variable** fallback
(`--arc-palette-title` in `App.tsx` / onboarding), which sets the persisted
`isArcBrowser` flag. Runtime windowing does not inspect the obsolete `Arc/` UA
string.

### How It Works — Never Use `openPanelOnActionClick`

**Key design rule**: Never set `openPanelOnActionClick: true`. It's an all-or-nothing setting — when true, Chrome suppresses the popup completely. If the sidepanel doesn't work (Arc), there's no fallback and nothing happens on icon click.

Instead, the extension controls popup vs sidepanel via `chrome.action.setPopup()`:

- **Popup mode**: `setPopup({ popup: 'popup-init.html' })` → native popup opens on icon click
- **Sidepanel mode**: `setPopup({ popup: '' })` → `chrome.action.onClicked` fires → calls `sidePanel.open()` with try/catch fallback

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    Sidepanel Initialization Flow                            │
│                                                                             │
│  Background Service Worker Startup (initSidePanel):                         │
│    1. Always set openPanelOnActionClick: false                              │
│    2. Read isArcBrowser and sidePanelMode                                   │
│    3. If stored Arc → set popup and return (preference remains intact)      │
│    4. Re-check support via userAgentData.brands + sidePanel API             │
│    5. If sidePanelMode === true and supported: setPopup('')                 │
│    6. Otherwise → setPopup('popup-init.html') (safe default)                │
│                                                                             │
│  Icon Click (action.onClicked listener, fires when popup=''):               │
│    1. Call sidePanel.open({ windowId })                                     │
│    2. Wait 600ms, verify via getContexts({ contextTypes: ['SIDE_PANEL'] }) │
│    3. If context exists → sidepanel is open, done                           │
│    4. If no context or open() threw → openPopupWindow() fallback            │
│                                                                             │
│  Transaction Request (openExtensionPopup):                                  │
│    1. If sidepanel mode → try sidePanel.open() with same verification      │
│    2. If verification fails → fall through to popup without rewriting mode │
│    3. If popup mode → open/focus popup window directly                      │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Configuration

| Setting     | Storage Key         | Default                                 | Description                                       |
| ----------- | ------------------- | --------------------------------------- | ------------------------------------------------- |
| Mode        | `sidePanelMode`     | `true` (after onboarding, if supported) | Whether to use sidepanel or popup                 |
| Legacy      | `sidePanelVerified` | Unused; released key remains resettable | Preserved only for storage compatibility          |
| Arc Browser | `isArcBrowser`      | Detected via CSS variable (legacy)      | Whether running in Arc browser (legacy detection) |

### UI Toggle

A sidepanel toggle button is available on both the **unlock screen** (top-right corner) and **main view header** (only visible when sidepanel is supported, i.e., genuine Chrome).

When toggling from popup to sidepanel mode:

- The setting is persisted in `chrome.storage.sync`
- `chrome.action.setPopup({ popup: '' })` is called so `action.onClicked` fires on icon click
- A toast notification instructs user to close popup and click extension icon

When toggling from sidepanel to popup mode:

- `chrome.action.setPopup({ popup: 'popup-init.html' })` restores the native popup
- The service worker opens WalletChan's detached popup window before closing the sidepanel; native action popups cannot be used here because Chrome dismisses them during the sidepanel focus change
- The sidepanel uses `sidePanel.close()` on Chrome 141+, with `window.close()` as the compatibility fallback after the detached popup is confirmed open

### Transaction Requests

When a dapp requests a transaction, the extension opens the appropriate UI:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     Transaction Request Flow                                │
│                                                                             │
│  1. Background receives eth_sendTransaction from dapp                       │
│  2. Stores pending tx in chrome.storage.local                               │
│  3. Broadcasts "newPendingTxRequest" message to all extension views         │
│  4. If sidepanel mode:                                                      │
│     a. Ping existing views — if "pong" response, view is open, done        │
│     b. Try sidePanel.open() + verify via getContexts                       │
│     c. If verification fails → fall through without rewriting preference   │
│  5. If popup mode (or fallback):                                            │
│     - Check for existing popup window → focus it                            │
│     - Otherwise create new popup window positioned at dapp window           │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Message Types for Sidepanel

| Type                   | Direction          | Description                                     |
| ---------------------- | ------------------ | ----------------------------------------------- |
| `ping`                 | Background → Views | Check if any extension view is open             |
| `pong`                 | Views → Background | Response indicating view is open                |
| `newPendingTxRequest`  | Background → Views | Notify views of new pending transaction         |
| `openPopupWindow`      | Views → Background | Request to open a popup window                  |
| `setArcBrowser`        | Views → Background | Notify background that Arc browser was detected |
| `isSidePanelSupported` | Views → Background | Check API/Chrome support and stored Arc override |
| `setSidePanelMode`     | Views → Background | Enable/disable sidepanel mode                   |
| `switchSidePanelToPopup` | Views → Background | Close sidepanel, then open the replacement popup |

### Key Design Decisions

**Chrome-only sidepanel**: Sidepanel is only enabled on genuine Google Chrome (`navigator.userAgentData.brands` includes "Google Chrome"). Non-Chrome Chromium browsers get popup mode on every service-worker startup, while the stored preference remains intact for a future compatible browser.

**Verified fallback**: The `action.onClicked` listener and `openExtensionPopup()` both verify the panel after `sidePanel.open()`. If verification fails, they open a detached popup for the current request without mutating the user's stored preference.

**Never `openPanelOnActionClick`**: This setting is always `false`. Using `chrome.action.setPopup()` to control behavior provides a fallback path — `action.onClicked` fires when popup is empty, allowing try/catch around `sidePanel.open()`.

**Multi-layer detection**: Non-Chrome detection combines (1) the
`userAgentData.brands` check and (2) the stored `isArcBrowser` flag from the
renderer CSS-variable fallback.

### CSS Handling

The extension detects if it's running in a sidepanel context by checking window dimensions:

- Sidepanel: height > 620px (browser provides more vertical space)
- Popup: height ≤ 600px (fixed popup dimensions)

When in sidepanel:

- `body.sidepanel-mode` class is added
- CSS adjusts to use full viewport height (100vh)

## UI Layout

### Popup Dimensions

- Detached window: 360px width, 680px height (created by `windowing/popupWindow.ts`)
- HTML: 360px width, 600px height (fixed for popup)
- Sidepanel: 100vh height (no max-height restriction)
- Font: Inter (UI), JetBrains Mono (code/addresses)

### Transaction/Signature Confirmation Layout

The confirmation views share the mobile confirmation shell:

```
┌─────────────────────────────────────────────────────────────┐
│  ←  │               Request title              │  Copy    │  ← Header
├─────────────────────────────────────────────────────────────┤
│                 < 1/2 >          Reject all                │  ← Queue
│                    Requesting app                           │
│                Human-readable meaning                       │
│               Review details / Advanced                     │
├─────────────────────────────────────────────────────────────┤
│  Signing with …                                             │
│  Reject                                  Confirm / Sign      │  ← Sticky
└─────────────────────────────────────────────────────────────┘
```

- **Back arrow**: Returns to the pending list or main view
- **Navigation**: Shared queue row before request identity; only shown when
  multiple combined requests exist
- **Reject all**: Uses the global combined-queue action
- **Title**: "Transaction request", "Batch request", or "Signature request"
- **Footer**: Shared sticky action layout keeps the pinned signer and decisions
  visible

### Pending Requests List

The list shows both transaction and signature requests. Each request shows:

- Request number badge (#1, #2, etc.)
- Origin favicon with white background (handles transparent icons)
- Origin hostname
- Type badge: **TX** (blue) or **SIG** (orange/warning)
- Chain badge with icon
- Relative timestamp ("2 mins ago")
- For transactions: Target address (truncated)
- For signatures: Method name (e.g., "Personal Sign", "Typed Data")

### Origin Favicon Styling

Origin favicons are displayed with a white background container to handle transparent icons. Falls back to Google's favicon service if no favicon is available.

### Homepage Layout

The main view (after unlock) shows:

1. **Header**: Chat History button (Bankr accounts only), Lock button, Sidepanel toggle (if supported), Settings icon
2. **Account Switcher**: Account avatar/name and a compact address utility row:
   - Truncated active-account address
   - QR button (opens the existing Receive modal)
   - Copy button with inline icon feedback
   - Explorer link icon
3. **Primary Actions**: Send, Swap, Shield, and More. Shield currently opens a placeholder screen with the standard back-navigation header.
4. **Chain Selector**: Dropdown to select network where the current surface exposes it
5. **Pending Transaction Banner** (if any pending)
6. **Recent Transactions** (TxStatusList):
   - Shows last 5 transactions by default (filtered by current account)
   - Expandable to show all
   - Empty state: "No recent transactions"
7. **Footer**: "Chat with Bankr" button (Bankr accounts only)

**Note**: The Chat History button in the header and "Chat with Bankr" button in the footer are only visible when the currently selected account is a Bankr API account. Private Key accounts do not have access to the Bankr chat feature.

### Lock Wallet Button

The header includes a lock icon button that allows users to manually lock the wallet:

- Clears the cached API key and password from memory
- Redirects to the unlock screen
- Useful for security when stepping away from the computer

Sends `lockWallet` message to background and redirects to the unlock screen.

### Reset Extension

The unlock screen's reset action sends `resetExtension` to the background. The
handler is agent-password blocked, calls `clearAllAuthState()` before storage
mutation, aborts in-flight tx work through `performSecurityReset()`, then removes
wallet-owned storage through `chrome/walletResetStorage.ts`.

Before cache deletion, reset and fresh onboarding call
`invalidateAvatarImageCacheForWalletReset()` through the stable root facade.
`avatar/scheduler.ts` increments a wallet epoch, aborts active remote image
controllers, clears request deduplication state, and requires every
queued/decode/write stage to match the current epoch. Repository commits are
serialized; if an asynchronous storage write crosses reset,
`avatar/repository.ts` removes that stale entry before returning. A late
old-wallet response therefore cannot repopulate `ensAvatarImageCache` after a
replacement wallet starts.

`walletResetStorage.ts` is the stable facade over
`storage/resetManifest.ts`, the pure source of truth for reset-owned keys and
prefixes. It clears secrets/accounts (`encrypted*`, `pkVault`, `mnemonicVault`,
`accounts`, `seedGroups`), pending request queues (`pendingTxRequests`,
`pendingSignatureRequests`, `pendingBatchTxRequests`,
`pendingWatchAssetRequests`, `pendingAddChainRequests`), WalletConnect routing
state (`walletConnectPendingRequests`, `walletConnectChainId`), cross-dapp batch
state (`crossDappBatch`, `bundleStatuses`), bridge state (`pendingBridges`),
short-lived sponsored-transfer recovery state (`sponsoredTransferIntents`),
wallet portfolio state (`portfolioSnapshots`, `portfolioSnapshotsV2`, `portfolioHoldingsCache`,
`hiddenPortfolioTokens`, `customTokens`, `customDelegates`,
`recentlyReceivedTokens`), and transient
result/artifact prefixes (`txResult:`, `sigResult:`, `rpcResult:`,
`addChainResult:`, `watchAssetResult:`, `batchTxResult:`, `batchTxAck:`,
`capabilitiesResult:`, `callsStatusResult:`, `notification-`, `fiProgress:`).
Keep that module in sync with `_docs/STORAGE.md` when adding new wallet-scoped
storage.

WalletConnect SDK identity is handled separately: reset first tears down the
current SDK and writes a replacement `walletConnectStorageNamespace`, then
clears the reset-owned keys above. The namespace is intentionally retained so
the replacement wallet cannot reopen the old SDK store.

### Footer Attribution

All main screens display a centered footer with attribution:

- **Text**: "Built by @apoorveth"
- **X Logo**: SVG icon linking to https://x.com/apoorveth
- **Pages with footer**:
  - Homepage (main view)
  - Unlock/Password screen
  - Onboarding (welcome, form steps, success)
  - Settings page

## Security Considerations

1. **API Key Protection**: Encrypted with AES-256-GCM; passwords are never
   stored in plaintext. Native "Never" sessions may store only an encrypted
   password or encrypted passkey-unwrapped general capability with its random
   key split across memory-backed session storage and local storage; fallback
   browsers do not persist either recovery half. Passkey session state never
   stores the PRF output, API key, private keys, seed phrases, or mnemonic key.
2. **Chain Restriction**: Only 4 supported chains, validated at multiple layers
3. **User Confirmation**: Every transaction requires explicit user approval
4. **Origin Display**: Shows requesting dapp's origin in confirmation popup
5. **Cancellation**: Users can cancel long-running transactions

## Error Handling

| Error                       | Handling                         |
| --------------------------- | -------------------------------- |
| Unsupported chain           | Immediate rejection with message |
| API key not configured      | Redirect to settings             |
| Wrong password              | Retry prompt in popup            |
| API error                   | Display error message; chat prompt errors surface the Bankr API `message` field in the assistant error bubble |
| RPC/preparation error before signed bytes are sent | Definite failure; keep/reopen the request and allow retry |
| Local raw-send response lost | Persist the deterministic hash as pending/`broadcastUncertain`, poll it, and do not create a new transaction or higher-nonce tail |
| Bankr submit abort/timeout/408/409/425/429/5xx or unprovable response | Outcome unknown; retain the effect lease and direct the user to check Activity before retrying |

## React State Management

### Transaction Component Keys

The `TransactionConfirmation` component uses `key={selectedTxRequest.id}` to force React to remount when switching between transactions. This ensures:

- All closures capture fresh values
- No stale state when confirming/rejecting
- Correct transaction ID sent to background

### Avoiding Stale State

When handling transaction completion, always capture the current transaction ID before async operations and reload pending requests fresh from storage rather than using React state. This prevents the common bug where async operations use stale closure values.

## Cross-Chain Bridging

The Swap surface doubles as a Bridge surface when `sellChainId !== buyChainId`. There is no separate Bridge entry point — same UI, same confirmation screen, same wallet-type routing. See `_docs/BRIDGE.md` → "Extension support" for the full breakdown.

### Architecture

```
SwapView (internal sellChainId, buyChainId — never updates the global chain)
  │
  ├─ same chain → existing 0x swap (fetchSwapPrice / Quote)
  │
  └─ different chain → bridge mode
       1. fetchBridgeQuote → walletchan.eth.sh/api/bridge/quote
          (server applies sWCHAN-tiered fee; same isPremiumFee surfaced)
       2. route selection → use manualRoutes[0]; the server adapts Socket V3
          result.routes[] into this legacy field.
       3. handlePrepareBridge → re-quote and use approvalData + txData from
          manualRoutes[0] directly. Socket V3 has no build-tx or submit step.
       4. SwapTxEntry[]: [approve?, bridge] with bridge meta on the last entry
          (requestHash stores Socket's quoteId for status polling)
       5. SwapConfirmation (same screen) renders with bridgeMeta prop —
          title flips, dest chain badge appears, gas plumbing unchanged.
       6. Bankr path: encodeBatchCalls → ERC-7821 atomic via executeSwapBatch.
          PK / Seed path: EIP-7702 atomic via executeSwapAtomicPK when a delegate
          is available; otherwise sequential via executeSwapDirect.
```

### Persisting & polling destination status

| Concern | File |
|---|---|
| Bridge metadata on `CompletedTransaction` | `apps/extension/src/chrome/txHistoryStorage.ts` (optional `bridge?` field) |
| In-flight bridges across SW restarts | `apps/extension/src/chrome/requests/pendingBridgeStorage.ts` (`pendingBridges` chrome.storage.local key) |
| Status polling | Stable `apps/extension/src/chrome/bridgeStatusPoller.ts` facade over `bridge/statusPolling.ts` and `bridge/statusApplication.ts` (5s → 30s exp. backoff, 15-min cap, stored quoteId/requestHash, terminal `BungeeStatusCode` values) |
| Post-source-tx hook | `txReceiptPoller.applyReceiptToHistory` calls `maybeStartBridgePolling(txId)` on success; the Bankr direct-success path in `transactions/swaps/bankrLeg.ts` does the same |
| Service-worker restart resilience | `background/composition/lifecycle.ts` injects `resumePendingBridgePollers()` into `background/lifecycle/startupRecovery.ts` |
| Browser notification | `bridge/statusNotification.ts` maps terminal copy and stores the **destination** explorer URL under `notification-<id>` before using the shared Chrome notification effect |

The bridge poller uses the same in-memory model as `txReceiptPoller` (no `chrome.alarms`). Tradeoff: destination updates only progress while the SW is alive. The resume hook covers SW death — the next popup-open eventually catches the terminal state and fires the notification.
