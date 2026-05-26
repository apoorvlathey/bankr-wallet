# Bridge Page

`/bridge` route on the website. Lets users move tokens between chains (cross-chain only — same-chain swaps stay on `/swap`). Linked from the navbar.

## Architecture

```
User → BridgeContent (UI)
        │
        ├─ useBridgeChains  → /api/bridge/chains  → Bungee /supported-chains
        ├─ useBridgeTokens  → /api/bridge/tokens  → Bungee /tokens/list
        ├─ useBridgeQuote   → /api/bridge/quote   → Bungee /api/v1/bungee/quote
        ├─ usePortfolio     → /api/portfolio                  (existing route, multi-chain)
        │
        ├─ executeBridge (BridgeButton):
        │   ├─ Atomic supported → /api/bridge/build-tx + useSendCalls([approve?, bridge])   (1 popup)
        │   ├─ Manual non-atomic → /api/bridge/build-tx + approve? + sendTransactionAsync   (1–2 popups)
        │   └─ Auto fallback    → useSignTypedData + POST /api/bridge/submit                (1 popup)
        │
        └─ useBridgeStatus → /api/bridge/status (poll every 5s, terminal at codes 3–7)
```

### Why server-side API routes?
- **Bungee API key** (`x-api-key`) and **affiliate id** (`affiliate`) stay server-side, never exposed to client.
- **Fee params** (`feeBps`, `feeTakerAddress`) injected server-side so clients can't bypass or modify fees.
- Future-proofs the route — if Bungee adds rate-limit per origin or other auth, we can swap implementations without touching the page.

## Bungee Integration

Uses **Bungee's dedicated production backend** by default (`https://dedicated-backend.bungee.exchange`). Falls back to the public sandbox automatically when env is missing — no API key required for sandbox.

### Endpoints (all proxied through `/api/bridge/*`)

| Our route | Method | Upstream | Purpose |
|---|---|---|---|
| `/api/bridge/quote` | GET | `/api/v1/bungee/quote` | Indicative cross-chain quote with `manualRoutes[]` and `autoRoute` |
| `/api/bridge/build-tx` | GET | `/api/v1/bungee/build-tx?quoteId=` | Manual-mode executable `txData` + `approvalData` |
| `/api/bridge/submit` | POST | `/api/v1/bungee/submit` | Auto-mode Permit2 signature submission |
| `/api/bridge/status` | GET | `/api/v1/bungee/status?requestHash=` or `?txHash=` | Cross-chain status (status codes 0–7) |
| `/api/bridge/chains` | GET | `/api/v1/supported-chains` | Cached 1h in-memory |
| `/api/bridge/tokens` | GET | `/api/v1/tokens/list?chainId=` | Cached 1h in-memory |

### Headers (shared by every route)

All routes use `bungeeHeaders()` from `apps/website/app/api/bridge/bungee.ts`:
- `x-api-key`: only attached when `BUNGEE_API_KEY` is set
- `affiliate`: only attached when `BUNGEE_AFFILIATE_ID` is set

If neither is set, requests still go through (useful for hitting the public sandbox during dev).

### Native token sentinel

Bungee uses **all-lowercase** `0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee` for native tokens on every chain. The `/api/bridge/quote` route normalises the universal mixed-case `0xEeee…` and the zero address to this lowercase form before forwarding.

## Execution Paths

`BridgeButton.tsx` picks one of three paths based on what the connected wallet can do:

### Path A — ERC-5792 batched manual mode (1 popup)
Triggered when `useCapabilities().atomic.status` is `"supported"` or `"ready"` (most modern wallets including ours).
1. Re-fetch quote with the connected wallet (quoteIds expire ~60s).
2. `/api/bridge/build-tx?quoteId=…` → `{ txData, approvalData }`.
3. Build calls: `[approve(spender, amount)?, bridge(txData)]`.
4. `sendCallsAsync({ calls })` — wallet bundles into a single user-facing popup.
5. Wait via `useWaitForCallsStatus`. On `status === "success"`, extract the **last** receipt's `transactionHash` (bridge call is always last; the optional approve precedes it).
6. Hand the hash to the cross-chain status poller.

### Path B — Manual non-atomic (1–2 popups)
Triggered when the wallet doesn't support atomic batching but Bungee returned a `manualRoutes[0]`.
1. Re-fetch quote.
2. `/api/bridge/build-tx?quoteId=…`.
3. If on-chain allowance < required, send an `approve` tx and wait ~2s for inclusion.
4. `sendTransactionAsync(txData)` — the bridge tx.
5. `useWaitForTransactionReceipt` flips `step` back to idle on inclusion.

