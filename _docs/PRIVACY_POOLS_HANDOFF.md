# Privacy Pools implementation handoff

> **Handoff date:** 2026-07-23
> **Build targets:** normal dev/production commands use Ethereum mainnet;
> `dev-sepolia:extension` and `build-sepolia:extension` use Sepolia
> **Implementation status:** Dual-profile code, automated coverage, and the
> written Sepolia/mainnet browser QA matrices are complete
> **Distribution status:** The GPL/`snarkjs` v4 decision is resolved;
> release/store packaging requires v4.0.0 or later; final store submission
> review remains a separate release-process step
> **QA record:** [`PRIVACY_POOLS_MAINNET_TEST.md`](./PRIVACY_POOLS_MAINNET_TEST.md)

This is the starting document for the next implementation session. It records
what is built, what the product owner has observed manually, the important
security and protocol decisions, the latest fixed defects, and the remaining
release-process gate. A production build contains only the mainnet deployment;
the controlled value-bearing matrix is recorded as complete below, while the
build alone does not approve Chrome Web Store distribution.

## Product behavior now

- The unlocked home now has a Public/Private switch aligned to the right edge
  of the balance heading—below the account selector in Public and in the same
  position in Private. It is a tiny tooltip-free amber-selected control on the
  shared Warm Midnight base canvas. Public remains the account-scoped wallet. Private removes the
  account selector, positions, public assets, public chart, and public Activity.
- Private mode shows only the wallet-wide Shielded ETH balance and USD chart,
  `Shield` / `Unshield`, one Shielded ETH Assets row, and Privacy
  Pools Activity across all depositor accounts. The public side excludes all
  Shield/Unshield rows and never mixes the private balance into account totals.
  The two private actions reuse the exact public-home action treatment and
  icons instead of introducing large action cards.
- Shield now follows the wallet's Swap form grammar with compact fixed active-chain
  ETH and Shielded ETH amount cards and one sticky review action. Shield and
  Unshield are independent screens reached directly from Private;
  there is no internal mode selector. `Deposit from` names the signer without a redundant
  network subtitle, and the private balance is not repeated inside the form. There is no
  recovery wizard, protocol primer, local activity list, asset selector, or
  network selector in the normal flow. Shield chooses its active-chain-paying
  account inside the form without changing the global public account.
- `Shielded ETH` is permanent only in Private Assets, even at zero. It shows
  the compliance-cleared balance with amber processing subcopy, carries a
  active deployment identity, and opens Shield, Unshield, or Private Activity.
  Generic public Send and Swap never receive this pseudo-asset.
- First eligible Private-mode entry starts creation of a separate 12-word
  Privacy Pools phrase inside the background service worker without blocking
  the mode transition. The Shield screen retains the bounded status/Retry
  fallback. The phrase is encrypted immediately
  and ordinary Shield messages never return it to React.
- A main-password session or fresh biometric/passkey master session can use
  Shield without an extra password interruption. Explicit phrase reveal and
  restore remain main-password-only under Settings -> Shield recovery.
- Shield quotes use the selected public account, the active contract minimum
  and fee (`0.001 ETH`/1% on Sepolia; `0.01 ETH`/0.5% on mainnet), estimated
  gas, and a gas-aware Max. The entered value is the exact Shielded ETH output;
  WalletChan gross-ups the transaction value so the protocol fee is added on
  top. Mainnet `0.01 ETH` input therefore produces exactly `0.01 ETH` shielded,
  with a `0.000050251256281407 ETH` fee and
  `0.010050251256281407 ETH` pre-gas wallet debit shown in review.
  Max/100% derives the net shielded input from the complete post-gas balance
  and pins the exact available gross value when one net amount has two valid
  one-wei-adjacent gross values, so no spendable wei is stranded by the
  conversion.
  WalletChan deliberately has no arbitrary 1 ETH application cap.
- Private-key and seed-phrase accounts use the normal local WalletChan
  confirmation/signing path. Sepolia development builds reject Bankr before a
  mutation prompt. Production mainnet builds support Bankr through the normal
  Bankr confirmation/submission coordinator, with privacy authorization and
  effect claiming immediately before the irreversible API boundary.
  Impersonators and agent-password sessions cannot mutate Shield.
- The main private USD balance and encrypted chart include only ASP-cleared,
  spendable Shielded ETH. The compact breakdown beneath it separately shows
  the shielded amount and amber processing ETH still waiting for the ASP
  compliance check.
