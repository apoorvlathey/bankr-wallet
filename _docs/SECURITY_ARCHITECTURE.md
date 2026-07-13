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
`chrome/cryptography/README.md`, `chrome/auth/README.md`,
`chrome/passkey/README.md`, `chrome/session/README.md`, and
`chrome/secrets/README.md`. Their stable
parent-level facades keep callers
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

Public portfolio state is grouped under `chrome/portfolio/` with its own audit
map and mirrored architecture test. Pure catalog transforms and native-asset
matching do not access Chrome or the network; storage repositories own stable
display/cache keys; bounded CoinGecko/GeckoTerminal effects share one explicit
cache/backoff state; and `snapshotRefresh.ts` preserves catalog load → onchain
verification → snapshot write ordering. These caches are non-secret and
best-effort, but their keys and reset behavior remain upgrade compatibility
boundaries.

Durable approval state is grouped under `chrome/requests/` with a local review
map and mirrored architecture/behavior tests. Pure pinned-request factories
feed locked storage repositories; synchronous first-action claims and effect
leases precede asynchronous reads; origin/account/WalletConnect authority is
revalidated at the last safe point; and terminal failures remove their prompt
before publishing provider or WalletConnect results. Storage keys, result
prefixes, expiry windows, and request IDs remain compatibility boundaries. The
existing ERC-7715 storage facade stays at the root, WalletConnect route/outbox
records stay in its protocol domain, and bundle status stays with batch.

Dapp account visibility and provider authorization are grouped under
`chrome/dapp/`. `requestPolicy.ts` accepts only Chrome-attested top-level
senders whose current tab URL retains the exact approved origin;
`accountScope.ts` permits per-tab selection only for that grant or its exact
pending connection; and the shared account-binding lock ensures connection
approval cannot overtake account removal. Removal terminalizes affected prompts
and revokes each origin before deleting account metadata. The inpage RPC fast
path remains page-local, timeout-bounded, and restricted to a narrow read-only
allowlist; every miss or failure returns to the authoritative extension RPC.

Sponsored ERC-3009 transfers are grouped under `chrome/sponsoredTransfers/`.
Pure intent/response validation feeds an encrypted V1 recovery repository;
account-pinned authorization is persisted before the sole relayer POST; an
uncertain response is retained as ambiguous and never re-submitted; and two
fixed Base RPCs must agree at their fetched finalized blocks before recovery
classifies an authorization as consumed or expired-unused. Trusted status and
account-bound ACK handlers preserve recovery records until the UI acknowledges
completion, while account removal and reset remain blocked by unresolved
records.

The ERC-5792 batch domain is decomposed into audit-sized modules in
`chrome/batch/` (mapped in its `README.md`). Its
natural domains are: pure ERC-7821 encoding policy; capability discovery;
request validation and two-record queue commit; Bankr confirmation/submission;
local key resolution and execution-path selection; sequential local execution;
single-transaction local execution; EIP-7702 atomic execution; receipt/status
tracking; pending-request UI mutations; and non-critical gas enrichment. The
first extracted boundary is `batchTxEncoding.ts`: it owns only deterministic
encoding, value normalization, and the final self-recursion guard. It is
storage-, network-, session-, and signer-independent. `batchTxHandlers.ts`
is an implementation-free stable import path that re-exports the exact public
function identities.
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
publication. `batchLocalAuthorization.ts` owns the exact-account and final
transport gate; `batchLocalCoordinator.ts` wires it to the single, sequential,
and atomic executors. `batchSingleExecution.ts` owns the one-call shortcut,
`batchCapabilities.ts` owns exact-account capability discovery, and
`batchCompletionTracking.ts` mirrors terminal history into aggregate bundle
status. No batch module imports the compatibility facade.

User-assembled cross-dapp batches follow the audit map in
`chrome/crossDappBatch/README.md`; `crossDappBatchHandlers.ts` is export-only.
The durable schema and source lifecycle are separate from staging mutations,
signer-specific execution, and result fan-out. Intake writes staging before
removing the source prompt; cancellation removes staging before publishing a
terminal result. Confirmation locks before asynchronous reads and validates the
stored account/from/chain binding. Bankr and local EIP-7702 paths each own a
reset-aware effect lease plus final live account, transport, and captured-epoch
commit at the irreversible boundary. Delayed receipt completion cannot access
credentials or re-enter signing.

