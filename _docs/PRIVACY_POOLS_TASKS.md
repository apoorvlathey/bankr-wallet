# Privacy Pools implementation checklist

> **Status:** Dual Sepolia-development/mainnet-production implementation and
> maintainer-confirmed manual QA complete as of 2026-07-23
> **Target:** normal dev/production commands on Ethereum mainnet; dedicated Sepolia commands on Sepolia
> **Product source:** [`PRIVACY_POOLS_PRD.md`](./PRIVACY_POOLS_PRD.md)
> **Fresh-session handoff:** [`PRIVACY_POOLS_HANDOFF.md`](./PRIVACY_POOLS_HANDOFF.md)

This checklist turns the Privacy Pools PRD into review-sized checkpoints. Each
checkpoint ends in a build the team can inspect manually before the next one
starts. A checked implementation item means the code and automated checks are
complete. The product owner confirmed the written Sepolia and mainnet manual
matrices on 2026-07-23.

## Manual progress snapshot (2026-07-23)

| Area | Current evidence | Manual status |
| --- | --- | --- |
| Public/private home | Dual-mode home, private balance/chart/assets/activity, signer-owned transaction mirroring into Public Activity, explicit Shield signer, and relayed Unshield are implemented | Complete |
| Shield/Unshield UI | Separate fixed-asset screens, private-only Shielded ETH, and privacy-ledger Activity are implemented | Complete |
| Password/passkey initialization | Biometric login plus reveal/restore/rotation/factor-removal/clean-install paths exercised | Complete |
| Quote/review | Real quotes, bounded RPC batches, fee arithmetic, and wallet/session matrix exercised | Complete |
| Sepolia Shield | Confirmation/indexing/ASP plus local-wallet/rejection/restart paths exercised | Complete |
| Live status | Confirmed/available/pending balance and Private Activity transitions exercised | Complete |
| Private Unshield | Automated coverage plus maintainer-confirmed partial/full ASP-approved withdrawal QA | Complete |
| Withdraw publicly | Real withdrawal, local-wallet clean-recovery, and rejected-prompt visibility paths exercised | Complete |
| Recovery and destructive safety | Phrase, rescan, account-removal, reset, and recovery-only matrix exercised | Complete |
| Production profile | Bundle isolation, Bankr/private-key/seed-phrase smoke matrix, and incident/recovery procedures exercised | Complete |
| Distribution | GPL-3.0-only v4 policy, `snarkjs` family attribution, and packaged source directions are complete | Bump to v4.0.0, then complete remaining legal/compliance/store review |

## Checkpoint 1: Sepolia product shell

**Implementation:** Complete. **Manual:** Complete (maintainer-confirmed
2026-07-23).

- [x] Show ASP-cleared Shielded ETH as the main private value and
  compliance-pending processing ETH as compact amber subcopy.
- [x] Expose Shield and Unshield as two private-home actions with separate
  screens and no nested mode tabs; do not expose Send in v1.
- [x] Align one tiny tooltip-free amber Public/Private switch to the balance
  heading below the Public account selector.
- [x] Keep private balance, chart, assets, and Activity separate from the
  selected public account; omit account selector and Positions in Private.
- [x] Keep mutually exclusive Public and Privacy Pools Activity scopes.
- [x] Add permanent Shielded ETH only to Private Assets; keep generic public
  Assets, Send, and Swap free of the pseudo-asset.
- [x] Select the Sepolia Shield signer inside Shield without changing the
  public active account.
- [x] Make relayed Unshield spend the wallet-wide privacy identity without a
  public account field, while retaining master authorization and exact note checks.
- [x] Encrypt the bounded eight-day private USD chart with the privacy key.
- [x] Remove recovery setup, phrase, and protocol explainer pages.
- [x] Add a pure fixture/presentation model and UI coverage.
- [x] Pass Shield model tests, UI-scoped typecheck/lint, axe checks, and
  the packaged extension build.

Manual gate completed on 2026-07-23; recorded matrix:

1. Reload the extension and open **Shield** from the home quick actions.
2. Confirm Shield opens directly to `Deposit from` and compact fixed Sepolia
   ETH/Shielded ETH cards without a repeated balance strip or mode tabs.
