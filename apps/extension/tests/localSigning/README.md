# Local signing tests

- `architecture.test.ts` enforces the folder/facade dependency boundary and
  exact runtime export identities.
- `broadcastAmbiguity.test.ts` proves signed bytes are never re-prepared after
  an uncertain RPC effect and that nonce tails stop safely.
