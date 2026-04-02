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

## Account Types

The extension supports four distinct account types that can be used simultaneously:

| Feature               | Bankr API Account          | Private Key Account                 | Seed Phrase Account                   | Impersonator Account    |
| --------------------- | -------------------------- | ----------------------------------- | ------------------------------------- | ----------------------- |
| Transaction Execution | Via Bankr API              | Local signing + RPC broadcast       | Local signing + RPC broadcast         | ❌ Disabled (view-only) |
| Message Signing       | ✅ Via API (`/agent/sign`) | ✅ Full support                     | ✅ Full support                       | ❌ Disabled (view-only) |
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

3. **On Content Script Init**: The inject.ts script:
   - Reads the initial address from `chrome.storage.sync`
   - Verifies with background that the address matches the active account
   - If mismatched (e.g., stale storage), emits `accountsChanged` with the correct address

4. **On Address Change**: The inject.ts `setAddress` handler now emits `accountsChanged` when the address changes, ensuring dApps are notified of updates from any source.

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
│    - Unlock screen           │    │  - POST /agent/submit        │
│    - Pending tx banner       │    │  - POST /agent/sign          │
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

These are configured in `src/constants/chainRegistry.ts` (the single source of truth for built-in chain data) and pre-populated on first install.

### Runtime Chain Resolution

Built-in chain metadata and user-customized chain state are intentionally split:

- `src/constants/chainRegistry.ts` defines the canonical built-in chains and all derived static maps
- `chrome.storage.sync.networksInfo` stores runtime overrides only: edited RPC URLs, hidden flags, and user-added custom chains
- `src/lib/chains.ts` is the required merge layer for runtime code. It normalizes `networksInfo`, keeps built-in chains keyed by their registry name, and exposes helpers like `getVisibleChains`, `getResolvedChainById`, and `getStoredRpcUrl`

**Important:** Do not read `CHAIN_REGISTRY` and `networksInfo` separately in components/handlers to rebuild chain lists or look up RPC/explorer/native currency data. That is what caused custom-chain support to drift across screens. New runtime chain logic should go through `src/lib/chains.ts`.

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

### Per-Account-Type Chain Restrictions

Not all chains are supported by all account types. The Bankr API only supports the original 4 chains (Base, Ethereum, Polygon, Unichain). Newer chains like MegaETH are available for PK, Seed Phrase, and Impersonator accounts only.

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
│   ├── gasEstimation.ts     # Pre-confirmation gas estimation (RPC fees, CoinGecko USD price)
│   ├── bankrApi.ts          # Bankr API client (submit, sign, job polling)
│   ├── portfolioApi.ts      # Portfolio API client (fetches token holdings via website)
│   ├── onchainBalances.ts   # On-chain balance verification via Multicall3 batching
│   ├── transferUtils.ts     # ERC20/native token transfer calldata builders
│   ├── chatApi.ts           # Chat API client for Bankr agent
│   ├── chatStorage.ts       # Persistent storage for chat conversations
│   ├── pendingTxStorage.ts  # Persistent storage for pending transactions
│   ├── pendingSignatureStorage.ts # Persistent storage for pending signature requests
│   └── txHistoryStorage.ts  # Persistent storage for completed transaction history
├── constants/
│   ├── chainRegistry.ts     # Single source of truth for all chain data
│   ├── networks.ts          # Re-exports network constants from chainRegistry
│   └── chainConfig.ts       # Re-exports chain UI config from chainRegistry
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
│   ├── PendingTxList.tsx    # List of pending transactions and signature requests
│   ├── TxStatusList.tsx     # Recent transaction history display (clickable → TxDetailModal)
│   ├── TxDetailModal.tsx    # Transaction detail modal (gas fees, function name, addresses)
│   ├── GasEstimateDisplay.tsx # Collapsible gas fee display with editable params (PK/Seed)
│   ├── TransactionConfirmation.tsx # In-popup tx confirmation with success animation
│   ├── SignatureRequestConfirmation.tsx # Signature request display (confirm for PK, reject for Bankr)
│   ├── TokenHoldings.tsx    # Portfolio token list with USD values
│   ├── TokenTransfer.tsx    # Token transfer form (recipient, amount, send)
│   ├── SeedPhraseSetup.tsx  # Seed phrase generate/import flow (12-word grid)
│   ├── CalldataDecoder.tsx  # Decoded/Raw tab for transaction calldata (eth.sh API)
│   ├── TypedDataDisplay.tsx # Structured typed data display for EIP-712 signatures
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

