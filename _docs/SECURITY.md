# WalletChan Security Guide

This document is the security reference for the WalletChan Chrome extension. It defines the threat model, lists every security-sensitive code path, and provides checklists for verifying that changes do not introduce vulnerabilities.

**When to read this**: Before every commit that touches extension code. Claude (or any reviewer) should verify changes against the relevant checklists below.

---

## Threat Model

### What We Protect

| Secret          | Storage                                                                                          | In-Memory Cache                                    |
| --------------- | ------------------------------------------------------------------------------------------------ | -------------------------------------------------- |
| Master password | Never stored (except encrypted native-session restore for "Never" auto-lock; fallback browsers keep it in memory only, and stale fallback ciphertext is removed across browser capability upgrades) | `cachedPassword` in `session/inMemoryCache.ts` via the `sessionCache.ts` facade |
| Agent password  | Never stored directly (encrypts vault key)                                                       | Not cached separately (same `cachedPassword` slot) |
| Password type   | `chrome.storage.session` (for session restoration)                                               | `cachedPasswordType` in `session/inMemoryCache.ts` |
| Passkey PRF output | Never stored. Produced by WebAuthn in a trusted extension page and sent over extension-internal runtime messaging for immediate service-worker wrap/unwrap; never forwarded to content scripts, webpages, or inpage code | Not cached after use |
| Bankr API key   | `encryptedApiKeyVault` (AES-256-GCM via vault key) or `encryptedApiKey` (legacy, password-based) | `cachedApiKey` in `session/inMemoryCache.ts`       |
| Private keys    | `pkVault` entries (AES-256-GCM via vault key or password, indicated by `salt` field)             | `cachedVault` in `session/inMemoryCache.ts`        |
| Seed phrases    | V2 `mnemonicVault` entries encrypted by a dedicated mnemonic key; V1 entries encrypted by the master password (plus read-only transitional shared-vault compatibility) | `cachedMnemonicKey` only in master/password or V2 passkey sessions; never in agent sessions. Reveal still requires explicit master-password verification |
| Vault key       | `encryptedVaultKeyMaster` / `encryptedVaultKeyAgent` (PBKDF2-wrapped)                            | `cachedVaultKey` in `session/inMemoryCache.ts`     |
| Mnemonic key    | Master wrapper in V2 `mnemonicVault.masterWrappedKey`; independent V2 passkey wrapper in `passkeyUnlock.wrappedMnemonicKey` | `cachedMnemonicKey` as a non-extractable CryptoKey in master sessions only |

### Trust Boundaries

```
UNTRUSTED                          TRUSTED (extension context)
-----------                        ---------------------------
Webpage JS (dapp)                  Background service worker
  |                                  - sessionCache.ts (session facade)
  |                                  - session/inMemoryCache.ts (credentials)
  v                                  - auth/walletUnlock.ts / authHandlers.ts
inpage.js (runs in page context)     - txHandlers.ts (signing)
  |                                  - crypto.ts / vaultCrypto.ts
  v
inject.ts (content script bridge)  Extension UI (popup/sidepanel)
  |                                  - Same origin as background
  v                                  - Communicates via chrome.runtime
background.ts (five-line entrypoint) → background/bootstrap.ts
  → background/messagePipeline.ts + background/composition/
```

**Key principle**: The webpage and content script are untrusted. All validation
and routine secret handling happens in the background service worker. Private
keys and seed phrases reach only the exact trusted WalletChan UI document after
the corresponding explicit, master-password-gated reveal action; they are
never sent to content scripts, inpage code, webpages, or unrelated extension
documents.

---

## Encryption Specifications

| Parameter      | Value                                                   |
| -------------- | ------------------------------------------------------- |
| Algorithm      | AES-256-GCM (authenticated encryption)                  |
| Key derivation | PBKDF2-SHA256                                           |
| Iterations     | 600,000                                                 |
| Salt           | 16 bytes (random per encryption)                        |
| IV             | 12 bytes (random per encryption)                        |
| Vault key      | 256-bit random (generated once, encrypted per-password) |

**Files**: the stable `crypto.ts` and `cryptoUtils.ts` facades cover the `cryptography/` audit domain (`types.ts` for the released envelope, `base64.ts` for bounded codecs, `passwordKey.ts` for fixed PBKDF2 policy, `passwordCipher.ts` for legacy AES-GCM records, `vaultKey.ts` for 32-byte vault-key wrapping/direct encryption, and `credentialStorage.ts` for vault-first legacy-compatible Bankr lookup). The policy-free `vaultCrypto.ts` facade covers the `vault/` audit domain (`entryCrypto.ts` for released password/vault-key transforms, `accountIntegrity.ts` for local key binding, `generalIntegrity.ts` for general-key recovery proof, `recordCodec.ts` for bounded released-V1 decoding and the unique-ID mutation gate, `repository.ts` for exact `pkVault` V1 storage, and `operations.ts` for serialized mutation/hydration/migration preparation). The stable `mnemonicStorage.ts` facade covers the `mnemonic/` audit domain (`record.ts`, `crypto.ts`, `repository.ts`, `operations.ts`, and `recovery.ts` for encrypted-vault compatibility; `derivation.ts` for pure BIP39/BIP44 operations; `masterAccess.ts` for the call-stack-only master capability; `integrity.ts` for master-recovery/account proof; and `addressPreview.ts`, `accountPersistence.ts`, and `accountHandlers.ts` for seed-account workflows). The `passkey/` audit domain contains `record.ts`, `keyWrapping.ts`, `repository.ts`, `status.ts`, `setup.ts`, `hydration.ts`, and `removal.ts`; `passkeyUnlockCrypto.ts` and `passkeyUnlock.ts` remain stable facades. Stable `secretRevealHandlers.ts` and `masterAuthorization.ts` facades cover `secrets/revealHandlers.ts` and `secrets/masterAuthorization.ts`, where plaintext release remains lock-held, epoch-bound, master-only, and revalidated after asynchronous reads.

See [`SECURITY_ARCHITECTURE.md`](./SECURITY_ARCHITECTURE.md) for the enforced
dependency direction, background-message audience contract, critical operation
shape, compatibility-facade policy, and behavioral test requirements used to
decompose these modules for external audit.

---

## Vault Key System Architecture

WalletChan uses a **two-tier encryption** system (vault key wrapping) to enable multiple passwords to decrypt the same data without key duplication:

```
Master Password → PBKDF2 (600k) → Decrypt encryptedVaultKeyMaster → General Vault Key (256-bit)
Agent Password  → PBKDF2 (600k) → Decrypt encryptedVaultKeyAgent  → Same General Vault Key
Passkey PRF     → HKDF("vault") → Decrypt wrappedVaultKey          → Same General Vault Key
                                         ↓
                  General Vault Key → AES-256-GCM → Decrypt:
                                    - encryptedApiKeyVault
                                    - pkVault entries (salt === "")

Master Password → PBKDF2 (600k) → Decrypt V2 masterWrappedKey ┐
Passkey PRF     → HKDF("mnemonic") → Decrypt wrappedMnemonicKey├→ Dedicated Mnemonic Key
Agent Password / General Vault Key ────────────────────────────┘  (no access)
                                                                  ↓
                                      V2 mnemonicVault entries with per-group AAD

Master Password → PBKDF2 (600k) → AES-256-GCM → V1 mnemonicVault entries
```

Passkey setup requests PRF evaluation as part of the user-verifying WebAuthn
registration ceremony. When registration returns `prf.results.first`, that
output is used directly to wrap the vault key; otherwise setup performs a
user-verifying assertion to obtain the same credential-bound PRF output.

### Storage Format Detection

**Vault-key encrypted** (current, v1.3.0+):

- `salt === ""` in keystore object
- Encrypted directly with vault key (no PBKDF2 derivation)
- Both master and agent passwords can decrypt (via vault key)

**Password encrypted** (legacy, pre-v1.3.0):

- `salt !== ""` (16-byte base64 salt)
- Encrypted with PBKDF2-derived key from password
- Only the specific password that encrypted it can decrypt
- Supported for backward compatibility during migration

### Migration Strategy

**Automatic migration** on first unlock after v1.3.0 upgrade:

1. `auth/walletUnlock.ts` authenticates the master password and invokes
   `auth/legacyVaultKeyMigration.ts` → `migrateToVaultKeySystem()`
2. Generate 256-bit random vault key
3. Encrypt vault key with master password → save to `encryptedVaultKeyMaster`
4. Re-encrypt API key with vault key → save to `encryptedApiKeyVault`
5. Re-encrypt all private keys with vault key → update `pkVault` entries (`salt: ""`)
6. Leave V1 seed phrases master-password encrypted. Successful passkey setup later converts them atomically to a V2 dedicated-mnemonic-key vault.

**Partial migration detection**: If the general vault-key system exists (`encryptedVaultKeyMaster` present) but private keys remain password-encrypted (`salt !== ""`), migration is completed on the next master-password unlock. A partial `encryptedVaultKeyMaster` + legacy `encryptedApiKey` state is likewise recovered and atomically converted on master unlock; passkey/agent sessions refuse to report a half-unlocked Bankr wallet until that password-only ciphertext is migrated. Authentication hydration and credential updates share one operation lock through their final cache commit so an older key read cannot overwrite a concurrent newer credential in memory. V1 mnemonics deliberately remain supported until explicit passkey setup converts the complete vault in one commit.

### Password Type Persistence (v1.3.0+)

To maintain agent password access control guards across service worker restarts:

**Storage**: `chrome.storage.session.passwordType` (stored alongside session password)

**Restoration**: When `tryRestoreSession()` succeeds, `passwordType` is restored to `cachedPasswordType`, ensuring operations remain blocked for agent password sessions even after restart. Restoration shares the serialized auth-transition queue with manual lock and factor/password mutations, so an in-flight restore cannot resurrect credentials after a newer lock.

**Critical**: Without password type persistence, agent password users could temporarily bypass guards (reveal private keys, change settings) after service worker restart until manual lock/unlock. This is now mitigated in v1.3.0+.

---

## Agent Password Access Control

The agent password model restricts what operations are available when the wallet is unlocked with the agent (secondary) password vs. the master password.

### Access Matrix

| Operation                        | Master | Agent       | Guard Location                                                                 |
| -------------------------------- | ------ | ----------- | ------------------------------------------------------------------------------ |
| Unlock wallet                    | Yes    | Yes         | `auth/walletUnlock.ts` + `auth/sessionHydration.ts`                             |
| Sign/send transactions           | Yes    | Yes         | `txHandlers.ts`                                                                |
| Sign messages                    | Yes    | Yes         | `txHandlers.ts`                                                                |
| Add/remove/confirm cross-dapp batch | Yes | Yes         | `crossDappBatchHandlers.ts` (no extra gating — same as single tx submission)   |
| Canonical WalletChan EIP-7702 batch authorization | Yes | Yes | `delegation/authorityPolicy.ts` (stable `delegatedAuthorityPolicy.ts` facade) - routine default delegate remains agent-capable |
| Install a custom/non-default EIP-7702 delegate | Yes | **BLOCKED** | `delegation/authorityPolicy.ts` at initiation and again at the raw-send boundary |
| Approve an ERC-7715 delegated permission | Yes | **BLOCKED** | `erc7715/confirmation.ts` + grant-storage commit guard                          |
| Revoke EIP-7702 / ERC-7715 authority | Yes | Yes | Revocation handlers use the routine signing policy because they reduce authority |
| Reveal private key               | Yes    | **BLOCKED** | `background/secretManagementRouter.ts` transport + `secrets/revealHandlers.ts` |
| Change API key/address           | Yes    | **BLOCKED** | `auth/bankrCredentialUpdate.ts` + verified atomic account/credential commit; legacy cached-password-only mutation fails closed |
| Change master password           | Yes    | **BLOCKED** | `auth/masterPasswordRotation.ts` - `handleChangePassword()`                    |
| Add Bankr account (with API key) | Yes    | **BLOCKED** | `background/accountManagementRouter.ts` + `auth/bankrCredentialUpdate.ts`      |
| Add private key account          | Yes    | **BLOCKED** | `background/accountManagementRouter.ts` + the private-key vault boundary       |
| Add impersonator account         | Yes    | **BLOCKED** | `background/accountManagementRouter.ts`                                        |
| Add seed phrase group            | Yes    | **BLOCKED** | `background/accountManagementRouter.ts` → `mnemonic/accountHandlers.ts`        |
| Derive seed account              | Yes    | **BLOCKED** | `background/accountManagementRouter.ts` → `mnemonic/accountHandlers.ts`        |
| Reveal seed phrase               | Yes    | **BLOCKED** | `background/secretManagementRouter.ts` transport + `secrets/revealHandlers.ts` |
| Remove account                   | Yes    | **BLOCKED** | `background/accountManagementRouter.ts` + account-removal privacy boundary     |
| Initiate token transfer          | Yes    | Yes         | `txHandlers.ts` - creates PendingTxRequest                                     |
| Reset extension                  | Yes    | **BLOCKED** | `background/resetRouter.ts` + exact `storage/resetManifest.ts`                 |
| Set/remove agent password        | Yes    | **BLOCKED** | `auth/agentFactorHandlers.ts`                                                   |
| Set/remove passkey unlock        | Yes    | **BLOCKED** | Stable `passkeyUnlock.ts` facade over focused status/setup/hydration/removal boundaries; setup/removal require master authorization |

### How Guards Work