- Private Unshield is the sole relayed withdrawal entry. Privacy Pools v1 has
  no in-pool transfer, so the duplicate Private Send action and screen are not
  exposed. Unshield begins with an empty recipient and requires an explicit
  address or contact choice. Shielded ETH is debited and
  public active-chain ETH is delivered through the shared Send recipient/contact/ENS
  flow through the pinned relay. Its concise review uses a normal button press,
  explains there is no direct onchain link to the deposit, and makes no claim
  that timing, amount matching, or address reuse are untraceable. No additional
  renderer password, biometric, or hold gesture is introduced.
- Relayed Unshield is available only for locally verified, ASP-approved
  commitments. It spends the wallet-wide privacy identity, so it intentionally
  has no public-account selector and works independently of whether Bankr,
  private-key, seed-phrase, or an impersonator is selected on the public side.
  A live master/passkey capability is still required and agent sessions remain
  blocked. WalletChan does not invent an ASP completion estimate.
- After an exact deposit is confirmed and indexed, the original depositor may
  choose **Withdraw publicly** without waiting for the ASP. This produces the
  protocol ragequit transaction, returns funds to that original public
  account, and publicly links the exit to the deposit. The entry row now opens
  a read-only Public exit review first. That preview lists every currently
  ragequittable commitment with its exact current amount and saved
  original-account identity without proving, persisting a recovery intent,
  claiming, or queueing anything. The selector groups deposits by original
  account. The user may check one or several whole commitments in one group;
  multiple selections become one atomic EIP-7702/ERC-7821 (or production Bankr
  atomic) transaction. Mixed original accounts are rejected. The acknowledged
  final action is the first point that prepares proofs, claims, or a request.
- Public Shield progress and relayed Unshield outcomes live in Private
  Activity. Shield deposits keep their four real stages
  and ordinary active-chain transaction details; both the Activity row and detail
  screen use the same amber privacy mark and durable lifecycle projection.
  Successful Shield and public-recovery confirmations return to Private
  Activity instead of resetting to Assets. Deposit, lifecycle, and recovery
  rows all reuse the privacy mark; the recovery confirmation is titled
  `Shield Recovery`.
  Relayed Unshield uses sanitized withdrawal rows and concise route/fee/status
  details. Shield and public-exit history rows carry bounded privacy markers
  for their Private presentation, while the same real transaction also remains
  in Public Activity for the signer account. Receiver-paid Unshield follows the
  same dual rule: its sanitized operation is Private and its signer-owned
  onchain transaction is Public. Relayed Unshield has no signer-owned wallet
  transaction. Receiver-paid submission persists the returned hash into the
  private operation; a definite non-submission releases the claimed commitment
  and becomes retryable, while only an ambiguous broadcast remains under
  nullifier reconciliation. Missing-prompt recovery observes a bounded handoff
  grace so it cannot cancel a submission that just consumed its confirmation.
  Exact legacy internal origins cover older stored rows; Public
  Activity remains strictly selected-account scoped.
- Shield quote loading retains the last verified public balance, maximum,
  output, and slider geometry. The source amount mirrors slider movement on
  every drag frame, but that draft remains renderer-local until release, so
  dragging does not start quote requests or flash the ETH balance to zero.
  The source field also reuses Send's in-field ETH/USD switch when an ETH price
  is available; only canonical ETH reaches quote/review/operation messages.
  That canonical input remains the desired shielded amount; background quote
  and operation policy derive and verify the gross transaction value. Review
  and durable preparation carry the accepted public gross quote as an exact
  pin so the fee-rounding choice cannot drift between screens.
  Recoverable errors render below the route metadata rather than inside the
  source balance row.
- Backing out of the normal Shield transaction review leaves its request
  pending. Tapping Shield again reopens that exact trusted confirmation instead
  of preparing another durable operation, even when Back occurs before the
  authoritative storage-change notification. The renderer adopts the trusted
  pending runtime event immediately, an exact durable retry skips repeated
  quote/deployment RPC work, and queue creation performs no redundant
  deployment read. Confirm still revalidates deployment and authorization
  before submission.