- POST to `https://api.bankr.bot/agent/submit` with transaction object and `waitForConfirmation: true`
- Synchronous response — returns tx hash directly (no polling needed)
- Value converted from hex to decimal string (wei)
- Forwards dapp-provided gas params (`gas`, `gasPrice`, `maxFeePerGas`, `maxPriorityFeePerGas`) to the API if present

### 8. Result Returned to Dapp

- Transaction hash returned directly from `/agent/submit` response
- Background writes result to `chrome.storage.local` under key `txResult:{txId}` (via `writeResultToStorage`)
- Content script's `chrome.storage.onChanged` listener picks up the result and forwards it to the inpage provider
- Dapp receives the tx hash from `eth_sendTransaction`
- Content script removes the `txResult:{txId}` key after reading

### Gas Estimation

`src/chrome/gasEstimation.ts` + `src/components/GasEstimateDisplay.tsx`:

Pre-confirmation gas estimation shown on the transaction confirmation screen. Fetches gas limit, EIP-1559 fees, sender balance, and native token USD price.

**Background estimation (`gasEstimation.ts`):**

- Uses viem `createPublicClient` with cached clients (keyed by chainId), reuses `getRpcUrl()` from `txHandlers.ts`
- Parallel RPC calls: `estimateGas` (gas limit + 20% buffer), `estimateFeesPerGas` (EIP-1559 fees), `getBalance` (sender balance)
- CoinGecko price fetch with 60s in-memory cache for USD display
- Background CoinGecko service with shared storage-backed cache for native asset prices/logos
- If dapp provided gas params (`gas`, `maxFeePerGas`, `maxPriorityFeePerGas`, `gasPrice`), uses them as defaults instead of RPC estimates
- Returns `GasEstimate` with `dappProvidedGas` flag

**UI component (`GasEstimateDisplay.tsx`):**

- Collapsible box showing estimated gas fee in ETH + USD (collapsed) with detailed breakdown (expanded)
- **PK/Seed accounts**: Gas Limit, Max Priority Fee, Max Fee are editable inputs. Overrides sent back via `onGasOverrides` callback
- **Bankr accounts**: All read-only with "Gas managed by Bankr API" note
- **Impersonator accounts**: All read-only
- When dapp provided gas params, shows "Gas params suggested by dapp" indicator

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
| Bankr API    | ✅ Via `/agent/sign` API                 |
| Private Key  | ✅ Full support (sign locally with viem) |
| Seed Phrase  | ✅ Full support (sign locally with viem) |
| Impersonator | ❌ Disabled (view-only)                  |

When dapps request signatures, the extension displays the request details. For Bankr accounts, signing is handled via the `/agent/sign` API endpoint. For Private Key and Seed Phrase accounts, signing is done locally with viem. Impersonator accounts can only reject.

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
│     │    - Sign: Calls POST /agent/sign with message/typedData         │    │
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
- Raw data with copy button

**For Bankr API Accounts:**

- Sign button (yellow): Signs via `/agent/sign` API
- Reject button (white/secondary): Cancels the request

**For Private Key / Seed Phrase Accounts:**

- Sign button (yellow): Signs the message locally
- Reject button (white/secondary): Cancels the request

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

## Browser Notifications

The extension uses Chrome's Notifications API to alert users when transactions complete while the popup/sidepanel is closed.

### Notification Types

| Event                 | Title                   | Message                                          |
| --------------------- | ----------------------- | ------------------------------------------------ |
| Transaction Confirmed | "Transaction Confirmed" | "Your transaction on {chainName} was successful" |
| Transaction Failed    | "Transaction Failed"    | "Error: {errorMessage}"                          |

**See**: `src/chrome/txHandlers.ts` → `showNotification()` for implementation.

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

## Token Holdings & Transfers

### Portfolio API

Token holdings are fetched via a website API route that wraps the Octav API:

- **Website route**: `apps/website/app/api/portfolio/route.ts` (GET `/api/portfolio?address=0x...`)
- **Extension client**: `portfolioApi.ts` fetches from `https://walletchan.com/api/portfolio`
- **Response format**: Provider-agnostic `PortfolioResponse` with `tokens[]` and `totalValueUsd`

### On-Chain Balance Verification

API portfolio data is shown immediately, while on-chain balances are verified in the background via `onchainBalances.ts`:

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
- Native token placeholders for visible custom chains
- CoinGecko USD price fallback for custom-chain native tokens when the portfolio API has no price (for example `MON` on Monad)
- The CoinGecko fallback runs through the background `coingeckoService.ts`, which batches lookups and persists market/search caches in `chrome.storage.local` so reopening the popup doesn't cold-start CoinGecko traffic each time

