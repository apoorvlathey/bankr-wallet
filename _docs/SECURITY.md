# WalletChan Security Guide

This document is the security reference for the WalletChan Chrome extension. It defines the threat model, lists every security-sensitive code path, and provides checklists for verifying that changes do not introduce vulnerabilities.

**When to read this**: Before every commit that touches extension code. Claude (or any reviewer) should verify changes against the relevant checklists below.

---

## Threat Model

### What We Protect

| Secret          | Storage                                                                                          | In-Memory Cache                                    |
| --------------- | ------------------------------------------------------------------------------------------------ | -------------------------------------------------- |
| Master password | Never stored (except encrypted session restore for "Never" auto-lock)                            | `cachedPassword` in `sessionCache.ts`              |
| Agent password  | Never stored directly (encrypts vault key)                                                       | Not cached separately (same `cachedPassword` slot) |
| Password type   | `chrome.storage.session` (for session restoration)                                               | `cachedPasswordType` in `sessionCache.ts`          |
| Bankr API key   | `encryptedApiKeyVault` (AES-256-GCM via vault key) or `encryptedApiKey` (legacy, password-based) | `cachedApiKey` in `sessionCache.ts`                |
| Private keys    | `pkVault` entries (AES-256-GCM via vault key or password, indicated by `salt` field)             | `cachedVault` array in `sessionCache.ts`           |
| Seed phrases    | `mnemonicVault` entries (AES-256-GCM via vault key or password)                                  | Not cached (retrieved on-demand for signing)       |
| Vault key       | `encryptedVaultKeyMaster` / `encryptedVaultKeyAgent` (PBKDF2-wrapped)                            | `cachedVaultKey` as CryptoKey in `sessionCache.ts` |

### Trust Boundaries

```
UNTRUSTED                          TRUSTED (extension context)
-----------                        ---------------------------
Webpage JS (dapp)                  Background service worker
  |                                  - sessionCache.ts (credentials)
  v                                  - authHandlers.ts (unlock/password)
inpage.js (runs in page context)     - txHandlers.ts (signing)
  |                                  - crypto.ts / vaultCrypto.ts
  v
inject.ts (content script bridge)  Extension UI (popup/sidepanel)
  |                                  - Same origin as background
  v                                  - Communicates via chrome.runtime
background.ts (message router)
```

**Key principle**: The webpage and content script are untrusted. All validation and secret handling happens in the background service worker. Private keys never leave the service worker. The UI layer receives only what it needs to display.

---

## Encryption Specifications

| Parameter      | Value                                                   |
| -------------- | ------------------------------------------------------- |
| Algorithm      | AES-256-GCM (authenticated encryption)                  |
| Key derivation | PBKDF2-SHA256                                           |
| Iterations     | 600,000                                                 |
| Salt           | 16 bytes (random per encryption)                        |
| IV             | 12 bytes (random per encryption)                        |
| Vault key      | 256-bit random (generated once, encrypted per-password) |

**Files**: `cryptoUtils.ts` (shared constants), `crypto.ts` (API key + vault key ops), `vaultCrypto.ts` (private key vault)

---

## Vault Key System Architecture

WalletChan uses a **two-tier encryption** system (vault key wrapping) to enable multiple passwords to decrypt the same data without key duplication:

```
Master Password → PBKDF2 (600k) → Decrypt encryptedVaultKeyMaster → Vault Key (256-bit)
Agent Password  → PBKDF2 (600k) → Decrypt encryptedVaultKeyAgent  → Same Vault Key
                                         ↓
                          Vault Key → AES-256-GCM → Decrypt:
                                    - encryptedApiKeyVault
                                    - pkVault entries (salt === "")
                                    - mnemonicVault entries (salt === "")
```

### Storage Format Detection

**Vault-key encrypted** (current, v1.3.0+):

- `salt === ""` in keystore object
- Encrypted directly with vault key (no PBKDF2 derivation)
- Both master and agent passwords can decrypt (via vault key)

**Password encrypted** (legacy, pre-v1.3.0):

- `salt !== ""` (16-byte base64 salt)
- Encrypted with PBKDF2-derived key from password
- Only the specific password that encrypted it can decrypt
- Supported for backward compatibility during migration

### Migration Strategy

**Automatic migration** on first unlock after v1.3.0 upgrade:

1. User unlocks with master password → triggers `migrateToVaultKeySystem()`
2. Generate 256-bit random vault key
3. Encrypt vault key with master password → save to `encryptedVaultKeyMaster`
4. Re-encrypt API key with vault key → save to `encryptedApiKeyVault`
5. Re-encrypt all private keys with vault key → update `pkVault` entries (`salt: ""`)
6. Re-encrypt all seed phrases with vault key → update `mnemonicVault` entries (`salt: ""`)

**Partial migration detection**: If vault key system exists (`encryptedVaultKeyMaster` present) but private keys are still password-encrypted (`salt !== ""`), migration is completed on next master password unlock via `migratePrivateKeysToVaultKey()`.

### Password Type Persistence (v1.3.0+)

To maintain agent password access control guards across service worker restarts:

**Storage**: `chrome.storage.session.passwordType` (stored alongside session password)

**Restoration**: When `tryRestoreSession()` succeeds, `passwordType` is restored to `cachedPasswordType`, ensuring operations remain blocked for agent password sessions even after restart.

**Critical**: Without password type persistence, agent password users could temporarily bypass guards (reveal private keys, change settings) after service worker restart until manual lock/unlock. This is now mitigated in v1.3.0+.

---

## Agent Password Access Control

The agent password model restricts what operations are available when the wallet is unlocked with the agent (secondary) password vs. the master password.

### Access Matrix