- Unshield is now an explicit two-step decision. Entry shows the Shielded ETH
  amount followed by a boxed `Receive at` address control; exact public ETH
  output, relay fee/identity, expiry, privacy warnings, and any over-cap state
  appear only after `Review unshield`. The review avoids a duplicate Financial
  impact block: Request details starts with the two-line relay percentage and
  ETH/USD fee. When over cap, that row contains the contract-limit warning and
  the public-exit alternative moves into the sticky action bar. When no Shielded
  ETH is privately available but ragequit is, entry shows the fixed public-exit
  amount and original depositor. Its action opens the same exact
  whole-deposit review as the compact fallback row. That screen shows the
  account name, avatar/blockie, and address, then requires a public-link
  acknowledgement before enabling `Withdraw publicly`. The
  pending amount on the private home uses WalletChan's amber privacy status accent.
- A public-withdrawal prompt rejected by the user is retained internally long
  enough to release its encrypted commitment claim safely, but is omitted
  from user-facing Activity. Actual proof, submission, revert, and recovery
  outcomes remain visible.
- The private USD chart keeps at most eight days / 193 points. Balance and
  price values are AES-GCM encrypted with the dedicated privacy key; reset and
  recovery replacement delete the private chart database.

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

On 2026-07-23 the maintainer confirmed the complete written browser matrix:
Bankr/private-key/seed-phrase paths, rejection and restart behavior, partial
and full private Unshield, clean-install phrase recovery/rescan, public
withdrawal, negative wallet/session paths, and account-removal/reset/recovery
safeguards. This is maintainer-provided manual evidence; transaction hashes and
privacy-sensitive artifacts remain intentionally outside the repository.

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
- `privacy-prover.distribution.json` records the GPL-3.0-only decision for
  extension v4 and later. Every build carries the full license,
  `snarkjs@0.7.5` attribution, and source directions. Release/store targets
  require version 4.0.0 or later.

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
| Protocol/deployment | `apps/extension/src/chrome/privacy/protocol/`, `deployment/` | Pinned primitives, artifacts, exact compile-time Sepolia/mainnet allowlists |
| Deposit lifecycle | `apps/extension/src/chrome/privacy/deposit/`, `operations/` | Quote/review, encrypted durable intent, confirmation, receipt |
| Private state | `apps/extension/src/chrome/privacy/events/`, `commitments/`, `asp/` | Pool indexing, local lineage, verified eligibility |
| Private exit | `apps/extension/src/chrome/privacy/relayer/`, `withdrawals/` | Signed quote validation, proof, submit, nullifier-aware recovery |
| Public exit | `apps/extension/src/chrome/privacy/ragequit/` | Original-depositor proof, confirmation, exact event reconciliation |
| Proving | `apps/extension/src/chrome/privacy/prover/`, `apps/extension/privacy-prover-offscreen.html` | Nonce-bound offscreen host and packaged one-shot worker |
| Private portfolio history | `apps/extension/src/chrome/privacy/portfolioHistory/` | Privacy-key-encrypted bounded USD history and reset/recovery cleanup |
| Home mode | `apps/extension/src/app/home/`, `components/WalletModeToggle.tsx` | Persisted public/private presentation branch and private-only portfolio composition |
| Shield renderer | `apps/extension/src/components/Shield/` | Fixed Shield/Unshield swap-style forms, Unshield review, and contextual public recovery |
| Portfolio integration | `apps/extension/src/app/home/PrivatePortfolioHome.tsx`, `components/Portfolio/Holdings/` | Private-only Shielded ETH asset; public Holdings/Send remain ordinary assets only |
| Activity | `apps/extension/src/components/Activity/` | Mutually exclusive public versus Privacy Pools scopes plus relayed Unshield details |
| Recovery settings | `apps/extension/src/components/Settings/PrivacyRecoverySettings.tsx` | Temporary phrase reveal/restore UI only |

All privacy runtime messages are classified `wallet-ui` and must originate
from WalletChan's exact top-level extension document. No privacy route is
forwarded through the content script or exposed to dapps.

## Wallet and authorization matrix

