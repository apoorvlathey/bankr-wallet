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
- `deployment/`: compile-time-selected exact Sepolia/mainnet ETH deployment
  pins, bounded onchain snapshot, release/account policy, and fail-closed
  runtime validation.
- `deposit/`: exact-account active-chain ETH quote plus master-only, independently
  decoded, non-submittable deposit review preparation.
- `operations/`: encrypted, account-bound Shield intent, normal WalletChan
  confirmation, receipt/event tracking, and ASP lifecycle.
- `events/`: bounded rebuildable active-pool log index and canonical checkpoints.
- `commitments/`: exact-event commitment materialization, immutable-lineage
  canonicalization/repair, onchain nullifier spendability preflight, encrypted
  current notes, event-driven replacement recovery, and aggregate portfolio
  facade.
- `asp/`: strict endpoint codecs, lifecycle orchestration, and focused
  local/onchain root and membership checks.
- `relayer/`: pinned quote signer/economics verification and bounded submission.
- `withdrawals/`: encrypted, restart-safe full/partial relayed and
  recipient-paid Unshield lifecycle.
- `ragequit/`: original-depositor-only whole-commitment listing, proof,
  single or same-account atomic-batch confirmation, and multi-event receipt
  lifecycle. Preview lists every currently ragequittable deposit with an opaque
  commitment-record binding, but returns no commitment hash, secrets, proof,
  calldata, recovery intent, or pending request.
- `recovery/`: explicit main-password reveal/restore, key-ID-bound backup marker,
  passkey-only master-wrapper upgrade, and bounded rescan.
- `prover/`: exact port codecs, public fixed fixtures, a Chrome offscreen host,
  a packaged worker, and the background lifecycle coordinator.
- `accountSafety.ts`: double-checked fail-closed account-removal policy.
- `resetSafety.ts`: public Shield-data/backup projection for reset acknowledgement.
- `readiness.ts`: deployment-first composition of the onchain check and fixed
  local proof check.
- `portfolioViewCache.ts`: exact, deployment-bound aggregate balance/chart
  session cache. It survives automatic auth expiry for read-only rendering but
  contains no commitment linkage or spending capability and is cleared by
  explicit session teardown, reset/recovery replacement, or browser shutdown.
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
epoch at the raw-RPC boundary. Bankr is blocked in the Sepolia development
profile; the production mainnet profile uses Bankr's normal pinned confirmation
and submission coordinator with the same final privacy authorization boundary.
Receipt and bounded pool-event sync recover the commitment. Sync refreshes
already-indexed commitments before paging historical pool events, so a mainnet
backfill cannot delay a known deposit's ASP transition. Local/onchain ASP
membership checks use an event scanner that pages `eth_getLogs` over at most
1,000 inclusive blocks per request for compatibility with the default public RPC;
an explicit range-limit response shrinks the page further, while HTTP 429 and
other transport failures defer the batch without a retry burst. Each run
remains capped. Private Home starts this fallback only when a Shield receipt is
missing its Deposited event, then requests the next page batch after a partial
result. Ordinary receipt-complete portfolios and Public Exit previews never
start a global backfill. Public Exit preparation still probes the selected
note's current onchain nullifier before proof generation and again at the final
claim. ASP
membership makes it privately spendable only after the association root equals
`Entrypoint.latestRoot()` and the state root is found in the pool's 64-slot
known-root history. A successful deposit-status response may omit a fresh label
until ASP indexing catches up; that absence stays pending and is not an outage.
Transport, response-validation, binding, and membership failures remain
fail-closed internally, while background logs expose only their controlled
phase and aggregate counts without deposit identifiers or values.
Pending ASP work also owns one two-minute browser alarm, allowing the worker to
refresh with no popup or sidepanel open. A cold privacy key does not block the
public deposit binding, association-tree membership, state-tree membership, or
onchain-root checks. Their first durable `asp_approved` transition sends one
metadata-free native notification. Private lineage remains inaccessible and
`private_ready` is reached only after the privacy key is authenticated; the
alarm clears after no public compliance work remains.

Full/partial Unshield verifies a signed pinned-relayer quote, both Merkle roots,
the locally generated proof, and all public signals immediately before POST.
Its receipt poller remains live while locked and may record `public_confirmed`
only after the public amount and Entrypoint processooor match; encrypted
nullifier/replacement-commitment reconciliation waits for authentication.
Before proof work and again at the final claim boundary, every relayed,
receiver-paid, and ragequit path verifies the locally current note and checks
its derived nullifier against the pool. Spent or unverifiable state fails
closed as balance synchronization rather than reaching simulation/submission.
The receiver-paid alternative binds the recipient to an exact signing account,
uses it as the proof context processooor, simulates the exact pool calldata and
gas balance, and queues the normal pinned transaction confirmation. It repeats
account, roots, calldata, deployment, and master-epoch checks at the final
signing boundary; failed queueing, rejection, and pre-broadcast failure release
the claimed commitment through rollback/reconciliation. Commitment status
updates require the exact revision and status observed by the caller, so an ASP
refresh that started earlier cannot overwrite an active Unshield or ragequit
claim after its network work finishes.
Sync resumes receipt reconciliation before ASP work, then uses a fully current
event cache to follow each immutable deposit lineage through all Withdrawn and
Ragequit events. Only the greatest withdrawal index is live; older indices are
quarantined, same-index forks fail closed, source-operation bindings survive
recovery, and materialization cannot recreate a consumed original note.
An exact confirmed/indexed commitment is materialized before ASP approval so
pending, Proof-of-Association-required, declined, removed, or locally-derived
ASP-unavailable commitments
expose one compact public-withdrawal action; its
proof calls the ETH pool only from the exact original depositor through the same
local confirmation path. A rejected prompt restores the prior ASP state, while
success requires the exact Ragequit event before the source activity becomes
terminal. The user-rejected recovery record is kept for safe internal claim
cleanup but omitted from the Activity projection. SDK contract/submission helpers remain intentionally
unavailable, and the artifact
loader accepts only packaged Chrome-extension resources with exact size and
SHA-256 checks. The deployment reader sends one
batched, fixed public snapshot to a user-configured active-chain RPC or
WalletChan's immutable known-chain default during diagnostic readiness checks and final
durable preparation; it does not block opening the Shield amount form. No
account, phrase, commitment, or amount is included in that fixed snapshot.
The release policy is selected at Vite compile time: `dev:extension` uses the
exact `sepolia-local-beta` manifest and normal production builds use the exact
`mainnet-production` manifest. Both profiles fail closed on any deployment
drift; only mainnet permits Bankr mutations. The prover bridge accepts fixed self-tests plus
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
packaging fail closed pending GPL-3.0 legal review. Compiling the mainnet
profile does not override this distribution gate. Firefox also fails the
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
