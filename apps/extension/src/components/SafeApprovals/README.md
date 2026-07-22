# Safe approvals UI audit map

- `SafeApprovalsScreen.tsx`: cross-chain request inbox and selected-request
  routing. The inbox reuses the account-settings identity row and intentionally
  has no raw proposal-creation form; reviewed Send and dapp flows create
  requests. It lists only canonical pending states; executed, cancelled,
  replaced, and failed records remain in Activity. Its header reload action asks
  the background to refresh this Safe immediately. Direct Activity navigation
  can still open a terminal request as a read-only detail.
- `SafeProposalConfirmation.tsx`: adapts a validated pending Safe proposal to
  the same confirmation composition used by transaction and batch requests.
  It owns the live authority refresh and exact outer fee state, while keeping
  the selected action visible through intermediate proposal-storage updates.
  A simulated revert uses the shared likely-to-fail confirmation and sends an
  explicit acknowledgement to the final background execution gate; it never
  silently enables execution.
  Terminal Activity records switch to a receipt-style, read-only transaction
  detail: no live simulation, route-waiting notice, authority refresh, signer
  or executor controls, rejection action, or sticky request footer.
- `hooks/useSafeProposalActions.ts`: owns mutually exclusive approval,
  publication, execution, rejection, and secondary action effects. Its
  operation state prevents an in-flight Approve or Execute loader from falling
  through to the Back action while background writes advance the proposal.
- `hooks/useSafeExecutionRefresh.ts`: wakes background receipt reconciliation
  immediately and every ten seconds while a pending execution review is
  visible. It owns no receipt, nonce, or terminal-state authority.
- `SafeProposalDecisionSummary.tsx`: sticky `Signing with` / `Execute with`
  identity row, account dropdown, and shared transaction gas estimator.
  Execution choices that are also Safe owners carry an explicit `Owner` label;
  non-owner gas payers remain selectable without appearing to hold Safe signing
  authority. At quorum it also reuses the standard fee-token selector. Its
  option and quote messages bind the current Safe proposal, proposal chain, and
  selected executor; changing executor restores native payment and discards the
  prior quote.
- `SafeProposalRequestDetails.tsx`: read-only shared call cards, a quiet
  section divider, and validated signer progress with an `n/m signed` summary
  plus explicit per-owner signed states. Canonical rejection proposals replace
  the generic self-call card with plain same-nonce cancellation copy. Pending
  execution shows a yellow retrying notice only when every trusted receipt RPC
  is unavailable.
- `SafeProposalFinancialImpact.tsx`: request-only estimated-change surface
  backed by the Safe's reviewed calls. At execution quorum it also supplies
  the exact signed outer request, whose result owns the revert verdict while
  the direct Safe-address pass remains responsible for asset deltas. This
  prevents the simulator's temporary Safe bytecode replacement from falsely
  rejecting Safe self-calls. It is never mounted for terminal
  Activity details because replaying an old Safe nonce against current chain
  state is neither a receipt nor a trustworthy historical estimate.
- `SafeProposalAdvancedDetails.tsx`: proposal nonce/hash metadata, unsigned
  inline nonce editing, and secondary lifecycle actions. Automatic requests
  reserve the next free nonce; the pencil action deliberately permits an
  occupied nonce as a competing replacement, while inline validation blocks
  values below the verified live nonce. Opening the disclosure scrolls its
  heading to the top like other request surfaces. Terminal details keep
  explorer/copy utilities and the Activity hide action, but suppress
  request-only publication and route detachment controls.
- `SafeProposalNonceEditor.tsx`: local pencil/input/cancel/confirm interaction
  for the nonce row. It owns focus, keyboard Escape/Enter behavior, and
  immediate bounds feedback; the background remains the mutation authority.
- `safeProposalActionModel.ts`: pure owner/executor filtering, owner-first
  executor defaulting, action selection, and synthetic review request builders.
- `SafeProposalRow.tsx`: Nonce-labeled, Activity-style chain-led request row with
  plain-language action, resolved wallet/contact counterparty, and compact
  lifecycle status. Future-nonce rows identify the earlier visible request that
  must execute first. Chain identity stays in the leading logo instead of being
  repeated in copy.
- `safeProposalPresentation.ts`: pure request-row intent and status projection.
- `safeProposalOrdering.ts`: pure descending-nonce inbox ordering with stable
  same-nonce tie-breaking.
- `safeProposalSequence.ts`: maps a verified future Safe nonce to the visible
  request number that currently blocks it.
- `SafeProposalActivity.tsx`: descending-nonce proposal selection, shared date
  grouping, live origin resolution, and Activity-ledger composition.
- `SafeProposalActivityRow.tsx`: compact Warm Midnight Activity row with dapp
  identity, chain badge, plain-language intent/context, inline status, and
  muted-label/primary-value nonce metadata. Executable rows use an amber
  hourglass and full inset focus boundary, while Midnight Safe fallback marks
  use a dark success-tinted chip instead of the generic light favicon canvas.

The UI never counts signatures as authority or authorizes effects itself; it
renders validated proposal records returned by the Safe background domain.
The background rechecks the live Safe configuration, quorum, selected owner or
executor, auth epoch, and exact execution envelope before any irreversible
effect.

When the selected proposal transitions from pending execution to `executed`,
the inbox surface closes the review and routes Home to Activity. Opening an
already executed Activity record does not trigger that transition again, and
Back returns directly to Activity rather than entering the pending-request
inbox. Terminal records use the **Transaction details** title and the header
Back action without a duplicate passive footer action.

Safe execution locks the reviewed executor, fee asset, gas controls, and
simulation while broadcast is in flight. Once the background accepts the
submission, the review routes immediately to Public Activity so its pending
executor-history row is visible without waiting for Safe finality.

Reject is deliberately asymmetric: a proposal with no collected signatures
can be cancelled locally, while a proposal with any supported or unsupported
signature opens a canonical same-nonce Safe rejection proposal. Back only
navigates; it never dismisses or mutates a signed request. The original becomes
cancelled, and its provider/ERC-5792 route becomes terminal, only after the
rejection execution receipt is confirmed.
