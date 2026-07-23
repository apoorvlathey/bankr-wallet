# Shield UI audit map

The Shield domain owns WalletChan's fixed active-chain ETH ↔ Shielded ETH
renderer. Development builds select Sepolia; production builds select Ethereum
mainnet at compile time.
Secret storage, authorization, protocol, proving, RPC, signing, and relayer
effects remain background responsibilities.

## Files

- `PrivacyActionScreen.tsx`: stable router for the separate Shield, Unshield,
  and deposit-status screens.
- `ShieldScreen.tsx`: public deposit composition, source account, quote, and
  transaction-review routing only.
- `ShieldSourceAccountPicker.tsx`: compact source trigger and account menu. It
  reuses the shared account identity projection and cached ENS avatar path, so
  contact labels, saved names, ENS names, and address fallbacks stay consistent
  with Public account selection and Send.
- `PrivateWithdrawalScreen.tsx`: relayed and receiver-paid Unshield controllers,
  including recipient-owned signer resolution, review routing, and contextual
  public recovery.
  Transaction-detail cancellation entries preserve the selected operation and
  exact net Shielded ETH amount, then keep that operation's public exit primary.
- `ShieldDashboard.tsx`: fixed-title shell and sticky transaction action; it
  deliberately owns no mode tabs.
- `ShieldAssetCards.tsx`: Swap-aligned fixed-asset amount cards, live-display
  percentage slider, and direction marker. The amount field follows each drag
  frame, while the value stays renderer-local and triggers a quote only on
  release. Shield reuses Send's in-field ETH/USD conversion control while all
  quotes and operations remain canonical ETH. Neither side exposes an
  asset/network picker.
- `ShieldAmountPanel.tsx`: public active-chain ETH source and Shielded ETH
  outcome, with the shared in-field three-dot quote loader and full-width
  recoverable errors below the route metadata.
- `ShieldComplianceProgress.tsx`: shared receipt-timed one-hour compliance bar;
  pending progress is capped at 90% and refreshed by a renderer-only timer.
- `ShieldComplianceElapsedTime.tsx`: receipt-timed compact elapsed value with
  NumberFlow transitions and a divider row for the expanded transaction-detail
  compliance card.
- `ShieldComplianceInfoPopover.tsx`: shared review/detail timing explanation and
  locally bundled Privacy Pools attribution. The official logo is copied to
  `public/privacy-pools-logo.svg` from `0xbow-io/privacy-pools-website` at
  commit `461867adb439f25f1cc809ee0187357916b90ef6` (SHA-256
  `c0931b5c621672ee7a33d28a1626015aecb2e7db74e12cab0b79b6d583818ae4`).
- `UnshieldAmountPanel.tsx`: first-step Shielded ETH amount and boxed recipient
  controls. It deliberately renders no quote output, relay fee, or recovery
  warning.
- `UnshieldReview.tsx`: quote-loading review with a `Withdrawal method` sheet
  for `Private relay`, eligible `Receiver pays gas`, and recipient-matched
  `Public withdraw` ragequit routes. It owns the
  source/receiver amounts and a compact Request details list. The quoted relay
  fee leads the relay details as percentage plus ETH/USD value. Its adjacent
  expiry row uses the shared Number Flow motion language before network, route,
  and relayer metadata. Each selected relay quote schedules one automatic
  refresh at expiry; the user never has to recover an ordinary timeout
  manually. An
  over-cap quote turns the same row semantic error red and adds the active
  Entrypoint limit instead of creating another warning card.
- `AnimatedQuoteExpiry.tsx`: accessible `m:ss` Number Flow countdown extracted
  from review so the quote screen stays inside the renderer size budget.
- `WithdrawalMethodSheet.tsx` and `UnshieldDetailRow.tsx`: focused method-choice
  and vertically aligned review-row presentation extracted from the review
  composition. The method rows use Lucide-derived radio-tower, fuel, and
  shield-off marks for relay, receiver-paid gas, and public ragequit.
- `UnshieldDetailScreen.tsx`: live full-screen transaction detail composition
  for relayed and receiver-paid withdrawals. It reuses the ordinary transaction
  shell, identity/status hierarchy, balance-change section, summary list, and
  explorer action; it never renders as a modal. Routing and fee metadata remain
  below the primary transfer receipt.