| Operation                        | Master | Agent       | Guard Location                                                                 |
| -------------------------------- | ------ | ----------- | ------------------------------------------------------------------------------ |
| Unlock wallet                    | Yes    | Yes         | `authHandlers.ts` - `unlockWithVaultKeySystem()`                               |
| Sign/send transactions           | Yes    | Yes         | `txHandlers.ts`                                                                |
| Sign messages                    | Yes    | Yes         | `txHandlers.ts`                                                                |
| Add/remove/confirm cross-dapp batch | Yes | Yes         | `crossDappBatchHandlers.ts` (no extra gating — same as single tx submission)   |
| Reveal private key               | Yes    | **BLOCKED** | `background.ts` - `revealPrivateKey` case                                      |
| Change API key                   | Yes    | **BLOCKED** | `authHandlers.ts` - `handleSaveApiKeyWithCachedPassword()`                     |
| Change master password           | Yes    | **BLOCKED** | `authHandlers.ts` - `handleChangePasswordWithCachedPassword()`                 |
| Add Bankr account (with API key) | Yes    | **BLOCKED** | `background.ts` - `addBankrAccount` case                                       |
| Add private key account          | Yes    | **BLOCKED** | `background.ts` - `addPrivateKeyAccount` case                                  |
| Add impersonator account         | Yes    | **BLOCKED** | `background.ts` - `addImpersonatorAccount` case                                |
| Add seed phrase group            | Yes    | **BLOCKED** | `background.ts` - `addSeedPhraseGroup` case                                    |
| Derive seed account              | Yes    | **BLOCKED** | `background.ts` - `deriveSeedAccount` case                                     |
| Reveal seed phrase               | Yes    | **BLOCKED** | `background.ts` - `revealSeedPhrase` case                                      |
| Remove account                   | Yes    | **BLOCKED** | `background.ts` - `removeAccount` case                                         |
| Initiate token transfer          | Yes    | Yes         | `txHandlers.ts` - creates PendingTxRequest                                     |
| Reset extension                  | Yes    | **BLOCKED** | `background.ts` - `resetExtension` case                                        |
| Set/remove agent password        | Yes    | **BLOCKED** | `authHandlers.ts` - `handleSetAgentPassword()` / `handleRemoveAgentPassword()` |

### How Guards Work

Every blocked operation checks `getPasswordType() === "agent"` from `sessionCache.ts` and returns an error before executing any logic. These guards are **backend-enforced** (defense-in-depth), independent of UI-level hiding/disabling.

**Pattern**:

```typescript
// At the TOP of the handler, before any logic
if (getPasswordType() === "agent") {
  return { success: false, error: "This operation requires master password" };
}
```

---

## Security-Sensitive Message Handlers

These are the message handlers in `background.ts` that touch secrets, modify accounts, or have destructive effects. Each must be audited when changed.

### Secret-Exposing Handlers

| Handler             | What It Exposes                                               | Guard                                                  |
| ------------------- | ------------------------------------------------------------- | ------------------------------------------------------ |
| `getCachedApiKey`   | Returns plaintext API key to caller                           | Extension page sender, master session, auto-lock timeout checked |
| `revealPrivateKey`  | Returns plaintext private key                                 | Requires password verification + blocks agent password |
| `getCachedPassword` | Returns `hasCachedPassword` boolean (not the password itself) | `EXTENSION_ONLY_MESSAGES`                              |

### Secret-Modifying Handlers

| Handler                            | What It Modifies                                                                                                             | Guard                                      |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| `saveApiKeyWithCachedPassword`     | Overwrites encrypted API key                                                                                                 | Agent password blocked                     |
| `saveBankrApiKeyAndAddress`        | Overwrites encrypted API key and updates the Bankr account address in `accounts[]` after duplicate-address validation        | Agent password blocked via API-key save    |
| `changePasswordWithCachedPassword` | Atomically re-encrypts vault key, pkVault entries, and mnemonicVault entries with new master password (single storage write) | Agent password blocked                     |
| `addBankrAccount`                  | Can overwrite encrypted API key (when `message.apiKey` provided)                                                             | Agent password blocked when apiKey present |
| `addPrivateKeyAccount`             | Adds new entry to encrypted private key vault                                                                                | Agent password blocked                     |

### Account-Modifying Handlers

| Handler                    | Effect                                           | Guard                              |
| -------------------------- | ------------------------------------------------ | ---------------------------------- |
| `removeAccount`            | Deletes account reference                        | Agent password blocked             |
| `setActiveAccount`         | Changes active account + updates storage address | `EXTENSION_ONLY_MESSAGES`          |
| `setTabAccount`            | Changes per-tab selected account                 | `EXTENSION_ONLY_MESSAGES`          |
| `updateAccountDisplayName` | Changes display name                             | `EXTENSION_ONLY_MESSAGES`          |

### Destructive Handlers

| Handler          | Effect                      | Guard                                         |
| ---------------- | --------------------------- | --------------------------------------------- |
| `resetExtension` | Wipes ALL extension data    | Agent password blocked                        |
| `lockWallet`     | Clears all in-memory caches | None needed (user-initiated, non-destructive) |
| `clearTxHistory` | Deletes transaction history | `EXTENSION_ONLY_MESSAGES`                     |

### Extension-Only UI Reads and Actions

`background.ts` has a central `EXTENSION_ONLY_MESSAGES` gate. Any message that
is owned by popup/sidepanel/onboarding UI and reads wallet state, account
metadata, chat history, pending-request details, transaction history/status,
session/auth status, clear-signing preferences/cache, or mutates extension-only
state must be added to this set. Current examples include:

