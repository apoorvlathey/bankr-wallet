# Fee Indexer Implementation

Ponder-based indexer for tracking historical fee claims from ClankerFeeLocker and WCHANDevFeeHook contracts on Base. Provides aggregated totals of ETH and BNKRW claimed, used by the admin dashboard.

## Contracts

| Contract | Address | Event | Start Block |
|----------|---------|-------|-------------|
| ClankerFeeLocker | `0xF3622742b1E446D92e45E22923Ef11C2fcD55D68` | `ClaimTokens(address indexed feeOwner, address indexed token, uint256 amountClaimed)` | 41506598 |
| WCHANDevFeeHook | `0xD36646b7Aa77707c47478f64C1770e4c2F3f20cc` | `WethClaimed(address indexed dev, uint256 amount)` | 42607730 |

## Architecture

### Why a Separate Indexer

The admin dashboard reads **pending** (unclaimed) fees onchain. This indexer tracks **historical claimed** amounts — data that can't be derived from current contract state. Kept separate from the coin launch indexer and staking indexer for independent scaling and reindexing.

### Event Filtering

**ClankerFeeLocker** is a shared contract — all clanker deployers claim fees through it. To avoid fetching thousands of irrelevant events, the `ponder.config.ts` uses RPC-level topic filtering via `filter.args` on the indexed `feeOwner` and `token` parameters:
- `feeOwner` must match `0x74992be74bc3c3A72E97dF34A2C3A62c15f55970`
- `token` must be WETH (`0x4200000000000000000000000000000000000006`) or BNKRW (`0xf48bC234855aB08ab2EC0cfaaEb2A80D065a3b07`)

The handler also has a redundant JS-level filter as a safety net.

**WCHANDevFeeHook** `WethClaimed` events are all indexed (no filtering needed).

## File Structure

```
apps/fee-indexer/
├── abis/
│   ├── ClankerFeeLockerAbi.ts    # ClaimTokens event ABI
│   └── WCHANDevFeeHookAbi.ts     # WethClaimed event ABI
├── src/
│   ├── index.ts                  # Event handlers
│   └── api/
│       └── index.ts              # REST API (/stats endpoint)
├── ponder.config.ts              # Two contracts on Base
├── ponder.schema.ts              # clanker_claim + hook_claim tables
├── ponder-env.d.ts               # Ponder virtual module types
├── package.json
├── tsconfig.json
├── .env.example
├── .gitignore
├── railway.toml                  # Railway deployment config
└── Dockerfile                    # Railway Docker build
```

## Schema

### `clanker_claim`

Stores filtered ClaimTokens events (only our feeOwner, only WETH/BNKRW).

| Column          | Type    | Description                              |
|-----------------|---------|------------------------------------------|
| id              | text PK | `{txHash}-{logIndex}`                    |
| token           | hex     | WETH or BNKRW address                   |
| amount          | bigint  | amountClaimed (raw wei)                  |
| blockNumber     | bigint  |                                          |
| timestamp       | bigint  |                                          |
| transactionHash | hex     |                                          |

Indexes: `token`, `timestamp`

### `hook_claim`

Stores all WethClaimed events.

| Column          | Type    | Description                              |
|-----------------|---------|------------------------------------------|
| id              | text PK | `{txHash}-{logIndex}`                    |
| dev             | hex     | Developer address                        |
| amount          | bigint  | WETH amount (raw wei)                    |
| blockNumber     | bigint  |                                          |
| timestamp       | bigint  |                                          |
| transactionHash | hex     |                                          |

Indexes: `dev`, `timestamp`

## Event Handlers

### `ClankerFeeLocker:ClaimTokens`

1. RPC-level filter in `ponder.config.ts` ensures only events with our `feeOwner` and WETH/BNKRW `token` are fetched
2. Handler has redundant JS-level check (safety net) — skip if not matching
3. Insert into `clanker_claim` with `onConflictDoNothing` for idempotency

### `WCHANDevFeeHook:WethClaimed`

1. Insert all events into `hook_claim` with `onConflictDoNothing`

## API

Port: **42071** (coin indexer=42069, staking indexer=42070)

### `GET /stats`

Returns aggregated claimed totals as raw wei strings:

```json
{
  "clankerEth": "123456789...",
  "clankerBnkrw": "123456789...",
  "hookEth": "123456789...",
  "totalEth": "246913578...",
  "totalBnkrw": "123456789..."
}
```

| Field          | Description                                    |
|----------------|------------------------------------------------|
| `clankerEth`   | Total WETH claimed from ClankerFeeLocker       |
| `clankerBnkrw` | Total BNKRW claimed from ClankerFeeLocker      |
| `hookEth`      | Total WETH claimed from WCHANDevFeeHook        |
| `totalEth`     | `clankerEth + hookEth`                         |
| `totalBnkrw`   | Same as `clankerBnkrw`                         |

Uses SQL `SUM` over claim tables. Volume is low (infrequent claims), so aggregation on read is fine.

## Key Constants

Hardcoded in handler (indexer-specific, not from shared package):

| Constant | Value |
|----------|-------|
| `CLANKER_FEE_OWNER` | `0x74992be74bc3c3A72E97dF34A2C3A62c15f55970` |
| `WETH` | `0x4200000000000000000000000000000000000006` |
| `BNKRW` | `0xf48bC234855aB08ab2EC0cfaaEb2A80D065a3b07` |

## Running

```bash
# Development (port 42071)
pnpm dev:fee-indexer

# Production
pnpm start:fee-indexer
```

### Environment Variables

Copy `.env.example` to `.env.local`:

| Variable              | Required | Description                              |
|-----------------------|----------|------------------------------------------|
| `PONDER_RPC_URL_8453` | Yes      | Base RPC URL                             |
| `DATABASE_URL`        | No       | PostgreSQL URL (uses PGlite locally)     |

## Deployment (Railway)

Uses `Dockerfile` + `railway.toml` pattern (same as staking-indexer):
- `railway.toml` sets `dockerfilePath` and start command with `--schema $RAILWAY_DEPLOYMENT_ID` for zero-downtime deploys
- Set `PONDER_RPC_URL_8453` and `DATABASE_URL` as Railway env vars
- Do NOT set Root Directory, Build Command, or Start Command in the Railway UI

## Consumer

The admin dashboard (`apps/website/app/admin/AdminContent.tsx`) fetches `/stats` to display total claimed fees alongside the onchain pending fee reads.