- `UnshieldTransferSummary.tsx`: receipt-style private-debit to public-credit
  hierarchy with Shielded ETH/ETH marks, signed ETH values, renderer-only USD
  equivalents, and one resolved recipient address control.
- `ShieldAmountConversion.tsx`: shared interactive ETH/USD conversion or
  read-only USD equivalent inside Shield and Unshield amount fields.
- `PublicRecoveryPanel.tsx`: compact secondary public-exit entry shown from
  Unshield's sticky review action bar when the private relay route exceeds its
  fee cap; it never queues a transaction.
- `PublicRecoveryAccountIdentity.tsx`: saved account name, resolved avatar, and
  deterministic blockie fallback shared by public-exit entry and review.
- `PublicRecoveryReviewScreen.tsx`: account-grouped checkbox list of every
  authoritative ragequittable commitment, with exact amount/date rows,
  same-account selection locking, a total, public-link acknowledgement, and a
  one-transaction atomic exit for 2–8 selected whole commitments. Ledger groups
  are limited to one selected commitment and exit through normal hardware
  confirmation because Ledger atomic batches remain unsupported.
- `PublicRecoveryStatusScreen.tsx`: direct Private Home adapter that loads the
  existing read-only public-exit selector without first entering Unshield.
- `hooks/useShieldInitialization.ts`: one status-only entry request plus retry.
- `hooks/useShieldQuote.ts`: debounced account-bound public deposit quote.
- `hooks/useShieldReview.ts`: bounded background deposit-review preparation.
- `hooks/useShieldOperation.ts`: stable request UUID and durable-operation save.
- `hooks/useShieldOperations.ts`: sanitized operation/portfolio read, immediate
  submitted-withdrawal cache projection, and the single adaptive
  event/index/ASP/withdrawal sync loop for its mounted feature owner.
- `hooks/useUnshield.ts`: Unshield quote and relay submission controller.
- `hooks/useAutoRefreshUnshieldQuote.ts`: selected-method expiry scheduler with
  one refresh request per accepted relay quote.
- `hooks/useDirectUnshield.ts`: receiver-paid proof/gas preparation and normal
  transaction-confirmation queue controller.
- `hooks/usePublicRecovery.ts`: user-triggered read-only public-exit listing and
  selected-commitment preparation.
- `model/shieldedAsset.ts`: Shielded ETH identity, active deployment pin, and
  its Shield/Unshield/Activity asset actions.
- `model/shieldQuote.ts`, `shieldReview.ts`, `shieldOperation.ts`,
  `unshield.ts`, and `recovery.ts`: exact bounded public response models.
- `model/pendingShield.ts`: exact trusted pending-confirmation resumption when
  the user returns to Shield after backing out of transaction review.
- `model/shieldActivity.ts` and `shieldProgress.ts`: pure status presentation.

## Effects and dependency direction

Entering Private mode requests `privacyEnsureInitialized` without blocking the
home transition or consuming its status. The Shield screen repeats that request
and receives ready or a typed action-required status. `auth-required` renders a
neutral `Unlock WalletChan to continue` action instead of a red operation error;
password and passkey success return to the same Shield/Unshield mode and
retain any transaction-selected public-exit target. Other repair states retain
Retry. Shield
opens directly on amount entry; no prover/readiness job blocks the form. The
quote hook sends only exact account metadata and a public amount, then accepts
only arithmetic-consistent responses. The amount is the exact Shielded ETH the
user wants; shared wei-exact policy derives a canonical gross Entrypoint value
whose fee-deducted output equals it. At one-wei rounding boundaries it selects
the exact available gross amount, so Max/100% consumes the full post-gas
balance. Review and durable preparation pin that accepted public gross value.
Max is the net shieldable value after gas and protocol fee. `Review shield` obtains a bounded intent
review and immediately persists the encrypted operation so the existing normal
transaction request becomes the single review/confirmation screen. That review
shows the chosen shielded amount and gross wallet debit without a redundant fee
row, plus the one-hour compliance estimate and its longer-duration/public-exit
popover. Transaction details reuse this exact explanation from both the
pending status loader and the complete lifecycle card. React never
receives calldata or note material and never signs or submits.
Backing out of that confirmation does not reject it. The next Shield entry
resumes the newest exact trusted Privacy Pools transaction request instead of
re-running preparation. The background queue path is also idempotent: an exact
existing pending request is re-announced, and a retry can resume the exact
account/amount-bound durable operation before another quote or deployment RPC
pass. Queue creation itself does not repeat deployment verification; durable
preparation already verified it, and the eventual Confirm path still
revalidates deployment and authorization. The runtime pending event updates the
mounted renderer queue immediately so a fast Back cannot race the authoritative
storage-change notification and reopen preparation.