| Handler Class | Examples | Why Extension-Only |
| --- | --- | --- |
| Account/session reads | `getAccounts`, `getTabAccount`, `getSeedGroups`, `isWalletUnlocked`, `isApiKeyCached`, `tryRestoreSession`, `getPasswordType`, `getAutoLockTimeout` | Avoid exposing wallet/account/session state to content scripts. |
| Transaction/history UI | `getTxHistory`, `getProcessingTxs`, `getFailedTxResult`, `checkPendingTxReceipt`, `cancelProcessingTx`, `splitBatchIntoIndividualTxs`, gas/simulation helpers | Avoid letting content scripts inspect or alter local pending/history/status state. |
| Chat | `submitChatPrompt`, `getChatConversations`, `getChatConversation`, `createChatConversation`, `deleteChatConversation`, `addChatMessage`, `updateChatMessage` | Chat prompt submission uses the user's Bankr credentials/session and chat history is local user data. |
| Settings/cache | `setArcBrowser`, `getSidePanelMode`, `setSidePanelMode`, `getClearSigningEnabled`, `setClearSigningEnabled`, `INVALIDATE_CLEAR_SIGNING_CACHE` | These are extension UI preferences/cache controls, not dapp APIs. |

`getActiveAccount` is the narrow exception: `inject.ts` uses it during content
script initialization to correct stale synced address state before emitting
`accountsChanged`. Webpages cannot call it directly because `inject.ts` does
not forward an inpage message for it.

### Transaction History Enrichment Handlers

| Handler | Effect | Guard |
| --- | --- | --- |
| `backfillAssetChanges` | Extension UI asks the service worker to re-fetch a confirmed tx receipt and populate missing `assetChanges` on an existing history entry. Does not expose secrets or create transactions. | `EXTENSION_ONLY_MESSAGES` |

### Authentication Handlers

| Handler               | Notes                                                                    |
| --------------------- | ------------------------------------------------------------------------ |
| `unlockWallet`        | Tries master password first, then agent. Sets `passwordType` accordingly |
| `setAgentPassword`    | Requires `getPasswordType() === "master"`                                |
| `removeAgentPassword` | Requires explicit master password verification (not just cached)         |

### Pending Transaction Edit Handlers

`updatePendingTxRequestData` mutates a pending single transaction's calldata
before the user signs, for example when the confirmation UI edits an ERC-20
approve amount. It must stay gated by `EXTENSION_ONLY_MESSAGES` so a webpage
cannot silently alter a pending tx between display and signing.

### Dapp-Initiated Batch Handlers (`batchTxHandlers.ts`)

These mutate `pendingBatchTxRequests` (dapp `wallet_sendCalls`) before the user signs. All gated by `EXTENSION_ONLY_MESSAGES`:

| Handler                        | Effect                                                                                                                                                 |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `removeCallFromPendingBatch`   | Drops a single call from the pending bundle's `params.calls`. If the last call is removed, falls through to a full reject (writes `batchTxResult` + sets `bundleStatuses` to OFFCHAIN_FAILURE). The user is the only party who can prune calls — a dapp must not be able to silently shrink its own (or another dapp's) bundle. |
| `updateCallInPendingBatch`     | Replaces one call's `data` field in the pending bundle (e.g. user edits an ERC-20 approve amount on a built-in CallCard). Validates hex format only — the user is responsible for the resulting calldata being semantically valid; the downstream confirmation re-simulates and re-estimates from the new bytes. Must stay extension-only so a content script cannot silently mutate another bundle's calls (e.g. swap a benign approve amount for `MAX_UINT256`) between display and signing. |

### Cross-Dapp Batch Handlers (`crossDappBatchHandlers.ts`)

These move pending tx requests in/out of a user-assembled batch and ship the batch via Bankr API or PK/SP EIP-7702 local signing. All are gated by `EXTENSION_ONLY_MESSAGES` in `background.ts` so a malicious dapp cannot reach into the user's pending tx queue:

| Handler                       | Effect                                                                                           |
| ----------------------------- | ------------------------------------------------------------------------------------------------ |
| `addToCrossDappBatch`         | Removes a `pendingTxRequest` and appends it to `crossDappBatch`. Dapp promise stays open.        |
| `addCallsToCrossDappBatch`    | Removes a `pendingBatchTxRequest` (dapp `wallet_sendCalls`), appends every call as a sibling entry sharing one `bundleId`. The dapp's `bundleStatuses` entry stays at PENDING. |
| `removeFromCrossDappBatch`    | For `eth_sendTransaction` entries: writes rejection to `txResult:{txId}`. For `wallet_sendCalls` entries: removes ALL siblings from the same bundle and updates `bundleStatuses` to OFFCHAIN_FAILURE once. Clears the batch if empty. |
| `updateCallInCrossDappBatch`  | Replaces one entry's `tx.data` in the cross-dapp batch (e.g. user edits an ERC-20 approve amount on a built-in CallCard). Validates hex only; the originating dapp's promise stays open until the batch ships, so the dapp never sees the edited bytes until on-chain confirmation. Must stay extension-only for the same reason as the dapp-initiated variant. |
| `rejectCrossDappBatch`        | Writes rejection to every entry — `txResult:{txId}` for plain entries, deduped `bundleStatuses` updates for bundle entries. Clears the batch. |
| `confirmCrossDappBatch`       | Encodes via ERC-7821, ships via Bankr API or EIP-7702 local signing. PK/SP EIP-7702 keeps native value in the inner calls but signs the outer EOA self-call with `value: 0x0`; Bankr keeps the summed outer value. Plain `eth_sendTransaction` entries receive the shared tx hash immediately; `wallet_sendCalls` bundle entries stay PENDING until the shared receipt is terminal, then transition to CONFIRMED/REVERTED once per bundle. Accepts UI-provided gas estimates and must stay extension-only so a content script cannot choose gas or fake source-bundle completion. |

