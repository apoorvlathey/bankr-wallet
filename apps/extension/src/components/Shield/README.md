# Shield UI audit map

The Shield domain owns WalletChan's fixed active-chain ETH ↔ Shielded ETH
renderer. Development builds select Sepolia; production builds select Ethereum
mainnet at compile time.
Secret storage, authorization, protocol, proving, RPC, signing, and relayer
effects remain background responsibilities.

## Files

- `PrivacyActionScreen.tsx`: stable three-intent router for the separate Shield,
  Unshield, and Send screens.
- `ShieldScreen.tsx`: public deposit composition, source account, quote, and
  transaction-review routing only.
- `PrivateWithdrawalScreen.tsx`: shared relay controller for distinct Unshield
  and Send entries, including recipient/review routing and contextual recovery.
- `ShieldDashboard.tsx`: fixed-title shell and sticky transaction action; it
  deliberately owns no mode tabs.
- `ShieldAssetCards.tsx`: Swap-aligned fixed-asset amount cards, live-display
  percentage slider, and direction marker. The amount field follows each drag
  frame, while the value stays renderer-local and triggers a quote only on
  release. Neither side exposes an asset/network picker.
- `ShieldAmountPanel.tsx`: public active-chain ETH source and Shielded ETH outcome.
- `UnshieldAmountPanel.tsx`: Shielded ETH source, public ETH outcome, shared
  recipient controls, and intent-aware Unshield/Send copy.
- `PrivateSendReview.tsx`: concise relayed-withdrawal review with a normal
  `Send privately` press action and no renderer password/biometric step.
- `PublicRecoveryPanel.tsx`: compact secondary original-depositor public exit
  for screens that still have a ready private-relay route.
- `hooks/useShieldInitialization.ts`: one status-only entry request plus retry.
- `hooks/useShieldQuote.ts`: debounced account-bound public deposit quote.
- `hooks/useShieldReview.ts`: bounded background deposit-review preparation.
- `hooks/useShieldOperation.ts`: stable request UUID and durable-operation save.
- `hooks/useShieldOperations.ts`: sanitized operation/portfolio read and the
  single adaptive event/index/ASP sync loop for its mounted feature owner.
- `hooks/useUnshield.ts`: private-send quote and relay submission controller.
- `hooks/usePublicRecovery.ts`: user-triggered public-exit preparation.
- `model/shieldedAsset.ts`: Shielded ETH identity, active deployment pin, asset actions,
  and the renderer-only Send-selector sentinel.
- `model/shieldQuote.ts`, `shieldReview.ts`, `shieldOperation.ts`,
  `unshield.ts`, and `recovery.ts`: exact bounded public response models.
- `model/shieldActivity.ts` and `shieldProgress.ts`: pure status presentation.

## Effects and dependency direction

Entering Private mode requests `privacyEnsureInitialized` without blocking the
home transition or consuming its status. The Shield screen repeats that request
and receives only a ready/action-required status so it can offer Retry. Shield
opens directly on amount entry; no prover/readiness job blocks the form. The
quote hook sends only exact account metadata and a public amount, then accepts
only arithmetic-consistent responses. `Review shield` obtains a bounded intent
review and immediately persists the encrypted operation so the existing normal
transaction request becomes the single review/confirmation screen. React never
receives calldata or note material and never signs or submits.

The private home exposes Shield, Unshield, and Send as three sibling quick
actions. Shield is its own public-deposit screen. Unshield and Send are separate
screens backed by the same exact withdrawal controller: Unshield defaults the
recipient to the active WalletChan account, while Send starts recipient-first.
Both reuse Send's contact, ENS, and contract-warning controls, then open one
compact intent-aware review. The background generates and verifies the proof
and submits through the pinned relay. The already-unlocked master capability is
checked in the background; the renderer adds no password, biometric, or
hold-to-confirm step.

Unshield always retains the inverse Shield asset form. With ready funds it is
an editable Shielded ETH -> active-chain ETH relayed withdrawal. When no private
balance is ready but ragequit is available, those same cards show the fixed
public amount and original depositor. A required, unchecked commitment control
states that recovery returns to the original address through a public
transaction; the sticky `Withdraw publicly` action remains disabled until the
user checks it. While the ASP compliance check is still pending, a compact
amber information panel above that acknowledgment explains that the deposit
can already be recovered to its original account.

The private home reports ready and compliance-pending ETH; the pending amount
uses the shared amber privacy-status accent. Quote refreshes
retain the last verified balance, maximum, output, and slider geometry until a
replacement quote succeeds, so loading never flashes the public ETH balance to
zero or removes the amount control.
Shielded ETH is deliberately excluded from the public portfolio USD total,
chart, low-value group, and chain totals. The Shield screen owns no parallel
activity list: public deposits and sanitized private-send withdrawals appear in
the main dated wallet Activity timeline. Public recovery remains contextual on
the standalone Unshield screen and returns only to the original depositor with explicit link
disclosure.

The root `components/ShieldView.tsx` remains a policy-free compatibility facade.
Pure coverage lives in `tests/ui/shield*.test.ts` and
`tests/ui/unshieldModel.test.ts`; protocol and wallet-matrix coverage lives in
`tests/privacy/`.
