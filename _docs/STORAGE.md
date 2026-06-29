# Storage Key Reference

Complete reference of every `chrome.storage` key used by WalletChan. Consult this before any release that touches storage — see [PUBLISHING.md](./PUBLISHING.md) for the migration rules and pre-release checklist.

## Modifying Storage Safely

**CRITICAL**: Chrome extensions auto-update silently — users on ANY previous version will receive new code. Before adding, removing, renaming, or changing the shape of ANY `chrome.storage` key, you **MUST**:

1. Read this file in full — know every key, its shape, and which version introduced it.
2. Read [`PUBLISHING.md`](./PUBLISHING.md) — migration rules, how to write an idempotent migration, and the pre-release storage checklist.
3. Write a migration in `background.ts` (called from the `onInstalled` `"update"` handler) if old users would break without one.
4. Update this file with any new/changed keys and their version.

Failure to do this **will brick the extension** for existing users (they get stuck in an onboarding loop or lose data).

### Audit checklist for any storage change

1. **Audit ALL read AND write paths** — grep for the storage key name (e.g. `encryptedApiKey`, `encryptedApiKeyVault`).
2. **Check every file** that touches the data — `background.ts` has multiple handlers, `AccountSettingsModal.tsx` can save directly. Common mistake: updating read paths but forgetting write paths in different files/handlers.
3. **Trace user-reported anomalies** all the way to a write path — don't dismiss them; a weird value usually points at a storage/migration bug.

### Key Storage Locations (API key encryption)

| Key                       | Purpose                                           |
| ------------------------- | ------------------------------------------------- |
| `encryptedApiKeyVault`    | API key encrypted with vault key (current format) |
| `encryptedApiKey`         | API key encrypted with password (legacy format)   |
| `encryptedVaultKeyMaster` | Vault key encrypted with master password          |

Rule: check `cachedVaultKey` to determine which system is active before saving API keys.

---

## chrome.storage.local

Persists across extension restarts. Wallet-scoped keys and transient prefixes
are cleared by manual reset through `apps/extension/src/chrome/walletResetStorage.ts`;
other app preferences persist until changed by the user. Non-critical metadata
and image caches are pruned by `apps/extension/src/chrome/storageCachePruner.ts`
on service-worker startup and every 6 hours, in addition to their normal
read-time TTL checks.

### Encryption & Vault Keys

