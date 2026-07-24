# WalletConnect tests

This directory freezes the remote-session boundary:

- `architecture.test.ts` enforces the single source folder, 400-line ceiling,
  dependency direction, and direct background composition.
- `accountPolicy.test.ts` covers Bankr, private-key, seed-phrase, Ledger, Safe,
  and impersonator admission plus account-specific WalletConnect methods.
- `requestSecurity.test.ts` covers bounded request validation, CAIP chain/method
  routing, terminal responses, pending-route locking, and queue limits.
- `reset.test.ts` covers replacement-wallet namespace compatibility and ordered
  SDK/session/pairing teardown.
- `csp.test.ts` proves WalletConnect Pay remains fail-closed and that the
  background bundle uses the extension-owned CSP-safe shim.

The trusted-UI session router remains in `../background/` because that test
audits Chrome message transport rather than the WalletConnect protocol itself.