Signature confirmation follows the same focused-boundary rule.
`signatures/confirmationPolicy.ts` is the single shared preflight for local and
Bankr signers: expiry, pinned-account resolution, raw ERC-7710 rejection,
method-specific signer-address binding, and SIWE origin/account/chain checks.
`signatures/confirmationHandlers.ts` owns only credential/key restoration, the
signing effect lease, lifecycle authorization, and the final account,
transport, and Bankr-credential revalidation before a signature is released.
The stable `txHandlers.ts` path re-exports these handlers for compatibility and
must not regain inline signature policy or signing orchestration.

Bankr remote authority follows the audit map in `chrome/bankr/README.md`.
Pure response schemas feed a fixed-origin bounded transport; signing locally
recovers the reviewed signer; submission alone owns the irreversible HTTP
start and ambiguity contract; job polling is independent; and ciphertext
generation binding plus pending authorization remain separate from plaintext
credential/session recovery. Bankr chat further separates its `chatHistory`
repository, bounded prompt client, and session-aware background handler. No
Bankr/chat implementation or facade remains in the Chrome root.

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

Bankr confirmation follows a separate auditable chain:
`transactions/bankrPolicy.ts` checks the persisted pinned signer/from/chain,
`bankrSession.ts` restores only the reviewed credential path,
`bankrConfirmation.ts` consumes the prompt and acquires the effect lease, and
`bankrProcessing.ts` owns remote outcome publication. The final live
account/origin/credential-generation check remains inside the Bankr submission
boundary.

Internal swap execution lives under `transactions/swaps/`. Account and chain
locking is centralized in `accountPolicy.ts`; direct Bankr legs are awaited in
order and stop on definite or ambiguous outcomes; local legs are nonce-prepared
in order and recheck the exact account immediately before raw RPC broadcast.
Bankr ERC-7821 batches and PK/seed EIP-7702 atomic batches acquire an
internal-operation effect lease before handing work to their background
executor. `txHandlers.ts` contains exports only and cannot hide signing policy.

Durable transaction display state lives under `chrome/history/`.
`repository.ts` is the sole released `txHistory` storage authority and shares
one `local:txHistory` lock across add/update/cleanup operations;
`maintenance.ts` preserves force-inclusion recovery ownership while handling
stale and explicit deletion. Receipt Transfer parsing is pure, bounded RPC
reads and same-block correction are isolated in `rpc.ts`, and storage writes
occur only after best-effort asset assembly. Receipt retry/backfill cannot sign,
broadcast, access credentials, or block transaction/bridge terminalization.
The three historical root paths are export-only identity-preserving facades.

Cross-chain settlement is isolated under `chrome/bridge/`. `client.ts` is the
only bridge API egress and delegates to the shared deadline-, redirect-, and
byte-bounded HTTP primitive. `catalogCache.ts` alone owns the released
`bungeeChains` / `bungeeTokens:{chainId}` caches and their single-flight stale
fallback. Chain eligibility is pure. Status application preserves the durable
effect order: history snapshot, optional fire-and-forget destination
enrichment, pending checkpoint, terminal notification, then pending-record
removal. Polling owns only dedupe/backoff/resume and cannot sign or broadcast.
The three root bridge paths are export-only identity-preserving facades;
`pendingBridges` remains owned and locked by the requests domain.

Public ERC-7730 resolution and optional Activity summaries are isolated under
`chrome/clearSigning/`. `descriptorClient.ts` is the only descriptor egress
and uses the shared 10-second, 512 KiB bounded transport. Cache schema/TTL and
settings/purge effects are separate from configured-RPC proxy fallback and
pure deployment extension. Snapshot priority is explicit and errors collapse
to `null`; history attachment is fire-and-forget and cannot delay signing or
broadcast. The two historical root paths are export-only identity-preserving
facades, and this domain never owns credentials or authorization.