| Key                       | Shape                               | Description                                                                                                                         | Introduced |
| ------------------------- | ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| `encryptedApiKey`         | `{ ciphertext, iv, salt }` (base64) | API key encrypted directly with password via PBKDF2 + AES-256-GCM. **Legacy format** — only writable before `encryptedVaultKeyMaster` exists; post-migration callers must use `encryptedApiKeyVault`. | v0.1.0     |
| `encryptedApiKeyVault`    | `{ ciphertext, iv }` (base64)       | API key encrypted with the vault key (no salt — key is raw). **Current format.**                                                    | v1.0.0     |
| `encryptedVaultKeyMaster` | `{ ciphertext, iv, salt }` (base64) | Vault key encrypted with the master password. Presence of this key means vault key system is active.                                | v1.0.0     |
| `encryptedVaultKeyAgent`  | `{ ciphertext, iv, salt }` (base64) | Vault key encrypted with the agent password. Only exists when agent password is enabled.                                            | v1.0.0     |
| `agentPasswordEnabled`    | `boolean`                           | Whether agent password is set up.                                                                                                   | v1.0.0     |
| `sessionEncKey`           | `string` (base64 32-byte AES key)   | Local half of "Never" auto-lock session restoration. Pairs with `chrome.storage.session.encryptedSessionPassword`; removed on lock/session clear/reset. | v1.0.0     |

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
| `pendingTxRequests`        | `PendingTxRequest[]` — `{ id, tx, origin, favicon, chainName, timestamp, walletConnect? }` | Pending transaction requests awaiting user confirmation. 30-minute expiry. `walletConnect` is optional metadata for requests received over WalletConnect: `{ topic, requestId, method, peerName, peerUrl?, peerIcon? }`. | v0.1.0     |
| `pendingSignatureRequests` | `PendingSignatureRequest[]` — `{ id, signature, origin, favicon, chainName, timestamp, walletConnect? }` | Pending signature requests awaiting user confirmation. 30-minute expiry. `walletConnect` has the same optional metadata shape as transaction requests. | v1.0.0     |
| `pendingBatchTxRequests`   | `PendingBatchTxRequest[]` — `{ id, params, origin, favicon, chainName, chainId, timestamp, accountType?, accountId?, accountAddress?, tabId?, frameId?, senderOrigin?, requestChainId? }` | Pending ERC-5792 `wallet_sendCalls` bundle requests awaiting user confirmation. 30-minute expiry. New entries are pinned with `accountId` / `accountAddress` / `accountType`; optional on the stored shape for backward compatibility with older entries. | next |
| `pendingWatchAssetRequests` | `PendingWatchAssetRequest[]` — `{ id, asset, chainId, origin, favicon, timestamp }` | Pending `wallet_watchAsset` prompts. `asset` is `{ address, symbol, decimals, image? }`. Survives popup close until accepted/rejected; result is written to `watchAssetResult:{id}`. | next |
| `pendingAddChainRequests`  | `PendingAddChainRequest[]` — `{ id, chainId, chainName?, nativeCurrency?, rpcUrls?, blockExplorerUrls?, origin, favicon, timestamp }` | Pending `wallet_addEthereumChain` prompts. Survives popup close until accepted/rejected; result is written to `addChainResult:{id}`. | next |
| `walletConnectPendingRequests` | `Record<txId\|sigId, { id, kind, topic, requestId, method, timestamp }>` | Bridges WalletConnect session requests to the normal pending tx/signature queues. Written when a WC request is enqueued; consumed when `txResult:{id}` / `sigResult:{id}` is written so the background can respond to the dapp over WalletConnect. Expired after 30 minutes. Additive; absence means no in-flight WC requests. | next |
| `walletConnectChainId` | `number` | WalletConnect-specific active EVM chain ID. Updated by the WalletConnect screen's chain selector, explicit WC `wallet_switchEthereumChain` requests, and inferred `args.params.chainId` changes from WC requests. Separate from `chrome.storage.sync.chainName` so injected dapps keep their existing per-tab chain behavior. Absence falls back to the current global `chainName` or the first visible chain for the active account type. | next |
| `crossDappBatch`           | `CrossDappBatch \| null` — `{ fromAddress, chainId, chainName, accountType, entries: [{ txId, tx, origin, favicon, addedAt, source? }], createdAt }` | Single user-assembled cross-dapp batch (Bankr/impersonator only). Locked to the `fromAddress` + `chainId` of the first entry added. Cleared on ship/reject/last-removed. Each entry's `source` is `{ kind: "eth_sendTransaction" }` (default) or `{ kind: "wallet_sendCalls", bundleId, callIndex, totalCalls }`. For `eth_sendTransaction` entries the dapp promise is held open in inject.ts and resolved by writing `txResult:{txId}` on ship/reject. For `wallet_sendCalls` entries the dapp already received its bundle id via `batchTxAck`; we keep its `bundleStatuses` entry at PENDING while the calls live in the batch and transition it to CONFIRMED/REVERTED/OFFCHAIN_FAILURE on ship/remove/reject. Sibling calls from the same bundle are added/removed/resolved as a unit. | v2.4.0     |
| `bundleStatuses`           | `BundleStatus[]` — `{ id, chainId, status, atomic, txHash?, txHashes?, receipts?, createdAt, completedAt?, error?, origin?, splitMode?, splitCalls?, splitNextIndex?, splitContext? }` | ERC-5792 `wallet_getCallsStatus` lifecycle state. Retained up to 100 entries and pruned after 24h. Split-mode fields track manually split non-atomic batches and the pinned context used to enqueue each single-tx confirmation. | next |
| `txHistory`                | `CompletedTransaction[]` — `{ id, status, tx, origin, chainName, chainId, txHash, ..., clearSignedMeta?, batchCallOrigins?, bridge?, assetChanges?, destAssetChanges? }` | Completed transaction history. Max 50 entries. `clearSignedMeta` (optional, added v3.7.1) snapshots the clear-signed summary at submission time — `{ kind: "approve"\|"transfer"\|"nativeSend"\|"erc7730", amount?, tokenSymbol?, tokenLogo?, tokenAddress?, isInfinite?, counterparty?, counterpartyLabel?, counterpartyEns?, intent?, contractName? }` — so the Activity tab can render "Approved 100 USDC to Uniswap V3 Router" without re-running RPC / eth.sh / ENS lookups on every render. Old entries lacking the field gracefully fall back to the raw `functionName` row. `batchCallOrigins` (optional, additive) is written for cross-dapp batch history entries — one `{ origin, favicon }` per encoded call — so the decoded batch-call list in TxDetailModal can show each contributing dapp instead of the synthetic "Cross-Dapp Batch" origin. Old entries without it fall back to the batch-level `origin/favicon`. `bridge` (optional, additive) marks a cross-chain bridge tx — `{ sourceChainId, sourceTxHash?, destinationChainId, destinationChainName, destinationTxHash?, bungeeStatusCode?, requestHash?, routeName?, receiverAddress?, refundTxHash? }`. Set at submission time on the bridge call entry; `requestHash` now stores Socket's `quoteId` for status lookup, and destination fields fill in as `bridgeStatusPoller` reads Socket `/v3/swap/status`. Old entries without it simply render as plain swaps. `assetChanges` (optional, additive) is the post-confirm snapshot of ERC-20 + native flows for the sender — `{ blockNumber, nativeDelta?, erc20Transfers: [{ token, direction: "in"\|"out", counterparty, amountWei, symbol?, decimals?, logoUrl? }] }` — written by `assetChangesExtractor` from receipt logs + `eth_getBalance` so the Activity modal can render "what actually flowed in/out of my wallet". `destAssetChanges` (same shape) is the bridge-destination leg, populated after `bridge.destinationTxHash` arrives. Failed and pre-existing entries simply lack these fields. | v1.0.0     |
| `pendingBridges`           | `Record<sourceTxHash, PendingBridge>` — `{ txId, sourceTxHash, sourceChainId, destinationChainId, destinationChainName, receiverAddress, createdAt, requestHash?, bungeeStatusCode?, lastPolledAt?, routeName? }` | Cross-chain bridge requests waiting on destination-chain settlement. Written by `maybeStartBridgePolling` after the source tx confirms; `requestHash` is the Socket quoteId when available. Entries are removed once `bridgeStatusPoller` sees a terminal mapped status code (`FULFILLED` / `SETTLED` / `EXPIRED` / `CANCELLED` / `REFUNDED`). Resumed on `runtime.onStartup` so a long-running bridge eventually fires its notification even if the service worker dies mid-poll. Auto-pruned at startup if older than 1h with no terminal state. | next     |

