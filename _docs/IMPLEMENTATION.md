# WalletChan Transaction Handling Implementation

## Overview

WalletChan is a Chrome extension that supports two types of accounts:

1. **Bankr API Accounts** - AI-powered wallets that execute transactions through the Bankr API
2. **Private Key Accounts** - Standard wallets with local key storage for transaction signing

This document describes the core architecture and transaction handling implementation.

**Related Documentation:**

- [SECURITY.md](./SECURITY.md) - Security audit guide, threat model, and pre-commit checklists
- [PK_ACCOUNTS.md](./PK_ACCOUNTS.md) - Private key accounts implementation (security, signing, storage)
- [CHAT.md](./CHAT.md) - Chat feature implementation (AI conversations with Bankr agent)
- [CALLDATA.md](./CALLDATA.md) - Calldata decoder UI (rich param components, type routing, unit conversion)
- [STYLING.md](./STYLING.md) - Token vocabulary, theme authoring rules, design system
- [THEMING_PRD.md](./THEMING_PRD.md) - Theme engine architecture, token contract, phased rollout history

## Theme Engine

As of v3.2.0 the extension ships a token-driven theme engine with two themes:
**Bauhaus** (light, geometric, primary colors, hard shadows) and **Midnight**
(dark, modern, soft luminous shadows, rounded corners). Users select a theme
from Settings → Appearance; the choice persists in `chrome.storage.local` and
does NOT sync across devices.

**Architecture:**

```
apps/extension/src/theme/
├── tokens.ts                # ThemeTokens interface — every theme satisfies this contract
├── createTheme.ts           # Factory: tokens → Chakra extendTheme config (Button/Input/
│                            #   Modal/Menu/Popover/Slider/Tooltip baseStyles)
├── ThemeProvider.tsx        # React context + ChakraProvider wrapper, switches at runtime
├── useThemeSelection.ts     # chrome.storage.local read/write
├── useStripTokens.ts        # Shared dark CTA strip color pair (used in 8+ places)
├── bootstrap.ts             # Pre-React paint sync to avoid theme flash
├── themes/
│   ├── bauhaus.ts           # Default theme
│   └── midnight.ts          # Dark theme
└── primitives/              # Theme-aware atoms (ThemedCard, ThemedField, IconBox, …)
```

**Pre-paint flow:** `index.tsx` and `onboarding.tsx` call `bootstrapThemeAttribute()`
synchronously before React renders, which reads a localStorage mirror of the
canonical `chrome.storage.local` selection and sets `<html data-theme=...>`.
The CSS in `index.css` / `onboarding.css` uses theme-attribute selectors so
the very first paint matches the user's choice — no flash of the wrong theme.

**Component contract:** Components must consume **intent tokens** —
`accent.primary`, `surface.raised`, `chart.numeric`, etc. — never theme-color
literals or names like `bauhaus.red`. The factory translates tokens to a
Chakra theme per the active `ThemeTokens` shape. To add a new theme, drop a
file in `themes/` satisfying the contract and register it in `ThemeProvider.tsx`.
Zero component edits.

See `_docs/STYLING.md` for the full token vocabulary and authoring rules.
See `_docs/THEMING_PRD.md` for the engine architecture and phased rollout history.

## Account Types

The extension supports four distinct account types that can be used simultaneously:

| Feature               | Bankr API Account          | Private Key Account                 | Seed Phrase Account                   | Impersonator Account    |
| --------------------- | -------------------------- | ----------------------------------- | ------------------------------------- | ----------------------- |
| Transaction Execution | Via Bankr API              | Local signing + RPC broadcast       | Local signing + RPC broadcast         | ❌ Disabled (view-only) |
| Message Signing       | ✅ Via API (`/wallet/sign`) | ✅ Full support                     | ✅ Full support                       | ❌ Disabled (view-only) |
| Key Storage           | API key encrypted locally  | Private key encrypted locally       | Mnemonic + derived keys encrypted     | No secrets stored       |
| Setup                 | API key + wallet address   | Private key import or generate      | 12-word BIP39 import or generate      | Address only            |
| Use Case              | AI-powered transactions    | Agent wallets, bots, standard usage | HD wallets, multiple derived accounts | Viewing portfolio/dApps |

### Seed Phrase Architecture

- **BIP39**: 12-word mnemonics (128-bit entropy) using `@scure/bip39`
- **BIP44**: Derivation path `m/44'/60'/0'/0/{index}` using `@scure/bip32`
- **Seed Groups**: Each mnemonic creates a "group" that can derive multiple accounts. Groups have user-editable names (default "Seed #N").
- **Storage**: Mnemonics encrypted separately in `mnemonicVault` (PBKDF2+AES-256-GCM). Derived private keys stored in regular `pkVault` keyed by account UUID
- **Byte conversion**: Uses native `bytesToHex()` from `cryptoUtils.ts` instead of Node.js `Buffer` (not available in browser service worker)
- **Files**: `seedPhraseUtils.ts` (BIP39/44), `mnemonicStorage.ts` (encrypted CRUD + `reEncryptMnemonicVault` for password changes), `SeedPhraseSetup.tsx` (UI), `RevealSeedPhraseModal.tsx` (reveal with password)
- **Display**: Account dropdown shows seed group name + derivation index (e.g., "Seed #1 · #0"). Account settings shows derivation index in type label.
- **Address picker (shared)**: `components/SeedAddressPicker.tsx` is the single picker UI used by both flows: (1) new-import in `SeedPhraseSetup`, and (2) "Derive Addresses" on an existing seed group in `AddAccount`. Each row renders avatar (ENS or blockie), ENS name, BIP44 index, truncated address, portfolio USD total (`fetchPortfolio`, aborted on unmount), a copy button, and an Etherscan-mainnet link. The picker calls the background `previewSeedAddresses` handler, which accepts EITHER a raw `mnemonic` (import flow, no auth) OR a `seedGroupId` (existing-group flow, decrypts the stored mnemonic — requires unlocked wallet with master password). Paginates 5 at a time. Existing-group mode initial-fetches `0..maxExistingIndex + 5` so users see their already-added accounts in context (locked as "added"). `addSeedPhraseGroup` and `deriveSeedAccount` both accept `indices: number[]` — non-PK collisions are silently skipped, PK collisions still convert in place. `addSeedPhraseGroup` prevalidates that at least one selected index can be imported or converted before creating a seed group or writing `mnemonicVault`; duplicate-only imports fail without persisting seed material. Generate flow is unchanged (always derives index 0; nothing to discover on a fresh mnemonic).

#### PK → Seed Phrase Account Conversion

When importing a seed phrase whose derived address matches an existing private key account, the extension converts the PK account to a seed phrase account **in-place** rather than creating a duplicate or throwing an error:

1. Derive private key + address at index N as usual
2. Check if the address already exists in accounts via `findAccountByAddress()`
3. If it matches a `privateKey` account → call `convertToSeedPhraseAccount()` to update type, add seedGroupId/derivationIndex, preserve same account ID, display name, and vault entry. Skip `addKeyToVault` (key already in vault under same ID).
4. If it matches any other type (bankr/impersonator/seedPhrase) → error "An account with this address already exists"
5. This applies to both `addSeedPhraseGroup` (index 0) and `deriveSeedAccount` (index N) handlers

### Account Selection

- Users can configure one or both account types during onboarding
- When both accounts are set up, the first account added becomes the default active account
- Each browser tab maintains its own active account selection (similar to per-tab chain)
- The popup/sidepanel shows the account for the currently active tab
- Account switching emits `accountsChanged` events to connected dApps

### Address Synchronization

The extension maintains address consistency between storage and the active account:

1. **On Onboarding**: When both account types are configured, the first account's address (PK account) is saved to `chrome.storage.sync.address` since it becomes the active account.

2. **On Account Switch**: When `setActiveAccount` is called, the background worker:
   - Updates `activeAccountId` in storage
   - Updates `address` and `displayAddress` in `chrome.storage.sync`
   - The storage change listener broadcasts `setAddress` to all tabs

3. **On Bankr API Key & Address Change**: The Account Settings form calls
   `saveBankrApiKeyAndAddress`, which saves the new API key and updates the
   Bankr account's `accounts[].address` entry. If that account is active, the
   background worker also syncs `chrome.storage.sync.address/displayAddress`
   and broadcasts `accountsUpdated`.

4. **On Content Script Init**: The inject.ts script:
   - Reads the initial address from `chrome.storage.sync`
   - Verifies with background that the address matches the active account
   - If mismatched (e.g., stale storage), emits `accountsChanged` with the correct address

5. **On Address Change**: The inject.ts `setAddress` handler now emits `accountsChanged` when the address changes, ensuring dApps are notified of updates from any source.

### Transaction Routing

When a dApp initiates a transaction:

1. Extension checks the active account type for that tab
2. **Bankr Account**: Transaction submitted to Bankr API → API executes → returns tx hash
3. **PK Account**: Transaction signed locally with viem → broadcast to RPC → returns tx hash

For detailed implementation of private key accounts, see [PK_ACCOUNTS.md](./PK_ACCOUNTS.md).

## Architecture

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
│                     - Delegates to: sessionCache, authHandlers,             │
│                       txHandlers, chatHandlers, sidepanelManager            │
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

## Supported Chains

The following chains are supported for transaction signing (listed in dropdown order):

| Chain    | Chain ID | Default RPC                     | Bankr API | PK/Seed/Impersonator | OP Stack |
| -------- | -------- | ------------------------------- | --------- | -------------------- | -------- |
| Base     | 8453     | https://mainnet.base.org        | ✅        | ✅                   | ✅       |
| Ethereum | 1        | https://eth.llamarpc.com        | ✅        | ✅                   |          |
| MegaETH  | 4326     | https://mainnet.megaeth.com/rpc |           | ✅                   | ✅       |
| Polygon  | 137      | https://polygon-rpc.com         | ✅        | ✅                   |          |
| Unichain | 130      | https://mainnet.unichain.org    | ✅        | ✅                   | ✅       |

These are configured in `src/constants/chainRegistry.ts` (the single source of truth for built-in chain data) and normalized into `networksInfo` by the service-worker bootstrap if storage is missing.

### Runtime Chain Resolution

Built-in chain metadata and user-customized chain state are intentionally split:

- `src/constants/chainRegistry.ts` defines the canonical built-in chains and all derived static maps
- `chrome.storage.sync.networksInfo` stores runtime overrides only: edited RPC URLs, hidden flags, and user-added custom chains
- `src/lib/chains.ts` is the required merge layer for runtime code. It normalizes `networksInfo`, keeps built-in chains keyed by their registry name, and exposes helpers like `getVisibleChains`, `getResolvedChainById`, and `getStoredRpcUrl`
- `src/chrome/networkStorage.ts` owns mutating writes to `networksInfo` in the service worker. Settings UI and dapp `wallet_addEthereumChain` confirmations call extension-only background messages (`addNetwork`, `updateNetwork`, `setNetworkHidden`, `deleteNetwork`, `confirmAddChain`) instead of writing a full popup snapshot back to storage.
- `src/contexts/NetworksContext.tsx` is a read-through mirror: it initializes via `ensureNetworksInfo` and subscribes to `chrome.storage.onChanged` for `networksInfo`, so long-lived sidepanels pick up chains added by other extension flows.

**Important:** Do not read `CHAIN_REGISTRY` and `networksInfo` separately in components/handlers to rebuild chain lists or look up RPC/explorer/native currency data. That is what caused custom-chain support to drift across screens. New runtime chain logic should go through `src/lib/chains.ts`, and new network mutations should go through `src/chrome/networkStorage.ts` so stale popup snapshots cannot delete chains added by the background.

**Default Network**: Base is set as the default network for new installations.

### Custom Chain UX Rules

- `wallet_addEthereumChain` requests open the same Add Chain form used in Settings, prefilled with the dapp-provided values
- The user can edit the proposed chain name, RPC, explorer, and native currency fields before saving
- Chain deduplication is by `chainId`, not by dapp-provided name. If the chain already exists, the add flow resolves to the existing chain instead of creating a duplicate entry
- Dapp-initiated add-chain confirmation auto-switches the active wallet chain after the save succeeds. Settings-based add-chain does not auto-switch
- If the active chain is hidden or a custom active chain is deleted, the wallet immediately falls back to the first visible chain allowed for the current account type and shows a toast explaining the switch
- Do not allow a hide/delete action to leave the current account type with zero visible chains

### CoinGecko Resolution Service

Native asset price/logo resolution is centralized in `src/chrome/coingeckoService.ts`.

- All direct CoinGecko traffic goes through the background service worker
- `gasEstimation.ts` asks the service for built-in native token USD prices
- `portfolioTokens.ts` sends a single batched background message for custom-chain native assets instead of hitting CoinGecko from the popup
- The service batches CoinGecko `coins/markets` requests across a short buffer window, caches market data in memory + `chrome.storage.local`, and caches search/resolution results for unknown custom assets
- On CoinGecko `429`, the service falls back to cached/stale data and backs off briefly instead of hammering the API
- Persistent metadata/image cache writes are best-effort. `src/chrome/storageCachePruner.ts` runs on service-worker startup and every 6 hours to delete expired non-critical cache entries, so cache bloat cannot block wallet-critical writes such as vault/account/pending-transaction state.

ERC-20 display metadata is centralized in `src/chrome/tokenMetadata.ts`.

- Resolves name/symbol/decimals via `fetchTokenInfo`
- Resolves logos through the swap token list, Bungee token list, watched-asset custom tokens, and `tokenLogoConstants.ts`
- Used by receipt asset-change extraction, tx details backfill, clear-signed snapshots, batch call summaries, approve cards, and portfolio auto-add stubs so custom swap/bridge chains do not diverge by page
- Logo image bytes are warmed through the shared `ensAvatarImageCache` sanitizer as soon as a metadata lookup finds a URL. Renderer pages read that cache through `src/lib/avatarCacheClient.ts`, which keeps a small `localStorage` mirror for synchronous first-paint reuse while `chrome.storage.local` remains the canonical cache.

### Per-Account-Type Chain Restrictions

Not all chains are supported by all account types. The Bankr API only supports a subset of built-in chains (currently Ethereum, Arbitrum, Base, BNB Chain, Polygon, Unichain — see `isBankrSupported: true` in `chainRegistry.ts`). Newer chains like Optimism and MegaETH are available for PK, Seed Phrase, and Impersonator accounts only. PK / Seed / Impersonator accounts can additionally add arbitrary custom EVM chains via Settings → Chains; Bankr accounts cannot use custom chains.

**Constants** (derived from `src/constants/chainRegistry.ts`, re-exported via `src/constants/networks.ts`):

| Constant                    | Purpose                                                        |
| --------------------------- | -------------------------------------------------------------- |
| `ALLOWED_CHAIN_IDS`         | All supported chain IDs (superset, used for global validation) |
| `BANKR_SUPPORTED_CHAIN_IDS` | Chain IDs supported by Bankr API accounts only                 |
| `OP_STACK_CHAIN_IDS`        | OP Stack L2 chains (for L1 fee breakdown in gas display)       |

**Enforcement points:**

1. **UI dropdown** (`App.tsx`): Chain dropdown filters by `activeAccount.type` — Bankr accounts only see `BANKR_SUPPORTED_CHAIN_IDS` chains
2. **Account switch** (`App.tsx`): When switching to a Bankr account, if current chain isn't supported, auto-switches to first supported chain
3. **Background validation** (`txHandlers.ts`): `handleConfirmTransactionAsync` (Bankr path) rejects chains not in `BANKR_SUPPORTED_CHAIN_IDS`
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

The provider info, announcement function, and request listener are in `src/chrome/impersonator.ts`. The wallet announces on init and re-announces on `eip6963:requestProvider` events.

### Backward Compatibility

The wallet maintains backward compatibility by:

1. Setting `window.ethereum` for legacy dapps
2. Announcing via EIP-6963 for modern dapps

Dapps that support EIP-6963 will show Bankr Wallet in their wallet selection UI. Legacy dapps will still work via `window.ethereum`.

### Multi-Wallet Conflict Handling

Some wallets (like Rabby) aggressively claim `window.ethereum` using `Object.defineProperty` with a getter-only descriptor, which prevents other wallets from setting it via direct assignment. WalletChan handles this gracefully:

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

**See**: `src/chrome/impersonator.ts` → `setWindowEthereum()` for the full claim strategy implementation.

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
│   ├── impersonator.ts      # Inpage script - EIP-6963 provider + window.ethereum
│   ├── dappRpcForwarding.ts # Page-local dapp RPC discovery + safe read-only forwarding
│   ├── inject.ts            # Content script - message bridge
│   ├── background.ts        # Service worker - message router + Chrome event listeners
│   ├── sessionCache.ts      # Credential caching, session persistence, auto-lock
│   ├── authHandlers.ts      # Wallet unlock, vault key system, password management
│   ├── txHandlers.ts        # Transaction/signature handlers, notifications
│   ├── chatHandlers.ts      # Bankr AI chat prompt handling
│   ├── sidepanelManager.ts  # Side panel detection and mode management
│   ├── cryptoUtils.ts       # Shared crypto utilities (PBKDF2, base64, bytesToHex, constants)
│   ├── crypto.ts            # AES-256-GCM encryption for API key and vault
│   ├── vaultCrypto.ts       # Vault encryption/decryption for private keys
│   ├── seedPhraseUtils.ts   # BIP39 mnemonic + BIP44 key derivation
│   ├── mnemonicStorage.ts   # Encrypted mnemonic storage (PBKDF2+AES-256-GCM)
│   ├── types.ts             # Account and vault type definitions
│   ├── localSigner.ts       # Transaction and message signing with viem
│   ├── accountStorage.ts    # Account CRUD operations (includes seed groups, PK→seed conversion)
│   ├── storageLock.ts       # Per-key serializer for chrome.storage read-modify-write helpers
│   ├── networkStorage.ts    # Service-worker-owned networksInfo mutations + active-chain fallback
│   ├── walletResetStorage.ts # Source of truth for reset-owned storage keys and transient prefixes
│   ├── storageCachePruner.ts # Best-effort pruning for non-critical storage-backed caches
│   ├── transactionValidation.ts # Dapp transaction quantity validation/normalization
│   ├── gasEstimation.ts     # Pre-confirmation gas estimation (RPC fees, CoinGecko USD price)
│   ├── bankrApi.ts          # Bankr API client (submit, sign, job polling)
│   ├── portfolioApi.ts      # Portfolio API client (fetches token holdings via website)
│   ├── portfolioTokens.ts   # Shared portfolio catalog merge/filter logic
│   ├── portfolioSnapshotStorage.ts # Per-address aggregate portfolio value snapshots
│   ├── portfolioSnapshotRefresh.ts # Force-records current visibility-adjusted portfolio totals
│   ├── hiddenPortfolioTokens.ts # Global hidden-token storage for Holdings
│   ├── tokenMetadata.ts     # Shared ERC-20/native metadata resolver (swap list, Bungee list, custom tokens)
│   ├── tokenLogoConstants.ts # Hardcoded token-logo fallbacks not covered by upstream token lists
│   ├── onchainBalances.ts   # Onchain balance verification via Multicall3 batching
│   ├── transferUtils.ts     # ERC20/native token transfer calldata builders
│   ├── chatApi.ts           # Chat API client for Bankr agent
│   ├── chatStorage.ts       # Persistent storage for chat conversations
│   ├── pendingTxStorage.ts  # Persistent storage for pending transactions
│   ├── pendingSignatureStorage.ts # Persistent storage for pending signature requests
│   ├── walletConnectHandlers.ts # WalletConnect init, session approval, UI messages
│   ├── walletConnectRequestHandlers.ts # WalletConnect request intake → pending tx/signature queues
│   ├── walletConnectBatchRequestHandlers.ts # WalletConnect ERC-5792 request adapters
│   ├── walletConnectRpcRequestHandlers.ts # WalletConnect chain/RPC request adapters
│   ├── walletConnectProposal.ts # Proposal namespace normalization + rejection details
│   ├── walletConnectProtocol.ts # WalletConnect JSON-RPC response helpers
│   ├── walletConnectHelpers.ts # WalletConnect session/method utility helpers
│   ├── walletConnectChainState.ts # Shared WalletConnect active-chain state + chainChanged events
│   ├── walletConnectKeepalive.ts # Relay keepalive while approved WC sessions exist
│   ├── walletConnectStorage.ts # WalletConnect request-result routing metadata and active WC chain
│   ├── txHistoryStorage.ts  # Persistent storage for completed transaction history
│   ├── delegationHandlers.ts # EIP-7702 delegate management (getStatus / setCustom / removeCustom / probe / revoke)
│   └── delegationStorage.ts # Per-account × per-chain custom delegate overrides
├── constants/
│   ├── chainRegistry.ts     # Single source of truth for all chain data
│   ├── networks.ts          # Re-exports network constants from chainRegistry
│   └── chainConfig.ts       # Re-exports chain UI config from chainRegistry
├── lib/
│   └── siwe/                # EIP-4361 parser + validation shared by UI and signing handlers
├── pages/
│   ├── Onboarding.tsx       # Full-page onboarding wizard for first-time setup
│   └── ApiKeySetup.tsx      # API key + wallet address configuration
├── components/
│   ├── Chat/
│   │   ├── ChatView.tsx     # Main chat orchestrator (list/chat modes)
│   │   ├── ChatList.tsx     # Past conversations list
│   │   ├── ChatHeader.tsx   # Navigation and actions
│   │   ├── ChatInput.tsx    # Text input + send button
│   │   ├── MessageList.tsx  # Scrollable message container
│   │   ├── MessageBubble.tsx # Individual message display
│   │   └── ShapesLoader.tsx # Animated Bauhaus loading indicator
│   ├── Settings/
│   │   ├── index.tsx        # Main settings page (includes clear history)
│   │   ├── Chains.tsx       # Chain RPC management
│   │   ├── AddChain.tsx     # Add new chain
│   │   ├── EditChain.tsx    # Edit existing chain
│   │   ├── ChangePassword.tsx # Password change flow
│   │   ├── AutoLockSettings.tsx # Auto-lock timeout configuration
│   │   └── AgentPasswordSettings.tsx # Agent password set/remove (master only)
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
│   ├── TxStatusList.tsx     # Recent transaction history display (clickable → TxDetailModal)
│   ├── TxDetailModal.tsx    # Transaction detail modal (gas fees, function name, addresses)
│   ├── GasEstimateDisplay.tsx # Collapsible gas fee display with editable params (PK/Seed)
│   ├── TransactionConfirmation.tsx # In-popup tx confirmation with success animation
│   ├── TransactionConfirmationErrorBoundary.tsx # Last-resort reject UI for malformed tx renders
│   ├── SignatureRequestConfirmation.tsx # Signature request display for Bankr/PK/Seed signing
│   ├── SiweMessageDisplay.tsx # Human-readable SIWE auth review + raw message disclosure
│   ├── SiweValidationIssues.tsx # SIWE validation issue list
│   ├── TokenHoldings.tsx    # Portfolio token list with USD values
│   ├── TokenTransfer.tsx    # Token transfer form (recipient, amount, optional native calldata)
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
│   ├── wei.ts               # Wei Name Service SDK (forward/reverse .wei resolution)
│   └── mega.ts              # MegaNames utility (.mega resolution on MegaETH chain 4326)
├── hooks/
│   ├── useChat.ts           # Chat state management hook
│   └── useEnsIdentities.ts  # ENS/Basename/WNS/Mega identity resolution + caching hook
├── lib/
│   ├── ensUtils.ts          # ENS/Basename/WNS/Mega resolution (name, avatar, forward/reverse)
│   ├── ensIdentityCache.ts  # ENS identity cache (chrome.storage.local, 6-hour TTL)
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

