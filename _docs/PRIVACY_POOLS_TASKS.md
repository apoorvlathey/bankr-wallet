# Privacy Pools implementation checklist

> **Status:** Dual Sepolia-development/mainnet-production implementation complete;
> value-bearing mainnet rehearsal pending
> **Target:** `dev:extension` on Sepolia; normal/production builds on Ethereum mainnet only
> **Product source:** [`PRIVACY_POOLS_PRD.md`](./PRIVACY_POOLS_PRD.md)
> **Fresh-session handoff:** [`PRIVACY_POOLS_HANDOFF.md`](./PRIVACY_POOLS_HANDOFF.md)

This checklist turns the Privacy Pools PRD into review-sized checkpoints. Each
checkpoint ends in a build the team can inspect manually before the next one
starts. A checked implementation item means the code and automated checks are
complete; the matching manual gate remains the product owner's approval point.

## Manual progress snapshot (2026-07-20)

| Area | Current evidence | Remaining manual gate |
| --- | --- | --- |
| Public/private home | Dual-mode home, private-only balance/chart/assets/activity, explicit Shield signer, and account-independent private send are implemented | Recheck both themes and final popup/sidepanel transitions in the unpacked extension |
| Shield/Unshield/Send UI | Three private-home actions, separate fixed-asset screens, private-only Shielded ETH asset, and private Activity are implemented | Recheck both themes and final popup/sidepanel layouts in the unpacked extension |
| Password/passkey initialization | Fresh biometric login was confirmed working after capability parity fixes | Complete reveal, restore, rotation, factor-removal, and clean-install recovery rehearsal |
| Quote/review | Real quotes work with three-request RPC batches; arbitrary 1 ETH cap removed | Repeat with Bankr, private-key, seed-phrase, impersonator, and agent sessions |
| Sepolia Shield | Real deposits reached confirmation/indexing and appeared in the confirmed balance while ASP-pending | Complete and record one full private-key and one full seed-phrase run, including rejection/restart/account-switch cases |
| Live status | Confirmed/available/pending balance, permanent private asset row, and Private Activity projections are implemented | Reconfirm every transition from the asset row and Private Activity |
| Private Unshield | Automated full/partial, quote, proof, relayer, lineage, and retry coverage passes | No complete manual partial/full ASP-approved withdrawal has been recorded |
| Withdraw publicly | One real Sepolia public withdrawal succeeded after the proof-signal fix | Repeat for both local wallet types after clean recovery; recheck that a user-rejected prompt creates no Activity card |
| Recovery and destructive safety | Automated phrase, rescan, account-removal, and reset coverage passes | Complete the written disposable-wallet rehearsal |
| Production profile | Mainnet pins, onchain relationships, endpoint/relayer signatures, compile-time bundle isolation, and all wallet-type code paths are automated | Value-bearing Bankr/private-key/seed-phrase smoke matrix and incident/recovery procedure |
| Distribution | Unpacked Chrome Sepolia target passes automated gates; production compilation does not grant distribution approval | GPL/legal/compliance/store review remains required before release packaging |

## Checkpoint 1: Sepolia product shell

**Implementation:** Complete. **Manual:** Core simplified layout accepted; final
cross-theme/layout recheck remains.

- [x] Show ASP-cleared Shielded ETH as the main private value and
  compliance-pending processing ETH as compact amber subcopy.
- [x] Expose Shield, Unshield, and Send as three private-home actions with
  separate screens and no nested mode tabs.
- [x] Align one tiny tooltip-free amber Public/Private switch to the balance
  heading below the Public account selector.
- [x] Keep private balance, chart, assets, and Activity separate from the
  selected public account; omit account selector and Positions in Private.
- [x] Keep mutually exclusive Public and Privacy Pools Activity scopes.
- [x] Add permanent Shielded ETH only to Private Assets; keep generic public
  Assets, Send, and Swap free of the pseudo-asset.
- [x] Select the Sepolia Shield signer inside Shield without changing the
  public active account.
- [x] Make private send spend the wallet-wide privacy identity without a public
  account field, while retaining master authorization and exact note checks.
- [x] Encrypt the bounded eight-day private USD chart with the privacy key.
- [x] Remove recovery setup, phrase, and protocol explainer pages.
- [x] Add a pure fixture/presentation model and UI coverage.
- [x] Pass Shield model tests, UI-scoped typecheck/lint, axe checks, and
  the packaged extension build.

Manual gate:

1. Reload the extension and open **Shield** from the home quick actions.
2. Confirm Shield opens directly to `Deposit from` and compact fixed Sepolia
   ETH/Shielded ETH cards without a repeated balance strip or mode tabs.
3. Return to Private and confirm Unshield and Send open their own titled screens;
   Unshield defaults to the active wallet while Send starts recipient-first.
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

Manual gate for this slice: first access initializes once without showing a
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
- [ ] Complete the `snarkjs` distribution/license decision before store use.

