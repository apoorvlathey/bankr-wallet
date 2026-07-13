# Security-Critical Architecture

This document is the audit map for WalletChan's extension service worker. It
defines where security decisions belong, how critical modules may depend on one
another, and the compatibility rules for refactoring wallet secrets without
changing user data.

It complements:

- [`SECURITY.md`](./SECURITY.md), which defines the threat model and invariants.
- [`IMPLEMENTATION.md`](./IMPLEMENTATION.md), which documents product flows.
- [`STORAGE.md`](./STORAGE.md), which is authoritative for persisted schemas.
- [`PASSKEY_BIOMETRIC.md`](./PASSKEY_BIOMETRIC.md), which documents WebAuthn and
  PRF behavior.

## Refactor Objective

Security-critical code must be reviewable as small units with explicit inputs,
outputs, and side effects. A reviewer should not need to understand the whole
service worker to answer any of these questions:

1. Which callers may reach a message handler?
2. Which authentication capability does an operation require?
3. Which storage records can it read or change?
4. Where is plaintext secret material created and destroyed?
5. At which exact write is authorization revalidated?
6. What compensates an interrupted multi-record operation?

Refactoring for auditability is not permission to change ciphertext formats,
storage keys, KDF parameters, authentication semantics, or migration behavior.
Those changes require a separate compatibility design, frozen upgrade fixtures,
and the storage migration process in `STORAGE.md` and `PUBLISHING.md`.

## Dependency Direction

New and extracted security modules follow this one-way dependency graph:

```text
constants and bounded codecs
          ↓
pure cryptographic operations
          ↓
validated storage repositories
          ↓
authorization and session services
          ↓
domain operations / handlers
          ↓
message transport and background bootstrap
```

Rules:

- A codec validates untrusted persisted data and has no Chrome, session, or UI
  dependency.
- A cryptographic module transforms explicit byte/string inputs. It does not
  discover credentials from global session state.
- A repository owns a documented storage key and accepts only validated
  records. It does not decide whether a user is authorized.
- An authorization service resolves master/agent/biometric state and returns a
  call-stack-only capability. Persistent effects still revalidate the live auth
  epoch at their storage linearization point.
- A domain handler coordinates repositories and crypto. It returns a typed
  result and does not own Chrome message-channel lifetime rules.
- The background bootstrap classifies the caller, validates the external
  message envelope, delegates once, and delivers the result. It contains no
  cryptography or secret persistence logic.

Temporary compatibility facades may re-export old public APIs while callers are
migrated. A facade must contain no new policy or storage behavior.

Related implementations are grouped into audit domains with local review maps:
`chrome/auth/README.md`, `chrome/passkey/README.md`, and
`chrome/session/README.md`. Their stable parent-level facades keep callers
insulated from folder layout while the READMEs identify storage effects,
dependency direction, and the tests that freeze each compatibility contract.

`chrome/README.md` is the enforceable root contract for future agents. A new
flat root implementation is an architecture regression unless it is a build
entrypoint, a policy-free compatibility facade, or a documented cross-domain
primitive. Two or more related implementations form a domain folder with a
local audit map and mirrored test directory. Existing oversized composition
roots are governed by lowering size-budget ratchets; new work may not use their
legacy size as permission to add policy inline.

Security tests mirror those source domains under `apps/extension/tests/`.
In particular, `vault/` owns secret integrity and upgrade compatibility,
`onboarding/` owns fresh-wallet initialization, `requests/` owns durable
pending-request coordination, `storage/` owns shared storage primitives, and
`security/` owns only cross-cutting policy, dependency, and size invariants.
Each directory has a short `README.md` audit map. The security runner discovers
`*.test.ts` recursively, so organization does not weaken suite coverage.

The ERC-5792 batch coordinator is being decomposed into audit-sized modules in
`chrome/batch/` (mapped in its `README.md`). Its
natural domains are: pure ERC-7821 encoding policy; capability discovery;
request validation and two-record queue commit; Bankr confirmation/submission;
local key resolution and execution-path selection; sequential local execution;
single-transaction local execution; EIP-7702 atomic execution; receipt/status
tracking; pending-request UI mutations; and non-critical gas enrichment. The
first extracted boundary is `batchTxEncoding.ts`: it owns only deterministic
encoding, value normalization, and the final self-recursion guard. It is
storage-, network-, session-, and signer-independent. `batchTxHandlers.ts`
temporarily remains the stable import path and re-exports the exact encoder
function identities while the execution domains are extracted separately.
`batchRequestStatusHandlers.ts` is the second extracted boundary: it owns only
pending-call UI edits/rejection and origin-scoped status reads or explorer
opening. It has no credential, private-key, mnemonic, delegate, or broadcast
dependency.