Attacker-controlled avatar and token-logo bytes are isolated under
`chrome/avatar/`. URL/MIME policy and the streaming body reader precede the
manual-redirect transport; rasterization converts accepted bytes to bounded
pixels before the locked best-effort repository can write the exact released
`ensAvatarImageCache` schema. A two-wide FIFO scheduler owns same-URL
single-flight work, abort controllers, and the wallet-reset epoch. Repository
commits recheck that epoch and remove a stale entry when an asynchronous
storage write crosses reset. The historical `avatarImageCache.ts` path is an
export-only identity-preserving facade.

Focused security implementation modules have a default ceiling of 400 lines.
Compatibility/coordinator facades may temporarily exceed that while their
remaining concerns are extracted, but every completed tranche lowers a tested
per-file size budget. `background.ts` is now a five-line bootstrap invocation
with a final tested 30-line ceiling.
Each auth/session, onboarding, non-secret account-state, settings, dapp
permission, WalletConnect-session, and metadata-prompt transport module is
independently ratcheted at 400 lines. Single transaction/signature request
transport and transaction status/history transport now have the same ceiling.
The ordered 252-line pipeline and every route-family/lifecycle composition
module are independently capped below 400 lines. New routes extend their owning
family without growing the entrypoint or creating a second listener.

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

Shared cross-domain primitives live under `chrome/storage/`. `lock.ts` owns
the single per-key in-process queue; `resetManifest.ts` is a pure, exact list
of wallet-owned keys and prefixes; `cachePolicy.ts` builds a pure prune plan
before `cachePruner.ts` performs ordered remove-then-set effects; and
`resultWaiter.ts` owns the durable provider-result listener and retrying
expiry handshake. The four historical root paths are export-only facades, so
callers share the same lock/function identities without duplicating state.
Account, request, vault, mnemonic, session, and WalletConnect repositories
remain in their owning domains rather than moving into this shared folder.

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
Those trusted-UI mutations are isolated in
`background/accountManagementRouter.ts`, which preserves master-session
resolution, auth-epoch assertions, legacy migration locking, Bankr credential
verification/atomic commit, Never-session recovery, and
sponsored-check/revoke-before-delete ordering through injected dependencies.
Existing-account Bankr credential replacement is isolated further in
`background/bankrCredentialRouter.ts`: remote signer proof precedes the
wallet-secret lock, the prepared master-auth epoch is rechecked immediately
before the atomic account-address/encrypted-credential commit, and the memory
cache is updated only afterward. Active-account mirrors and tab/UI notification
are non-authoritative best effort. Cached secret reads require an exact Wallet
UI sender, restore only Never sessions, and always return null to agent sessions.
`background/secretManagementRouter.ts` owns the smaller capability-release
surface: defense-in-depth trusted-sender checks for mnemonic/private-key
plaintext, pinned-account signature routing with terminal-only result
publication, and ERC-7715 confirm/reject transport. It receives domain
handlers rather than importing cryptography or secret storage.

`background/settingsRouter.ts` keeps network registry and popup/sidepanel
transport separate from provider add-chain authority. The router forwards the
active account type needed for visibility/deletion compatibility, but URL
validation, normalization, and the network storage lock remain in
`network/customNetworkValidation.ts`, `network/networkRepository.ts`, and
`network/networkMutations.ts`. Bounded fixed-origin HTTP, configured-RPC
egress, and provider/WalletConnect read forwarding live beside them without
root compatibility shims. `sidepanelManager.ts` and `extensionPopup.ts` are
export-only compatibility facades over `windowing/`: pure browser/mode policy,
mode transitions, request-surface verification, popup geometry/reuse, and the
single `windowing/chromeAdapter.ts` effect boundary. Focused controllers receive
those effects as dependencies; background composition imports only the stable
facades and does not own windowing policy.

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

`background/providerRpcRouter.ts` is the only main-listener adapter for
injected `rpcRequest`. It reuses connected-dapp exact-sender authorization,
forwards the authorization-owned origin into bounded safe RPC, and publishes
the unchanged `rpcResult:{id}` success/error payload. The route is deliberately
fire-and-forget, so no response-channel lifetime is coupled to the RPC call.

