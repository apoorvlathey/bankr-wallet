# Ledger UI

- `app/ledgerSetupRoute.ts` opens `index.html?route=add-ledger` in a full tab
  when Ledger is selected from the popup or side panel, then closes the
  originating side panel.
- `AddLedgerFlow.tsx` runs only on that full-tab route and owns the explicit
  WebHID chooser gesture, device discovery, path selection, address paging,
  and account-import messages.
- `LedgerLogo.tsx` renders Ledger's official press-kit SVG wordmark and
  lettermark through theme-colored masks.
- `LedgerDevicePanel.tsx` and `LedgerDerivationPicker.tsx` keep hardware
  identity and derivation choices compact and aligned.
- `LedgerSigningStatus.tsx` reuses the sticky signing notice with the official
  lettermark on its black brand tile and a trailing progress spinner while
  transaction/signature screens keep their request content mounted and locked
  through hardware approval. The primary action uses the shared three-dot
  loader and the transaction broadcast status stays hidden until device signing
  has finished.
- `LedgerAvatar.tsx` adapts the official Ledger lettermark to account-avatar
  slots.

The service worker remains authoritative for authentication, account commits,
request pinning, signing, and broadcast. Renderer messages contain only public
device metadata, derivation paths, addresses, and unsigned payloads.