`batchRequestIntake.ts` owns the `wallet_sendCalls` acceptance transaction:
bounded envelope/call/value validation, exact account/origin/chain pinning,
authorization snapshots, pending-request then bundle-status persistence, final
live-authorization verification, durable acknowledgement, and reverse-order
compensation. It cannot access credentials or sign/broadcast transactions.

`batchBankrExecution.ts` owns pinned Bankr confirmation, credential restoration,
final credential-generation/transport authorization, submission, receipt and
terminal status/history/result publication. `batchExecutionRuntime.ts` keeps
duplicate-processing and expiry state shared with local signer paths.
`batchLocalConfirmation.ts` owns pinned PK/seed account validation, Never-mode
session restoration, vault fallback, key-cache resolution, final transport
authorization, and single/atomic-7702/sequential path selection. Actual signing
is supplied through explicit executor callbacks and remains outside this module.
`batchSequentialExecution.ts` owns nonce preparation, per-call history, gas
selection, before-broadcast authorization/effect leases, ambiguity stop rules,
partial outcomes, receipt polling, and durable aggregate publication. Shared
failure terminalization lives in `batchFailure.ts` for every execution path.
`batchAtomic7702Execution.ts` owns ERC-7821 wrapping, onchain delegate
rechecks, guarded authorization-tuple construction, nonce/auth semantics,
final transport revalidation, sign-once broadcast, and atomic receipt/status
publication. It receives explicit authorization and completion callbacks from
the root coordinator and never resolves credentials.

Signature confirmation follows the same focused-boundary rule.
`signatures/confirmationPolicy.ts` is the single shared preflight for local and
Bankr signers: expiry, pinned-account resolution, raw ERC-7710 rejection,
method-specific signer-address binding, and SIWE origin/account/chain checks.
`signatures/confirmationHandlers.ts` owns only credential/key restoration, the
signing effect lease, lifecycle authorization, and the final account,
transport, and Bankr-credential revalidation before a signature is released.
The stable `txHandlers.ts` path re-exports these handlers for compatibility and
must not regain inline signature policy or signing orchestration.

Private-key and seed-phrase transaction confirmation is split at the raw-RPC
effect boundary. `transactions/localConfirmation.ts` owns request expiry,
pinned-account and `tx.from` checks, EIP-7702 master-capability capture,
master/agent/Never-session key recovery, durable prompt consumption, live
transport authorization, and transfer to an effect lease.
`transactions/localExecution.ts` owns nonce and user gas application, optional
EIP-7702 authorization construction, sign-once preparation, the final account,
transport, and master-epoch `beforeBroadcast` recheck, and terminal
history/result/polling publication. Definite pre-boundary failures reset the
nonce cache and release the lease; post-boundary uncertainty retains the lease
fail-closed. Transaction failure, display metadata, and Chrome notification
effects live in focused reusable modules instead of creating a reverse import
to the `txHandlers.ts` compatibility facade.

Focused security implementation modules have a default ceiling of 400 lines.
Compatibility/coordinator facades may temporarily exceed that while their
remaining concerns are extracted, but every completed tranche lowers a tested
per-file size budget. `background.ts` uses the same ratchet until it becomes a
small composition root; the current ceiling is not the target architecture.
Each auth/session, onboarding, non-secret account-state, settings, dapp
permission, WalletConnect-session, and metadata-prompt transport module is
independently ratcheted at 400 lines. Single transaction/signature request
transport and transaction status/history transport now have the same ceiling.
These extractions lowered `background.ts` to 3,077 lines with a tested
3,100-line ceiling; future routing extractions must lower that ceiling rather
than grow it back.

## Capability Rules

Authentication is not represented by a caller-supplied boolean or raw message
field. A capability used by a critical domain operation must:

- be constructed only inside the service worker from current session state;
- be non-serializable and never returned through `sendResponse` or storage;
- distinguish master, agent, general-vault-key, and mnemonic-key authority;
- capture the authentication ceremony epoch;
- never replace `assertCurrentMasterAuthorization(epoch)` immediately before a
  persistent secret/account effect.

The operation lock and the lower-level storage lock are separate by design.
Domain operations may hold the wallet-secret operation lock while repository
primitives acquire the storage lock. Combining these locks would create
re-entrant deadlocks and obscure the true commit boundary.