Every blocked operation resolves the live password type from `sessionCache.ts`
and requires a master session before executing sensitive logic. Persistent
delegated-authority changes additionally capture the auth epoch and re-check
both that epoch and the live master type at their grant-storage/raw-send
linearization point. These guards are **backend-enforced** (defense-in-depth),
independent of UI-level hiding/disabling.

V2 biometric unlock hydrates `passwordType: "master"`, the cached general vault
key, and the separate cached mnemonic key,
but intentionally does not cache the plaintext master password. Operations
whose cryptography needs only those capabilities (private-key/seed-phrase account
creation, seed account derivation, and Bankr API credential creation/update)
accept them as a valid master session. Existing V1 passkeys hydrate only the
general vault key, retain routine signing compatibility, and require removal and
re-enablement with the master password before biometric mnemonic actions. Seed/private
key reveal, master-password rotation, agent-password wrapping, and passkey
removal still require explicit master-password verification. Agent sessions
can unwrap only the general vault key for routine signing, so every seed operation
is guarded by the background-resolved password type before mnemonic decryption.
Routine transaction/message signing and canonical WalletChan EIP-7702 batch
authorization remain agent-capable. Issuing a reusable ERC-7715 capability or
installing a non-default EIP-7702 delegate is master-only; revoking either kind
of authority remains agent-capable.

**Pattern**:

```typescript
// At the TOP of the handler, before any logic
if (getPasswordType() === "agent") {
  return { success: false, error: "This operation requires master password" };
}
```

---

## Security-Sensitive Message Handlers

These are the message handlers composed by `background.ts` and its focused
transport routers that touch secrets, modify accounts, or have destructive
effects. Each must be audited when changed.

### External provider ingress policy

Untrusted page and WalletConnect input share the effect-free validators under
`chrome/provider/`. `messageValidation.ts` caps the complete injected envelope
before background dispatch. Focused validators separately freeze request-id
syntax, URL length/policy, transaction calldata and uint256 quantities,
signature method/signer/payload shape, `wallet_sendCalls` count/data/value
limits, and EIP-3085/EIP-747 metadata. WalletConnect and batch intake call the
same payload validators directly, so they do not rely on another transport
having validated first. `chainBoundary.ts` never coerces arbitrary values and
requires the requested chain to equal the content-script-attested active chain
for every state-changing injected route. No provider-policy module may access
Chrome storage, fetch, credentials, secrets, signing, or broadcasting.

### Secret-Exposing Handlers

| Handler             | What It Exposes                                               | Guard                                                  |
| ------------------- | ------------------------------------------------------------- | ------------------------------------------------------ |
| `getCachedApiKey`   | `background/bankrCredentialRouter.ts` returns plaintext API key to caller | Exact extension page sender, master session, auto-lock timeout checked |
| `revealPrivateKey`  | Returns plaintext private key                                 | Requires password verification + blocks agent password |
| `getCachedPassword` | Returns `hasCachedPassword` boolean (not the password itself) | `wallet-ui` audience in `background/messageAccessPolicy.ts` |

### Secret-Modifying Handlers

| Handler                            | What It Modifies                                                                                                             | Guard                                      |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| `saveApiKeyWithCachedPassword`     | Legacy compatibility message; returns an error and performs no mutation so a credential-only update cannot bypass account binding | Extension-only; fail closed                |
| `saveBankrApiKeyAndAddress`        | `background/bankrCredentialRouter.ts` cryptographically verifies a harmless `/wallet/sign` challenge against the proposed address, then atomically overwrites the encrypted API key and Bankr account row before best-effort mirrors | Master session and prepared auth epoch required; agent blocked |
| `changePassword`                   | Re-verifies the current master password; proves the general wrapper recovers the non-empty Bankr credential and every local key with the correct account address, and proves the V2 mnemonic wrapper recovers every valid phrase/seed account before clearing factors; atomically re-wraps general/mnemonic keys, re-encrypts V1 phrases, and completes residual API/`pkVault` migrations | Agent password blocked |
| `addBankrAccount`                  | Verifies the API signer/address, atomically commits credential + row, and enforces one wallet-wide Bankr account for new adds | Master session required; agent blocked     |
| `addPrivateKeyAccount`             | Adds new entry to encrypted private key vault using the cached vault key after biometric/master unlock, or password fallback for legacy wallets | Agent password blocked                     |
| `addSeedPhraseGroup`               | `mnemonic/accountHandlers.ts` creates/imports a seed group using the cached V2 mnemonic key after biometric/master unlock, or master-password encryption for V1 wallets | Agent password blocked                     |
| `deriveSeedAccount`                | `mnemonic/accountHandlers.ts` decrypts V2 with the cached mnemonic key (or V1 with the master password) and stores derived keys in `pkVault` | Agent password blocked                     |

### Account-Modifying Handlers

| Handler                    | Effect                                           | Guard                              |
| -------------------------- | ------------------------------------------------ | ---------------------------------- |
| `removeAccount`            | Revokes exact-origin grants for connected tabs mapped to the account, then deletes its reference; never exposes the fallback account as an implicit replacement | Agent password blocked |
| `reorderAccounts`           | Reorders account metadata without changing account identity or secrets; validates an exact ID permutation under the shared account lock | `wallet-ui` audience policy |
| `setActiveAccount`         | Changes active account + updates storage address | `wallet-ui` audience policy |
| `setTabAccount`            | Validates account selection; connected/pending dapp tabs retain an override and refresh the shared fallback, while ordinary tabs update only that fallback and clear stale overrides | `wallet-ui` audience policy |
| `updateAccountDisplayName` | Changes display name                             | `wallet-ui` audience policy |

Account metadata uses a stable `accountStorage.ts` facade over independently
reviewable repository, selection, Bankr, local/view-only, seed-account, and
seed-group modules. The split does not change the `accounts`, `activeAccountId`,
`tabAccounts`, or `seedGroups` storage schemas. Bankr metadata and its prepared
encrypted credential still commit in one local-storage write; secret vault
material remains outside the account metadata domain.

### Destructive Handlers

| Handler          | Effect                      | Guard                                         |
| ---------------- | --------------------------- | --------------------------------------------- |
| `resetExtension` | Wipes wallet identity state, pending queues, WalletConnect routing, cross-dapp batches, tx history, wallet portfolio state, transient result keys, and session auth state via the stable `walletResetStorage.ts` facade and exact `storage/resetManifest.ts` manifest | Agent password blocked |
| `lockWallet`     | Clears all in-memory caches and restorable session auth; tells currently open UI surfaces to suppress their biometric auto-prompt in renderer memory | None needed (user-initiated, non-destructive) |
| `clearTxHistory` | Deletes transaction history | `wallet-ui` audience policy |

### Extension-Only UI Reads and Actions

`background/messageAccessPolicy.ts` is the exhaustive audience manifest for the
main `background/messagePipeline.ts` router. Any message owned by popup/sidepanel/onboarding UI
that reads wallet state, account metadata, chat history, pending-request
details, transaction history/status, session/auth status, clear-signing
preferences/cache, or mutates extension-only state must be classified exactly
once as `wallet-ui`. Provider-facing routes must be deliberately classified as
`provider` and still pass external envelope validation. A router case without a
classification fails the security test suite. Current examples include:

The gate uses `isTrustedWalletUiSender()` and accepts only the top-level
`index.html` and `onboarding.html` documents at WalletChan's exact extension
scheme + host. It does **not** trust an arbitrary `chrome-extension://` or
`moz-extension://` URL. The web-accessible ENS documents (`browse.html`,
`interstitial.html`, `ens-error.html`, `setup-kubo.html`) are authorized only
for their exact message/page combinations in
`ensBrowsing/senderAuthorization.ts`; `ensBrowsing/handlers.ts` remains only
the stable message-entry facade. These documents
cannot call wallet UI, account, auth, or secret handlers. `popup-wake` and
`ui-keepalive` ports use the same sender check so a content script or embedded
web-accessible page cannot suppress auto-lock.

| Handler Class | Examples | Why Extension-Only |
| --- | --- | --- |
| Account/session reads and ordering | `getAccounts`, `reorderAccounts`, `getTabAccount`, `getSeedGroups`, `isWalletUnlocked`, `isApiKeyCached`, `tryRestoreSession`, `getPasswordType`, `getAutoLockTimeout` | Avoid exposing wallet/account/session state or allowing webpages to mutate wallet UI ordering. |
| Transaction/history UI | `getTxHistory`, `getProcessingTxs`, `getFailedTxResult`, `checkPendingTxReceipt`, `cancelProcessingTx`, `splitBatchIntoIndividualTxs`, gas/simulation helpers | Avoid letting content scripts inspect or alter local pending/history/status state. |
| Chat | `submitChatPrompt`, `getChatConversations`, `getChatConversation`, `createChatConversation`, `deleteChatConversation`, `addChatMessage`, `updateChatMessage` | Chat prompt submission uses the user's Bankr credentials/session and chat history is local user data. |
| Settings/cache | `setArcBrowser`, `getSidePanelMode`, `setSidePanelMode`, `getClearSigningEnabled`, `setClearSigningEnabled`, `INVALIDATE_CLEAR_SIGNING_CACHE` | These are extension UI preferences/cache controls, not dapp APIs. |
| Network settings | `ensureNetworksInfo`, `addNetwork`, `updateNetwork`, `setNetworkHidden`, `deleteNetwork`, `confirmAddChain` | Mutate provider-visible `networksInfo` / `chainName` and local saved-RPC history; keep service-worker-owned so webpages cannot alter RPC metadata or clobber user-added chains. |

`getActiveAccount` is the narrow exception: `inject.ts` uses it during content
script initialization to correct stale synced address state before emitting
`accountsChanged`. Webpages cannot call it directly because `inject.ts` does
not forward an inpage message for it.

### Transaction History Enrichment Handlers

| Handler | Effect | Guard |
| --- | --- | --- |
| `backfillAssetChanges` | Extension UI asks the service worker to re-fetch a confirmed tx receipt and populate missing `assetChanges` on an existing history entry. Does not expose secrets or create transactions. | `wallet-ui` audience policy |

### Authentication Handlers

| Handler               | Notes                                                                    |
| --------------------- | ------------------------------------------------------------------------ |
| `unlockWallet`        | Tries master password first, then agent. Sets `passwordType` accordingly |
| `setAgentPassword`    | Requires a master session and explicit master password, then proves the unwrapped general key recovers every current credential/local account before adding the agent wrapper. |
| `removeAgentPassword` | Requires explicit master password verification and the same full general-vault recovery proof before deleting the agent wrapper. |
| `canSetupPasskeyUnlock` | Preflights cached-master-session setup so agent/expired sessions fail before platform credential creation. The current Settings UI uses explicit-password step-up instead. |
| `setupPasskeyUnlock` / `setupPasskeyUnlockWithPassword` | Requires master authorization, validates local keys plus every seed derivation, then atomically stores the V2 mnemonic vault and purpose-separated passkey wrappers. |
| `unlockWithPasskey`   | V2 unwraps both general and mnemonic keys; V1 unwraps only the general key for backward-compatible signing. Transactionally hydrates a master session without caching/storing the master password. |
| `removePasskeyUnlock` | Requires explicit master-password verification, proves the general master wrapper recovers every current Bankr/private-key secret with correct account bindings, and validates complete V2 mnemonic recovery before clearing the local passkey wrapper. V1/no-mnemonic wallets retain compatible removal after the general proof. |
| `verifyMasterPassword` | Verifies an explicitly entered master password without hydrating or mutating the active session. Used for sensitive Settings step-up flows. |

All mutating unlock/lock/factor/password/reset handlers and persisted-session
restoration run through `authTransition.ts`. The queue makes cache/storage
commits linearizable across simultaneously open extension views, including
agent-password creation versus master-password rotation. WebAuthn
preflight/status responses also carry a random per-service-worker ceremony
epoch; lock, password change, reset, factor removal, successful unlock, and
worker suspension rotate it so an older native prompt cannot commit after a
newer security action or service-worker restart.

Manual lock additionally runs through `auth/sessionTermination.ts`, which holds
the wallet-secret operation lock before rotating the epoch and clearing cached
keys. This prevents an in-flight seed/private-key mutation from observing a
vault key that disappears halfway through its commit; operations queued behind
the lock retain their earlier epoch and fail closed.

For the same expiry boundary, `addKeyToVault` checks the persisted master
wrapper before selecting its encryption format. Once a wallet is migrated,
absence of the cached vault key is a lock condition—not permission to fall back
to password-encrypted legacy storage.

`chrome.runtime.sendMessage()` is extension-wide, so sibling trusted extension
pages may observe internal messages even though only the service worker handles
the passkey command. The security boundary is therefore all packaged extension
pages—not content scripts or webpages. No passkey-derived material may be logged,
persisted, or forwarded outside that boundary.

### Pending Transaction Edit Handlers

`updatePendingTxRequestData` mutates a pending single transaction's calldata
before the user signs, for example when the confirmation UI edits an ERC-20
approve amount. It must stay classified as `wallet-ui` so a webpage
cannot silently alter a pending tx between display and signing.

### Dapp-Initiated Batch Handlers (`batchTxHandlers.ts`)