`addToCrossDappBatch`, `addCallsToCrossDappBatch`, and `confirmCrossDappBatch` must resolve the original pinned account (`accountId` / `accountAddress` / `accountType`) directly. Never bind a pending request to the current active account, especially when `wallet_sendCalls.params.from` is omitted or the user switches accounts while the request is open.

**Why these MUST stay extension-only**: a content script that could call any of these would be able to (a) silently move a user's pending requests into a batch they cannot easily inspect, (b) reject other dapps' pending requests by spelling out the right `txId`s or `bundleId`s, or (c) flip a victim dapp's bundle status to CONFIRMED without an actual onchain transaction, tricking the dapp into believing a payment landed. The `txId`s and `bundleId`s are not secret, but the right to act on them belongs to the popup only.

`handleConfirmCrossDappBatch` follows the **session restoration pattern** for `getCachedApiKey()` (see "Handlers with Session Restoration" in `_docs/IMPLEMENTATION.md`), so it works under the "Never" auto-lock setting after a service worker restart.

### WalletConnect Handlers

WalletConnect lets dapps that do not discover WalletChan through ERC-6963 send requests through the WalletConnect relay instead of the injected provider. The relay itself is untrusted: every tx/signature request still becomes a normal pending request and must pass the same pinned-account confirmation flow as injected dapp requests.

| Handler | Effect | Guard |
| --- | --- | --- |
| `walletConnectGetSessions` | Extension UI reads active WalletConnect session summaries. No secrets; includes dapp metadata, approved chains, and approved accounts. | `EXTENSION_ONLY_MESSAGES` |
| `walletConnectPair` | Extension UI pairs with a `wc:` URI. The service worker auto-approves only for the current active signing account and visible chains. | `EXTENSION_ONLY_MESSAGES` |
| `walletConnectDisconnectSession` | Extension UI disconnects an active WalletConnect session by topic. | `EXTENSION_ONLY_MESSAGES` |
| `walletConnectSwitchChain` | Extension UI updates the shared WalletConnect active chain and emits `chainChanged` to active WC sessions that support that chain. | `EXTENSION_ONLY_MESSAGES` |

WalletConnect event handlers live in `walletConnectHandlers.ts`, `walletConnectRequestHandlers.ts`, `walletConnectBatchRequestHandlers.ts`, and `walletConnectRpcRequestHandlers.ts`, not in `background.ts`. Session proposals are approved only when a non-impersonator account is active. Approved accounts are derived from the active account at pairing time and the visible chain set for that account type; Bankr accounts only expose Bankr-supported chains.

Chainless `eip155` proposal namespaces are filled with that same visible chain set before approval, because some dapps request EVM methods without listing chains. If normalization still leaves no approvable namespace, the proposal is rejected rather than approved with an empty namespace. The rejection broadcast (`walletConnectProposalRejected`) contains only dapp metadata, requested chain IDs/methods, and known public chain metadata used to render the chain notice and prefill Add Chain; it contains no secrets or session request payloads.

`walletConnectKeepalive.ts` runs only while approved WalletConnect sessions exist. It sends periodic `*_batchFetchMessages` requests to the WalletConnect relay so the MV3 service worker stays awake and can receive relay requests without an open popup/sidepanel. The keepalive uses session topics and relay routing metadata only; it does not read cached passwords, API keys, private keys, seed phrases, or transaction payload secrets.

For `eth_sendTransaction`, the WC request is converted to a `PendingTxRequest` with `accountId` / `accountAddress` / `accountType` pinned through `pinnedTxRequest()`. For `personal_sign` / typed-data signatures, the request is converted to a `PendingSignatureRequest` through `pinnedSignatureRequest()`. Confirm-time signing still routes through `txHandlers.ts`, so Bankr, private-key, and seed-phrase accounts keep their existing password/session-restoration behavior. View-only impersonator accounts cannot sign.

For ERC-5792 `wallet_sendCalls`, the WC request reuses `batchTxHandlers.ts` and is converted to a `PendingBatchTxRequest` with the account authorized in the WalletConnect session passed explicitly into the batch handler. The batch bundle status is scoped to the WalletConnect peer metadata, so another WC peer cannot query or open a bundle it did not create.

Security rules:

- `tx.from` and signature signer params must match the account authorized in the WalletConnect session.
- `wallet_sendCalls.params.from` and per-call `from` fields must match the account authorized in the WalletConnect session.
- `eth_sign` and deprecated `eth_signTypedData` v1 are rejected, matching the injected-provider path.
- `eth_signTypedData_v3` / `_v4` run the same EIP-712 validation and sanitization as injected requests.
- Only a small allowlist of read-only RPC methods is proxied to the user's configured RPC URL. Raw transaction submission and debugging methods are not proxied.
- `walletConnectPendingRequests` contains only request routing metadata. It is consumed when `writeResultToStorage()` writes `txResult:{id}` / `sigResult:{id}`, then the service worker responds to the dapp over WalletConnect.
- `walletConnectChainId` contains only non-secret UI/session state. It is scoped to WalletConnect and does not overwrite injected-provider per-tab chain state.

### EIP-7702 Delegation Handlers (`delegationHandlers.ts`)

These are UI-only Smart Account management messages and are gated by `EXTENSION_ONLY_MESSAGES`:

| Handler | Effect |
| --- | --- |
| `getDelegationStatus` / `probeDelegateContract` | Reads onchain delegation and probes ERC-7821 support. Kept extension-only to avoid leaking account delegation state and custom-chain probing to webpages. |
| `setCustomDelegate` / `removeCustomDelegate` | Internal storage-mirror helpers for `customDelegates`. Must not be callable by content scripts because stale writes could mislead the Smart Account UI. Runtime signing still verifies onchain state. |
| `initiateSetDelegation` / `initiateRevokeDelegation` | Enqueues a type-4 pending tx request that the user confirms through the normal transaction confirmation flow. Must stay extension-only so a webpage cannot queue smart-account Set/Revoke prompts. |