**Step 0: Welcome Screen**

- Bankr logo + branding
- "Welcome to Bankr Wallet" heading
- "Get Started" button

**Step 1: Account Type Selection**

- Choose: Bankr Wallet, Private Key, Seed Phrase, or Impersonator
- Can select multiple account types to set up

**Step 2a: Bankr Setup** (if Bankr or both selected)

- API key input field
- Wallet address input (supports ENS, Basename, WNS `.wei`, and MegaNames `.mega` resolution)
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

**Step 2d: Impersonator Setup** (if Impersonator selected)

- Address input (view-only, no secrets stored)
- Display name (optional)

**Step 3: Create Password**

- Password + Confirm password fields (min 6 chars)
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

If a user navigates to the onboarding page when the extension is already configured, they're shown the success screen directly (no sensitive data exposed):

```typescript
useEffect(() => {
  const checkExistingSetup = async () => {
    const hasApiKey = await hasEncryptedApiKey();
    if (hasApiKey) {
      setStep("success");
    }
    setIsCheckingSetup(false);
  };
  checkExistingSetup();
}, []);
```

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
launcher accepting either a `.eth` name or a raw `0x` contract address, with
optional path/query/hash suffixes. It is intentionally not rendered inside the
popup.

The launcher intentionally reuses the same resolver path as address-bar
browsing:

1. `pages/Dapp3Browser.tsx` parses input using the dapp3 launcher rules:
   - `name.eth[/path]` -> `http://name.eth[/path]`
   - `0x<address>[/path]` -> `https://0x<address>.w3eth.io[/path]`
   - pasted `*.eth.limo`, `*.eth.link`, `*.w3eth.io`, and
     `0x<address>.1.w3link.io` gateway URLs are normalized back to the
     underlying ENS/address target.
2. The page navigates the current browser tab to `interstitial.html#<target-url>`.
3. `EnsInterstitial` parses the fragment and sends `ens-cache-check` followed
   by `ens-resolve` to the service worker.
4. `ensBrowsing/resolver.ts` resolves ENS `contenthash` records to IPFS/IPNS,
   or falls back to ERC-4804 / ERC-5219 onchain HTML via the resolved address.
5. The service worker chooses either the hosted gateway (`eth.limo` /
   `w3eth.io`) or the configured local Kubo gateway based on the existing
   `ensBrowsing` settings. Raw `0x` address mode follows the same split:
   `pinOnchainHtml` OFF probes support and routes to hosted `w3eth.io`;
   `pinOnchainHtml` ON fetches and pins the HTML body to local Kubo.
   Navigations to w3link's mainnet pattern (`0x<address>.1.w3link.io`) are
   also redirected to the interstitial and normalized into this raw-address
   path when ENS browsing is enabled.

The launcher lists user-pinned `ensBookmarks` entries first as browser-style
"Favorite dapps" tiles, followed by the freshest valid `ensResolveCache`
entries as "Recently cached dapps" tiles in a wider strip below the search bar.
Tile clicks submit the ENS name/address back through the same interstitial path
rather than constructing gateway URLs in the page. Gateway visits can attach
optional title/favicon metadata to the cache; older entries fall back to the
gateway `/favicon.ico` path and then to a letter tile if the image fails. Raw
`0x` ERC-4804 address-mode resolutions are cached here too so onchain HTML
dapps opened without ENS still appear in the recent tiles.

On local-gateway pages, the injected WalletChan · dapp3 banner links its left
logo/title cluster to `browse.html` in the same tab. The right side includes a
star button that writes/removes a local `ensBookmarks` entry for the current
ENS/address identity and path. Bookmarks store only non-secret display metadata
such as title and favicon.

No wallet credentials are used by this flow. It only reads Ethereum mainnet via
the configured RPC and optionally writes non-secret ENS / ERC-4804 caches and
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

`src/chrome/impersonator.ts`:

- Validates chain ID is in allowed list (1, 137, 8453, 130)
- Creates unique transaction ID
- Allows `to` to be null for contract deployment transactions
- Forwards dapp-provided gas parameters (`gas`, `gasPrice`, `maxFeePerGas`, `maxPriorityFeePerGas`) if present
- Posts message to content script
- Returns Promise that resolves when tx completes

### 4. Content Script Bridges to Background

`src/chrome/inject.ts`:

- Receives `i_sendTransaction` message
- Generates a unique `txId` (UUID) in the content script
- Immediately starts watching `chrome.storage.onChanged` for a `txResult:{txId}` key (via `waitForStorageResult`)
- Sends a **fire-and-forget** `chrome.runtime.sendMessage` to background (no callback) with the `txId` included
- When the storage result appears, forwards it back to inpage via `postMessage`
- **Security**: Only forwards whitelisted message types from background to the webpage (`setAddress`, `setChainId`, `setAccount`). All other background broadcasts are not forwarded, preventing dapps from eavesdropping on wallet events.

> **Why no sendMessage callback?** Chrome MV3 swallows `sendResponse` calls when multiple `onMessage` listeners exist across extension contexts (background + popup/sidepanel). The storage-based approach is immune to this because it bypasses the message channel entirely.

### 5. Background Stores Pending Transaction & Opens Popup

`src/chrome/background.ts`:

- Uses the `txId` provided in the message (generated by content script)
- Validates and normalizes `tx.value` through `src/chrome/transactionValidation.ts`; malformed values write a `txResult:{txId}` error and are not stored as pending requests
- Stores pending transaction in `chrome.storage.local`
- Updates extension badge with pending count
- **Auto-opens popup window** for user confirmation

### 6. Popup Auto-Opens for Transaction Confirmation

The extension automatically opens a popup window when a transaction request is received:

