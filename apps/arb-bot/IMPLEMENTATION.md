# Arb Bot: WETH↔WCHAN / WETH↔BNKRW Cross-Pool Arbitrage

## Overview

The arb bot detects price divergence between two Uniswap V4 pools on Base and executes atomic two-leg arbitrage swaps through the Universal Router. Since BNKRW↔WCHAN is always 1:1 (wrap/unwrap), any price difference between the two WETH-denominated pools is a pure arbitrage opportunity.

### The Two Pools

| Pool       | Pair       | Fee                | Tick Spacing | Hook                           |
| ---------- | ---------- | ------------------ | ------------ | ------------------------------ |
| **Direct** | WETH↔WCHAN | 0 (static)         | 60           | DEV_FEE_HOOK (`0xCC3C...`)     |
| **BNKRW**  | WETH↔BNKRW | 0x800000 (dynamic) | 200          | oldTokenPoolHook (`0xb429...`) |

A third pool (BNKRW↔WCHAN via WCHAN_WRAP_HOOK) provides 1:1 conversion, making the two WETH pools directly comparable.

### Zero-Capital Arbitrage

In Uniswap V4's delta accounting system, both swap legs execute within a single `unlock` callback. The net WETH delta is positive (the pool owes us WETH), so **no upfront capital or SETTLE is needed**. The only cost is gas.

---

## Architecture

```
src/
├── index.ts            # Main poll loop — orchestrates the full pipeline
├── config.ts           # Environment variables and defaults
├── client.ts           # Viem public + wallet clients (Base chain)
├── logger.ts           # Timestamped console logger with DEBUG mode
├── poolState.ts        # Read pool slot0 via PoolManager.extsload multicall
├── priceComparison.ts  # Compare sqrtPriceX96 values, detect arb direction
├── arbSearch.ts        # Coarse parallel search + ternary refinement
├── arbEncoder.ts       # Encode atomic 2-leg arb via Universal Router
└── gasEstimation.ts    # Gas limit + fee estimation with buffers
```

Shared swap logic lives in `@walletchan/wchan-swap` (workspace package at `packages/wchan-swap/`).

---

## Poll Loop (`index.ts`)

Each poll cycle runs these steps:

```
1. Read pool states          — raw JSON-RPC batch: both slot0 in 1 HTTP request
2. Detect arb direction      — compare sqrtPriceX96 between pools (local, no RPC)
3. Find optimal amount       — coarse search (10 candidates, 2 HTTP) + ternary refinement (2 HTTP per iter)
4. Encode arb transaction    — atomic 2-leg swap via Universal Router (local, no RPC)
5. Estimate gas + simulate   — single batch: estimateGas + priorityFee + baseFee (1 HTTP)
6. Check profitability       — profit - gas cost > MIN_PROFIT_WEI (local)
7. Send transaction          — aggressive gas pricing, local nonce, 30s deadline
8. Wait for receipt          — log success/failure
9. If success, re-poll immediately (skip sleep — pool state changed)
```

On error, the bot increments `consecutiveErrors` and exits after 10 consecutive failures. Successful polls (even with no opportunity) reset the counter.

---

## Pool State Reading (`poolState.ts`)

Reads both pool prices in a single RPC round-trip using `PoolManager.extsload`:

1. **Pre-compute at startup**: PoolId, slot0 key, and extsload calldata are computed once at module load (all are constants for a given chainId)
2. **Raw JSON-RPC batch**: Both `extsload` calls sent as a single batch fetch (bypasses viem multicall overhead)
3. **Decode packed slot0**:
   - Bits 0–159: `sqrtPriceX96` (uint160)
   - Bits 160–183: `tick` (int24, signed)
   - Bits 184–207: `protocolFee` (uint24)
   - Bits 208–231: `lpFee` (uint24)

Balance is only fetched once at startup (not every poll) since it's only needed for informational logging.

---

## Price Comparison (`priceComparison.ts`)

Both pools have WETH as `currency0` because WETH (`0x4200...0006`) sorts before both WCHAN (`0xBa5E...`) and BNKRW (`0xf48b...`).

`sqrtPriceX96 = sqrt(token1 / token0)` — higher value means token1 (WCHAN or BNKRW) is more expensive relative to WETH.

Since BNKRW↔WCHAN is 1:1, we compare the two sqrtPriceX96 values directly:

| Condition                          | Meaning                         | Arb Direction                                 |
| ---------------------------------- | ------------------------------- | --------------------------------------------- |
| `directSqrtPrice > bnkrwSqrtPrice` | WCHAN costs more on direct pool | Buy cheap via BNKRW, sell expensive on direct |
| `directSqrtPrice < bnkrwSqrtPrice` | WCHAN costs less on direct pool | Buy cheap on direct, sell expensive via BNKRW |

Price divergence is measured in basis points. Opportunities below 1 bps are ignored.

---

## Optimal Amount Search (`arbSearch.ts`)

The profit curve for an arb is concave (unimodal) — small amounts have low absolute profit, huge amounts move the price too much. We find the peak via:

### Phase 1: Coarse Search

Generate 10 log-spaced WETH amounts from 0.0001 to 10 ETH. The `batchSimulateArbs` function simulates all 10 in just **2 HTTP requests**:

1. Batch all 10 leg1 quotes into a single JSON-RPC batch → 10 results
2. For each successful leg1, build leg2 calldata → batch all leg2 quotes in a single request

### Phase 2: Ternary Refinement

Around the most profitable coarse candidate, run up to 15 ternary search iterations. Each iteration:

1. Divide the range `[lo, hi]` into thirds at `m1` and `m2`
2. `batchSimulateArbs([m1, m2])` — both candidates batched together (2 HTTP requests)
3. Narrow the range by discarding the less profitable third

Stops when range < 0.00001 ETH.

### Quote Batching

The `batchQuote` function sends multiple `eth_call` requests as a JSON-RPC batch array in a single HTTP request. The key optimization is that `batchSimulateArbs` groups **all candidates' leg1 quotes** into one batch, then **all leg2 quotes** into another — so the coarse phase uses exactly 2 HTTP requests regardless of candidate count.

---

## Arb Encoding (`arbEncoder.ts`)

Encodes an atomic 2-leg arb as a single Universal Router `execute` call:

### buy-direct-sell-bnkrw (WCHAN cheaper on direct)

```
Universal Router Commands: V4_SWAP(0x10) + SWEEP(WETH) + SWEEP(WCHAN)

V4 Actions: 0x06 07 0f 0f
  SWAP_EXACT_IN_SINGLE: WETH→WCHAN on direct pool
  SWAP_EXACT_IN:        WCHAN→BNKRW→WETH multi-hop (1:1 unwrap + sell)
  TAKE_ALL(WETH, 0)     — collect net WETH profit to router
  TAKE_ALL(WCHAN, 0)    — collect any dust WCHAN
```

### buy-bnkrw-sell-direct (WCHAN cheaper via BNKRW)

```
V4 Actions: 0x07 06 0f 0f
  SWAP_EXACT_IN:        WETH→BNKRW→WCHAN multi-hop (buy + 1:1 wrap)
  SWAP_EXACT_IN_SINGLE: WCHAN→WETH on direct pool
  TAKE_ALL(WETH, 0)
  TAKE_ALL(WCHAN, 0)
```

Then SWEEP both tokens from the router back to MSG_SENDER.

Slippage is applied to both the intermediate output (`minLeg1Out`) and the final WETH output (`minWethOut`) using the configured `SLIPPAGE_BPS` (default 0.3%).

---

## Gas Estimation (`gasEstimation.ts`)

All three RPC calls in a single JSON-RPC batch (1 HTTP request):

1. **`eth_estimateGas`**: Simulates the full tx, gets gas usage, reverts on failure
2. **`eth_maxPriorityFeePerGas`**: Current priority fee
3. **`eth_getBlockByNumber("latest")`**: Gets `baseFeePerGas`

Buffers:

- 20% on gas limit
- 20% on priority fee
- `maxFeePerGas = 2 * baseFee + priorityFee` (EIP-1559 standard)

If `estimateGas` reverts, the opportunity is stale and we skip it. No separate `eth_call` simulation needed since `estimateGas` already validates the tx.

---

## Revert Protection

Multiple layers prevent sending transactions that would fail:

1. **Gas estimation as simulation** — `estimateGas` reverts on stale state
2. **`minAmountOut`** on both swap legs — tx reverts if profit drops below threshold
3. **30-second deadline** — prevents stale tx inclusion in future blocks
4. **Local nonce tracking** — avoids nonce conflicts, resets on any error
5. **Graceful error handling** — log and continue polling on any error

---

## Configuration

