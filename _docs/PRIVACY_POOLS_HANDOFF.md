# Privacy Pools implementation handoff

> **Handoff date:** 2026-07-20
> **Current target:** Unpacked Chrome extension on Sepolia only
> **Implementation status:** Sepolia feature code is complete; the written
> manual rehearsal is only partially complete
> **Mainnet status:** Not configured and not enabled
> **Resume with:** [`PRIVACY_POOLS_SEPOLIA_TEST.md`](./PRIVACY_POOLS_SEPOLIA_TEST.md)

This is the starting document for the next implementation session. It records
what is built, what the product owner has observed manually, the important
security and protocol decisions, the latest fixed defects, and the remaining
gates. Do not infer mainnet readiness from the completed implementation
checkboxes in [`PRIVACY_POOLS_TASKS.md`](./PRIVACY_POOLS_TASKS.md).

## Product behavior now

- Shield is one balance-first screen. It shows the confirmed Shield balance,
  live USD value, Shield, Unshield, and Activity. There is no recovery wizard,
  protocol primer, or setup page in the normal flow.
- First healthy Shield access creates a separate 12-word Privacy Pools phrase
  inside the background service worker. The phrase is encrypted immediately
  and ordinary Shield messages never return it to React.
- A main-password session or fresh biometric/passkey master session can use
  Shield without an extra password interruption. Explicit phrase reveal and
  restore remain main-password-only under Settings -> Shield recovery.
- Sepolia Shield quotes use the selected public account, the contract-enforced
  `0.001 ETH` minimum, the onchain 1% fee, estimated gas, and a gas-aware Max.
  WalletChan deliberately has no arbitrary 1 ETH application cap.
- Private-key and seed-phrase accounts use the normal local WalletChan
  confirmation/signing path. Bankr can quote/review but is rejected before a
  Sepolia transaction prompt because its raw-submit API does not support
  Sepolia. Impersonators and agent-password sessions cannot mutate Shield.
- The main balance includes value as soon as the exact deposit is confirmed
  and indexed in the pinned pool. ASP approval is not required for that
  headline balance. The subset still under review appears as compact amber
  `waiting ASP check` text with a hover/focus explanation.
- Private Unshield is available only for locally verified, ASP-approved
  commitments. WalletChan does not invent an ASP completion estimate.
- After an exact deposit is confirmed and indexed, the original depositor may
  choose **Withdraw publicly** without waiting for the ASP. This produces the
  protocol ragequit transaction, returns funds to that original public
  account, and publicly links the exit to the deposit.
- Shield progress appears both on the Shield screen and on the matching normal
  wallet Activity row. It uses four real stages and refreshes while mounted.
  Clicking the main Activity row still opens the ordinary Sepolia transaction
  details.
- A public-withdrawal prompt rejected by the user is retained internally long
  enough to release its encrypted commitment claim safely, but is omitted
  from user-facing Activity. Actual proof, submission, revert, and recovery
  outcomes remain visible.

## What has been observed manually

The product owner has directly confirmed during the current iteration that:

- the simplified balance-first Shield page is the desired UI;
- healthy initialization works with biometric/passkey login;
- quotes return through a free-tier RPC after WalletChan capped every JSON-RPC
  batch at three requests;
- the arbitrary 1 ETH cap is gone;
- Sepolia deposits confirm and appear as pool balance while ASP review is
  pending;
- the public withdrawal proof and wallet transaction now work after the
  commitment-signal correction described below.

The latest cancellation-visibility change is implemented and automated, but
still needs one browser reload/rejection check. The session did not establish
a complete manual pass for both local wallet types, private Unshield,
clean-install phrase recovery, every negative wallet path, or destructive
safeguards. Treat those as pending even when automated coverage exists.

## Custody and cryptography decisions

- WalletChan owns the independent privacy phrase, encryption keys, storage,
  authorization, RPC policy, transaction confirmation, relayer policy, and
  recovery flow.
- The ordinary WalletChan seed phrase, imported private keys, Bankr credential,
  password, and passkey are not the Privacy Pools phrase and are never passed
  to the protocol SDK.
- The pinned `@0xbow/privacy-pools-core-sdk@1.2.0` is used only through a narrow
  background crypto adapter. WalletChan does not use its wallet, contract,
  RPC, or transaction-submission helpers.
