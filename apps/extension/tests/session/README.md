# Session tests

This folder covers facade identity, in-memory cache semantics for Bankr/private
key/seed wallets, passwordless biometric-master state, timeout transitions,
encrypted Never-session envelope validation, legacy/master/agent restoration,
post-unlock timeout and manual-lock races, native-session cleanup, and Firefox
fallback behavior. `viewOnlyReopen.test.ts` covers coherent capability-only
master/agent/passkey generations and Never-session reopen. Architecture
coverage pins one-way dependencies and size
budgets beneath the stable `sessionCache.ts` facade.