### Chat & Portfolio

| Key                  | Shape                                                              | Description                                                                  | Introduced |
| -------------------- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------- | ---------- |
| `chatHistory`        | `Conversation[]` — `{ id, title, messages, createdAt, updatedAt }` | Chat conversations with Bankr AI. Max 50 conversations, 100 messages each.   | v0.2.0     |
| `portfolioSnapshots` | `Record<address, HoldingsSnapshot[]>`                              | Portfolio value snapshots per address. 1-hour min interval, 8-day retention. | v1.0.0     |
| `portfolioHoldingsCache` | `{ version: 1, entries: Record<"address|visible-chain-key", { tokens, defiPositions, totalValueUsd, customTokenKeys, allTokenKeys, hiddenTokenKeys, onchainFetchedTokenKeys, rpcIssueChainIds, apiUnavailable, timestamp }> }` | Best-effort local cache of the last rendered Holdings snapshot. `TokenHoldings` hydrates from it on fresh popup/sidepanel mounts before starting live portfolio API/RPC revalidation, so cached balances paint without the skeleton. Entries are keyed by wallet address plus the visible-chain reload key, capped to 12 entries, and TTL-pruned after 24 hours by `storageCachePruner.ts`. Renderer pages keep a smaller `window.localStorage` mirror (`walletchan:portfolioHoldingsCache:v1`, capped to 3 entries) so first render can hydrate synchronously; `chrome.storage.local` remains canonical and reset/hide paths clear the mirror. Additive; absence or invalid data simply refetches live portfolio data. | next |
| `hiddenPortfolioTokens` | `HiddenPortfolioToken[]` — `HiddenPortfolioToken` is `{ chainId, contractAddress, symbol?, name?, logoUrl?, hiddenAt }` | Global list of ERC-20 tokens hidden from Holdings across all wallet addresses. `loadPortfolioTokenCatalog` filters these before totals are calculated, so current value and newly-written snapshots exclude hidden tokens. Add Token / wallet_watchAsset remove the matching hidden entry globally. Additive; absence means no hidden tokens. Older per-address development records are flattened lazily. | next |
| `ensIdentityCache`   | `Record<address, { name, avatar, resolvedAt }>`                    | Resolved ENS/Basename/WNS/Mega names and avatars. 6-hour cache.              | v1.0.0     |
| `ensAvatarImageCache` | `Record<url, { dataUrl, sizeBytes, cachedAt, lastAccessedAt }>`   | Avatar/token-logo image bytes re-encoded to WebP (via `createImageBitmap` + `OffscreenCanvas`, background-only) and stored as data URLs. Keyed by source URL, 14-day TTL, LRU-pruned to 200 entries / 5 MB on write and periodically compacted by `storageCachePruner.ts`. Re-encoding strips SVG scripts/metadata so cached bytes are guaranteed raster pixels. Renderer pages keep a best-effort `window.localStorage` mirror (`walletchan:imageCacheMirror:v1`, capped at ~2 MB) so already-cached images can paint synchronously on first render; `chrome.storage.local` is canonical and no migration is required if the mirror is absent. | v3.3.0 |
| `customTokens`       | `CustomToken[]` — `{ contractAddress, chainId, symbol, name, decimals, addedAt }` | User-added custom ERC-20 tokens for portfolio tracking. Merged into holdings on each load; skipped if API already returns the token. | v2.2.0 |
| `customDelegates`    | `Record<accountId, Record<chainId, "0x...">>` | Per-account × per-chain EIP-7702 custom-delegate mirror used by the Smart Account UI for display/prefill. Runtime batch resolution trusts `eth_getCode(EOA)` and the default-delegate registry, not this storage key. Reconciled from chain after Set/Revoke receipts, cleared automatically on account removal and when the onchain delegate is revoked/default. See [`7702.md`](./7702.md). | next |
| `recentlyReceivedTokens` | `Record<"chainId-address", { chainId, contractAddress, addedAt, symbol?, decimals?, logoUrl?, name? }>` | Tokens the user just received in a confirmed tx but the upstream portfolio API hasn't re-indexed yet. Best-effort write by `assetChangesExtractor` after a tx's ERC-20 Transfer logs decode an inbound entry and before broadcasting the tx-history asset-change update; merged into the portfolio catalog (`loadPortfolioTokenCatalog`) like `customTokens` until the entry expires. Auto-expires per-entry after 5 min — lazy pruning inside `getRecentReceivedTokens`. | next |
| `coingeckoMarketCache` | `Record<coinId, { priceUsd, logoUrl?, fetchedAt }>`             | Shared CoinGecko market cache for native asset price + image lookups. Used by gas estimation and custom-chain native token resolution. | v2.3.0 |
| `coingeckoSearchCache` | `Record<query, { coins, fetchedAt }>`                            | Cached CoinGecko search responses for resolving unknown custom native assets to a coin ID. | v2.3.0 |
| `coingeckoNativeResolutionCache` | `Record<lookupKey, { coinId, fetchedAt }>`             | Maps custom native asset descriptors (`chainName/native name/symbol`) to a resolved CoinGecko coin ID to avoid repeated searches. | v2.3.0 |
| `coingeckoErc20PriceCache` | `Record<"chainId-address", { priceUsd, fetchedAt }>`         | Cached ERC-20 USD prices for custom tokens (CoinGecko `simple/token_price` first, GeckoTerminal fallback). Populates portfolio prices that the upstream portfolio API didn't return. 5-min TTL. | next     |
| `tokenInfo:{chainId}:{address}` | `{ data: { name, symbol, decimals }, fetchedAt }`        | Cached onchain ERC-20 metadata. Avoids 3-RPC roundtrip (`name` + `symbol` + `decimals`) every time we render a token amount. Symbol/decimals are immutable on chain; 30-day TTL is a safety net for occasional proxy-upgrade `name` changes. Written by `fetchTokenInfo` in `swapApi.ts`. | next |
| `tokenLogo:{chainId}:{address}` | `{ logoUrl: string, fetchedAt }`                          | Cached per-token logo URL (resolved from the swap token list once, then read directly from storage). Empty string = known-no-logo. Replaces the per-render `fetchSwapTokenList` payload (200KB+) for inline token logos — only the small URL crosses the popup ↔ background channel. 30-day TTL. Written by `getCachedTokenLogo` in `swapApi.ts`. The actual image bytes are cached separately in `ensAvatarImageCache` (shared with ENS avatars). | next |
| `ethShLabels:{chainId}:{address}` | `{ labels: string[], fetchedAt }`                       | Cached eth.sh contract labels (e.g. `["Permit2"]`, `["Uniswap V3 Router"]`). Empty array = known-no-labels (still cached to avoid re-hitting on every popup mount). Shared by six surfaces (tx + approve + signature + clear-signing + AddressParam + batch inline summary) via `getEthShLabels` in `lib/ethShLabelsCache.ts`, which also dedupes in-flight requests so a 5-call batch to the same spender makes one fetch instead of six. 7-day TTL. | next |
| `swapTokenList:{chainId}` | `{ tokens: SwapToken[], fetchedAt }`                              | Cached swap token list response for a chain. Pinning/extra token merge happens on read, so the cached upstream payload can stay raw. 1-day TTL. Written by `getCachedTokenList` in `swapApi.ts`. | next |
| `bungeeChains` | `{ chains: BungeeChain[], fetchedAt }` | Cached Bungee supported-chain list for bridge chain pickers and chain-logo fallbacks. 24-hour TTL. Written by `getCachedBungeeChains` in `bridgeApi.ts`; mirrored in memory by `lib/bungeeChainCache.ts`. | next |
| `bungeeTokens:{chainId}` | `{ tokens: BungeeToken[], fetchedAt }` | Cached Bungee token list for one chain. 24-hour TTL. Written by `getCachedBungeeTokens` in `bridgeApi.ts`; WCHAN is pinned on Base at read time, not stored as a migration requirement. | next |