## Background Message Boundary

Every message handled by the main service-worker router has exactly one
audience:

- `wallet-ui`: only an exact trusted top-level WalletChan UI document.
- `provider`: an injected/content-script request after strict envelope and
sender validation; trusted WalletChan UI may also exercise these routes for
internal flows.

After those gates, `background/authRouter.ts` owns only the Wallet-UI
transport contract for auth/session routes. It delegates cryptographic,
persistence, transition-locking, and teardown work to the existing domain
services and returns an explicit handled/channel-lifetime result to the Chrome
listener. Direct tests freeze response timing, serialized transition order,
success-only unlock broadcasts, manual-lock prompt suppression, and Never-mode
session restoration without duplicating those domain services in the router.

`background/onboardingRouter.ts` separately freezes initialization-ID
normalization, serialized status/credential/rollback calls, completion error
shapes, and channel lifetime. Replacement-wallet WalletConnect teardown and
ephemeral cache invalidation enter through explicit composition-root
dependencies, so importing the router cannot initialize an SDK or consume a
build-only environment. `background/accountStateRouter.ts` contains only
non-secret reads, ordering, naming, and global/per-tab selection. Private-key,
mnemonic, Bankr credential, reveal, removal, and migration routes are excluded.

`background/settingsRouter.ts` keeps network registry and popup/sidepanel
transport separate from provider add-chain authority. The router forwards the
active account type needed for visibility/deletion compatibility, but URL
validation, normalization, and the network storage lock remain in
`networkStorage.ts`. Sidepanel support and transition policy remain in
`sidepanelManager.ts`; Chrome storage/action and detached-popup effects are
explicitly injected at the composition root.

`background/dappPermissionRouter.ts` is deliberately mixed-audience:
provider account exposure, connection intake, and expiry enter only after the
external-envelope gate, while permission reads and decisions remain trusted-UI
only. Exact sender objects are forwarded to origin/tab-bound domain services;
the router cannot grant access, persist prompts, open UI, update the badge, or
broadcast permission changes itself. The generic expiry route retains its
family-specific lifecycle service and result channel. The separate
`background/walletConnectSessionRouter.ts` imports no relay SDK; it only
forwards trusted-UI list, pair, disconnect, and chain-selection calls to
composition-root handlers, preserving the SDK's teardown boundary.

Metadata prompts are split by effect domain because their combined transport
would exceed the audit ceiling. `background/watchAssetRouter.ts` carries
the EIP-747 prompt from exact sender authorization through durable queue/result
records and, after a first-action claim plus live authorization recheck, token
storage and portfolio-unhide commits. `background/chainPromptRouter.ts`
does the same for EIP-3085, retaining origin-bound RPC validation, active-account
compatibility, network storage, and chain-notification authorization. Provider
intake remains fire-and-forget; trusted-UI decisions keep asynchronous response
channels. Shared metadata expiry remains in its dedicated lifecycle service.

`background/signingRequestRouter.ts` is the post-gate transport for single
transaction/signature intake and trusted-UI pending-request decisions. It
forwards the exact provider sender scope and delegates authorization, queue
persistence, signing, first-action claims, and durable result publication.
`background/transactionStatusRouter.ts` owns only trusted-UI history,
processing, failed-result, nonce-cache, enrichment, and receipt-status message
shapes. It cannot resolve a credential or create a signing capability.

The stable `accountStorage.ts` import path is likewise only a facade over the
`chrome/accounts/` audit domain. The `accounts` record and address/order queries
belong to `repository.ts`; selection mirrors and stale-ID repair belong to
`selectionStorage.ts`; Bankr, local/view-only, seed-derived, and seed-group
mutations are isolated in their own modules. Lower repository/selection layers
do not import mutation domains, and no account metadata module owns private-key
or mnemonic material.

The audience manifest is the source of truth. Adding a `switch` case without an
audience classification is a test failure. Unknown messages from an untrusted
sender fail closed. ENS browsing entrypoints remain a separate exact
page/message allowlist and are evaluated before the wallet-router gate.

External provider rejection is a pure mapping from a validated request shape
to one of:

- an exact durable result key and error payload;
- a direct response for synchronous methods;
- an acknowledged no-write notification route.

This mapping is tested independently from Chrome listener return values.

## Persisted Secret Domains