The Shield amount field uses the private portfolio's current ETH price for the
same in-field ETH/USD switch as Send. USD is a renderer-only denomination:
validation, quotes, durable operation IDs, encrypted intent, slider math, and
the submitted transaction remain wei/ETH-bound. If price is unavailable, the
toggle is absent and ETH entry continues normally. Request, quote, validation,
and operation failures render below the Privacy Pools/network-fee metadata so
the balance row remains readable and the retained amount stays editable.
Slider position parses the canonical amount independently from the protocol
minimum, so a sub-minimum amount stays reflected while its corrective error is
shown and the quote/review path remains unavailable.

The private home exposes Shield, Unshield, and Deposits as three equal quick
actions. Deposits opens the existing account-grouped whole-deposit public exit
selector directly and uses the quieter secondary foreground color in midnight
themes. Privacy Pools recovery remains available through the global Settings
screen rather than being duplicated in the private action rail. Shield and
Unshield remain the only transaction-entry actions.
Shield is its own public-deposit screen. Unshield is the only v1 withdrawal
screen because Privacy Pools v1 has no in-pool transfer. It starts with an
empty recipient and requires an explicit address or contact choice. It reuses
Send's contact, ENS, and contract-warning controls inside a boxed `Receive at`
destination. The first screen contains only the amount and address; `Review
unshield` opens a fresh quote-backed screen with the exact private debit,
public ETH outcome, fee, relay, expiry, and privacy warnings. The background
generates and verifies the proof and submits through the pinned relay by
default. Review may instead select a WalletChan-owned recipient to pay gas;
that route shows no relay fee, warns that the receiving account submits
publicly, and opens the normal account-pinned transaction confirmation after
exact proof/calldata simulation. The already-unlocked master capability is
checked in the background; the renderer adds no password, biometric, or
hold-to-confirm step.

With ready funds, Unshield's entry screen pairs an editable Shielded ETH source
with the recipient address; the review then shows the complete Shielded ETH ->
active-chain ETH outcome. When no private balance is ready but ragequit is
available, entry shows the fixed public amount and original depositor. Both
that primary route and the review-only fallback row first call the read-only
public-recovery preview, then open a
dedicated review showing the exact current whole-commitment amount and saved
account identity. Merely opening it creates no proof, recovery intent, claim,
or transaction request. A required unchecked commitment control states that
the final recovery is public; only then can the user choose `Withdraw publicly`.
Navigation from a pending
Shield transaction prefills its exact net amount and scopes both the displayed
offer and background recovery selector to that same Shield operation. A ready
private balance keeps the relayed route primary even when another deposit is
pending: available-balance copy wins, and amount validity is reported
independently from the intentionally blank recipient field.

If every otherwise verified relay quote exceeds the active Entrypoint's hard
`maxRelayFeeBPS`, the review screen shows the cheapest quote's relay name,
estimated receive amount, fee, and exact percentage beside the contract
maximum. The entry form remains unchanged. The warning does not show
`quote-unavailable`, create a relay withdrawal, or offer an override that would
revert onchain. Receiver-paid withdrawal remains available from the method
sheet without adding another sticky card. When the recipient is also the
original depositor, the same sheet exposes `Public withdraw`; its copy names
ragequit and whole-deposit linkage before opening the existing recovery review.

Ready balance is aggregate across encrypted commitments, but one relayed
withdrawal proof consumes only one commitment. When those values differ, the
amount card labels them `Total ready` and `Max`; the info popover explains that
the user can make subsequent withdrawals for the remaining commitments.

Unshield consumes one pure route-copy contract for screen, recipient, review,
outcome, and final-action labels. Its normal sticky action always describes
the current route and stays disabled when no Shielded ETH is ready;
it never turns into a cross-route Shield action. Public recovery is the only
intentional label override because it is a distinct public transaction.

