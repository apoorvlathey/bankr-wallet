# Transaction confirmation UI domain

`../TransactionConfirmation.tsx` is the compatibility facade used by existing
callers and lazy imports. It stays policy-free and preserves the default export.

## Audit map

| File | Responsibility |
| --- | --- |
| `TransactionConfirmation.tsx` | Composes the screen model and sections. |
| `types.ts` | Props, wallet-type, and screen-state contracts. |
| `transactionValue.ts` | Pure native-value parsing and formatting. |
| `useSplitPriorTxState.ts` | Prior-split history gate and gas-refresh signal. |
| `useTransactionMetadata.ts` | Non-secret symbol, label, name, and origin lookups. |
| `useTransactionReviewState.ts` | Simulation, native-price, gas, calldata, clear-signing, and force-inclusion review state. |
| `useTransactionNonce.ts` | Loads the pinned local/Ledger address nonce and owns the editable decimal review state. |
| `transactionNonceModel.ts` | Pure wallet-type eligibility for editable transaction nonces. |
| `useTransactionBatchEligibility.ts` | Cross-dapp batch eligibility for every wallet type. |
| `useTransactionActions.ts` | Bankr/local submission routing, rejection, batch-add, and completion transitions. |
| `TransactionSummary.tsx` | Centered dapp identity, chain-qualified simulation heading, and financial impact. |
| `TransactionDecisionSummary.tsx` | Sticky signer identity and network-fee control. |
| `transactionPresentation.ts` | Pure function-name presentation for outcome copy. |
| `TransactionContext.tsx` | Ordered warnings, intent, metadata, and status. |
| `TransactionInfoCard.tsx` | Interacting identity popover and native value rows. |
| `AdvancedDetails.tsx` | Force inclusion, calldata, digest, Tenderly, and batch controls. |
| `TransactionNonceEditor.tsx` | Editable local/Ledger address nonce row inside Advanced details. |
| `ReplacementNotice.tsx` | Explain Speed Up nonce and fee semantics without replacing the original review content. |
| `DelegationNotices.tsx` | EIP-7702 consequences. |
| `QueueNavigation.tsx` | Pending-request navigation. |
| `RequestStatus.tsx` | Async, error, and split feedback. |
| `ConfirmationActions.tsx` | Confirm/reject arrangement and single-transaction simulation-warning projection. |
| `StateScreens.tsx` | Force-inclusion progress and success animation. |
| `CopyButton.tsx` | Inline clipboard feedback. |

## Boundaries and growth rules

- `useTransactionActions.ts` is the transaction-action message boundary;
  `useSplitPriorTxState.ts` only watches history, and metadata effects are
  display-only.
- `useTransactionReviewState.ts` owns simulation/gas/calldata review effects;
  `StateScreens.tsx` owns only the completion callback/timer. Other sections are
  callback-driven presentation, except `CopyButton.tsx`'s clipboard feedback.
- Presentation modules do not choose wallet authorization or message types.
- Preserve the gas-estimator key/remount, request ID, first-action callbacks,
  and Bankr/private-key/seed-phrase/Ledger/impersonator branches.
- Replacement requests keep native gas editable but lock transaction content,
  batching, fee-token selection, force inclusion, and the exact pending nonce.
- Speed Up retains the original request identity, simulation, clear-signing,
  and decoded action; Cancel omits the redundant self-transfer explanation.
- Back and Reject on either replacement return Home to Activity. Reject
  pre-navigates before prompt removal so storage timing cannot flash Assets or
  close the popup through the generic rejection fallback.
- Keep the root facade tiny, one concern per file, and implementation files
  below roughly 400 lines. Add state to the narrow owning hook instead of
  creating one all-purpose controller.

Pure value projection is covered by `tests/ui/transactionValue.test.ts`.
Transaction intake, confirmation, first-action-wins, and all wallet-type paths
remain covered under `tests/transactions/`, `tests/requests/`, and packaged
extension signing QA.
