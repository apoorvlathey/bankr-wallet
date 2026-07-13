# Delegation domain tests

- `architecture.test.ts` pins all three root-facade export identities,
  one-way dependencies, authority separation, storage locking, and size caps.
- `storage.test.ts` pins the exact `customDelegates` nested schema, lowercase
  addresses, numeric-chain projection, cleanup, and concurrent mutation safety.
- `requestConstruction.test.ts` pins the EIP-7702 self-call fields and proves
  epoch-checked persistence occurs before UI notification.
- `handlers.test.ts` covers status/probe errors, PK+seed guards,
  canonical-default agent allowance, custom master capture/re-probe, stale auth,
  Set/Revoke IDs, and queued metadata.
- `authorityPolicy.test.ts` pins custom-only authority expansion and
  canonical-default-only automatic repair.

The pre-existing ERC-7715 and batch authority suites remain the live-session
and raw-signing regression tests.
