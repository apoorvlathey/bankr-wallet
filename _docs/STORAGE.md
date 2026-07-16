# Storage Key Reference

Complete reference of every `chrome.storage` key used by WalletChan. Consult this before any release that touches storage — see [PUBLISHING.md](./PUBLISHING.md) for the migration rules and pre-release checklist.

## Modifying Storage Safely

**CRITICAL**: Chrome extensions auto-update silently — users on ANY previous version will receive new code. Before adding, removing, renaming, or changing the shape of ANY `chrome.storage` key, you **MUST**:

1. Read this file in full — know every key, its shape, and which version introduced it.
2. Read [`PUBLISHING.md`](./PUBLISHING.md) — migration rules, how to write an idempotent migration, and the pre-release storage checklist.
3. Write an idempotent migration in the owning domain and register it through
   `background/composition/lifecycle.ts` / `background/lifecycle/installUpdate.ts`
   if old users would break without one. Never put migration logic in the
   `background.ts` entrypoint.
4. Update this file with any new/changed keys and their version.

Failure to do this **will brick the extension** for existing users (they get stuck in an onboarding loop or lose data).

### Audit checklist for any storage change

1. **Audit ALL read AND write paths** — grep for the storage key name (e.g. `encryptedApiKey`, `encryptedApiKeyVault`).
2. **Check every file** that touches the data — follow focused background routers,
   lifecycle composition, owning repositories, and any renderer settings that
   save directly. Common mistake: updating reads but missing a write path in a
   different domain.
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
are cleared by manual reset through the stable
`apps/extension/src/chrome/walletResetStorage.ts` facade over
`chrome/storage/resetManifest.ts`;
other app preferences persist until changed by the user. Non-critical metadata
and image caches are pruned through the stable
`apps/extension/src/chrome/storageCachePruner.ts` facade; pure policy lives in
`chrome/storage/cachePolicy.ts` and ordered effects in
`chrome/storage/cachePruner.ts`. It runs on service-worker startup and every 6
hours in addition to normal read-time TTL checks.

### Encryption & Vault Keys

| Key                       | Shape                               | Description                                                                                                                         | Introduced |
| ------------------------- | ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| `encryptedApiKey`         | `{ ciphertext, iv, salt }` (base64) | API key encrypted directly with password via PBKDF2 + AES-256-GCM. **Legacy format** — only writable before `encryptedVaultKeyMaster` exists; post-migration callers must use `encryptedApiKeyVault`. | v0.1.0     |
| `encryptedApiKeyVault`    | `{ ciphertext, iv }` (base64)       | API key encrypted with the vault key (no salt — key is raw). **Current format.**                                                    | v1.0.0     |
| `encryptedVaultKeyMaster` | `{ ciphertext, iv, salt }` (base64) | Vault key encrypted with the master password. Presence of this key means vault key system is active.                                | v1.0.0     |
| `encryptedVaultKeyAgent`  | `{ ciphertext, iv, salt }` (base64) | Vault key encrypted with the agent password. Only exists when agent password is enabled.                                            | v1.0.0     |
| `agentPasswordEnabled`    | `boolean`                           | Whether agent password is set up.                                                                                                   | v1.0.0     |
| `passkeyUnlock`           | V1: `{ version: 1, rpId: "extension", credentialId, prfSalt, wrappedVaultKey, createdAt, lastUsedAt? }`; V2: `{ version: 2, rpId: "extension", credentialId, prfSalt, wrappedVaultKey, wrappedMnemonicKey, mnemonicKeyId, createdAt, lastUsedAt? }`; or `null` | Optional local-only passkey/biometric wrappers. V1 wraps only the general vault key and remains readable for existing users. V2 derives purpose-separated `vault` / `mnemonic` wrapping keys from the WebAuthn PRF output and wraps both the general vault key and the dedicated mnemonic key. The master password and PRF output are never stored. Cleared only after verified removal, master-password rotation, or reset. | next       |
| `sessionEncKey`           | `string` (base64 32-byte AES key)   | Local half of "Never" auto-lock session restoration on browsers with native `chrome.storage.session`. Pairs with `encryptedSessionPassword`; removed on lock/session clear/reset and, after recovery proofs, before a passkey or agent-factor removal commit. Failure to remove this half preserves the factor. Never written by the compatibility fallback when the native API is absent. | v1.0.0     |

**Encryption chain (current):** password → PBKDF2 → decrypts `encryptedVaultKeyMaster` → general vault key → decrypts `encryptedApiKeyVault` and `pkVault`. V2 `mnemonicVault` uses a separate random mnemonic key: the master password wraps it in `mnemonicVault.masterWrappedKey`, while a V2 passkey wraps it independently in `passkeyUnlock.wrappedMnemonicKey`. Agent passwords and the general vault key cannot decrypt V2 recovery phrases. Seed-phrase reveal still requires explicit master-password verification, and agent sessions remain blocked from all mnemonic operations.

### Accounts

| Key             | Shape                                                          | Description                                                                                                                                                                                                                          | Introduced |
| --------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------- |
| `accounts`      | `Account[]` — `{ id, type, address, displayName?, createdAt }` | All account metadata. Types: `bankr`, `privateKey`, `seedPhrase`, `impersonator`. Array order is the user-defined display order used by the wallet account picker and dapp connection selector. Existing wallets keep their current array order; no migration is required. | v1.0.0     |
| `addressContacts` | `{ address: \`0x${string}\`; label: string }[]` | Optional local-only EVM contact book in exact user display order. Addresses are unique case-insensitively, labels are bounded to 64 characters, and absence/malformed entries resolve to an empty sanitized list. Additive; no migration required. | next |
| `seedGroups`    | `SeedGroup[]` — `{ id, name, createdAt, accountCount }`        | Metadata for imported BIP39 seed phrase groups.                                                                                                                                                                                      | v1.0.0     |
| `pkVault`       | `{ version: 1, entries: [{ id, keystore }] }`                  | Encrypted private keys. `id` matches account ID. Keystore is AES-256-GCM encrypted with vault key (`salt === ""`) or password (`salt !== ""`). `vault/recordCodec.ts` accepts only this released version, at most 10,000 entries, IDs of 1–512 characters, 12-byte IVs, bounded ciphertext, and either an empty or 16-byte salt. Structurally valid duplicate IDs remain read-compatible, but every mutation/save/migration preparation rejects them with zero writes. Migration to vault-key encryption happens on first master unlock (v1.3.0+); there is no key/schema migration here. `vault/repository.ts` owns IO and root `vaultCrypto.ts` remains a compatibility facade. | v1.0.0     |
| `mnemonicVault` | V1: `{ version: 1, entries: [{ id, keystore: { ciphertext, iv, salt } }] }`; V2: `{ version: 2, keyId, revision, masterWrappedKey, keyCheck?, entries: [{ id, keystore: { version: 2, scheme: "mnemonic-key", ciphertext, iv } }] }` | Encrypted seed phrases keyed by seed-group ID. V1 password-encrypted entries remain readable and are left unchanged for password-only users; the short-lived transitional V1 `salt === ""` shared-vault format is read-only compatible. V2 entries use a dedicated mnemonic key with per-group AES-GCM AAD. `keyCheck` is an authenticated fixed marker written by current V2 setup so independently wrapped keys can be matched even while `entries` is empty; it is optional only to read early pre-release V2 records. Passkey setup atomically converts V1 to V2 (even when empty), stores the master wrapper with the vault, and stores the independent passkey wrapper in `passkeyUnlock`. | v1.0.0; V2 next |