`batchTxHandlers.ts` is an implementation-free compatibility facade.
The pure ERC-7821 byte encoding, call-value normalization, contract-creation
rejection, and payload-bearing EOA self-call rejection live in
`batch/batchTxEncoding.ts`. That module has no Chrome storage, session, network, API,
or signing dependency, and its output is frozen byte-for-byte in direct tests.
Both the Bankr and private-key/seed-phrase paths still consume the same exported
function identity through the established `batchTxHandlers.ts` import path.
Pending-call UI mutations, rejection, and origin-scoped `wallet_getCallsStatus`
and `wallet_showCallsStatus` reads live in `batchRequestStatusHandlers.ts`.
This keeps status disclosure and pending-request mutation separate from all key
resolution and signing paths while preserving the original facade identities.
`batchRequestIntake.ts` owns the shared injected/WalletConnect queue boundary:
it pins the validated account, chain, origin, tab/frame or WC request metadata;
commits the pending request before its bundle status; revalidates the transport
authorization around both writes; and compensates either partial record before
publishing a failed acknowledgement. It has no credential or signing access.

Capability discovery, PK/seed credential resolution, and execution are separate
audit boundaries. `batchCapabilities.ts` refuses addresses other than the exact
connected account before any delegate probe. `batchLocalConfirmation.ts`
consumes the pinned request and selects the single, atomic-7702, or sequential
path. `batchLocalAuthorization.ts` then re-resolves that exact account and
performs origin/WalletConnect authorization as the final await before beginning
the RPC effect. `batchSingleExecution.ts`, `batchSequentialExecution.ts`, and
`batchAtomic7702Execution.ts` own their distinct sign/broadcast state machines;
`batchCompletionTracking.ts` owns later aggregate status mirroring without
access to keys or credentials.

These mutate `pendingBatchTxRequests` (dapp `wallet_sendCalls`) before the user signs. All are classified as `wallet-ui` in `background/messageAccessPolicy.ts`:

| Handler                        | Effect                                                                                                                                                 |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `removeCallFromPendingBatch`   | Drops a single call from the pending bundle's `params.calls`. If the last call is removed, falls through to a full reject (writes `batchTxResult` + sets `bundleStatuses` to OFFCHAIN_FAILURE). The user is the only party who can prune calls — a dapp must not be able to silently shrink its own (or another dapp's) bundle. |
| `updateCallInPendingBatch`     | Replaces one call's `data` field in the pending bundle (e.g. user edits an ERC-20 approve amount on a built-in CallCard). Validates hex format only — the user is responsible for the resulting calldata being semantically valid; the downstream confirmation re-simulates and re-estimates from the new bytes. Must stay extension-only so a content script cannot silently mutate another bundle's calls (e.g. swap a benign approve amount for `MAX_UINT256`) between display and signing. |

### Cross-Dapp Batch Handlers (`crossDappBatchHandlers.ts`)

These move pending tx requests in/out of a user-assembled batch and ship the batch via Bankr API or PK/SP EIP-7702 local signing. All are classified as `wallet-ui` in `background/messageAccessPolicy.ts` so a malicious dapp cannot reach into the user's pending tx queue:

The root handler is export-only; implementations live under
`crossDappBatch/`. `storage.ts` preserves the non-secret released schema,
`intake.ts` persists staging before source removal, and `lifecycle.ts` removes
unauthorized source groups before terminal publication. Confirmation acquires
its duplicate-submit lock before asynchronous reads, validates the persisted
account/from/chain lock, and delegates to separate Bankr or PK/seed signers.
Both signer paths acquire a reset-aware effect lease and perform final live
account, origin/WalletConnect, and synchronous epoch-commit checks immediately
before the irreversible network effect. `completion.ts` keeps transaction
result keys separate from source ERC-5792 bundle statuses and preserves one
atomic result for every sibling group.

| Handler                       | Effect                                                                                           |
| ----------------------------- | ------------------------------------------------------------------------------------------------ |
| `addToCrossDappBatch`         | Removes a `pendingTxRequest` and appends it to `crossDappBatch`. Dapp promise stays open.        |
| `addCallsToCrossDappBatch`    | Removes a `pendingBatchTxRequest` (dapp `wallet_sendCalls`), appends every call as a sibling entry sharing one `bundleId`. The dapp's `bundleStatuses` entry stays at PENDING. |
| `removeFromCrossDappBatch`    | For `eth_sendTransaction` entries: writes rejection to `txResult:{txId}`. For `wallet_sendCalls` entries: removes ALL siblings from the same bundle and updates `bundleStatuses` to OFFCHAIN_FAILURE once. Clears the batch if empty. |
| `updateCallInCrossDappBatch`  | Replaces one entry's `tx.data` in the cross-dapp batch (e.g. user edits an ERC-20 approve amount on a built-in CallCard). Validates hex only; the originating dapp's promise stays open until the batch ships, so the dapp never sees the edited bytes until on-chain confirmation. Must stay extension-only for the same reason as the dapp-initiated variant. |
| `rejectCrossDappBatch`        | Writes rejection to every entry — `txResult:{txId}` for plain entries, deduped `bundleStatuses` updates for bundle entries. Clears the batch. |
| `confirmCrossDappBatch`       | Encodes via ERC-7821, ships via Bankr API or EIP-7702 local signing. PK/SP EIP-7702 keeps native value in the inner calls but signs the outer EOA self-call with `value: 0x0`; Bankr keeps the summed outer value. Plain `eth_sendTransaction` entries receive the shared tx hash immediately; `wallet_sendCalls` bundle entries stay PENDING until the shared receipt is terminal, then transition to CONFIRMED/REVERTED once per bundle. Accepts UI-provided gas estimates and must stay extension-only so a content script cannot choose gas or fake source-bundle completion. |

`addToCrossDappBatch`, `addCallsToCrossDappBatch`, and `confirmCrossDappBatch` must resolve the original pinned account (`accountId` / `accountAddress` / `accountType`) directly. Never bind a pending request to the current active account, especially when `wallet_sendCalls.params.from` is omitted or the user switches accounts while the request is open.

**Why these MUST stay extension-only**: a content script that could call any of these would be able to (a) silently move a user's pending requests into a batch they cannot easily inspect, (b) reject other dapps' pending requests by spelling out the right `txId`s or `bundleId`s, or (c) flip a victim dapp's bundle status to CONFIRMED without an actual onchain transaction, tricking the dapp into believing a payment landed. The `txId`s and `bundleId`s are not secret, but the right to act on them belongs to the popup only.

`handleConfirmCrossDappBatch` follows the **session restoration pattern** for `getCachedApiKey()` (see "Handlers with Session Restoration" in `_docs/IMPLEMENTATION.md`), so it works under the "Never" auto-lock setting after a service worker restart.

### WalletConnect Handlers

WalletConnect lets dapps that do not discover WalletChan through ERC-6963 send requests through the WalletConnect relay instead of the injected provider. The relay itself is untrusted: every tx/signature request still becomes a normal pending request and must pass the same pinned-account confirmation flow as injected dapp requests.

| Handler | Effect | Guard |
| --- | --- | --- |
| `walletConnectGetSessions` | Extension UI reads active WalletConnect session summaries. No secrets; includes dapp metadata, approved chains, and approved accounts. | `wallet-ui` audience policy |
| `walletConnectPair` | Extension UI pairs with a `wc:` URI. The service worker auto-approves only for the current active signing account and visible chains. | `wallet-ui` audience policy |
| `walletConnectDisconnectSession` | Extension UI disconnects an active WalletConnect session by topic. | `wallet-ui` audience policy |
| `walletConnectSwitchChain` | Extension UI updates the shared WalletConnect active chain and emits `chainChanged` to active WC sessions that support the chain. | `wallet-ui` audience policy |

WalletConnect implementation lives in the `chrome/walletConnect/` audit domain,
not in `background.ts`. `client.ts` owns only SDK lifecycle/listeners;
`sessionProposal.ts` approves namespaces only for an active signing account;
`requestRouter.ts` claims and validates relay requests before dispatch;
`pendingRequests.ts`, `batchRequests.ts`, and `rpcRequests.ts` adapt requests to
the existing wallet boundaries. Approved accounts derive from the active
account at pairing time and its visible chains; Bankr accounts expose only
Bankr-supported chains.

Chainless `eip155` proposal namespaces are filled with that same visible chain set before approval, because some dapps request EVM methods without listing chains. If normalization still leaves no approvable namespace, the proposal is rejected rather than approved with an empty namespace. The rejection broadcast (`walletConnectProposalRejected`) contains only bounded/sanitized dapp metadata, capped requested chain IDs/methods, and known public chain metadata used to render the chain notice and prefill Add Chain; it contains no secrets or session request payloads. Unsafe peer URL/icon schemes and overlong metadata are discarded before storage or UI rendering.

`walletConnect/keepalive.ts` runs only while approved WalletConnect sessions exist. It sends periodic `*_batchFetchMessages` requests to the WalletConnect relay so the MV3 service worker stays awake and can receive relay requests without an open popup/sidepanel. The keepalive uses session topics and relay routing metadata only; it does not read cached passwords, API keys, private keys, seed phrases, or transaction payload secrets.

For `eth_sendTransaction`, the WC request is converted to a `PendingTxRequest` with `accountId` / `accountAddress` / `accountType` pinned through `pinnedTxRequest()`. For `personal_sign` / typed-data signatures, the request is converted to a `PendingSignatureRequest` through `pinnedSignatureRequest()`. Confirm-time signing still routes through `txHandlers.ts`, so Bankr, private-key, and seed-phrase accounts keep their existing password/session-restoration behavior. View-only impersonator accounts cannot sign.

For ERC-5792 `wallet_sendCalls`, the WC request reuses `batchTxHandlers.ts` and is converted to a `PendingBatchTxRequest` with the account authorized in the WalletConnect session passed explicitly into the batch handler. The pending request and bundle status pin exact `{ topic, requestId, method }` transport metadata, and the bundle status is scoped to the WalletConnect peer metadata, so another WC peer cannot query, confirm, or open a bundle it did not create.

Batch acknowledgement is part of the authorization boundary. Injected intake
owns the batch's first-action claim before its first async permission read and
publishes a durable acknowledgement only after queue persistence. The injected
page waits without an age-based timer; WalletConnect awaits queue persistence
before reading the same acknowledgement. Queue persistence revalidates the
exact tab/origin or live WalletConnect topic before and after its storage
writes.

Security rules:

