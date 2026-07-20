# Ledger Hardware Wallet Support

WalletChan supports Ledger hardware accounts in Chromium browsers with WebHID and `chrome.offscreen` (Chrome 124+). Firefox builds remain functional but do not expose Ledger setup because Firefox does not provide the required extension APIs.

Fresh-wallet onboarding is already a full extension tab. On supported Chromium
browsers it offers Ledger after View-only, performs the WebHID chooser and
address scan in that same tab, and holds only public selection metadata until
the user creates the master password. Account/device persistence then occurs
inside the existing onboarding initialization marker so failures roll back the
partial wallet rather than leaving a configured credential without an account.

## Architecture

1. Selecting Ledger from the popup or side panel opens `index.html?route=add-ledger` in a full extension tab. A side-panel launcher closes after the tab opens using the shared side-panel close path. The deep link takes priority over normal pending-request auto-routing; a locked wallet returns to Ledger setup immediately after unlock.
2. `components/Ledger/AddLedgerFlow.tsx` calls `navigator.hid.requestDevice()` directly from the Connect click in that tab. Popup and side-panel renderers never request WebHID permission.
3. `chrome/ledger/offscreenBridge.ts` lazily creates `offscreen.html` and forwards operations to `offscreen/ledgerSigner.ts`. The offscreen listener accepts commands only when Chrome identifies the exact extension service-worker URL as the sender; content scripts, popup/full-page renderers, foreign extension IDs, and URL lookalikes fail closed.
4. The offscreen document uses Ledger Device Management Kit + Ethereum Signer Kit. It survives popup closure and is torn down 30 seconds after the last operation.
5. `chrome/ledger/storage.ts` stores public device metadata and Ledger account derivation metadata. Hardware private keys never leave the device and are never written to Chrome storage.
6. `background/ledgerRouter.ts` owns pairing/import transport. The existing transaction and secret-management routers delegate pinned confirmations to `chrome/ledger/transactionExecution.ts` and `chrome/ledger/signatureConfirmation.ts`.

Ledger identity uses the official wordmark and lettermark SVGs from Ledger's October 2025 press kit. They are stored locally as `public/ledger-wordmark.svg` and `public/ledger-lettermark.svg`; runtime UI never fetches a remote brand asset.

The persistent device ID is the lowercase Ethereum address derived at `m/44'/60'/0'/0/0`. Ledger's transport device ID is deliberately session-random, so every scan/sign operation re-derives this canonical address and refuses to use a connected device that does not match the account's stored device ID.

## Storage

- `accounts[]` Ledger shape: `{ id, type: "ledger", address, deviceId, hdPath, hdIndex, displayName?, createdAt }`
- `ledgerDevices`: `Record<deviceId, { label, model, addedAt }>`

Both are public metadata. Account/device writes serialize under the wallet-secret operation lock and normal `accounts` storage lock, with the master authorization epoch checked before commit. Removing the final account for a device also removes its `ledgerDevices` entry. Wallet reset removes both keys. This is an additive optional key, so existing installs need no migration.

The account/device write is the durable commit boundary. Updating the active-account preference happens afterward as best-effort UI synchronization, so a preference write failure cannot report that an already-persisted import failed or invite a duplicate retry.

## Signing

- Transactions: standard legacy and EIP-1559 transactions are prepared with viem, serialized unsigned, approved on Ledger, reconstructed with the returned `r/s/v`, and recovered locally. Advanced details previews the pinned address's pending nonce without reserving it and allows a decimal edit; confirmation validates, reserves, signs, and broadcasts that exact reviewed nonce. Pending Activity rows can prepare Speed Up and Cancel reviews that pin the original nonce and enforce replacement fee floors before the device prompt. Broadcast is blocked unless the recovered signer exactly matches the pinned Ledger account.
- Messages: `personal_sign` bytes are approved on device.
- Typed data: EIP-712 v3/v4 is validated by the existing request path and approved on device. A domain chain ID that differs from the pinned request chain is rejected.
- Raw `eth_sign` remains blocked.

Ledger uses the same pending-request pinning, SIWE checks, agent-password signing access, gas editor, result storage, history, receipt polling, effect leases, final origin/session authorization, and WalletConnect request bridge as Private Key/Seed Phrase accounts. Pending requests do not expire by age.

While hardware approval is pending, the original transaction or signature row
stays in its pending queue and the confirmation screen remains mounted. The
sticky action area shows `Sign the request in your Ledger` with the official
lettermark on a black brand tile and a trailing dark spinner. The primary button
uses the shared dark-to-muted three-dot loader with `Waiting`. The
transaction-submitting
banner remains reserved for the later broadcast phase. Request-mutating UI
(approval amounts, gas and nonce selection, force inclusion/add-to-batch controls, SIWE
warning acknowledgment, queue actions, and rejection) is locked for that
interval. Back remains available as navigation and does not cancel the active
hardware request. The service worker's first-action claim is the enforcement
boundary for competing extension surfaces; UI disabling is only the visible
layer.

For transactions, the pending row is removed and processing history begins in
the final `beforeBroadcast` callback, after the Ledger signature is recovered
and account/origin authorization is revalidated. For message and EIP-712
signatures, removal happens only after device signing and final release
authorization. A safe device rejection, timeout, or preparation failure leaves
the request pending and creates no Activity entry, allowing an explicit retry.

Adding accounts requires a live master session. Transaction/message signing accepts either a live master or agent session; an agent still cannot add/remove accounts or reveal any locally stored secret.

The offscreen document receives only public device/path metadata and the exact unsigned payload being approved. It never receives a password, API key, vault key, private key, seed phrase, or mnemonic capability. Device actions time out after two minutes and the document is closed after 30 seconds idle.

## Deliberate Initial Boundaries

- ERC-5792/cross-dapp atomic batches are not advertised or accepted for Ledger.
- EIP-7702 authorization/delegation and force inclusion are rejected for Ledger.
- WalletChan's direct swap shortcut is rejected; swaps initiated by dapps work through the normal single-transaction confirmation flow.
- A real Ledger is required for final hardware validation; automated builds can validate bundling, storage and routing but cannot approve device prompts.

## Dependencies

- `@ledgerhq/device-management-kit` 1.7.1
- `@ledgerhq/device-signer-kit-ethereum` 1.16.0
- `@ledgerhq/device-transport-kit-web-hid` 1.2.4

Versions are pinned exactly so transport and signer behavior does not drift between extension releases.
