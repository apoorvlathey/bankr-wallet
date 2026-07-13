# Gas estimation tests

- `architecture.test.ts` freezes all three compatibility-facade identities,
  one-way dependencies, and per-module audit budgets.
- `policy.test.ts` freezes EIP-7702 gas overhead, fee-history percentiles and
  next-base prediction, standard-tier compatibility, and legacy gas-price
  fallback semantics.
- `fallbacks.test.ts` freezes batch tier order, 2x sequential-simulation
  buffers, the 500k dependent-call fallback, single-estimate failure values,
  and per-call cost/balance construction.

Transport routing remains covered by `../background/gasSimulationRouter.test.ts`;
transaction legacy-fee conversion remains covered in `../transactions/`.