| Domain | Storage authority | Plaintext lifetime | Required compatibility coverage |
| --- | --- | --- | --- |
| Bankr credential | `crypto.ts` / credential binding services | Background session cache and immediate API operations | Legacy password ciphertext, general-vault ciphertext, partial migration |
| General vault key | master/agent wrappers and V1/V2 passkey wrappers | Non-extractable `CryptoKey` plus bounded setup/unlock byte buffers | Master, agent, V1 passkey, V2 passkey, corrupt/mismatched wrappers |
| Private keys | `vaultCrypto.ts` / `pkVault` | Immediate signing or bounded session cache | Legacy password entries, vault-key entries, mixed partial migration, all local-account bindings |
| Mnemonics | Stable `mnemonicStorage.ts` facade over the `mnemonic/` record/crypto/repository/operations/recovery layers plus derivation/master-access/integrity/address-preview/account workflow boundaries / `mnemonicVault` | Immediate derivation/reveal; dedicated cached mnemonic key only | V1 password vault, transitional shared-vault reads, early V2, current V2 key check, V1/V2 passkeys, empty vault |
| Passkey orchestration | Stable `passkeyUnlock.ts` facade over status/preflight, setup, hydration, and removal layers / `passkeyUnlock` | Immediate V1/V2 unwrap; only resulting non-extractable capabilities persist in memory | Frozen V1/V2 records, auth-epoch races, atomic mnemonic/passkey setup, integrity-gated removal |
| Restorable session | `session/storage.ts` / native `chrome.storage.session` | Background memory; encrypted session envelope only | Native storage, unavailable fallback, malformed/torn envelope, Never-only restoration |

`STORAGE.md` remains authoritative for exact schemas and version history.

## Critical Operation Shape

A secret/account mutation should read linearly as:

```text
validate request
  → resolve service-worker authorization capability
  → acquire domain operation lock
  → revalidate auth epoch
  → read and validate current records
  → prepare cryptographic replacements in memory
  → revalidate auth epoch at the commit boundary
  → commit one atomic write, or compensate earlier writes
  → publish/cache only committed state
  → return a typed result
```

After a durable commit, best-effort cache refresh or UI notification failure
must not turn a successful mutation into a false failure. Before a durable
commit, any failure must leave no visible account without its corresponding
signing/recovery material.

Local signing follows the same explicit effect boundary inside
`chrome/localSigning/`. `messageSigner.ts` contains only signer-address and
typed-data policy; `transactionSigner.ts` prepares transaction intent;
`transactionBroadcast.ts` signs once while
holding the wallet operation lock, revalidates through its injected
`beforeBroadcast` hook, and then sends only those exact bytes. Ambiguous RPC
outcomes retain the deterministic local hash and are never re-prepared at a new
nonce. `localSigner.ts` is only the stable compatibility facade.

Untrusted EIP-712 input is bounded in `eip712Validator.ts`, while raw ERC-7710
rejection, schema graph validation, and schema-only data projection live in
pure modules without Chrome, session, account, network, or signing access.

Transaction asset simulation is being decomposed behind the stable
`txSimulation.ts` coordinator into `chrome/simulation/`. `constants.ts` keeps
shared gas caps and infrastructure addresses canonical, `types.ts` owns only
normalized result shapes, `ethSimulateLogs.ts` is a pure classifier for
untrusted `eth_simulateV1` status and transfer logs, and `stateOverrides.ts`
owns retry-only ERC-20 slot discovery plus nonce-preserving Permit2 override
construction. These modules cannot authorize a request, resolve credentials,
sign, broadcast, or persist wallet state.

ERC-7715 follows the same separation inside the `chrome/erc7715/` audit domain.
The validation path is `permissionTypes.ts` → `ruleValidation.ts` →
`permissionValidation.ts`; deterministic authority encoding is
`caveatDefinitions.ts` → `caveatEncoding.ts` → `caveatBuilder.ts`; and request
preflight is split into pure normalization, bounded RPC reads, stateful
eligibility, and account-pinned prompt construction. `registry.ts`,
`caveats.ts`, and `preflight.ts` are export-only local facades.
`methods.ts` advertises capabilities, `onchainStatus.ts` owns live grant checks,
`revocation.ts` creates account-pinned revoke prompts, and `confirmation.ts` is
the only layer that resolves a local key,
requires live master authority, signs the WalletChan-constructed delegation,
and crosses the account-bound atomic grant commit. Provider prompt intake and
read-only queries cannot import signing or session services; the historical
`erc7715PermissionHandlers.ts` path is only a facade.

## Test Contract

Critical modules require behavioral tests against their exported functions.
Reading source text is acceptable only for static boundaries such as manifest
exposure, CSP, forbidden imports, or router/manifest completeness. It is not a
substitute for executing a handler.

