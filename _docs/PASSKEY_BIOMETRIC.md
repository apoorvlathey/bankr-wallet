# Passkey Biometric Unlock PRD

## Overview

WalletChan should support optional passkey/biometric unlock on the extension
unlock screen so users do not need to type their master password for every
normal unlock.

This is an additive unlock method. The master password remains the recovery
path, existing users continue to work without migration, and agent-password
access control must remain unchanged.

## Goals

- Let a user enable biometric/passkey unlock from Settings while unlocked with
  the master password.
- On future unlock screens, auto-trigger biometric/passkey authentication when
  a valid passkey unlock credential exists.
- After successful passkey unlock, normal wallet UX should match a master
  password unlock for routine operations:
  - Bankr API account transactions/signatures
  - Private key account transactions/signatures
  - Seed phrase account transactions/signatures
  - Chat/API-key-backed actions that are allowed for a master session
- Respect the existing auto-lock timer. When the timer expires, show the
  unlock screen again and allow passkey unlock again.
- Keep password unlock always available as fallback.

## Non-Goals

- Do not remove or replace the master password.
- Do not allow agent-password sessions to enable or manage biometric unlock.
- Do not expose private keys, seed phrases, API keys, vault keys, or master
  passwords to content scripts or webpages.
- Do not use passkeys as an onchain signer in this feature. This is only for
  local extension unlock.
- Do not require existing users to re-onboard.

## Browser Support Strategy

### V1: Chrome First

Ship the first implementation for Chrome only.

Reasons:

- WalletChan is primarily a Chrome extension today.
- Chrome extension WebAuthn support is available in modern Chrome.
- WalletChan uses the browser extension origin as the WebAuthn relying party
  by omitting explicit `rp.id` / `rpId`; Chrome's native prompt should show
  the `chrome-extension://...` origin rather than an HTTPS site.
- Chrome is the lowest-risk path for testing popup/sidepanel behavior,
  platform authenticators, and service-worker session interactions.

### Firefox Later

Structure the implementation with runtime feature detection so Firefox can be
enabled later without rewriting the feature.

Firefox support is plausible but should be treated as second-pass QA:

- MDN documents WebAuthn in extensions starting with Firefox 150.
- Firefox extension popup flows can have UX issues when a credential prompt
  opens; fallback may require opening a full extension tab/page.
- Firefox should be explicitly tested before enabling the UI there.

## User Flow

### Enable Biometric Unlock

1. User opens WalletChan Settings while unlocked with the master password.
2. Settings shows a "Biometric unlock" toggle only when:
   - Current session is `passwordType === "master"`
   - WebAuthn/passkey unlock prerequisites are supported
   - Vault key system is active
3. User enables the toggle.
4. WalletChan prompts for passkey creation with user verification required.
5. WalletChan stores an encrypted passkey unlock wrapper in
   `chrome.storage.local`.
6. Future unlock screens can use this passkey credential.

When the authenticator returns the requested PRF result from credential
creation, WalletChan uses that result to wrap the vault key and does not ask
for an immediate second biometric assertion. If creation reports PRF support
but omits the result, WalletChan falls back to one assertion to obtain it.

Agent password sessions must not show the enable flow and background handlers
must reject attempts even if the UI is bypassed.

### Discover and Set Up From Unlock Screen

When biometric unlock is supported but not configured, the unlock screen should
show a subtle bottom action:

```text
Set up biometric unlock
```

This is the user's highest-intent moment for the feature, so it is the best
place to introduce it without adding onboarding friction.

Clicking this action opens a separate setup screen in the same extension UI:

- Header: "Set up Biometric Unlock"
- Top-right close button (`X`) returns to the normal unlock flow.
- Password input reuses the existing unlock/password field components where
  practical.
- Submit button verifies the entered password as the master password.
- On successful master verification, WalletChan runs the same passkey creation
  and vault-key wrapping flow used by Settings.
- On success, the wallet should finish unlocked as a master session and route
  to the normal wallet view.

Security rules:

- This flow must require the master password, not just any valid unlock
  credential.
- If the user enters the agent password, setup must be rejected with a clear
  "Master password required" error.
- No passkey wrapper should be written until master-password verification,
  WebAuthn credential creation, and backend hydration all succeed.
- Canceling the WebAuthn prompt should keep the user on the setup screen with
  the option to retry or close.