Set/Revoke storage reconciliation must read `eth_getCode(EOA)` after any terminal receipt. Do not infer delegation state only from `receipt.status`: EIP-7702 authorization processing occurs before normal execution, so execution can revert while the EOA delegation still changed. If the `eth_getCode` read itself fails, leave the mirror unchanged; an RPC failure is not evidence that the EOA is undelegated.

### Token Metadata Handlers

`resolveTokenMetadata` and `lookupCustomToken` are gated by
`EXTENSION_ONLY_MESSAGES` because they can include user-added custom-token
metadata from `customTokens`. `addCustomToken`, `updateCustomToken`, and
`removeCustomToken` are also extension-only so webpages cannot mutate the user's
manual token list. Content scripts may still call the narrower `fetchTokenInfo`
/ `fetchTokenLogo` helpers; those return public chain/token-list metadata only
and do not expose watched-asset custom-token records.

---

## EIP-712 Signature Request Validation

**File**: `apps/extension/src/chrome/eip712Validator.ts`
**Added**: v1.4.0

All `eth_signTypedData_v3` and `eth_signTypedData_v4` requests are validated before processing to prevent denial-of-service attacks from malicious dapps.

### Validation Rules

| Check               | Limit                                         | Purpose                                                 |
| ------------------- | --------------------------------------------- | ------------------------------------------------------- |
| Nesting depth       | 50 levels                                     | Prevent stack overflow and DoS from deeply nested types |
| Circular references | None allowed                                  | Prevent infinite recursion in type resolution           |
| Schema structure    | Must have domain, types, primaryType, message | EIP-712 conformance                                     |
| Type definitions    | All referenced types must exist               | Prevent undefined type errors                           |

### Attack Scenarios Blocked

1. **Deep nesting DoS**: 60,825 nested types attempting to crash extension
2. **Circular reference DoS**: Types referencing themselves causing infinite loops
3. **Malformed schemas**: Invalid JSON or missing required fields

### Validation Flow

```
handleSignatureRequest() → validateEIP712TypedData()
  ├─ Check method (only v3/v4)
  ├─ Parse typed data
  ├─ Validate schema structure
  ├─ Detect circular references (DFS)
  ├─ Check nesting depth
  └─ Validate type definitions
     ↓
if invalid: console.error() + return error to dapp + no popup
if valid: continue to normal flow
```

### Console Logging

Failed validations log to console for debugging:

```
[WalletChan] EIP-712 validation failed for https://malicious.site:
  Type 'Attack' exceeds maximum nesting depth of 50 (found 60825)
```

This helps developers identify malicious sites attempting attacks.

---

## SIWE Signature Request Validation

**Files**:

- `apps/extension/src/lib/siwe/*`
- `apps/extension/src/components/SiweMessageDisplay.tsx`
- `apps/extension/src/components/SiweValidationIssues.tsx`
- `apps/extension/src/chrome/txHandlers.ts`

All `personal_sign` messages that match the EIP-4361 SIWE header are parsed and
validated before signing. The popup shows a human-readable auth review, while
`txHandlers.ts` repeats the same validation at confirm time for Bankr, private
key, and seed phrase accounts.

### Blocking Checks

| Check | Purpose |
| --- | --- |
| Required SIWE fields and field order | Prevent malformed auth messages from being presented as valid logins |
| Account address matches pinned signing account | Prevent signing a login for a different address |
| SIWE chain ID matches connected chain ID | Prevent chain-confusion login messages |
| SIWE domain matches the connected site origin | Prevent a site from requesting login to another domain |
| Expiration / not-before validity | Prevent expired or not-yet-valid login messages |

Warnings such as missing expiration, weak nonce, old issued-at time, insecure
HTTP URI, or non-checksummed address remain visible in the UI but do not block
signing unless they become validation errors.

Users can bypass SIWE validation errors only from the extension UI by typing the
exact phrase `I understand`. This sends `allowUnsafeSiwe` on the extension-only
`confirmSignatureRequest` message and skips only the SIWE validation pass. The
stored pending request, pinned account binding, request expiry, account type,
and dapp-supplied signer parameter checks still run and are not bypassable by
the SIWE override.

### Validation Flow

```
SignatureRequestConfirmation → analyzeSiweMessage()
  ├─ Display human-readable auth summary
  ├─ Show validation issues
  └─ Require "I understand" before signing through validation errors

handleConfirmSignatureRequest*() → validateSiwePersonalSignRequest()
  ├─ Re-parse raw personal_sign message
  ├─ Bind to pinned account address, request origin, and request chain ID
  └─ Reject signing on validation errors unless extension UI override is set
```

---

## Content Script Message Filtering

### Inpage-to-Background Messages (via inject.ts)

Only these inpage message types are accepted from the webpage by `inject.ts`:

| Inpage Message Type       | Background Message / Effect                                      | Purpose |
| ------------------------- | ---------------------------------------------------------------- | ------- |
| `i_sendTransaction`       | `sendTransaction`                                                | Transaction request (`from`, `to`, `data`, `value`, `chainId`) |
| `i_signatureRequest`      | `signatureRequest`                                               | Signature request (`method`, `params`, `chainId`) |
| `i_rpcRequest`            | `rpcRequest`                                                     | RPC proxy call through the extension-selected RPC URL |
| `i_switchEthereumChain`   | Updates tab chain state; may send `dappChainSwitchNotification`  | Chain switch request (`chainId`) |
| `i_addEthereumChain`      | `addEthereumChain`                                               | User-confirmed chain add/switch request |
| `i_watchAsset`            | `watchAsset`                                                     | User-confirmed `wallet_watchAsset` request |
| `i_walletGetCapabilities` | `walletGetCapabilities`                                          | ERC-5792 capability query |
| `i_walletSendCalls`       | `walletSendCalls`                                                | ERC-5792 batch request |
| `i_walletGetCallsStatus`  | `walletGetCallsStatus`                                           | ERC-5792 bundle status query |
| `i_walletShowCallsStatus` | `walletShowCallsStatus`                                          | Opens WalletChan status UI for a bundle |