Tests mirror the production audit domains under `apps/extension/tests/`.
Network-facing boundaries are separated into `walletConnect/`, `provider/`,
`network/`, `ensBrowsing/`, `navigation/`, and `manifest/`, each with a local
README that identifies its trust boundary and nearby cross-domain coverage.
The recursive security-test runner discovers every nested `*.test.ts` file, so
folder organization does not change suite membership.

Required layers:

1. Pure codec/crypto tests: valid records, every malformed bound, tamper
   failure, exact-size byte views, purpose separation.
2. Repository tests: Chrome storage semantics, malformed records, atomic
   writes, revision behavior, and no plaintext persistence.
3. Authorization tests: master/agent/password/biometric/locked matrix, session
   restore, stale epoch, and concurrent teardown.
4. Domain tests: success, duplicate/collision behavior, every partial-write
   failure, compensation, and post-commit best-effort work.
5. Upgrade fixtures: frozen serialized records written by historical formats,
   not generated by the current writer during the test. Current fixtures cover
   released V1/current V2 passkey wrappers, legacy password-encrypted private
   keys, and V1 mnemonic entries.
6. Router contract tests: every route classified once, provider validation,
   exact rejection delivery, and message-channel lifetime behavior.
7. Signing regression coverage for Bankr, private-key, and seed-phrase accounts.

The security test command must remain non-interactive and exclude browser UI
automation. Runtime UI QA is a separate gate.

## Safe Refactor Sequence

The migration is intentionally incremental:

1. Extract the background audience policy and provider rejection mapping.
2. Split passkey record codec, purpose-separated wrapping, and record storage
   behind the existing `passkeyUnlockCrypto.ts` compatibility API.
3. Extract master mnemonic access and seed preview/add/derive operations from
   `background.ts`, preserving locks, storage formats, and compensation order.
4. Convert the remaining background switch branches into domain routers, then
   leave `background.ts` as lifecycle bootstrap and transport composition.
5. Split transaction/signature intake, confirmation, account mutation, and
   direct swap services from `txHandlers.ts`.
6. Split unlock/hydration, legacy migration, factor management, credential
   mutation, and password rotation from `authHandlers.ts`. The completed
   layers are grouped under `chrome/auth/`: `walletUnlock.ts`,
   `sessionHydration.ts`, `legacyVaultKeyMigration.ts`,
   `masterPasswordVerification.ts`, `agentFactorHandlers.ts`,
   `bankrCredentialUpdate.ts`, `masterPasswordRotation.ts`, and
   `sessionTermination.ts`. `authHandlers.ts` is now only the stable
   compatibility facade; `authTransition.ts`, `masterAuthorization.ts`, and
   `sessionCache.ts` stay at the parent shared-capability boundary.
7. Split in-memory session state, persisted restoration, storage adaptation,
   and auto-lock policy from `sessionCache.ts` behind its stable compatibility
   facade. The resulting one-way layers live under `chrome/session/` as
   `inMemoryCache.ts`, `persistence.ts`, `storage.ts`, and
   `autoLockPolicy.ts`; transition/restore orchestration stays in the facade.
8. Split account metadata persistence, selection repair, Bankr atomic commits,
   local/view-only mutations, seed-derived rows, and seed groups behind the
   stable `accountStorage.ts` facade.
9. Split onboarding marker/recovery state, lifecycle orchestration, and the
   first general-vault credential commit behind the stable
   `onboardingInitialization.ts` facade.
10. Change storage/crypto formats only in a separately reviewed migration after
   frozen compatibility fixtures exist.

Each step keeps the old public module as a compatibility facade, adds direct
tests before moving the next behavior, runs the complete extension security
suite, and finishes with the full extension build.

## External Audit Entry Points

An external review should begin in this order:

1. `SECURITY.md` invariants and access-control matrix.
2. Background message audience policy and trusted sender validation.
3. Session state, auto-lock, auth epochs, and operation/storage locks.
4. Master/agent/passkey key-unwrapping paths.
5. General vault and mnemonic record codecs/repositories.
6. Secret reveal and account/seed mutation domain handlers.
7. Transaction/signature account pinning, EIP-712 validation, and the local
   sign-once broadcast boundary for all three signing wallet types.
8. Frozen upgrade fixtures and fault-injection tests.

Any critical module that cannot be reviewed independently at one of these
layers is still a refactor target; it should not be papered over with a larger
comment block or a source-regex test.
