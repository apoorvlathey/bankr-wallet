# Shared storage tests

- `architecture.test.ts` freezes facade identities, dependency direction,
  root clutter, and per-file audit budgets.
- `lock.test.ts` protects same-key ordering, rejection recovery, cross-key
  independence, and the intentionally distinct wallet operation/repository
  locks.
- `resetManifest.test.ts` freezes exact local/sync keys, result/artifact
  prefixes, cleanup ordering, and the retained WalletConnect namespace.
- `cachePruner.test.ts` covers TTL/schema/future-time rejection, avatar LRU,
  portfolio delegation, remove-before-set effects, and propagated failures.
- `resultWaiter.test.ts` protects listener cleanup, bounded non-signing waits,
  and retry semantics when confirmation or expiry owns a signing request.

Domain-owned repositories and schemas stay beside their account, mnemonic,
request, ERC-7715, or session suites instead of accumulating here.