3. Return to Private and confirm only Shield and Unshield are offered. Unshield
   starts with an empty boxed `Receive at` field and an `Address` chooser. Enter
   an amount and fresh recipient, then confirm `Review unshield` opens a second
   screen with exact from/receiver amounts and a compact Request details list.
   Its first row must show relay percentage and ETH/USD fee on two lines. An
   over-cap quote must turn that row amber and place the public-exit alternative
   in the sticky bar above Back and `Check relay again`; no duplicate Financial
   impact or standalone warning card, private Send action, or private Send
   screen should exist.
4. Review both themes and the popup/sidepanel layouts.
5. Confirm no recovery or privacy explainer block appears in the healthy state.
6. Confirm opening Shield creates no transaction prompt and shows no phrase.
   Status-only initialization and bounded sync may run in the background.

## Checkpoint 2: Privacy recovery lifecycle

**Implementation:** Automatic initialization plus explicit backup/restore complete.

- [x] Freeze the phrase length and versioned derivation metadata.
- [x] Add the dedicated privacy-vault key and master/passkey wrappers.
- [x] Make first password/biometric-master Shield access atomically ensure the
  phrase exists, generating it only in the background from a CSPRNG when absent.
- [x] Upgrade biometric factors that predate Shield with an empty,
  purpose-separated passkey-only scaffold on their next fresh assertion.
- [x] Preserve later password rotation/passkey removal by adding a verified
  master wrapper before a passkey-only compatibility wrapper is removed.
- [x] Allow a fresh matching biometric master session to use its authenticated
  privacy capability without a main-password interruption; keep plaintext
  recovery reveal and wrapper upgrade explicitly main-password-gated.
- [x] Return only initialization status to the Shield renderer.
- [x] Put optional export/backup in a separate master-only recovery action.
- [x] Enforce live master/biometric authorization in the background.
- [x] Reject agent-password and impersonator initialize, export, and restore
  requests.
- [x] Cover lock, restart, password rotation, passkey removal, reset, and fixed
  recovery vectors.

Manual gate completed on 2026-07-23: first access initializes once without showing a
phrase; password login and a fresh biometric login both work for Bankr,
private-key, and seed-phrase accounts, while impersonators remain blocked.
Repeated access preserves the same local record without any pool or transaction
activity. Settings > Security > Shield Recovery provides the separate
main-password-gated reveal/restore action; restore immediately starts a bounded
Sepolia rescan. Revealing or restoring also ensures the main wrapper exists and
records only a key-ID/timestamp backup marker, never the phrase.

## Checkpoint 3: Packaged protocol primitives and prover

**Implementation:** Packaged self-test and real-input proving complete.

- [x] Pin the official SDK version, integrity, upstream commit, and patch list.
- [x] Pin commitment/withdrawal artifacts and expected SHA-256 hashes.
- [x] Add the Chrome offscreen document and typed packaged-worker bridge.
- [x] Generate and locally verify fixed commitment and withdrawal proofs.
- [x] Generate and locally verify real commitment and withdrawal inputs in the
  same one-shot offscreen worker.
- [x] Exercise packaged proof timing, CSP, and worker restart in Chromium.
- [x] Measure peak memory and freeze package/performance budgets.
- [x] License extension v4+ under GPL-3.0-only and package the full license,
  `snarkjs@0.7.5` attribution, and corresponding-source directions.

Manual gate completed on 2026-07-23: fixed proofs ran from the packaged Chrome
extension across wallet UI close/reopen.

Automated packaged-Chromium measurement (2026-07-20): both proofs verified in
9.027 s on the first run and 9.981 s after closing/reopening the extension page.
The measured Chromium process-tree RSS delta peaked at 352,976,896 bytes
(336.6 MiB). The current unpacked build is 46,233,929 bytes; the six pinned
circuit artifacts contribute 23,690,342 bytes and the packaged prover worker
contributes 336,397 bytes; the background bundle is 3,522,011 bytes.
`privacy-prover.budgets.json` freezes 55 MiB build,
24 MiB artifact, 512 KiB worker, 4 MiB background, 60 s first/restart proof,
512 MiB peak-RSS-delta, and single-proof concurrency budgets. The build and
packaged Chromium QA enforce them.