### Local Settings

| Key               | Shape                       | Description                                                                                                      | Introduced |
| ----------------- | --------------------------- | ---------------------------------------------------------------------------------------------------------------- | ---------- |
| `selectedThemeId` | `"bauhaus" \| "midnight"`   | Active theme ID. Absent or invalid value falls back to `"bauhaus"` to preserve existing installs. Fresh installs initialize this key to `"midnight"` from `background.ts`/`onboarding.tsx`. Canonical store is `chrome.storage.local`; mirrored to `window.localStorage` for synchronous pre-React boot (no flash). See `_docs/THEMING_PRD.md`. | v3.2.0 |

These metadata/image cache keys are non-critical. Cache writes are best-effort
and may be skipped if `chrome.storage.local` rejects the write; callers still use
the live response. `storageCachePruner.ts` deletes expired `tokenInfo:*`,
`tokenLogo:*`, `ethShLabels:*`, `swapTokenList:*`, `cs:desc:*`, CoinGecko cache
entries, stale `portfolioHoldingsCache` entries, and old avatar image entries
so cache bloat does not block wallet state writes. Bridge/Bungee caches use
read-time 24-hour TTLs and are overwritten on the next successful fetch.

### Transient (dynamic keys)

| Key Pattern         | Shape                                                   | Description                                                                                                            |
| ------------------- | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `notification-{id}` | `string` (explorer URL) or `{ type, txId }`             | Notification click metadata. Created on tx completion, removed on click/dismiss.                                       |
| `txResult:{txId}`   | `{ result: { success, txHash?, error? }, timestamp }`   | Transaction result. Written by background on confirm/reject, read+deleted by content script. If `txId` is present in `walletConnectPendingRequests`, the background also sends the tx hash/error back over WalletConnect and removes the mapping. Stale keys cleaned >30m. |
| `sigResult:{sigId}` | `{ result: { success, signature?, error? }, timestamp }` | Signature result. Written by background on confirm/reject, read+deleted by content script. If `sigId` is present in `walletConnectPendingRequests`, the background also sends the signature/error back over WalletConnect and removes the mapping. Stale keys cleaned >30m. |
| `rpcResult:{id}`    | `{ result: { result?, error? }, timestamp }`             | RPC proxy result. Written by background after RPC call, read+deleted by content script. 30s timeout, stale keys cleaned >30m. |
| `addChainResult:{id}` | `{ result: { success, error?, rpcUrl?, chainName?, shouldSwitch? }, timestamp }` | `wallet_addEthereumChain` result. Written by background after accept/reject, read+deleted by content script. Stale keys cleaned >30m. |
| `watchAssetResult:{id}` | `{ result: { success, error? }, timestamp }` | `wallet_watchAsset` result. Written by background after accept/reject, read+deleted by content script. Stale keys cleaned >30m. |
| `batchTxAck:{bundleId}` | `{ result: { success, id?, error?, code? }, timestamp }` | Initial ERC-5792 `wallet_sendCalls` acknowledgement. Lets the dapp receive a bundle ID before final execution. Read+deleted by content script / WalletConnect adapter. Stale keys cleaned >30m. |
| `batchTxResult:{bundleId}` | `{ result: { success, id?, txHash?, txHashes?, error?, code? }, timestamp }` | ERC-5792 batch terminal/offchain result for content-script or WalletConnect callers. Read+deleted by the waiting caller. Stale keys cleaned >30m. |
| `capabilitiesResult:{id}` | `{ result: unknown, timestamp }` | `wallet_getCapabilities` result. Written by background, read+deleted by content script. Stale keys cleaned >30m. |
| `callsStatusResult:{id}` | `{ result: unknown, timestamp }` | `wallet_getCallsStatus` result. Written by background, read+deleted by content script. Stale keys cleaned >30m. |
| `fiProgress:{txId}` | `ForceInclusionState` | Force-inclusion progress state for a transaction. Stored while replacement/force-inclusion work is in flight, updated by background workers, and removed by wallet reset. |