| Env Var            | Required | Default         | Description                                          |
| ------------------ | -------- | --------------- | ---------------------------------------------------- |
| `PRIVATE_KEY`      | Yes      | —               | Bot wallet private key (hex with 0x prefix)          |
| `BASE_RPC_URL`     | Yes      | —               | Base chain RPC endpoint                              |
| `POLL_INTERVAL_MS` | No       | `2000`          | Milliseconds between polls (matches Base block time) |
| `MIN_PROFIT_WEI`   | No       | `1000000000000` | Minimum net profit in wei (0.000001 ETH)             |
| `SLIPPAGE_BPS`     | No       | `30`            | Slippage tolerance in bps (0.3%)                     |
| `DEBUG`            | No       | —               | Set to any value to enable debug logging             |

---

## Deployment

### Local Development

```bash
cp apps/arb-bot/.env.example apps/arb-bot/.env
# Fill in PRIVATE_KEY and BASE_RPC_URL
pnpm dev:arb-bot
```

### Railway

Uses Docker via `railway.toml`:

- Dockerfile copies `packages/wchan-swap/` (workspace dependency) + `apps/arb-bot/`
- `ON_FAILURE` restart policy with 10 retries
- Set env vars in Railway dashboard

### Build

```bash
pnpm build:arb-bot    # TypeScript → dist/
pnpm start:arb-bot    # Run compiled JS
```

---

## Speed Optimizations

| Optimization                          | Impact                                                                                    |
| ------------------------------------- | ----------------------------------------------------------------------------------------- |
| **Raw JSON-RPC batch for pool state** | 1 HTTP request for both pool slot0 reads (no viem overhead)                               |
| **True batch quoting**                | All 10 coarse leg1 quotes in 1 HTTP request, all leg2 in 1 HTTP request (2 total vs 20)   |
| **Batch ternary refinement**          | Both m1+m2 candidates batched per phase (2 HTTP per iter vs 4)                            |
| **Pre-computed constants**            | Pool IDs, slot0 keys, extsload calldata, quote templates computed once at startup         |
| **No redundant simulation**           | estimateGas acts as simulation; removed separate eth_call sim (saves 1 RPC per execution) |
| **Batch gas estimation**              | estimateGas + priorityFee + baseFee in single JSON-RPC batch (1 HTTP vs 2)                |
| **Local nonce tracking**              | Avoids extra `eth_getTransactionCount` RPC per tx                                         |
| **Immediate re-poll after arb**       | Skips sleep after successful execution (pool state changed)                               |
| **No balance on hot path**            | Balance only fetched at startup, not every poll                                           |
| **Aggressive gas pricing**            | 20% priority fee buffer, 2x baseFee headroom                                              |
| **Tight poll interval**               | 2s default (matches Base block time)                                                      |

### RPC Call Budget (per poll cycle)

| Step                              | HTTP Requests | Notes                                        |
| --------------------------------- | ------------- | -------------------------------------------- |
| Read pool states                  | 1             | Raw JSON-RPC batch (2 extsload)              |
| Coarse search                     | 2             | 1 batch for all leg1s, 1 batch for all leg2s |
| Ternary refinement                | ~2 per iter   | Both candidates batched per phase            |
| Gas estimation                    | 1             | Batch: estimateGas + priorityFee + baseFee   |
| Send tx                           | 1             | sendRawTransaction                           |
| Wait receipt                      | 1+            | waitForTransactionReceipt                    |
| **Total (no opportunity)**        | **1**         | Just pool state read                         |
| **Total (with 15 ternary iters)** | **~36**       | Down from ~80+ before                        |

---

## File Dependencies

```
index.ts
├── config.ts                    (env vars)
├── client.ts                    (viem clients — only used for tx send + receipt)
│   └── config.ts
├── logger.ts
├── poolState.ts                 (reads onchain state via raw fetch)
│   ├── config.ts
│   └── @walletchan/wchan-swap (addresses, pool keys)
├── priceComparison.ts           (detects arb direction)
│   └── poolState.ts (types)
├── arbSearch.ts                 (finds optimal amount via batched quotes)
│   ├── config.ts
│   ├── logger.ts
│   ├── priceComparison.ts (types)
│   └── @walletchan/wchan-swap (quoter, pool keys)
├── arbEncoder.ts                (encodes atomic swap)
│   ├── config.ts
│   ├── priceComparison.ts (types)
│   └── @walletchan/wchan-swap (router encoding helpers)
└── gasEstimation.ts             (estimates tx cost via raw fetch batch)
    ├── config.ts
    └── logger.ts
```
