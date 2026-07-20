# Transaction tests

These tests mirror `src/chrome/transactions/` and cover request intake,
account pinning, local confirmation/execution, failure publication, calldata
preflight, gas normalization, and the stable `txHandlers.ts` facade boundary.

`localSwapAccountRace.test.ts` protects the final account revalidation callback
at the direct local-swap broadcast boundary.
`impersonatedSwapArchitecture.test.ts` protects the explicit all-wallet-type
direct routing and the selected-endpoint/account rechecks at the unsigned
developer-RPC swap boundary.

The mirrored background router tests freeze one transaction-confirm claim for
immediate/background Bankr and local private-key/seed paths, exact sender-tab
fallback, account-locked swap arguments, and the internal-operation reset
barrier before swap effects.