### Clear Signing (ERC-7730)

| Key Pattern                              | Shape                                                  | Description                                                                                                          |
| ---------------------------------------- | ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| `cs:enabled`                             | `boolean`                                              | Master toggle for clear-signing descriptor fetching. Absent or `true` = enabled; `false` = opt-out, no network calls. |
| `cs:desc:{chainId}:{address}:{kind}:{selector\|format}` | `{ schemaVersion?: number; updatedAt: number; descriptor: Descriptor \| null }` | Per-format descriptor cache. Hits TTL 7d, misses TTL 1d. `kind` is `"calldata"` or `"eip712"`; the final segment is the calldata selector or a hash of the EIP-712 encoded type. `schemaVersion` (current: 3) auto-invalidates entries when the resolution pipeline changes — v2 added proxy fallback, and v3 made lookups selector / EIP-712 format-aware so one address can cache multiple registry descriptors. Descriptors reached via proxy resolution have the proxy address appended to their `context.contract.deployments` (or `context.eip712.deployments`) before caching, so `verifyDeployment` keeps working. See `_docs/CLEAR_SIGNING.md`. |

### ENS Browsing (`.eth` address-bar resolution)

| Key                | Shape                                                                                                                            | Description                                                                                                                                                                                                                                                                                              | Introduced |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| `ensBrowsing`      | `{ enabled?: boolean; useLocalGateway?: boolean; pinOnchainHtml?: boolean; gatewayHost?: string; gatewayPort?: number }`           | ENS browsing toggle bundle. Absent OR `enabled` undefined → hosted-gateway routing (eth.limo / w3eth.io) is ON. `useLocalGateway` (route IPFS/IPNS through local Kubo subdomain gateway) and `pinOnchainHtml` (pin ERC-4804 bodies to Kubo) default OFF. `gatewayHost`/`gatewayPort` default `localhost`/`8080`. Legacy keys `tier1`/`tier2aLocalIpfs`/`tier2bKubo` are read on first load and projected onto the new shape. | next       |
| `ensResolveCache`  | `Record<lowerEnsNameOrAddress, { ensName: string; kind: "ipfs" \| "ipns" \| "web3"; value: string; resolvedAt: number; contractAddress?: \`0x${string}\`; title?: string; favicon?: string }>` | ENS/address-keyed resolution cache. 1-hour TTL, 500-entry LRU on insert. Written by the SW resolver after a successful resolution, including raw `0x` ERC-4804 address-mode resolutions; read on the interstitial cache-check fast-path so repeat visits redirect synchronously and by `browse.html` to show cached dapp tiles. Optional title/favicon metadata is attached by gateway content scripts after page load.                                                                                       | next       |
| `ensBookmarks`     | `Record<lowerEnsNameOrAddressAndPath, { ensName: string; path: string; kind?: "ipfs" \| "ipns" \| "web3"; contractAddress?: \`0x${string}\`; title?: string; favicon?: string; addedAt: number }>` | User-pinned dapp3 favorites shown above recently cached dapps in `browse.html`. Written by the injected ENS banner star button and keyed by identity + path so different in-dapp pages can be pinned separately. Bookmark metadata is non-secret and comes from the current page title/favicon.                                                                                                      | next       |
| `ensWeb3UrlCache`  | `Record<lowerContractAddress, { contractAddress: string; contentHash: string; cid: string; bodyLen: number; lastAccess: number; ensName?: string }>` | Per-contract sha256 fingerprint + Kubo CID cache for ERC-4804 onchain HTML. Only written when Tier 2b is ON. LRU-evicted to a configurable budget (default 50 MB / 200 entries). Entries also have a mirrored MFS pin at `/dapp3/web3/{address}/{contentHash}` in Kubo for direct enumeration.            | next       |

