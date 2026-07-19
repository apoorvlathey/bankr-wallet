# Ledger hardware-wallet domain

This domain owns public Ledger account metadata, WebHID/offscreen transport,
device error normalization, and Ledger-specific transaction/message signing.

- `accountHandlers.ts` validates trusted-wallet-UI requests and enforces
  master authorization for account import.
- `storage.ts` atomically commits Ledger accounts and public device metadata
  under the shared account repository lock.
- `offscreenBridge.ts` lazily creates and tears down the packaged offscreen
  document; it never accepts page-originated messages.
- `signing.ts` prepares unsigned payloads, verifies the returned signer address,
  and broadcasts the exact serialized transaction bytes.
- `transactionExecution.ts` and `signatureConfirmation.ts` reuse the released
  pinned-request, authorization, reset-lease, history, and result boundaries.
  They retain the pending row during the hardware prompt, then remove it only
  after a recovered Ledger signature and final authorization; transaction
  history begins at the final pre-broadcast boundary.
- `session.ts` requires a live master or agent wallet session before signing.

Private keys never enter the extension. Device identity is revalidated from a
fixed public derivation path for every scan or signing session.
