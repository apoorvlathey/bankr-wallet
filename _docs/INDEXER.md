# Ponder Indexer Notes

Conventions that apply to all Ponder indexers in this repo (`apps/indexer`, `apps/staking-indexer`, `apps/wchan-vault-indexer`).

## Performance: filter at the RPC level for shared contracts

**CRITICAL**: When indexing events from **shared contracts** (contracts used by many users, like ClankerFeeLocker), always use Ponder's `filter` option in `ponder.config.ts` to filter by indexed event parameters at the RPC level — do NOT rely solely on filtering inside the event handler.

Without config-level filtering, Ponder fetches **all** events from the contract via `eth_getLogs` and your handler discards 99%+ of them. With `filter.args`, the RPC node uses topic filtering to only return matching events, which is orders of magnitude faster.

```ts
// BAD: fetches ALL ClaimTokens events, filters in handler
ClankerFeeLocker: {
  abi, address, startBlock,
}

// GOOD: RPC node filters by indexed args before returning
ClankerFeeLocker: {
  abi, address, startBlock,
  filter: {
    event: "ClaimTokens",
    args: { feeOwner: "0x...", token: ["0x...", "0x..."] },
  },
}
```

**Rule of thumb**: If an event parameter is `indexed` in the ABI and you only care about specific values, put it in `filter.args`. Keep the handler-level filter as a safety net if you want.

## Deployment

Indexers run on Railway under a custom Dockerfile per app. Start command uses `--schema $RAILWAY_DEPLOYMENT_ID` for zero-downtime deploys. See [`RAILWAY.md`](./RAILWAY.md).