### Onboarding Initialization

| Key | Shape | Description | Introduced |
| --- | --- | --- | --- |
| `onboardingInitialization` | `{ version: 1, id: string, startedAt: number }` | Non-secret transaction marker for fresh-wallet setup. It is written before the first credential/account commit, binds every setup mutation to one onboarding surface, blocks a second live surface, and is removed only after the wallet is structurally complete. The owning surface may roll back an incomplete setup immediately; an abandoned marker becomes recoverable after 15 minutes. A complete wallet always wins over stale marker cleanup, so cleanup failure cannot erase committed keys. Missing on older installs is normal. Reset treats it as wallet-scoped state. | next |

### Transaction & Request State

| Key                        | Shape                                                                                    | Description                                                                | Introduced |
| -------------------------- | ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ---------- |
| `pendingTxRequests`        | `PendingTxRequest[]` — `{ id, tx, origin, favicon, chainName, timestamp, accountId?, accountAddress?, accountType?, bankrCredentialTag?, tabId?, frameId?, senderOrigin?, walletConnect? }` | Pending transaction requests awaiting user confirmation. No age-based expiry. New Bankr rows bind to a non-secret SHA-256 tag of the encrypted credential generation; old Bankr rows without it fail closed. | v0.1.0; tag next |
| `pendingSignatureRequests` | `PendingSignatureRequest[]` — `{ id, signature, origin, favicon, chainName, timestamp, accountId?, accountAddress?, accountType?, bankrCredentialTag?, tabId?, frameId?, senderOrigin?, walletConnect? }` | Pending signature requests awaiting user confirmation. No age-based expiry. Uses the same optional Bankr generation and exact transport binding as transactions. | v1.0.0; tag next |
| `pendingBatchTxRequests`   | `PendingBatchTxRequest[]` — `{ id, params, origin, favicon, chainName, chainId, timestamp, accountType?, accountId?, accountAddress?, bankrCredentialTag?, tabId?, frameId?, senderOrigin?, requestChainId?, walletConnect? }` | Pending ERC-5792 `wallet_sendCalls` bundle requests awaiting user confirmation. No age-based expiry. New entries pin account and transport; Bankr rows also pin the current encrypted-credential generation. Optional fields preserve storage compatibility, but missing security bindings fail closed at confirmation. | next |
| `pendingErc7715PermissionRequests` | `PendingErc7715PermissionRequest[]` — `{ id, origin, favicon, timestamp, chainName, chainId, request, permissionType, caveats, accountId, accountAddress, accountType, tabId?, frameId?, senderOrigin?, requestChainId? }` | Pending ERC-7715 `wallet_requestExecutionPermissions` prompts for WalletChan-supported permission types: native allowance, native periodic, native stream, ERC-20 allowance, ERC-20 periodic, ERC-20 stream, and token approval revocation. No age-based expiry. Entries are pinned to the local private-key/seed account selected at enqueue time; confirmation re-validates the pinned account and live EIP-7702 default delegate before signing. Injected and WalletConnect callers may provide the `id` used for `erc7715PermissionResult:{id}` so approval/rejection/explicit-invalidation can be delivered through storage instead of a long-lived MV3 response channel. `request.permission.justification?` may contain bounded site-provided display text; it is public metadata, not a caveat input. Additive; absence means no pending permission prompts. | next |
| `erc7715PermissionGrants` | `Erc7715PermissionGrant[]` — `{ id, origin, favicon, senderOrigin?, createdAt, expiresAt, status, revokedAt?, accountId, accountAddress, accountType, chainId, chainName, permissionType, request, response, caveats, delegation, typedData, contextHash }` | Active/history records for ERC-7715 approvals for WalletChan-supported permission types: native allowance, native periodic, native stream, ERC-20 allowance, ERC-20 periodic, ERC-20 stream, and token approval revocation. `response` is the ERC-7715 object returned to the dapp, including `context`, `dependencies`, and `delegationManager`; `request.permission.justification?` / `response.permission.justification?` may retain bounded public display text from the requesting site. `origin` is the authorization/listing scope; WalletConnect grants use `walletconnect:<topic>` here, while self-reported peer URL/name metadata may be stored as display-only `senderOrigin`. `delegation`/`typedData` preserve the WalletChan-constructed ERC-7710 delegation for audit/revoke flows. Active grant reads mark grants `status: "revoked"` with `revokedAt` if the EOA is no longer delegated to WalletChan's default DeleGator, `disabledDelegations(hash)` is already true, or a stored `NonceEnforcer` term no longer matches current onchain nonce; if RPC status cannot be verified, active reads fail closed instead of returning the grant. Successful onchain DelegationManager disable receipts also mark the grant revoked. `wallet_getGrantedExecutionPermissions` returns only non-expired active grants scoped to the requesting origin, active account, and chain. Additive; absence means no grants. | next |
| `pendingWatchAssetRequests` | `PendingWatchAssetRequest[]` — `{ id, asset, chainId, origin, favicon, timestamp }` | Pending `wallet_watchAsset` prompts. `asset` is `{ address, symbol, decimals, image? }`. No age-based expiry; survives popup close until accepted/rejected or explicit authorization invalidation. Result is written to `watchAssetResult:{id}`. | next |
| `pendingAddChainRequests`  | `PendingAddChainRequest[]` — `{ id, chainId, chainName?, nativeCurrency?, rpcUrls?, blockExplorerUrls?, origin, favicon, timestamp }` | Pending `wallet_addEthereumChain` prompts. No age-based expiry; survives popup close until accepted/rejected or explicit authorization invalidation. Result is written to `addChainResult:{id}`. | next |
| `dappPermissions` | `Record<canonicalOrigin, { origin, hostname, title?, favicon?, approvedAt, lastConnectedAt }>` | Persistent injected-provider account visibility grants. Exact trusted `http(s)` origin is derived from the Chrome message sender; title/favicon are bounded display-only metadata. A grant applies to whichever WalletChan account the site currently receives, so account switches do not require another connection prompt. Absence means the site receives `[]` from `eth_accounts`. | next |
| `pendingDappConnectionRequests` | `PendingDappConnectionRequest[]` — `{ id, origin, hostname, title?, favicon?, tabId?, frameId?, timestamp }` | Durable queue for unapproved top-level `eth_requestAccounts` calls. No age-based expiry. The content script waits on `dappConnectionResult:{id}` so the request survives MV3 service-worker restarts and popup lifecycle changes. | next |
| `walletConnectPendingRequests` | `Record<internalId, { id, kind, topic, requestId, method, timestamp, terminalResponse? }>` | Durable WalletConnect request claims, deferred routes, and response outbox. `kind` is `"claim"`, `"transaction"`, `"signature"`, or `"erc7715Permission"`; `terminalResponse` is the first committed JSON-RPC result/error plus timestamp. `(topic, requestId)` is claimed atomically before work starts, so a relay replay cannot enqueue or sign twice. Pre-prompt claims expire after 2 minutes; unresolved prompt routes do not age-expire; already-terminal response routes are pruned after 30 minutes if delivery/session cleanup did not remove them first. A terminal route is normally removed only after relay delivery succeeds or WalletKit confirms the session ended. Additive; older route-only records remain readable and absence means no in-flight WC requests. | next |
| `walletConnectChainId` | `number` | WalletConnect-specific active EVM chain ID. Updated by the WalletConnect screen's chain selector, explicit WC `wallet_switchEthereumChain` requests, and inferred `args.params.chainId` changes from WC requests. Separate from `chrome.storage.sync.chainName` so injected dapps keep their existing per-tab chain behavior. Absence falls back to the current global `chainName` or the first visible chain for the active account type. | next |
| `walletConnectStorageNamespace` | `"wallet-reset-<uuid>"` | WalletConnect SDK storage identity selected after a wallet reset. Absence deliberately keeps an existing install on the legacy unprefixed SDK store. Reset tears down/purges the old SDK state and writes a fresh namespace **before** wallet data is cleared, so a replacement wallet cannot inherit old sessions or pairings. A present malformed value fails closed instead of falling back to the legacy identity. This key is rotated, not removed, by reset. | next |
| `sponsoredTransferIntents` | `SponsoredTransferIntentRecord[]` (max 20) — `{ version: 1, id, txId, accountId, accountAddress, accountType, to, value, amount, createdAt, validBefore, state: prepared \| submitting \| ambiguous \| submitted \| consumed, encryptedPayload, attempts, lastError?, txHash? }` | Recovery records for Base USDC ERC-3009 sponsored transfers. `encryptedPayload` contains the exact signed authorization (including nonce/signature) encrypted with the general vault key; the remaining fields are bounded routing/display metadata. Ambiguous records are not re-submitted or pruned by local wall time: two fixed Base RPCs must agree on the nonce state at exact finalized blocks. Submitted/consumed records remain semantic dedupe markers until the trusted UI acknowledges the stored intent ID. Malformed storage fails closed, and account removal/reset is blocked while any record remains. Absence means no transfer is awaiting recovery or acknowledgment. | next |
| `crossDappBatch`           | `CrossDappBatch \| null` — `{ fromAddress, chainId, chainName, accountType, entries: [{ txId, tx, origin, favicon, addedAt, source?, accountType?, bankrCredentialTag?, transport provenance... }], createdAt }` | Single user-assembled cross-dapp batch. Locked to the first entry's pinned account/from/chain. Entries copy transport provenance and Bankr credential-generation binding before source pending rows are removed; legacy Bankr entries missing the tag fail closed. ERC-5792 siblings remain grouped for terminal status fan-out. | v2.4.0; bindings next |
| `bundleStatuses`           | `BundleStatus[]` — `{ id, chainId, status, atomic, txHash?, txHashes?, receipts?, createdAt, completedAt?, error?, origin?, walletConnect?, splitMode?, splitCalls?, splitNextIndex?, splitContext? }` | ERC-5792 `wallet_getCallsStatus` lifecycle state. Retained up to 100 entries and pruned after 24h. WalletConnect-created bundles pin `{ topic, requestId, method }`; split-mode fields track manually split non-atomic batches and the pinned context used to enqueue each single-tx confirmation. | next |
| `txHistory`                | `CompletedTransaction[]` — `{ id, status, tx, origin, chainName, chainId, txHash, ..., broadcastUncertain?, clearSignedMeta?, batchCallOrigins?, bridge?, assetChanges?, destAssetChanges? }` | Completed transaction history. Max 50 entries. `broadcastUncertain` is an optional additive marker for a locally signed transaction whose deterministic hash is known but whose raw-send response was lost; receipt polling retains it as pending instead of declaring it dropped until an RPC observes the hash, then clears the marker. Old rows omit it and keep the existing dropped-transaction behavior. `clearSignedMeta` (optional, added v3.7.1) snapshots the clear-signed summary at submission time — `{ kind: "approve"\|"transfer"\|"nativeSend"\|"erc7730", amount?, tokenSymbol?, tokenLogo?, tokenAddress?, isInfinite?, counterparty?, counterpartyLabel?, counterpartyEns?, intent?, contractName? }` — so the Activity tab can render "Approved 100 USDC to Uniswap V3 Router" without re-running RPC / eth.sh / ENS lookups on every render. Old entries lacking the field gracefully fall back to the raw `functionName` row. `batchCallOrigins` (optional, additive) is written for cross-dapp batch history entries — one `{ origin, favicon }` per encoded call — so the decoded batch-call list in TxDetailModal can show each contributing dapp instead of the synthetic "Cross-Dapp Batch" origin. Old entries without it fall back to the batch-level `origin/favicon`. `bridge` (optional, additive) marks a cross-chain bridge tx — `{ sourceChainId, sourceTxHash?, destinationChainId, destinationChainName, destinationTxHash?, bungeeStatusCode?, requestHash?, routeName?, receiverAddress?, refundTxHash? }`. Set at submission time on the bridge call entry; `requestHash` now stores Socket's `quoteId` for status lookup, and destination fields fill in as `bridgeStatusPoller` reads Socket `/v3/swap/status`. Old entries without it simply render as plain swaps. `assetChanges` (optional, additive) is the post-confirm snapshot of ERC-20 + native flows for the sender — `{ blockNumber, nativeDelta?, erc20Transfers: [{ token, direction: "in"\|"out", counterparty, amountWei, symbol?, decimals?, logoUrl? }] }` — written by `assetChangesExtractor` from receipt logs + `eth_getBalance` so the Activity modal can render "what actually flowed in/out of my wallet". `destAssetChanges` (same shape) is the bridge-destination leg, populated after `bridge.destinationTxHash` arrives. Failed and pre-existing entries simply lack these fields. | v1.0.0; ambiguity marker next |
| `pendingBridges`           | `Record<sourceTxHash, PendingBridge>` — `{ txId, sourceTxHash, sourceChainId, destinationChainId, destinationChainName, receiverAddress, createdAt, requestHash?, bungeeStatusCode?, lastPolledAt?, routeName? }` | Cross-chain bridge requests waiting on destination-chain settlement. Written by `maybeStartBridgePolling` after the source tx confirms; `requestHash` is the Socket quoteId when available. Entries are removed once `bridge/statusApplication.ts` sees a terminal mapped status code (`FULFILLED` / `SETTLED` / `EXPIRED` / `CANCELLED` / `REFUNDED`). Resumed on `runtime.onStartup` so a long-running bridge eventually fires its notification even if the service worker dies mid-poll. Auto-pruned at startup if older than 1h with no terminal state. | next     |

