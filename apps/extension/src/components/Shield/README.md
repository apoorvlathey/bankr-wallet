# Shield UI audit map

The Shield domain owns WalletChan's private-balance renderer. Secret storage,
authorization, protocol, proving, RPC, and signing effects remain background
responsibilities.

## Files

- `ShieldScreen.tsx`: composition root and compact action feedback.
- `ShieldDashboard.tsx`: the single balance-first Sepolia Shield screen.
- `ShieldOperationProgress.tsx`: accessible four-stage Shield lifecycle bar;
  it reports real states rather than guessing elapsed time and exposes the
  current-stage explanation on hover or keyboard focus.
- `hooks/useShieldInitialization.ts`: one status-only background request on
  entry plus an explicit retry path.
- `hooks/useShieldQuote.ts`: debounced exact-account quote request and bounded
  response parsing.
- `hooks/useShieldReview.ts`: one user-triggered review-preparation request with
  stale-response suppression.
- `hooks/useShieldOperation.ts`: stable request UUID plus one user-triggered
  durable-operation save; retries reuse the same request until inputs change.
- `hooks/useShieldOperations.ts`: sanitized durable activity read, matching
  receipt-event refresh, and adaptive indexing/ASP sync while mounted.
- `hooks/useShieldNativePrice.ts`: public Sepolia ETH/USD lookup through the
  wallet's existing cached native-price route.
- `hooks/useUnshield.ts`: private-withdrawal quote/review/submission state with
  stale-response suppression and bounded public response validation.
- `hooks/usePublicRecovery.ts`: user-triggered original-depositor public-exit
  preparation through the normal WalletChan confirmation surface.
- `ShieldAmountPanel.tsx`: compact inline amount, balance, fee, gas, and Max UI.
- `UnshieldAmountPanel.tsx`: compact ready-balance, recipient, amount, quote,
  and private-withdrawal review UI.
- `PublicRecoveryPanel.tsx`: compact opt-out from ASP waiting with an explicit
  public-link warning before the normal wallet confirmation.
- `model/shieldDashboard.ts`: pure dashboard fixture and presentation copy.
- `model/shieldQuote.ts`: exact decimal validation, response invariants, and
  approximation-marked display formatting.
- `model/shieldReview.ts`: exact public ready-summary validation; calldata and
  commitment material are rejected by shape.
- `model/shieldOperation.ts`: exact public pending-operation and activity-list
  validation; secret-bearing fields are rejected by shape.
- `model/shieldActivity.ts`: pure activity status and badge copy for Shield,
  private Unshield, and public withdrawal records.
- `model/recovery.ts`: public-withdrawal response validation, concise copy, and
  account-bound indexed-operation offer fallback.
- `model/shieldProgress.ts`: pure durable-state to progress-stage mapping.

## Effects and dependency direction

The entry hook sends only `privacyEnsureInitialized` and receives only `ready`
or a bounded action-required status. Pressing Shield opens the amount form
immediately; no prover or deployment-readiness job blocks that interaction. The
quote hook sends exact account metadata and public amount through
`privacyQuoteShield`, then accepts only arithmetic-consistent decimal-string
responses. Final operation preparation still verifies the pinned deployment
before anything can be persisted or submitted. Healthy setup paints no extra
recovery UI. There are no renderer
storage, network, clipboard, cryptographic, proving, or transaction effects.
`Continue` can only request a background-prepared ready status. The following
`Confirm details` control asks the background to persist one encrypted,
account-bound operation and queue the normal WalletChan transaction
confirmation. The renderer itself never receives calldata, signs, or submits;
the background revalidates the encrypted intent before the existing local
signer path can publish it.
The balance headline uses the aggregate already confirmed in the pinned pool;
its ETH unit stays attached to the amount and a subordinate live USD value uses
the existing public native-price route. Private Unshield remains limited to the
separately verified ready balance. Once a deposit is confirmed and indexed, a
local private-key or seed-phrase depositor may instead withdraw it publicly to
the original address without waiting for ASP inclusion. The action stays
visible from the account-bound indexed operation even when another wallet
account is selected; the renderer identifies the original address and requires
that account to be selected before proof preparation. It also stays visible
while an older profile's encrypted commitment record catches up; clicking
repeats local materialization before proof preparation and does not wait on ASP
transport. Any
confirmed amount still awaiting the ASP appears as one compact amber value with
a hover/focus explanation, an optional public-withdrawal action, and no
speculative time estimate. Matching
transaction-history updates reload the lifecycle after its receipt mirror, so
progress changes without leaving and reopening Shield. Confirmation/indexing
states use a short adaptive sync and ASP-only waiting uses a two-minute cadence.
User-rejected public-withdrawal prompts are omitted from the returned Activity
projection after the background releases their claims; genuine failures and
submitted/recovered exits remain visible.
Presentation depends on the pure model and shared `components/ui` primitives.
The root `components/ShieldView.tsx` remains a compatibility facade for the
existing lazy route.

Pure model behavior is covered by `tests/ui/shieldDashboardModel.test.ts` and
`tests/ui/shieldQuoteModel.test.ts`, `tests/ui/shieldReviewModel.test.ts`, and
`tests/ui/shieldOperationModel.test.ts`.
Manual coverage is tracked in
`_docs/PRIVACY_POOLS_TASKS.md`; fresh-session context and ordered remaining work
are in `_docs/PRIVACY_POOLS_HANDOFF.md`.