---

## chrome.storage.sync

Syncs across Chrome profiles (if signed in). Persists across restarts.

### Core State

| Key               | Shape                                           | Description                                                                                     | Introduced |
| ----------------- | ----------------------------------------------- | ----------------------------------------------------------------------------------------------- | ---------- |
| `address`         | `string` (`0x...`)                              | Active wallet address. Written by popup on account switch, read by inject.ts for provider init. | v0.1.0     |
| `displayAddress`  | `string`                                        | Display-friendly name (ENS name, custom label, or raw address).                                 | v0.1.0     |
| `chainName`       | `string` (e.g. `"Base"`)                        | Currently selected network. Per-tab via inject.ts, global default via popup.                    | v0.1.0     |
| `networksInfo`    | `Record<string, { chainId, rpcUrl, hidden?, isCustom?, explorer?, nativeCurrency? }>` | Supported network runtime config. Built-ins are normalized from `chainRegistry`; this key stores RPC overrides, hidden flags, and user-added custom chains. Mutating writes are service-worker-owned via `networkStorage.ts`; `NetworksContext` mirrors storage changes and bootstraps missing defaults through `ensureNetworksInfo`. | v0.1.0     |
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
| `defaultGasTier`     | `"slow" \| "standard" \| "fast"` | User's last preset gas-tier choice from the tx-confirmation tier picker. Absent = default `"standard"`. The Custom tier is intentionally not persisted — it's always a one-shot opt-in for the current confirmation. | v3.4.0 |
| `swapSlippageBps`    | `number` (BPS, 1–10000) | User's last slippage tolerance in basis points (e.g. `500` = 5%). Absent = `DEFAULT_SLIPPAGE_BPS` (5%). Read once on SwapView mount; persisted on every SlippageSettings change so a user who tunes it down (or up) doesn't see it reset to 5% next session. | next |

