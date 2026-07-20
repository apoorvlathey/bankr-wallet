# Privacy Pools implementation handoff

> **Handoff date:** 2026-07-20
> **Build targets:** `dev:extension` uses Sepolia; normal/production builds use
> Ethereum mainnet only
> **Implementation status:** Dual-profile code and automated profile/wallet
> coverage are complete; value-bearing mainnet browser smoke tests remain
> **Distribution status:** Store/release packaging remains blocked pending the
> existing GPL/legal/compliance gate
> **Resume with:** [`PRIVACY_POOLS_MAINNET_TEST.md`](./PRIVACY_POOLS_MAINNET_TEST.md)

This is the starting document for the next implementation session. It records
what is built, what the product owner has observed manually, the important
security and protocol decisions, the latest fixed defects, and the remaining
gates. A production build now contains only the mainnet deployment, but that
does not by itself approve store distribution or authorize a value-bearing
mainnet rehearsal.

## Product behavior now

- The unlocked home now has a Public/Private switch aligned to the right edge
  of the balance heading—below the account selector in Public and in the same
  position in Private. It is a tiny tooltip-free amber-selected control on the
  shared Warm Midnight base canvas. Public remains the account-scoped wallet. Private removes the
  account selector, positions, public assets, public chart, and public Activity.
- Private mode shows only the wallet-wide Shielded ETH balance and USD chart,
  `Shield` / `Unshield` / `Send`, one Shielded ETH Assets row, and Privacy
  Pools Activity across all depositor accounts. The public side excludes all
  Shield/Unshield rows and never mixes the private balance into account totals.
  The three private actions reuse the exact public-home action treatment and
  icons instead of introducing large action cards.
- Shield now follows the wallet's Swap form grammar with compact fixed active-chain
  ETH and Shielded ETH amount cards and one sticky review action. Shield,
  Unshield, and Send are independent screens reached directly from Private;
  there is no internal mode selector. `Deposit from` names the signer without a redundant
  network subtitle, and the private balance is not repeated inside the form. There is no
  recovery wizard, protocol primer, local activity list, asset selector, or
  network selector in the normal flow. Shield chooses its active-chain-paying
  account inside the form without changing the global public account.
- `Shielded ETH` is permanent only in Private Assets, even at zero. It shows
  the compliance-cleared balance with amber processing subcopy, carries a
  active deployment identity, and opens Shield, Unshield, Send privately, or Private Activity.
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
  gas, and a gas-aware Max.
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
- Private Unshield and **Send privately** are separate entries over the same
  relayed withdrawal engine. Both begin with an empty recipient and require an
  explicit address or contact choice. Shielded ETH is debited and
  public active-chain ETH is delivered through the shared Send recipient/contact/ENS
  flow through the pinned relay. Its concise review uses a normal button press,
  explains there is no direct onchain link to the deposit, and makes no claim
  that timing, amount matching, or address reuse are untraceable. No additional
  renderer password, biometric, or hold gesture is introduced.
- Private send is available only for locally verified, ASP-approved
  commitments. It spends the wallet-wide privacy identity, so it intentionally
  has no public-account selector and works independently of whether Bankr,
  private-key, seed-phrase, or an impersonator is selected on the public side.
  A live master/passkey capability is still required and agent sessions remain
  blocked. WalletChan does not invent an ASP completion estimate.
- After an exact deposit is confirmed and indexed, the original depositor may
  choose **Withdraw publicly** without waiting for the ASP. This produces the
  protocol ragequit transaction, returns funds to that original public
  account, and publicly links the exit to the deposit.
- Public Shield progress and relayed private-send outcomes live in Private
  Activity only. Shield deposits keep their four real stages
  and ordinary active-chain transaction details; both the Activity row and detail
  screen use the same amber privacy mark and durable lifecycle projection.
  Successful Shield and public-recovery confirmations return to Private
  Activity instead of resetting to Assets. Deposit, lifecycle, and recovery
  rows all reuse the privacy mark; the recovery confirmation is titled
  `Shield Recovery`.
  Private sends use sanitized withdrawal rows and concise route/fee/status
  details. The matching Public Activity stays strictly account/public scoped.
- Shield quote loading retains the last verified public balance, maximum,
  output, and slider geometry. The source amount mirrors slider movement on
  every drag frame, but that draft remains renderer-local until release, so
  dragging does not start quote requests or flash the ETH balance to zero.
  The source field also reuses Send's in-field ETH/USD switch when an ETH price
  is available; only canonical ETH reaches quote/review/operation messages.
  Recoverable errors render below the route metadata rather than inside the
  source balance row.
- Backing out of the normal Shield transaction review leaves its request
  pending. Tapping Shield again reopens that exact trusted confirmation instead
  of preparing another durable operation. The queue's idempotent fallback also
  re-announces an exact pending request without repeating deployment RPC work;
  Confirm still revalidates deployment and authorization before submission.
