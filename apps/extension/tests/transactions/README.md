# Transaction tests

These tests mirror `src/chrome/transactions/` and cover request intake,
account pinning, local confirmation/execution, failure publication, calldata
preflight, nonce review/selection, gas normalization, and the stable
`txHandlers.ts` facade boundary.

`replacementPolicy.test.ts` freezes the 12.5% priority-fee and 30% max-fee
floors, strict configured-RPC transaction projection, and unsupported typed
transaction rejection. `replacementPreparation.test.ts` covers the full
Private Key / Seed Phrase / Ledger eligibility matrix, Bankr and impersonator
rejection, same-nonce speed-up/cancel construction, original Speed Up display
metadata, WalletChan Cancel identity, and oldest-pending gating.

`localSwapAccountRace.test.ts` protects the final account revalidation callback
at the direct local-swap broadcast boundary.
`impersonatedSwapArchitecture.test.ts` protects the explicit all-wallet-type
direct routing and the selected-endpoint/account rechecks at the unsigned
developer-RPC swap boundary.
`swapHistoryMetadata.test.ts` keeps approval-first batches titled by their
final reviewed action while retaining swap/bridge metadata priority.

The mirrored background router tests freeze one transaction-confirm claim for
immediate/background Bankr and local private-key/seed paths, exact sender-tab
fallback, account-locked swap arguments, and the internal-operation reset
barrier before swap effects.
