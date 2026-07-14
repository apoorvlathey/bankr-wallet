# Pending request tests

- `architecture.test.ts` enforces the single request-state folder, 400-line
  ceiling, storage/result compatibility, first-action claim ordering,
  remove-before-result terminalization, and direct background composition.
- `resolution.test.ts` protects synchronous first-action claims, effect leases,
  retries, reset behavior, and all wallet request families.
- `lifecycle.test.ts` covers confirm-time authority checks, non-expiring signing
  prompts, and explicit cleanup across injected and WalletConnect stores.
- `promptCapacity.test.ts` enforces per-origin bounds for connection, chain,
  and asset prompts.

Storage listener behavior used to await a durable result is isolated in
`../storage/resultWaiter.test.ts`.