### Unlock With Biometric

1. User opens popup, sidepanel, or full-screen extension page while locked.
2. If passkey unlock is configured and supported, WalletChan auto-triggers the
   WebAuthn authentication prompt once unless the user explicitly pressed the
   extension lock button.
3. User verifies with platform biometrics, device PIN, or another passkey user
   verification method.
4. Background unlocks the wallet as a master session by caching the vault key
   and derived decrypted state.
5. UI moves to the normal main wallet view.

If the user cancels or authentication fails, keep the password unlock form
visible and show a manual "Unlock with biometrics" button when appropriate.
After an explicit manual lock, every UI surface that is already open skips its
automatic prompt but keeps the manual biometric unlock button available. This
suppression lasts only for that open surface; closing and reopening the popup
auto-triggers biometric unlock again.

### Lock / Auto-Lock

- Manual lock clears passkey-unlocked in-memory session state exactly like
  password unlock and tells currently open UI surfaces to suppress their next
  automatic biometric prompt in renderer-local state.
- Timed auto-lock clears passkey-unlocked in-memory session state exactly like
  password unlock.
- After timed auto-lock, the next unlock page can trigger passkey
  authentication again.

## Recommended Architecture

Use passkey/biometric unlock as an additional wrapper around WalletChan's
existing 256-bit vault key.

Current model:

```text
Master Password -> PBKDF2 -> encryptedVaultKeyMaster -> Vault Key
Agent Password  -> PBKDF2 -> encryptedVaultKeyAgent  -> Vault Key
Vault Key -> encryptedApiKeyVault / pkVault / signing state
```

Add:

```text
Passkey user verification -> passkey-derived secret -> encryptedVaultKeyPasskey -> Vault Key
```

Do not make passkey unlock a third `PasswordType`. It should resolve to the
existing `"master"` session type because it is enabled only from a master
session and is intended to unlock normal master-level wallet usage.

## WebAuthn Secret Derivation

Preferred v1 approach:

- Use WebAuthn PRF where available.
- Derive an AES-GCM key from the PRF output.
- Encrypt the raw vault key bytes with that AES-GCM key.
- Store only the encrypted vault-key wrapper and credential metadata.

If PRF is not available, v1 should mark biometric unlock unsupported instead of
falling back to storing a master-password-equivalent blob.

Rabby's browser-extension implementation stores an encrypted wallet password
under a WebAuthn-derived key. That is convenient and proven as a UX reference,
but WalletChan's vault-key system allows a cleaner design that avoids storing
the master password behind the passkey flow.

## Proposed Storage

Add a wallet-scoped local storage key:

```typescript
passkeyUnlock: {
  version: 1;
  rpId: "extension"; // internal metadata marker, not an explicit WebAuthn rpId
  credentialId: string; // base64url
  prfSalt: string; // base64url, stable per wrapper
  wrappedVaultKey: {
    ciphertext: string;
    iv: string;
  };
  createdAt: number;
  lastUsedAt?: number;
}
```

Storage rules:

- Add `passkeyUnlock` to `_docs/STORAGE.md`.
- Add `passkeyUnlock` to `WALLET_LOCAL_STORAGE_KEYS` so reset clears it.
- Clear `passkeyUnlock` on master password change unless we explicitly
  re-wrap it after verifying the new master password.
- Clear `passkeyUnlock` when the user disables biometric unlock.
- Never sync `passkeyUnlock` across devices.

## Background Handlers

Likely new extension-only messages:

- `getPasskeyUnlockStatus`
  - Returns supported/configured/enabled flags.
- `canSetupPasskeyUnlock`
  - Preflights that the current Settings session resolves to `master` before
    opening the platform passkey creation prompt.
  - Returns the current per-service-worker authentication ceremony epoch.
- `setupPasskeyUnlock`
  - Requires current session to resolve to `master`.
  - Requires cached vault key.
  - Stores the passkey wrapper only after backend hydration succeeds.
- `setupPasskeyUnlockWithPassword`
  - Used by the unlock-screen setup path.
  - Accepts an explicit password from the extension UI.
  - Verifies it decrypts `encryptedVaultKeyMaster` as the master password.
  - Rejects agent passwords even if they can unlock the wallet.
  - Runs the same passkey creation/wrapper storage flow as Settings.
- `unlockWithPasskey`
  - Performs or receives WebAuthn result, unwraps vault key, and initializes
    the same in-memory state as `handleUnlockWallet`.