- Circuit Wasm/zkey/vkey files are packaged locally and pinned by exact size
  and SHA-256. Proving runs in a one-shot Chrome offscreen worker, locally
  verifies every proof, and uses one clean retry for a failed local proof
  request. No remote proving or runtime artifact fallback exists.
- The service-worker build imports the SDK's pure crypto source and a pinned
  three-width `poseidon-lite` adapter. This keeps the SDK root barrel's
  `snarkjs`/Blob-worker initialization out of `background.js`.
- Store/release packaging is deliberately blocked by
  `privacy-prover.distribution.json` while the transitive/direct
  `snarkjs@0.7.5` GPL-3.0 distribution decision is unresolved. Only
  `unpacked-sepolia-test` is allowed.

## Important proof-signal correction

The first real public-withdrawal attempt proved successfully but failed local
signal binding. The root cause was an upstream SDK naming trap:

```text
deposit precommitment = Poseidon(nullifier, secret)
spent-nullifier hash  = Poseidon(nullifier)
commitment signals    = [commitmentHash, spentNullifierHash, value, label]
```

SDK 1.2.0 exposes the two-input deposit precommitment under a property named
`nullifierHash`. WalletChan initially reused that property as the circuit's
one-input spent-nullifier signal. A proof can still be cryptographically valid
while the application interprets a public signal incorrectly, so proof
verification alone did not catch the defect.

`privacy/protocol/primitives.ts` now exposes distinct `precommitment` and
`nullifierHash` fields, verifies the SDK's confusing property only as the
precommitment, and computes the true nullifier hash locally with the pinned
Poseidon adapter. Deposit/event/ASP matching uses `precommitment`; Unshield,
rescan spent-note lookup, onchain nullifier checks, and public withdrawal use
`nullifierHash`.

The previous ragequit unit fixture supplied the same incorrect array as both
its actual and expected value, while packaged QA asserted only the public
`value` signal. Regression protection now includes:

- `tests/privacy/commitmentProofBinding.test.ts`, which generates a real proof
  from the pinned commitment artifacts and verifies all four signal meanings;
- fixed vectors proving precommitment and nullifier hash are distinct;
- the production packaged self-test, which sends a real commitment input
  through the offscreen bridge and checks all four returned signals against
  the shared primitive model.

Do not collapse these two hashes or replace the real-artifact binding test with
a self-consistent mock.

## Architecture map

| Area | Primary location | Responsibility |
| --- | --- | --- |
| Product/rollout contract | `_docs/PRIVACY_POOLS_PRD.md` | Requirements and mainnet gates |
| Manual status and steps | `_docs/PRIVACY_POOLS_TASKS.md`, `_docs/PRIVACY_POOLS_SEPOLIA_TEST.md` | Implementation checkpoints and browser rehearsal |
| Trusted UI transport | `apps/extension/src/chrome/background/privacyRouter.ts` | Status, quote, review, operations, sync, Unshield, public withdrawal |
| Recovery transport | `apps/extension/src/chrome/background/privacyRecoveryRouter.ts` | Main-password reveal/restore and bounded rescan |
| Privacy custody | `apps/extension/src/chrome/privacy/{identity,record,repository,crypto,vault,passkey}.ts` | Phrase generation, record validation, wrappers, authorization |
| Protocol/deployment | `apps/extension/src/chrome/privacy/protocol/`, `deployment/` | Pinned primitives, artifacts, exact Sepolia allowlist |
| Deposit lifecycle | `apps/extension/src/chrome/privacy/deposit/`, `operations/` | Quote/review, encrypted durable intent, confirmation, receipt |
| Private state | `apps/extension/src/chrome/privacy/events/`, `commitments/`, `asp/` | Pool indexing, local lineage, verified eligibility |
| Private exit | `apps/extension/src/chrome/privacy/relayer/`, `withdrawals/` | Signed quote validation, proof, submit, nullifier-aware recovery |
| Public exit | `apps/extension/src/chrome/privacy/ragequit/` | Original-depositor proof, confirmation, exact event reconciliation |
| Proving | `apps/extension/src/chrome/privacy/prover/`, `apps/extension/privacy-prover-offscreen.html` | Nonce-bound offscreen host and packaged one-shot worker |
| Shield renderer | `apps/extension/src/components/Shield/` | Aggregate-only UI and adaptive lifecycle refresh |
| Main Activity | `apps/extension/src/components/Activity/` | Exact-bound public Shield projection and normal details navigation |
| Recovery settings | `apps/extension/src/components/Settings/PrivacyRecoverySettings.tsx` | Temporary phrase reveal/restore UI only |

