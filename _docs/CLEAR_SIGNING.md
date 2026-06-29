# Clear Signing (ERC-7730)

The extension renders a human-readable view of transactions and EIP-712 signatures whenever an [ERC-7730](https://eips.ethereum.org/EIPS/eip-7730) descriptor is available for the target contract. The raw decoded view (`CalldataDecoder` / `TypedDataDisplay`) stays in the DOM, collapsed underneath the clear-signed card as **"Show raw details"**, so users can always inspect the underlying calldata. Single ERC-20 approval transactions are the exception: `ERC20ApproveDisplay` is already the purpose-built clear surface, so the generic descriptor card is suppressed there.

## Source of descriptors

Descriptors come from the public registry at [`ethereum/clear-signing-erc7730-registry`](https://github.com/ethereum/clear-signing-erc7730-registry). **Nothing is bundled** in the extension. The website acts as a thin proxy + cache:

- `walletchan.eth.sh/api/clearsigning/descriptor?chainId=…&address=0x…&kind=calldata|eip712&selector=0x…|formatKey=…` → descriptor JSON, or 404.
- The proxy uses a committed `(chainId, address) → registry path[]` snapshot (`apps/website/data/clearsigning-index.json`). When multiple registry descriptors share the same address, the route fetches candidates and returns the one whose `display.formats` matches the calldata selector or EIP-712 encoded type.
- Regenerate the snapshot with `pnpm tsx apps/website/scripts/snapshot-clearsigning-index.ts`.

## Resolution flow

```
Confirmation surface
  └─ <ClearSigningView kind=calldata|eip712 …/>
       └─ useClearSigningDescriptor(chainId, address)
            └─ message: GET_CLEAR_SIGNING_DESCRIPTOR
                 └─ clearSigningHandlers.ts (background)
                      ├─ chrome.storage.local cache  cs:desc:<chainId>:<address>:<kind>:<selector|format>
                      │    (TTL 7d hits, 1d misses; schema v3)
                      ├─ walletchan.eth.sh/api/clearsigning/descriptor (direct)
                      ├─ ON MISS → proxyResolver.ts (Safe / EIP-1967 / beacon)
                      │    └─ re-fetch descriptor for impl address
                      │    └─ extend descriptor.deployments to include the proxy
                      └─ builtinDescriptors.ts (client-side fallback)
                           ↳ ERC-20 transfer / approve only
```

**Remote always wins.** A built-in is only consulted after the remote registry returns nothing (or the user has clear-signing disabled). This means a contract with a curated registry descriptor renders that descriptor, not the generic ERC-20 one.

### Cache schema versioning

Cache entries are stamped with `schemaVersion`. On read, entries with a version older than `CACHE_SCHEMA_VERSION` (in `clearSigningHandlers.ts`) are treated as misses and re-resolved. Bump the constant whenever the resolution pipeline changes in a way that would make pre-existing cache entries wrong — users see new behavior immediately instead of waiting 1–7 days for a stale entry to expire.

| Version | Change |
|---|---|
| 1 | Initial. |
| 2 | Proxy fallback added — pre-v2 misses cached for proxy addresses would otherwise suppress the new resolution path. |
| 3 | Selector / EIP-712 format-aware lookups — pre-v3 hits may contain the wrong descriptor when one address has multiple registry files. |

Lookup disambiguation:

- **Calldata**: `(chainId, to, selector)` → match `display.formats[signature]` whose 4-byte selector equals `calldata[0..4]`.
- **EIP-712**: `(chainId, domain.verifyingContract, encodedTypeString)` → match `display.formats[encodedTypeString]` whose encoded type string equals the typed-data's primaryType expansion.

The registry uses **full canonical signatures** (e.g. `"exactInput((bytes path, address recipient, uint256 amountIn, uint256 amountOutMinimum) params)"`) as keys, not 4-byte selectors. The extension computes the selector from the signature at match time.

Before rendering a remote descriptor, the popup verifies the descriptor context:

- **Calldata** descriptors must contain a deployment for the current `(chainId, to)` address. Proxy-resolved descriptors get the proxy appended to that deployment list by the background resolver.
- **EIP-712** descriptors must bind to the current typed-data domain. `context.eip712.deployments` is checked against `domain.chainId` + `domain.verifyingContract`; `context.eip712.domain` values are exact-matched; `context.eip712.domainSeparator` is recomputed with viem and compared when present.

After ABI/EIP-712 decode, runtime guards run before rendering. `required` paths
must resolve. Fields with default/`always` visibility must resolve; `optional`
fields may be omitted. `excluded` paths are filtered from display when present.
`visible.mustMatch` fields validate hidden assertions and suppress clear signing
if the assertion fails.

## Supported field formats

| Format         | Behaviour                                                                                  |
| -------------- | ------------------------------------------------------------------------------------------ |
| `raw`          | Render verbatim (address copy / numeric monospace based on type).                          |
| `addressName`  | Resolve ENS / eth.sh / chain explorer label, fall back to truncated address + copy. Supports `params.senderAddress` aliases to display `@.from`. |
| `interoperableAddressName` | Best-effort ERC-7930/EVM address extraction, then the same address display path as `addressName`. |
| `tokenAmount`  | Look up token from `params.token`, `params.tokenAddress` (legacy built-in alias), or `params.tokenPath`; supports `params.chainId`, `params.chainIdPath`, `params.threshold`, `params.message`, descriptor `metadata.token`, native sentinels, and descriptor maps. Missing token data renders the raw amount instead of guessing native currency. |
| `amount`       | Native coin amount with chain symbol.                                                      |
| `date`         | Convert timestamp values to local date strings. `blockheight` currently falls back to raw because it needs an async chain lookup. |
| `unit`         | Apply `params.decimals` + `params.base` (`%`, `s`, …); `params.prefix` uses SI prefixes (`k`, `M`, …). |
| `duration`     | Format a seconds value as `HH:MM:ss`.                                                     |
| `enum`         | Resolve enum maps from inline params or `$ref` descriptor references.                      |
| `chainId`      | Show the known chain name when available, otherwise the numeric chain ID.                  |
| `tokenTicker`  | Resolve an ERC-20 ticker/logo from a token address and optional chain ID.                  |
| `nftName`      | Partial support: renders collection + token ID when supplied; no NFT metadata fetch yet.   |
| `calldata`     | Embedded inner call — recursively renders the inner contract's descriptor as a nested `ClearSigningView`. Falls back to a "no descriptor" card (callee + value + selector + truncated bytes) when the inner contract isn't in the registry. |

Unknown / unsupported formats fall through to `raw`, which always renders something safe.

## Field references

Registry descriptors often define reusable field templates under
`display.definitions` and reference them from a format field with `$ref`, e.g.
`"$.display.definitions.sendAmount"`. `applyFormat.ts` resolves these refs
before rendering: the referenced field supplies defaults such as `label`,
`format`, and shared `params`, while the concrete field keeps its own `path`,
`visible`, and any overriding params.

Params may also reference descriptor constants, such as
`params.nativeCurrencyAddress: ["$.metadata.constants.addressAsEth"]`. The
renderer resolves those constants and treats matching token addresses
(`0xeeee…` / zero address sentinels) as native currency for `tokenAmount`.
Descriptor maps (`{ "map": "$.metadata.maps.foo", "keyPath": "#.bar" }`) are
resolved at render time after calldata / EIP-712 fields have been decoded.
If a map reference cannot resolve for the current payload, the descriptor is
treated as non-applicable and clear signing is suppressed.

Fields can provide either `path` or literal `value`. Literal values render
through the same formatter path as decoded values. `display.formats[*].intent`
and `interpolatedIntent` are both supported; interpolation uses the matching
field formatter where possible and falls back to raw text for unknown paths.

Field and param paths resolve against two roots:

- `#` / bare paths resolve against decoded calldata args or the EIP-712
  `message` object.
- `@` resolves against the transaction/signing envelope. For calldata, `@.to`
  is the call target, `@.from` is the sender when available, and `@.value` is
  the native value attached to the call. For EIP-712, `@.to` is
  `domain.verifyingContract` and `@.from` is the signer address. This matters
  for descriptors like Circle's `TransferWithAuthorization`, where
  `params.tokenPath: "@.to"` means "format this amount in the verifying
  contract token", not the message recipient.

## Nested calldata (`calldata` format)

Some contracts pass another contract's calldata as a parameter — Safe's `BatchExecutor.batchExecute(calls[])` is the canonical example. ERC-7730 covers this with the `calldata` field format, and `applyFormat.ts` + `ClearSigningView.tsx` handle it natively:

- The value at `field.path` is interpreted as the embedded calldata bytes.
- `params.callee` (literal) or `params.calleePath` (resolved against the same decoded args) tells the renderer the inner contract address.
- `params.chainId` / `params.chainIdPath` can override the chain used for the nested descriptor lookup.
- `params.amount` / `params.amountPath` is an optional native-value attached to the inner call. Renders as a native-coin row in the fallback card.
- `params.spender` / `params.spenderPath` is threaded into the nested view as `@.from`, so inner descriptors can display the effective sender/spender correctly.
- `params.selector` / `params.selectorPath` covers descriptors whose embedded bytes lack their own 4-byte function selector — the supplied selector is prepended to `data` before the nested view runs its signature match. Validates to exactly 4 bytes (8 hex chars); malformed values are ignored, leaving the data untouched.
- When `field.path` iterates (contains `[]`, e.g. `calls.[].data`), the renderer **zips** path / calleePath / amountPath / spenderPath / selectorPath by index — each inner call gets paired with its own callee + sender + value + (optional) selector.
- Each inner call renders as a full-width nested card with a numbered header (`1 / 3 — Transaction`) when there's more than one.
- Recursion is depth-capped at `MAX_NESTED_DEPTH = 3` (Safe → Multicall → ERC-20 covers realistic stacks); anything deeper short-circuits to the raw fallback.
- The recursive lookup re-enters `resolveDescriptor(chainId, inner-to)` and re-runs the full match → decode → render pipeline, so every clear-signing capability available at top level (address labels, token amounts, eth.sh, etc.) automatically works inside nested calls.

**No-descriptor fallback (`RawNestedCalldataFallback` + `InlineCalldataRow`):** when the inner call's contract has no descriptor (and isn't a proxy that resolves to one), the renderer falls through to a flat row stack — To, Value (when non-zero), and a `Calldata · [functionName] ›` row that uses the local `decodeRecursive` for the function-name pill and reveals the decoded params inline on click. Mimics the parent card's label-left / value-right rhythm with a thin left-border accent instead of card chrome, so it reads as a continuation rather than a card-in-card. The function-name lookup runs Phase-1 local decode then Phase-2 ABI upgrade in the background.

**Midnight shadow tone-down:** in Midnight theme, nested `ClearSigningView` cards (depth > 0) render with `boxShadow="none"`. Stacking luminous shadows 2–3 levels deep otherwise glows like a tower. Bauhaus keeps its hard shadows at every depth — they're part of the aesthetic and don't accumulate the same way.

Reference descriptor: [`registry/safe/calldata-BatchExecutor.json`](https://github.com/ethereum/clear-signing-erc7730-registry/blob/master/registry/safe/calldata-BatchExecutor.json).

## Proxy fallback (`chrome/proxyResolver.ts`)

The registry indexes contracts by their *deployed* address. For directly-deployed contracts (Uniswap router, Permit2, the Safe singleton itself) that's exact. For **proxies**, it's not — every Safe is a unique `SafeProxy` at a unique address, every OZ Transparent / UUPS upgradeable contract is a per-instance proxy. The registry can't enumerate millions of them.

`resolveProxyImplementation(chainId, address)` runs whenever a direct descriptor fetch returns 404. It reads three storage slots in parallel via `eth_getStorageAt` on the user's configured RPC and returns the first matching implementation:

| Pattern | Detection | Source |
|---|---|---|
| **EIP-1967 logic** | `keccak256("eip1967.proxy.implementation") - 1` slot, last 20 bytes | OZ Transparent, UUPS, most modern upgradeable proxies |
| **EIP-1967 beacon** | beacon slot → one follow-up `implementation()` call on the beacon contract | OZ beacon proxies |
| **Safe** | literal slot 0 (Safe `Proxy` stores its singleton there) | every Safe deployed via `SafeProxyFactory` |

EIP-1967 / beacon take priority over Safe slot 0 — slot 0 is the first declared storage variable on many non-Safe contracts (ERC-20s, LP pairs, etc.) and would otherwise yield a garbage "implementation" address. A `looksLikeRealAddress` heuristic on slot 0 (require ≥5 non-zero nibbles in the leading 20) further rejects values that look like packed booleans or small integers.

When the resolver returns an implementation, the handler refetches the descriptor for `(chainId, impl)`, then `extendDeployments` appends `(chainId, proxy)` to the descriptor's deployment list before caching it under the proxy's cache key. This means client-side context verification keeps working untouched, and every subsequent confirmation on the same proxy address skips the RPC + the extra fetch entirely.

Patterns NOT covered yet: ERC-1167 minimal proxies (bytecode pattern, would need `eth_getCode` + regex), EIP-2535 Diamond (per-selector facets, would need a `facetAddress(selector)` lookup per inner call). Add when a real registry entry needs them.

## Path resolution

Paths inside `fields[].path` use dot notation, array indexing, and byte slicing:

| Path syntax            | Meaning                                                          |
| ---------------------- | ---------------------------------------------------------------- |
| `params.amountIn`      | `params` field → `amountIn` field                                |
| `path[0]` / `path.[0]` | First element of an array.                                       |
| `path[-1]` / `path.[-1]` | Last element of an array.                                      |
| `details[]` / `details.[]` | Iterate every element; subsequent `fields[]` apply per element. |
| `recipients.length`  | Length of an array, useful in `interpolatedIntent`.             |
| `params.path[0:20]` / `params.path.[0:20]` | Slice the first 20 bytes of a `bytes` value (token-in address). |
| `params.path[-20:]` / `params.path.[-20:]` | Slice the last 20 bytes (token-out address). |

Byte slicing also works on numeric ABI values. This is needed for aggregators
such as 1inch that pack an address into the low 160 bits of a `uint256` and
refer to it with paths like `token.[-20:]`.

## Built-in client-side descriptors (`lib/clearSigning/builtinDescriptors.ts`)

The remote registry is keyed on `(chainId, contract address, selector/EIP-712 type)` — fine for per-app contracts (Permit2, Uniswap router, etc.) but useless for "every ERC-20 ever deployed." Rather than seeding the registry with thousands of identical entries, we synthesize a generic ERC-7730 descriptor on demand for well-known calldata function selectors.

Today's built-in selectors:

| Selector     | Function                                | Synthesized fields           |
| ------------ | --------------------------------------- | ---------------------------- |
| `0xa9059cbb` | `transfer(address to, uint256 amount)`  | Amount (tokenAmount), Recipient (addressName) |
| `0x095ea7b3` | `approve(address spender, uint256 amount)` | Amount (tokenAmount), Spender (addressName)   |
| `0x8d80ff0a` | `multiSend(bytes transactions)`         | Per-inner-call (calldata) — see "MultiSend custom unpacking" below |

Adding a new selector is two lines: add it to `BUILTIN_SELECTORS` and add a `case` in `getBuiltinCalldataDescriptor`. Inline summaries (below) and the batch CallCard's built-in expanded layout key off the same `isBuiltinCalldataSelector(call.data)` predicate, so they activate automatically.

The synthesized `tokenAmount` field uses `params.tokenAddress` (hardcoded to the call target — the token IS the contract being called). `applyFormat.ts` also supports the ERC-7730-native `params.token` spelling, so registry descriptors and WalletChan built-ins both resolve symbol / decimals / logo / price through the same path.

### MultiSend custom unpacking

Safe's `MultiSend` / `MultiSendCallOnly` takes a single `bytes transactions` argument that's a custom **packed** concatenation of `(operation:1, to:20, value:32, dataLen:32, data:dataLen)` tuples — not standard ABI. Two hooks make it work end-to-end:

1. `multiSendDescriptor()` in `builtinDescriptors.ts` synthesizes a descriptor with one `calldata` field at `transactions.[].data` (zipped with `transactions.[].to` callee + `transactions.[].value` amount).
2. `decodeForDescriptor.ts` post-processes viem's standard decode: when the format key matches `MULTISEND_FORMAT_KEY` and `transactions` is still a raw hex string, `unpackMultiSendTransactions()` walks the packed bytes into `[{operation, to, value, data}, …]` and overwrites the field. Returns null on any structural mismatch — caller silently falls through to "no match" rather than rendering garbage.

From there the existing recursive nested-calldata pipeline takes over: each inner call mounts its own `ClearSigningView`, runs the full descriptor lookup (registry → proxy fallback → built-in → InlineCalldataRow fallback), and renders as a numbered "1 / N — Call" nested card. The same selector also lets the raw `decodeRecursive` Strategy 3 fire (since it's structurally valid at any depth — see `lib/decoder/index.ts`), so even outside clear-signing the inner txs unpack in the raw decoder view.

## Inline batch summary (`hooks/useErc20InlineSummary.ts`)

For ERC-5792 batches, every per-call `CallCard` header runs `useErc20InlineSummary(to, data, chainId)`. When the calldata matches a built-in selector, it returns a structured `{ mode, prefix, amount, symbol, logoUrl, middle, recipient, recipientAvatarSrc, recipientAvatarKind }` summary that `BatchTransactionConfirmation` renders as e.g. **"Send 100 [USDC icon] USDC to vitalik.eth [avatar]"** or **"Approve unlimited [USDC icon] USDC to AugustusV6"**.

Recipient resolution priority: own account label → ENS/Basename/WNS/GNS/Mega → eth.sh contract label → truncated `0xabcd…1234`. `MAX_UINT256` / `MAX_UINT160` (Permit2) approvals render as **"unlimited"** with a hover tooltip.

When the inline summary fully resolves on a CallCard, the duplicated descriptor card is suppressed in the top-of-screen `BatchClearSigningSummary` (no point rendering the same recipient + amount twice) and the trailing contract-address chip on the collapsed header is hidden as redundant.

## Editable approve amounts on batch CallCards

Approve CallCards reuse the single-tx `ERC20ApproveDisplay` component (pencil icon next to the amount, same edit/save UX). The component takes an optional `onSaveCalldata?(data) => Promise<{success, error?}>` prop:

- **Single-tx** (default): writes via `updatePendingTxRequestData(txId, newData)` to `pendingTxRequests`.
- **Dapp-initiated batch**: `BatchTransactionConfirmation` supplies a handler that sends `updateCallInPendingBatch` (mutates `params.calls[i].data` in `pendingBatchTxRequests`).
- **Cross-dapp batch**: `CrossDappBatchConfirmation` supplies a handler that sends `updateCallInCrossDappBatch` (mutates `entries[i].tx.data` in `crossDappBatch`).

Downstream propagation comes for free: sign-time handlers (`handleConfirmBatchTransaction` for Bankr ERC-7821, `handleConfirmBatchTransactionPK` for PK/Seed auto-sequential, `handleConfirmCrossDappBatch`, and any future EIP-7702 atomic path) all re-fetch the latest storage snapshot at sign time. The popup's storage listener pushes the fresh request into the confirmation; `AssetChangesDisplay` re-fires on its data-keyed effect (`batchCallsKey = to|data|value` per call), `MultiTxGasEstimateDisplay` re-fires on `to + data` per tx. No per-handler plumbing required.

## Tx-confirmation surfaces wired

| Surface                                                | Insertion                                                   |
| ------------------------------------------------------ | ----------------------------------------------------------- |
| `TransactionConfirmation.tsx` (single dapp tx)         | Above `CalldataDecoder`, passes `defaultCollapsed` down. Suppressed for single ERC-20 approvals because `ERC20ApproveDisplay` already owns that UI. |
| `BatchTransactionConfirmation.tsx` (ERC-5792 batch)    | Inline summary on every CallCard header; `BuiltinExpandedContent` swaps in `ERC20ApproveDisplay` for approves (full editor) and `ClearSigningView` for other built-ins, with TO + raw decoder + digest collapsed behind a single "Calldata" disclosure. Non-built-in calls render a top-of-screen `BatchClearSigningSummary` card per call. |
| `CrossDappBatchConfirmation.tsx` (user-assembled)      | Inherits via the wrapped `BatchTransactionConfirmation`; provides its own `onEditCallData` override to route through `updateCallInCrossDappBatch`. |
| `SignatureRequestConfirmation.tsx` (EIP-712 typed)     | Above `TypedDataDisplay`; raw struct collapses on hit.      |
| `TxDetailModal.tsx` (Activity tab)                     | Renders the submitted tx's stored `clearSignedMeta`; ERC-7715 revoke txs reuse `erc7715PermissionRevokeMeta` to show the delegated-permission revoke summary above raw calldata. |

`personal_sign` / `eth_sign` are intentionally out of scope — they have no contract context, so clear signing doesn't apply.

## Privacy

A descriptor fetch reveals `(chainId, contract address)` to the WalletChan proxy. Users who don't want this can opt out under **Settings → Privacy → "Use clear-signing descriptors"** (default ON). When OFF, the background handler short-circuits before any network or storage access.

## Adding a new descriptor

We don't host our own registry. To get a new contract covered:

1. Author a descriptor following the [ERC-7730 spec](https://github.com/ethereum/clear-signing-erc7730-registry/tree/master/specs).
2. Submit a PR to [`ethereum/clear-signing-erc7730-registry`](https://github.com/ethereum/clear-signing-erc7730-registry).
3. Once merged, regenerate our snapshot (`pnpm tsx apps/website/scripts/snapshot-clearsigning-index.ts`) and ship a website redeploy. No extension release required.

## Shared address-label cache (`lib/ethShLabelsCache.ts`)

Clear-signing surfaces resolve contract labels via [eth.sh](https://eth.sh). Six different surfaces consult labels (single-tx info card, single-tx approve spender row, batch CallCard inline summary, expanded descriptor card, EIP-712 address fields, calldata-decoder address params) — calling the API directly from each would multiply requests for the same address.

`getEthShLabels(address, chainId)` is the single entry point. Three layers:

1. **In-memory `Map`** — instant repeat lookups inside one popup mount.
2. **In-flight promise dedup** — concurrent sibling fetches share one network round-trip.
3. **`chrome.storage.local` cache** at `ethShLabels:{chainId}:{address}` with a 7-day TTL. Empty arrays cache too (a known-no-label address doesn't re-hit the API on every reopen).

Token metadata (`fetchTokenInfo`) and per-token logos (`getCachedTokenLogo`) follow the same in-flight + chrome.storage TTL pattern, with token data cached for 30 days (immutable on-chain). Image bytes resolved by either are funneled into the shared `ensAvatarImageCache` (OffscreenCanvas → data URL) so cold reopen paints synchronously.

## Storage keys

Documented in `_docs/STORAGE.md`:

- `cs:desc:<chainId>:<address>:<kind>:<selector|format>` — descriptor cache entry (hit or miss). Includes `schemaVersion` for forward-compatible invalidation.
- `cs:enabled` — boolean opt-out flag (default `true`).
- `ethShLabels:<chainId>:<address>` — eth.sh contract labels (7d TTL, empties cached).
- `tokenInfo:<chainId>:<address>` — ERC-20 name/symbol/decimals (30d TTL).
- `tokenLogo:<chainId>:<address>` — token logoURI (30d TTL).

## Threat model

Descriptors are public, non-authoritative metadata. A malicious or buggy descriptor could mislabel a transaction. Mitigations:

- Raw decoder always remains accessible underneath ("Show raw details").
- Asset Changes simulation (`AssetChangesDisplay`) is unaffected by descriptors — it runs onchain and shows the ground-truth balance deltas.
- The opt-out toggle lets paranoid users disable clear signing entirely.
- The registry has automated CI (schema + ABI consistency + deployment verification) and maintainer review; we trust this for v1.

A future iteration may add per-descriptor attestation checks (ERC-8021), but that's out of scope today.