| Path | Private key | Seed phrase | Impersonator | Agent session | Bankr |
| --- | --- | --- | --- | --- | --- |
| View aggregate status | Yes | Yes | Read-only | Read-only | Yes |
| Initialize with master/passkey | Yes | Yes | No | No | Yes |
| Quote and review active-chain Shield | Yes | Yes | No | No | Yes |
| Submit Sepolia Shield (`dev:extension`) | Yes | Yes | No | No | No, rejected before prompt |
| Submit mainnet Shield (production) | Yes | Yes | No | No | Yes |
| Private Unshield | Yes, wallet-wide identity | Yes, wallet-wide identity | Yes, wallet-wide identity | No | Yes, wallet-wide identity |
| Withdraw publicly on Sepolia (`dev:extension`) | Original depositor only | Original depositor only | No | No | No |
| Withdraw publicly on mainnet (production) | Original depositor only | Original depositor only | No | No | Original depositor only |
| Reveal/restore phrase | Main password only | Main password only | No | No | Main password only |

Account switching after a Shield review does not transfer authority: final
preparation and signing re-pin the explicit internal source account ID,
address, type, chain, value, and encrypted intent. Private Unshield accepts no
public account fields and therefore cannot drift with account selection.
Public withdrawal remains exact-original-depositor only, but the private UI
passes that signer explicitly instead of changing the global active account.

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
- The `100` bps relay maximum is enforced by the Sepolia Entrypoint. Small
  withdrawals can receive otherwise valid quotes above that hard cap when gas
  dominates the amount. WalletChan shows the cheapest verified percentage as
  a non-submittable warning, never offers an override that would revert, and
  exposes explicit original-depositor public withdrawal when available. Future
  public docs should distinguish this case from relay downtime.
- User-configured Sepolia RPC is preferred; WalletChan's known-chain endpoint
  is the fallback. Every JSON-RPC batch is capped at three requests.
- A quote necessarily exposes the selected public address, candidate amount,
  IP, and timing to that RPC. Fixed deployment checks expose none of the
  wallet's addresses, amounts, commitments, or secrets.
- ASP completion time is not controlled by WalletChan, so no ETA is displayed.

The exact implementation address, verifier addresses, scope, bytecode hashes,
artifact hashes, SDK integrity, and source commits remain in the checked-in
manifests and PRD; do not copy-edit those values independently.

## Mainnet release pins and network behavior

- Chain ID: `1`; deployment block: `22,153,707`.
- Entrypoint proxy: `0x6818809EefCe719E480a7526D76bD3e561526b46`.
- Active EIP-1967 implementation observed on 2026-07-20:
  `0x15e355024de1CDc74ADdea7EBDf98418Ba5B1a2c`. This live proxy value supersedes
  the older implementation address still shown by the public deployments page.
- ETH pool: `0xF241d57C6DebAe225c0F2e6eA1529373C9A9C9fB`.
- Scope:
  `4916574638117198869413701114161172350986437430914933850166949084132905299523`.
- Minimum deposit: `0.01 ETH`; vetting fee: `50` bps; maximum relay fee:
  `1,000` bps.
- ASP: `https://api.0xbow.io`; relayers: Fast Relay and Cloaked Relay. Cloaked
  Relay quotes are pinned to signer
  `0x3A27cfd1BB78Ff6Fd356Eaa59c2f6232FfC6554a`; Fast Relay uses its validated
  fee-recipient signer policy.
- The proxy, active implementation, pool, both verifiers, asset configuration,
  scope, relationships, and all five bytecode identities were checked through
  Ethereum RPC at block `25,573,384` on 2026-07-20. The exact observation and
  hashes are recorded in the mainnet manifest and mainnet test document.

`import.meta.env.MODE === "production"` selects this immutable profile during
the Vite build. Mainnet bundles are checked to contain the mainnet pins and
exclude the Sepolia deployment/API; explicit Sepolia bundles are checked for
the inverse. There is no runtime, storage, or remote deployment
override.

## Storage and recovery

- `chrome.storage.local.privacyVault` contains the encrypted phrase plus
  master/passkey wrappers and a key check. `privacyRecoveryBackup` contains
  only `{version, keyId, verifiedAt}`.
- The released `walletchan-privacy-*-v1` names remain Sepolia-only for dev
  continuity. Production uses corresponding `*-mainnet-v1` databases for
  operations, commitments, withdrawals, ragequits, portfolio, and public
  events, so testnet and mainnet lineage cannot mix.
- The active operations database stores bounded encrypted Shield operations
  and the atomic next-deposit index. The active commitments, withdrawals, and
  ragequits databases store encrypted private lineage and
  restart-safe exit state.
- The active portfolio database stores at most 193 fresh-IV encrypted
  ASP-cleared private balance/price/USD chart points with eight-day retention.