**Source validation**: `inject.ts` checks `e.source === window` before forwarding.

After a supported `i_switchEthereumChain` request actually changes the tab's
chain, `inject.ts` sends the background-only `dappChainSwitchNotification`
message. That message carries only `chainId`/`chainName`; the background worker
resolves chain metadata from trusted storage, derives the dapp label from the
Chrome sender, rate-limits repeats per tab/origin/chain, and creates a browser
notification. It does not expose secrets or account data.

**Dapp RPC fast path**: `dappRpcForwarding.ts` runs entirely in the inpage
script and does not add any new content-script or background message type. It
observes page `fetch` calls to discover HTTP(S) JSON-RPC URLs, validates them
with `eth_chainId`, and forwards only a narrow allowlist of dapp-originated
read methods. Critical wallet data and operations (`wallet_*`, account/chain
state, signing, transaction submission, raw tx broadcast, gas estimation,
nonces, `eth_getCode`/delegation reads, stateful filters, and WalletChan's own
confirmation/simulation flows) must stay on extension-controlled RPC paths.

### Background-to-Content-Script Messages

Only these types are sent to content scripts (and thus forwarded to the webpage):

| Message Type | Data Sent                                    |
| ------------ | -------------------------------------------- |
| `setAddress` | address, displayAddress                      |
| `setChainId` | chainId                                      |
| `setAccount` | address, displayName, accountId, accountType |

**Rule**: Never send secrets (passwords, API keys, private keys) to content scripts. Any new background-to-content-script message type must be reviewed for data sensitivity.

**Whitelist enforcement**: `inject.ts` only forwards `setAddress`, `setChainId`, and `setAccount` messages to the webpage via `window.postMessage`. All other message types from background broadcasts (e.g., `newPendingTxRequest`, `accountsUpdated`, `txHistoryUpdated`) are **not** forwarded. This prevents malicious dapps from eavesdropping on wallet activity across other tabs.

### Sender Verification for Secret-Returning Handlers

Handlers that return secrets or generate sensitive material verify that the sender is an extension page (popup, sidepanel, onboarding) and not a content script running on a web page:

| Handler            | Check                     |
| ------------------ | ------------------------- |
| `getCachedApiKey`  | `isExtensionPage(sender)` |
| `revealPrivateKey` | `isExtensionPage(sender)` |
| `revealSeedPhrase` | `isExtensionPage(sender)` |
| `generateMnemonic` | `isExtensionPage(sender)` |

The `isExtensionPage()` helper verifies `sender.url` starts with `chrome-extension://<extension-id>/`. Content scripts have `sender.url` set to the web page URL, so they will fail this check.

---

## Storage Keys Reference

### chrome.storage.local (encrypted secrets)

| Key                        | Contains Secrets | Description                                             |
| -------------------------- | ---------------- | ------------------------------------------------------- |
| `encryptedApiKeyVault`     | Yes (encrypted)  | API key encrypted with vault key                        |
| `encryptedApiKey`          | Yes (encrypted)  | Legacy API key encrypted with password                  |
| `encryptedVaultKeyMaster`  | Yes (encrypted)  | Vault key encrypted with master password                |
| `encryptedVaultKeyAgent`   | Yes (encrypted)  | Vault key encrypted with agent password                 |
| `pkVault`                  | Yes (encrypted)  | Private key vault with encrypted entries                |
| `agentPasswordEnabled`     | No               | Boolean flag                                            |
| `mnemonicVault`            | Yes (encrypted)  | Seed phrase mnemonics encrypted with PBKDF2+AES-256-GCM |
| `seedGroups`               | No               | Seed group metadata (names, counts)                     |
| `accounts`                 | No               | Account metadata (addresses, names, types)              |
| `pendingTxRequests`        | No               | Pending transaction queue                               |
| `pendingSignatureRequests` | No               | Pending signature queue                                 |
| `walletConnectPendingRequests` | No           | WalletConnect request routing metadata (`txId`/`sigId` → session topic/request id) |
| `walletConnectChainId`    | No               | WalletConnect-specific active chain ID |
| `crossDappBatch`           | No               | User-assembled cross-dapp batch (Bankr or PK/SP EIP-7702). Single batch, locked to first entry's pinned account, `from`, and `chainId`. The original pending entries are removed when added; the dapp promises stay open until ship/reject and are resolved via `txResult:{txId}` or `bundleStatuses` fan-out. |
| `txResult:{txId}`          | No               | Transient tx result (written on confirm/reject, read+deleted by content script) |
| `sigResult:{sigId}`        | No               | Transient sig result (written on confirm/reject, read+deleted by content script) |
| `rpcResult:{id}`           | No               | Transient RPC result (written after RPC call, read+deleted by content script)    |
| `txHistory`                | No               | Completed transaction log. Cross-dapp batch entries may include per-call `{ origin, favicon }` display metadata; no secrets. |
| `chatHistory`              | No               | Chat conversation history                               |
| `hiddenPortfolioTokens`    | No               | Global list of ERC-20 token keys the user hid from portfolio totals. Contains public token metadata only. |
| `cs:enabled`               | No               | Clear-signing descriptor fetch opt-out flag             |
| `cs:desc:{chainId}:{address}:{kind}:{selector\|format}` | No | Clear-signing descriptor cache; public metadata only, schema-versioned |