ERC-7715 onchain revoke txs add optional `erc7715PermissionRevokeMeta` to
`pendingTxRequests` and `txHistory`. Shape:
`{ grantId, origin?, favicon?, permissionType?, delegate?, tokenAddress?,
amount?, periodDuration?, expiresAt?, approvalRevocationMethods? }`. `grantId` is the receipt-poller key
used to mark the grant locally revoked only after
`disableDelegation(delegation)` succeeds; the other fields are public display
snapshots so the transaction confirmation can render the revoke in human terms
without re-reading the reusable signed delegation context.

### Chat & Portfolio

| Key                  | Shape                                                              | Description                                                                  | Introduced |
| -------------------- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------- | ---------- |
| `chatHistory`        | `Conversation[]` — `{ id, title, messages, createdAt, updatedAt }` | Chat conversations with Bankr AI. Max 50 conversations, 100 messages each.   | v0.2.0     |
| `portfolioSnapshotsV2` | `Record<address, HoldingsSnapshot[]>`                              | Portfolio value snapshots per address. 1-hour min interval, 8-day retention. Replaces and purge-removes aggregate-only `portfolioSnapshots` records that may contain Tempo's native-balance sentinel. | next     |
| `portfolioHoldingsCache` | `{ version: 2, entries: Record<"address|visible-chain-key", { tokens, defiPositions, totalValueUsd, customTokenKeys, allTokenKeys, hiddenTokenKeys, onchainFetchedTokenKeys, rpcIssueChainIds, apiUnavailable, timestamp }> }` | Best-effort local cache of the last rendered Holdings snapshot. V2 invalidates sentinel-era V1 data. `TokenHoldings` hydrates from this reset-aware `chrome.storage.local` key before live portfolio API/RPC revalidation. Entries are keyed by wallet address plus the visible-chain reload key, capped to 12 entries, and TTL-pruned after 24 hours by `storage/cachePruner.ts` through the stable root facade. Older renderer `window.localStorage` mirrors (`walletchan:portfolioHoldingsCache:v1`) are purge-only and never rehydrated, so a replacement wallet cannot inherit prior addresses, balances, or token imagery. Additive; absence or invalid data simply refetches live portfolio data. | next |
| `hiddenPortfolioTokens` | `HiddenPortfolioToken[]` — `HiddenPortfolioToken` is `{ chainId, contractAddress, symbol?, name?, logoUrl?, hiddenAt }` | Global list of ERC-20 tokens hidden from Holdings across all wallet addresses. `loadPortfolioTokenCatalog` filters these before totals are calculated, so current value and newly-written snapshots exclude hidden tokens. Add Token / wallet_watchAsset remove the matching hidden entry globally. Additive; absence means no hidden tokens. Older per-address development records are flattened lazily. | next |
| `ensIdentityCache`   | `Record<address, { name, avatar, resolvedAt, needsAvatar? }>`       | Resolved ENS/Basename/WNS/GNS/Mega names and avatars. 6-hour cache. `needsAvatar` marks a forward-resolved contact-name hint whose reverse lookup can be skipped while its avatar is batch-fetched. | v1.0.0     |
| `ensAvatarImageCache` | `Record<url, { dataUrl, sizeBytes, cachedAt, lastAccessedAt }>`   | Avatar/token-logo image bytes re-encoded to WebP (via `createImageBitmap` + `OffscreenCanvas`, background-only) and stored as data URLs by `avatar/repository.ts` behind the stable `avatarImageCache.ts` facade. The exact key/schema remains unchanged. Locked best-effort writes are keyed by source URL, use a 14-day TTL, and LRU-prune to 200 entries / 5 MB; `storage/cachePruner.ts` also compacts periodically. Re-encoding strips SVG scripts/metadata so cached bytes are guaranteed raster pixels. This reset-aware key is the sole renderer source; older `walletchan:imageCacheMirror:v1` DOM-localStorage mirrors are purged and never read. Persisted entries are revalidated before reuse, and wallet reset/fresh onboarding abort and epoch-invalidate old work; a cache write that crosses the reset epoch removes its stale entry. | v3.3.0 |
| `customTokens`       | `CustomToken[]` — `{ contractAddress, chainId, symbol, name, decimals, image?, addedAt }` | User-added and `wallet_watchAsset` ERC-20 tokens for portfolio tracking. Addresses are lowercase and identity is chain-plus-address; optional `image` is the dapp-provided logo. The exact array is owned by `tokens/customTokenStorage.ts` under the `local:customTokens` mutation lock; root `customTokenStorage.ts` is a compatibility facade. Merged into holdings on each load and skipped if the API already returns the token. | v2.2.0 |
| `customDelegates`    | `Record<accountId, Record<chainId, "0x...">>` | Per-account × per-chain EIP-7702 custom-delegate mirror owned by `delegation/storage.ts` (stable `delegationStorage.ts` facade). Addresses are stored lowercase and every exact-shape read-modify-write is serialized by `local:customDelegates`. Runtime batch resolution trusts `eth_getCode(EOA)` and the default-delegate registry, not this storage key. Reconciled from chain after Set/Revoke receipts, cleared automatically on account removal and when the onchain delegate is revoked/default. See [`7702.md`](./7702.md). | next |
| `networkRpcUrls` | `Record<decimalChainId, Array<{ url: string, name?: string }>>` | Optional Settings-only RPC history owned by `network/rpcHistoryRepository.ts`. Each chain retains at most 10 URL-deduplicated HTTP(S) endpoints with optional 64-character display names; the active URL is kept first but remains authoritative only in `chrome.storage.sync.networksInfo[*].rpcUrl`. At most 100 chain records are accepted. Service-worker writes apply the same URL/security validation as active RPC configuration. Released `string[]` records decode without migration and are rewritten as endpoint objects only after a successful edit. Missing history falls back to the active URL. Wallet reset removes this wallet-scoped preference. | next |
| `recentlyReceivedTokens` | `Record<"chainId-address", { chainId, contractAddress, addedAt, symbol?, decimals?, logoUrl?, name? }>` | Tokens the user just received in a confirmed tx but the upstream portfolio API hasn't re-indexed yet. Best-effort write by `assetChangesExtractor` after a tx's ERC-20 Transfer logs decode an inbound entry and before broadcasting the tx-history asset-change update; merged into the portfolio catalog (`loadPortfolioTokenCatalog`) like `customTokens` until the entry expires. Auto-expires per-entry after 5 min — lazy pruning inside `getRecentReceivedTokens`. | next |
| `coingeckoMarketCache` | `Record<coinId, { priceUsd, logoUrl?, fetchedAt }>`             | Shared CoinGecko market cache for native asset price + image lookups. Used by gas estimation and custom-chain native token resolution. | v2.3.0 |
| `coingeckoSearchCache` | `Record<query, { coins, fetchedAt }>`                            | Cached CoinGecko search responses for resolving unknown custom native assets to a coin ID. | v2.3.0 |
| `coingeckoNativeResolutionCache` | `Record<lookupKey, { coinId, fetchedAt }>`             | Maps custom native asset descriptors (`chainName/native name/symbol`) to a resolved CoinGecko coin ID to avoid repeated searches. | v2.3.0 |
| `coingeckoErc20PriceCache` | `Record<"chainId-address", { priceUsd, fetchedAt }>`         | Cached ERC-20 USD prices for custom tokens (CoinGecko `simple/token_price` first, GeckoTerminal fallback). Populates portfolio prices that the upstream portfolio API didn't return. 5-min TTL. | next     |
| `tokenInfo:{chainId}:{address}` | `{ data: { name, symbol, decimals }, fetchedAt }`        | Cached onchain ERC-20 metadata. Avoids 3-RPC roundtrip (`name` + `symbol` + `decimals`) every time we render a token amount. Symbol/decimals are immutable on chain; 30-day TTL is a safety net for occasional proxy-upgrade `name` changes. Written by `fetchTokenInfo` in `swap/tokenInfo.ts`; root `swapApi.ts` is a compatibility facade. | next |
| `tokenLogo:{chainId}:{address}` | `{ logoUrl: string, fetchedAt }`                          | Cached per-token logo URL (resolved from the swap token list once, then read directly from storage). Empty string = known-no-logo. Replaces the per-render `fetchSwapTokenList` payload (200KB+) for inline token logos — only the small URL crosses the popup ↔ background channel. 30-day TTL. Written by `getCachedTokenLogo` in `swap/tokenLogo.ts`. The actual image bytes are cached separately in `ensAvatarImageCache` (shared with ENS avatars). | next |
| `ethShLabels:{chainId}:{address}` | `{ labels: string[], fetchedAt }`                       | Cached eth.sh contract labels (e.g. `["Permit2"]`, `["Uniswap V3 Router"]`). Empty array = known-no-labels (still cached to avoid re-hitting on every popup mount). Shared by six surfaces (tx + approve + signature + clear-signing + AddressParam + batch inline summary) via `getEthShLabels` in `lib/ethShLabelsCache.ts`, which also dedupes in-flight requests so a 5-call batch to the same spender makes one fetch instead of six. 7-day TTL. | next |
| `swapTokenList:{chainId}` | `{ tokens: SwapToken[], fetchedAt }`                              | Cached swap token list response for a chain. Pinning/extra token merge happens on read, so the cached upstream payload can stay raw. 1-day TTL. Written by `getCachedTokenList` in `swap/tokenList.ts`; root `swapApi.ts` is a compatibility facade. | next |
| `bungeeChains` | `{ chains: BungeeChain[], fetchedAt }` | Cached Bungee supported-chain list for bridge chain pickers and chain-logo fallbacks. 24-hour TTL. Written by `getCachedBungeeChains` in `bridge/catalogCache.ts` through the stable `bridgeApi.ts` facade; mirrored in memory by `lib/bungeeChainCache.ts`. | next |
| `bungeeTokens:{chainId}` | `{ tokens: BungeeToken[], fetchedAt }` | Cached Bungee token list for one chain. 24-hour TTL. Written by `getCachedBungeeTokens` in `bridge/catalogCache.ts` through the stable `bridgeApi.ts` facade; WCHAN is pinned on Base at read time, not stored as a migration requirement. | next |

