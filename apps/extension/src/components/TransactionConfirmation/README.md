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
| `useTransactionReviewState.ts` | Simulation, gas, calldata, clear-signing, and force-inclusion review state. |
| `useTransactionBatchEligibility.ts` | Cross-dapp batch eligibility for every wallet type. |
| `useTransactionActions.ts` | Bankr/local submission routing, rejection, batch-add, and completion transitions. |
| `TransactionSummary.tsx` | Outcome and financial impact. |
| `TransactionContext.tsx` | Ordered warnings, intent, metadata, and status. |
| `TransactionInfoCard.tsx` | Origin, account, network, destination, and value rows. |
| `AdvancedDetails.tsx` | Gas, calldata, digest, Tenderly, and batch controls. |
| `DelegationNotices.tsx` | EIP-7702 consequences. |
| `QueueNavigation.tsx` | Pending-request navigation. |
| `RequestStatus.tsx` | Async, error, impersonator, and split feedback. |
| `ConfirmationActions.tsx` | Confirm/reject arrangement. |
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
  and Bankr/private-key/seed-phrase/impersonator branches.
- Keep the root facade tiny, one concern per file, and implementation files
  below roughly 400 lines. Add state to the narrow owning hook instead of
  creating one all-purpose controller.

Pure value projection is covered by `tests/ui/transactionValue.test.ts`.
Transaction intake, confirmation, first-action-wins, and all wallet-type paths
remain covered under `tests/transactions/`, `tests/requests/`, and packaged
extension signing QA.