### chrome.storage.session (session-scoped, cleared on browser close)

| Key                        | Contains Secrets | Description                                                      |
| -------------------------- | ---------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `encryptedSessionPassword` | Yes (encrypted)  | Password for "Never" auto-lock restore (AES-GCM with random key) |
| `sessionId`                | No               | Session identifier (UUID)                                        |
| `sessionStartedAt`         | No               | Session timestamp (milliseconds since epoch)                     |
| `autoLockNever`            | No               | Boolean flag indicating "Never" auto-lock mode                   |
| `passwordType`             | No               | `"master"                                                        | "agent"` - Which password was used to unlock. Restored to maintain agent password access control guards after service worker restart (v1.3.0+) |

### chrome.storage.sync (synced, no secrets)

| Key                                                    | Description                          |
| ------------------------------------------------------ | ------------------------------------ |
| `address`                                              | Current wallet address               |
| `displayAddress`                                       | Display-friendly address             |
| `activeAccountId`                                      | Active account ID                    |
| `autoLockTimeout`                                      | Auto-lock timeout (ms)               |
| `tabAccounts`                                          | Per-tab account overrides            |
| `sidePanelMode` / `sidePanelVerified` / `isArcBrowser` | UI settings                          |
| `hidePortfolioValue`                                   | Boolean - hide/show token USD values |

---

## Manifest Security Surface

| Setting                    | Value                                                        | Security Note                                                                  |
| -------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| `manifest_version`         | 3                                                            | MV3 enforces CSP, no `eval()`, no remote code                                  |
| `permissions`              | `activeTab`, `storage`, `sidePanel`, `notifications`, `tabs` | No `webRequest`, no `debugger`                                                 |
| `host_permissions`         | `https://*/*`, `http://*/*`                                  | Broad, needed for RPC proxy (extension-configured URL only, 15s timeout) + content script |
| `content_scripts.matches`  | All URLs                                                     | Wallet must inject on all pages for dapp detection                             |
| `externally_connectable`   | Not defined                                                  | External websites cannot send messages to background                           |
| `web_accessible_resources` | `inpage.js` only                                             | Only the provider script is exposed to pages                                   |
| `content_security_policy`  | MV3 default                                                  | No inline scripts, no `eval()`, no remote code                                 |

---

## Security Invariants

These must always hold true. Violations indicate a security bug.

1. **Private keys and mnemonics never leave the service worker** - They are decrypted in `sessionCache.ts` / `mnemonicStorage.ts`, used for signing in `txHandlers.ts` / `localSigner.ts`, and never sent via `chrome.runtime.sendMessage` to UI or content scripts (except the `revealPrivateKey` and `revealSeedPhrase` handlers which are password-gated and agent-blocked).

2. **No secrets in console logs** - Never `console.log` passwords, API keys, private keys, or vault keys. Grep for `console.log` near sensitive variables when reviewing changes.

3. **Agent password blocks all account/secret modifications** - Every handler that modifies secrets or account structure checks `getPasswordType() === "agent"` and returns an error. The UI hides these options too, but backend enforcement is the true security boundary.

4. **Encryption uses fresh randomness** - Every encryption operation generates a new random salt and IV. Never reuse salt/IV pairs.

5. **Service worker suspend clears credentials** - The `suspend` event handler in `background.ts` calls `clearCachedApiKey()` and `clearCachedVault()`.

6. **Timed auto-lock clears every in-memory credential** - All cached credential getters, including `getCachedVaultKey()` and `getPasswordType()`, enforce the configured timeout. Expiry clears the API key, password, private-key vault, vault key, and password type together.

7. **Session restore only works for "Never" auto-lock** - `tryRestoreSession()` checks `autoLockTimeout === 0` before attempting restoration.

8. **Content script only forwards whitelisted message types** - `inject.ts` only bridges the documented dapp-facing allowlist from page to background: transaction/signature requests, RPC proxy calls, chain add/switch/watch-asset prompts, and ERC-5792 capability/batch/status methods. In the reverse direction, only `setAddress`, `setChainId`, and `setAccount` are forwarded from background to the webpage.

9. **No `eval()` or dynamic code execution** - MV3 CSP prevents this, but also verify no `new Function()` or similar patterns exist.

10. **Secret-returning handlers verify sender origin** - Handlers like `getCachedApiKey`, `revealPrivateKey`, `revealSeedPhrase`, and `generateMnemonic` check `isExtensionPage(sender)` to ensure the request comes from an extension page, not a content script on a web page.

11. **Password change re-encrypts all password-derived vaults atomically** - `handleChangePasswordWithCachedPassword` computes all new encrypted values in memory first (`encryptedVaultKeyMaster`, `pkVault`, `mnemonicVault`), then writes them in a single `chrome.storage.local.set()` call. This prevents partial-write corruption where the vault key is updated but private key/mnemonic vaults remain encrypted with the old password.

12. **Transaction confirmation checks expiry** - `handleConfirmTransaction`, `handleConfirmTransactionAsync`, and `handleConfirmTransactionAsyncPK` reject requests older than 30 minutes (`TX_EXPIRY_MS`), preventing stale transaction confirmation.

13. **Transaction double-execution prevention** - A `processingTxIds` Set in `txHandlers.ts` prevents the same transaction from being submitted twice if two confirm messages arrive concurrently.

14. **RPC proxy restricts URL sources** - `handleRpcRequest` only accepts extension-configured RPC URLs, preventing arbitrary webpage-controlled endpoints. A 15-second timeout prevents resource exhaustion from slow servers. The inpage dapp-RPC fast path only uses HTTP(S) JSON-RPC URLs discovered from the page itself, validates the chain with `eth_chainId`, forwards only allowlisted non-critical read methods, and falls back to the extension RPC on error or timeout.