### Local Settings

| Key               | Shape                       | Description                                                                                                      | Introduced |
| ----------------- | --------------------------- | ---------------------------------------------------------------------------------------------------------------- | ---------- |
| `selectedThemeId` | `"bauhaus" \| "midnight"`   | Active theme ID. Absent or invalid value falls back to `"bauhaus"` to preserve existing installs. Fresh installs initialize this key to `"midnight"` through `background/lifecycle/installUpdate.ts`; renderer theme selection writes the same canonical local key. Mirrored to `window.localStorage` for synchronous pre-React boot (no flash). See `_docs/THEMING_PRD.md`. | v3.2.0 |
| `soundsEnabled` | `boolean` | Global interaction-sound preference used by every extension renderer. Absent or invalid values default to `true`; Settings → Sounds writes the canonical local value and open views update through `chrome.storage.onChanged`. Additive and non-critical, so no migration is required. | next |

These metadata/image cache keys are non-critical. Cache writes are best-effort
and may be skipped if `chrome.storage.local` rejects the write; callers still use
the live response. `storage/cachePruner.ts` deletes expired `tokenInfo:*`,
`tokenLogo:*`, `ethShLabels:*`, `swapTokenList:*`, `cs:desc:*`, CoinGecko cache
entries, stale `portfolioHoldingsCache` entries, and old avatar image entries
so cache bloat does not block wallet state writes. Bridge/Bungee caches use
read-time 24-hour TTLs and are overwritten on the next successful fetch.