The remaining shared ingress policy is explicit and audit-sized.
`background/providerIngress.ts` owns canonical connected-origin lookup,
durable rejection delivery, and ERC-7715 request-lock blocking.
`background/signatureValidation.ts` rejects unsafe/deprecated methods and
validates and sanitizes EIP-712 before exact sender-scope intake.
`background/chainSwitchNotification.ts` validates resolved chains, emits the
portfolio refresh before applying notification cooldown, and accepts only safe
extension-owned icon paths.

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
persistence, rejection/cancellation claims, and durable result publication.
`background/transactionExecutionRouter.ts` owns all three trusted-UI
single-transaction confirmation transports: immediate Bankr, background Bankr,
and local private-key/seed-phrase. Each installs the same transaction-confirm
claim before its handler; the immediate path preserves terminal-result
non-overwrite, and the local path preserves explicit/sender tab scope, gas, and
force-inclusion arguments. Transfer intake remains non-signing prompt creation.
`background/swapExecutionRouter.ts` and
`background/sponsoredTransferRouter.ts` enter the shared `internalOperation`
reset barrier before swap or relayer effects. Exact account locks and sponsored
recovery/status/ACK semantics remain in their injected domain handlers.
`background/transactionStatusRouter.ts` owns only trusted-UI history,
processing, failed-result, nonce-cache, enrichment, and receipt-status message
shapes. It cannot resolve a credential or create a signing capability.

`background/swapBridgeDataRouter.ts` and `background/tokenDataRouter.ts` own
read-only Wallet UI helper transport separately from swap/bridge execution.
They preserve exact quote/status/catalog/metadata/CRUD/price/balance request
and response contracts. Avatar URL proxying retains a direct exact-UI sender
check, and bigint allowance/balance values remain serialized strings. Neither
router can sign, broadcast, resolve a credential, or bypass the audience gate.

`background/resetRouter.ts` is the destructive wallet-reset transport
boundary. It installs the global request-resolution barrier synchronously and
then preserves the serialized restored-master proof, sponsored-intent guard,
auth/avatar/WalletConnect invalidation, secret lock, exact local/sync removal
manifests, badge cleanup, and notification cleanup. Chrome listener ownership
and immediate startup effects live under `background/lifecycle/`; its ordered
README is the review map. `background/composition/lifecycle.ts` retains exactly
one direct listener registration for `background/messagePipeline.ts`.

The MV3 entrypoint `background.ts` only invokes `background/bootstrap.ts`.
Bootstrap creates `background/composition/routes.ts`, passes those exact router
identities into the ENS-first/audience/provider-gated message pipeline, and then
registers lifecycle composition. Coherent dependency wiring is split under
`background/composition/`; every module is below 400 lines and the tested import
graph is acyclic.

`background/batchRequestRouter.ts` owns the injected ERC-5792
capability/send/status/show envelope plus trusted-UI batch decisions. It keeps
provider responses on the exact durable result channels, forwards authorized
origin/tab/frame/window/account metadata, and acquires the existing request
claim before any confirm, reject, edit, or split handler. WalletConnect batch
metadata remains in its session adapters and converges only below this
transport boundary. `background/delegationRouter.ts` is a narrow trusted-UI
adapter over EIP-7702 status/probe/set/revoke policy. The separate
`background/crossDappBatchRouter.ts` preserves atomic source-plus-active-batch
claims when moving single or ERC-5792 requests, then one active-batch claim for
edit/reject/confirm; it cannot inspect keys or bypass the domain's password and
authorization policy.

The stable `accountStorage.ts` import path is likewise only a facade over the
`chrome/accounts/` audit domain. The `accounts` record and address/order queries
belong to `repository.ts`; selection mirrors and stale-ID repair belong to
`selectionStorage.ts`; Bankr, local/view-only, seed-derived, and seed-group
mutations are isolated in their own modules. Lower repository/selection layers
do not import mutation domains, and no account metadata module owns private-key
or mnemonic material. The same audit domain owns the serialized legacy account
migration, connected/pending-only tab resolution, and the two account-bound
local signer gates: `localKeyResolver.ts` restores/decrypts only the requested
account capability, while `localEffectBoundary.ts` revalidates ID, type, and
address immediately before an irreversible effect. `accountStorage.ts` remains
metadata-only and does not re-export those policy boundaries.

