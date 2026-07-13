# Secret-release audit domain

The stable `../masterAuthorization.ts` and `../secretRevealHandlers.ts` paths
are policy-free facades.

1. `masterAuthorization.ts` combines the exact auth ceremony epoch with a live
   master session at the commit/release boundary.
2. `revealHandlers.ts` proves the explicit master password, acquires the shared
   wallet-secret lock, reads one requested secret, revalidates after each
   asynchronous read, and emits plaintext before releasing the lock.

Agent sessions, locked sessions, stale epochs, missing records, and concurrent
factor/password/lock transitions must all fail closed.