### Transient (dynamic keys)

| Key Pattern         | Shape                                                   | Description                                                                                                            |
| ------------------- | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `notification-{id}` | `string` (explorer URL) or `{ type, txId }`             | Notification click metadata. Created on tx completion, removed on click/dismiss.                                       |
| `txResult:{txId}`   | `{ result: { success, txHash?, error? }, timestamp }`   | Transaction result. Written by background on confirm/reject, read+deleted by content script. A matching WalletConnect route first commits the terminal JSON-RPC result/error to `walletConnectPendingRequests`, then attempts relay delivery; relay failure retains that outbox entry for safe replay without another broadcast. Stale keys cleaned >30m. |
| `sigResult:{sigId}` | `{ result: { success, signature?, error? }, timestamp }` | Signature result. Written by background on confirm/reject, read+deleted by content script. A matching WalletConnect route uses the same persist-before-delivery outbox rule so a relay retry cannot trigger another signature. Stale keys cleaned >30m. |
| `rpcResult:{id}`    | `{ result: { result?, error? }, timestamp }`             | RPC proxy result. Written by background after RPC call, read+deleted by content script. 30s timeout, stale keys cleaned >30m. |
| `addChainResult:{id}` | `{ result: { success, error?, rpcUrl?, chainName?, shouldSwitch? }, timestamp }` | `wallet_addEthereumChain` result. Written by background after accept/reject, read+deleted by content script. Stale keys cleaned >30m. |
| `watchAssetResult:{id}` | `{ result: { success, error? }, timestamp }` | `wallet_watchAsset` result. Written by background after accept/reject, read+deleted by content script. Stale keys cleaned >30m. |
| `erc7715PermissionResult:{id}` | `{ result: { success, result?, error? }, timestamp }` | ERC-7715 permission approval result. Written by background after grant/reject/timeout. Injected requests read+delete it from the content script; WalletConnect requests commit it to the terminal response outbox before relay delivery. Stale keys are reset with wallet state. |
| `dappConnectionResult:{id}` | `{ result: { success, accounts?, error?, code? }, timestamp }` | Result bridge for injected `eth_requestAccounts`. Approval returns the current account for the requesting tab; rejection uses EIP-1193 code `4001`. The content script consumes and removes the result. |
| `batchTxAck:{bundleId}` | `{ result: { success, id?, error?, code? }, timestamp }` | Initial ERC-5792 `wallet_sendCalls` acknowledgement. Lets the dapp receive a bundle ID before final execution. Read+deleted by content script / WalletConnect adapter. Stale keys cleaned >30m. |
| `batchTxResult:{bundleId}` | `{ result: { success, id?, txHash?, txHashes?, error?, code? }, timestamp }` | ERC-5792 batch terminal/offchain result for content-script or WalletConnect callers. Read+deleted by the waiting caller. Stale keys cleaned >30m. |
| `capabilitiesResult:{id}` | `{ result: unknown, timestamp }` | `wallet_getCapabilities` result. Written by background, read+deleted by content script. Stale keys cleaned >30m. |
| `callsStatusResult:{id}` | `{ result: unknown, timestamp }` | `wallet_getCallsStatus` result. Written by background, read+deleted by content script. Stale keys cleaned >30m. |
| `fiProgress:{txId}` | `ForceInclusionState` | Force-inclusion progress state for a transaction. Stored while replacement/force-inclusion work is in flight, updated by background workers, and removed by wallet reset. |

