# Bankr Token Launcher Indexer

Ponder.sh indexer that tracks Bankr coin launches on Base by listening to Lock events from both the old UniswapV4ScheduledMulticurveInitializer and the new DecayMulticurveInitializer contracts. Exposes indexed data via REST and GraphQL APIs.

## Architecture

```
Base chain
    │
    │  Lock(address indexed pool, (address,uint96)[] beneficiaries)
    │  + Initialize(bytes32 indexed id, ...) from PoolManager (same tx)
    ▼
┌──────────────────────┐
│  ponder.config.ts    │  Subscribes to Lock events from both initializer contracts
└──────────┬───────────┘
           ▼
┌──────────────────────┐
│  src/index.ts        │  Filters by beneficiary pattern, reads onchain metadata,
│                      │  extracts poolId from PoolManager Initialize log in receipt
└──────────┬───────────┘
           ▼
┌──────────────────────┐
│  ponder.schema.ts    │  coin_launch table (PGlite local / Postgres prod)
└──────────┬───────────┘
           ▼
┌──────────────────────┐
│  src/api/index.ts    │  REST endpoints + auto-generated GraphQL
└──────────────────────┘
```

## Contract Details

Two initializer contracts are indexed. The token launcher migrated from the old contract to the new one; both emit the same `Lock` event with the same beneficiary pattern.

| Contract                                   | Address                                      | Start Block  | End Block    |
| ------------------------------------------ | -------------------------------------------- | ------------ | ------------ |
| UniswapV4ScheduledMulticurveInitializer    | `0xA36715dA46Ddf4A769f3290f49AF58bF8132ED8E` | `36,659,443` | `42,029,753` |
| DecayMulticurveInitializer                 | `0xD59cE43E53D69F190E15d9822Fb4540dCcc91178` | `42,019,831` | —            |

Both contracts share the same ABI for the `Lock` event:
`Lock(address indexed pool, (address,uint96)[] beneficiaries)`

The `pool` address (topic 1) is also the coin/token address. The `beneficiaries` array is non-indexed event data containing `(address account, uint96 bips)` tuples.

### PoolManager (for poolId extraction)

| Field       | Value                                                          |
| ----------- | -------------------------------------------------------------- |
| Contract    | `0x498581ff718922c3f8e6a244956af099b2652b2b` (Uniswap V4 PoolManager) |
| Event       | `Initialize(bytes32 indexed id, address indexed currency0, address indexed currency1, uint24 fee, int24 tickSpacing, address hooks, uint160 sqrtPriceX96, int24 tick)` |
| Topic0      | `0xdd466e674ea557f56295e2d0218a125ea4b4f0f6f3307b95f85e6110838d6438` |

The `Initialize` event is emitted in the same transaction as `Lock`. Since Ponder v0.8+ removed `transactionReceipt.logs`, we fetch the receipt via `context.client.getTransactionReceipt()` (a direct RPC call) and extract the poolId (`topics[1]`) from the Initialize log.

## Event Filtering

Not every `Lock` event is a Bankr coin launch. The handler filters by checking the beneficiary array for a specific pattern:

```
beneficiaries[0].account = 0x21E2ce70511e4FE542a97708e89520471DAa7A66  (fixed)
beneficiaries[1].account = 0x2Cdd33d6FF2a897180c7F4e5a20F018Bf0c16fD1  (fixed)
beneficiaries[2].account = *                                            (wildcard = creator)
beneficiaries[3].account = 0xF60633D02690e2A15A54AB919925F3d038Df163e  (fixed)
```

Filtering happens at the handler level (not config level) because beneficiaries are non-indexed event data and can't be filtered via log topics.

**Filter logic** (`src/index.ts`):

1. Reject if `beneficiaries.length !== 4`
2. Compare addresses at indices 0, 1, 3 against the known fixed addresses (case-insensitive)
3. If no match, skip the event

## Indexing Flow

For each qualifying Lock event:

1. **Extract data** - pool address (= coin address) and `beneficiaries[2]` (= creator address)
2. **Extract poolId** - fetch the transaction receipt via `context.client.getTransactionReceipt()`, scan its logs for the Initialize event from PoolManager (matched by address + topic0), read `topics[1]` as the poolId (bytes32)
3. **Read onchain metadata** - call `name()`, `symbol()`, `tokenURI()` on the coin address via `context.client.multicall()`. To optimize for 1 RPC call instead of 3.
4. **Resolve tweetUrl** - if `tokenURI` is an `ipfs://` URI, fetch the IPFS metadata and extract the `tweet_url` field. Uses a gateway fallback chain: dedicated Pinata gateway (if configured) → public `ipfs.io` → public `gateway.pinata.cloud`. If one gateway fails, the next is tried automatically.
5. **Insert into DB** - write to `coin_launch` table with `onConflictDoNothing()` for idempotency (the primary key is the lowercased coin address)