- Unshield always mirrors Shield's two-card amount grammar. When no Shielded
  ETH is privately available but ragequit is, the same cards show the fixed
  public-exit amount and original depositor. A required unchecked commitment
  control identifies recovery to the original address as a public transaction;
  only checking it enables the sticky `Withdraw publicly` action. The
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
| Protocol/deployment | `apps/extension/src/chrome/privacy/protocol/`, `deployment/` | Pinned primitives, artifacts, exact compile-time Sepolia/mainnet allowlists |
| Deposit lifecycle | `apps/extension/src/chrome/privacy/deposit/`, `operations/` | Quote/review, encrypted durable intent, confirmation, receipt |
| Private state | `apps/extension/src/chrome/privacy/events/`, `commitments/`, `asp/` | Pool indexing, local lineage, verified eligibility |
| Private exit | `apps/extension/src/chrome/privacy/relayer/`, `withdrawals/` | Signed quote validation, proof, submit, nullifier-aware recovery |
| Public exit | `apps/extension/src/chrome/privacy/ragequit/` | Original-depositor proof, confirmation, exact event reconciliation |
| Proving | `apps/extension/src/chrome/privacy/prover/`, `apps/extension/privacy-prover-offscreen.html` | Nonce-bound offscreen host and packaged one-shot worker |
| Private portfolio history | `apps/extension/src/chrome/privacy/portfolioHistory/` | Privacy-key-encrypted bounded USD history and reset/recovery cleanup |
| Home mode | `apps/extension/src/app/home/`, `components/WalletModeToggle.tsx` | Persisted public/private presentation branch and private-only portfolio composition |
| Shield renderer | `apps/extension/src/components/Shield/` | Fixed Shield/Unshield swap-style form, private-send review, and contextual public recovery |
| Portfolio/Send integration | `apps/extension/src/app/home/PrivatePortfolioHome.tsx`, `components/Portfolio/Holdings/` | Private-only Shielded ETH asset; public Holdings/Send remain ordinary assets only |
| Activity | `apps/extension/src/components/Activity/` | Mutually exclusive public versus Privacy Pools scopes plus private-send details |
| Recovery settings | `apps/extension/src/components/Settings/PrivacyRecoverySettings.tsx` | Temporary phrase reveal/restore UI only |

All privacy runtime messages are classified `wallet-ui` and must originate
from WalletChan's exact top-level extension document. No privacy route is
forwarded through the content script or exposed to dapps.

## Wallet and authorization matrix

| Path | Bankr | Private key | Seed phrase | Impersonator | Agent session |
| --- | --- | --- | --- | --- | --- |
| View aggregate status | Yes | Yes | Yes | Read-only | Read-only |
| Initialize with master/passkey | Yes | Yes | Yes | No | No |
| Quote and review active-chain Shield | Yes | Yes | Yes | No | No |
| Submit Sepolia Shield (`dev:extension`) | No, rejected before prompt | Yes | Yes | No | No |
| Submit mainnet Shield (production) | Yes | Yes | Yes | No | No |
| Private Unshield | Yes, wallet-wide identity | Yes, wallet-wide identity | Yes, wallet-wide identity | Yes, wallet-wide identity | No |
| Withdraw publicly on Sepolia (`dev:extension`) | No | Original depositor only | Original depositor only | No | No |
| Withdraw publicly on mainnet (production) | Original depositor only | Original depositor only | Original depositor only | No | No |
| Reveal/restore phrase | Main password only | Main password only | Main password only | No | No |

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
the Vite build. The production background bundle is checked to contain the
mainnet pins and exclude the Sepolia deployment/API; the development bundle is
checked for the inverse. There is no runtime, storage, or remote deployment
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

## Resume order

1. Use [`PRIVACY_POOLS_MAINNET_TEST.md`](./PRIVACY_POOLS_MAINNET_TEST.md) to
   inspect a normal production build and confirm Ethereum/mainnet labels,
   `0.01 ETH` minimum, 0.5% protocol fee, mainnet explorer links, and Bankr plus
   both local source-account options. Confirm no Sepolia endpoint/address is in
   the emitted privacy bundles.
2. Reload a `dev:extension` build and complete the remaining written Sepolia
   rehearsal for private-key and seed-phrase accounts, including recovery,
   rejection, restart, private Unshield, and destructive safeguards. Confirm
   Bankr remains blocked in this profile.
3. On an unfunded or otherwise non-submitting production wallet, exercise
   mainnet quote/review validation and the negative matrix: impersonator,
   agent session, insufficient funds, below-minimum input, deployment drift,
   ASP/root failure, and relayer substitution.
4. Obtain explicit value-bearing test authorization and caps before sending
   mainnet funds. Then perform the ordered mainnet smoke matrix with Bankr,
   private-key, and seed-phrase accounts: Shield, confirmation/indexing/ASP,
   partial and full Unshield, clean phrase restore/rescan, and exact-original-
   depositor public recovery. Record hashes and outcomes without recording
   privacy secrets or linkable private-withdrawal details in shared logs.
5. Exercise account-removal, reset, recovery-only, and incident/kill procedures
   against disposable mainnet state. Verify cross-profile reset removes both
   Sepolia and mainnet encrypted databases.
6. Resolve the `snarkjs` license/distribution decision and complete
   security/legal/compliance/store-policy review before using GitHub release,
   Chrome Web Store, or Firefox packaging. The mainnet build profile does not
   bypass those gates.

## Documents to keep synchronized

- [`PRIVACY_POOLS_PRD.md`](./PRIVACY_POOLS_PRD.md): product, security, and
  rollout source of truth.
- [`PRIVACY_POOLS_TASKS.md`](./PRIVACY_POOLS_TASKS.md): implementation and
  manual-gate status.
- [`PRIVACY_POOLS_SEPOLIA_TEST.md`](./PRIVACY_POOLS_SEPOLIA_TEST.md): exact
  browser rehearsal.
- [`PRIVACY_POOLS_MAINNET_TEST.md`](./PRIVACY_POOLS_MAINNET_TEST.md): exact
  mainnet pins, read-only verification, production bundle checks, and manual
  value-bearing gates.
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