All privacy runtime messages are classified `wallet-ui` and must originate
from WalletChan's exact top-level extension document. No privacy route is
forwarded through the content script or exposed to dapps.

## Wallet and authorization matrix

| Path | Bankr | Private key | Seed phrase | Impersonator | Agent session |
| --- | --- | --- | --- | --- | --- |
| View aggregate status | Yes | Yes | Yes | Read-only | Read-only |
| Initialize with master/passkey | Yes | Yes | Yes | No | No |
| Quote and review Sepolia Shield | Yes | Yes | Yes | No | No |
| Submit Sepolia Shield | No, rejected before prompt | Yes | Yes | No | No |
| Private Unshield | No on Sepolia | Yes | Yes | No | No |
| Withdraw publicly on Sepolia | No | Original depositor only | Original depositor only | No | No |
| Reveal/restore phrase | Main password only | Main password only | Main password only | No | No |

Account switching after review does not transfer authority: final preparation
and signing re-pin the stored account ID, address, type, chain, value, and
encrypted intent. Public withdrawal remains visible when another account is
selected, but it asks the user to switch to the exact original depositor before
proof preparation.

## Sepolia release pins and network behavior

- Chain ID: `11155111`.
- Entrypoint proxy: `0x34A2068192b1297f2a7f85D7D8CdE66F8F0921cB`.
- ETH pool: `0x644d5A2554d36e27509254F32ccfeBe8cd58861f`.
- Deployment block: `8587019`.
- Minimum deposit: `0.001 ETH`; vetting fee: `100` bps; maximum relay fee:
  `100` bps.
- ASP: `https://dw.0xbow.io` with strict bounded decoding and onchain-root
  verification.
- Relayers: the pinned testnet relay plus Freedom Relay under their respective
  signer policies in `privacy/deployment/manifest.ts`.
- User-configured Sepolia RPC is preferred; WalletChan's known-chain endpoint
  is the fallback. Every JSON-RPC batch is capped at three requests.
- A quote necessarily exposes the selected public address, candidate amount,
  IP, and timing to that RPC. Fixed deployment checks expose none of the
  wallet's addresses, amounts, commitments, or secrets.
- ASP completion time is not controlled by WalletChan, so no ETA is displayed.

The exact implementation address, verifier addresses, scope, bytecode hashes,
artifact hashes, SDK integrity, and source commits remain in the checked-in
manifests and PRD; do not copy-edit those values independently.

## Storage and recovery

- `chrome.storage.local.privacyVault` contains the encrypted phrase plus
  master/passkey wrappers and a key check. `privacyRecoveryBackup` contains
  only `{version, keyId, verifiedAt}`.
- `walletchan-privacy-v1` stores bounded encrypted Shield operations and the
  atomic next-deposit index.
- `walletchan-privacy-commitments-v1`,
  `walletchan-privacy-withdrawals-v1`, and
  `walletchan-privacy-ragequits-v1` store encrypted private lineage and
  restart-safe exit state.
- `walletchan-privacy-events-v1` is a disposable public Sepolia event cache.
  Phrase rescan rederives and verifies lineage instead of trusting the cache.
- Password rotation rewraps the same privacy key. Passkey setup/removal
  preserves the identity. Manual lock clears live capabilities but tracking of
  already-submitted public effects can continue.
- Account removal is blocked for unresolved Shield work, in-flight public
  recovery, or unspent commitments. Reset requires the explicit Shield-loss
  acknowledgement and deletes the vault, marker, and all five databases.

## Current automated baseline

The handoff verification passed the full Privacy Pools suite (`170/170`) and
`pnpm build:extension`. The build measured 46,188,084 bytes, including
23,690,342 artifact bytes, a 336,397-byte prover worker, and a 3,509,167-byte
background bundle. Packaged Chromium QA also passed both proofs across a closed
and reopened extension page in 8.904/8.922 seconds with a 350,142,464-byte peak
process-tree RSS delta, within every frozen budget. Targeted lint had passed on
the preceding feature changes. Re-run the commands below after any further
change and record the new results in this section and the Sepolia rehearsal:

```bash
pnpm --filter @walletchan/extension test:privacy
pnpm --filter @walletchan/extension typecheck:ui
pnpm --filter @walletchan/extension typecheck:qa
PREVIEW_QA_ROUTE=shield pnpm --filter @walletchan/extension qa:preview
pnpm build:extension
pnpm --filter @walletchan/extension qa:extension:privacy-prover
node apps/extension/scripts/privacy-prover-distribution.mjs --target=unpacked-sepolia-test
```

The repository-wide extension typecheck currently has unrelated pre-existing
errors in ENS bookmarks, Swap/Bridge quote displays, and preview edge fixtures.
Do not misattribute those to Shield; still run the Shield-scoped checks and
report any new error in a changed file.

Safe service-worker diagnostics use these prefixes:

- `[privacy-shield] prover`
- `[privacy-shield] public-recovery-proof`

They intentionally contain only a stage, proof action, attempt number, and
bounded failure code. Do not add addresses, amounts, commitments, labels,
proofs, public signals, calldata, or secret material to logs.

## Resume order

1. Reload `apps/extension/build` and reject one **Withdraw publicly** prompt.
   Confirm no cancelled/failed public-withdrawal card appears after Activity
   refresh or extension reload.
2. Complete one full Shield lifecycle with a private-key account and one with
   a seed-phrase account. Exercise password and fresh passkey login, account
   switching during review, prompt rejection, approval, UI closure, and
   service-worker restart.
3. Confirm both the Shield screen and main wallet Activity advance live through
   wallet confirmation, Sepolia confirmation, indexing, and ASP review, while
   the headline balance appears after pool confirmation.
4. Obtain an ASP-approved test commitment and complete partial and Max/full
   private Unshield. Test quote expiry, relayer substitution rejection,
   restart during proving/submission, recipient receipt, replacement lineage,
   and nullifier-aware retry.
5. Use Settings -> Shield recovery on disposable accounts: reveal, auto-hide,
   backup marker, scan, clean-install restore, and invalid-phrase rejection.
   Then repeat public withdrawal after a clean restore/rescan for both local
   wallet types.
6. Exercise Bankr, impersonator, and agent-password negative paths. Bankr must
   fail before Sepolia mutation prompts; impersonator and agent sessions must
   never reach proof/signing/submission.
7. Exercise account-removal and reset safeguards with pending work and unspent
   commitments. Verify cancel leaves state intact and acknowledged disposable
   reset removes all Shield data.
8. Run the complete automated rehearsal above, reconcile any browser findings,
   and mark each manual gate in `PRIVACY_POOLS_SEPOLIA_TEST.md`.
9. Before any store build or mainnet work, resolve the `snarkjs` license and
   distribution decision, complete security/legal/compliance/store-policy
   review, and approve the full PRD go/no-go list.
10. Only then begin the mainnet **read-only** rehearsal: pin the official
    production deployment and bytecode, rescan known fixtures, and exercise
    kill-switch/recovery-only procedures. Do not enable mainnet deposits in
    that phase.
11. A controlled mainnet beta is the final step, after every Sepolia and
    read-only gate passes. Start with explicitly approved local wallet types;
    Bankr remains disabled until original-depositor public recovery is proven.

## Documents to keep synchronized

- [`PRIVACY_POOLS_PRD.md`](./PRIVACY_POOLS_PRD.md): product, security, and
  rollout source of truth.
- [`PRIVACY_POOLS_TASKS.md`](./PRIVACY_POOLS_TASKS.md): implementation and
  manual-gate status.
- [`PRIVACY_POOLS_SEPOLIA_TEST.md`](./PRIVACY_POOLS_SEPOLIA_TEST.md): exact
  browser rehearsal.
- [`IMPLEMENTATION.md`](./IMPLEMENTATION.md): message flow and background/UI
  architecture.
- [`SECURITY.md`](./SECURITY.md): authorization, cryptographic, message, and
  release invariants.
- [`STORAGE.md`](./STORAGE.md): keys, databases, reset, and migration policy.
- [`PRIVACY.md`](./PRIVACY.md): broader protocol research; it is not the
  shipping specification.
- Local audit maps under `apps/extension/src/chrome/privacy/`,
  `apps/extension/src/components/Shield/`, `apps/extension/src/components/Activity/`,
  and `apps/extension/tests/privacy/`.