---

## chrome.storage.session

Cleared when browser closes. NOT synced. Used only for session restoration when auto-lock is "Never".

| Key                        | Shape                        | Description                                                                                                                          | Introduced |
| -------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ---------- |
| `sessionId`                | `string` (UUID)              | Session identifier for tracking across service worker restarts.                                                                      | v1.0.0     |
| `sessionStartedAt`         | `number` (timestamp)         | When the session was established.                                                                                                    | v1.0.0     |
| `autoLockNever`            | `boolean`                    | Flag indicating this session uses "Never" auto-lock.                                                                                 | v1.0.0     |
| `encryptedSessionPassword` | `{ data, iv }` (base64)      | Password ciphertext and IV for session restoration after service worker restart. The AES key half lives in `chrome.storage.local.sessionEncKey`. Only set when auto-lock is "Never". On browsers without native `storage.session`, the shim stores this under `chrome.storage.local.__session__encryptedSessionPassword` and clears it on startup. | v1.0.0     |
| `passwordType`             | `"master" \| "agent"`        | Which password was used to unlock. Restored to maintain agent password access control guards after service worker restart.           | v1.3.0     |
| `tab:{tabId}`              | `TabContext` — `{ ensName, kind, value, path, search, hash, contractAddress?, resolvedAt }` | Per-tab ENS resolution context. Written by the SW after a successful `.eth` redirect, read by the banner content script via `chrome.runtime.sendMessage({ type: "get-tab-ctx" })` so it can render the original ENS identity on top of the gateway-served page. Cleaned up on `chrome.tabs.onRemoved`. | next       |

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