The audience manifest is the source of truth. Adding a `switch` case without an
audience classification is a test failure. Unknown messages from an untrusted
sender fail closed. ENS browsing entrypoints remain a separate exact
page/message allowlist in `ensBrowsing/senderAuthorization.ts` and are
evaluated before the wallet-router gate. `handlers.ts` is only the stable
facade; message dispatch and navigation live in separate modules. Resolver
dependencies flow from the stable `resolver.ts` facade through name/ERC-4804
resolution into shared RPC support, never back into routing or navigation.

External provider policy lives entirely under `chrome/provider/`. The
background router uses `messageValidation.ts` before any domain router; the
thin `inject.ts` entrypoint starts `contentBridge/`, whose exact page/runtime
allowlists, source checks, correlation IDs, reverse-event privacy boundary, and
chain-pinned request adapters are independently auditable. The thin
`impersonator.ts` entrypoint starts `inpage/`, which separates provider state,
method routing, callback correlation, ERC-5792 adapters, EIP-6963 announcement,
and legacy `window.ethereum` installation. The content script uses
`chainBoundary.ts` before state-changing dispatch; and
WalletConnect plus batch intake import the same transaction, signature, batch,
and resource-cap modules directly. These modules are effect-free: they cannot
read storage, fetch, resolve credentials, sign, or broadcast. Chain parsing
accepts only explicit number/string representations without coercion, and every
state-changing injected request must match the content-script-attested chain.
The four former root implementations have no compatibility facades.

External provider rejection is a pure mapping from a validated request shape
to one of:

- an exact durable result key and error payload;
- a direct response for synchronous methods;
- an acknowledged no-write notification route.

This mapping is tested independently from Chrome listener return values.

## Persisted Secret Domains

| Domain | Storage authority | Plaintext lifetime | Required compatibility coverage |
| --- | --- | --- | --- |
| Bankr credential | Stable `crypto.ts` facade over `cryptography/passwordCipher.ts`, `vaultKey.ts`, and `credentialStorage.ts`, plus `bankr/credentialBinding.ts`; remote effects under `bankr/` | Background session cache and immediate fixed-origin API operations | Legacy password ciphertext, general-vault ciphertext, partial migration, generation-bound pending requests |
| General vault key | master/agent wrappers and V1/V2 passkey wrappers | Non-extractable `CryptoKey` plus bounded setup/unlock byte buffers | Master, agent, V1 passkey, V2 passkey, corrupt/mismatched wrappers |
| Private keys | Stable `vaultCrypto.ts` facade over `vault/entryCrypto.ts`, `accountIntegrity.ts`, `generalIntegrity.ts`, `recordCodec.ts`, `repository.ts`, and `operations.ts` / `pkVault` | Immediate signing or bounded session cache | Frozen V1 bytes, unknown/malformed/oversized records, read-compatible duplicate IDs, zero-write mutation/migration refusal, legacy/current/mixed encryption, all local-account bindings |
| Mnemonics | Stable `mnemonicStorage.ts` facade over the `mnemonic/` record/crypto/repository/operations/recovery layers plus derivation/master-access/integrity/address-preview/account workflow boundaries / `mnemonicVault` | Immediate derivation/reveal; dedicated cached mnemonic key only | V1 password vault, transitional shared-vault reads, early V2, current V2 key check, V1/V2 passkeys, empty vault |
| Passkey orchestration | Stable `passkeyUnlock.ts` facade over status/preflight, setup, hydration, and removal layers / `passkeyUnlock` | Immediate V1/V2 unwrap; only resulting non-extractable capabilities persist in memory | Frozen V1/V2 records, auth-epoch races, atomic mnemonic/passkey setup, integrity-gated removal |

Within `chrome/vault/`, `entryCrypto.ts`, `accountIntegrity.ts`, and
`recordCodec.ts` are storage-independent transformations/proofs. The codec
bounds the released V1 envelope without cloning it: duplicate IDs stay
readable for recovery compatibility, while its stricter mutation gate requires
unique IDs. `repository.ts` alone owns the released `pkVault` key and validated
V1 record IO. `operations.ts` acquires the existing
wallet-secret storage lock before add/remove read-modify-write mutations and
performs the same pre-commit authorization recheck. `generalIntegrity.ts` is a
read-only recovery proof. None imports the stable root `vaultCrypto.ts` facade,
so dependencies cannot cycle back from implementation into compatibility.
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

