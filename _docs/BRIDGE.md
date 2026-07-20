# Bridge Page

`/bridge` route on the website. Lets users move tokens between chains (cross-chain only — same-chain swaps stay on `/swap`). Linked from the navbar.

## Architecture

```
User → BridgeContent (UI)
        │
        ├─ useBridgeChains  → /api/bridge/chains  → Socket /v3/swap/supported-chains
        ├─ useBridgeTokens  → /api/bridge/tokens  → Socket /v3/swap/tokens/list
        ├─ useBridgeQuote   → /api/bridge/quote   → Socket /v3/swap/quote?userOps=tx
        ├─ usePortfolio     → /api/portfolio                  (existing route, multi-chain)
        │
        ├─ executeBridge (BridgeButton):
        │   ├─ Atomic supported → useSendCalls([approve?, route.txData])   (1 popup)
        │   └─ Non-atomic       → approve? + sendTransactionAsync(route.txData) (1–2 popups)
        │
        └─ useBridgeStatus → /api/bridge/status (poll every 5s, terminal at codes 3–7)
```

### Why server-side API routes?
- **Socket API key** (`x-api-key`) and **affiliate id** (`affiliate`) stay server-side, never exposed to client.
- **Fee params** (`feeBps`, `feeTakerAddress`) injected server-side so clients can't bypass or modify fees.
- Future-proofs the route — if Socket adds rate-limit per origin or other auth, we can swap implementations without touching the page.

## Socket Swap V3 Integration

Uses **Socket Swap V3**. The default backend is `https://public-backend.socket.tech`; production should set `SOCKET_API_URL` or `BUNGEE_API_URL` to `https://dedicated-backend.socket.tech`. Historical Bungee host values are normalized to the matching Socket host.

### Endpoints (all proxied through `/api/bridge/*`)

| Our route | Method | Upstream | Purpose |
|---|---|---|---|
| `/api/bridge/quote` | GET | `/v3/swap/quote?userOps=tx` | Quote with executable Socket `routes[]`, adapted to `manualRoutes[]` for existing clients |
| `/api/bridge/build-tx` | GET | none | Deprecated; returns 410 because V3 quote includes executable `txData.object` |
| `/api/bridge/submit` | POST | none | Deprecated; returns 410 because V3 has no submit endpoint |
| `/api/bridge/status` | GET | `/v3/swap/status?quoteId=` | Cross-chain status by quoteId, adapted to status codes 0–7 |
| `/api/bridge/chains` | GET | `/v3/swap/supported-chains` | Cached 1h in-memory |
| `/api/bridge/tokens` | GET | `/v3/swap/tokens/list?chainIds=` | Cached 1h in-memory shortlisted token list |

### Headers (shared by every route)

All routes use `bungeeHeaders()` from `apps/website/app/api/bridge/bungee.ts`:
- `x-api-key`: only attached when `BUNGEE_API_KEY` is set
- `affiliate`: only attached when `BUNGEE_AFFILIATE_ID` is set

If neither is set, requests still go through (useful for hitting the public sandbox during dev).

### Native token sentinel

Socket V3 quote requests use the universal mixed-case native token address `0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE`. Existing clients may still send the historical lowercase Bungee sentinel or the zero address; `/api/bridge/quote` normalizes both before forwarding.

## Execution Paths

`BridgeButton.tsx` picks one of two paths based on what the connected wallet can do:

### Path A — ERC-5792 batched manual mode (1 popup)
Triggered when `useCapabilities().atomic.status` is `"supported"` or `"ready"` (most modern wallets including ours).
1. Re-fetch quote with the connected wallet.
2. Read `manualRoutes[0].approvalData` and `manualRoutes[0].txData` from the Socket-normalized quote.
3. Build calls: `[approve(spender, amount)?, bridge(txData)]`.
4. `sendCallsAsync({ calls })` — wallet bundles into a single user-facing popup.
5. Store `quoteId` as `requestHash` for the existing status UI and poll `/api/bridge/status`.
6. Wait via `useWaitForCallsStatus`. On `status === "success"`, extract the **last** receipt's `transactionHash` (bridge call is always last; the optional approve precedes it).

### Path B — Manual non-atomic (1–2 popups)
Triggered when the wallet doesn't support atomic batching.
1. Re-fetch quote.
2. If on-chain allowance < required, send an `approve` tx and wait ~2s for inclusion.
3. `sendTransactionAsync(txData)` — the bridge tx.
4. Store `quoteId` as `requestHash` for status polling.
5. `useWaitForTransactionReceipt` flips `step` back to idle on inclusion.