### Clear Signing (ERC-7730)

| Key Pattern                              | Shape                                                  | Description                                                                                                          |
| ---------------------------------------- | ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| `cs:enabled`                             | `boolean`                                              | Master toggle owned by `clearSigning/settings.ts`. Absent or `true` = enabled; `false` = opt-out, no descriptor cache/network work and a purge of `cs:desc:*`. |
| `cs:desc:{chainId}:{address}:{kind}:{selector\|format}` | `{ schemaVersion?: number; updatedAt: number; descriptor: Descriptor \| null }` | Per-format cache owned by `clearSigning/descriptorCache.ts`. Hits TTL 7d, misses TTL 1d. `kind` is `"calldata"` or `"eip712"`; the final segment is the calldata selector or a length + hash of the EIP-712 encoded type. `schemaVersion` (current: 3) invalidates older entries. Proxy resolution clones the implementation descriptor and appends the proxy to `context.contract.deployments` or `context.eip712.deployments` before caching, so deployment verification keeps working. See `_docs/CLEAR_SIGNING.md`. |

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
| `address`         | `string` (`0x...`)                              | Legacy compatibility and new-tab default mirror. Provider/account authorization uses the sender-bound `tabAccounts` entry instead. | v0.1.0     |
| `displayAddress`  | `string`                                        | Display-friendly compatibility/default mirror for `address`; not authoritative for established tabs. | v0.1.0     |
| `chainName`       | `string` (e.g. `"Base"`)                        | Currently selected network. Per-tab via inject.ts, global default via popup.                    | v0.1.0     |
| `networksInfo`    | `Record<string, { chainId, rpcUrl, hidden?, isCustom?, explorer?, nativeCurrency? }>` | Supported network runtime config. `rpcUrl` is the sole active endpoint read by runtime consumers. Built-ins are normalized from `chainRegistry`; this key also stores hidden flags and user-added custom chains. `network/networkRepository.ts` owns the exact storage shape and `network/networkMutations.ts` owns service-worker writes; `NetworksContext` mirrors storage changes and bootstraps missing defaults through `ensureNetworksInfo`. | v0.1.0 |
| `activeAccountId` | `string` (UUID)                                 | Shared fallback for tabs without a connected dapp and compatibility paths without tab context. Activating or selecting an account in a connected dapp tab updates it to that scoped account without changing other dapp-tab overrides. | v1.0.0     |
| `tabAccounts`     | `Record<number, string>` (tabId → accountId)    | Per-tab account binding only for approved or pending dapp connections. Snapshotted on first scoped use and cleared on ordinary navigation, rejection, disconnect, tab close, or account removal. | v1.0.0     |