This prevents the send/swap/holdings views from drifting when custom tokens or custom chains are added.

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
- Total portfolio value header with hide/show toggle (persisted in `chrome.storage.sync.hidePortfolioValue`)
- 60-second client-side cache
- Refresh button, loading skeletons, empty state
- Click token → opens TokenTransfer view

### Portfolio Snapshot Storage

`portfolioSnapshotStorage.ts` silently records `totalValueUsd` snapshots per address over time in `chrome.storage.local` under the key `portfolioSnapshots`.

**How it works:**

- `recordSnapshot(address, totalValueUsd)` is called fire-and-forget from `TokenHoldings.tsx` after each portfolio load (preferring on-chain enhanced value, falling back to API-only)
- Snapshots are deduplicated: skipped if the last snapshot for the address is <1 hour old
- Entries older than 8 days are pruned on each write
- Addresses are normalized to lowercase

**Storage shape:**

```typescript
// chrome.storage.local key: "portfolioSnapshots"
{ [address: string]: { timestamp: number; totalValueUsd: number }[] }
```

**Exports:**

- `recordSnapshot(address, totalValueUsd)` — append snapshot (with dedup + prune)
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
4. On submit, `buildTransferTx()` creates calldata:
   - **Native**: `{ to, value: parseEther(amount), data: "0x" }`
   - **ERC20**: `{ to: contractAddress, data: encodeFunctionData("transfer", [to, amount]), value: "0x0" }`
5. Sends `initiateTransfer` message to background
6. Background creates a `PendingTxRequest` with origin "WalletChan"
7. Normal TransactionConfirmation flow takes over

### Calldata Decoder

Transaction calldata is decoded using the eth.sh API:

- **API**: POST `https://eth.sh/api/calldata/decoder-recursive` with `{ calldata, address, chainId }`
- **Component**: `CalldataDecoder.tsx` with Decoded/Raw tab toggle
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

**Solution**: Proxy all RPC calls through the background worker.

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

The background worker is not subject to page CSP, so it can call any RPC endpoint. Security: the handler validates URL protocol (HTTP/HTTPS only, preventing SSRF via `file://` etc.) and enforces a 15-second timeout to prevent resource exhaustion.

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
│  4. Impersonator receives response:                                         │
│     - Success: Updates provider chainId, emits chainChanged event           │
│     - Error: Rejects promise with error (dapp can catch and handle)         │
│  5. Popup/sidepanel storage listener detects chainName change               │
│  6. Network dropdown updates to reflect new chain                           │
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
| `changePasswordWithCachedPassword` | Change wallet password while unlocked    |
| `addBankrAccount`                  | Add new Bankr account with API key       |
| `addPrivateKeyAccount`             | Add new private key account              |
| `addSeedPhraseGroup`               | Generate/import seed phrase              |
| `deriveSeedAccount`                | Derive new account from seed phrase      |
| `revealPrivateKey`                 | Reveal private key (security-sensitive)  |
| `revealSeedPhrase`                 | Reveal seed phrase (security-sensitive)  |
| `setAgentPassword`                 | Set agent password (in authHandlers.ts)  |
| `cancelTransaction`                | Cancel in-progress transaction           |

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
6. **Agent password remains valid** - `encryptedVaultKeyAgent` is unchanged

**Why atomic**: If any re-encryption step fails (OOM, crypto error), no storage writes happen. Without atomicity, the vault key could be updated to the new password while legacy entries remain encrypted with the old password, making data inaccessible.

**Note (v1.3.0+)**: After migration, `pkVault` and `mnemonicVault` entries are encrypted with the vault key (indicated by `salt: ""`), NOT with the user's password. Only legacy entries (pre-migration) need re-encryption during password change.

**Legacy System** (pre-vault key migration):

1. Decrypt API key with old password
2. Re-encrypt API key with new password
3. Re-encrypt private key vault with new password

### Pending Transaction Storage

Transactions are stored persistently in `chrome.storage.local`:

- Closing popup does NOT reject/cancel pending transactions
- Pending requests survive popup close, browser restart
- Extension badge shows count of pending requests
- Transactions auto-expire after 30 minutes (periodic cleanup + enforced at confirmation time)
- Confirmation handlers reject expired requests even if periodic cleanup hasn't run
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

**Bankr API accounts** cannot be cancelled — `/agent/submit` is synchronous (tx is already broadcast on-chain by the time the response returns). The cancel button is hidden in the UI for Bankr account transactions.

## Response Handling

The `/agent/submit` API returns a structured response:

- `status: "success"` — transaction confirmed on-chain, `transactionHash` contains the hash
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
  "permissions": ["activeTab", "storage", "sidePanel", "notifications", "tabs"]
}
```

### Permissions

| Permission      | Purpose                                                |
| --------------- | ------------------------------------------------------ |
| `activeTab`     | Access to the currently active tab                     |
| `storage`       | Store encrypted API key, settings, transaction history |
| `sidePanel`     | Enable sidepanel mode (Chrome 114+)                    |
| `notifications` | Show transaction success/failure notifications         |
| `tabs`          | Query and close extension tabs (e.g., onboarding page) |

## Message Types

### Inpage → Content Script (postMessage)

| Type                    | Description          |
| ----------------------- | -------------------- |
| `i_sendTransaction`     | Transaction request  |
| `i_signatureRequest`    | Signature request    |
| `i_rpcRequest`          | RPC call request     |
| `i_switchEthereumChain` | Chain switch request |

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

| Type               | Description                                                                                                      |
| ------------------ | ---------------------------------------------------------------------------------------------------------------- |
| `sendTransaction`  | Submit transaction. Fire-and-forget (no callback). Includes `txId` generated by content script. Result via storage (`txResult:{txId}`)  |
| `signatureRequest` | Submit signature request. Fire-and-forget (no callback). Includes `sigId` generated by content script. Result via storage (`sigResult:{sigId}`) |
| `rpcRequest`       | Proxy RPC call (protocol-validated, 15s timeout)                                                                 |

### Popup → Background (chrome.runtime)

| Type                               | Description                                                                                     |
| ---------------------------------- | ----------------------------------------------------------------------------------------------- |
| `getPendingTxRequests`             | Get all pending tx requests                                                                     |
| `getPendingTransaction`            | Get specific tx details                                                                         |
| `isApiKeyCached`                   | Check if password needed                                                                        |
| `unlockWallet`                     | Unlock wallet with password                                                                     |
| `lockWallet`                       | Lock wallet (clear cached credentials)                                                          |
| `confirmTransaction`               | User approved tx (sync, waits)                                                                  |
| `confirmTransactionAsync`          | User approved tx (async, Bankr API). Optional `functionName` field                              |
| `confirmTransactionAsyncPK`        | User approved tx (async, PK/seed local sign). Optional `functionName` and `gasOverrides` fields |
| `estimateGas`                      | Estimate gas for pending tx (returns `GasEstimate` with fees, balance, USD price)               |
| `rejectTransaction`                | User rejected tx                                                                                |
| `getPendingSignatureRequests`      | Get all pending signature requests                                                              |
| `rejectSignatureRequest`           | User rejected signature request                                                                 |
| `cancelTransaction`                | User cancelled in-progress tx                                                                   |
| `clearApiKeyCache`                 | Clear cached API key                                                                            |
| `getCachedPassword`                | Check if password is cached                                                                     |
| `getCachedApiKey`                  | Get decrypted API key (if cached). **Sender-verified**: extension pages only                    |
| `saveApiKeyWithCachedPassword`     | Save new API key using cached password                                                          |
| `changePasswordWithCachedPassword` | Change password using cached password                                                           |
| `isSidePanelSupported`             | Check if browser supports sidepanel                                                             |
| `getSidePanelMode`                 | Get current sidepanel mode setting                                                              |
| `setSidePanelMode`                 | Set sidepanel mode (true/false)                                                                 |
| `setArcBrowser`                    | Mark browser as Arc (disables sidepanel)                                                        |
| `getAutoLockTimeout`               | Get current auto-lock timeout (ms)                                                              |
| `setAutoLockTimeout`               | Set auto-lock timeout (ms)                                                                      |
| `getTxHistory`                     | Get completed transaction history                                                               |
| `clearTxHistory`                   | Clear all transaction history                                                                   |
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
| `addSeedPhraseGroup`               | Generate/import mnemonic, create seed group, derive first account (handles PK collision)        |
| `deriveSeedAccount`                | Derive next account from existing seed group (handles PK collision)                             |
| `revealSeedPhrase`                 | Reveal mnemonic (requires master password verification). **Sender-verified**                    |
| `getSeedGroups`                    | Get all seed group metadata                                                                     |
| `renameSeedGroup`                  | Rename a seed group (broadcasts accountsUpdated)                                                |
| `initiateTransfer`                 | Create pending tx for extension-initiated token transfer                                        |

### Background → Views (chrome.runtime broadcast)

| Type                         | Description                                     |
| ---------------------------- | ----------------------------------------------- |
| `txHistoryUpdated`           | Notifies views that transaction history changed |
| `newPendingTxRequest`        | Notifies views of new pending transaction       |
| `newPendingSignatureRequest` | Notifies views of new pending signature request |
| `accountsUpdated`            | Notifies views that accounts list changed       |
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
| API error                   | Display error message            |
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