Socket V3 removed the old Bungee Auto / Permit2 submit flow. Clients send `txData.object` directly on-chain and poll by `quoteId`.

## Cross-chain Status Polling

`useBridgeStatus` polls `/api/bridge/status` every 5s with a 10-minute hard cap.

### Response shape

```jsonc
{
  "success": true,
  "result": [
    {
      "hash": "0xcfc…",            // Socket quoteId, mirrored for legacy callers
      "quoteId": "0xcfc…",
      "status": "IN_PROGRESS",
      "statusCode": "PENDING",
      "originData": {
        "txHash": "0xcfc…",
        "originChainId": 8453,
        "status": "COMPLETED",
        "userAddress": "0xab7…",
        "timestamp": 1779392851
      },
      "destinationData": {
        "txHash": "0x17e…",
        "destinationChainId": 42161,
        "status": "COMPLETED",
        "receiverAddress": "0xab7…",
        "timestamp": 1779392851
      },
      "refund": null,                // NOT "refundData"; null when no refund
      "routeDetails": { "name": "across", "logoURI": "…" },
      "bungeeStatusCode": 3
    }
  ]
}
```

The TypeScript definitions in `apps/website/app/bridge/types.ts` mirror this exactly.

### Status codes

| Code | Constant | Terminal? | Meaning |
|---|---|---|---|
| 0 | `PENDING` | No | Submitted, awaiting solver |
| 1 | `ASSIGNED` | No | Solver picked up |
| 2 | `EXTRACTED` | No | Funds taken from source |
| 3 | `FULFILLED` | Yes | Delivered on destination |
| 4 | `SETTLED` | Yes | Solver settled |
| 5 | `EXPIRED` | Yes | Quote expired before delivery |
| 6 | `CANCELLED` | Yes | Cancelled |
| 7 | `REFUNDED` | Yes | Tokens returned to source |

Socket V3 returns string statuses (`PENDING`, `IN_PROGRESS`, `COMPLETED`, `FAILED`, `EXPIRED`, `REFUNDED`). The server proxy maps those to the legacy numeric codes above so existing website and extension status UIs keep working.

## Fee Collection

- **Same flat fee as `/swap`** — `resolveFeeBps(taker)` from `apps/website/app/api/swap/feeResolver.ts` is reused server-side and returns 0.1% (10 bps) without an indexer or onchain lookup.
- The previous staking-tier resolver remains available behind the disabled `STAKING_FEE_TIERS_ENABLED` flag for possible future use.
- **`BUNGEE_FEE_RECIPIENT` is its own env var** — separate from `SWAP_FEE_RECIPIENT` because bridge/swap API fee recipients are whitelisted per affiliate id.
- Fee params only attached when `BUNGEE_FEE_RECIPIENT` is set. Leaving it blank disables integrator fees on bridges entirely.
- Socket returns output amounts already net of applicable fees.
- The proxy adds `isPremiumFee` + `feeBps` to the response. `isPremiumFee` remains false while staking tiers are disabled.

## File Structure

```
apps/website/app/
├── bridge/
│   ├── page.tsx                       # Server component (force-dynamic), renders BridgeContent
│   ├── BridgeContent.tsx              # Top-level state: chains, tokens, amount, slippage, quote, submitted
│   ├── constants.ts                   # POPULAR_PER_CHAIN — popular token symbols per chain
│   ├── hooks/
│   │   ├── useBridgeChains.ts         # Cached fetch of /api/bridge/chains, sorted by name
│   │   ├── useBridgeTokens.ts         # Per-chain cached fetch of /api/bridge/tokens
│   │   ├── useBridgeQuote.ts          # Debounced quote fetch + fetchFirmQuote() for execute time
│   │   ├── useBridgeStatus.ts         # Polls /api/bridge/status every 5s, stops on terminal codes
│   │   └── usePortfolio.ts            # Wraps /api/portfolio for the From token holdings section
│   └── components/
│       ├── ChainSelector.tsx          # Bauhaus dropdown with logo + name
│       ├── TokenSelector.tsx          # Modal with search, popular chips, "Your Tokens" w/ balances
│       ├── BridgeQuoteDisplay.tsx     # You receive, min received, route, est. time, fee, premium badge
│       ├── BridgeButton.tsx           # The whole execution state machine (atomic/non-atomic)
│       └── BridgeStatus.tsx           # Cross-chain progress with [source chain logo] → [dest chain logo]
├── api/bridge/
│   ├── bungee.ts                      # Shared Socket API URL + bungeeHeaders()
│   ├── quote/route.ts                 # Adds fee resolution + native-token normalization, adapts routes[]
│   ├── build-tx/route.ts              # Deprecated 410
│   ├── submit/route.ts                # Deprecated 410
│   ├── status/route.ts                # Accepts quoteId/requestHash
│   ├── chains/route.ts                # 1h in-memory cache
│   └── tokens/route.ts                # Per-chain 1h in-memory cache
```

