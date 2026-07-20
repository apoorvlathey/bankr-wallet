# Privacy identity audit domain

This domain owns the wallet-wide Privacy Pools recovery identity and its
dedicated encryption key. It does not own pool RPC, commitments, proving,
transactions, ASP traffic, relayers, or private-balance indexing.

Current rollout status and the next-session order live in
`../../../../../_docs/PRIVACY_POOLS_HANDOFF.md`; this README is the local audit
map, not the release checklist.

## Files

- `types.ts`: versioned stored and non-secret response contracts.
- `record.ts`: exact, bounded `privacyVault` V1 codec and derivation metadata.
- `crypto.ts`: BIP-39 generation, identity encryption, key checks, and the
  fixed passkey HKDF purpose.
- `repository.ts`: the sole `chrome.storage.local.privacyVault` IO boundary.
- `vault.ts`: verified master/passkey unwrap plus credential-lifecycle
  preparation.
- `passkey.ts`: lock-held biometric compatibility initialization and commit.
- `identity.ts`: master-authorized, idempotent first-Private-mode initialization.
- `protocol/`: pinned official SDK primitives plus locally packaged,
  integrity-checked commitment/withdrawal artifacts.
- `deployment/`: exact Sepolia ETH deployment pins, bounded onchain snapshot,
  and fail-closed runtime validation.
- `deposit/`: exact-account Sepolia ETH quote plus master-only, independently
  decoded, non-submittable deposit review preparation.
- `operations/`: encrypted, account-bound Shield intent, normal WalletChan
  confirmation, receipt/event tracking, and ASP lifecycle.
- `events/`: bounded rebuildable Sepolia pool log index and canonical checkpoints.
- `commitments/`: exact-event commitment materialization, encrypted current
  note lineage, and aggregate portfolio facade.
- `asp/`: strict endpoint codecs, lifecycle orchestration, and focused
  local/onchain root and membership checks.
- `relayer/`: pinned quote signer/economics verification and bounded submission.
- `withdrawals/`: encrypted, restart-safe full/partial relayed Unshield lifecycle.
- `ragequit/`: original-depositor-only public recovery proof, confirmation, and receipt lifecycle.
- `recovery/`: explicit main-password reveal/restore, key-ID-bound backup marker,
  passkey-only master-wrapper upgrade, and bounded rescan.
- `prover/`: exact port codecs, public fixed fixtures, a Chrome offscreen host,
  a packaged worker, and the background lifecycle coordinator.
- `accountSafety.ts`: double-checked fail-closed account-removal policy.
- `resetSafety.ts`: public Shield-data/backup projection for reset acknowledgement.
- `readiness.ts`: deployment-first composition of the onchain check and fixed
  local proof check.
- `rpcPolicy.ts`: immutable three-request batch ceiling shared by readiness and
  quotes for free-tier RPC compatibility.

## Security and effects

The phrase and raw privacy key stay in the service worker except for the exact
explicit main-password-gated Settings recovery reveal. Ordinary Shield
messages return only ready or action-required status. Every production
mutation is serialized by the wallet-secret operation lock, rejects agent and
view-only phrase initialization, verifies the current auth epoch immediately
before commit, and refuses to replace malformed storage. A biometric factor
that predates Shield may create an empty passkey-only scaffold during a fresh
assertion; the phrase is still generated only after a custody account opens
Shield.

The public quote boundary reads only a selected account's balance and
simulates a throwaway deposit call; it cannot derive a note or reach a signer.
The separate review-preparation path requires a current master session, holds
the wallet-secret lock, releases the phrase only inside the service worker,
and uses the narrow protocol primitive adapter to derive a disposable
precommitment. Its exact call is independently decoded, fixed as
`submittable: false`, and neither persisted nor connected to a signer. The
`operations/` path repeats deployment/account/quote/auth checks, derives
a distinct real deposit index, and atomically stores its encrypted calldata,
precommitment, and index beside a sanitized public summary. Only the background
can convert it into a trusted, account-pinned normal transaction request. Local
private-key and seed-phrase accounts recheck the encrypted intent and master
epoch at the raw-RPC boundary; Bankr is blocked because its API does not support
Sepolia submission. Receipt and bounded pool-event sync recover the commitment,
and local/onchain ASP membership makes it privately spendable.

Full/partial Unshield verifies a signed pinned-relayer quote, both Merkle roots,
the locally generated proof, and all public signals immediately before POST.
An exact confirmed/indexed commitment is materialized before ASP approval so
pending, declined, removed, or locally-derived ASP-unavailable commitments
expose one compact public-withdrawal action; its
proof calls the ETH pool only from the exact original depositor through the same
local confirmation path. A rejected prompt restores the prior ASP state, while
success requires the exact Ragequit event before the source activity becomes
terminal. The user-rejected recovery record is kept for safe internal claim
cleanup but omitted from the Activity projection. SDK contract/submission helpers remain intentionally
unavailable, and the artifact
loader accepts only packaged Chrome-extension resources with exact size and
SHA-256 checks. The deployment reader sends one
batched, fixed public snapshot to a user-configured Sepolia RPC or WalletChan's
immutable known-chain default during diagnostic readiness checks and final
durable preparation; it does not block opening the Shield amount form. No
account, phrase, commitment, or amount is included in that fixed snapshot.
The release policy contains no mainnet deployment and enables mutations only
for the exact Sepolia manifest. The prover bridge accepts fixed self-tests plus
bounded real commitment/withdrawal inputs, runs them in a packaged single-thread
worker, and verifies every proof locally.
Contract data, proofs, signals, fixtures, and internal errors do not enter the
renderer.

Commitment derivation deliberately names both protocol hashes: deposit/event
matching uses `precommitment = Poseidon(nullifier, secret)`, while spent-note,
Unshield, rescan, onchain-nullifier, and ragequit paths use
`nullifierHash = Poseidon(nullifier)`. SDK 1.2.0 confusingly calls the first
value `nullifierHash`; `protocol/primitives.ts` verifies it only as the
precommitment and derives the real one-input hash independently. The packaged
self-test and real-artifact regression test bind all four commitment signals
as `[commitmentHash, nullifierHash, value, label]`.

The background build resolves the pinned SDK import to its pure crypto source
module. Its root barrel is not service-worker-safe because it eagerly includes
the prover's Blob-worker bootstrap. A post-bundle guard prevents that code from
entering `background.js`; the full proof stack remains in the offscreen worker.
The SDK hash import is bound to pinned, vector-matched `poseidon-lite` functions
for widths one through three, so background startup does not parse unused
all-width parameters.

The checked-in prover budget manifest caps package/artifact/worker/background
size, first/restart runtime, Chromium process-tree RSS delta, and concurrency.
The unpacked Sepolia target is allowed; GitHub, Chrome Web Store, and Firefox
packaging fail closed pending GPL-3.0 legal review. Firefox also fails the
runtime offscreen feature gate.

Password rotation rewraps the same privacy key; passkey setup adds independent
main-password and purpose-separated wrappers. Passkey removal drops only its
wrapper and, for a compatibility scaffold, first creates the master wrapper
from the live biometric capability plus the explicitly verified password.
Account deletion runs privacy safety both before visible dapp side effects and
inside the final secret/account lock. Reset requires the public Shield-risk
acknowledgement and deletes the vault, backup marker, and all rebuildable
privacy databases through the central reset manifest.
Manual reset removes the complete record. Tests mirror this domain under
`tests/privacy/`.