- Popup positioned at **top-right of the dapp's browser window**
- Works correctly across **multiple monitors** (follows the dapp's window)
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

`src/chrome/bankrApi.ts`:

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

- `walletConnectHandlers.ts` initializes WalletKit in the MV3 service worker, approves/rejects session proposals, exposes UI-only pair/list/disconnect handlers, and bridges final `txResult:*` / `sigResult:*` writes back to WalletConnect.
- `walletConnectProposal.ts` normalizes chainless `eip155` namespaces to the current active account's visible chains before `approveSession()`. This handles dapps that request EVM methods without an explicit `chains` array while preserving the existing Bankr-vs-local account chain restrictions. Proposals with no remaining approvable namespace are rejected instead of calling `approveSession()` with `{}`; the rejection is also broadcast to `WalletConnectView` as `walletConnectProposalRejected` so the UI can show the dapp logo, requested chain names/icons/IDs, and prefill the Add Chain screen when the chain is not configured. After a chain is added from that WalletConnect route, the popup returns to WalletConnect with a retry prompt because the original proposal was already rejected.
- `walletConnectRequestHandlers.ts` routes `session_request` events. `eth_sendTransaction` validates/normalizes `tx.value` through `transactionValidation.ts` before it becomes a pinned `PendingTxRequest`; `personal_sign` / typed-data methods become pinned `PendingSignatureRequest`s. The normal popup opens via `openExtensionPopup()`.
- `walletConnectBatchRequestHandlers.ts` adapts ERC-5792 methods (`wallet_getCapabilities`, `wallet_sendCalls`, `wallet_getCallsStatus`, `wallet_showCallsStatus`) to the existing `batchTxHandlers.ts` implementation.
- `walletConnectRpcRequestHandlers.ts` handles `wallet_switchEthereumChain`, `wallet_addEthereumChain`, and allowlisted read-only RPC forwarding.
- `walletConnectProtocol.ts` centralizes WalletConnect JSON-RPC success/error responses; `walletConnectHelpers.ts` holds session/account/method helpers.
- `walletConnectChainState.ts` maintains a WalletConnect-specific active chain (`walletConnectChainId`) separate from injected per-tab chain state. Explicit `wallet_switchEthereumChain` calls and inferred `args.params.chainId` changes from WC requests update this key and emit `chainChanged` to all active WC sessions that support the chain.
- `walletConnectKeepalive.ts` keeps the MV3 service worker responsive while approved WalletConnect sessions exist. It sends a `*_batchFetchMessages` relay request every 20s, processes any queued relay messages, and stops when the last active WC session is disconnected. This prevents WalletConnect tx/signature requests from waiting until the popup or sidepanel is opened.
- `walletConnectStorage.ts` stores `walletConnectPendingRequests`, a transient map from `txId`/`sigId` to `{ topic, requestId, method }` so `writeResultToStorage()` can answer the original WC request after the user confirms/rejects.

**Environment:** WalletConnect uses `VITE_WALLETCONNECT_PROJECT_ID` (or `VITE_WC_PROJECT_ID`) when provided, and otherwise falls back to WalletChan's default public WalletConnect project ID.

**Supported request behavior:**

- `eth_sendTransaction` uses the same confirmation screens and Bankr/PK/Seed signing paths as injected dapp transactions.
- ERC-5792 batching is supported over WalletConnect through `wallet_getCapabilities`, `wallet_sendCalls`, `wallet_getCallsStatus`, and `wallet_showCallsStatus`. `wallet_sendCalls` responds immediately with the bundle id; the dapp polls `wallet_getCallsStatus` just like the injected-provider route.
- `personal_sign`, `eth_signTypedData_v3`, and `eth_signTypedData_v4` use the same signature confirmation screens. EIP-712 validation/sanitization is shared with the injected-provider path.
- `eth_sign` and deprecated `eth_signTypedData` v1 are rejected.
- `eth_accounts`, `eth_requestAccounts`, `eth_chainId`, `net_version`, `wallet_switchEthereumChain`, and a small read-only RPC allowlist are answered directly in the background.
- WalletConnect chain selection is shared across all WC sessions, not per browser tab. Injected dapps continue to use their existing per-tab content-script chain state.

**Security model:** WalletConnect is a transport only. Request account binding is still pinned at arrival (`accountId`, `accountAddress`, `accountType`), and confirm-time signing resolves the pinned account rather than the currently active account. View-only impersonator accounts cannot approve sessions or sign requests.

### Gas Estimation

`src/chrome/gasEstimation.ts` + `src/components/GasEstimateDisplay.tsx`:

Pre-confirmation gas estimation shown on the transaction confirmation screen. Fetches gas limit, EIP-1559 fees, sender balance, and native token USD price.

**Background estimation (`gasEstimation.ts` + `feeEstimation.ts`):**

- Uses viem `createPublicClient` with cached clients (keyed by chainId), reuses `getRpcUrl()` from `txHandlers.ts`
- Parallel RPC calls: `estimateGas` (gas limit + 20% buffer), `estimateFeeTiers` (EIP-1559 fees from `eth_feeHistory`), `getBalance` (sender balance)
- CoinGecko price fetch with 60s in-memory cache for USD display
- Background CoinGecko service with shared storage-backed cache for native asset prices/logos
- If dapp provided gas params (`gas`, `maxFeePerGas`, `maxPriorityFeePerGas`, `gasPrice`), uses them as defaults and suppresses the tier picker
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
transactions from executing later after a future user tx fills the gap.

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
  → txHandlers.ts merges into tx (clears legacy gasPrice to avoid EIP-1559 conflict)
  → signAndBroadcastTransaction(privateKey, txWithGas, rpcUrl)
```

**Shared utilities (`lib/gasFormatUtils.ts`):** `formatEth()`, `formatGwei()`, `formatNumber()` — extracted from `TxDetailModal.tsx` for reuse.

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

- Origin (with favicon)
- Network badge
- Method name (e.g., "Personal Sign", "Sign Typed Data v4")
- Decoded message content (for personal_sign)
- Human-readable SIWE auth review for EIP-4361 messages
- Raw data with copy button

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

- "Sign in to {domain}" summary with the SIWE statement and dapp favicon
- Site, account, chain, URI, issued/expiration times, request ID, nonce, and resources
- Copy + explorer actions for the SIWE account address
- Validation status and issue list
- Raw SIWE message behind a collapsed disclosure

**Validation performed:**

1. EIP-4361 required structure and field ordering
2. Domain, address, URI, version, chain ID, nonce, and RFC 3339 timestamps
3. Expiration / not-before timing
4. Message domain ↔ URI host consistency
5. Connected site origin, connected chain, and signing account match. For
   dapp-originated requests, SIWE uses the Chrome-attested `sender.origin`
   captured as `senderOrigin` when available, falling back to the persisted
   request origin for legacy entries and WalletConnect peers.

Validation is run in the UI for user review and again in `txHandlers.ts` before
signing for all signing-capable account types. If a SIWE message has validation
errors, the Sign button stays disabled until the user types the exact phrase
`I understand`. The popup then sends the extension-only `allowUnsafeSiwe`
confirmation flag so the background handler can skip SIWE validation for that
request. The dapp-supplied signer parameter must still match the pinned account;
that check is separate from SIWE validation and is not bypassable.

### Combined Navigation

When both transaction and signature requests are pending:

- Counter shows combined total (e.g., "1/3" for 2 tx + 1 sig)
- Transaction requests appear first in the list
- Navigation arrows allow moving between all request types
- "Reject All" button rejects both transactions and signatures
- Pending list shows both types with TX/SIG badges

### EIP-712 Validation (v1.4.0+)

Before storing or displaying EIP-712 signature requests, typed data is validated to prevent malicious attacks.

**When**: Before storing in `pendingSignatureRequests`
**Methods validated**: `eth_signTypedData_v3`, `eth_signTypedData_v4`
**Location**: `txHandlers.ts:handleSignatureRequest()` line ~197

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

**Files**: `eip712Validator.ts` (validation logic), `txHandlers.ts` (integration)

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

After a tx is broadcast, `txReceiptPoller.startReceiptPolling(txId, txHash, chainId)` polls `eth_getTransactionReceipt` until a receipt is found or the 10-minute timeout elapses. Default cadence: 2s initial, 1.5× exponential backoff up to 30s.

Chains marked with `supportsFlashblocks: true` in `CHAIN_REGISTRY` (Base, Unichain, Optimism) get an additional **fast phase**: 250ms polling for the first ~5s before the standard schedule kicks in. This delivers ~250ms user-perceived confirmation. The default RPCs for all three (`mainnet.base.org`, `mainnet.unichain.org`, `mainnet.optimism.io`) are already Flashblocks-aware — `eth_getTransactionReceipt` resolves at Flashblock pace without any URL change. Premium providers (Alchemy, QuickNode, Chainstack) also serve Flashblocks data. On a non-Flashblocks-aware RPC the fast phase is harmless polling overhead — the receipt arrives at the normal ~2s mark and the loop transitions to standard backoff.

To enable Flashblocks for another chain, set `supportsFlashblocks: true` on its `CHAIN_REGISTRY` entry. The `FLASHBLOCKS_CHAIN_IDS` set auto-derives, no other code changes required.

### Sync Send (EIP-7966)

Chains marked with `supportsSyncSend: true` (MegaETH today) skip the receipt poller entirely on local-signed (PK/Seed) txs. `signAndBroadcastTransaction` in `localSigner.ts` signs the tx locally, then posts `eth_sendRawTransactionSync` directly to the RPC — the response is the **full receipt** in a single round trip (~100ms on MegaETH). The receipt is written directly to tx history via `applyReceiptToHistory()` in `txReceiptPoller.ts`, no polling.

To avoid an intermediate "pending" flash on the activity tab, all three broadcast call sites (`processLocalTransactionInBackground` in `txHandlers.ts`, `broadcastSwapTxLocal`, and the batch broadcast loop in `batchTxHandlers.ts`) branch on `result.receipt`: when present, jump straight to the final state via `applyReceiptToHistory`; otherwise mark the tx as `pending` and start the poller. The history's `txHash` field is now also written by `applyReceiptToHistory` so the sync-send path doesn't need a placeholder write.

**MegaETH RPC quirk:** EIP-7966 specifies the `timeout` param as a hex-encoded Quantity (`"0x1388"` for 5000ms), and viem's `sendRawTransactionSync` follows the spec via `numberToHex(timeout)`. MegaETH's RPC rejects this with `Invalid params: timeout must be a positive number` and only accepts a plain integer. We bypass viem's wrapper and call `client.request({ method: "eth_sendRawTransactionSync", params: [serialized, 5000] })` directly. The receipt comes back in raw RPC shape (status `"0x1"`/`"0x0"`, hex bigints) which `applyReceiptToHistory` already normalizes for both viem-formatted and raw receipts.

If the sync call throws or times out (5s), the broadcaster transparently falls through to the standard `client.sendTransaction()` + `startReceiptPolling()` path. Users always get *some* outcome.

The same path covers ERC-5792 batched txs because the ERC-7821 wrapper is itself a single signed tx. For PK/SP EIP-7702 wrappers, inner `Call.value` amounts stay encoded and visible to the user, but the signed outer EOA self-call uses `value: 0x0` to avoid a redundant native transfer to self. Bankr-API accounts are unaffected (MegaETH is `isBankrSupported: false`).

### Post-confirm Asset Changes Extraction

After a tx confirms successfully, the receipt path fires-and-forgets `extractAndStoreAssetChanges` from `chrome/assetChangesExtractor.ts`. Most txs flow through `applyReceiptToHistory` (in `txReceiptPoller.ts`). Bankr direct-success paths (`txHandlers.ts`, `batchTxHandlers.ts`, and `crossDappBatchHandlers.ts`) use `receiptEnrichment.ts` to retry `eth_getTransactionReceipt` asynchronously, because Bankr can return `success` before the user's configured RPC has indexed the receipt. For ERC-5792 responses, an immediately available raw receipt is converted to the sanitized `BundleReceipt` shape before storing it for `wallet_getCallsStatus`, while the raw receipt is kept for internal extraction. `TxDetailModal` also sends the extension-only `backfillAssetChanges` message when a confirmed history entry has a `txHash` but no `assetChanges`, so old entries and service-worker-interrupted retries can repair themselves on open. The extractor:

1. Decodes the receipt's `logs[]` for ERC-20 `Transfer(from, to, amount)` events (topic0 = `0xddf252ad…`, exactly 3 topics — ERC-721 logs have 4 and are skipped naturally) where the lowercased `from` OR `to` matches the sender. Internal pool routing is filtered out.
2. Resolves `symbol/decimals/logoUrl` per unique token via `tokenMetadata.ts`, which shares swap-list, Bungee-list, watched-asset, and hardcoded-logo fallbacks.
3. Computes the sender's pure native-value flow as `balance(blockNumber) - balance(blockNumber-1) + gasCost`, where `gasCost = gasUsed * effectiveGasPrice + (l1Fee || 0)`. The historical-balance call retries up to 3× with 2s backoff to absorb load-balanced RPCs that briefly don't yet know about `blockNumber-1`; if it never resolves, `nativeDelta` is left undefined and the modal silently hides the row.
4. Attempts to seed `recentlyReceivedTokens` (5-minute TTL cache) for every inbound ERC-20 so `loadPortfolioTokenCatalog` (`chrome/portfolioTokens.ts`) can inject a synthetic stub into the portfolio before the upstream portfolio API has re-indexed. This happens before the tx-history broadcast when storage succeeds, so Holdings can merge the stub immediately. A seed failure is logged but must not block writing `assetChanges`. The on-chain balance multicall in `TokenHoldings` overwrites balance with the live value; CoinGecko/GeckoTerminal backfills price while `tokenMetadata.ts` backfills any missing symbol/logo.
5. Writes the resulting `AssetChangeRecord` onto the existing tx-history entry via `updateTxInHistory({ assetChanges })` — purely additive, no migration required.

**Bridge destination leg.** When `bridgeStatusPoller.checkAndApplyStatus` sees a destination `txHash` arrive for the first time (`!priorEntry?.bridge?.destinationTxHash`), it fires `extractAndStoreDestinationAssetChanges` against the destination chain's RPC (resolved via `getRpcUrl`). Same decoder, `payerForGas: false` (the receiver didn't pay gas on the dest chain), written to `destAssetChanges`. The modal renders a second `AssetChangesCard` titled "On {destChainName}".

**Refresh wiring.** `updateTxInHistory()` broadcasts `txHistoryUpdated` with `updatedTx` and `changedKeys` (top-level fields from the update object). `TokenHoldings.tsx` listens for entries whose `from` or `bridge.receiverAddress` matches the displayed wallet AND that carry `assetChanges` or `destAssetChanges`, then force-reloads. ERC-20s from the receipt are passed through as forced refresh keys/stubs so they bypass the collapsed low-value-token RPC deferral and get immediate onchain balances even when the "Under $0.10" group is closed. `PortfolioTabs.tsx` also listens, but only refreshes balances for balance-relevant `changedKeys` (`status`, `txHash`, `completedAt`, `assetChanges`, `destAssetChanges`); bridge-only progress updates (`changedKeys: ["bridge"]`) must not trigger portfolio RPC sweeps across every visible chain.

**Failure surface.** Both extraction paths are wrapped in try/catch + `console.warn`. A failing RPC, malformed receipt, or transient storage error must never block the confirmation notification (source path) or the bridge state machine (destination path).

### Per-chain gas buffer

All chains add a 20% buffer on top of `eth_estimateGas` to absorb state changes between estimate and inclusion. The buffer can be overridden per-chain via `gasBufferPct` on the registry entry (default 20). No chain currently overrides it.

### Non-standard gas models (MegaETH)

Some chains use gas accounting that differs from standard EVM. MegaETH uses a [dual gas model](https://github.com/megaeth-labs/mega-evm/blob/main/docs/DUAL_GAS_MODEL.md) — compute gas and storage gas tracked separately, plus SSTORE bucket multipliers that scale storage cost. Locally-computed gas values (dapp-provided, GAS-opcode-based simulation tricks) miss the storage component and systematically under-estimate, causing OOG reverts on storage-heavy ops like ERC20 approve.

Chains with `usesNonStandardGasModel: true` on the registry entry get three behavioral changes that all defer gas computation to the chain's own `eth_estimateGas` (which knows its model and is accurate):

1. **Intake strip** (`txHandlers.ts` `handleTransactionRequest`): the dapp's `tx.gas` field is removed before storing as a pending request. All downstream code (UI estimation, signing) sees `gas: undefined` and re-estimates via the chain.
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

**See**: `src/chrome/txHandlers.ts` -> `showNotification()` for the shared
helper and `src/chrome/background.ts` -> `dappChainSwitchNotification` for
dapp-initiated chain switch notifications. Chain switch notifications pass the
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

**See**: `src/chrome/txHistoryStorage.ts` for `CompletedTransaction` interface and `TxStatus` type. Each entry tracks the transaction params, origin, chain, status (processing/success/failed), timestamps, and result (txHash or error).

Additional fields populated after transaction submission:

- `accountType` — `"bankr" | "privateKey" | "seedPhrase"` — which account type submitted the tx
- `functionName` — Human-readable function name extracted from decoded calldata (see Function Name Resolution below)
- `batchCallOrigins` — optional `{ origin, favicon }[]` captured for cross-dapp batch history entries. It aligns one-to-one with the encoded ERC-7821 calls so TxDetailModal can render each contributing dapp in the decoded call list; old entries fall back to the batch-level `origin/favicon`.
- `gasData` — Gas fee breakdown fetched asynchronously after tx confirms (see Gas Data Fetching below)

#### GasData Interface

```typescript
interface GasData {
  gasUsed: string; // decimal string
  gasLimit: string; // decimal string
  effectiveGasPrice: string; // decimal string (wei)
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

1. **After tx success**: `fetchAndStoreGasData()` in `txHandlers.ts` runs fire-and-forget, calling `eth_getTransactionByHash` (gasLimit) and `eth_getTransactionReceipt` (gasUsed, effectiveGasPrice). For OP Stack L2s (Base 8453, Unichain 130), L1 fee fields (`l1Fee`, `l1GasUsed`, `l1GasPrice`) are extracted from the receipt.
2. **On-demand in TxDetailModal**: For older transactions missing `gasData`, the modal fetches directly via RPC when opened.
3. **Graceful degradation**: Errors are silently ignored (non-critical data).

### Storage Functions

| Function                           | Description                               |
| ---------------------------------- | ----------------------------------------- |
| `getTxHistory()`                   | Get all history (newest first, max 50)    |
| `addTxToHistory(tx)`               | Add new entry with "processing" status    |
| `updateTxInHistory(txId, updates)` | Update status, txHash, error, completedAt |
| `clearTxHistory()`                 | Remove all history entries                |

### Storage Details

- **Key**: `txHistory` in `chrome.storage.local`
- **Max entries**: 50 (oldest entries removed when limit exceeded)
- **Sort order**: Newest first (by `createdAt`)

### Chrome Storage RMW Locks

Any helper that reads a `chrome.storage` array/map/object, mutates it, and
writes the full value back must serialize that key through
`src/chrome/storageLock.ts`. Use a lock key that includes the storage area and
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
- From/To addresses with `AddressParam` (ENS/Basename/WNS/Mega resolution, labels, copy + explorer links)
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

`bundleStatuses` is stored as a single array in `chrome.storage.local` and is
read by `wallet_getCallsStatus`. `bundleStatusStorage.ts` serializes
`saveBundleStatus`, `updateBundleStatus`, and cleanup writes with an in-process
lock so concurrent read-modify-write operations cannot clobber each other. This
is required for cross-dapp batches where one confirmed onchain transaction fans
out terminal status updates to multiple source `wallet_sendCalls` bundle IDs.

## Token Holdings & Transfers

### Portfolio API

Token holdings are fetched via a website API route that wraps the Octav API:

- **Website route**: `apps/website/app/api/portfolio/route.ts` (GET `/api/portfolio?address=0x...`)
- **Extension client**: `portfolioApi.ts` fetches from `https://walletchan.com/api/portfolio`
- **Response format**: Provider-agnostic `PortfolioResponse` with `tokens[]` and `totalValueUsd`

### Onchain Balance Verification

API portfolio data is shown immediately, while onchain balances are verified in the background via `onchainBalances.ts`:

- **Multicall3** (`0xcA11bde05977b3631167028862bE2a173976CA11`, same address on all chains) batches native `getEthBalance` and ERC20 `balanceOf` calls into a single multicall per chain
- Calls are chunked into batches of 100 to avoid oversized RPC requests
- Parallel execution across all chains with 8s timeout and no retries
- Cached viem clients per chainId for performance
- Falls back to API values on any error (per-token or per-batch)
- `fetchOnchainBalances(..., { preserveZeroBalanceTokens: true })` keeps zero-balance entries when selector UIs need the full token catalog instead of a non-zero-only holdings list

### Shared Portfolio Token Catalog

`portfolioTokens.ts` is the single source of truth for wallet token lists shown across the extension. It builds a shared catalog consumed by `TokenHoldings`, `TokenTransfer`, and `SwapView` by merging:

- Portfolio API tokens
- User-added custom ERC-20 tokens from `chrome.storage.local.customTokens`
- Recently received ERC-20 stubs from `chrome.storage.local.recentlyReceivedTokens`
- Native token placeholders for visible custom chains
- CoinGecko USD price fallback for custom-chain native tokens when the portfolio API has no price (for example `MON` on Monad)
- ERC-20 metadata fallback via `tokenMetadata.ts` so recently received/custom tokens can reuse the same logo/name source as Swap/Bridge selectors
- The CoinGecko fallback runs through the background `coingeckoService.ts`, which batches lookups and persists market/search caches in `chrome.storage.local` so reopening the popup doesn't cold-start CoinGecko traffic each time

After the merged catalog is built, `portfolioTokens.ts` filters global hidden tokens from `chrome.storage.local.hiddenPortfolioTokens` before calculating `totalValueUsd`. This keeps Holdings, Send, Swap holdings, current totals, and newly-written balance snapshots aligned across every wallet address. Recently received token keys are returned alongside the catalog so Holdings can still RPC-refresh those tokens immediately even if their current USD value would normally place them in the collapsed low-value group. `AddTokenModal` removes a matching hidden entry before adding a token; if the Portfolio API already returned that token, no custom token record is created.

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
- Any new UI that needs a chain icon should render `ChainIcon`, not `config.icon` directly

### TokenHoldings Component

- Shows token list with symbol, balance, USD value, chain badge
- Hover actions include Swap, Send, custom-token Edit, and an overflow menu for hiding ERC-20 tokens
- Hiding a token stores a global hidden-token entry, removes it from totals, clears cached holdings, and force-appends a current aggregate snapshot so future chart points reflect the hidden-token view without deleting existing chart history
- Total portfolio value header with hide/show toggle (persisted in `chrome.storage.sync.hidePortfolioValue`)
- 60-second client-side cache
- Refresh button, loading skeletons, empty state
- Click token → opens TokenTransfer view

### Portfolio Snapshot Storage

`portfolioSnapshotStorage.ts` silently records `totalValueUsd` snapshots per address over time in `chrome.storage.local` under the key `portfolioSnapshots`.

**How it works:**

- `recordSnapshot(address, totalValueUsd, options?)` is called from `TokenHoldings.tsx` after each portfolio load (preferring onchain enhanced value, falling back to API-only)
- Hidden-token visibility changes call `recordSnapshot(..., { force: true })` to append the current visible total immediately while preserving prior chart history
- Snapshots are deduplicated by default: skipped if the last snapshot for the address is <1 hour old unless `force` is set
- Entries older than 8 days are pruned on each write
- Addresses are normalized to lowercase

**Storage shape:**

```typescript
// chrome.storage.local key: "portfolioSnapshots"
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

### Typed Data Display

EIP-712 typed data signatures show structured display:

- **Component**: `TypedDataDisplay.tsx` with Structured/Raw tab toggle
- **Domain section**: name, version, chainId, verifyingContract (with address label)
- **Primary type**: highlighted header
- **Message fields**: recursive display for nested objects/arrays, address labels from eth.sh
- Personal_sign and eth_sign fall back to plain message + raw data display

### Tenderly Simulation

Transaction confirmation includes a "Simulate on Tenderly" button:

- Opens `https://dashboard.tenderly.co/simulator/new` with pre-filled tx params
- No API key needed (URL-based simulation)
- Skipped for contract deployments (no `to` address)

## ENS/Basename/WNS/Mega Identity Resolution

Accounts in the dropdown automatically resolve ENS names, Basenames, WNS `.wei` names, MegaNames `.mega` names, and avatars. Results are cached in `chrome.storage.local` for 6 hours.

### Resolution Priority

ENS (Ethereum mainnet) takes precedence over Basename (Base L2), which takes precedence over WNS (Wei Name Service), which takes precedence over MegaNames (MegaETH):

1. **Name**: ENS name > Basename > WNS `.wei` name > MegaNames `.mega` name > truncated address
2. **Avatar**: ENS avatar (when ENS name exists) > Basename avatar (when only Basename exists) > Mega avatar (when only Mega name exists) > BankrAvatar (Bankr accounts) > BlockieAvatar (fallback). WNS names have no avatar support.

All name services are resolved in parallel for speed via `resolveEnsIdentity()` in `ensUtils.ts`. If ENS name exists, ENS avatar is fetched; Basename avatar is only fetched when no ENS name is found; Mega avatar is fetched via `text(tokenId, "avatar")` when only Mega name exists; WNS names have no avatar support.

### Display Priority in AccountSwitcher

| Condition                       | Primary Name      | Secondary         | Tag                                |
| ------------------------------- | ----------------- | ----------------- | ---------------------------------- |
| User-set displayName + ENS name | displayName       | truncated address | ENS name (gray tag) + account type |
| User-set displayName, no ENS    | displayName       | truncated address | account type only                  |
| No displayName, ENS name exists | ENS name          | truncated address | account type only                  |
| No displayName, no ENS          | truncated address | (none)            | account type only                  |

### Architecture

```
AccountSwitcher.tsx
  └── useEnsIdentities(addresses)         # React hook
        └── ensIdentityCache.ts           # Cache read/write (chrome.storage.local)
              └── ensUtils.ts             # resolveEnsIdentity() — RPC calls
                    ├── getEnsName()      # mainnet reverse resolution
                    ├── getBasename()     # Base L2 reverse resolution
                    ├── getWeiName()      # WNS reverse resolution (via wei.ts SDK)
                    ├── getMegaName()     # MegaNames reverse resolution (MegaETH chain 4326)
                    ├── getEnsAvatar()    # mainnet avatar lookup
                    ├── getBasenameAvatar() # Base L2 avatar lookup
                    └── getMegaAvatar()   # MegaNames avatar lookup (text record)
```

### Cache

- **Storage key**: `ensIdentityCache` in `chrome.storage.local`
- **TTL**: 6 hours per entry
- **Schema**: `Record<lowercaseAddress, { name, avatar, resolvedAt }>`
- **Manual refresh**: "Refresh ENS Data" button in Account Settings forces re-resolution (ignores cache)

### RPC Configuration

`ensUtils.ts` reads user-configured RPCs from `chrome.storage.sync` (`networksInfo`), falling back to `DEFAULT_NETWORKS` defaults. This ensures ENS and MegaNames resolution uses the same RPC endpoints configured in Settings → Chains. MegaNames uses the user's MegaETH RPC (chain 4326, default `https://mainnet.megaeth.com/rpc`). WNS resolution uses its own RPC endpoints (configured in `src/utils/wei.ts`) with automatic failover.

### Files

| File                                      | Purpose                                                                     |
| ----------------------------------------- | --------------------------------------------------------------------------- |
| `src/lib/ensUtils.ts`                     | ENS/Basename/WNS/Mega name + avatar resolution, `resolveEnsIdentity()`      |
| `src/lib/ensIdentityCache.ts`             | Cache read/write, `resolveAndCacheIdentity()`                               |
| `src/utils/wei.ts`                        | Wei Name Service SDK — forward/reverse `.wei` name resolution               |
| `src/utils/mega.ts`                       | MegaNames utility — ABI, constants, `isMega()` for `.mega` resolution       |
| `src/hooks/useEnsIdentities.ts`           | React hook: loads cache, resolves stale entries, exposes `refreshAddress()` |
| `src/components/AccountSwitcher.tsx`      | Integrates hook, renders ENS avatars/names/tags                             |
| `src/components/AccountSettingsModal.tsx` | "Refresh ENS Data" button                                                   |

## RPC Proxy (CSP Bypass)

Many dapps have strict Content Security Policy that blocks connections to RPC endpoints. The inpage script runs in the page's context and is subject to these restrictions.

**Solution**: Proxy RPC calls through the background worker, with a narrow
page-local fast path for non-critical dapp reads.

The inpage provider (`impersonator.ts`) installs a `window.fetch` observer in
the page context and records HTTP(S) URLs whose request bodies look like
JSON-RPC. `dappRpcForwarding.ts` validates each discovered URL with
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

The background worker is not subject to page CSP. Security: the handler only accepts extension-configured RPC URLs and enforces a 15-second timeout to prevent resource exhaustion.

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
- Impersonator rejects the promise with error: `"Chain {chainId} is not supported"`
- Dapp receives the error and can display appropriate UI

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

`src/chrome/crypto.ts` and `src/chrome/vaultCrypto.ts`:

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
4. Agent password can now decrypt vault key → vault key decrypts API key and private keys
5. Both master and agent passwords work for all operations (except private key reveal)

**Storage Format Detection**:

- `salt === ""` in keystore → vault-key encrypted (current format)
- `salt !== ""` in keystore → password encrypted (legacy format, backward compatible)

**IMPORTANT**: When saving credentials after vault key migration:

- API keys: Use `encryptedApiKeyVault` (encrypted with vault key), NOT `encryptedApiKey`
- Private keys: Use vault-key encryption via `encryptPrivateKeyWithVaultKey()`, NOT password encryption
- The system automatically detects which format is in use and saves to the correct location

**Security Note**: Private keys are ONLY decrypted in the service worker (background.ts) and NEVER exposed to content scripts, inpage scripts, or the UI layer. See [PK_ACCOUNTS.md](./PK_ACCOUNTS.md) for detailed security architecture.

### Session Caching (Wallet Lock/Unlock)

Wallet lock flow for secure credential management:

- Decrypted API key, **private keys vault**, and password are cached in background worker memory
- **Private keys are NEVER sent to UI** - only used internally for signing
- Cache expires based on **configurable auto-lock timeout** (default: 15 minutes)
- Cache cleared on browser close or extension suspend
- When locked, user must enter password before:
  - Viewing the main wallet interface
  - Confirming any pending transactions or signature requests
- Unlock persists across popup open/close cycles (until cache expires)

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

**Migration**: Existing users are automatically migrated to the vault key system on first unlock with master password. The migration:

1. Generates a new 256-bit vault key
2. Encrypts vault key with master password → saved to `encryptedVaultKeyMaster`
3. Re-encrypts API key with vault key → saved to `encryptedApiKeyVault`
4. Re-encrypts all private keys with vault key → `pkVault` entries updated (v1.3.0+)
5. Re-encrypts all seed phrases with vault key → `mnemonicVault` entries updated (v1.3.0+)

**Partial Migration Detection**: If vault key system exists but private keys are still password-encrypted (e.g., upgraded from v1.2.0 to v1.3.0), the system automatically detects this on next master password unlock and completes the migration. Agent password unlock will fail with "Failed to decrypt vault" until migration is complete. 4. Legacy `encryptedApiKey` is kept but no longer read after migration

**Credential Saving** (v1.3.0+): When saving/updating credentials after wallet setup:

**API Keys**:

- If `cachedVaultKey` exists → encrypt with vault key → save to `encryptedApiKeyVault`
- If no vault key (legacy) → encrypt with password → save to `encryptedApiKey`
- Handled automatically by `handleSaveApiKeyWithCachedPassword()` and `addBankrAccount` handler

**Private Keys**:

- If `cachedVaultKey` exists → encrypt with vault key via `encryptPrivateKeyWithVaultKey()` → save to `pkVault` with `salt: ""`
- If no vault key (legacy) → encrypt with password via `encryptPrivateKey()` → save to `pkVault` with `salt: "base64..."`
- Handled automatically by `addKeyToVault()` in `vaultCrypto.ts`

**Seed Phrases**:

- Same pattern as private keys using `encryptMnemonicWithVaultKey()` or `encryptMnemonic()`
- Saved to `mnemonicVault` with appropriate salt indicator

**Security Invariants**:

1. Private key reveal is **always blocked** when unlocked with agent password
2. Seed phrase reveal is **always blocked** when unlocked with agent password
3. Adding seed phrases / deriving accounts is **blocked** with agent password
4. Agent password management requires master password
5. Master password change requires master password (agent cannot change it)
6. Bankr API key & address change requires master password
7. Both passwords use the same auto-lock timeout
8. No timing leak between password types (tries master first, then agent)
9. Changing master password does NOT invalidate agent password

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
- Background worker caches the timeout value in memory for performance
- Storage change listener keeps cached value in sync across tabs
- When timeout is `0` ("Never"), cache validation always passes
- All credential getters enforce the same timeout, including the vault key
  and cached password type. When a timed session expires, the background
  worker clears the cached API key, password, private-key vault, vault key,
  and password type together.
- Changes take effect immediately (no restart required)
- **Validation**: `setAutoLockTimeout` validates against allowed values and returns `false` for invalid values

**Message Types**:

| Type                 | Description                                              |
| -------------------- | -------------------------------------------------------- |
| `getAutoLockTimeout` | Get current timeout value                                |
| `setAutoLockTimeout` | Set new timeout value (validated against allowed values) |

#### Session Restoration (Auto-Lock "Never" Mode)

When auto-lock is set to "Never", the extension stores session data in `chrome.storage.session` to allow seamless credential recovery after service worker restarts. This prevents the annoying "Wallet is locked" prompts that would otherwise occur when Chrome suspends and restarts the service worker.

**Why This Is Needed**:

Chrome MV3 service workers are frequently suspended/restarted to save resources. When this happens:

1. All in-memory state is cleared (`cachedApiKey`, `cachedVault`, `cachedVaultKey`, etc.)
2. The `suspend` event clears cached credentials
3. Without session restoration, users would see unlock prompts even with auto-lock "Never"

**How It Works**:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     Session Restoration Architecture                         │
│                                                                             │
│  On Unlock (when auto-lock is "Never"):                                     │
│    1. Generate session ID: crypto.randomUUID()                              │
│    2. Encrypt password with random AES-256-GCM key                          │
│    3. Store in chrome.storage.session:                                      │
│       - sessionId: unique session identifier                                │
│       - sessionStartedAt: timestamp                                         │
│       - autoLockNever: true                                                 │
│       - encryptedSessionPassword: { data, key, iv }                         │
│                                                                             │
│  On Service Worker Restart (credentials lost):                              │
│    1. Handler checks: getCachedApiKey() === null                            │
│    2. If auto-lock is "Never" (timeout === 0):                              │
│       - Call tryRestoreSession()                                            │
│       - Read encryptedSessionPassword from session storage                  │
│       - Decrypt password                                                    │
│       - Call handleUnlockWallet(password) to restore credentials            │
│       - Re-store session password for future restarts                       │
│    3. Operation continues with restored credentials                         │
│                                                                             │
│  On Manual Lock:                                                            │
│    1. clearSessionStorage() is called                                       │
│    2. All session data is removed                                           │
│    3. Session cannot be restored until next unlock                          │
│                                                                             │
│  On Auto-Lock Setting Change:                                               │
│    - "Never" → timed: Clear session storage (no more restoration)           │
│    - Timed → "Never" (while unlocked): Store session for restoration        │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Security Considerations**:

- Password is encrypted with a random key (not stored in plain text)
- `chrome.storage.session` is cleared when the browser closes
- Session storage is not synced across devices
- Session storage is only accessible to the background service worker
- Manual lock always clears session storage

**Handlers with Session Restoration**:

The following message handlers attempt session restoration when auto-lock is "Never" and credentials are not cached:

| Handler                            | Purpose                                  |
| ---------------------------------- | ---------------------------------------- |
| `isWalletUnlocked`                 | Main lock state check (used by UI)       |
| `getCachedPassword`                | Check if password is cached (used by UI) |
| `getCachedApiKey`                  | Display API key in settings              |
| `submitChatPrompt`                 | Chat with Bankr AI                       |
| `saveApiKeyWithCachedPassword`     | Update API key while unlocked            |
| `saveBankrApiKeyAndAddress`        | Update Bankr API key and account address while unlocked |
| `changePasswordWithCachedPassword` | Change wallet password while unlocked    |
| `addBankrAccount`                  | Add new Bankr account with API key       |
| `addPrivateKeyAccount`             | Add new private key account              |
| `addSeedPhraseGroup`               | Generate/import seed phrase              |
| `deriveSeedAccount`                | Derive new account from seed phrase      |
| `revealPrivateKey`                 | Reveal private key (security-sensitive)  |
| `revealSeedPhrase`                 | Reveal seed phrase (security-sensitive)  |
| `setAgentPassword`                 | Set agent password (in authHandlers.ts)  |
| `cancelTransaction`                | Cancel in-progress transaction           |
| `confirmCrossDappBatch`            | Ship the user-assembled cross-dapp batch via Bankr API or PK/SP EIP-7702 local signing |
| `initiateSetDelegation` / `initiateRevokeDelegation` | Queue Smart Account Set/Revoke txs; final storage mirror is reconciled from `eth_getCode(EOA)` after receipt |

**Account pinning for prepared work**:

- Dapp-created pending txs and `wallet_sendCalls` batches are pinned at request creation with `accountId`, `accountAddress`, and `accountType`. Cross-dapp batch add/confirm handlers must resolve that pinned account directly; they must never fall back to the current active account when `params.from` is omitted or when the user switches accounts while the request is open.
- Internal swap/bridge confirmations capture `{ accountId, fromAddress }` when the quote is prepared. `executeSwapDirect`, `executeSwapBatch`, and `executeSwapAtomicPK` must resolve that locked account directly and reject if the stored account address differs from the lock, or if any prepared transaction's `tx.from` / `chainId` differs from the locked values.

**CRITICAL: Adding New Handlers**

When adding any new message handler that requires `getCachedPassword()` or `getCachedApiKey()`, you MUST include session restoration logic. Without it, the handler will fail when auto-lock is "Never" and the service worker has restarted.

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

**Why this matters**: Chrome MV3 service workers are frequently suspended and restarted. When this happens, all in-memory state (including cached credentials) is lost. The session restoration mechanism recovers credentials from `chrome.storage.session`, but only if the handler explicitly calls it.

**Storage Schema** (in `chrome.storage.session`):

| Key                        | Type    | Description                          |
| -------------------------- | ------- | ------------------------------------ |
| `sessionId`                | string  | Unique session identifier            |
| `sessionStartedAt`         | number  | Timestamp when session started       |
| `autoLockNever`            | boolean | Whether auto-lock is "Never"         |
| `encryptedSessionPassword` | object  | Encrypted password { data, key, iv } |

**Message Types**:

| Type                | Description                                              |
| ------------------- | -------------------------------------------------------- |
| `validateSession`   | Check if session is valid (returns { valid, sessionId }) |
| `tryRestoreSession` | Attempt to restore session (returns boolean)             |

**UI Port Reconnection**:

The UI (App.tsx) maintains a keepalive port to the service worker. When the service worker restarts:

1. The port disconnects
2. `onDisconnect` listener detects this
3. After 100ms delay, `establishKeepalivePort()` reconnects
4. This ensures `activeUIConnections` tracking remains accurate

**See**: `src/App.tsx` → `establishKeepalivePort()` for the automatic reconnection implementation.

#### Password Caching for API Key Changes

When changing the API key while the wallet is unlocked:

- Uses the **cached password** to encrypt the new API key
- No need to re-enter password if session is active
- If cache expires, prompts for "Current Password" with message "Session expired"
- Existing API key is **pre-filled** in the form (decrypted from cache)

#### Password Change Flow

When changing the wallet password (Settings → Change Password):

- **No current password required**: User is already authenticated (wallet unlocked)
- **Must be unlocked with master password**: Agent password sessions cannot change the password
- **Session check**: Periodic check (every 30 seconds) ensures session hasn't expired
- **Auto-redirect**: If session expires while on the form, user is redirected to unlock screen
- **Cache cleared**: After password change, user must unlock with new password
- Password handling stays entirely in background worker (never exposed to UI)

**With Vault Key System** (current) — atomic write pattern:

1. Decrypt vault key with cached (old) password to get raw bytes
2. Compute re-encrypted vault key with new password (in memory)
3. **Only re-encrypt legacy entries** (if any exist):
   - Check if `pkVault` entries have `salt !== ""` (legacy password encryption)
   - If yes: re-encrypt with new password via `computeReEncryptedVault()` (in memory)
   - If no (vault-key encrypted): skip re-encryption
   - Same check for `mnemonicVault` entries
4. **Single atomic `chrome.storage.local.set()`** writes all re-encrypted data at once
5. **Vault-key encrypted data stays unchanged**:
   - API key (in `encryptedApiKeyVault`) unchanged
   - Private keys (in `pkVault` with `salt: ""`) unchanged
   - Seed phrases (in `mnemonicVault` with `salt: ""`) unchanged
6. **Agent password is cleared** - `encryptedVaultKeyAgent` is removed and must be set again after the master password changes

**Why atomic**: If any re-encryption step fails (OOM, crypto error), no storage writes happen. Without atomicity, the vault key could be updated to the new password while legacy entries remain encrypted with the old password, making data inaccessible.

**Note (v1.3.0+)**: After migration, `pkVault` and `mnemonicVault` entries are encrypted with the vault key (indicated by `salt: ""`), NOT with the user's password. Only legacy entries (pre-migration) need re-encryption during password change.

**Legacy System** (pre-vault key migration):

1. Decrypt API key, private-key vault, and mnemonic vault with old password
2. Re-encrypt all present legacy secrets with new password in memory
3. Persist `encryptedApiKey`, `pkVault`, and `mnemonicVault` together in one `chrome.storage.local.set()` call

### Pending Transaction Storage

Transactions are stored persistently in `chrome.storage.local`:

- Closing popup does NOT reject/cancel pending transactions
- Pending requests survive popup close, browser restart
- Extension badge shows count of pending requests
- Transactions auto-expire after 30 minutes (periodic cleanup + enforced at confirmation time)
- Confirmation handlers reject expired requests even if periodic cleanup hasn't run
- Save/remove/expiry writes are serialized with `storageLock.ts` so a cleanup interval cannot erase a request saved by a concurrent dapp or WalletConnect request
- A `processingTxIds` Set prevents the same transaction from being confirmed twice concurrently
- User can review and confirm/reject at any time

#### Pending Requests List

When multiple transactions are pending:

- Shows all pending requests with **request numbers** (#1, #2, etc.)
- Displays: origin favicon, hostname, chain badge, timestamp, target address
- Click any request to view full details
- **Reject All** button at the bottom to reject all pending transactions

## Popup Window Positioning

When a transaction request is received, the background worker automatically opens a popup window positioned at the top-right of the dapp's window.

**See**: `src/chrome/txHandlers.ts` → `openExtensionPopup()` for implementation.

**Multi-Monitor Support**:

- Uses `senderWindowId` from the message sender's tab to identify the correct window
- Falls back to `chrome.windows.getLastFocused()` if sender window not available
- Allows negative `left` coordinates for monitors positioned left of primary
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

### Content Script → Background (chrome.runtime)

| Type                    | Description                                                                                                      |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `sendTransaction`       | Submit transaction. Fire-and-forget (no callback). Includes `txId` generated by content script. Result via storage (`txResult:{txId}`)  |
| `signatureRequest`      | Submit signature request. Fire-and-forget (no callback). Includes `sigId` generated by content script. Result via storage (`sigResult:{sigId}`) |
| `rpcRequest`            | Proxy RPC call (extension-configured URL only, 15s timeout)                                                       |
| `addEthereumChain`      | Queue a user-confirmed `wallet_addEthereumChain` request                                                          |
| `watchAsset`            | Queue a user-confirmed `wallet_watchAsset` request                                                                |
| `walletGetCapabilities` | ERC-5792 capability response path                                                                                 |
| `walletSendCalls`       | Queue ERC-5792 batch request. Includes `bundleId` generated by content script. Ack/result via storage keys.       |
| `walletGetCallsStatus`  | ERC-5792 bundle status response path                                                                              |
| `walletShowCallsStatus` | Opens/raises WalletChan status UI for an existing bundle                                                          |

### Popup → Background (chrome.runtime)

Popup/sidepanel/onboarding-only handlers are guarded centrally by
`EXTENSION_ONLY_MESSAGES` in `background.ts`. New UI handlers that read wallet
state, account/session status, pending requests, transaction history, chat
history, clear-signing preferences/cache, or mutate extension-only state must be
added to that set. Dapp-facing content-script handlers should stay limited to
the content-script list above; `getActiveAccount` remains reachable to the
content script only for provider initialization address correction.

| Type                               | Description                                                                                     |
| ---------------------------------- | ----------------------------------------------------------------------------------------------- |
| `getPendingTxRequests`             | Get all pending tx requests                                                                     |
| `getPendingTransaction`            | Get specific tx details                                                                         |
| `isApiKeyCached`                   | Check if password needed                                                                        |
| `unlockWallet`                     | Unlock wallet with password                                                                     |
| `lockWallet`                       | Lock wallet (clear cached credentials)                                                          |
| `resetExtension`                   | Reset wallet identity state using `walletResetStorage.ts`; clears secrets, accounts, pending requests, WalletConnect routing, cross-dapp batches, tx history, wallet portfolio state, transient result keys, and session auth state |
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
| `changePasswordWithCachedPassword` | Change password using cached password                                                           |
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
| `txHistoryUpdated`           | Notifies views that transaction history changed. `updateTxInHistory()` includes `updatedTx` and `changedKeys`; add/history-clear broadcasts may omit `changedKeys`. |
| `newPendingTxRequest`        | Notifies views of new pending transaction       |
| `newPendingSignatureRequest` | Notifies views of new pending signature request |
| `accountsUpdated`            | Notifies views that accounts list changed       |
| `walletLockedExternal`       | Force-lock signal (password rotation, agent removal, manual lock) — all surfaces route to unlock screen |
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

Legacy fallbacks are retained:

- **UA string**: `navigator.userAgent.includes("Arc/")` (older Arc versions)
- **CSS variable**: `--arc-palette-title` check in `App.tsx` / onboarding (sets `isArcBrowser` storage flag)

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
│    2. Check isNonChromeBrowser() via userAgentData.brands                   │
│       - If non-Chrome → force sidePanelMode=false, set popup, return       │
│    3. Check storage for isArcBrowser, sidePanelMode, sidePanelVerified      │
│    4. If Arc stored OR sidePanelVerified=false → set popup, return          │
│    5. If sidePanelMode=true AND sidePanelVerified=true AND supported:       │
│       - setPopup('') → action.onClicked will handle sidepanel opening      │
│    6. Otherwise → setPopup('popup-init.html') (safe default)               │
│                                                                             │
│  Icon Click (action.onClicked listener, fires when popup=''):               │
│    1. Call sidePanel.open({ windowId })                                     │
│    2. Wait 600ms, verify via getContexts({ contextTypes: ['SIDE_PANEL'] }) │
│    3. If context exists → sidepanel is open, done                           │
│    4. If no context or open() threw → self-heal:                            │
│       - setSidePanelMode(false) → restores popup                            │
│       - openPopupWindow() → immediate fallback                              │
│                                                                             │
│  Transaction Request (openExtensionPopup):                                  │
│    1. If sidepanel mode → try sidePanel.open() with same verification      │
│    2. If fails → self-heal and fall through to popup window                 │
│    3. If popup mode → open/focus popup window directly                      │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Configuration

| Setting     | Storage Key         | Default                                 | Description                                       |
| ----------- | ------------------- | --------------------------------------- | ------------------------------------------------- |
| Mode        | `sidePanelMode`     | `true` (after onboarding, if supported) | Whether to use sidepanel or popup                 |
| Verified    | `sidePanelVerified` | Set on first successful enable          | Whether sidepanel has been tested and works       |
| Arc Browser | `isArcBrowser`      | Detected via CSS variable (legacy)      | Whether running in Arc browser (legacy detection) |

### UI Toggle

A sidepanel toggle button is available on both the **unlock screen** (top-right corner) and **main view header** (only visible when sidepanel is supported, i.e., genuine Chrome).

When toggling from popup to sidepanel mode:

- The setting is persisted in `chrome.storage.sync`
- `chrome.action.setPopup({ popup: '' })` is called so `action.onClicked` fires on icon click
- A toast notification instructs user to close popup and click extension icon

When toggling from sidepanel to popup mode:

- `chrome.action.setPopup({ popup: 'popup-init.html' })` restores the native popup
- A popup window is opened
- The sidepanel closes automatically

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
│     c. If verification fails → self-heal, fall through to popup window     │
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
| `isSidePanelSupported` | Views → Background | Check if sidepanel is supported and verified    |
| `setSidePanelMode`     | Views → Background | Enable/disable sidepanel mode                   |

### Key Design Decisions

**Chrome-only sidepanel**: Sidepanel is only enabled on genuine Google Chrome (`navigator.userAgentData.brands` includes "Google Chrome"). Non-Chrome Chromium browsers get popup mode automatically on every service worker startup — even if sidepanel was previously enabled, `initSidePanel()` force-disables it.

**Self-healing fallback**: The `action.onClicked` listener and `openExtensionPopup()` both verify sidepanel actually opened after calling `sidePanel.open()`. If verification fails, they auto-disable sidepanel mode and open a popup window. This catches any future browser regressions.

**Never `openPanelOnActionClick`**: This setting is always `false`. Using `chrome.action.setPopup()` to control behavior provides a fallback path — `action.onClicked` fires when popup is empty, allowing try/catch around `sidePanel.open()`.

**Multi-layer detection**: Non-Chrome detection cascades through: (1) `userAgentData.brands` check, (2) legacy `Arc/` UA string, (3) stored `isArcBrowser` flag from CSS variable detection in UI.

### CSS Handling

The extension detects if it's running in a sidepanel context by checking window dimensions:

- Sidepanel: height > 620px (browser provides more vertical space)
- Popup: height ≤ 600px (fixed popup dimensions)

When in sidepanel:

- `body.sidepanel-mode` class is added
- CSS adjusts to use full viewport height (100vh)

## UI Layout

### Popup Dimensions

- Window: 380px width, 540px height (created by background.ts)
- HTML: 360px width, 600px height (fixed for popup)
- Sidepanel: 100vh height (no max-height restriction)
- Font: Inter (UI), JetBrains Mono (code/addresses)

### Transaction/Signature Confirmation Header

The confirmation views use a two-row header layout:

```
┌─────────────────────────────────────────────────────────────┐
│  ←  │               < 1/2 >               │  Reject All │  ← Row 1
├─────────────────────────────────────────────────────────────┤
│                   Transaction Request                       │  ← Row 2
└─────────────────────────────────────────────────────────────┘
```

**Row 1:**

- **Back arrow** (left): Returns to pending list (if multiple) or main view
- **Navigation** (center, absolute): `< 1/2 >` arrows + counter badge
- **Reject All** (right): Rejects all pending requests (only shown when multiple)

**Row 2:**

- **Title** (centered): "Transaction Request" or "Signature Request" (larger font)

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
2. **Account Switcher**: Dropdown to switch between accounts (if multiple)
3. **Wallet Address Section**:
   - "Bankr Wallet Address" label
   - Truncated address with copy button
   - Explorer link icon
4. **Chain Selector**: Dropdown to select network
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

`walletResetStorage.ts` is the source of truth for reset-owned keys and
prefixes. It clears secrets/accounts (`encrypted*`, `pkVault`, `mnemonicVault`,
`accounts`, `seedGroups`), pending request queues (`pendingTxRequests`,
`pendingSignatureRequests`, `pendingBatchTxRequests`,
`pendingWatchAssetRequests`, `pendingAddChainRequests`), WalletConnect routing
state (`walletConnectPendingRequests`, `walletConnectChainId`), cross-dapp batch
state (`crossDappBatch`, `bundleStatuses`), bridge state (`pendingBridges`),
wallet portfolio state (`portfolioSnapshots`, `hiddenPortfolioTokens`,
`customTokens`, `customDelegates`, `recentlyReceivedTokens`), and transient
result/artifact prefixes (`txResult:`, `sigResult:`, `rpcResult:`,
`addChainResult:`, `watchAssetResult:`, `batchTxResult:`, `batchTxAck:`,
`capabilitiesResult:`, `callsStatusResult:`, `notification-`, `fiProgress:`).
Keep that module in sync with `_docs/STORAGE.md` when adding new wallet-scoped
storage.

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

1. **API Key Protection**: Encrypted with AES-256-GCM, password never stored
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
| Transaction timeout (5 min) | Auto-fail with timeout message   |
| Network error               | Display error, allow retry       |

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
       1. fetchBridgeQuote → walletchan.com/api/bridge/quote
          (server applies sWCHAN-tiered fee; same isPremiumFee surfaced)
       2. route selection → prefer manualRoutes[0]; fallback to autoRoute.txData
          when Bungee returns executable tx data without Permit2 typed-data
       3. handlePrepareBridge → fetchBridgeBuildTx for manual route firm tx data
          OR use autoRoute.txData directly
       4. SwapTxEntry[]: [approve?, bridge] with bridge meta on the last entry
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
| In-flight bridges across SW restarts | `apps/extension/src/chrome/pendingBridgeStorage.ts` (`pendingBridges` chrome.storage.local key) |
| Status polling | `apps/extension/src/chrome/bridgeStatusPoller.ts` (5s → 30s exp. backoff, 15-min cap, terminal codes from `BungeeStatusCode`) |
| Post-source-tx hook | `txReceiptPoller.applyReceiptToHistory` calls `maybeStartBridgePolling(txId)` on success; the Bankr direct-success path in `txHandlers.processSwapTxBankr` does the same |
| Service-worker restart resilience | `background.ts` calls `resumePendingBridgePollers()` on startup |
| Browser notification | `chrome.notifications.create` from `bridgeStatusPoller.fireTerminalNotification`; click target is the **destination** explorer URL (stored under `notification-<id>` so the existing click handler routes to the right tab) |

The bridge poller uses the same in-memory model as `txReceiptPoller` (no `chrome.alarms`). Tradeoff: destination updates only progress while the SW is alive. The resume hook covers SW death — the next popup-open eventually catches the terminal state and fires the notification.