- `removePasskeyUnlock`
  - Requires master session or explicit master password verification.
  - Clears `passkeyUnlock`.
- `verifyPasskeySetupPassword`
  - Used by the unlock-screen setup path to verify the master password before
    creating a WebAuthn credential, avoiding orphan passkeys on invalid input.
  - Supports legacy password-encrypted API/private-key vault verification so
    existing users can still set up biometric unlock before migration.

All new messages must be added to `EXTENSION_ONLY_MESSAGES`.

All mutating handlers and persisted-session restoration run through
`authTransition.ts`. The service worker serializes their cache/storage commits,
and setup/unlock must present the epoch returned before the native WebAuthn
ceremony. Lock, password change, reset, factor changes, successful unlock, and
service-worker suspension/restart invalidate older epochs so a stale prompt
cannot undo a newer security action. Serialization also ensures an in-flight
"Never" session restore cannot rehydrate credentials after manual lock.

## Session Semantics

After passkey unlock:

- `cachedVaultKey` should be set.
- `cachedPasswordType` should be `"master"`.
- API key and private-key vault should be decrypted/cached as today.
- `isWalletUnlocked()` should return true.
- Normal transaction/signature confirmation should work for all supported
  wallet types.
- Seed-phrase signing uses the already-derived private key in `pkVault`.
  `mnemonicVault` remains master-password encrypted, so reveal and derivation
  continue to require explicit master password entry.

Do not cache the master password during passkey unlock.

This implies some existing code that treats `getCachedPassword()` as the only
proof of an unlocked master session may need to be adjusted to use vault-key or
password-type state where appropriate.

## Security Requirements

- Passkey setup requires a master session. Agent sessions are blocked in both
  UI and background.
- Passkey unlock must never expose passkey-derived key material to content
  scripts, webpages, or inpage provider code. Internal runtime messaging is
  extension-wide, so every packaged extension page is part of the trusted
  boundary and must not log, persist, or forward that material.
- Passkey unlock must not weaken agent restrictions.
- Private key reveal and seed phrase reveal should continue to require manual
  master password entry.
- Master password change should require a manual master password session or
  explicit master password verification.
- New handlers must follow sender validation and session restoration patterns
  from `_docs/SECURITY.md` and `_docs/IMPLEMENTATION.md`.
- Canceled biometric prompts should not show scary errors. Return to password
  unlock cleanly.

## Sensitive Flow Notes

### Transactions and Signatures

Expected to work after passkey unlock:

- Bankr account transaction/signature flows use cached API key.
- Private key and seed phrase account flows use cached private-key vault or
  cached vault key.
- ERC-5792 batch, cross-dapp batch, and ERC-7715 permission confirmation must
  be tested because they use separate handlers and local signer paths.

### Key Reveal

Do not allow biometric unlock alone to reveal private keys or seed phrases.

Current reveal handlers compare the user-entered password to the cached
password. If passkey unlock no longer caches the master password, those
handlers should verify the typed password by decrypting `encryptedVaultKeyMaster`
instead of comparing against `getCachedPassword()`.

### Settings That Modify Secrets

For operations like changing the API key, adding seed phrases, adding private
keys, changing the master password, setting/removing agent password, and
removing passkey unlock, decide per flow whether a cached master vault key is
enough or whether manual master password verification is required.

Conservative default:

- Routine master-session settings may use cached vault key.
- Secret reveal, master password change, and credential-factor management
  should require explicit master password verification.

## UI Requirements

Settings:

- Add a biometric unlock toggle in Security settings.
- Show only when feature detection succeeds and session is master.
- Disable or hide under agent session with a clear master-password requirement.
- Provide a remove/disable path.

Unlock screen:

- If configured, auto-trigger passkey unlock once on page load.
- Show password unlock at all times or after any biometric cancellation/failure.
- Provide a manual biometric unlock button when configured.
- If supported but not configured, show a bottom "Set up biometric unlock"
  action.
- The setup action opens a dedicated setup screen instead of crowding the normal
  unlock form.
- The setup screen has an `X` close button that returns to the normal unlock
  flow without changing lock state.
- The setup screen asks for the master password, then triggers the passkey
  creation flow.
- After successful setup from the unlock screen, route directly into the main
  wallet view as a master session.