- The active events database is a disposable public pool-event cache.
  Phrase rescan rederives and verifies lineage instead of trusting the cache.
- Password rotation rewraps the same privacy key. Passkey setup/removal
  preserves the identity. Manual lock clears live capabilities but tracking of
  already-submitted public effects can continue.
- Account removal is blocked for unresolved Shield work, in-flight public
  recovery, or unspent commitments. Reset requires the explicit Shield-loss
  acknowledgement and deletes the vault, marker, and both profiles' encrypted
  databases. Recovery replacement follows the same cross-profile secret
  cleanup policy.

## Current automated baseline

The 2026-07-20 dual-profile verification passed the full Privacy Pools suite
(`181/181`), all three TypeScript configurations, `222/222` UI tests, all six
renderer architecture guards, targeted changed-file lint, all 12 private-home
preview states, production-profile bundle isolation, live read-only mainnet
deployment assertion, and `pnpm build:extension`. The refreshed build measured
46,239,514 bytes, including 23,690,342 artifact bytes, a 336,397-byte prover
worker, and a 3,525,783-byte background bundle. Packaged Chromium QA passed
both proofs across a closed and reopened extension page in 9.205/8.988 seconds
with a 261,128,192-byte peak process-tree RSS delta, within every frozen budget.
Targeted changed-file lint is clean; repository-wide lint was not part of this
checkpoint.
Re-run the commands below after any further change and record the new results
in this section and the Sepolia rehearsal:

```bash
pnpm --filter @walletchan/extension test:privacy
pnpm --filter @walletchan/extension typecheck:ui
pnpm --filter @walletchan/extension typecheck:qa
PREVIEW_QA_ROUTE=shield pnpm --filter @walletchan/extension qa:preview
pnpm build:extension
pnpm --filter @walletchan/extension qa:extension:privacy-prover
node apps/extension/scripts/privacy-prover-distribution.mjs --target=unpacked-sepolia-test
```

The extension's main, UI, and QA TypeScript configurations all pass. Keep all
three in the rehearsal because Privacy Pools crosses service-worker, renderer,
and packaged-QA boundaries.

The full renderer UI and module-size suites are clean. Keep the existing size
ratchets fixed rather than raising them to absorb future feature growth.

Safe service-worker diagnostics use these prefixes:

- `[privacy-shield] prover`
- `[privacy-shield] public-recovery-proof`

They intentionally contain only a stage, proof action, attempt number, and
bounded failure code. Do not add addresses, amounts, commitments, labels,
proofs, public signals, calldata, or secret material to logs.

## Completed manual QA record

The maintainer confirmed on 2026-07-23 that the written Sepolia and controlled
mainnet matrices were completed:

1. Production UI, pins, fee arithmetic, explorer links, and compile-time
   mainnet/Sepolia bundle isolation.
2. Bankr, private-key, and seed-phrase Shield flows plus impersonator and agent
   rejection paths.
3. Confirmation/indexing/ASP transitions, partial and full private Unshield,
   expiry/restart handling, and exact-original-depositor public withdrawal.
4. Separate phrase reveal, clean restore/rescan, account removal, full reset,
   recovery-only behavior, and cross-profile encrypted-database deletion.
5. Rejection, insufficient-funds, below-minimum, deployment/ASP/root, and
   relayer-substitution negative paths.

Future changes to Privacy Pools signing, proving, recovery, relayer policy, or
deployment profiles should repeat the affected rows. Preserve the resolved
GPL-3.0-only license, `snarkjs` attribution, and source-package checks during
the v4 release process.

## Documents to keep synchronized

- [`PRIVACY_POOLS_PRD.md`](./PRIVACY_POOLS_PRD.md): product, security, and
  rollout source of truth.
- [`PRIVACY_POOLS_TASKS.md`](./PRIVACY_POOLS_TASKS.md): implementation and
  manual-gate status.
- [`PRIVACY_POOLS_SEPOLIA_TEST.md`](./PRIVACY_POOLS_SEPOLIA_TEST.md): exact
  browser rehearsal.
- [`PRIVACY_POOLS_MAINNET_TEST.md`](./PRIVACY_POOLS_MAINNET_TEST.md): exact
  mainnet pins, read-only verification, production bundle checks, and manual
  value-bearing QA record.
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