- `tx.from` and signature signer params must match the account authorized in the WalletConnect session.
- `wallet_sendCalls.params.from` and per-call `from` fields must match the account authorized in the WalletConnect session.
- `eth_sign` and deprecated `eth_signTypedData` v1 are rejected, matching the injected-provider path.
- `eth_signTypedData_v3` / `_v4` run the same EIP-712 validation and sanitization as injected requests, including raw ERC-7710 `Delegation` rejection.
- ERC-7715 requests (`wallet_getSupportedExecutionPermissions`, `wallet_getGrantedExecutionPermissions`, `wallet_requestExecutionPermissions`) route through the stable `erc7715PermissionHandlers.ts` facade. Method dispatch/intake, account-scoped queries, onchain status, revoke prompt creation, and master-only confirmation live together in the `chrome/erc7715/` audit domain. Permission requests preflight local-signer account type, request shape, permission/rule allowlists through the stable `erc7715/registry.ts` facade (`permissionTypes.ts` → `ruleValidation.ts` → `permissionValidation.ts`), relaxed EVM address validation plus checksum normalization from `erc7715/address.ts`, WalletChan-owned caveat derivation through the stable `erc7715/caveats.ts` facade (`caveatDefinitions.ts` → `caveatEncoding.ts` → `caveatBuilder.ts`), `from`/selected-account consistency, supported chain/RPC availability, and live EIP-7702 delegation to `EIP_7702_DEFAULT_DELEGATE`. Pure validation, normalization, and caveat encoding cannot import account/session/Chrome/RPC state; `preflightEligibility.ts` is the stateful orchestration boundary and `preflightRpc.ts` owns only bounded public-chain reads. Injected requests resolve the sender tab account with `getTabAccount(tabId)` before preflight/listing; WalletConnect requests resolve the session-authorized account. `erc7715/confirmation.ts` signs only WalletChan-constructed ERC-7710 typed data after user confirmation and requires a live master/password-or-biometric session; an agent session cannot issue the reusable capability even when the prompt was queued under master. The auth epoch and live master type are re-checked synchronously at one atomic local-storage commit that writes `erc7715PermissionGrants`, removes the pending prompt, and publishes its success result. That commit is the grant linearization point, preventing both post-commit false failures and duplicate approval retries.
- ERC-7715 caveat generation follows the MetaMask DeleGator v1.3.0 standard shapes: native-token grants include `ExactCalldataEnforcer(0x)`, ERC-20 grants include `ValueLteEnforcer(0)`, standard grants include `NonceEnforcer(currentNonce)`, allowance grants use the relevant periodic enforcer with `periodDuration = uint256.max`, and the EIP-712 `Caveat` type signs only `enforcer` and `terms` while ABI context/revoke encoding retains `args`. Dapps cannot supply arbitrary caveat enforcer addresses through ERC-7715.
- If the user edits a request in the confirmation UI, `lib/erc7715PermissionEditing.ts` keeps fixed identity fields immutable (chain, account, delegate, permission type, token, adjustment policy). `permission.isAdjustmentAllowed` gates amount, periodic frequency, start time, stream rate / initial allowance / max allowance edits; streams still require expiry and `maxAmount > initialAmount`. Non-stream expiry can be added, removed, extended, or shortened even when permission terms are locked, matching MetaMask's confirmation behavior. Token-approval-revocation method flags remain immutable and only the required expiry can be adjusted. Confirmation then re-runs ERC-7715 preflight and recomputes caveats from the edited request before signing.
- The registry rejects ambiguous extras, unbounded non-stream amounts, periodic durations over ten years, streams without expiry, stream max caps that do not exceed initial allowance, token approval revocation without an expiry, token approval revocation without at least one enabled method, broad `permit2InvalidateNonces` revocation, malformed token addresses, expired/duplicate expiry rules, invalid start times, start times after expiry, and oversized/ambiguous justification metadata. Missing non-revocation `startTime` values are normalized to the preflight timestamp. Permit2 revocation primitives additionally require a WalletChan built-in chain with live code at the canonical Permit2 address on the configured RPC. `permission.justification` is display-only and normalized out of `permission.data` before caveat derivation.
- While a `wallet_requestExecutionPermissions` request is active, the injected provider, background router, and WalletConnect router block additional external dapp transaction/signature/batch/RPC proxy/capabilities/status/watch/add-chain/execution-permission requests with the MetaMask-style in-process error. The background/WC block is backed by every valid row in `pendingErc7715PermissionRequests`, not only process memory, so it survives MV3 service-worker restarts and fails closed until storage-backed lock state is loaded.
- The ERC-7715 enqueue path must synchronize `erc7715/requestLock.ts` from the saved pending-request list before releasing the in-memory request lock. Do not rely only on `chrome.storage.onChanged`; that event can arrive after the handler returns and briefly reopen external request processing.
- ERC-7715 approval/rejection/explicit-invalidation results are delivered through `erc7715PermissionResult:{id}` instead of long-lived `sendMessage` channels. Injected dapps create the request id in `inject.ts` and wait on that storage key without an age timer; WalletConnect stores kind `erc7715Permission` in `walletConnectPendingRequests`, commits the first terminal response before relay delivery, and replays only that result after relay/MV3 recovery.
- ERC-7715 grant management uses extension-only messages (`getErc7715PermissionGrantsForAccount`, `initiateErc7715PermissionRevoke`). They must not be forwarded from content scripts because grant records contain reusable signed delegation context. Active grant reads check `eth_getCode(account)`, `disabledDelegations(hash)`, and stored `NonceEnforcer` terms through the configured chain RPC, then locally mark grants revoked before returning them to Account Settings or dapps if the EOA is no longer delegated to WalletChan's default DeleGator, the delegation hash is disabled, or the nonce was invalidated. Any onchain status read failure fails closed. Onchain revoke validates account/grant ownership, canonical DelegationManager consistency, and the stored delegator before checking onchain status and queueing `disableDelegation(delegation)` through the normal transaction confirmation path; the pending tx carries only public display metadata plus `grantId`, while the reusable delegation context stays in the extension-only grant store. The receipt poller marks the grant locally revoked only after a successful receipt.
- WalletConnect ERC-7715 grants are scoped by session topic (`walletconnect:<topic>`), not self-reported peer URL. Peer URL/name/icon metadata is display-only and may be untrusted.
- Only a small allowlist of read-only RPC methods is proxied to the user's configured RPC URL. Raw transaction submission and debugging methods are not proxied, and privileged RPC fetches use `redirect: "error"` so an allowed endpoint cannot redirect onto private/loopback infrastructure.
- `walletConnectPendingRequests` contains only public request routing/JSON-RPC response metadata, never wallet secrets. Each remote `(topic, requestId)` is atomically claimed before any queue entry is created, preventing relay replays from signing/broadcasting twice. A terminal `txResult:{id}`, `sigResult:{id}`, `erc7715PermissionResult:{id}`, or immediate `wallet_sendCalls` bundle id is persisted before relay delivery; the route is cleared only after delivery succeeds or WalletKit confirms session termination. Manual disconnect gates and terminalizes the session's pending approvals before SDK disconnect, but retains any undelivered outbox entry until disconnect succeeds; remote `session_delete` performs the same cleanup at the confirmed termination boundary.
- `walletConnectChainId` contains only non-secret UI/session state. It is scoped to WalletConnect and does not overwrite injected-provider per-tab chain state.

### EIP-7702 Delegation Handlers (`delegation/`)

These are UI-only Smart Account management messages classified as `wallet-ui`:

| Handler | Effect |
| --- | --- |
| `getDelegationStatus` / `probeDelegateContract` | Reads onchain delegation and probes ERC-7821 support. Kept extension-only to avoid leaking account delegation state and custom-chain probing to webpages. |
| `initiateSetDelegation` / `initiateRevokeDelegation` | Enqueues a type-4 pending tx request that the user confirms through the normal transaction confirmation flow. Must stay extension-only so a webpage cannot queue smart-account Set/Revoke prompts. A custom/non-default Set requires a live master session both when queued and immediately before raw broadcast; canonical-default authorization remains routine agent-capable signing, and revocation remains agent-capable because it reduces authority. |

`delegationHandlers.ts`, `delegationStorage.ts`, and
`delegatedAuthorityPolicy.ts` are effect-free compatibility facades. The
implementation is split into status/probe, Set/Revoke intake, pure request
construction, durable queueing, authority policy, and storage modules so each
boundary can be audited independently. Custom Set requests capture the exact
master auth epoch before their ERC-7821 re-probe; queue persistence rechecks it
inside the wallet-secret operation lock and stores it on the pending request
before any UI notification. Canonical-default Set and revocation deliberately
omit that epoch because they are routine/reducing authority operations.

`setCustomDelegate` / `removeCustomDelegate` are `delegation/storage.ts`
helpers used
only by receipt reconciliation. They are deliberately not runtime message
routes: `customDelegates` is a UI mirror, and extension pages do not need a
general-purpose way to overwrite it.

Set/Revoke storage reconciliation must read `eth_getCode(EOA)` after any terminal receipt. Do not infer delegation state only from `receipt.status`: EIP-7702 authorization processing occurs before normal execution, so execution can revert while the EOA delegation still changed. If the `eth_getCode` read itself fails, leave the mirror unchanged; an RPC failure is not evidence that the EOA is undelegated.

The `customDelegates` mirror keeps its released nested record shape. All
read-modify-write mutations are linearized under `local:customDelegates` so
concurrent receipt reconciliation or account cleanup cannot drop another
account/chain update. Runtime execution still trusts onchain code and the
default-delegate registry, never this UI mirror.

### Token Metadata Handlers

`resolveTokenMetadata` and `lookupCustomToken` are gated by
the `wallet-ui` audience because they can include user-added custom-token
metadata from `customTokens`. `addCustomToken`, `updateCustomToken`, and
`removeCustomToken` are also extension-only so webpages cannot mutate the user's
manual token list. Content scripts may still call the narrower `fetchTokenInfo`
/ `fetchTokenLogo` helpers; those return public chain/token-list metadata only
and do not expose watched-asset custom-token records.

The stable root token modules are export-only facades over `chrome/tokens/`.
`customTokenStorage.ts` is the sole owner of the unchanged `customTokens` array
and its serialized read-modify-write lock. `tokenMetadata.ts` keeps custom-token
lookup opt-out explicit so the public logo route cannot expose watched-asset
metadata. NFT URI parsing and image-source sanitization are pure in
`nftMetadataPolicy.ts`; only `nftMetadata.ts` may fetch, and it revalidates each
manual redirect against the public-HTTPS policy, omits credentials/referrers,
times out after five seconds, and streams at most 256 KiB. SVG/HTML never
becomes a renderer image source. Calldata discovery is capped at 64 unique
ABI-padded addresses; failed Multicall3 preflight returns only that already
bounded list and never expands authority or performs a transaction.

### Network Metadata Handlers

`networksInfo` mutations are routed through `network/networkMutations.ts` in the service
worker and classified as `wallet-ui`. Popup/sidepanel pages mirror
`chrome.storage.sync.networksInfo` through `NetworksContext`; they must not
write full local snapshots back to storage. This prevents a stale long-lived
sidepanel from deleting a chain that was added by a dapp confirmation in the
background.

Each entry's required `rpcUrl` remains the only endpoint used at runtime.
`chrome.storage.local.networkRpcUrls` is separate Settings-only history keyed
by decimal chain ID. The service worker validates every member with the same
scheme, credential, private-network, length, and trusted-origin rules,
deduplicates the list, rejects more than ten endpoints, and limits optional
display names to 64 characters before storage. Released string-array records
remain read-compatible and are converted to `{ url, name? }` objects only on a
later successful save. Provider favicon lookup is derived only for public
domain RPCs; private, loopback, literal-IP, and reserved hostnames are never
sent to the external favicon service, and returned bytes cross the existing
background rasterization/cache boundary before renderer display.
Selecting a saved endpoint does not bypass chain-ID probing. Built-in-chain
selection/add/edit/remove actions promote the chosen endpoint immediately only
after the renderer probe and existing service-worker `updateNetwork` validation
succeed; the explicit warning override still uses that same route. Editing an
inactive saved endpoint changes history only. Custom-chain endpoint changes stay
staged until the full form is saved. A custom chain-ID change is duplicate-checked
and re-keys its bounded RPC history inside the same locked service-worker
mutation. Missing history resolves to the active endpoint and requires no eager
migration.

### Privileged Network and Remote-Image Boundaries

The extension has broad HTTP(S) host access, so background fetches must not
turn that privilege into a private-network proxy or an unbounded memory sink.

`network/safeRpcForwarding.ts` applies the following boundary to injected-provider and
WalletConnect RPC forwarding:

- Only the explicit public read/simulation method allowlist is accepted; raw
  transaction submission, signing, debug/admin, and stateful filter lifecycle
  methods are rejected.
- Injected requests must name an exact RPC URL already present in
  service-worker-owned `networksInfo`. WalletConnect resolves the same trusted
  chain configuration before calling the shared forwarding primitive.