Manual gate: run fixed proofs from the packaged Chrome extension while closing
and reopening the wallet UI.

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

Manual gate: recover the same empty and funded Sepolia state after cache
deletion and service-worker restart.

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

Manual gate: shield Sepolia ETH with private-key and seed-phrase accounts and
verify that the public transaction becomes the expected private commitment.
Bankr must fail before a prompt because it cannot submit Sepolia transactions.

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

Manual gate: observe every ASP lifecycle state without leaking account
inventory or private wallet metadata to the endpoint.

## Checkpoint 7: Relayed private withdrawal

- [x] Query and validate bounded, expiring relayer quotes and their EIP-712 signer.
- [x] Bind recipient, amount, fees, relayer, scope, roots, and replacement
  commitment to the reviewed intent.
- [x] Generate and locally verify full and partial withdrawal proofs.
- [x] Revalidate all material fields immediately before submission.
- [x] Track nullifier and replacement commitment through confirmation.
- [x] Make ambiguous retry receipt/nullifier-aware.

Manual gate: perform full and partial Sepolia withdrawals to fresh recipients,
including quote expiry, relayer substitution, lock, restart, and timeout tests.

## Checkpoint 8: Public withdrawal

**Implementation:** Complete. **Manual:** One real Sepolia withdrawal succeeded;
both local wallet types and clean-recovery repetition remain.

- [x] Detect declined/removed ragequit eligibility without hiding normal private state.
- [x] Let a user publicly withdraw a confirmed, indexed commitment instead of
  waiting for ASP approval.
- [x] Keep the action visible for older indexed operations while encrypted
  commitment materialization catches up, and repeat that local step on click.
- [x] Require control of the exact original depositor.
- [x] Generate and locally verify the commitment proof and calldata.
- [x] Route the public transaction through private-key and seed-phrase signing;
  Bankr remains unavailable on Sepolia.
- [x] Explain the public link and reject impersonator/agent sessions.
- [x] Restore the prior ASP state after rejection and mark the matching Shield
  activity `Withdrawn` only after the exact onchain Ragequit event.
- [x] Keep a user-rejected public-withdrawal record internally for safe claim
  cleanup but omit it from Shield Activity.

Manual gate: complete Sepolia ragequit for private-key and seed-phrase test
accounts after a clean-install phrase rescan. Bankr must fail before a prompt.

## Checkpoint 9: Sepolia hardening and release rehearsal

- [x] Pass the automated PRD wallet, protocol, restart, corruption, ambiguity,
  artifact-tamper, performance-budget, Shield accessibility, and unpacked
  packaging matrices.
- [x] Verify reset/account-removal warnings and recovery-only mode.
- [x] Freeze numeric performance budgets.
- [x] Reconcile implementation, storage, privacy, and security documentation.
- [x] Keep Firefox feature-disabled until its equivalent prover gate passes.

Manual gate: complete the written Sepolia release rehearsal from fresh install
through recovery with no unsupported or unexplained state.

## Checkpoint 10: Mainnet read-only rehearsal

- [x] Pin the official production deployment, live proxy implementation, pool,
  verifiers, bytecode identities, scope, fees, deployment block, ASP, and relayers.
- [x] Verify the complete pinned deployment through bounded live mainnet reads.
- [x] Verify production bundles contain mainnet pins and exclude Sepolia pins;
  verify development bundles contain Sepolia pins and exclude mainnet pins.
- [x] Isolate mainnet and Sepolia operations, commitment, withdrawal, ragequit,
  portfolio, and event databases while deleting both secret profiles on reset.
- [ ] Rescan production-equivalent known fixtures without sending value.
- [ ] Complete security, legal/compliance, licensing, endpoint, and store-policy
  reviews.
- [ ] Exercise the kill switch and recovery-only procedures.

Manual gate: approve the remaining PRD go/no-go items before a distribution or
value-bearing rollout. Mainnet code is compiled for normal builds, but no live
transaction was sent during the read-only verification.

## Checkpoint 11: Mainnet implementation and controlled beta

- [x] Select mainnet only for normal/production builds and retain Sepolia only
  for `dev:extension`, without a runtime or remote network override.
- [x] Enable Bankr, private-key, and seed-phrase production mutations; keep
  impersonators reject-only and agent-password mutations blocked.
- [x] Keep amounts governed by the contract minimum, valid `uint256` input,
  and available balance after gas.
- [x] Reuse the exact final authorization/effect boundary for Bankr Shield and
  public-recovery submissions before pending request removal or remote submit.
- [ ] Complete a capped, explicitly authorized Shield/Unshield/recovery smoke
  run for Bankr, private-key, and seed-phrase accounts.
- [ ] Monitor only privacy-safe operational health and exercise recovery-only
  response before wider availability.

Manual gate: perform the first mainnet shield, private withdrawal,
clean-install recovery, and emergency procedure only after every earlier gate
has been signed off.
