# Privacy vault tests

This directory covers the encrypted Privacy Pools recovery domain. The tests
also pin the official SDK provenance, fixed derivation vectors, and every
locally packaged circuit artifact by exact size and SHA-256. The tests
pin the background-only pure SDK source alias and reject prover/Blob-worker
code at the service-worker bundle boundary. They also pin the three-width
lightweight Poseidon adapter and compare it with official SDK/fixed vectors.
They
freeze the released record shape, prove first-open initialization is
idempotent for every custody account type, and keep agent/view-only sessions
away from secret creation. They also cover existing biometric-factor upgrades
for private-key/seed/Ledger/Bankr accounts and master-wrapper recovery before removing
a passkey-only compatibility factor.

The prover tests freeze its exact request/result codecs, reject arbitrary
inputs and proof-shaped responses, bind the offscreen request to a fresh nonce,
and cover single-flight, timeout cleanup, and successful retry behavior. The
budget verifier freezes package/artifact/worker/background ceilings; packaged
Chromium QA enforces first/restart duration and process-tree RSS delta. The
distribution gate records the GPL-3.0-only v4 decision, requires packaged
GPL, attribution, and source notices, and requires version 4.0.0 or later for
release targets. Firefox remains explicitly offscreen-feature-gated.
Deployment tests pin both official ETH manifests, prove the compile-time
development/Sepolia and production/mainnet selection, enforce the
three-request JSON-RPC batch ceiling, and reject
chain, proxy, bytecode, pool, verifier, scope, asset, or fee drift.
Deposit quote tests cover exact input, the 0.001 ETH minimum, `uint256` safety,
the absence of an arbitrary maximum, onchain fee arithmetic,
gas reserve/Max math, private-key/seed-phrase/Ledger/Bankr account pinning,
impersonator rejection, and generic RPC failure mapping. The quote has no
signing capability; separate operation, confirmation, receipt, and commitment
tests own the submission lifecycle.
Deposit intent tests pin the exact selector and encoding, independently decode
every reviewed field, and reject selector, length, route, fee, and
submittability drift. Preparation tests cover password and biometric master
sessions for private-key/seed-phrase/Ledger/Bankr accounts, agent and impersonator
rejection, deterministic review-only derivation, and the absence of storage
writes or secret-bearing response fields.
Operation tests cover a distinct non-submittable durable intent, one reserved
index per private-key/seed-phrase/Ledger/Bankr account, passkey-authorized preparation,
agent rejection, encrypted detail round trips, and summary-bound AAD. Router
and UI model tests separately prove that calldata, precommitment, index,
request IDs, dedupe fields, and ciphertext never cross into Activity.
Wallet-type policy tests require production private-key, seed-phrase, Ledger,
and Bankr Shield/public-recovery paths, preserve Sepolia's Bankr mutation
restriction, reject impersonators, pin the final Bankr
authorization-before-effect ordering, and keep Ledger public-exit batching
fail-closed while its single-transaction effect boundary remains covered.
Recovery tests cover explicit main-password reveal, BIP-39 restore, backup
markers, passkey-only master-wrapper upgrade, rebuildable database reset, and
bounded rescan. ASP tests cover approved/declined/removed/malformed/root-drift
and unavailable recovery. Account/reset safety tests prove unresolved or
unspent state blocks deletion and that destructive reset requires the exact
acknowledgement while deleting every privacy store.
Private portfolio tests bind the encrypted eight-day balance/price snapshots
to their public record headers and reject plaintext or schema additions.
`commitmentProofBinding.test.ts` generates a real proof from the pinned Wasm and
zkey and checks all four public signals. This specifically prevents the SDK
1.2.0 deposit precommitment (`Poseidon(nullifier, secret)`) from being confused
with the circuit's spent-nullifier hash (`Poseidon(nullifier)`). The production
packaged self-test performs the same semantic four-signal comparison through
the offscreen bridge; proof validity by itself is not sufficient.
`qa:extension:privacy-prover` additionally
runs and locally verifies both packaged proofs twice in Chromium across a
closed/reopened extension page.