## Schema

**`coin_launch` table** (`ponder.schema.ts`):

| Column            | Type            | Description                                          |
| ----------------- | --------------- | ---------------------------------------------------- |
| `id`              | text (PK)       | Pool/coin address, lowercased                        |
| `coinAddress`     | hex             | Pool/coin address (checksummed)                      |
| `poolId`          | hex (nullable)  | Uniswap V4 pool ID (bytes32) from Initialize event   |
| `name`            | text (nullable) | From `name()` onchain call                          |
| `symbol`          | text (nullable) | From `symbol()` onchain call                        |
| `tokenURI`        | text (nullable) | From `tokenURI()` onchain call                      |
| `tweetUrl`        | text (nullable) | Resolved from IPFS tokenURI metadata (gateway fallback chain) |
| `creatorAddress`  | hex             | `beneficiaries[2].account`                           |
| `blockNumber`     | bigint          | Block the Lock event was emitted in                  |
| `timestamp`       | bigint          | Block timestamp                                      |
| `transactionHash` | hex             | Transaction that emitted the Lock event              |

**Indexes**: `creatorAddress`, `timestamp`

## API Endpoints

All endpoints are defined in `src/api/index.ts`. Ponder also auto-generates a GraphQL API at `/` and `/graphql` from the schema.

### REST

| Method | Path                      | Description                                                                         |
| ------ | ------------------------- | ----------------------------------------------------------------------------------- |
| GET    | `/coins`                  | List all coins, newest first. Query params: `limit` (default 50, max 200), `offset` |
| GET    | `/coins/:address`         | Single coin by address (lowercased for lookup). Returns 404 if not found            |
| GET    | `/coins/creator/:address` | Coins by creator address. Same pagination params as `/coins`                        |
| GET    | `/stats`                  | Returns `{ totalCoins, latestCoin }`                                                |
| GET    | `/ready`                  | Health check (built-in Ponder endpoint)                                             |

### GraphQL

Auto-generated from `ponder.schema.ts`. Available at `/` and `/graphql`. Supports filtering, sorting, and pagination out of the box.

**Note**: BigInt values (`blockNumber`, `timestamp`) are serialized as strings in REST responses via a `replaceBigInts()` helper.

## File Overview

```
apps/indexer/
├── abis/
│   ├── UniswapV4ScheduledMulticurveInitializerAbi.ts  # Lock event ABI
│   └── CoinAbi.ts                                     # name(), symbol(), tokenURI()
├── src/
│   ├── index.ts           # Event handler (filter + index)
│   └── api/
│       └── index.ts       # REST API endpoints
├── ponder.config.ts       # Chain (Base 8453) + contract config
├── ponder.schema.ts       # coin_launch table definition
├── ponder-env.d.ts        # Ponder virtual module types
├── package.json
├── tsconfig.json
├── .env.example
├── .gitignore
├── Dockerfile             # Railway deployment (Node 20 + pnpm)
└── railway.toml           # Railway deploy config
```

## Development

```bash
# From monorepo root
pnpm install

# Create env file with Base RPC URL
cp apps/indexer/.env.example apps/indexer/.env.local
# Edit .env.local with your RPC URL

# Start dev mode (uses PGlite locally, no Postgres needed)
pnpm dev:indexer

# Endpoints available at http://localhost:42069
```

## Deployment (Railway)

The indexer deploys on Railway using the Dockerfile. Key config:

- **Start command**: `sh -c 'pnpm ponder start --schema $RAILWAY_DEPLOYMENT_ID'` (zero-downtime deploys via schema namespacing; `sh -c` is required so Railway expands the env var)
- **Health check**: `/ready` endpoint
- **Required env vars**: `PONDER_RPC_URL_8453`, `DATABASE_URL` (Postgres)
- **Optional env vars**: `PINATA_GATEWAY_URL`, `PINATA_GATEWAY_TOKEN` (dedicated Pinata gateway for IPFS metadata; falls back to public gateways if not set)

## Adding New Indexed Fields

1. Add column to `coinLaunch` in `ponder.schema.ts`
2. Populate it in the handler in `src/index.ts`
3. It will automatically appear in GraphQL; add to REST endpoints in `src/api/index.ts` if custom queries are needed
4. Run `pnpm dev:indexer` - Ponder will re-index from start block
