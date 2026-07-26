# Batch Confirmation UI Domain

This folder owns the review and confirmation surface for ERC-5792 batches. The
root `components/BatchTransactionConfirmation.tsx` file is a policy-free
compatibility facade so the existing lazy import remains stable.

## Audit map

| File | Responsibility | Effects |
| --- | --- | --- |
| `BatchTransactionConfirmation.tsx` | Composes the screen, derives account/chain execution capabilities, keeps signing/edit/split/move controls unavailable while an early-painted request still has `intakeStatus: "validating"`, and leaves terminal Reject accessible. | None directly. |
| `useBatchActions.ts` | Confirmation, rejection, split, and add-to-batch ordering for Bankr, private-key, seed-phrase, impersonator, and cross-dapp flows. | Chrome messages, close timer, confirmation sound. |
| `useBatchReviewState.ts` | Renderer-only disclosure, simulation, gas, and editable-call state. | None outside React state. |
| `RequestContext.tsx` | Unified call review, warnings, setup state, and request status. | None. |
| `BatchDecisionSummary.tsx` | Pinned signer, optional L1 route, and the shared native/token batch gas decision controls. | Gas-estimation and fee-quote callbacks. |
| `feePaymentPolicy.ts` | Pure opt-in policy for ordinary and cross-dapp batch fee selection; privacy and unknown custom transports stay native-only. | None. |
| `RequestWarnings.tsx` | Simulation, calldata, value, and encoding safety banners. | None. |
| `CallsReview.tsx` | Ordered request-detail calls, light-canvas source-dapp attribution, clear-signing action headers with always-visible fields, compact expandable approvals, technical calldata disclosure, header metadata, editing, and hover/focus overflow removal controls. | Default calldata-update Chrome message; overrides delegate to the caller. |
| `batchActionSummary.ts` | Chooses one concise specialized, clear-signed, native, or decoded action label per call and joins the complete batch summary. | None. |
| `AdvancedDetails.tsx` | Composes the encoded batch digest, shared tool rows, force inclusion, and reduced-motion-aware reveal scrolling. | Opens Tenderly tab and scrolls newly revealed content into view; other effects use callbacks. |
| `FinancialImpact.tsx` | Embedded asset-change simulation and callback-driven residual-approval cleanup projection. | Simulation and explicit cleanup callbacks. |
| `approvalCleanupAdapter.ts` | Builds single and atomic bulk pending-batch cleanup actions from the pure wallet/strategy availability model and the narrow trusted-renderer transport. | One explicit Chrome message per user action. |
| `TerminalStates.tsx` | Force-inclusion progress and sent animation. | Completion callbacks and close timer. |
| `SplitBatchModal.tsx` | Split-mode confirmation presentation. | Callbacks only. |
| `ConfirmationActions.tsx` | Confirm/reject button presentation and batch simulation-warning projection. | Callbacks only. |
| `helpers.ts` | Pure validation, encoding, aggregation, and request projection. | None. |
| `presentation.tsx` | Local split-mode icon primitive. | None. |
| `animations.ts` | Seek-safe success-state keyframes. | None. |
| `types.ts` | Public props and shared UI-state contracts. | None. |

## Dependency direction

The compatibility facade points into this domain. The composition root depends
on focused presentation modules and hooks; presentation modules receive data
and callbacks and do not import the root. Chrome message effects are restricted
to `useBatchActions.ts`, the default edit path in `CallsReview.tsx`, and the
explicit residual-approval cleanup adapter. Pending ERC-5792 requests append
under their own storage lock; cross-dapp adapters instead append the selected
generated entries to the active assembled batch. Bulk cleanup performs one
bounded storage mutation and one subsequent simulation refresh. Both paths
return only opaque late-detection evidence IDs; token and spender targets are
re-resolved from the exact current request fingerprint in the background.

Cross-dapp confirmation explicitly opts its custom transport into the shared
batch fee selector. The selected native/token mode and one-shot quote ID flow
through `useBatchActions.ts` to `confirmCrossDappBatch`; no duplicate selector
or cross-dapp-only gas UI is introduced. Any staged-call mutation resets the
parent-owned selection and quote to native.

Behavioral coverage belongs under `tests/ui/`; transaction execution and wallet
type branches remain covered by the existing recursive batch/security suites.
The production preview route includes an `unsafe-self-call` scenario for the
encoder-level ERC-7821 self-recursion block and its disabled confirmation state.

Cross-dapp adapters must pass queue-level Reject all through to the App-owned
global rejection handler; the adapter's local `onRejected` callback only owns
post-rejection navigation and must never be substituted for the destructive
queue operation.
