# Swap domain tests

- `architecture.test.ts` pins every runtime facade export to its focused
  implementation, enforces one-way dependencies, and ratchets module sizes.
- `behavior.test.ts` pins quote query/egress behavior, exact error text,
  token-list and logo cache semantics, cache-key normalization, pinned-token
  precedence, and ERC-20/Permit2 calldata policy.
- `../network/apiEgress.test.ts` independently pins redirect/ambient-state
  rejection and the 2 MiB quote response ceiling at the shared HTTP boundary.

These are compatibility tests: changing an assertion requires an explicit
review of the released swap protocol or cache behavior, not merely a refactor.