## Checkpoint 4: Sepolia deployment and recovery index

- [x] Verify and pin the official Sepolia Entrypoint, implementation, pool,
  verifiers, deployment block, scope, and bytecode fingerprints.
- [x] Add a compile-time mutation kill switch and fail-closed deployment
  mismatch state to the existing compact Shield status line.
- [x] Add bounded global event sync and encrypted private commitment matching.
- [x] Add disposable public checkpoints and a full phrase-based rescan that
  follows partial-withdrawal and ragequit lineage.
- [x] Render ready, pending, attention, last-sync, and recovery aggregates
  from the real repository facade.

Manual gate completed on 2026-07-23: empty and funded Sepolia state recovered
after cache deletion and service-worker restart.

Deployment slice gate: with the normal Sepolia RPC online, pressing Shield
must open the compact amount quote after both the onchain identity and packaged
proofs pass. With Sepolia RPC unavailable, it must show only the generic retry
message and must not start a transaction. Mainnet and all Privacy Pools
mutations remain unavailable.

## Checkpoint 5: Sepolia shielding

**Implementation:** Local-wallet Sepolia submission and receipt tracking complete.

- [x] Quote native Sepolia ETH amounts, minimums, fees, and gas reserve.
- [x] Prepare and independently decode the exact deposit intent/calldata.
- [x] Persist the operation before opening the wallet confirmation path.
- [x] Exercise private-key and seed-phrase submission paths. Bankr is explicitly
  blocked because its raw transaction API does not support Sepolia.
- [x] Reject impersonator and agent-password mutation paths.
- [x] Resume receipt, event, and ASP-pending tracking after UI/worker restart.
- [x] Mirror public Shield stages into the normal wallet Activity row with
  live bounded sync and unchanged Sepolia transaction-detail navigation.

Manual gate completed on 2026-07-23: private-key and seed-phrase Shield paths
produced the expected private commitment, and Bankr failed before a Sepolia
prompt as designed.

Quote slice gate: on Bankr, private-key, and seed-phrase accounts, Shield opens
one fixed-asset amount form with a `0.001 ETH` minimum showing the public Sepolia balance, 1%
protocol fee, expected Shielded ETH credit, and a
gas-aware Max value. Invalid decimals, `uint256` overflow, and sub-minimum
amounts fail locally; view-only accounts fail closed. There is no confirm control, prepared intent,
signing request, operation record, or submission in this slice.

Review-preparation slice gate: pressing `Review shield` under a current password or
fresh biometric master session prepares the exact native-deposit call in the
background, checks its chain, source, Entrypoint, value, fee math, selector,
argument, and derived precommitment through an independent decoder, and shows
only the bounded ready result. Bankr, private-key, and seed-phrase accounts may
prepare that result. Agent sessions and view-only accounts fail closed. The
review intent is explicitly non-submittable, uses a disposable derivation, and
is not persisted.

Current submission gate: the ready result immediately persists one durable
operation and opens the normal WalletChan transaction confirmation as the only
review surface.
Rejecting releases the operation without signing. Confirming from a local
private-key or seed-phrase account submits only the pinned Sepolia deposit,
then receipt/event/ASP tracking advances the private balance across UI and
service-worker restarts. The real index, precommitment, calldata, and note
lineage remain encrypted and never enter the renderer.

## Checkpoint 6: ASP eligibility

- [x] Add bounded ASP transport and strict response validation.
- [x] Verify accepted ASP roots against the configured onchain source.
- [x] Reconstruct/verify membership locally.
- [x] Model pending, approved, declined, removed, stale, and unavailable states.
- [x] Materialize the encrypted commitment after its exact pool event is
  indexed, before ASP approval.
- [x] Preserve public withdrawal while ASP review is pending or unavailable.

Manual gate completed on 2026-07-23: ASP lifecycle states were exercised
without exposing account inventory or private wallet metadata to the endpoint.

## Checkpoint 7: Relayed private withdrawal

- [x] Query and validate bounded, expiring relayer quotes and their EIP-712 signer.
- [x] Bind recipient, amount, fees, relayer, scope, roots, and replacement
  commitment to the reviewed intent.
