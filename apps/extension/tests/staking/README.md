# WCHAN staking tests

These tests mirror `src/chrome/staking/` and freeze its privileged read
boundary:

- `architecture.test.ts` verifies the stable facade preserves the focused
  implementation identities, malformed owner/preview inputs fail before RPC,
  and remote APY values remain finite and bounded.

Transaction planning and all wallet-type batching choices are covered in
`tests/ui/stakingModel.test.ts`. Reset-barrier routing, Ledger device rebinding,
and the impersonator submission block are covered by the background and
transaction architecture suites.
