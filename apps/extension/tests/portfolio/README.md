# Portfolio tests

This directory freezes the portfolio display-state boundary:

- `architecture.test.ts` enforces the single source folder, 400-line ceiling,
  pure-policy/effect separation, direct background composition, and snapshot
  refresh ordering.
- State, cache, chart, and token-key tests cover public display behavior.
- The browser navigation test remains explicit runtime QA and is excluded from
  the recursive security runner by basename.