- URLs must be HTTP(S), must not contain URL credentials, and are classified
  with `privateNetworkPolicy.ts`. Public sites cannot name literal/reserved
  loopback or private targets. Loopback dapps may reach loopback RPCs; a LAN
  dapp may reach only another port on its exact hostname, not a different
  private host. Literal IPv4, IPv6,
  IPv4-mapped IPv6 (including WHATWG's canonical two-hextet form), localhost,
  link-local, private, carrier-grade NAT, IPv4 documentation/benchmark,
  multicast, and reserved local hostname suffixes are covered by the
  classifier.
- Redirects are rejected. Requests are capped at 524,288 serialized
  characters, responses are streamed under an 8,000,000-byte ceiling, at most
  16 forwarded calls run concurrently, and each call has a 15-second timeout.
  Remote JSON-RPC error text is capped before it reaches the UI.

All other configured-RPC paths use `network/rpcClient.ts`. Its direct JSON-RPC
primitive consumes responses under a deadline and byte ceiling, rejects
redirects, omits cookies/referrers, bounds error text, and caps concurrency.
The shared viem transport also uses a private bounded fetch adapter: it pins
the validated endpoint against request-hook retargeting, accepts POST only,
caps serialized requests at 1 MB, streams responses under 8 MB, shares a
24-request concurrency ceiling, and enforces a 15-second default / 60-second
hard-maximum deadline in addition to the redirect and ambient-credential
policy. This covers simulation, balance, name-resolution, delegation, gas,
nonce, receipt, and local-signing clients. New public RPC configuration must
use HTTPS; explicit local/private Settings RPCs may use HTTP. A dapp-proposed
add-chain URL is checked against the trusted sender origin before persistence,
again before confirmation, and before the privileged chain-ID probe.

`network/boundedHttp.ts` is the secure-default boundary for fixed WalletChan,
Bankr, swap/bridge, portfolio, CoinGecko, labels, clear-signing, and ABI lookup
HTTP calls. It rejects redirects, cookies, and referrers and enforces one
deadline plus a caller-sized streaming byte cap. Signed sponsored-transfer
authorizations and Bankr API keys therefore cannot follow a backend redirect
to another origin.

Swap egress is isolated under `chrome/swap/`. `transport.ts` alone performs
fixed-proxy HTTP reads and retains the 2 MiB quote / 8 MiB catalog / 64 KiB
price ceilings plus bounded remote error text. `rpcClient.ts` alone resolves a
configured chain RPC through the shared bounded transport. ERC-20 and Permit2
read failures return zero as released UI fallback behavior; they cannot sign or
broadcast. `erc20.ts` and `permit2.ts` contain the only approval calldata
builders, with Permit2 amount clamped to `uint160` and expiry fixed to 30 days.
Token metadata/list/logo caches are non-secret, chain-and-address keyed, and
best-effort on write. The root `swapApi.ts` is an export-only facade, enforced
by architecture and behavior tests under `tests/swap/`.

Bankr remote authority is isolated under `chrome/bankr/`: `response.ts` is
pure bounded validation, `transport.ts` owns only fixed-origin bounded HTTP,
`signing.ts` locally recovers the exact personal/EIP-712 signer,
`submission.ts` owns the irreversible-start and ambiguous-outcome boundary,
and `jobs.ts` owns bounded polling. `credentialBinding.ts` hashes only
authenticated ciphertext metadata, while `pendingAuthorization.ts` performs
the final pinned account/transport/tag gate. The `chat/` subdomain keeps the
unchanged `chatHistory` repository separate from prompt egress and session
orchestration.

Remote navigation metadata is separate from image/network fetch policy.
`externalNavigation.ts` accepts public HTTPS only; Settings-owned custom
explorers may retain explicit loopback HTTP(S) for local development while
dapp proposals cannot. It rejects URL credentials,
private/LAN targets, unsafe schemes, and reserved test/onion suffixes. The
portfolio API normalizes DeFi `siteUrl` values before caching, the row repeats
the check for legacy cache entries, unsafe legacy explorer values are dropped
during chain normalization, stored notification links are revalidated when
clicked, and remotely returned chat URLs become links only after the same
public-HTTPS check. External `_blank` anchors/windows explicitly use
`noopener,noreferrer`.

Extension pages self-host Outfit, JetBrains Mono, and Anton through bundled
`@fontsource` assets. They must not add remote font stylesheets, preconnects,
or CSS imports: those disclose extension-page opens and violate the no-remote-
code/store-review boundary.

ENS/avatar/token-logo URLs are attacker-controlled display metadata.
The local-gateway ENS banner treats the mounted page the same way: its metadata
scraper forwards only a title and `http(s)` or `data:image/*` favicon URL, its
address field accepts only `.eth`, `.gwei`, or a raw 20-byte contract address,
and hosted-gateway navigation goes through the authorized
`ens-open-on-gateway` service-worker route. The manifest-facing
`ensBanner.ts` is initialization-only; parsing, transport, bookmark/gateway
actions, and closed-shadow rendering remain separate audit modules under
`ensBrowsing/banner/`. The banner does not fetch or evaluate page content.

`remoteImagePolicy.ts` and the `avatar/` audit domain behind the stable
`avatarImageCache.ts` facade therefore require public HTTPS on the default TLS
port with no URL credentials, reject reserved/private hosts through the same
IPv4/IPv6 classifier, and reject `.test`, `.invalid`, and `.onion`. Up to three
redirects are followed manually and every target is revalidated; fetches omit
credentials and referrers. Only explicit raster MIME types are accepted—SVG
and other rich document formats never cross the decoder boundary. The response
is streamed under a 2 MiB download ceiling, decoded to pixels, resized to at
most 128×128, re-encoded to WebP under 512 KiB, and only that inert data URL is
cached/rendered. At most two image fetches run concurrently in FIFO order and
same-URL work is single-flight. The renderer sanitizer separately accepts only
policy-compliant remote URLs or bounded base64 raster data URLs, never SVG data
URLs. Raw remote URLs remain inert in trusted renderers until those
background-reencoded bytes arrive. The reset-aware Chrome cache is the sole
image source: legacy DOM localStorage image/portfolio mirrors are purge-only,
persisted entries are revalidated, commits are locked and best-effort, and
reset/fresh onboarding abort plus epoch-invalidate old-wallet work. A storage
write that crosses the reset epoch removes its stale entry before returning.
NFT tokenURI metadata uses the same public-host/redirect rules, streams JSON
under 256 KiB, bounds inline data and display strings, and rejects SVG/HTML
image markup.

---

## EIP-712 Signature Request Validation

**Files**: stable facade `apps/extension/src/chrome/eip712Validator.ts`; pure
policy implementation `apps/extension/src/chrome/signatures/eip712/`
**Added**: v1.4.0

All `eth_signTypedData_v3` and `eth_signTypedData_v4` requests are validated before processing to prevent denial-of-service attacks from malicious dapps.

### Validation Rules

| Check               | Limit                                         | Purpose                                                 |
| ------------------- | --------------------------------------------- | ------------------------------------------------------- |
| Nesting depth       | 50 levels                                     | Prevent stack overflow and DoS from deeply nested types |
| Circular references | None allowed                                  | Prevent infinite recursion in type resolution           |
| Schema structure    | Must have domain, types, primaryType, message | EIP-712 conformance                                     |
| Type definitions    | All referenced types must exist               | Prevent undefined type errors                           |

### Attack Scenarios Blocked

1. **Deep nesting DoS**: 60,825 nested types attempting to crash extension
2. **Circular reference DoS**: Types referencing themselves causing infinite loops
3. **Malformed schemas**: Invalid JSON or missing required fields

### Validation Flow

```
handleSignatureRequest() → validateEIP712TypedData()
  ├─ Check method (only v3/v4)
  ├─ Parse typed data
  ├─ Validate schema structure
  ├─ Detect circular references (DFS)
  ├─ Check nesting depth
  └─ Validate type definitions
     ↓
if invalid: console.error() + return error to dapp + no popup
if valid: continue to normal flow
```

### Console Logging

Failed validations log to console for debugging:

```
[WalletChan] EIP-712 validation failed for https://malicious.site:
  Type 'Attack' exceeds maximum nesting depth of 50 (found 60825)
```

This helps developers identify malicious sites attempting attacks.

---

## SIWE Signature Request Validation

**Files**:

- `apps/extension/src/lib/siwe/*`
- `apps/extension/src/components/SiweMessageDisplay.tsx`
- `apps/extension/src/components/SiweValidationIssues.tsx`
- `apps/extension/src/chrome/signatures/confirmationPolicy.ts`
- `apps/extension/src/chrome/signatures/confirmationHandlers.ts`

All `personal_sign` messages that match the EIP-4361 SIWE header are parsed and
validated before signing. The popup shows a human-readable auth review, while
`signatures/confirmationPolicy.ts` repeats the same validation at confirm time
for Bankr, private-key, and seed-phrase accounts. The local and Bankr handlers
share that preflight rather than maintaining parallel security checks.

### Blocking Checks

| Check | Purpose |
| --- | --- |
| Required SIWE fields and field order | Prevent malformed auth messages from being presented as valid logins |
| Account address matches pinned signing account | Prevent signing a login for a different address |
| SIWE chain ID matches connected chain ID | Prevent chain-confusion login messages |
| SIWE domain matches the connected site origin | Prevent a site from requesting login to another domain |
| Expiration / not-before validity | Prevent expired or not-yet-valid login messages |

Warnings such as missing expiration, weak nonce, old issued-at time, insecure
HTTP URI, or non-checksummed address remain visible in the UI but do not block
signing unless they become validation errors.

Users can bypass SIWE validation errors only from the extension UI by opening
the sticky decision-bar warning popover and explicitly checking its
acknowledgement checkbox. This sends `allowUnsafeSiwe` on the extension-only
`confirmSignatureRequest` message and skips only the SIWE validation pass. The
stored pending request, pinned account binding, account type,
and dapp-supplied signer parameter checks still run and are not bypassable by
the SIWE override.

### Validation Flow

```
SignatureRequestConfirmation → analyzeSiweMessage()
  ├─ Display human-readable auth summary
  ├─ Show validation issues
  └─ Require the explicit warning checkbox before signing through errors

handleConfirmSignatureRequest*() → prepareSignatureConfirmation()
  ├─ Re-parse raw personal_sign message
  ├─ Bind to pinned account address, request origin, and request chain ID
  ├─ Reject signing on validation errors unless extension UI override is set
  └─ Revalidate account, origin/WalletConnect, and Bankr credential authority
     after signing and before releasing the signature capability
```

---

## Content Script Message Filtering

Injected account discovery is origin-gated. `eth_accounts` returns an empty
array unless `dappPermissions` contains the exact canonical origin attested by
Chrome's `MessageSender`. The first top-level `eth_requestAccounts` call creates
a persisted confirmation request; background ignores page-claimed origins,
rejects subframe requests, and stores title/favicon only as hostile display
metadata. Address updates always refresh the provider's private internal state,
but `accountsChanged` is emitted only to approved origins. Revocation emits
`accountsChanged([])` to matching open tabs.
Account removal performs that exact-origin revocation before deleting any
account mapped to a connected tab. Since the permission grant is origin-wide,
all open tabs at the affected origin are disconnected; no connected tab is
silently assigned or shown the wallet's next global fallback account. Pending
connection prompts tied to the removed account are terminalized with `4100`,
and connection approval shares the same account-binding lock as removal so it
cannot recreate the grant on the other side of deletion.

### Inpage-to-Background Messages (via provider/contentBridge)

Only the message types frozen in
`provider/contentBridge/messagePolicy.ts` are accepted from the webpage by the
thin `inject.ts` entrypoint:

| Inpage Message Type       | Background Message / Effect                                      | Purpose |
| ------------------------- | ---------------------------------------------------------------- | ------- |
| `i_sendTransaction`       | `sendTransaction`                                                | Transaction request (`from`, `to`, `data`, `value`, `chainId`) |
| `i_signatureRequest`      | `signatureRequest`                                               | Signature request (`method`, `params`, `chainId`) |
| `i_rpcRequest`            | `rpcRequest`                                                     | Allowlisted public read/simulation RPC call through the extension-selected RPC URL |
| `i_switchEthereumChain`   | Updates tab chain state; may send `dappChainSwitchNotification`  | Chain switch request (`chainId`) |
| `i_addEthereumChain`      | `addEthereumChain`                                               | User-confirmed chain add/switch request |
| `i_watchAsset`            | `watchAsset`                                                     | User-confirmed `wallet_watchAsset` request |
| `i_walletGetCapabilities` | `walletGetCapabilities`                                          | ERC-5792 capability query |
| `i_walletSendCalls`       | `walletSendCalls`                                                | ERC-5792 batch request |
| `i_walletGetCallsStatus`  | `walletGetCallsStatus`                                           | ERC-5792 bundle status query |
| `i_walletShowCallsStatus` | `walletShowCallsStatus`                                          | Opens WalletChan status UI for a bundle |
| `i_walletExecutionPermissions` | `walletExecutionPermissions`                                | ERC-7715 delegated-permission discovery, active-grant listing, and user-confirmed request route |

**Source validation**: `contentBridge/messagePolicy.ts` checks
`e.source === window` before dispatch.

After a supported `i_switchEthereumChain` request actually changes the tab's
chain, `inject.ts` sends the background-only `dappChainSwitchNotification`
message. That message carries only `chainId`/`chainName`; the background worker
resolves chain metadata from trusted storage, derives the dapp label from the
Chrome sender, rate-limits repeats per tab/origin/chain, and creates a browser
notification. It does not expose secrets or account data.

**Dapp RPC fast path**: `dapp/rpcForwarding.ts` runs entirely in the inpage
script and does not add any new content-script or background message type. It
observes page `fetch` calls to discover HTTP(S) JSON-RPC URLs, validates them
with `eth_chainId`, and forwards only a narrow allowlist of dapp-originated
read methods. Critical wallet data and operations (`wallet_*`, account/chain
state, signing, transaction submission, raw tx broadcast, gas estimation,
nonces, `eth_getCode`/delegation reads, stateful filters, and WalletChan's own
confirmation/simulation flows) must stay on extension-controlled RPC paths.

### Background-to-Content-Script Messages

Only these types are sent to content scripts (and thus forwarded to the webpage):

| Message Type | Data Sent                                    |
| ------------ | -------------------------------------------- |
| `setAddress` | address, displayAddress                      |
| `setChainId` | chainId                                      |
| `setAccount` | address, displayName, accountId, accountType |

**Rule**: Never send secrets (passwords, API keys, private keys) to content scripts. Any new background-to-content-script message type must be reviewed for data sensitivity.

**Whitelist enforcement**: `contentBridge/runtimeForwarding.ts` only exposes the
address, account, chain, and explicit permission-revocation events declared in
`messagePolicy.ts`; `getInfo` responds only to the requesting content-script
runtime channel. All other background broadcasts (e.g., `newPendingTxRequest`,
`accountsUpdated`, `txHistoryUpdated`) are **not** forwarded. Configured RPC
URLs are stripped from chain events. This prevents malicious dapps from
eavesdropping on wallet activity across other tabs.

### Sender Verification for Secret-Returning Handlers

Handlers that return secrets or generate sensitive material verify that the sender is a trusted WalletChan UI document (popup, sidepanel, full-screen UI, or onboarding) and not a content script or web-accessible ENS document:

| Handler            | Check                     |
| ------------------ | ------------------------- |
| `getCachedApiKey`  | `isTrustedWalletUiSender(sender)` |
| `revealPrivateKey` | `isTrustedWalletUiSender(sender)` |
| `revealSeedPhrase` | `isTrustedWalletUiSender(sender)` |
| `generateMnemonic` | `isTrustedWalletUiSender(sender)` |

`isTrustedWalletUiSender()` compares the exact extension scheme, host, and
pathname, and rejects non-top-level frames. Prefix checks are insufficient
because WalletChan intentionally exposes several ENS browsing pages as web
accessible resources.

---

## Storage Keys Reference

### chrome.storage.local (encrypted secrets)

| Key                        | Contains Secrets | Description                                             |
| -------------------------- | ---------------- | ------------------------------------------------------- |
| `encryptedApiKeyVault`     | Yes (encrypted)  | API key encrypted with vault key                        |
| `encryptedApiKey`          | Yes (encrypted)  | Legacy API key encrypted with password                  |
| `encryptedVaultKeyMaster`  | Yes (encrypted)  | Vault key encrypted with master password                |
| `encryptedVaultKeyAgent`   | Yes (encrypted)  | Vault key encrypted with agent password                 |
| `sessionEncKey`            | Yes (random key half) | AES key for native-session "Never" password restoration. The matching ciphertext is memory-backed in `chrome.storage.session`; fallback browsers never persist either secret half. |
| `passkeyUnlock`            | Yes (encrypted)  | V1 general-key wrapper or V2 purpose-separated general/mnemonic key wrappers |
| `pkVault`                  | Yes (encrypted)  | Private key vault with encrypted entries                |
| `agentPasswordEnabled`     | No               | Boolean flag                                            |
| `mnemonicVault`            | Yes (encrypted)  | V2 dedicated-key-encrypted phrases + master wrapper, or V1 PBKDF2-encrypted phrases |
| `seedGroups`               | No               | Seed group metadata (names, counts)                     |
| `accounts`                 | No               | Account metadata (addresses, names, types)              |
| `networkRpcUrls`           | No               | Bounded Settings-only RPC history keyed by chain ID. It never changes runtime routing until the selected endpoint is validated and promoted to `networksInfo[*].rpcUrl` through the service worker. |
| `onboardingInitialization` | No               | Temporary `{ version, id, startedAt }` transaction marker for one fresh-wallet setup. Missing is normal; unmarked authoritative key/account state fails closed, disposable residue is cleared before begin, and complete wallets cannot be rolled back because marker cleanup failed. |
| `pendingTxRequests`        | No               | Pending transaction queue                               |
| `pendingSignatureRequests` | No               | Pending signature queue                                 |
| `pendingErc7715PermissionRequests` | No        | Pending ERC-7715 delegated-permission prompts pinned to account/origin/chain. Contains requested public authority scope, not private keys. |
| `erc7715PermissionGrants`  | No               | ERC-7715 grant records with returned context and signed ERC-7710 delegation. This is reusable public authority material and must stay origin/account/chain scoped in all listing UI/API paths. |
| `dappPermissions`         | No               | Exact-origin grants allowing injected sites to read the current WalletChan account. Chrome-attested origin is authoritative; title/favicon are untrusted display metadata. |
| `pendingDappConnectionRequests` | No          | Short-lived top-level `eth_requestAccounts` confirmations. Contains origin/tab/frame and public site metadata only; results use `dappConnectionResult:{id}`. |
| `walletConnectPendingRequests` | No           | Bounded WalletConnect request claims/routes plus committed terminal JSON-RPC response metadata (`internal id → session topic/request id`). Never contains private keys, seed phrases, vault keys, or passwords. |
| `walletConnectChainId`    | No               | WalletConnect-specific active chain ID |
| `walletConnectStorageNamespace` | No          | WalletConnect SDK identity epoch. Reset rotates and retains it so a replacement wallet cannot reopen the previous SDK store. |
| `sponsoredTransferIntents` | Yes (encrypted payload) | Bounded ERC-3009 recovery records. The exact signed authorization/nonce is encrypted by the general vault key; unresolved and unacknowledged terminal records survive local-clock expiry until finalized Base state or trusted-UI acknowledgment resolves them. |
| `crossDappBatch`           | No               | User-assembled cross-dapp batch (Bankr or PK/SP EIP-7702). Single batch, locked to first entry's pinned account, `from`, and `chainId`. The original pending entries are removed when added; the dapp promises stay open until ship/reject and are resolved via `txResult:{txId}` or `bundleStatuses` fan-out. |
| `txResult:{txId}`          | No               | Transient tx result (written on confirm/reject, read+deleted by content script) |
| `sigResult:{sigId}`        | No               | Transient sig result (written on confirm/reject, read+deleted by content script) |
| `erc7715PermissionResult:{id}` | No           | Transient ERC-7715 approval result, read+deleted by the waiting injected content script or used by the WalletConnect result bridge |
| `rpcResult:{id}`           | No               | Transient RPC result (written after RPC call, read+deleted by content script)    |
| `txHistory`                | No               | Completed transaction log. Cross-dapp batch entries may include per-call `{ origin, favicon }` display metadata; no secrets. |
| `chatHistory`              | No               | Chat conversation history                               |
| `hiddenPortfolioTokens`    | No               | Global list of ERC-20 token keys the user hid from portfolio totals. Contains public token metadata only. |
| `portfolioHoldingsCache`   | No               | Best-effort reset-aware Holdings display snapshot (`tokens`, DeFi rows, totals, public token metadata, and RPC issue chain IDs). Optional and pruned; contains no credentials or signing material. Legacy DOM-localStorage mirrors are purged and never read. |
| `ensAvatarImageCache`      | No               | Best-effort reset-aware cache containing only validated background-decoded/re-encoded raster data URLs plus timing/size metadata; original remote image bytes are not stored. Reset/onboarding invalidates in-flight old-wallet writes. |
| `soundsEnabled`           | No               | Browser-local global interaction-sound preference. Missing values default to enabled; it does not affect authentication or signing behavior. |
| `cs:enabled`               | No               | Clear-signing descriptor fetch opt-out flag             |
| `cs:desc:{chainId}:{address}:{kind}:{selector\|format}` | No | Clear-signing descriptor cache; public metadata only, schema-versioned |

### chrome.storage.session (session-scoped, cleared on browser close)

| Key                        | Contains Secrets | Description                                                      |
| -------------------------- | ---------------- | ---------------------------------------------------------------- |
| `encryptedSessionPassword` | Yes (encrypted)  | Password for "Never" auto-lock restore (AES-GCM with random key), only with native memory-backed `storage.session` |
| `sessionId`                | No               | Session identifier (UUID)                                        |
| `sessionStartedAt`         | No               | Session timestamp (milliseconds since epoch)                     |
| `autoLockNever`            | No               | Boolean flag indicating "Never" auto-lock mode                   |
| `passwordType`             | No               | `"master" \| "agent"` - which password was used to unlock. Restored to maintain agent password access control guards after service worker restart (v1.3.0+) |

### chrome.storage.sync (synced, no secrets)

| Key                                                    | Description                          |
| ------------------------------------------------------ | ------------------------------------ |
| `address`                                              | Current wallet address               |
| `displayAddress`                                       | Display-friendly address             |
| `chainName`                                            | Active chain name                    |
| `networksInfo`                                         | Runtime active RPC plus hidden/custom metadata; service-worker-owned mutations |
| `activeAccountId`                                      | Active account ID                    |
| `autoLockTimeout`                                      | Auto-lock timeout (ms)               |
| `tabAccounts`                                          | Connected/pending-dapp-only per-tab account overrides |
| `sidePanelMode` / `isArcBrowser`                       | Active UI windowing settings         |
| `sidePanelVerified`                                    | Released legacy field; retained/reset for compatibility but not read by runtime windowing |
| `hidePortfolioValue`                                   | Boolean - hide/show token USD values |
| `unifyPortfolioBalances`                               | Non-secret boolean display preference; missing or malformed values default to unified balances |

---

## Manifest Security Surface

| Setting                    | Value                                                        | Security Note                                                                  |
| -------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| `manifest_version`         | 3                                                            | MV3 enforces CSP, no `eval()`, no remote code                                  |
| `permissions`              | `activeTab`, `storage`, `sidePanel`, `notifications`, `tabs`, `declarativeNetRequestWithHostAccess`, `unlimitedStorage` | No `webRequest`, no `debugger`; `unlimitedStorage` protects wallet-critical writes from optional cache growth |
| `host_permissions`         | `https://*/*`, `http://*/*`                                  | Broad, needed for content-script coverage and configured RPCs; egress is method/URL/origin/redirect/timeout/size/concurrency bounded |
| `content_scripts.matches`  | All URLs                                                     | Wallet must inject on all pages for dapp detection                             |
| `externally_connectable`   | Not defined                                                  | External websites cannot send messages to background                           |
| `web_accessible_resources` | Provider `inpage.js`; three packaged brand images; four exact ENS browsing HTML entrypoints in the Chrome manifest | The provider/assets are page-facing by design. ENS HTML is untrusted extension UI, exposes no JS bundle through WAR, and is authorized only for its exact message/page combinations; `isTrustedWalletUiSender()` never treats it as popup/onboarding UI. The Firefox manifest exposes only the provider/assets group. |
| `content_security_policy`  | MV3 default                                                  | No inline scripts, no `eval()`, no remote code                                 |

---

## Security Invariants

These must always hold true. Violations indicate a security bug.

1. **Stored private keys and mnemonics leave the service worker only through an explicit trusted-UI secret flow** - Persisted secrets are decrypted in `sessionCache.ts` / `mnemonicStorage.ts`, used for signing in `txHandlers.ts` / `localSigner.ts`, and never sent to content scripts or webpages. Password-gated, agent-blocked `revealPrivateKey` / `revealSeedPhrase` responses may return a stored secret only to an exact top-level WalletChan UI document. A newly generated or imported secret necessarily exists in that trusted renderer while the user records or reviews it; generated recovery material is staged there and is not persisted until the user acknowledges backup and explicitly saves it.
   Secret import/display controls disable spellcheck, autocorrect,
   capitalization, and autocomplete so pasted recovery material is not offered
   to browser or operating-system text services.
   Bankr API-key drafts are also cleared from renderer state on every manual,
   automatic, or externally broadcast lock, so a draft created under master
   authorization cannot reappear after an agent-password unlock.

2. **No secrets in console logs** - Never `console.log` passwords, API keys, private keys, or vault keys. Grep for `console.log` near sensitive variables when reviewing changes.

3. **Agent password blocks all account/secret modifications** - Every handler that modifies secrets or account structure checks `getPasswordType() === "agent"` and returns an error. The UI hides these options too, but backend enforcement is the true security boundary.

4. **Encryption uses fresh randomness** - Every encryption operation generates a new random salt and IV. Never reuse salt/IV pairs.

5. **Service worker suspend clears credentials** - `background/lifecycle/maintenance.ts`, registered by lifecycle composition, calls `clearInMemoryAuthCache()`, which clears the API key, password, private-key vault, general vault key, mnemonic key, password type, and session ID together.

6. **Timed auto-lock clears every in-memory credential** - All cached credential getters, including `getCachedVaultKey()`, `getCachedMnemonicKey()`, and `getPasswordType()`, enforce the configured timeout. Expiry clears the API key, password, private-key vault, both keys, and password type together.
   Missing or invalid settings resolve to the finite 15-minute default and are
   initialized on install/update. Only an exact stored `0` enables Never and
   persisted-session restoration, preserving deliberate legacy Never choices
   without treating absent/corrupt state as indefinite unlock.

7. **Session restore only works for "Never" auto-lock** - `tryRestoreSession()` checks `autoLockTimeout === 0` before attempting restoration.
   Password restoration additionally requires native memory-backed
   `chrome.storage.session` (available in WalletChan's supported Chrome and
   Firefox versions). The fallback for browsers/forks without it stores only
   non-secret state; old fallback password ciphertext/key halves are
   proactively removed and Never mode relocks after a worker restart.
   Native session envelopes are allocation-bounded before base64 decoding: the
   key and IV must be exactly 32 and 12 bytes, and the authenticated password
   ciphertext cannot exceed 1 MiB plus the AES-GCM tag. Malformed or torn
   records return a locked session; there is no permissive fallback.

7a. **Factor removal revokes restoration before commit** - Passkey and agent
   removal first prove master recovery, then remove the local `sessionEncKey`
   half before deleting the factor. Failure to revoke leaves the factor
   untouched. Once the factor commit succeeds, in-memory authority is cleared
   synchronously; failure to clear the remaining native ciphertext cannot
   restore a session because its key half is already gone. Password rotation
   changes the master wrapper and clears the agent wrapper atomically, so an
   old envelope is non-restorable even if post-commit residue cleanup fails.

8. **Content script only forwards whitelisted message types** - `inject.ts` only bridges the documented dapp-facing allowlist from page to background: transaction/signature requests, RPC proxy calls, chain add/switch/watch-asset prompts, and ERC-5792 capability/batch/status methods. In the reverse direction, only `setAddress`, `setChainId`, and `setAccount` are forwarded from background to the webpage.

9. **No `eval()` or dynamic code execution** - MV3 CSP prevents this, but also verify no `new Function()` or similar patterns exist.

10. **Secret-returning handlers verify sender origin** - Handlers like `getCachedApiKey`, `revealPrivateKey`, `revealSeedPhrase`, and `generateMnemonic` check `isTrustedWalletUiSender(sender)` to require top-level `index.html` / `onboarding.html`, not a content script or web-accessible ENS page.

10a. **Explicit master verification proves current recovery** - Key/phrase
    reveal and biometric setup do not accept wrapper decryption alone. The
    candidate general key must recover the current Bankr credential and every
    local account binding, and V2 mnemonic recovery/key-check verification must
    succeed. A validly encrypted replacement wrapper around an unrelated key
    therefore cannot authorize secrets already cached by a biometric session.

10b. **Plaintext reveal is linearized with auth teardown** -
    `secrets/revealHandlers.ts` (behind the stable
    `secretRevealHandlers.ts` facade) captures the current authentication epoch before
    explicit master verification, then owns the wallet-secret operation lock
    through the final session/epoch recheck, decryption, and synchronous
    `sendResponse` invocation. A manual/automatic lock, password rotation,
    factor removal, or reset that wins first yields no key or phrase; if reveal
    wins first, its response is emitted before the queued teardown completes.
    Passkey password preflight uses the same capture-before-verify rule so a
    concurrent lock cannot be adopted as a fresh setup epoch.

11. **Password change proves recovery before clearing factors, then writes atomically** - `handleChangePassword` re-verifies the explicit master password. It requires the unwrapped general key to be exactly 32 bytes, recover a non-empty stored Bankr credential, decrypt every `pkVault` entry, and reproduce every current private-key/seed account address. For V2 it also unwraps the mnemonic key through the master wrapper, validates every BIP39 phrase and seed-group record, and re-derives every seed-account address. Only then does it prepare new wrappers, finish residual legacy API/`pkVault` migrations, and clear agent/passkey wrappers in one `chrome.storage.local.set()`. A corrupt or mismatched-but-decryptable wrapper therefore preserves the old password and passkey instead of destroying the last working recovery factor. V1 phrases are re-encrypted in memory; current general-vault and V2 mnemonic ciphertext remain unchanged.

11a. **The released private-key vault is bounded without a format migration** -
    `vault/recordCodec.ts` rejects unknown versions, malformed AES-GCM fields,
    more than 10,000 entries, and IDs longer than 512 characters before
    cryptographic work. Structurally valid V1 duplicate IDs remain readable to
    avoid locking out an existing race-affected profile, but every save,
    add/remove, and password/vault-key migration preparation rejects them with
    zero writes. Frozen released V1 ciphertext remains byte-for-byte unchanged.

12. **Duplicate-only seed imports do not persist secrets** - `addSeedPhraseGroup` validates that at least one selected derivation index can be imported or converted before creating `seedGroups` metadata or writing the encrypted mnemonic to `mnemonicVault`.

12a. **Seed persistence cannot silently generate recovery material** - The
    extension-only `generateMnemonic` response is staged in renderer memory and
    shown for backup first. `addSeedPhraseGroup` requires that phrase as input;
    a missing phrase fails instead of creating a persisted, unacknowledged
    recovery secret.

12b. **Fresh onboarding never guesses that recovery material is disposable** -
    `onboarding/state.ts` owns the frozen marker codec, authoritative-data
    classification, completeness proof, and rollback cleanup;
    `onboarding/lifecycle.ts` owns marker transitions without cryptography; and
    `onboarding/credential.ts` owns only the marker-bound first encrypted
    credential commit. `onboardingInitialization.ts` is an export-only facade.
    Credentials, general/agent/passkey wrappers, PK/mnemonic vaults, account
    rows, and seed-group metadata are the authoritative unmarked-state boundary.
    Any such partial state is preserved and requires explicit recovery/reset.
    With no authoritative state, begin clears stale grants, pending/result
    routes, wallet-scoped caches, session recovery, and account mirrors, then
    tears down WalletConnect sessions/pairings and rotates the SDK namespace
    before writing the setup marker. A failed namespace cutover writes no marker
    or credential, and harmless ENS/avatar preview caches cannot block setup.

12c. **Legacy account migration is linearizable** - `onInstalled` and the
    renderer fallback share the wallet secret-operation lock and re-read inside
    it before creating the v0.x Bankr account. Only one generated account ID can
    commit. If an older build already left a stale or missing `activeAccountId`, active
    account resolution repairs it to the first intact account while preserving
    every valid Bankr/private-key/seed selection. Malformed legacy EVM addresses
    leave the encrypted credential untouched and create no account row.

13. **Signing confirmation preserves explicit user control** -
    `handleConfirmTransaction`, `handleConfirmTransactionAsync`, and
    `transactions/localConfirmation.ts:handleConfirmTransactionAsyncPK` do not
    reject a transaction because of request age. Signature confirmation,
    ERC-5792 Bankr/PK/seed confirmation, and cross-dapp batch confirmation apply
    the same rule. Injected transaction/signature/batch result listeners are
    unbounded, and periodic maintenance does not sweep `pendingTxRequests`,
    `pendingSignatureRequests`, or `pendingBatchTxRequests`. WalletConnect keeps
    unresolved transaction/signature routes without an age limit. Prompts
    remain reviewable until confirm, reject, authorization/session
    cancellation, account removal, or reset resolves them.
    The local handler still resolves only the account
    pinned at intake, verifies `tx.from`, restores the PK/seed key through the
    existing master/agent/Never-session paths, removes the prompt, revalidates
    live request authority, and transfers reset exclusion to an effect lease.
    `transactions/localExecution.ts` signs once and rechecks the exact account,
    dapp/WalletConnect authority, and any persistent EIP-7702 master epoch in
    `beforeBroadcast`, immediately before signed bytes cross the RPC boundary.
    A preparation failure releases the lease; a failure after that boundary
    remains fail-closed because the broadcast outcome may be ambiguous.

14. **Pending requests resolve first-action-wins** -
    `requests/pendingRequestResolution.ts` synchronously claims a transaction,
    signature, ERC-5792 batch, dapp connection queue, or cross-dapp batch before
    deferring any asynchronous work. Confirm and reject share the claim across
    popup/side-panel/full-page surfaces and across Bankr, private-key,
    seed-phrase, and legacy transaction routes. A terminal resolver removes the
    durable pending item before releasing its in-memory claim; every late
    reject/confirm checks for that tombstone and cannot overwrite the terminal
    result. Recoverable pre-effect failures remain pending and may retry.
    Editing/splitting shares that namespace, and a move into the cross-dapp
    batch claims both the source and destination atomically so it cannot race a
    direct submission.
    Unexpected exceptions retain the claim fail-closed because an external
    signer or RPC may have accepted an operation even when its response was
    lost. `processingTxIds` and `processingBundleIds` remain secondary guards,
    not the resolution boundary. No user-review prompt has periodic age-based
    expiry: transactions, signatures, ERC-5792 batches, cross-dapp batches,
    dapp connections, add-chain prompts, watch-asset prompts, and ERC-7715
    permission requests remain pending for the user's decision. Only
    pre-prompt transport claims and already-terminal response records retain
    bounded cleanup.
    Background transaction/batch processors and signature signers hold an
    effect lease after durable removal through their last-safe-point transport
    authorization check. The lease is released for provably pre-publication
    failures and definitive transport responses, but retained fail-closed when
    a signer or RPC response is lost after publication may have begun. Wallet
    reset owns a mutually exclusive global barrier
    before authentication or destructive storage awaits and returns a visible
    conflict instead of racing any active effect. Direct internal swap/bridge,
    atomic EIP-7702 swap, and sponsored-transfer signing/submission use the same
    barrier; fire-and-forget internal processors transfer ownership to an
    effect lease before their router claim is released.
    External pending records must retain Chrome-attested injected provenance,
    exact WalletConnect routing metadata, or an explicit service-worker-only
    `trustedInternal` marker; missing legacy provenance fails closed. Moved
    cross-dapp entries preserve that metadata, are cancelled by exact origin or
    session topic, and collectively commit captured revocation/termination
    epochs synchronously before submission so revoking source A while source B
    is still validating cannot leak A into the batch effect.

14a. **Bankr identity cannot drift after review** - A Bankr prompt stores a
    non-secret hash of the current encrypted API-key ciphertext generation.
    Final authorization requires the same generation for injected,
    WalletConnect, internal, and cross-dapp paths; old tagless Bankr prompts
    fail closed. Credential/address changes are verified by locally recovering
    a harmless personal-sign challenge, then written atomically. The extension
    permits only one newly added Bankr row because the key is wallet-wide;
    legacy multi-row profiles remain readable, while each submit preflight
    proves the key controls the pinned row before `/wallet/submit` is invoked.
    After that challenge, submit holds the wallet-secret operation lock,
    rechecks account + transport + credential generation, and starts fetch
    before releasing the lock. Credential rotation during the challenge cannot
    pass. Signatures are rechecked after signing and discarded if authority
    changed before release.

14b. **Local RPC broadcasts are authorization- and ambiguity-safe** - PK and
    seed transactions are prepared and signed once, then derive their hash
    locally from the serialized bytes. Immediately before the first raw RPC
    send, an after-sign hook re-resolves the pinned account and performs the
    final injected/WalletConnect authorization check (or the cross-dapp epoch
    commit) before beginning the effect. Revocation, navigation, disconnect,
    account removal, or reset during slow preparation therefore prevents the
    signed bytes from leaving the service worker. The wallet-secret operation
    lock spans preparation, final validation, and raw send, excluding account
    removal/conversion and auth-session mutations from that last boundary.
    Sync-send fallback retries
    only the identical serialized bytes. Once any raw send is attempted, a
    timeout or disconnect is never treated as proof of failure: tx history
    retains the deterministic hash with `broadcastUncertain`, receipt polling
    does not mark repeated unobserved reads as dropped, and ordered batch/swap/
    force-inclusion paths stop their higher-nonce tail. This avoids duplicate
    execution through a user retry while still allowing eventual receipt
    reconciliation.

    The force-inclusion audit domain keeps these boundaries independently
    reviewable: `singleLocal.ts` owns the final account/request check and
    sign-once broadcast; `batchLocalBroadcast.ts` owns sequential nonce order
    and tail halting; `singleOutcome.ts` and `batchLocalReceipts.ts` own durable
    ambiguous/pending recovery; and `receiptFinalizer.ts` owns the rule that an
    unobserved ambiguous hash is not proof of a dropped transaction. Stable
    `single.ts`, `batch.ts`, and `receiptPoller.ts` paths are export-only
    facades, so callers cannot bypass those focused implementations.

14c. **Remote signer responses are bounded and proven** - Bankr sign, submit,
    and job responses have deadlines and streamed byte limits. User-facing
    remote error text is control-character stripped and capped at 1,000
    characters. Personal-sign and typed-data signatures are locally recovered;
    submit responses must carry the reviewed signer, chain, and a valid hash.
    The effect guard becomes ambiguous only immediately before the irreversible
    submit fetch. Abort/timeouts or unprovable post-submit responses retain the
    lease and surface an outcome-unknown warning rather than a safe-to-retry
    cancellation message; HTTP 408/409/425/429 and 5xx are classified the same
    way. Bankr requests
    reject redirects to keep `X-API-Key` on the fixed API origin. Chat prompt
    submission also caps the prompt/body and validates its job ID. Sponsored-
    transfer relayer/premium responses use the same bounded-read and strict-
    schema rules.

14d. **Sponsored ERC-3009 ambiguity never creates a second spend** - Before
    the relay request starts, the exact nonce/signature payload is encrypted
    with the general vault key and committed to bounded
    `sponsoredTransferIntents` storage. An ambiguous timeout/disconnect retains
    that record without re-POSTing, signing another authorization, or exposing
    the normal gas-paid fallback. Status resolution requires two fixed Base
    RPCs to agree on USDC `authorizationState` at their exact finalized blocks;
    local wall time, RPC disagreement, and malformed storage all fail closed.
    Submitted/consumed results remain semantic dedupe markers until the trusted
    renderer acknowledges their stored intent ID. Account removal and reset
    share the sponsored-operation boundary and are blocked while any such
    record remains.

15. **RPC proxy restricts URL sources and methods** - `handleSafeRpcRequest` only accepts extension-configured RPC URLs and an explicit public read/simulation method allowlist. Signing, transaction/raw submission, debug/admin, and stateful filter-lifecycle methods are rejected in both the provider and service worker. A 15-second timeout limits slow endpoints. The inpage dapp-RPC fast path remains narrower: it only uses HTTP(S) JSON-RPC URLs discovered from the page itself, validates the chain with `eth_chainId`, forwards allowlisted non-critical reads, and falls back to the extension RPC on error or timeout.

16. **Injected signing intake requires a connected origin** - Before `sendTransaction` or `signatureRequest` creates pending state, `dapp/requestPolicy.ts` requires a top-level content-script sender, verifies that the sender frame still matches the current tab origin, canonicalizes the Chrome-attested origin, and checks an exact `dappPermissions` grant. Page-provided origins never authorize a request; failures return code `4100` through `txResult:*` / `sigResult:*`.

17. **Input length validation on user-facing strings** - Display names and group names are capped at 100 characters to prevent storage bloat from malformed inputs. Unknown message types are logged with `console.warn` for debuggability.

18. **Non-critical caches are fail-open** - Metadata/image caches (`tokenInfo:*`, `tokenLogo:*`, `ethShLabels:*`, `swapTokenList:*`, `cs:desc:*`, CoinGecko caches, `portfolioHoldingsCache`, and `ensAvatarImageCache`) must never block wallet-critical storage writes. Cache writes are best-effort and expired entries are pruned by `storage/cachePruner.ts` through the stable root facade.

---

## Pre-Commit Security Checklist

When reviewing or making changes to extension code, verify the following:

### If you added/modified a background message route:

- [ ] Does the handler touch secrets (API keys, passwords, private keys, vault keys)?
- [ ] If it modifies secrets or accounts, does it check `getPasswordType() === "agent"` and block?
- [ ] Does the handler return secrets in the response? If so, is `isTrustedWalletUiSender(sender)` checked to prevent content scripts and web-accessible extension pages from requesting secrets?
- [ ] Could a compromised content script abuse this handler? Consider what happens if arbitrary messages are sent from a web page context.

### If you modified crypto, encryption, or storage:

- [ ] Are new salt and IV generated for each encryption operation?
- [ ] Is PBKDF2 iteration count still 600,000?
- [ ] Did you update BOTH read AND write paths for any changed storage keys? (Common bug: updating reads but forgetting writes in other handlers)
- [ ] Grep for the storage key name across all files to find every touchpoint.
- [ ] Do persisted crypto codecs reject unknown versions, malformed field
      shapes, oversized records, and ambiguous IDs before any write/migration?

### If you modified content scripts or inpage scripts:

- [ ] Does `inject.ts` still only forward the whitelisted message types?
- [ ] Are any new messages being sent from background to content scripts? Do they contain sensitive data?
- [ ] Is `e.source === window` still checked before forwarding messages?

### If you modified session/cache logic:

- [ ] Is auto-lock still enforced (cache expiry checked in getters)?
- [ ] Does opening/reopening popup or sidepanel after timeout keep the wallet locked instead of reviving expired caches?
- [ ] Does the `suspend` event still clear all caches?
- [ ] Does manual lock (`lockWallet`) still clear all caches and restorable session storage?
- [ ] Does manual lock acquire the wallet-secret operation lock before clearing cached vault/mnemonic keys?
- [ ] Does session restore still require `autoLockTimeout === 0`?
- [ ] Does factor removal revoke the local Never-session recovery half before
      its factor commit, preserving the factor if revocation fails?
- [ ] Do capability-only/view-only sessions require both an expiry-checked
      vault key and password type rather than accepting either partial alone?

### If you added a new message handler that uses getCachedPassword() or getCachedApiKey():

- [ ] Does the handler include session restoration logic for "Never" auto-lock mode?
- [ ] Pattern: if credentials are null, check `autoLockTimeout === 0`, then call `tryRestoreSession(handleUnlockWallet)`
- [ ] Is the handler added to the "Handlers with Session Restoration" table in IMPLEMENTATION.md?
- [ ] Without this, the handler will fail after service worker restarts when auto-lock is "Never"

### If you added new storage keys:

- [ ] Is sensitive data encrypted before storage?
- [ ] Is the key documented in the Storage Keys Reference above?
- [ ] Is `chrome.storage.sync` only used for non-sensitive data?

### General checks:

- [ ] New service-worker logic lives in its owning `src/chrome/<domain>/`
      folder, not as another flat root-prefixed file. Any root exception is an
      entrypoint, policy-free compatibility facade, or documented shared primitive.
- [ ] The domain `README.md`, `_docs/IMPLEMENTATION.md`, and mirrored
      `tests/<domain>/README.md` still describe the actual ownership and effect flow.
- [ ] New or modified implementation files remain below the ~400-line audit
      ceiling; transitional composition-root size budgets did not increase.
- [ ] Compatibility facades preserve exact exports and contain no storage,
      authorization, cryptography, network effects, or business policy.
- [ ] Architecture tests cover forbidden dependency direction, facade identity,
      and size budgets for newly extracted modules.
- [ ] No `console.log` of sensitive data (passwords, keys, secrets)
- [ ] No `eval()`, `new Function()`, or dynamic code execution
- [ ] No hardcoded secrets, API keys, or credentials
- [ ] Build passes: `pnpm build:extension`

---

## Files to Audit by Category

Quick reference for which files to examine based on what area of security you're reviewing.

### Credential lifecycle (storage, caching, expiry)

- `sessionCache.ts` - Export-only stable compatibility facade
- `session/inMemoryCache.ts` - Decrypted capability state and expiry timestamps
- `session/autoLockPolicy.ts` - Timeout normalization and synced setting cache
- `session/cacheAccess.ts` - Expiry-aware capability selectors and wallet predicates
- `session/teardown.ts` - All-or-nothing memory and persisted-session clearing
- `session/timeoutTransitions.ts` - Finite default and serialized timed/Never transitions
- `session/restoration.ts` - Authoritative Never restore, password-type binding, and race rechecks
- `session/persistence.ts` - Native Never-session encrypted password envelope
- `session/storage.ts` - Cross-browser native/fallback storage adapter
- `crypto.ts`, `cryptoUtils.ts` - Stable compatibility facades
- `cryptography/` - Released envelope, bounded codecs, PBKDF2 policy,
  password/vault-key AES-GCM, and credential lookup ownership
- `vaultCrypto.ts` - Stable private-key vault facade
- `vault/entryCrypto.ts` - Released password/vault-key entry transforms
- `vault/accountIntegrity.ts` - Local key/account binding proof
- `vault/generalIntegrity.ts` - Master recovery proof across API/local keys
- `vault/recordCodec.ts` - Bounded released-V1 decoder and unique-ID mutation gate
- `vault/repository.ts` - Exact `pkVault` V1 storage authority
- `vault/operations.ts` - Serialized mutations, hydration, and migration prep

### Access control (agent vs master password)

- `auth/walletUnlock.ts` / `auth/sessionHydration.ts` - Unlock and complete cache hydration
- `auth/masterPasswordVerification.ts` - Side-effect-free explicit master proof
- `secrets/masterAuthorization.ts` / `secrets/revealHandlers.ts` - Exact
  epoch/live-master authorization and lock-held plaintext release
- `authHandlers.ts` - Agent guards and credential/password mutations
- `background/accountManagementRouter.ts` - Agent/master guards on account and seed mutations/removal
- `sessionCache.ts` - Stable export-only password-type compatibility API
- `session/restoration.ts` - Persisted agent/master binding and successful-restore auth-epoch rotation
- `session/inMemoryCache.ts` - Password-type state and expiry enforcement

### Message passing (what crosses trust boundaries)

- `inject.ts` + `provider/contentBridge/` - Thin content-script entrypoint,
  exact message allowlists, request adapters, and privacy-bounded reverse events
- `impersonator.ts` + `provider/inpage/` - Thin inpage entrypoint, EIP-1193
  method routing, result correlation, EIP-6963, and legacy `window.ethereum`
- `background.ts` - Five-line MV3 bootstrap invocation only
- `background/bootstrap.ts` - Route/pipeline/lifecycle composition order
- `background/messagePipeline.ts` - ENS-first audience/provider gates and exact route order
- `background/composition/` - Audit-sized route-family dependencies and lifecycle registration; see its README
- `background/authRouter.ts` - Wallet-UI auth/session response and channel-lifetime contracts
- `background/bankrCredentialRouter.ts` - Remote-signer proof, master-auth epoch, atomic account/credential commit, Never restoration, and agent plaintext block
- `background/onboardingRouter.ts` - Fresh-wallet initialization ID normalization, serialized transport, rollback/completion response contracts, and injected wallet-identity retirement
- `background/accountStateRouter.ts` - Non-secret account reads, ordering, display names, and global/per-tab selection transport; secret mutation routes are intentionally excluded
- `background/accountManagementRouter.ts` - Master-gated legacy migration, all account/seed creation paths, Never-session private-key import recovery, and sponsored/dapp-safe removal ordering
- `background/secretManagementRouter.ts` - Direct trusted-sender plaintext release plus pinned signature and ERC-7715 confirmation/rejection channel contracts
- `background/batchRequestRouter.ts` - Mixed-audience ERC-5792 capability/send/status transport and first-action-gated trusted-UI confirm/reject/edit/split decisions
- `background/delegationRouter.ts` - Trusted-UI EIP-7702 status/probe/set/revoke transport; domain handlers retain authorization and transaction preparation
- `background/crossDappBatchRouter.ts` - Source-plus-active lease fan-in and active-batch edit/reject/confirm transport
- `background/settingsRouter.ts` - Trusted-UI network registry and popup/sidepanel transport; provider add-chain prompts remain on the provider-aware boundary
- `background/dappPermissionRouter.ts` - Mixed-audience dapp account exposure, exact-sender durable request intake, and trusted-UI connection/permission decisions
- `background/providerRpcRouter.ts` - Connected-origin authorization and durable bounded read-only RPC results
- `background/providerIngress.ts` - Exact-sender origin resolution, durable provider rejection, and ERC-7715 ingress blocking
- `background/signatureValidation.ts` - Deprecated-method rejection plus bounded EIP-712 validation/sanitization before intake
- `background/chainSwitchNotification.ts` - Validated chain-switch portfolio signal, cooldown, and safe notification icon handling
- `background/walletConnectSessionRouter.ts` - Trusted-UI WalletConnect list/pair/disconnect/chain-selection transport with injected SDK handlers
- `background/watchAssetRouter.ts` - Mixed-audience EIP-747 intake/read/confirm/reject transport with durable result and token-storage ordering
- `background/chainPromptRouter.ts` - Mixed-audience EIP-3085 intake/read/confirm/reject and connected-site chain-notice transport
- `background/signingRequestRouter.ts` - Post-gate provider tx/signature intake and trusted-UI pending-request reads/decisions; domain handlers retain authorization, signing, and durable publication
- `background/transactionExecutionRouter.ts` - First-action claimed immediate/background Bankr and local PK/seed confirmations plus non-signing internal transfer prompt intake
- `background/swapExecutionRouter.ts` - Reset-barrier-protected account-bound direct, Bankr-batch, and local-atomic swap execution transport
- `background/sponsoredTransferRouter.ts` - Reset-barrier-protected submission plus fail-closed unresolved status and retryable acknowledgement transport
- `background/internalOperationBarrier.ts` - Unique `internalOperation` confirmation claims that expose independent swap/relayer effects to the global reset barrier
- `background/transactionStatusRouter.ts` - Trusted-UI transaction history, processing, failed-result, nonce-cache, enrichment, and receipt-status transport
- `background/swapBridgeDataRouter.ts` - Trusted-UI swap/bridge quote, status, chain, and token-catalog transport
- `background/tokenDataRouter.ts` - Trusted-UI token metadata/CRUD/price/image/allowance/balance transport with exact-sender avatar defense
- `background/resetRouter.ts` - Synchronous pending-resolution barrier, restored master proof, sponsored-intent guard, and ordered destructive reset
- `background/lifecycle/` - Focused Chrome callbacks and immediate startup effects
- `walletConnect/` - WalletConnect relay audit domain: SDK lifecycle, proposal policy, claimed request dispatch, pinned confirmation adapters, durable terminal outbox, active-session keepalive, and replacement-wallet namespace teardown; see its `README.md`

### Transaction security

- `txHandlers.ts` - Implementation-free public compatibility facade
- `transactions/bankrPolicy.ts`, `bankrSession.ts`, `bankrConfirmation.ts`,
  and `bankrProcessing.ts` - pinned Bankr policy, credential restoration,
  prompt/effect ownership, and outcome publication
- `transactions/swaps/` - account/chain-locked direct, Bankr batch, and
  PK/seed atomic-7702 swap orchestration with ordered ambiguity stops
- `transactions/localConfirmation.ts` and `localExecution.ts` - pinned local
  confirmation, key recovery, sign-once execution, and final authority gate
- `localSigner.ts` - Private key signing (viem)
- `bankr/transport.ts`, `bankr/signing.ts`, `bankr/submission.ts`, and
  `bankr/jobs.ts` - API key sent only to fixed Bankr backend endpoints
- `requests/pendingTxStorage.ts` - Pending transaction persistence
- `sponsoredTransfers/authorization.ts`, `intentStorage.ts`, `submission.ts`,
  and `reconciliation.ts` - ERC-3009 account-pinned signing, encrypted retry
  state, sole relayer submission, and finalized ambiguous-outcome recovery
- `accounts/localEffectBoundary.ts` / `erc7715/grantBoundary.ts` - Final
  account binding before irreversible local effects or delegated grant commits
- `swap/transport.ts`, `quotes.ts`, `rpcClient.ts`, `erc20.ts`, and `permit2.ts`
  - bounded quote/RPC reads and pure approval calldata construction
- `tokens/customTokenStorage.ts`, `tokenMetadata.ts`, `nftMetadataPolicy.ts`,
  `nftMetadata.ts`, `calldataAddressCandidates.ts`, and
  `erc20CandidatePreflight.ts` - custom-token privacy/storage, remote metadata,
  and bounded simulation candidate discovery

### Extension permissions

- `manifest.json` - Permissions, host permissions, CSP, externally_connectable

---

## Known Accepted Risks

These are security characteristics that have been reviewed and accepted:

1. **Native "Never" sessions retain a recoverable encrypted password.** The
   ciphertext is in memory-backed `chrome.storage.session` and its random AES
   key is in local extension storage. This survives MV3 service-worker
   suspension but not browser closure because the ciphertext half disappears.
   Browsers without native session storage do not persist either recovery
   half. If the live extension service-worker context is compromised, its
   in-memory credentials are already exposed.

2. **No rate limiting on local unlock attempts.** PBKDF2-SHA256 with 600,000
   iterations slows each guess but does not make a weak password safe against
   an attacker who copies the encrypted profile and guesses offline. New
   passwords use the current minimum-length/common-password policy; existing
   shorter legacy passwords remain accepted for unlock so an upgrade cannot
   strand users. Users with legacy weak passwords should rotate them.

3. **`getCachedApiKey` returns plaintext API key** to the extension UI. This is necessary for displaying it in settings and for the UI to function. The UI is same-origin with the background worker.

4. **Content script runs on all websites**. Required for wallet provider injection. The content script only bridges specific message types and does not expose any secrets.

5. **RPC proxy in background (`rpcRequest` handler)** accepts allowlisted public
   read/simulation methods against extension-configured RPC URLs. This bypasses
   page CSP for legitimate reads. The boundary rejects redirects and
   literal/reserved private-network targets according to caller origin, and
   enforces request/response/concurrency/15-second limits. Loopback requires a
   loopback caller and LAN targets require the caller's exact hostname. The
   background worker explicitly omits credentials and referrers.

6. **Console logging of migration events and decryption operations** in `auth/legacyVaultKeyMigration.ts`, `auth/sessionHydration.ts`, and `session/restoration.ts`. Logs include timing information ("API key migration completed", "Private key migration completed", "Session restored after service worker restart") but never log the actual secrets (keys, passwords). Acceptable because: (a) Chrome DevTools requires explicit user action to open, (b) logs provide critical debugging info for migration and session restore flows, (c) industry standard practice (MetaMask logs extensively), (d) no secrets are exposed in log messages.

7. **Private-network classification is hostname-based.** Browser `fetch()` does
   not expose the selected socket address, so the service worker can reject
   literal/reserved IPv4/IPv6 hostnames and redirects but cannot independently
   pin DNS resolution against rebinding. Remote images require HTTPS, omit
   credentials/referrers, accept only bounded raster responses, and never
   expose raw response text. RPC forwarding accepts only a URL already present
   in extension-owned network configuration; users should not add untrusted
   custom RPC hosts.

8. **Pre-hardening public-HTTP RPC entries remain readable.** New public RPC
   additions and edits require HTTPS, but an already-synced HTTP endpoint is
   not silently deleted or disabled during upgrade. This preserves existing
   custom-chain access; its transport remains redirect/credential/size/time/
   concurrency bounded, but HTTP cannot provide server authenticity or traffic
   confidentiality. Editing that chain requires replacing the endpoint with
   HTTPS. Local/private development RPCs may continue using HTTP explicitly.
