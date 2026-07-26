# Cross-dapp batch tests

These tests mirror `src/chrome/crossDappBatch/` and freeze staged-source
storage, first-action claims, account/transport authorization, local and Bankr
effect boundaries, non-expiring confirmation, completion fan-out, and
facade/dependency architecture.

`approvalCleanup.test.ts` freezes source-linked wallet-generated append,
duplicate protection, Bankr rejection, and the rule that cleanup entries never
receive their own dapp result route.