### Settings

| Key                  | Shape         | Description                                                                                             | Introduced |
| -------------------- | ------------- | ------------------------------------------------------------------------------------------------------- | ---------- |
| `autoLockTimeout`    | `number` (ms)               | Auto-lock timeout owned by `session/autoLockPolicy.ts` and applied by `session/timeoutTransitions.ts`. Values: 0, 60000, 300000, 900000, 1800000, 3600000, 14400000. Missing or invalid values resolve/migrate to the finite 15-minute default (`900000`); `0` is preserved only as an explicit Never choice. | v1.0.0; default hardened next |
| `sidePanelMode`      | `boolean`                   | Active popup-versus-sidepanel preference owned by `windowing/`; missing reads as enabled only when support is available, while startup activates the panel only after an explicit `true`. | v0.2.0     |
| `sidePanelVerified`  | `boolean`                   | Released legacy field retained in reset/migration manifests for compatibility. Runtime windowing no longer reads or writes it; do not reinterpret or delete it without a separate migration review. | v0.2.0     |
| `isArcBrowser`       | `boolean`                   | Stored UI-detected Arc flag read by `windowing/`; disables sidepanel without deleting the user's mode preference. | v0.2.0     |
| `hidePortfolioValue` | `boolean`                   | User preference to hide USD values in portfolio.                                                        | v1.0.0     |
| `unifyPortfolioBalances` | `boolean`               | Default-on preference controlling whether canonical ETH, USDC, and USDT balances are grouped across networks in Holdings. Missing or malformed values resolve to `true`. | next |
| `defaultGasTier`     | `"slow" \| "standard" \| "fast"` | User's last preset gas-tier choice from the tx-confirmation tier picker. Absent = default `"standard"`. The Custom tier is intentionally not persisted — it's always a one-shot opt-in for the current confirmation. | v3.4.0 |
| `swapSlippageBps`    | `number` (BPS, 1–10000) | User's last slippage tolerance in basis points (e.g. `500` = 5%). Absent = `DEFAULT_SLIPPAGE_BPS` (5%). Read once on SwapView mount; persisted on every SlippageSettings change so a user who tunes it down (or up) doesn't see it reset to 5% next session. | next |

---

## chrome.storage.session

Native storage is memory-backed, cleared when the browser closes, and never
synced. Supported Chrome and Firefox builds use the native API. The
compatibility fallback for browsers/forks without it uses prefixed local keys
only for non-secret session metadata/context and clears them on startup;
password restoration is disabled without the native API.

| Key                        | Shape                        | Description                                                                                                                          | Introduced |
| -------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ---------- |
| `sessionId`                | `string` (UUID)              | Session identifier for tracking across service worker restarts.                                                                      | v1.0.0     |
| `sessionStartedAt`         | `number` (timestamp)         | When the session was established.                                                                                                    | v1.0.0     |
| `autoLockNever`            | `boolean`                    | Flag indicating this session uses "Never" auto-lock.                                                                                 | v1.0.0     |
| `encryptedSessionPassword` | `{ data, iv }` (base64)      | Password ciphertext and IV for session restoration after service worker restart. The AES key half lives in `chrome.storage.local.sessionEncKey`. Only set when auto-lock is "Never" **and native `chrome.storage.session` exists**. The non-native fallback never persists this secret; updated workers remove fallback artifacts left by older builds, including after a browser upgrade gains native session storage, without deleting a valid current native session. | v1.0.0     |
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

- `accounts` array created from legacy `address` by the serialized
  `migrateFromLegacyStorage()` in `accounts/legacyMigration.ts`. The update and UI
  fallback paths share one operation lock; stale or missing active-ID mirrors from older
  builds are repaired to the first intact account.
- `encryptedApiKey` → vault key system migrated on first unlock by `authHandlers.ts`

### v1.3.0 (agent password transaction signing, password type persistence)

New keys:

- `chrome.storage.session.passwordType` (optional)

Modified keys (dual-format support):

- `pkVault` entries now support vault-key encryption (`salt === ""`) in addition to password encryption (`salt !== ""`)

Migration from v1.0.0+:

- Private keys migrated from password encryption to vault-key encryption on
  first unlock with master password. At v1.3.0, seed phrases remained
  master-password encrypted; current code retains that V1 read path and also
  supports the V2 dedicated-mnemonic-key format documented above.
- Migration is idempotent and checks format before re-encrypting
- Both formats continue to work (backward compatible)
- Agent password can sign transactions after migration completes

### v3.5.0 (Optimism added as built-in chain)

No new keys. Migration touches existing `networksInfo` and `chainName`.

Migration from any prior version:

- `migrateCustomOptimismChain()` in `background/lifecycle/installUpdate.ts`
  runs from lifecycle composition on `onInstalled` reason `update`
- Scans `networksInfo` for any entry with `chainId === 10` keyed under a name other than `"Optimism"`
- Rekeys it to `"Optimism"` preserving the user's `rpcUrl` and `hidden` flag (custom `explorer`/`nativeCurrency` overrides are dropped — registry defaults take over since they are universal for OP)
- If `chainName` (the global selected-chain key) pointed at the old custom name, rewrites it to `"Optimism"` so the user's active chain doesn't silently revert to the default
- Idempotent: short-circuits when no non-canonical chainId-10 entry is found

### next (WalletConnect bridge + portfolio token hiding)

New keys:

- `chrome.storage.local.addressContacts` (optional local-only EVM address/label list; absence is an empty contact book)
- `chrome.storage.local.onboardingInitialization` (temporary, non-secret
  fresh-wallet setup transaction marker; absence is the normal idle state)
- `chrome.storage.local.walletConnectPendingRequests` (optional, additive)
- `chrome.storage.local.walletConnectChainId` (optional, additive)
- `chrome.storage.local.walletConnectStorageNamespace` (optional SDK identity
  epoch; absent preserves the legacy unprefixed store until wallet reset)
- `chrome.storage.local.sponsoredTransferIntents` (optional, bounded,
  vault-encrypted ERC-3009 retry state)