The Unshield-only recipient chooser exposes a header Add account action. It
reuses the existing account creation/import flow without unmounting the
withdrawal controller, so Back restores the chooser and a successful addition
returns with the exact new address selected. Once the refreshed wallet row is
available, the chooser performs one reduced-motion-aware scroll to bring it
into view. Generic Send keeps the shared recipient chooser without this action.

The private home's three-action rail labels the existing recovery-status route
as `Deposits`. In Warm Midnight, Deposits uses the secondary gray icon tone so
the amber Shield and Unshield actions remain the primary focus.
The private home reports ready and compliance-pending ETH; the pending amount
uses the shared amber privacy-status accent. Quote refreshes
retain the last verified balance, maximum, output, and slider geometry until a
replacement quote succeeds, so loading never flashes the public ETH balance to
zero or removes the amount control.
Durable commitment writes broadcast a payload-free private-portfolio
invalidation. The mounted private home debounces that signal and reloads its
aggregate and encrypted chart, including when Shield becomes ready after ASP
approval or a direct/relayed Unshield applies its replacement commitment.
If an MV3 service-worker restart leaves the dedicated privacy key cold, the
background still derives confirmed and compliance-pending totals from the same
sanitized public Shield operation summaries used by Activity. Private-ready,
recoverable, and spendable balances remain zero until the encrypted commitment
store is authenticated, so reopening the extension cannot hide an onchain
deposit in the processing line or Shielded ETH asset row.
The portfolio's `status: "locked"` is therefore a data-availability marker, not
a wallet-auth verdict. Shield and Unshield never route to the unlock card from
that aggregate status alone. They use `privacyEnsureInitialized` and typed
mutation authorization failures, which share the normal wallet session and
surface lease. A current master password/passkey session restores the verified
privacy capability across a worker restart; agent sessions deliberately do not.
The closed-renderer alarm and an open transaction-details timer can still
verify public ASP approval while locked. They project `asp_approved` and send
the generic browser notification without unlocking; full private readiness is
reconciled only after an authenticated privacy sync.
Shielded ETH is deliberately excluded from the public portfolio USD total,
chart, low-value group, and chain totals. The Shield screen owns no parallel
activity list: public deposits and sanitized relay- or receiver-paid Unshield withdrawals appear in
the main dated wallet Activity timeline. A successful relayer submission
immediately returns to Private Activity instead of pausing on a terminal Done
button. Selecting an Unshield row pushes the full-screen transaction-detail
route, and its terminal private-balance state uses the standard `Confirmed`
status. Receiver-paid preparation records its waiting operation before opening
normal account-pinned confirmation, then follows Processing, onchain
confirmation, explorer-link, and final receipt updates in the same row. Rejecting
the wallet confirmation releases the claimed commitment and does not add an
Unshield row to Private Activity. The local reservation stays in the displayed
private balance, is excluded from the spendable maximum, and never creates a
chart dip; rejection also removes any legacy point captured during its reservation
window. A different definite submission failure remains
visible as `Transaction was not submitted`; only a genuinely ambiguous broadcast
remains in Processing without a hash while nullifier reconciliation checks it.
Recovery waits through the bounded confirmation-to-submission handoff instead of treating
the consumed prompt as an immediate interruption. The shared transaction
receipt finalizer also updates this private operation directly, with its
dedicated poller retained for worker-restart recovery. Public recovery remains contextual on
the standalone Unshield screen and returns only to the original depositor with explicit link
disclosure.

Any privacy transaction actually submitted by a WalletChan account is also
visible in that signer's Public Activity. This includes Shield, every single or
batch public-exit entry point, and receiver-paid Unshield. Private Activity
keeps the privacy-ledger representation; for receiver-paid Unshield it uses the
richer sanitized operation row instead of duplicating the ordinary history row.
Relayed Unshield remains Private-only because the user's account did not submit
the relay transaction.

The root `components/ShieldView.tsx` remains a policy-free compatibility facade.
Pure coverage lives in `tests/ui/shield*.test.ts` and
`tests/ui/unshieldModel.test.ts`; protocol and wallet-matrix coverage lives in
`tests/privacy/`.
