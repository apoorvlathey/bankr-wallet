# WCHAN Vault Indexer Implementation

Ponder-based indexer for the sWCHAN ERC-4626 vault on Base. Tracks vault snapshots (Deposit, Withdraw, Donate, DonateReward, EarlyWithdrawPenalty) for APY calculation, and Transfer events for per-user staked balance tracking.

## Contract

- **sWCHAN Vault**: Configured via `@walletchan/contract-addresses` (`DRIP_ADDRESSES[8453].wchanVault`)
- **Type**: ERC-4626 tokenized vault with donation/penalty mechanics
- **Chain**: Base (8453)
- **Start Block**: `42708895`

## Schema

### `vault_snapshot`

Stores every vault event with onchain totalAssets/totalShares for APY tracking.

| Column          | Type    | Description                                        |
| --------------- | ------- | -------------------------------------------------- |
| id              | text PK | `{txHash}-{logIndex}`                              |
| eventType       | text    | `"deposit"` / `"withdraw"` / `"donate"` / `"donate_reward"` / `"penalty"` |
| sender          | hex     | Address that initiated the tx                      |
| totalAssets     | bigint  | Vault's total underlying assets after event        |
| totalShares     | bigint  | Vault's total share supply after event             |
| wchanAmount     | bigint  | WCHAN amount (deposits, withdraws, donations)      |
| wethAmount      | bigint  | WETH amount (donate rewards)                       |
| penaltyAmount   | bigint  | Early withdraw penalty total                       |
| burnedAmount    | bigint  | Burned portion of penalty                          |
| retainedAmount  | bigint  | Retained portion of penalty                        |
| blockNumber     | bigint  |                                                    |
| timestamp       | bigint  |                                                    |
| transactionHash | hex     |                                                    |

Indexes: `timestamp`, `eventType`

### `user_balance`

Current staked balance per user, updated on every Transfer event.

| Column               | Type    | Description                      |
| -------------------- | ------- | -------------------------------- |
| id                   | text PK | Lowercased address               |
| shares               | bigint  | Current vault share balance      |
| lastUpdatedBlock     | bigint  | Block of last balance change     |
| lastUpdatedTimestamp | bigint  | Timestamp of last balance change |

## Event Handlers

### `WCHANVault:Transfer`

Updates `user_balance` for both sides of the transfer:

- **From address** (skip if `0x0` mint): decrement shares
- **To address** (skip if `0x0` burn): increment shares

Uses read-then-upsert pattern (`find` -> `insert`/`onConflictDoUpdate`).

### `WCHANVault:Deposit` / `WCHANVault:Withdraw`

Reads onchain `totalAssets()` and `totalSupply()` post-event, stores snapshot for APY calculation.

### `WCHANVault:Donate` / `WCHANVault:DonateReward` / `WCHANVault:EarlyWithdrawPenalty`

Stores snapshot using event args (totalAssets/totalShares included in events).

## API Endpoints

Port: **42072**

| Endpoint             | Method | Description                                                        |
| -------------------- | ------ | ------------------------------------------------------------------ |
| `/balances/:address` | GET    | Single user's sWCHAN share balance (`shares: "0"` if not found)    |
| `/balances`          | GET    | All users with non-zero balance, paginated, ordered by shares desc |
| `/apy`               | GET    | APY calculation with configurable window (`?window=7d\|30d\|all`)  |
| `/apy/history`       | GET    | Share price history for charting                                   |
| `/snapshots`         | GET    | Raw vault events, paginated, optional `?type=` filter              |
| `/stats`             | GET    | Aggregate stats (events, donations, share price, totals)           |
| `/graphql`           | POST   | Auto-generated GraphQL from schema                                 |

### Query Parameters

- `limit` (default: 50, max: 200) — pagination limit
- `offset` (default: 0) — pagination offset

## Use Cases

### Token-Gating Bot (Primary)

The TG bot queries `/balances/:address` to check sWCHAN staked balance for:
- New user verification (`POST /api/verify` — sWCHAN only)
- Periodic balance checks (combined with sBNKRW staking-indexer for backwards compat)

### Staking Dashboard

The website stake page uses `/apy` for APY display, `/apy/history` for charts, `/stats` for aggregate metrics.

## Running

```bash
# Development (port 42072)
pnpm dev:wchan-vault-indexer

# Environment
PONDER_RPC_URL_8453=<base-rpc-url>  # Required
DATABASE_URL=<postgres-url>          # Optional (uses PGlite locally)
```
