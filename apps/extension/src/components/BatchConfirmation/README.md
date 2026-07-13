# Batch Confirmation UI Domain

This folder owns the review and confirmation surface for ERC-5792 batches. The
root `components/BatchTransactionConfirmation.tsx` file is a policy-free
compatibility facade so the existing lazy import remains stable.

## Audit map

| File | Responsibility | Effects |
| --- | --- | --- |
| `BatchTransactionConfirmation.tsx` | Composes the screen and derives account/chain execution capabilities. | None directly. |
| `useBatchActions.ts` | Confirmation, rejection, split, and add-to-batch ordering for Bankr, private-key, seed-phrase, impersonator, and cross-dapp flows. | Chrome messages, close timer, confirmation sound. |
| `useBatchReviewState.ts` | Renderer-only disclosure, simulation, gas, and editable-call state. | None outside React state. |
| `RequestContext.tsx` | Pending-request navigation, clear-signing summary, and request status. | Navigation/reject-all callbacks only. |
| `RequestMetadataCard.tsx` | Origin, account, network, value, and force-inclusion controls. | Renderer callbacks only. |
| `RequestWarnings.tsx` | Simulation, calldata, value, and encoding safety banners. | None. |
| `CallsReview.tsx` | Call expansion, calldata editing, and cross-dapp removal controls. | Default calldata-update Chrome message; overrides delegate to the caller. |
| `AdvancedDetails.tsx` | Gas overrides, encoded digest, Tenderly link, and add-to-batch affordance. | Opens Tenderly tab; other effects use callbacks. |
| `FinancialImpact.tsx` | Native-value summary and asset-change simulation projection. | Simulation component callbacks. |
| `TerminalStates.tsx` | Force-inclusion progress and sent animation. | Completion callbacks and close timer. |
| `SplitBatchModal.tsx` | Split-mode confirmation presentation. | Callbacks only. |
| `ConfirmationActions.tsx` | Confirm/reject button presentation. | Callbacks only. |
| `helpers.ts` | Pure validation, encoding, aggregation, and request projection. | None. |
| `presentation.tsx` | Local split-mode icon primitive. | None. |
| `animations.ts` | Seek-safe success-state keyframes. | None. |
| `types.ts` | Public props and shared UI-state contracts. | None. |

## Dependency direction

The compatibility facade points into this domain. The composition root depends
on focused presentation modules and hooks; presentation modules receive data
and callbacks and do not import the root. Chrome message effects are restricted
to `useBatchActions.ts` and the default edit path in `CallsReview.tsx`.

Behavioral coverage belongs under `tests/ui/`; transaction execution and wallet
type branches remain covered by the existing recursive batch/security suites.