### Path C — Auto / Permit2 (1 popup)
Fallback when no manual route is usable but `autoRoute.signTypedData` is present.
1. Re-fetch quote (Bungee includes `signTypedData` on `autoRoute`).
2. `signTypedDataAsync({ domain, types, primaryType, message })` — user signs Permit2.
3. POST `/api/bridge/submit` with `{ quoteId, requestType, request, userSignature }`.
4. Receive `requestHash` and hand it to the cross-chain status poller.

> **Why not always Auto?** Auto needs the user to have approved Permit2 once on the source chain. When the wallet supports batching, the manual+batch path skips that prerequisite and works in a single popup regardless of approval state.

## Cross-chain Status Polling

`useBridgeStatus` polls `/api/bridge/status` every 5s with a 10-minute hard cap.

### Response shape (what Bungee actually returns — confirmed by inspecting live responses, not by reading the docs)

```jsonc
{
  "success": true,
  "result": [
    {
      "hash": "0xcfc…",            // overall request hash (Bungee's id)
      "originData": {
        "txHash": "0xcfc…",
        "originChainId": 8453,      // NOT "chainId"
        "status": "COMPLETED",
        "userAddress": "0xab7…",
        "timestamp": 1779392851
      },
      "destinationData": {
        "txHash": "0x17e…",
        "destinationChainId": 42161, // NOT "chainId"
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

`TERMINAL_STATUS_CODES` in `types.ts` is the set the poller stops on.

## Fee Collection

- **Same tiering as `/swap`** — `resolveFeeBps(taker)` from `apps/website/app/api/swap/feeResolver.ts` is reused server-side. Default 0.8%, premium 0.3% for ≥ 20M sWCHAN holders.
- **`BUNGEE_FEE_RECIPIENT` is its own env var** — separate from `SWAP_FEE_RECIPIENT` because **Bungee whitelists fee recipients per affiliate id**. If the address isn't whitelisted, every quote returns `feeTakerAddress is not whitelisted for this integrator`.
- Fee params only attached when `BUNGEE_FEE_RECIPIENT` is set. Leaving it blank disables integrator fees on bridges entirely (useful while waiting for Bungee to whitelist a new recipient).
- Bungee deducts fees from the **output token**, not the input. Reverse-compute for display: `feeAmount = buyAmount * feeBps / (10000 - feeBps)`.
- The proxy adds `isPremiumFee` + `feeBps` to the response so the UI can show a "Premium" badge.

## File Structure

```
apps/website/app/
├── bridge/
│   ├── page.tsx                       # Server component (force-dynamic), renders BridgeContent
│   ├── BridgeContent.tsx              # Top-level state: chains, tokens, amount, slippage, quote, submitted
│   ├── constants.ts                   # POPULAR_PER_CHAIN — popular token symbols per chain
│   ├── types.ts                       # All Bungee API types + BungeeStatusCode enum
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
│       ├── BridgeButton.tsx           # The whole execution state machine (paths A/B/C)
│       └── BridgeStatus.tsx           # Cross-chain progress with [source chain logo] → [dest chain logo]
├── api/bridge/
│   ├── bungee.ts                      # Shared BUNGEE_API_URL + bungeeHeaders()
│   ├── quote/route.ts                 # Adds fee resolution + native-token normalisation
│   ├── build-tx/route.ts
│   ├── submit/route.ts
│   ├── status/route.ts                # Accepts requestHash OR txHash
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
- **Re-quoted at execute time** in `BridgeButton.handleBridge` because Bungee quoteIds expire ~60s.
- Bungee returns post-fee amounts; the UI shows fee % and a "Premium" badge when the proxy reports `isPremiumFee: true`.

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
| `BUNGEE_API_URL` | no | Defaults to `https://public-backend.bungee.exchange`. Set to `https://dedicated-backend.bungee.exchange` for production. |
| `BUNGEE_AFFILIATE_ID` | yes (prod) | `affiliate` header. Required by the dedicated backend. |
| `BUNGEE_FEE_RECIPIENT` | optional | Address that receives integrator fees. **Must be whitelisted by Bungee for this affiliate id** or quotes will fail. Leave blank to disable integrator fees while sorting whitelisting. |

All defined in `apps/website/.env.local` (see `.env.local.example`).

## Constants Reference

| Constant | Value | Location | Purpose |
|---|---|---|---|
| `BUNGEE_NATIVE_TOKEN` | `0xeeee…eeee` (all-lowercase) | `bridge/types.ts` | Bungee's native sentinel |
| `NATIVE_TOKEN_ADDRESS` | `0xEeee…EEeE` (mixed-case) | `bridge/types.ts` | Universal mixed-case form; routes normalize to the lowercase one |
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