- `chrome.storage.local.hiddenPortfolioTokens` (optional, additive)
- `chrome.storage.local.pendingBatchTxRequests` (optional pending ERC-5792 queue)
- `chrome.storage.local.pendingWatchAssetRequests` (optional pending watch-asset queue)
- `chrome.storage.local.pendingAddChainRequests` (optional pending add-chain queue)
- `chrome.storage.local.pendingErc7715PermissionRequests` (optional pending ERC-7715 permission queue)
- `chrome.storage.local.erc7715PermissionGrants` (optional ERC-7715 grant records)
- `chrome.storage.local.bundleStatuses` (optional ERC-5792 status cache)
- `chrome.storage.local.pendingBridges` (optional bridge settlement queue)
- `chrome.storage.local.customDelegates` (optional EIP-7702 UI mirror)
- `chrome.storage.local.networkRpcUrls` (optional bounded Settings-only RPC history)
- `chrome.storage.local.recentlyReceivedTokens` (optional portfolio freshness overlay)
- `chrome.storage.local.portfolioHoldingsCache` (optional Holdings first-paint cache; absence refetches)
- `chrome.storage.local.sessionEncKey` (session-restore key half for "Never" auto-lock)
- `chrome.storage.local.passkeyUnlock` (optional local WebAuthn PRF wrappers; absence means biometric unlock is disabled)
- `chrome.storage.local.swapTokenList:{chainId}` (optional cache; absence refetches)
- `chrome.storage.local.bungeeChains` and `bungeeTokens:{chainId}` (optional bridge metadata caches; absence refetches)
- Transient local prefixes: `addChainResult:`, `watchAssetResult:`, `batchTxAck:`,
  `batchTxResult:`, `capabilitiesResult:`, `callsStatusResult:`, and
  `erc7715PermissionResult:`
- Transient local key: `fiProgress:{txId}`

Modified keys:

- `pendingTxRequests`, `pendingSignatureRequests`, and
  `pendingBatchTxRequests` can include exact injected/WalletConnect provenance;
  Bankr rows also include an optional encrypted-credential generation tag.
  These fields are additive for storage decoding, but a legacy external/Bankr
  prompt without the authority needed by its route fails closed at confirmation.
- `encryptedSessionPassword` stores only `{ data, iv }`; the AES key half is
  stored separately in `chrome.storage.local.sessionEncKey`. Both are written
  only with native memory-backed session storage; browsers/forks without that
  API keep Never sessions in memory only across service-worker restarts.
- Passkey and agent-factor removal revoke `sessionEncKey` before deleting the
  factor. The storage shapes are unchanged; leftover native-session
  ciphertext after a successful commit is non-restorable without this half.
- `pkVault` remains released V1 with no migration. Reads now reject unknown or
  malformed envelopes before cryptographic use. Historical duplicate IDs are
  readable only; any path that could rewrite or migrate them fails with zero
  writes so users retain recovery access without silently choosing a key.
- `selectedThemeId` is canonical in `chrome.storage.local`, not sync storage.
- Missing or invalid `chrome.storage.sync.autoLockTimeout` is initialized to
  15 minutes. An exact stored `0` remains an explicit Never choice; session
  restoration never treats absence or malformed data as Never.
- `mnemonicVault` supports legacy V1 password encryption and the V2 dedicated-mnemonic-key format. V2 is created/converted atomically during successful biometric setup; ordinary master-password unlock does not rewrite a V1 vault.
- `passkeyUnlock` V2 adds the independently wrapped mnemonic key. Existing V1 passkeys remain valid for general vault unlock and routine signing, but do not gain mnemonic access; users must remove/re-enable biometric unlock with the master password to upgrade that factor.
- `txHistory` may include `broadcastUncertain: true` for a locally signed raw
  transaction whose deterministic hash is known but whose RPC response was
  lost. Old rows omit the marker and retain their previous receipt/drop logic.
- Non-critical metadata/image cache writes are best-effort and expired cache
  entries are actively pruned by `storage/cachePruner.ts` through the stable
  root facade.
- Chrome and Firefox manifests include `unlimitedStorage` to preserve headroom
  for wallet-critical persistent writes even when optional metadata caches grow.

Migration from any prior version:

- No eager migration is required. Missing `onboardingInitialization` is the
  normal state for every existing wallet and for onboarding while idle; the
  marker is created only when a new setup transaction starts. Missing
  `passkeyUnlock` means biometric unlock is not configured. V1 passkey/mnemonic records stay readable; V1 → V2 conversion occurs only as one atomic mnemonic-vault + passkey commit after explicit master authorization and successful WebAuthn setup. A partial older state containing `encryptedVaultKeyMaster` plus only legacy `encryptedApiKey` is migrated atomically on the next master unlock; passkey/agent unlock fails clearly until that one-time password migration, and a transient migration-write failure still leaves the master-authenticated legacy credential usable/retryable. Before password rotation or passkey removal clears a factor, the master-wrapped general key must recover the current Bankr credential and every private/derived key with correct account bindings; V2 additionally validates its mnemonic master wrapper, authenticated key check, every phrase/group, and every derived seed-account address. Password rotation atomically completes residual legacy API/`pkVault` migration before the old password stops working. Missing `autoLockTimeout` now resolves to 15 minutes while an exact stored `0` remains Never. Missing `walletConnectPendingRequests` resolves to an empty map, missing `walletConnectChainId` falls back to the current global chain or first visible chain, and missing `walletConnectStorageNamespace` deliberately retains the legacy WalletConnect SDK identity until a reset rotates it. Missing `sponsoredTransferIntents` means no ERC-3009 retry is pending. Missing `hiddenPortfolioTokens` resolves to no hidden tokens, missing cache keys are lazily refetched, missing `portfolioHoldingsCache` just shows the normal skeleton while live portfolio data loads, and legacy per-address hidden-token records are flattened lazily to the global list. Older pending requests with attested tab/origin fields continue through the injected-provider path; legacy/partial records lacking both those fields and exact WalletConnect metadata fail closed at confirmation rather than guessing authority. Fresh onboarding treats credential/wrapper/vault/account/seed-group records as authoritative and never clears them without a valid marker. If only disposable residue exists, it clears old grants/routes/session mirrors and rotates WalletConnect SDK identity before writing the marker, so cached ENS previews do not block setup and old peers cannot inherit a replacement wallet.