- [x] Generate and locally verify full and partial withdrawal proofs.
- [x] Revalidate all material fields immediately before submission.
- [x] Track nullifier and replacement commitment through confirmation.
- [x] Make ambiguous retry receipt/nullifier-aware.

Manual gate completed on 2026-07-23 for full and partial Sepolia withdrawals,
including quote expiry, relayer substitution, lock, restart, and timeout paths.

## Checkpoint 8: Public withdrawal

**Implementation:** Complete. **Manual:** Complete for both local wallet types,
rejection visibility, and clean-recovery repetition (maintainer-confirmed
2026-07-23).

- [x] Detect declined/removed ragequit eligibility without hiding normal private state.
- [x] Let a user publicly withdraw a confirmed, indexed commitment instead of
  waiting for ASP approval.
- [x] Keep the action visible for older indexed operations while encrypted
  commitment materialization catches up, and repeat that local step on click.
- [x] Require control of the exact original depositor.
- [x] Generate and locally verify the commitment proof and calldata.
- [x] Route the public transaction through private-key and seed-phrase signing;
  Bankr remains unavailable on Sepolia.
- [x] Group ragequittable commitments by original account and allow 2–8 whole
  deposits from one group to share one immutable EIP-7702/ERC-7821 transaction;
  reject duplicate or mixed-depositor selections and reconcile every event.
- [x] Explain the public link and reject impersonator/agent sessions.
- [x] Restore the prior ASP state after rejection and mark the matching Shield
  activity `Withdrawn` only after the exact onchain Ragequit event.
- [x] Keep a user-rejected public-withdrawal record internally for safe claim
  cleanup but omit it from Shield Activity.

Manual gate completed on 2026-07-23 for private-key and seed-phrase ragequit
after clean-install phrase rescan; Sepolia Bankr rejection was also confirmed.

## Checkpoint 9: Sepolia hardening and release rehearsal

- [x] Pass the automated PRD wallet, protocol, restart, corruption, ambiguity,
  artifact-tamper, performance-budget, Shield accessibility, and unpacked
  packaging matrices.
- [x] Verify reset/account-removal warnings and recovery-only mode.
- [x] Freeze numeric performance budgets.
- [x] Reconcile implementation, storage, privacy, and security documentation.
- [x] Keep Firefox feature-disabled until its equivalent prover gate passes.

Manual gate completed on 2026-07-23 from fresh install through recovery.

## Checkpoint 10: Mainnet read-only rehearsal

- [x] Pin the official production deployment, live proxy implementation, pool,
  verifiers, bytecode identities, scope, fees, deployment block, ASP, and relayers.
- [x] Verify the complete pinned deployment through bounded live mainnet reads.
- [x] Verify production bundles contain mainnet pins and exclude Sepolia pins;
  verify development bundles contain Sepolia pins and exclude mainnet pins.
- [x] Isolate mainnet and Sepolia operations, commitment, withdrawal, ragequit,
  portfolio, and event databases while deleting both secret profiles on reset.
- [x] Rescan production-equivalent known fixtures without sending value.
- [x] Complete technical security, licensing, and endpoint review.
- [x] Exercise the kill switch and recovery-only procedures.
- [ ] Complete the final Chrome Web Store submission/policy review.

Manual technical and controlled value-bearing gates were confirmed complete on
2026-07-23. Final store submission review remains part of release packaging.

## Checkpoint 11: Mainnet implementation and controlled beta

- [x] Select mainnet only for normal/production builds and retain Sepolia only
  for `dev:extension`, without a runtime or remote network override.
- [x] Enable Bankr, private-key, and seed-phrase production mutations; keep
  impersonators reject-only and agent-password mutations blocked.
- [x] Keep amounts governed by the contract minimum, valid `uint256` input,
  and available balance after gas.
- [x] Reuse the exact final authorization/effect boundary for Bankr Shield and
  public-recovery submissions before pending request removal or remote submit.
- [x] Complete a capped, explicitly authorized Shield/Unshield/recovery smoke
  run for Bankr, private-key, and seed-phrase accounts.
- [x] Monitor only privacy-safe operational health and exercise recovery-only
  response before wider availability.

Manual gate completed on 2026-07-23: controlled mainnet Shield, private
withdrawal, clean-install recovery, and recovery-only procedure.