## Key UI Behaviours

### From Token selector
- **Holdings on top** — fetches user's portfolio via `/api/portfolio` (multi-chain) and filters to `fromChainId`. Tokens the user owns appear in a "Your Tokens" section with formatted balance + USD value.
- **Popular tokens chips** — shown above "Your Tokens" when the user hasn't searched. Symbols defined in `POPULAR_PER_CHAIN` (per-chain, mirroring the extension's swap dropdown). Tokens the user already holds are hidden from the popular section to avoid duplication.

### To Token selector
Same component, but without holdings (only the popular chips + full token list). The same `TokenSelector` component handles both — `holdings` is optional.

### Quote
- **Debounced auto-fetch** (500ms) on any input change.
- **Re-quoted at execute time** in `BridgeButton.handleBridge` because quotes expire.
- Socket returns post-fee amounts; the UI shows fee % and a "Premium" badge when the proxy reports `isPremiumFee: true`.

### Status display (BridgeStatus)
- Top row: status label (coloured by status) and route name (e.g. "via across").
- Middle row: `[source chain logo + name + tx hash link] → [dest chain logo + name + tx hash link]` in a bordered card. Arrow turns green once the destination tx lands. Destination dims while source-side is in flight.
- Refund row appears (red border) only when `bungeeStatusCode === 7`.

### Chain switching
If `useChainId() !== originChainId`, the Bridge button kicks off `switchChainAsync` first. Wagmi prompts the user to switch (or add) the chain.

## Environment Variables

| Variable | Required? | Purpose |
|---|---|---|
| `BUNGEE_API_KEY` | yes (prod) | `x-api-key` header on every upstream call. Omit to use the public sandbox. |
| `SOCKET_API_URL` | no | Preferred upstream URL override. Set to `https://dedicated-backend.socket.tech` for production. |
| `BUNGEE_API_URL` | no | Backward-compatible upstream URL override. Historical `*.bungee.exchange` values are normalized to the matching Socket host. |
| `BUNGEE_AFFILIATE_ID` | yes (prod) | `affiliate` header. Required by the dedicated backend. |
| `BUNGEE_FEE_RECIPIENT` | optional | Address that receives integrator fees. **Must be whitelisted by Bungee for this affiliate id** or quotes will fail. Leave blank to disable integrator fees while sorting whitelisting. |

All defined in `apps/website/.env.local` (see `.env.local.example`).

## Constants Reference

| Constant | Value | Location | Purpose |
|---|---|---|---|
| `BUNGEE_NATIVE_TOKEN` | `0xeeee…eeee` (all-lowercase) | `@walletchan/shared/bungee` | Historical native sentinel accepted by clients |
| `NATIVE_TOKEN_ADDRESS` | `0xEeee…EEeE` (mixed-case) | `@walletchan/shared/bungee` | Socket quote native sentinel |
| `POPULAR_PER_CHAIN` | per-chain symbol lists | `bridge/constants.ts` | Popular-token chips in the picker |
| `EXPLORERS` | chainId → URL prefix | `bridge/BridgeContent.tsx` | Tx hash → block-explorer link in the status display |
| `TERMINAL_STATUS_CODES` | `{3, 4, 5, 6, 7}` | `bridge/types.ts` | Status codes that stop the poller |

## Reused, not duplicated

- `apps/website/app/api/swap/feeResolver.ts` — `resolveFeeBps(taker)` server-side.
- `apps/website/app/swap/components/SlippageSettings.tsx` — imported directly by `BridgeContent.tsx`; chain-agnostic.
- `apps/website/app/api/portfolio/*` — the existing portfolio route serves holdings for the From selector.
- `useCapabilities` pattern from `apps/website/app/stake/StakeContent.tsx` — same atomic-status check.

## Extension support

The wallet extension's Swap surface (`apps/extension/src/components/Swap/SwapView.tsx`) accepts a different chain on the buy side via the `BuyChainMenu` picker. When `sellChainId !== buyChainId`, the surface flips to **bridge mode**:

- **Quote**: extension calls the same proxy via a new `fetchBridgeQuote` background message → `https://walletchan.eth.sh/api/bridge/quote`. Same response shape, same `isPremiumFee` tier — no separate sWCHAN logic lives in the extension.
- **Build**: at confirm time, the extension re-quotes and uses the Socket-normalized `manualRoutes[0].approvalData` + `manualRoutes[0].txData` directly. There is no build-tx call in Socket V3.
- **Execute**: bridge txs flow through the existing swap handlers — `executeSwapDirect` (PK / Seed, per-call gas tier override) or `executeSwapBatch` (Bankr atomic ERC-7821). The bridge call entry carries a `bridge` field on `SwapTxEntry`, which is persisted onto the `CompletedTransaction.bridge` shape.
- **Route selection**: use `manualRoutes[0]`. The website proxy adapts Socket V3 `result.routes[]` into this legacy field and only includes routes with executable `txData.object`.
- **Source-tx confirmation**: standard `txReceiptPoller` (no change). Bridge metadata is set on the tx-history entry at submission time and updated by the status poller as Socket progresses.
- **Destination polling**: `bridgeStatusPoller` polls `/api/bridge/status?requestHash=<quoteId>` every 5s → 30s (15-min cap). Pending bridges persist in `chrome.storage.local` under `pendingBridges`; `runtime.onStartup` resumes interrupted polls.
- **Notification**: on `FULFILLED` / `SETTLED` / `REFUNDED` / `EXPIRED` / `CANCELLED`, `chrome.notifications.create` fires with the destination explorer URL stored under `notification-<id>` so clicking the toast jumps to the destination tx.
- **UI**: `SwapConfirmation.tsx` accepts an optional `bridgeMeta` prop — title flips to "Confirm Bridge", network row shows source → destination chains, route + ETA row appears. Gas plumbing is unchanged. `TxStatusList.tsx` renders a "Source Confirmed / Bridging to X" status until terminal, then "Bridge Complete" or "Refunded". `TxDetailModal.tsx` adds a "Destination" block with the destination tx-hash link, route name, and current status code.

**Wallet-type coverage**: Bankr (ERC-7821 atomic batch), PrivateKey (sequential broadcast with gas tier override), SeedPhrase (sequential broadcast). Impersonator is blocked at entry, same as same-chain swaps.

**Auto / Permit2 signature path is intentionally gone.** Socket V3 returns `txData.object`; clients approve if required and send that transaction directly.

**Key files**:

| File | Purpose |
|---|---|
| `apps/extension/src/chrome/bridgeApi.ts` | Stable facade for `fetchBridgeQuote`, `fetchBridgeStatus`, and 24h-cached chain/token helpers |
| `apps/extension/src/chrome/bridgeChainsResolver.ts` | Stable facade for `getBridgeSourceChains(accountType)` / `getBridgeDestinationChains()`; source chains come from the runtime configured chain list (`getVisibleChains`, so user-added custom chains like Avalanche are included for PK/Seed accounts) and are kept when either 0x supports same-chain swaps or Socket supports bridge origins. Destination chains use Socket's EVM list. |
| `apps/extension/src/chrome/bridgeStatusPoller.ts` | Stable facade for the in-memory poller, `maybeStartBridgePolling`, and restart resume |
| `apps/extension/src/chrome/bridge/README.md` | Audit map for bounded API egress, catalog caches, pure chain policy, and ordered settlement transitions |
| `apps/extension/src/chrome/requests/pendingBridgeStorage.ts` | `pendingBridges` chrome.storage.local key with mutex-locked writes |
| `apps/extension/src/components/Swap/BridgeChainTokenModal.tsx` | Unified sell/buy chain + token dropdown; sell mode uses source chains, buy mode uses destination chains |

## Common Errors

| Error | Cause | Fix |
|---|---|---|
| `feeTakerAddress is not whitelisted for this integrator` | `BUNGEE_FEE_RECIPIENT` not whitelisted for the affiliate | Ask Socket to whitelist the address, set the whitelisted address, or blank the env var |
| `No bridge routes available for this pair` | Pair / amount unsupported by Socket route discovery | Try a different amount or pair |
| `tokens.find is not a function` (historical) | Assumed `/tokens/list` returned a flat array — it's keyed by chainId | Fixed in `useBridgeTokens.ts` |
| Button stuck on "Waiting for confirmation" after batched call (historical) | Bundle status reaction ran during render | Fixed by moving to `useEffect` with `useWaitForCallsStatus` |