### v3.5.0 (Optimism added as built-in chain)

No new keys. Migration touches existing `networksInfo` and `chainName`.

Migration from any prior version:

- `migrateCustomOptimismChain()` in background.ts runs on `onInstalled` reason `update`
- Scans `networksInfo` for any entry with `chainId === 10` keyed under a name other than `"Optimism"`
- Rekeys it to `"Optimism"` preserving the user's `rpcUrl` and `hidden` flag (custom `explorer`/`nativeCurrency` overrides are dropped — registry defaults take over since they are universal for OP)
- If `chainName` (the global selected-chain key) pointed at the old custom name, rewrites it to `"Optimism"` so the user's active chain doesn't silently revert to the default
- Idempotent: short-circuits when no non-canonical chainId-10 entry is found

### next (WalletConnect bridge + portfolio token hiding)

New keys:

- `chrome.storage.local.walletConnectPendingRequests` (optional, additive)
- `chrome.storage.local.walletConnectChainId` (optional, additive)
- `chrome.storage.local.hiddenPortfolioTokens` (optional, additive)
- `chrome.storage.local.pendingBatchTxRequests` (optional pending ERC-5792 queue)
- `chrome.storage.local.pendingWatchAssetRequests` (optional pending watch-asset queue)
- `chrome.storage.local.pendingAddChainRequests` (optional pending add-chain queue)
- `chrome.storage.local.bundleStatuses` (optional ERC-5792 status cache)
- `chrome.storage.local.pendingBridges` (optional bridge settlement queue)
- `chrome.storage.local.customDelegates` (optional EIP-7702 UI mirror)
- `chrome.storage.local.recentlyReceivedTokens` (optional portfolio freshness overlay)
- `chrome.storage.local.portfolioHoldingsCache` (optional Holdings first-paint cache; absence refetches)
- `chrome.storage.local.sessionEncKey` (session-restore key half for "Never" auto-lock)
- `chrome.storage.local.swapTokenList:{chainId}` (optional cache; absence refetches)
- `chrome.storage.local.bungeeChains` and `bungeeTokens:{chainId}` (optional bridge metadata caches; absence refetches)
- Transient local prefixes: `addChainResult:`, `watchAssetResult:`, `batchTxAck:`,
  `batchTxResult:`, `capabilitiesResult:`, `callsStatusResult:`, and
  `fiProgress:`

Modified keys:

- `pendingTxRequests` and `pendingSignatureRequests` can include optional `walletConnect` display/response metadata.
- `encryptedSessionPassword` stores only `{ data, iv }`; the AES key half is
  stored separately in `chrome.storage.local.sessionEncKey`.
- `selectedThemeId` is canonical in `chrome.storage.local`, not sync storage.
- Non-critical metadata/image cache writes are best-effort and expired cache
  entries are actively pruned by `storageCachePruner.ts`.
- Chrome and Firefox manifests include `unlimitedStorage` to preserve headroom
  for wallet-critical persistent writes even when optional metadata caches grow.

Migration from any prior version:

- No migration required. Missing `walletConnectPendingRequests` resolves to an empty map, missing `walletConnectChainId` falls back to the current global chain or first visible chain, missing `hiddenPortfolioTokens` resolves to no hidden tokens, missing cache keys are lazily refetched, missing `portfolioHoldingsCache` just shows the normal skeleton while live portfolio data loads, legacy per-address hidden-token records are flattened lazily to the global list, and old pending request entries without `walletConnect` metadata follow the injected-provider result path unchanged.
