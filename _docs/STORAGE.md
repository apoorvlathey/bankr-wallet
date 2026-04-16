# Storage Key Reference

Complete reference of every `chrome.storage` key used by WalletChan. Consult this before any release that touches storage — see [PUBLISHING.md](./PUBLISHING.md) for the migration rules and pre-release checklist.

## chrome.storage.local

Persists across extension restarts. Cleared only on manual reset or uninstall.

### Encryption & Vault Keys

| Key                       | Shape                               | Description                                                                                                                         | Introduced |
| ------------------------- | ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| `encryptedApiKey`         | `{ ciphertext, iv, salt }` (base64) | API key encrypted directly with password via PBKDF2 + AES-256-GCM. **Legacy format** — kept after vault key migration for fallback. | v0.1.0     |
| `encryptedApiKeyVault`    | `{ ciphertext, iv }` (base64)       | API key encrypted with the vault key (no salt — key is raw). **Current format.**                                                    | v1.0.0     |
| `encryptedVaultKeyMaster` | `{ ciphertext, iv, salt }` (base64) | Vault key encrypted with the master password. Presence of this key means vault key system is active.                                | v1.0.0     |
| `encryptedVaultKeyAgent`  | `{ ciphertext, iv, salt }` (base64) | Vault key encrypted with the agent password. Only exists when agent password is enabled.                                            | v1.0.0     |
| `agentPasswordEnabled`    | `boolean`                           | Whether agent password is set up.                                                                                                   | v1.0.0     |

**Encryption chain (current):** password → PBKDF2 → decrypts `encryptedVaultKeyMaster` → vault key → decrypts `encryptedApiKeyVault`, `pkVault`, `mnemonicVault`

### Accounts

| Key             | Shape                                                          | Description                                                                                                                                                                                                                          | Introduced |
| --------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------- |
| `accounts`      | `Account[]` — `{ id, type, address, displayName?, createdAt }` | All account metadata. Types: `bankr`, `privateKey`, `seedPhrase`, `impersonator`.                                                                                                                                                    | v1.0.0     |
| `seedGroups`    | `SeedGroup[]` — `{ id, name, createdAt, accountCount }`        | Metadata for imported BIP39 seed phrase groups.                                                                                                                                                                                      | v1.0.0     |
| `pkVault`       | `{ version: 1, entries: [{ id, keystore }] }`                  | Encrypted private keys. `id` matches account ID. Keystore is AES-256-GCM encrypted with vault key (`salt === ""`) or password (`salt !== ""`). Migration to vault key format happens on first unlock with master password (v1.3.0+). | v1.0.0     |
| `mnemonicVault` | `{ version: 1, entries: [{ id, keystore }] }`                  | Encrypted seed phrases. `id` matches seed group ID. AES-256-GCM encrypted with vault key (`salt === ""`) or password (`salt !== ""`). Migration to vault key format happens on first unlock with master password (v1.3.0+).          | v1.0.0     |

### Transaction & Request State

| Key                        | Shape                                                                                    | Description                                                                | Introduced |
| -------------------------- | ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ---------- |
| `pendingTxRequests`        | `PendingTxRequest[]` — `{ id, tx, origin, favicon, chainName, timestamp }`               | Pending transaction requests awaiting user confirmation. 30-minute expiry. | v0.1.0     |
| `pendingSignatureRequests` | `PendingSignatureRequest[]` — `{ id, signature, origin, favicon, chainName, timestamp }` | Pending signature requests awaiting user confirmation. 30-minute expiry.   | v1.0.0     |
| `crossDappBatch`           | `CrossDappBatch \| null` — `{ fromAddress, chainId, chainName, accountType, entries: [{ txId, tx, origin, favicon, addedAt, source? }], createdAt }` | Single user-assembled cross-dapp batch (Bankr/impersonator only). Locked to the `fromAddress` + `chainId` of the first entry added. Cleared on ship/reject/last-removed. Each entry's `source` is `{ kind: "eth_sendTransaction" }` (default) or `{ kind: "wallet_sendCalls", bundleId, callIndex, totalCalls }`. For `eth_sendTransaction` entries the dapp promise is held open in inject.ts and resolved by writing `txResult:{txId}` on ship/reject. For `wallet_sendCalls` entries the dapp already received its bundle id via `batchTxAck`; we keep its `bundleStatuses` entry at PENDING while the calls live in the batch and transition it to CONFIRMED/REVERTED/OFFCHAIN_FAILURE on ship/remove/reject. Sibling calls from the same bundle are added/removed/resolved as a unit. | v2.4.0     |
| `txHistory`                | `CompletedTransaction[]` — `{ id, status, tx, origin, chainName, chainId, txHash, ... }` | Completed transaction history. Max 50 entries.                             | v1.0.0     |

