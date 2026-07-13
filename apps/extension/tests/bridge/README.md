# Cross-chain bridge tests

These tests mirror `src/chrome/bridge/`:

- `architecture.test.ts` freezes facade identities, dependency direction,
  root clutter, audit maps, and per-module size budgets.
- `clientCache.test.ts` protects endpoint query construction, exact API errors,
  bounded egress delegation, 24-hour cache behavior, stale fallbacks,
  single-flight requests, released keys/shapes, and read-time WCHAN pinning.
- `chainPolicy.test.ts` covers EVM-only destination filtering and source-chain
  visibility/account/0x/Socket fallback policy without Chrome effects.
- `status.test.ts` covers terminal copy/targets, history-to-pending mapping,
  durable nonterminal/terminal transitions, notifications, and cleanup.

The existing network API-egress suite independently verifies redirect,
credential, referrer, cache, deadline, and response-size enforcement.
