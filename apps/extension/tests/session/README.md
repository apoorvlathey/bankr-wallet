# Session tests

This folder covers facade identity, in-memory cache semantics for Bankr/private
key/seed wallets, passwordless biometric-master state, timeout transitions,
encrypted password/passkey Never-envelope validation, legacy/master/agent restoration,
post-unlock timeout and manual-lock races, native-session cleanup, and Firefox
fallback behavior. `viewOnlyReopen.test.ts` covers coherent capability-only
master/agent/passkey generations and Never-session reopen across Bankr,
private-key, seed-derived, V2 mnemonic, and view-only wallets. Tamper,
fallback-browser, factor-revocation, storage-failure, and lock/restore race
coverage is fail-closed. Architecture coverage pins one-way dependencies and size
budgets beneath the stable `sessionCache.ts` facade.

`passkeyNeverSession.test.ts` exercises cold-restored production signature and
Bankr submission handlers for the three signing wallet types and keeps
impersonator accounts reject-only. `passkeyNeverLocalTransactions.test.ts`
continues imported and seed-derived confirmation through the pinned production
policy path to an isolated broadcast effect boundary. `manualLockRevocation.test.ts`
covers single-half failures, simultaneous failure/retry, the worker restoration
barrier, cross-surface failure broadcast, and password/passkey parity for
split-capability teardown. `tests/ui/manualWalletLock.test.ts` applies that
broadcast to two independent renderer states and proves both purge auth data,
suppress auto-prompting, and enter retry. `passkeyPersistence.test.ts` freezes exact
typed-array view handling so adjacent backing-buffer bytes cannot enter the
encrypted session capability.
