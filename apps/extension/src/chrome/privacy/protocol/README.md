# Privacy Pools protocol boundary

This background-only directory is the narrow adapter around the pinned 0xbow
SDK and locally packaged circuit artifacts.

- `manifest.ts` validates and freezes the checked-in SDK/artifact manifest.
- `artifacts.ts` loads only `chrome-extension://` artifacts and rechecks exact
  byte lengths and SHA-256 digests before releasing bytes to a prover.
- `primitives.ts` exposes bounded derivation and commitment operations without
  exposing SDK custody, contract signing, RPC, or submission helpers.
- `poseidonLite.ts` supplies only the SDK's three used Poseidon widths through
  exact pinned functions and fixed/differential compatibility vectors.

The renderer and content scripts must not import this directory. The sibling
`prover/` domain may load these artifacts only from the packaged extension
origin. Secret release, balance inputs, RPC, and transaction submission remain
deliberately unimplemented.

`primitives.ts` also normalizes an upstream naming hazard. In SDK 1.2.0 the
two-input deposit precommitment is exposed as `Commitment.nullifierHash`.
WalletChan treats that value only as
`precommitment = Poseidon(nullifier, secret)` and independently derives the
spent-note `nullifierHash = Poseidon(nullifier)`. Real commitment proofs must
bind public signals in the circuit order
`[commitmentHash, nullifierHash, value, label]`. Both values and their
non-equality are pinned by vectors, a real-artifact regression, and the
packaged production self-test.

The MV3 background build resolves the package root to its pure SDK crypto
source and its hashing dependency to this three-width adapter. This keeps
prover workers and unused all-width Poseidon initialization out of service
worker startup; the build fails if either dependency leaks back in.