### Chat & Portfolio

| Key                  | Shape                                                              | Description                                                                  | Introduced |
| -------------------- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------- | ---------- |
| `chatHistory`        | `Conversation[]` — `{ id, title, messages, createdAt, updatedAt }` | Chat conversations with Bankr AI. Max 50 conversations, 100 messages each.   | v0.2.0     |
| `portfolioSnapshots` | `Record<address, HoldingsSnapshot[]>`                              | Portfolio value snapshots per address. 1-hour min interval, 8-day retention. | v1.0.0     |
| `ensIdentityCache`   | `Record<address, { name, avatar, resolvedAt }>`                    | Resolved ENS/Basename/WNS/Mega names and avatars. 6-hour cache.              | v1.0.0     |
| `ensAvatarImageCache` | `Record<url, { dataUrl, sizeBytes, cachedAt, lastAccessedAt }>`   | Avatar image bytes re-encoded to WebP (via `createImageBitmap` + `OffscreenCanvas`, background-only) and stored as data URLs for instant render on reopen. Keyed by source URL, 14-day TTL, LRU-pruned to 200 entries / 5 MB. Re-encoding strips SVG scripts/metadata so cached bytes are guaranteed raster pixels. | v3.3.0 |
| `customTokens`       | `CustomToken[]` — `{ contractAddress, chainId, symbol, name, decimals, addedAt }` | User-added custom ERC-20 tokens for portfolio tracking. Merged into holdings on each load; skipped if API already returns the token. | v2.2.0 |
| `coingeckoMarketCache` | `Record<coinId, { priceUsd, logoUrl?, fetchedAt }>`             | Shared CoinGecko market cache for native asset price + image lookups. Used by gas estimation and custom-chain native token resolution. | v2.3.0 |
| `coingeckoSearchCache` | `Record<query, { coins, fetchedAt }>`                            | Cached CoinGecko search responses for resolving unknown custom native assets to a coin ID. | v2.3.0 |
| `coingeckoNativeResolutionCache` | `Record<lookupKey, { coinId, fetchedAt }>`             | Maps custom native asset descriptors (`chainName/native name/symbol`) to a resolved CoinGecko coin ID to avoid repeated searches. | v2.3.0 |

### Transient (dynamic keys)

| Key Pattern         | Shape                                                   | Description                                                                                                            |
| ------------------- | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `notification-{id}` | `string` (explorer URL) or `{ type, txId }`             | Notification click metadata. Created on tx completion, removed on click/dismiss.                                       |
| `txResult:{txId}`   | `{ result: { success, txHash?, error? }, timestamp }`   | Transaction result. Written by background on confirm/reject, read+deleted by content script. Stale keys cleaned >30m.  |
| `sigResult:{sigId}` | `{ result: { success, signature?, error? }, timestamp }` | Signature result. Written by background on confirm/reject, read+deleted by content script. Stale keys cleaned >30m.    |
| `rpcResult:{id}`    | `{ result: { result?, error? }, timestamp }`             | RPC proxy result. Written by background after RPC call, read+deleted by content script. 30s timeout, stale keys cleaned >30m. |

---

## chrome.storage.sync

Syncs across Chrome profiles (if signed in). Persists across restarts.

### Core State

