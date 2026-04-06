# Swap Page

`/swap` route on the website. Allows users to buy any ERC20 token on Base using ETH. Not linked from the navbar — accessed directly or via shareable URLs.

## Architecture

```
User → SwapCard (UI) → useSwapQuote hook → /api/swap/price (Next.js route) → 0x API
                                          → /api/swap/quote (Next.js route) → 0x API
```

### Why server-side API routes?
- **0x API key** (`ZEROX_API_KEY`) stays server-side, never exposed to client
- **Fee params** (`swapFeeRecipient`, `swapFeeBps`, `swapFeeToken`) injected server-side so clients can't bypass or modify fees
- **Shared by both website and extension** — the extension's swap UI (`apps/extension/src/chrome/swapApi.ts`) calls the same `/api/swap/*` endpoints

### Multi-chain support
- The **website** swap page is Base-only (`SWAP_CHAIN_ID = 8453`)
- The **extension** swap supports all 0x-supported chains (22 chains). The server-side API routes validate against the full `SUPPORTED_CHAIN_IDS` set. The extension's eligible chains are derived from `ZEROX_SUPPORTED_CHAIN_IDS` in `chainRegistry.ts` — custom chains added by users also get swap support if their chain ID is in the 0x set.

## 0x Integration

Uses **0x Swap API v2** with the **AllowanceHolder** flow (single-signature UX, simpler than Permit2).

### Endpoints
| Endpoint | Purpose |
|---|---|
| `/swap/allowance-holder/price` | Indicative quote (read-only, no tx object) |
| `/swap/allowance-holder/quote` | Firm quote with executable transaction object |

### Headers
- `0x-api-key`: Server-side only
- `0x-version`: `v2`

### Fee Collection
- **Default fee**: 0.8% (80 bps) charged on the sell token
- **Premium fee**: 0.3% (30 bps) for users staking >= 20M sWCHAN
- **Recipient**: `process.env.SWAP_FEE_RECIPIENT`
- **Params**: `swapFeeRecipient`, `swapFeeBps` (resolved per-request), `swapFeeToken` = sellToken
- Fee tier resolved server-side in `feeResolver.ts` by checking the taker's sWCHAN balance via the WCHAN vault indexer API. Falls back to default fee on any error.
- Fee params only added if `SWAP_FEE_RECIPIENT` env var is set
- `swapFeeToken` is hardcoded to `sellToken` server-side (not from client)

### Slippage
- `slippageBps` passed from client → API routes → 0x API
- Default: 500 (5%) — optimized for memecoin trading
- Presets: 1%, 3%, 5%
- Custom input supports any value up to 50%

### Security Notes
- Never approve `transaction.to` (the Settler contract) — only approve `issues.allowance.spender`
- AllowanceHolder address on Base: `0x0000000000001fF3684f28c67538d4D072C22734`
- Native ETH address for 0x: `0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE`

## File Structure

```
apps/website/app/
├── swap/
│   ├── page.tsx                    # Page layout (Bauhaus blue bg, decorators)
│   ├── constants.ts                # Chain ID, token addresses, slippage presets
│   ├── hooks/
│   │   ├── useTokenInfo.ts         # Fetches ERC20 name/symbol/decimals via multicall
│   │   └── useSwapQuote.ts         # Price fetching (debounced), firm quote, formatting
│   └── components/
│       ├── SwapCard.tsx            # Main form: token input, ETH input, output, URL sync
│       ├── SwapButton.tsx          # Swap execution: chain switch → approve → quote → send
│       ├── QuoteDisplay.tsx        # Collapsible quote breakdown (min received, fees, route)
│       └── SlippageSettings.tsx    # Popover with preset buttons + custom input
├── api/swap/
│   ├── feeResolver.ts              # Resolves fee BPS per taker (premium vs default)
│   ├── price/route.ts              # Proxy to 0x /price endpoint (adds fees + slippage)
│   └── quote/route.ts              # Proxy to 0x /quote endpoint (adds fees + slippage)
```

## Key UI Behaviors

### Quote Fetching
- **Debounced auto-fetch** (500ms) when inputs change — no "Get Quote" button needed
- **No periodic refresh** — minimizes API calls (free tier)
- Quote clears automatically when token or amount changes

### Swap Flow (SwapButton)
1. Switch chain to Base (if needed)
2. Approve token (if ERC20 sell — not needed for ETH)
3. Fetch firm quote from `/api/swap/quote`
4. Send transaction via `sendTransactionAsync`
5. Wait for confirmation, show BaseScan link

### URL Sync
- Token address synced to `?token=` query param
- Read via `window.location.search` on mount (avoids `useSearchParams` + Suspense flash)
- Updated via `window.history.replaceState` on input change
- Enables shareable swap links: `/swap?token=0x...`

### Layout
- Token address input (resolves name + symbol badge)
- "You Pay" ETH input with balance display + Max button
- Down arrow (blue, absolutely positioned between fields)
- "You Receive" read-only output field with slippage gear icon
- Collapsible quote details (min received → expand for fees + route)
- Swap button (red, stays visible during loading with 85% opacity)

### Slippage Settings
- Compact trigger: `"5% slippage ⚙"` text above output field
- Popover (200px wide): 3 preset buttons + custom % input
- Changing slippage triggers quote re-fetch

## Environment Variables

| Variable | Purpose |
|---|---|
| `ZEROX_API_KEY` | 0x API key (server-side only) |
| `SWAP_FEE_RECIPIENT` | Address receiving swap fees |

Both defined in `apps/website/.env.local` (see `.env.local.example`).

## Constants Reference

| Constant | Value | Location | Purpose |
|---|---|---|---|
| `SWAP_CHAIN_ID` | `8453` | `swap/constants.ts` | Base chain |
| `DEFAULT_FEE_BPS` | `"80"` | `api/swap/feeResolver.ts` | 0.8% default fee |
| `PREMIUM_FEE_BPS` | `"30"` | `api/swap/feeResolver.ts` | 0.3% premium fee (>= 20M sWCHAN) |
| `NATIVE_TOKEN_ADDRESS` | `0xEeee...eEEeE` | `swap/constants.ts` | Native ETH placeholder for 0x |
| `WETH_ADDRESS` | `0x4200...0006` | `swap/constants.ts` | WETH on Base |
| `DEFAULT_SLIPPAGE_BPS` | `500` | `swap/constants.ts` | 5% default slippage |
| `SLIPPAGE_PRESETS` | `[100, 300, 500]` | `swap/constants.ts` | 1%, 3%, 5% |