Factor deletion has one additional ordering boundary: after all master/epoch
proofs but before the factor write, it must revoke the local recovery half of a
Never session. Failure there leaves the factor intact. After commit, memory is
cleared synchronously and any remaining session ciphertext is non-restorable,
so cleanup failure cannot make the result disagree with the durable effect.

Local signing follows the same explicit effect boundary inside
`chrome/localSigning/`. `messageSigner.ts` contains only signer-address and
typed-data policy; `transactionSigner.ts` prepares transaction intent;
`transactionBroadcast.ts` signs once while
holding the wallet operation lock, revalidates through its injected
`beforeBroadcast` hook, and then sends only those exact bytes. Ambiguous RPC
outcomes retain the deterministic local hash and are never re-prepared at a new
nonce. `localSigner.ts` is only the stable compatibility facade.

`eip712Validator.ts` is a policy-free stable facade. Untrusted EIP-712 input is
bounded in `chrome/signatures/eip712/validator.ts`, while raw ERC-7710
rejection, schema graph validation, and schema-only data projection live beside
it in pure modules without Chrome, session, account, network, or signing access.

Transaction asset simulation lives behind the policy-free stable
`txSimulation.ts` facade in `chrome/simulation/`. `constants.ts` keeps
shared gas caps and infrastructure addresses canonical, `types.ts` owns only
normalized result shapes, `ethSimulateLogs.ts` is a pure classifier for
untrusted `eth_simulateV1` status and transfer logs, and `stateOverrides.ts`
owns retry-only ERC-20 slot discovery plus nonce-preserving Permit2 override
construction. Native metadata, portfolio price lookup, pure asset
normalization, token/NFT enrichment, metadata retry, and final result building
live in separate audit-sized modules with one-way dependencies back toward the
facade. Simulator bytecode/ABIs, narrow ERC-7715 preview decoding, single-call
execution, atomic batch fallback, bounded `eth_simulateV1`, and non-atomic
result precedence are also isolated by responsibility. These modules cannot
authorize a request, resolve credentials,
sign, broadcast, or persist wallet state.

Post-authorization L1-deposit and transaction recovery logic is grouped under
`chrome/forceInclusion/`. `single.ts` and `batch.ts` own force-inclusion
submission/tracking, `nonceManager.ts` owns only short-lived pending nonces,
`receiptPoller.ts` owns receipt terminalization and restart resumption, and
`splitBatchSequencer.ts` owns durable one-at-a-time split execution.
`broadcastPolicy.ts` isolates the pure fail-closed rule for ambiguous sends.
The background composition root and other callers import this domain directly;
the historical root modules have no compatibility facades.

WalletConnect is contained in `chrome/walletConnect/` with no root
implementation family. Its dependency direction is bounded validation/session
policy → durable request storage → persist-before-delivery protocol/outbox →
request adapters and dispatch → SDK client composition. `pendingRequests.ts`
creates account-pinned transaction/signature prompts; `requestRouter.ts` never
writes those stores directly. `client.ts` owns generation-bound WalletKit
listeners and namespace cutover but imports neither trusted-UI commands nor the
result bridge; those higher layers import the client. Every implementation is
independently ratcheted below 400 lines and the local `README.md` maps storage,
relay, proposal, keepalive, and reset effects.

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
`network/`, `avatar/`, `ensBrowsing/`, `navigation/`, and `manifest/`, each
with a local README that identifies its trust boundary and nearby cross-domain
coverage.
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
4. Convert background switch branches into domain routers, split route-family
   and lifecycle composition, and leave `background.ts` as a bootstrap-only
   MV3 entrypoint. This step is complete.
5. Split transaction/signature intake, confirmation, account mutation, and
   direct/batch/atomic swap services from `txHandlers.ts`; keep the facade
   implementation-free.
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
   first general-vault credential commit into `chrome/onboarding/state.ts`,
   `lifecycle.ts`, and `credential.ts` behind the policy-free stable
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