| Key               | Shape                                           | Description                                                                                     | Introduced |
| ----------------- | ----------------------------------------------- | ----------------------------------------------------------------------------------------------- | ---------- |
| `address`         | `string` (`0x...`)                              | Active wallet address. Written by popup on account switch, read by inject.ts for provider init. | v0.1.0     |
| `displayAddress`  | `string`                                        | Display-friendly name (ENS name, custom label, or raw address).                                 | v0.1.0     |
| `chainName`       | `string` (e.g. `"Base"`)                        | Currently selected network. Per-tab via inject.ts, global default via popup.                    | v0.1.0     |
| `networksInfo`    | `Record<string, { chainId, rpcUrl, explorer }>` | Supported networks config. Written by NetworksContext on first load.                            | v0.1.0     |
| `activeAccountId` | `string` (UUID)                                 | Currently active account ID. Falls back to first account if missing.                            | v1.0.0     |
| `tabAccounts`     | `Record<number, string>` (tabId → accountId)    | Per-tab account overrides. Cleaned up when accounts are removed.                                | v1.0.0     |

### Settings

| Key                  | Shape         | Description                                                                                             | Introduced |
| -------------------- | ------------- | ------------------------------------------------------------------------------------------------------- | ---------- |
| `autoLockTimeout`    | `number` (ms)               | Auto-lock timeout. `0` = Never (default). Values: 0, 60000, 300000, 900000, 1800000, 3600000, 14400000. | v1.0.0     |
| `sidePanelMode`      | `boolean`                   | Whether sidepanel mode is enabled (vs popup).                                                           | v0.2.0     |
| `sidePanelVerified`  | `boolean`                   | Whether sidepanel has been verified for this browser.                                                   | v0.2.0     |
| `isArcBrowser`       | `boolean`                   | Detected Arc browser — disables sidepanel.                                                              | v0.2.0     |
| `hidePortfolioValue` | `boolean`                   | User preference to hide USD values in portfolio.                                                        | v1.0.0     |
| `selectedThemeId`    | `"bauhaus" \| "midnight"`   | Active theme ID. Absent = default `"bauhaus"`. Mirrored to `window.localStorage` for synchronous pre-React boot (no flash). See `_docs/THEMING_PRD.md`. | v3.2.0 |

---

## chrome.storage.session

Cleared when browser closes. NOT synced. Used only for session restoration when auto-lock is "Never".

| Key                        | Shape                        | Description                                                                                                                          | Introduced |
| -------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ---------- |
| `sessionId`                | `string` (UUID)              | Session identifier for tracking across service worker restarts.                                                                      | v1.0.0     |
| `sessionStartedAt`         | `number` (timestamp)         | When the session was established.                                                                                                    | v1.0.0     |
| `autoLockNever`            | `boolean`                    | Flag indicating this session uses "Never" auto-lock.                                                                                 | v1.0.0     |
| `encryptedSessionPassword` | `{ data, key, iv }` (base64) | Password encrypted with random AES-GCM key for session restoration after service worker restart. Only set when auto-lock is "Never". | v1.0.0     |
| `passwordType`             | `"master" \| "agent"`        | Which password was used to unlock. Restored to maintain agent password access control guards after service worker restart.           | v1.3.0     |

---

## Version History

What storage each released version expects to find:

### v0.1.0 / v0.1.1 (initial releases)

```
local:  encryptedApiKey, pendingTxRequests
sync:   address, displayAddress, chainName, networksInfo
```

### v0.2.0 (chat + auto-update)

```
local:  encryptedApiKey, pendingTxRequests, chatHistory
sync:   address, displayAddress, chainName, networksInfo,
        sidePanelMode, sidePanelVerified, isArcBrowser
```

### v1.0.0 (multi-account, vault key, private keys, seed phrases)

All keys listed above. Migration from v0.1.x/v0.2.0:

- `accounts` array created from legacy `address` by `migrateFromLegacyStorage()` in background.ts
- `encryptedApiKey` → vault key system migrated on first unlock by `authHandlers.ts`

### v1.3.0 (agent password transaction signing, password type persistence)

New keys:

- `chrome.storage.session.passwordType` (optional)

Modified keys (dual-format support):

- `pkVault` entries now support vault-key encryption (`salt === ""`) in addition to password encryption (`salt !== ""`)
- `mnemonicVault` entries now support vault-key encryption (same dual-format pattern)

Migration from v1.0.0+:

- Private keys and seed phrases migrated from password encryption to vault-key encryption on first unlock with master password
- Migration is idempotent and checks format before re-encrypting
- Both formats continue to work (backward compatible)
- Agent password can sign transactions after migration completes