- Avoid repeated biometric prompts in the same page lifecycle after cancellation.

Copy and tone:

- Use "Biometric unlock" in UI copy.
- Avoid implying WalletChan can recover the master password.
- Explain that password remains the backup.

## Testing Plan

Committed unit coverage runs with `pnpm test:extension-passkey` and verifies:

- Creation-time PRF output avoids a second assertion; missing creation output
  performs exactly one fallback assertion.
- Ceremony epochs invalidate stale work and auth mutations serialize in order.
- A failed auth mutation releases the queue.
- Manual lock wins over an already in-flight persisted-session restore.
- Payload and stored-record cryptographic sizes fail closed.
- Bankr API, private-key, and seed-phrase derived-key caches hydrate from the
  same passkey-unwrapped vault key.

The browser/hardware cases below remain required release QA because native
platform authenticators cannot be exercised by the Node test environment.

Test all wallet types:

- Bankr API account (`type: "bankr"`)
- Private key account (`type: "privateKey"`)
- Seed phrase account (`type: "seedPhrase"`)

Core cases:

- Enable biometric unlock from master session.
- Enable biometric unlock from the unlock-screen setup prompt with master
  password.
- Attempt unlock-screen setup with agent password and verify rejection.
- Close the unlock-screen setup screen with `X` and verify normal unlock flow
  is unchanged.
- Confirm biometric setup is hidden/rejected from agent session.
- Manual lock suppresses the automatic biometric prompt in currently open UI
  surfaces, the manual biometric button still unlocks, and closing/reopening
  the popup auto-prompts again.
- Unlock with biometric after auto-lock timeout.
- Unlock with biometric after service worker restart.
- Cancel biometric prompt and unlock with password.
- Disable biometric unlock.
- Reset extension clears biometric storage.
- Master password change clears or re-wraps biometric storage as designed.

Transaction/signing cases:

- Bankr transaction confirm after passkey unlock.
- Private key transaction confirm after passkey unlock.
- Seed phrase transaction confirm after passkey unlock.
- Bankr message signing after passkey unlock.
- Private key message signing after passkey unlock.
- Seed phrase message signing after passkey unlock.
- ERC-5792 batch tx after passkey unlock.
- Cross-dapp batch after passkey unlock.
- ERC-7715 permission confirmation after passkey unlock.

Security cases:

- Private key reveal requires manual master password after passkey unlock.
- Seed phrase reveal requires manual master password after passkey unlock.
- Agent password cannot enable, disable, or modify passkey unlock.
- Content scripts cannot call passkey setup/remove/unlock handlers.

Browser cases:

- Chrome popup.
- Chrome sidepanel.
- Chrome full-screen extension tab.
- Firefox only after explicit support QA.

## Remaining Follow-ups

- WebAuthn relies on the browser extension origin. There is no HTTPS RP
  compatibility path because that version was not shipped.
- Should passkey unlock be allowed to manage API key edits, or should API key
  changes require manual master password entry?
- Passkey sessions intentionally require another biometric prompt after a
  service-worker restart; no passkey-derived secret is persisted for "Never".
- Is WebAuthn PRF support broad enough for the desired Chrome user base, or
  should v1 show the feature only on detected PRF-capable devices?

## References

- Rabby biometric unlock reference:
  - `/Users/apoorvlathey/blockchain/wallets/Rabby/src/ui/utils/biometric.ts`
  - `/Users/apoorvlathey/blockchain/wallets/Rabby/src/ui/views/Unlock/index.tsx`
  - `/Users/apoorvlathey/blockchain/wallets/Rabby/src/ui/views/BiometricUnlockSetup/index.tsx`
- Ambire multi-secret keystore reference:
  - `/Users/apoorvlathey/blockchain/wallets/ambire-extension/src/ambire-common/src/controllers/keystore/keystore.ts`
  - `/Users/apoorvlathey/blockchain/wallets/ambire-extension/src/common/contexts/biometricsContext/biometricsContext.tsx`
- WebAuthn in extensions:
  - `https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Use_the_web_authn_api`
- Chrome WebAuthn overview:
  - `https://developer.chrome.com/docs/identity/webauthn`
- WebAuthn PRF extension:
  - `https://www.w3.org/TR/webauthn-3/`
  - `https://developer.mozilla.org/en-US/docs/Web/API/Web_Authentication_API/WebAuthn_extensions`
