# Railway Deployment (pnpm Monorepo)

Railway's default Nixpacks builder does **NOT** work for this pnpm monorepo with `workspace:*` dependencies. Always use a **Dockerfile** + **`railway.toml`**.

## Pattern

See `apps/indexer/` for the reference setup.

- `Dockerfile`: `node:20-slim`, enable corepack/pnpm, copy workspace root files + the app + any `packages/*` workspace deps, `pnpm install --frozen-lockfile --filter <pkg>`
- `railway.toml`: sets `dockerfilePath` (from repo root), deploy config
- Do **NOT** set Root Directory, Build Command, or Start Command in the Railway UI — `railway.toml` handles it
- For Ponder indexers: start command uses `--schema $RAILWAY_DEPLOYMENT_ID` for zero-downtime deploys (see [`INDEXER.md`](./INDEXER.md))

## Env loading

- **Local dev**: Node apps need `--env-file=.env` flag for `tsx`/`node` to pick up `.env`.
- **Railway prod**: env vars are injected directly. No `.env` file needed in the deployed container.

## Apps currently deployed on Railway

- `apps/indexer/` — Ponder indexer for coin launches
- `apps/staking-indexer/` — Ponder indexer for sBNKRW vault staking (legacy)
- `apps/wchan-vault-indexer/` — Ponder indexer for sWCHAN
- `apps/tg-bot/` — Token-gated Telegram bot
- `apps/arb-bot/` — Cross-pool arbitrage bot
