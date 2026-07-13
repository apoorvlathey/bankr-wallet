# Pending request tests

- `resolution.test.ts` protects synchronous first-action claims, effect leases,
  retries, reset behavior, and all wallet request families.
- `lifecycle.test.ts` covers confirm-time authority checks, durable expiry, and
  cleanup across injected and WalletConnect request stores.
- `promptCapacity.test.ts` enforces per-origin bounds for connection, chain,
  and asset prompts.

Storage listener behavior used to await a durable result is isolated in
`../storage/resultWaiter.test.ts`.