- **Quote**: extension calls the same proxy via a new `fetchBridgeQuote` background message → `https://walletchan.com/api/bridge/quote`. Same response shape, same `isPremiumFee` tier — no separate sWCHAN logic lives in the extension.
- **Build**: at confirm time, the extension re-quotes (Bungee quoteIds expire ~60s) and then calls `fetchBridgeBuildTx` for the firm `{ approvalData?, txData }`.
- **Execute**: bridge txs flow through the existing swap handlers — `executeSwapDirect` (PK / Seed, per-call gas tier override) or `executeSwapBatch` (Bankr atomic ERC-7821). The bridge call entry carries a `bridge` field on `SwapTxEntry`, which is persisted onto the `CompletedTransaction.bridge` shape.
- **Route selection**: prefer `manualRoutes[0]` because `/build-tx` can refresh firm calldata. If no manual route exists but `autoRoute.txData` is present, the extension treats that auto route as executable tx data and stages it directly. This covers Bungee pairs such as native XPL on Plasma → USDC on Base, where the quote can return `manualRoutes: []` and an `autoRoute` with `userOp: "tx"`.
- **Source-tx confirmation**: standard `txReceiptPoller` (no change). Bridge metadata is set on the tx-history entry at submission time and updated by the status poller as Bungee progresses.
- **Destination polling**: `bridgeStatusPoller` polls `/api/bridge/status?txHash=<sourceTxHash>` every 5s → 30s (15-min cap). Pending bridges persist in `chrome.storage.local` under `pendingBridges`; `runtime.onStartup` resumes interrupted polls.
- **Notification**: on `FULFILLED` / `SETTLED` / `REFUNDED` / `EXPIRED` / `CANCELLED`, `chrome.notifications.create` fires with the destination explorer URL stored under `notification-<id>` so clicking the toast jumps to the destination tx.
- **UI**: `SwapConfirmation.tsx` accepts an optional `bridgeMeta` prop — title flips to "Confirm Bridge", network row shows source → destination chains, route + ETA row appears. Gas plumbing is unchanged. `TxStatusList.tsx` renders a "Source Confirmed / Bridging to X" status until terminal, then "Bridge Complete" or "Refunded". `TxDetailModal.tsx` adds a "Destination" block with the destination tx-hash link, Bungee route name, and current status code.

**Wallet-type coverage**: Bankr (ERC-7821 atomic batch), PrivateKey (sequential broadcast with gas tier override), SeedPhrase (sequential broadcast). Impersonator is blocked at entry, same as same-chain swaps.

**Auto / Permit2 signature path is intentionally not implemented in the extension.** Auto routes that include `txData` are supported because they execute like normal bridge transactions. Auto routes that require `signTypedData` still remain unsupported; Permit2 adds an EIP-712 signing surface none of the existing swap handlers exercise.

**Key files**:

| File | Purpose |
|---|---|
| `apps/extension/src/chrome/bridgeApi.ts` | `fetchBridgeQuote`, `fetchBridgeBuildTx`, `fetchBridgeStatus`, 24h-cached chains + tokens helpers |
| `apps/extension/src/chrome/bridgeChainsResolver.ts` | `getBridgeSourceChains(accountType)` / `getBridgeDestinationChains()`; source chains come from the runtime configured chain list (`getVisibleChains`, so user-added custom chains like Avalanche are included for PK/Seed accounts) and are kept when either 0x supports same-chain swaps or Bungee supports bridge origins. Destination chains use Bungee's EVM list. |
| `apps/extension/src/chrome/bridgeStatusPoller.ts` | In-memory poller + `maybeStartBridgePolling` hook + `resumePendingBridgePollers` |
| `apps/extension/src/chrome/pendingBridgeStorage.ts` | `pendingBridges` chrome.storage.local key with mutex-locked writes |
| `apps/extension/src/components/Swap/BridgeChainTokenModal.tsx` | Unified sell/buy chain + token dropdown; sell mode uses source chains, buy mode uses destination chains |

## Common Errors

| Error | Cause | Fix |
|---|---|---|
| `feeTakerAddress is not whitelisted for this integrator` | `BUNGEE_FEE_RECIPIENT` not whitelisted by Bungee for the affiliate | Ask Bungee to whitelist the address, set the whitelisted address, or blank the env var |
| `No bridge routes available for this pair` | Pair / amount unsupported by Bungee's route discovery | Try a different amount or pair |
| `tokens.find is not a function` (historical) | Assumed `/tokens/list` returned a flat array — it's keyed by chainId | Fixed in `useBridgeTokens.ts` |
| Button stuck on "Waiting for confirmation" after batched call (historical) | Bundle status reaction ran during render | Fixed by moving to `useEffect` with `useWaitForCallsStatus` |