15. **Input length validation on user-facing strings** - Display names and group names are capped at 100 characters to prevent storage bloat from malformed inputs. Unknown message types are logged with `console.warn` for debuggability.

---

## Pre-Commit Security Checklist

When reviewing or making changes to extension code, verify the following:

### If you added/modified a message handler in `background.ts`:

- [ ] Does the handler touch secrets (API keys, passwords, private keys, vault keys)?
- [ ] If it modifies secrets or accounts, does it check `getPasswordType() === "agent"` and block?
- [ ] Does the handler return secrets in the response? If so, is `isExtensionPage(sender)` checked to prevent content scripts from requesting secrets?
- [ ] Could a compromised content script abuse this handler? Consider what happens if arbitrary messages are sent from a web page context.

### If you modified crypto, encryption, or storage:

- [ ] Are new salt and IV generated for each encryption operation?
- [ ] Is PBKDF2 iteration count still 600,000?
- [ ] Did you update BOTH read AND write paths for any changed storage keys? (Common bug: updating reads but forgetting writes in other handlers)
- [ ] Grep for the storage key name across all files to find every touchpoint.

### If you modified content scripts or inpage scripts:

- [ ] Does `inject.ts` still only forward the whitelisted message types?
- [ ] Are any new messages being sent from background to content scripts? Do they contain sensitive data?
- [ ] Is `e.source === window` still checked before forwarding messages?

### If you modified session/cache logic:

- [ ] Is auto-lock still enforced (cache expiry checked in getters)?
- [ ] Does the `suspend` event still clear all caches?
- [ ] Does manual lock (`lockWallet`) still clear all caches and session storage?
- [ ] Does session restore still require `autoLockTimeout === 0`?

### If you added a new message handler that uses getCachedPassword() or getCachedApiKey():

- [ ] Does the handler include session restoration logic for "Never" auto-lock mode?
- [ ] Pattern: if credentials are null, check `autoLockTimeout === 0`, then call `tryRestoreSession(handleUnlockWallet)`
- [ ] Is the handler added to the "Handlers with Session Restoration" table in IMPLEMENTATION.md?
- [ ] Without this, the handler will fail after service worker restarts when auto-lock is "Never"

### If you added new storage keys:

- [ ] Is sensitive data encrypted before storage?
- [ ] Is the key documented in the Storage Keys Reference above?
- [ ] Is `chrome.storage.sync` only used for non-sensitive data?

### General checks:

- [ ] No `console.log` of sensitive data (passwords, keys, secrets)
- [ ] No `eval()`, `new Function()`, or dynamic code execution
- [ ] No hardcoded secrets, API keys, or credentials
- [ ] Build passes: `pnpm build:extension`

---

## Files to Audit by Category

Quick reference for which files to examine based on what area of security you're reviewing.

### Credential lifecycle (storage, caching, expiry)

- `sessionCache.ts` - All in-memory credential caching and auto-lock
- `crypto.ts` - API key encryption/decryption, vault key operations
- `cryptoUtils.ts` - Shared crypto constants (iterations, lengths)
- `vaultCrypto.ts` - Private key vault encryption/decryption

### Access control (agent vs master password)

- `authHandlers.ts` - Password verification, agent guards on save/change
- `background.ts` - Agent guards on account/destructive handlers
- `sessionCache.ts` - `getPasswordType()`, `setCachedPasswordType()`

### Message passing (what crosses trust boundaries)

- `inject.ts` - Content script bridge (message whitelist)
- `impersonator.ts` - Inpage provider (what the webpage can call)
- `background.ts` - Message router (what handlers exist)
- `walletConnectHandlers.ts` / `walletConnectRequestHandlers.ts` / `walletConnectBatchRequestHandlers.ts` / `walletConnectRpcRequestHandlers.ts` / `walletConnectKeepalive.ts` - WalletConnect relay session approval, request intake, and active-session relay keepalive

### Transaction security

- `txHandlers.ts` - Transaction confirmation, signing, API key usage
- `localSigner.ts` - Private key signing (viem)
- `bankrApi.ts` - API key sent to Bankr backend
- `pendingTxStorage.ts` - Pending transaction persistence

### Extension permissions

- `manifest.json` - Permissions, host permissions, CSP, externally_connectable

---

## Known Accepted Risks

These are security characteristics that have been reviewed and accepted:

1. **Session password stored in `chrome.storage.session`** with encryption key alongside ciphertext (for "Never" auto-lock mode). Provides protection against casual inspection. Acceptable because `chrome.storage.session` is only accessible to the extension's own service worker, and if that context is compromised, in-memory credentials are already exposed.

2. **No rate limiting on unlock attempts**. PBKDF2 with 600k iterations provides ~100ms per attempt, making brute-force impractical without extreme resources.

3. **`getCachedApiKey` returns plaintext API key** to the extension UI. This is necessary for displaying it in settings and for the UI to function. The UI is same-origin with the background worker.

4. **Content script runs on all websites**. Required for wallet provider injection. The content script only bridges specific message types and does not expose any secrets.

5. **RPC proxy in background (`rpcRequest` handler)** accepts extension-configured RPC URLs from content scripts with a 15-second timeout. This bypasses page CSP for legitimate RPC calls. The background worker acts as a fetch proxy but does not attach credentials to these requests.

6. **Console logging of migration events and decryption operations** in `authHandlers.ts`, `vaultCrypto.ts`, and `sessionCache.ts`. Logs include timing information ("API key migration completed", "Private key migration completed", "Session restored after service worker restart") but never log the actual secrets (keys, passwords). Acceptable because: (a) Chrome DevTools requires explicit user action to open, (b) logs provide critical debugging info for migration and session restore flows, (c) industry standard practice (MetaMask logs extensively), (d) no secrets are exposed in log messages.
