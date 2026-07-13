# WalletConnect tests

This directory freezes the remote-session boundary:

- `requestSecurity.test.ts` covers bounded request validation, CAIP chain/method
  routing, terminal responses, pending-route locking, and queue limits.
- `reset.test.ts` covers replacement-wallet namespace compatibility and ordered
  SDK/session/pairing teardown.
- `csp.test.ts` proves WalletConnect Pay remains fail-closed and that the
  background bundle uses the extension-owned CSP-safe shim.

The trusted-UI session router remains in `../background/` because that test
audits Chrome message transport rather than the WalletConnect protocol itself.
