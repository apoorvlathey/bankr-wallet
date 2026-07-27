# Safe Wallet Accounts PRD

> Status: implemented; real-network/browser release QA pending
>
> Created: 2026-07-19
>
> Updated: 2026-07-27
>
> Product: WalletChan browser extension
>
> Related research: [`SAFE_ACCOUNTS.md`](./SAFE_ACCOUNTS.md)

## 1. Executive summary

WalletChan will add `safe` as a first-class account type for existing Safe
multisig wallets. A Safe is the selected wallet address shown to dapps and the
source of assets and calls. Existing WalletChan private-key, seed-phrase,
Ledger, and Bankr accounts act as linked owner signers. An impersonator account can
help discover or observe a Safe, but can never approve or execute for it.

The first complete release is **Bring your existing Safe**. Users can:

1. find Safes owned by their WalletChan accounts or import a Safe address;
2. review verified, chain-specific owners, threshold, version, and security
   configuration before import;
3. select the Safe like another WalletChan account and view its portfolio;
4. create a send or arbitrary-call proposal from inside WalletChan;
5. approve with each eligible WalletChan owner through a separate explicit
   authorization;
6. exchange proposals and confirmations with Safe{Wallet} through the Safe
   Transaction Service;
7. see proposals that need approval, are waiting for others, or are ready to
   execute in one durable approvals inbox; and
8. execute a threshold-ready proposal through an explicitly selected local
   executor and receive the real onchain transaction hash.

The UX must never represent an owner approval as an executed transaction. A
`safeTxHash` identifies a proposal; only the outer `execTransaction` broadcast
produces a chain transaction hash.

Safe creation, owner/threshold changes, Safe modules, Safe message signing,
ERC-4337 module installation, and sponsored execution are later releases.

## 2. Product decisions

These decisions are requirements for the implementation, not open design
questions.

| Decision | Requirement |
| --- | --- |
| Account label | User-facing: **Safe** or **Safe account**. Internal account type: `safe`. |
| Core model | The Safe is the account. WalletChan signing accounts are linked owner capabilities, not child accounts or copied keys. |
| Initial audience | Users bringing an already deployed Safe. Safe creation is out of scope. |
| Chain model | One visual account may group the same address across chains, but configuration and authority are stored and verified independently per chain. |
| Discovery | User-initiated only. The user selects exactly one local signing account per owner lookup, with a privacy disclosure. Manual import is always available. |
| Signing support | Private-key, seed-phrase, Ledger, and Bankr owners must all pass before signing support ships. Impersonators remain observe-only. |
| Approval UX | One explicit authorization per owner. No “approve all owners” action. |
| Service role | Safe Transaction Service coordinates proposals and confirmations; onchain Safe state remains authoritative. |
| Transaction integrity | Rebuild and hash every proposal locally. Never trust a service-provided hash, decoded call, owner list, or confirmation without verification. |
| Execution | Never auto-execute by default. A fresh review and explicit Execute action are required after threshold is reached. |
| Dapp return value | `eth_sendTransaction` resolves only with a real onchain transaction hash. A `safeTxHash` is never returned as though it has a receipt. |
| Unknown authority | Unknown Safe deployment, owner signature type, module, guard, fallback handler, or arbitrary delegatecall is visible but not signable in v1. |
| Remote transport | Safe coordination reads and writes go directly from the extension to Safe's official Config and Transaction Service gateway. WalletChan does not receive owner addresses, Safe addresses, proposals, or confirmations. |
| Message signing | `personal_sign`, typed data, and SIWE from a Safe remain disabled until the separate EIP-1271 phase. |

## 3. Why this product shape

### 3.1 Local wallet UX review

The implementation plan was informed by the repositories in
`~/blockchain/wallets` at these commits:

| Wallet | Commit | Relevant UX |
| --- | --- | --- |
| Ambire | `54db83b1fdb54db345e418cf930cf8edcd9c810a` | Paste a Safe address, probe supported networks as the user types, show deployed-chain icons, warn when modules force view-only behavior, and import into the common account model. |
| Rabby | `69cd2655d634ee9d8b838015d97df53e11364264` | Paste and scan a Safe across chains, show discovered chains before import, provide a dedicated transaction/message queue, show threshold progress, select one available owner at a time, and support replace/reject/execute actions. |

Files inspected:

- Ambire `SafeImportScreen.tsx`, `controllers/safe/safe.ts`,
  `libs/account/Safe.ts`, `libs/safe/safe.ts`, and `signAccountOp.ts`.
- Rabby `ImportGnosisAddress/index.tsx`, `GnosisQueue/`,
  `GnosisDrawer.tsx`, `eth-gnosis-keyring.ts`, and the Gnosis methods in
  `background/controller/wallet.ts`.

WalletChan will adopt:

- immediate validation and visible chain discovery during manual import;
- a clear warning and observe-only fallback for unsupported configurations;
- a dedicated, cross-chain approval queue;
- visible threshold and per-owner confirmation state;
- explicit selection of the owner adding the next approval; and
- separate actions for propose, approve, replace, and execute.

WalletChan will improve on the reviewed UX by:

- showing owners, threshold, linked WalletChan signers, and security extensions
  before import rather than only listing chains;
- using explicit “Signed offchain” and “Transaction executed” outcome states;
- sorting the inbox by what the user can do next;
- rebuilding every transaction hash and validating every confirmation locally;
- storing every proposal independently instead of keeping one mutable current
  Safe transaction; and
- pinning account, chain, configuration epoch, origin, and result route through
  the entire MV3 lifecycle.

### 3.2 User problem

Today a WalletChan user who owns a Safe must switch to Safe{Wallet} to create,
approve, or execute shared-wallet transactions. The Safe balance cannot be
used as the active WalletChan account, and WalletChan cannot explain whether
the user can observe, approve, reach quorum, or execute.

The product must make the shared approval lifecycle understandable without
pretending the Safe behaves like an EOA.

## 4. Goals and non-goals

### 4.1 Goals

- Make an existing Safe a first-class WalletChan account.
- Work on the intersection of WalletChan-enabled chains and verified canonical
  Safe deployments; never infer configuration from another chain.
- Link all matching private-key, seed-phrase, Ledger, and Bankr owner accounts.
- Preserve WalletChan's clear-signing, simulation, account pinning, session
  restoration, and agent-password boundaries.
- Coordinate proposals bidirectionally with Safe{Wallet}.
- Survive popup closes, service-worker suspension, browser restart, tab reload,
  and WalletConnect disconnects without losing or duplicating effects.
- Give the user an actionable explanation of every proposal state.

### 4.2 Non-goals for the first complete release

- Creating or deploying a Safe.
- Adding, removing, swapping, or reordering owners.
- Changing the threshold.
- Enabling or disabling modules, guards, or fallback handlers.
- Installing Safe4337Module or another account-abstraction module.
- Safe message signing, typed-data signing, or SIWE.
- Nested Safe or arbitrary EIP-1271 contract-owner approvals.
- Automatic execution after quorum.
- WalletChan-sponsored execution.
- Treating two deployments at the same address as one authority record.

## 5. Users and primary stories

### Existing Safe owner

> I can find or import my treasury Safe, see which of my WalletChan accounts
> are owners, propose a payment, approve it, and know whether another owner is
> still needed.

### Multi-owner WalletChan user

> If WalletChan holds two owners of a 2-of-3 Safe, I can authorize those owners
> one at a time and see exactly which owner signed. Unlocking one owner never
> silently authorizes the other.

### External co-signer

> A transaction proposed in WalletChan appears in Safe{Wallet}, and an
> approval made in Safe{Wallet} appears in WalletChan after verification.

### Observer

> I can import a Safe whose owner keys I do not hold, view assets and pending
> proposals, and understand that it is observe-only.

### Dapp user

> A dapp connected to my Safe either receives a real execution transaction
> hash or is clearly told that the request is waiting for Safe approvals. The
> dapp never receives a fake transaction hash.

## 6. Capability model

Each `safe` account exposes a chain-specific capability derived from fresh
onchain state and linked WalletChan accounts.

| Capability | Meaning | Allowed actions |
| --- | --- | --- |
| `observe` | No supported current owner is available | Portfolio, receive, configuration, activity, approval inspection |
| `approve` | At least one supported current owner can add an approval | All observe actions plus propose and approve |
| `quorumAvailable` | WalletChan can independently authorize enough distinct current owners to reach threshold | All approve actions; still one explicit authorization per owner |
| `readyToExecute` | Current valid approvals meet threshold and Safe nonce is executable | Select executor, re-simulate, and execute |
| `blocked` | Safe is verified but has an unsupported or changed authority configuration | Read-only with a specific blocking reason |

Capabilities are projections, not stored authority. The background recomputes
them after every onchain refresh and immediately before a signature or
broadcast effect.

## 7. UX specification

### 7.1 Add account entry

Add a **Safe** tile to Settings → Add account using Safe's official monogram.
Selecting it opens a compact two-path screen without a repeated introductory
masthead. A horizontal divider with a centered lowercase **or** separates the
paths:

- **Find by owner** with a single **Choose owner account** selector; and
- **Enter Safe address** with the single supporting line “Paste an address to
  check it across chains.”

The address path heading is **Enter Safe address**; the divider owns the word
**or**. Once an owner account is selected, hide the divider and the complete
manual-address path so discovery results remain the only competing content.

`Find by owner account` uses a home-selector-style trigger with a right
chevron. It opens a dedicated picker containing only private-key, seed-phrase,
Ledger, and Bankr accounts. Selecting an account immediately begins discovery; there
is no second confirmation button. The full-screen picker keeps the privacy note
short: “Sent directly to Safe for this search.”

Switching the selection clears previous results. WalletChan never sends the
other local account addresses as part of the lookup. Discovery is not
automatic on startup. Discovery returns four networks at a time so verified
Safes appear while later chains are still being checked. Only the intersection
of visible WalletChan networks and Safe's live registry is queried; hidden
chains are skipped until shown in Network settings. When visible, Ethereum,
Base, Arbitrum, and OP Mainnet lead; later pages follow a checked-in DefiLlama
activity ordering. Candidate rows show one logo per verified chain, and
hovering a logo reveals its chain name. Every shown candidate address has
independent copy and explorer controls beside it; the explorer uses the first
verified network in the activity-prioritized result order. These controls must
not trigger Safe selection.

Selecting a discovered Safe reuses the already verified per-chain snapshots
returned by owner discovery. It must not issue the manual-address probe again
or show the manual “Checking networks…” loading state.

### 7.2 Manual import

The input accepts a normal EVM address or an EIP-3770 chain-prefixed address.
After it becomes valid, WalletChan probes visible eligible chains with bounded
concurrency and streams results into the screen. A chain-prefixed address must
also refer to a visible network; otherwise the UI tells the user to show it in
Settings first.

The screen states are:

1. empty;
2. invalid address;
3. scanning `N` eligible networks;
4. no verified Safe found;
5. verified Safe results;
6. partially unavailable networks; and
7. already imported.

Finding contract code is insufficient. A result is shown as verified only
after WalletChan validates the proxy/deployment lineage and reads current Safe
state.

### 7.3 Discovery results and import review

Discovery and manual import converge on the same review screen. Each candidate
shows:

- verified-chain logos beside the **Verified Safe** heading;
- one card per chain, led by the chain logo and name;
- labeled approval threshold and balance facts;
- Safe version beneath the chain name;
- owner rows labeled as a named WalletChan account, **Your owner account**,
  **External owner**, or **Contract owner**;
- capability badge;
- a per-chain Safe explorer action; and
- an explicit warning for different configurations at the same address across
  chains.

When verified data first appears, scroll the **Verified Safe** section heading
to the start of the nearest scroll area. Use smooth scrolling normally and an
instant scroll when reduced motion is requested, matching transaction-detail
disclosure behavior.

Do not repeat the Safe address or a “N networks verified at exact blocks” line
in this review. The user just selected or entered the address, and the chain
cards already communicate the verified networks. Exact block, singleton,
module, guard, fallback-handler, and full owner-address details belong in the
post-import Security screen.

Unknown authority configuration is marked **Observe only** with the exact
reason. The import button says **Add Safe** or **Add as observe-only**.

### 7.4 Account switcher and connection picker

A Safe row uses the Safe mark rather than an EOA blockie and shows:

- account name;
- shortened Safe address;
- `Safe · 2 of 3`;
- capability status such as `1 needs your approval`; and
- the selected check state.

The ordinary wallet account switcher may select observe-only Safes. Until dapp
support ships, the dapp connection picker keeps Safe rows disabled with
`Dapp support coming` rather than connecting them as EOAs.

### 7.5 Safe home

Selecting a Safe changes the portfolio source to the Safe address. Above
Activity, show an approval rail when non-zero:

> Pending Safe Requests
>
> 2 pending requests

The Safe home keeps the same primary action grammar as every signing account:
Send, Swap, Shield, and More use the shared icon-tile component in the same
order and geometry. Send is capability-aware. Swap and Shield remain visible
but disabled until their reviewed flows create Safe proposals. Approvals and
Security do not appear as homepage buttons. A pending-proposal banner is the
single approvals entry point and account settings remains the security entry
point. The banner uses the Safe mark, **Pending Safe Requests**, one
unresolved-request total, and a compact **View** cue; its entire surface is the
clickable and keyboard-accessible action. Blocked and stale requests still
count as pending; executed, cancelled, replaced, failed, and hidden records do
not.

The Safe surface also has four destinations:

- **Assets** — existing portfolio and Receive behavior using the Safe address;
- **Approvals** — actionable proposal inbox;
- **Activity** — proposal and execution lifecycle;
- **Security** — chain-specific owners, threshold, deployment, modules, guard,
  fallback handler, linked owners, refresh, open in Safe{Wallet}, and remove.

The actionable inbox is labeled **Safe Requests**, carries the official Safe
mark in its header, and repeats the standard account-settings identity treatment
for the Safe address with copy and explorer actions. It contains no standalone
raw **New proposal** button. Proposals enter through WalletChan's reviewed Send,
dapp, WalletConnect, and batch flows. The inbox itself is a single bounded list
with chain-led rows, human action labels, wallet/contact-resolved counterparty
context, and concise approval or execution state instead of call-address cards
and nonce-heavy copy. Rows show a muted **Nonce** label with a high-emphasis
**#N** at the upper left. A verified
future-nonce request remains approvable and is rendered as **Needs approval ·
Queued** before quorum, then **Queued · Execute #N first** once fully signed,
using the referenced row's visible number. Configuration-blocked requests
remain plain **Blocked**. The chain logo carries network context, so rows do not
repeat chain text or the Safe-service origin. A header reload action refreshes
the selected Safe immediately. Active-Safe mount performs the same refresh on
popup/sidepanel open and account switch, without waiting for the alarm.

Activity is the historical ledger for both pending and terminal Safe proposal
records. It reuses the ordinary transaction Activity surface: shared date
headers, one separator-owned list, dapp identity with chain badge, compact
semantic status, and age. Rows sort by nonce descending and render a muted
**Nonce** label with a primary **#N** value. Same-nonce records stay adjacent;
their explicit terminal states replace noisy conflict warnings. Opening a Safe
record from Activity binds Back to Activity rather than the pending inbox.

Send is disabled for `observe`/`blocked` and enabled for `approve` or stronger.
Swap, Bridge, Shield, delegated permissions, and Bankr chat execution are
disabled for Safe in the first complete release unless they route through the
same reviewed Safe proposal builder. No feature may fall through to an EOA or
Bankr transaction path merely because the address is selected.

### 7.6 Create proposal

In-wallet Send and arbitrary call reuse WalletChan's transaction decoding,
clear-signing, asset-change, address, and risk surfaces. A Safe-specific block
adds:

```text
From                 Treasury Safe
Network              Base
Approval needed      2 of 3
Approve with         Apoorv · Seed #1 · #0
After this approval  1 more approval needed
Execution fee        Paid by the executor later
Safe nonce           14
```

Before the first signature, WalletChan shows **Sign offchain**. Pressing it:

1. freezes the reviewed call set and Safe transaction fields;
2. performs account-specific authorization;
3. signs with exactly one chosen linked owner;
4. validates the signature locally;
5. durably records the signature and publication intent; and
6. publishes idempotently to the Safe Transaction Service.

The inline success copy is:

> Signed offchain.

It must not play or display the ordinary transaction-submitted outcome.

### 7.7 Add another local approval

If several eligible owners are present, the proposal detail lists every owner
with `Approved`, `Available`, `External`, or `Unsupported`. The user selects one
available owner and completes a separate auth ceremony. A successful signature
returns to the list; it does not automatically sign the next owner.

The owner picker must disambiguate duplicate addresses represented by multiple
WalletChan account records and choose one canonical signing capability. The
precedence is an explicit product policy, not array order; if two records can
sign the same address, the user chooses which credential path to use.

### 7.8 Approvals inbox

The inbox is cross-chain and sorted by Safe nonce from highest to lowest.
Requests that share a nonce stay adjacent, with the newer proposal first so
replacements and onchain rejections read as one sequence. Each row keeps its
explicit lifecycle status; state no longer silently changes list position.
Only unresolved proposal states appear here. Executed, cancelled, replaced,
and failed proposals remain in Activity, where direct navigation can open their
read-only detail.

Rows show the chain logo, humanized action, resolved counterparty, compact
approval/execution state, and a conflict warning only when needed. Origin,
chain-name text, nonce, threshold detail, validation state, and raw call data
belong on the detail screen. Proposals at the same Safe nonce are grouped.
Opening a row refreshes onchain configuration and the service record before
enabling an action.

### 7.9 Execute

When threshold is met and the proposal nonce equals the Safe's executable
nonce, the primary action becomes **Execute now**. The next screen:

- replays the immutable reviewed calls;
- shows the Safe and all validated approvers;
- selects an executor from capable WalletChan private-key/seed accounts, or a
  Bankr account only after its direct arbitrary-call execution behavior is
  verified;
- explains `Safe sends` separately from `Executor pays gas`;
- estimates and simulates the exact `execTransaction` envelope; and
- allows gas customization only on the outer execution transaction.

Changing the executor or outer gas does not alter the signed Safe transaction.

The execution result stores both identities:

```text
safeTxHash       proposal identity
transactionHash onchain execution identity
```

### 7.10 Replace, reject, hide, and detach

- **Reject with no collected signature** cancels the request locally and
  returns the rejection to its waiting provider route.
- **Reject after any signature** creates Safe's canonical empty self-call at
  the same nonce. It is a separately reviewed proposal, requires fresh owner
  approvals and the normal threshold, and must execute onchain before the
  original is labelled cancelled.
- **Hide** is terminal-record housekeeping only. Pending signed proposals
  cannot be hidden or locally relabelled as rejected; Back is navigation.
- **Detach from dapp** terminates only the provider result route. It never
  deletes a published proposal.

### 7.11 Notifications

Notify only on actionable state transitions:

- a proposal needs one of this wallet's owners;
- threshold is reached;
- a proposal this user approved was replaced;
- execution succeeded or failed; or
- owners, threshold, module, guard, or fallback handler changed.

Default notification text excludes calldata, amounts, token names, and dapp
context. Polling the same state never repeats a notification.

## 8. Proposal lifecycle

Every proposal is an independent durable record keyed by
`chainId + safeAddress + safeTxHash`. A record follows this state machine:

```text
draft
  -> authorizing
  -> approvedLocally
  -> publishing
  -> awaitingApprovals
  -> readyToExecute
  -> executing
  -> executed

Any zero-signature rejectable state -> cancelled
signed proposal -> distinct same-nonce rejection proposal
confirmed rejection execution -> original cancelled
publishing/executing -> ambiguous (lost response; reconcile before retry)
awaiting/ready -> stale | replaced | blocked
executing -> failed (only after a definite non-broadcast or reverted outcome)
```

Rules:

- First-action-wins claims protect approve, publish, hide, detach, and execute.
- Service publication uses a stable idempotency key derived from the proposal
  identity and owner.
- `ambiguous` publication is reconciled against the service before retrying.
- `ambiguous` execution is reconciled by transaction hash/nonce/onchain Safe
  state and is never blindly rebroadcast.
- A normal same-nonce execution marks competing proposals `replaced`; a
  confirmed canonical rejection marks them `cancelled` and terminalizes their
  provider/ERC-5792 result routes.
- An owner, threshold, singleton, module, guard, or fallback change increments
  the configuration epoch and blocks action until a new review.
- A future-nonce proposal may collect and publish owner approvals immediately,
  but cannot estimate or execute the outer transaction early.
- User wall-clock age never deletes a legitimate proposal.

## 9. Provider and WalletConnect contract

Provider support ships only after in-wallet proposal/approval/execution is
stable.

### 9.1 Connection

On a verified, actionable chain, `eth_accounts` exposes the Safe address. Every
request is pinned to:

```text
safeAccountId
safeAddress
chainId
safeConfigEpoch
origin / WalletConnect topic and request ID
tabId / frameId when injected
```

The specific approval owner is selected later and separately pinned before its
signature is released.

### 9.2 `eth_sendTransaction`

- If WalletChan can collect threshold and execute immediately, resolve with the
  real outer transaction hash.
- If more approvals are required, the confirmation screen explains the delayed
  result before publishing anything. **Request approvals** creates the durable
  proposal and keeps the provider route pending until execution.
- **Detach from dapp** returns a rejection/error to the caller while retaining
  the proposal in WalletChan.
- If the result route cannot be made durable, reject before publishing.
- Never return `safeTxHash` as the JSON-RPC result.

### 9.3 ERC-5792

`wallet_sendCalls` is the preferred delayed Safe path:

- return a WalletChan bundle ID after the user authorizes proposal creation;
- report `pending` while approvals are collected;
- use canonical, version-compatible MultiSend for multiple calls;
- attach the real execution receipt after success; and
- report Safe/chain-specific capabilities from `wallet_getCapabilities`.

WalletChan decodes every MultiSend inner call and only permits the canonical
MultiSend target. Arbitrary dapp-requested delegatecall is blocked in v1.

### 9.4 WalletConnect

WalletConnect reuses the same proposal records and UI. Session termination
stops result delivery but does not mutate the proposal. The proposal becomes
`Initiating app disconnected` in Activity.

### 9.5 Unsupported signing methods

Until the EIP-1271 phase, Safe accounts reject `personal_sign`, `eth_sign`, and
all `eth_signTypedData*` methods with a clear unsupported smart-account error.
No owner signature is returned as a signature from the Safe address.

## 10. Data model and storage

### 10.1 Account union

Extend `apps/extension/src/chrome/types.ts`:

```ts
export interface SafeAccount extends BaseAccount {
  type: "safe";
}

export type Account =
  | BankrAccount
  | PrivateKeyAccount
  | SeedPhraseAccount
  | ImpersonatorAccount
  | SafeAccount;
```

The `accounts` row stays small and non-secret. Chain-specific Safe state lives
in its own versioned repository.

### 10.2 New durable keys

Exact encoders and limits are finalized before the first write path.

| Key | Purpose |
| --- | --- |
| `safeAccounts` | Versioned records keyed by Safe account ID, containing import source and chain-scoped verified configuration snapshots. |
| `safeProposals` | Bounded, versioned proposal lifecycle records, immutable Safe transaction fields, local signatures, service state, and optional provider/WC route. |
| `safeSyncState` | Non-authoritative per-chain cursors, last successful sync, and notification dedupe markers. |

Suggested core shapes:

```ts
type DecimalString = `${bigint}`;

interface SafeAccountRecord {
  version: 1;
  accountId: string;
  address: `0x${string}`;
  importedBy: "manual" | "ownerDiscovery";
  chains: Record<string, SafeChainSnapshot>;
}

interface SafeChainSnapshot {
  chainId: number;
  verifiedAtBlock: DecimalString;
  configEpoch: string;
  singleton: `0x${string}`;
  version: string;
  owners: `0x${string}`[];
  threshold: number;
  nonce: DecimalString;
  modules: `0x${string}`[];
  guard: `0x${string}`;
  fallbackHandler: `0x${string}`;
  transactionService: "supported" | "unavailable" | "unsupported";
  capability: SafeCapabilitySnapshot;
}
```

Big integers are stored as validated decimal strings. Cached `capability` is
for display only and never authorizes an effect.

### 10.3 Storage requirements

- Add new keys to `_docs/STORAGE.md` before implementation merges.
- Register them in `chrome/storage/resetManifest.ts` and reset tests.
- Use `withStorageLock` with separate, explicit lock domains for account and
  proposal mutations.
- Enforce record, owner, signature, calldata, page-count, and total-byte caps.
- Decode old/malformed records fail-closed; never spread unvalidated storage
  objects into an RPC or SDK call.
- The new account type is additive, so old users do not need a data rewrite.
  The install/update hook still needs an idempotent compatibility check before
  any existing exhaustive account-type code can read a `safe` row.
- Removing a Safe deletes only Safe metadata and local proposal display state
  after warning about published proposals. It never removes linked owner
  accounts or attempts to delete data from the Safe service.

## 11. Architecture

### 11.1 Safe domain

Create `apps/extension/src/chrome/safe/` with focused modules under roughly
400 lines each:

```text
types.ts                    validated domain types and state enums
accountRepository.ts        safeAccounts IO and removal
proposalRepository.ts       safeProposals IO, locks, claims, limits
deploymentRegistry.ts       canonical chain/version/deployment resolution
onchainState.ts             proxy, owners, threshold, nonce, extensions
capabilities.ts             linked-owner and action capability projection
discovery.ts                manual probing and opt-in owner discovery
transactionBuilder.ts       calls -> Safe transaction fields and local hash
multiSend.ts                strict canonical batch encode/decode
signatureValidation.ts      EOA recovery, owner checks, sorting/packing
ownerAuthorization.ts       PK/seed/Ledger/Bankr signer routing and final rechecks
serviceClient.ts            bounded direct official Safe service client
serviceValidation.ts        schema, hash, and confirmation validation
proposalLifecycle.ts        propose/approve/publish/reconcile orchestration
simulation.ts               exact execTransaction simulation
execution.ts                executor selection and ambiguity-safe broadcast
sync.ts                     foreground refresh and scheduled reconciliation
notifications.ts            deduplicated state-transition notifications
```

Do not introduce a mutable module-level `currentSafe`, `currentProposal`, or
`currentOwner`. Every public effect takes the full pinned identity.

### 11.2 Background routing

Add focused routers rather than Safe logic in `background.ts`:

```text
background/safeAccountRouter.ts    discover, import, list, refresh, remove
background/safeProposalRouter.ts   list, detail, create, approve, hide, detach
background/safeExecutionRouter.ts  estimate, simulate, execute, reconcile
```

Wire them through `background/composition/` and add every message literal to
`messageAccessPolicy.ts`. Initial Safe mutation messages are trusted-wallet-UI
only. Provider methods enter through existing sender/origin validation and
delegate to the same Safe domain.

Suggested trusted UI messages:

```text
findSafesByOwner            requires one exact local account ID
probeSafeAddress
importSafeAccount
getSafeAccounts
refreshSafeAccount
removeSafeAccount
getSafeProposals
getSafeProposal
createSafeProposal
approveSafeProposal
hideSafeProposal
detachSafeProposalRoute
estimateSafeExecution
executeSafeProposal
reconcileSafeProposal
```

Routers validate input and delegate. They never hold signing keys, build
signatures, or contain service/onchain business logic.

### 11.3 UI modules

Create:

```text
components/SafeAccount/
  SafeEntryScreen.tsx
  SafeDiscoveryDisclosure.tsx
  SafeAddressImportScreen.tsx
  SafeImportReviewScreen.tsx
  SafeCapabilityBadge.tsx
  SafeHomeAlert.tsx
  SafeSecurityScreen.tsx

components/SafeApprovals/
  SafeApprovalsScreen.tsx
  SafeProposalRow.tsx
  SafeProposalDetailScreen.tsx
  SafeApprovalProgress.tsx
  SafeOwnerPicker.tsx
  SafeExecutionScreen.tsx
  SafeOutcomeScreen.tsx
```

Presentation models and formatting functions live beside the components and
receive secret-free, already validated background responses. Reuse
`AppScreen`, `AppHeader`, `ListSurface`, `ListItem`, `ConfirmationScreen`,
`OutcomeCard`, `StickyActionBar`, address identity components, and shared copy
buttons.

Update the extension preview harness with deterministic Safe scenarios:

- import scanning and partial failure;
- observe-only Safe;
- approval needed;
- waiting for external owner;
- quorum ready;
- nonce conflict;
- configuration changed; and
- execution success/failure.

### 11.4 Existing code paths that must become Safe-aware

Audit all exhaustive account type decisions, especially:

- `chrome/types.ts` and `chrome/accounts/` repositories;
- account removal, reorder, selection, tab resolution, dapp privacy, and reset;
- `requests/pinnedRequest.ts` and all pending request account-type unions;
- `transactions/requestIntake.ts`, confirmation dispatch, swaps, transfers,
  batches, ERC-7715, force inclusion, and sponsored transfers;
- `AccountSwitcher`, `AccountPickerRow`, `AccountIdentity`, Add Account, Home,
  portfolio, Activity, Receive, Send, Swap, Bridge, Shield, Chat, Settings, and
  WalletConnect;
- background route manifests and audience policy; and
- preview fixtures, QA wallet selectors, and architecture tests.

Unsupported features must fail with an intentional Safe-specific error. A
default branch must never route `safe` through Bankr or local EOA signing.

## 12. Transaction Service backend

The extension calls Safe's official gateway directly; it never accepts an
arbitrary upstream URL and never routes Safe data through WalletChan
infrastructure. The client enforces:

- live Safe Config Service discovery for every advertised EVM network;
- exact `safe-config.safe.global` and `api.safe.global/tx-service/*` host/path
  pinning, with no WalletChan chain allowlist;
- numeric matching for hidden and user-added custom WalletChan chains;
- exact endpoint and HTTP-method allowlist;
- request and response byte limits;
- schema validation;
- pagination and result caps;
- timeouts and no arbitrary redirects;
- bounded concurrency; and
- sanitized errors.

Required operations:

- discover Safes by owner;
- fetch Safe info and pending/multisig transactions;
- fetch one transaction by `safeTxHash`;
- propose a transaction with first confirmation;
- add one owner confirmation; and
- fetch indexing/execution status.

There is intentionally no `apps/website/app/api/safe/` route and no Safe API
environment credential. If Safe later requires private credentials for these
operations, do not silently add a WalletChan proxy: revisit the privacy model
and obtain explicit product approval. Service success is never authority to
sign or execute; the extension independently verifies every response.

Locally created proposal data and signatures remain durable when the service
is unavailable. The UI offers retry and Open in Safe{Wallet}; it never calls a
service outage an onchain failure.

## 13. Security requirements

### 13.1 Review-to-effect binding

The reviewed snapshot includes:

- chain ID and Safe address;
- Safe configuration epoch and verified block;
- singleton/version, owners, threshold, nonce, modules, guard, fallback;
- every Safe transaction field;
- decoded inner calls and raw calldata hash;
- selected owner account ID/type/address and credential-generation binding;
- origin/WalletConnect route; and
- computed `safeTxHash`.

Recheck live authority before signature release and again before execution.
Any material change invalidates the review.

### 13.2 Owner authorization matrix

| WalletChan record | Discover/link | Approve | Execute outer tx | Requirement |
| --- | --- | --- | --- | --- |
| Private key | Yes | Required | Required | Requested-account-only key resolution and final local effect boundary |
| Seed phrase | Yes | Required | Required | Derived account key path with the same local effect boundary |
| Ledger | Yes | Required | Required with native gas | SafeTx EIP-712 signing on-device, recovered signer validation, and centralized Ledger transaction execution |
| Impersonator | Optional discovery | Never | Never | Observe-only even when its address matches an owner |
| Safe | Never treated as its own owner signer | Never recursively in v1 | Never | Nested Safe owners unsupported |
| Bankr | Yes | Required before ship | Only if direct execution capability is verified | Exact `/wallet/sign` Safe EIP-712/hash behavior, recovered signer, current credential tag, session restoration |

Ordinary Safe transaction approval may use an agent password only after an
explicit policy test proves parity for PK, seed, Ledger, and Bankr owner paths. Safe
configuration changes remain master-only when introduced later. Private key
and seed reveal remain blocked for agent passwords.

### 13.3 Service and signature validation

Before showing a service proposal as verified or enabling an action:

1. parse bounded fields;
2. fetch current onchain Safe configuration;
3. validate deployment lineage and supported version;
4. reconstruct the full Safe transaction;
5. recompute the EIP-712 domain and `safeTxHash`;
6. decode canonical MultiSend locally;
7. recover every EOA confirmation and bind it to a distinct current owner;
8. reject duplicate, removed, wrong-chain, wrong-hash, and unknown signature
   types;
9. sort packed signatures by signer address; and
10. simulate the exact execution envelope immediately before broadcast.

Contract-owner signatures remain visible but do not count toward a
WalletChan-executable threshold in v1.

### 13.4 Concurrency and ambiguity

- Claims are persisted before any irreversible operation.
- A service timeout after POST becomes `ambiguous`, not failed.
- An RPC timeout after broadcast becomes `ambiguous`, not retryable.
- Two views approving with the same owner produce at most one published
  confirmation.
- Two views executing the same proposal produce at most one broadcast attempt.
- Removing a linked owner or Safe during an active effect is blocked or waits
  for definite reconciliation.
- Reset treats unresolved Safe effects like other ambiguity-sensitive wallet
  operations.

## 14. Implementation plan

Each step should be a reviewable PR or tightly related PR stack. Do not start
provider support before the in-wallet gates pass.

### Step 0 — Protocol and bundle spike

1. Pin compatible `@safe-global/protocol-kit` and
   `@safe-global/types-kit` versions after reviewing their browser/MV3 bundle,
   Node polyfills, CSP behavior, and license.
2. Resolve the official Safe Config Service directly in the extension and pin
   every returned transaction target to `api.safe.global/tx-service/*`; do not
   add a WalletChan Safe backend or WalletChan chain allowlist.
3. Build fixtures for supported Safe versions, singleton proxies, MultiSend,
   modules, guard, fallback handler, and same-address cross-chain differences.
4. Verify Bankr can produce the exact Safe owner signature format and recover
   to the expected owner address. This is a release blocker, not a follow-up.
5. Decide the initial allowlist from the canonical Safe deployment registry
   and record it in tests, not as duplicated UI constants.

Gate: deterministic local hashes match Safe Protocol Kit and real Safe
transactions on every initially enabled chain/version.

### Step 1 — Account type and safe-by-default feature gates

1. Add `SafeAccount` to the account union and repository queries.
2. Add a central Safe feature-capability policy; default every transaction,
   signature, batch, swap, bridge, delegated permission, and sponsored path to
   unsupported until explicitly integrated.
3. Update account identity, switcher, picker, removal, reorder, tab selection,
   reset, and preview fixtures.
4. Add exhaustive tests that fail when a new `safe` row reaches an EOA/Bankr
   signing path.

Gate: a synthetic Safe can be selected and viewed, and every irreversible
unsupported action fails before signing, API submission, or broadcast.

### Step 2 — Onchain verification and storage

1. Implement versioned Safe account/proposal decoders, repositories, locks,
   limits, and reset behavior.
2. Implement canonical deployment resolution and chain intersection.
3. Verify proxy/singleton, owners, threshold, nonce, modules, guard, fallback,
   and code at an exact block.
4. Derive a configuration epoch from verified authority fields.
5. Add storage documentation and any idempotent lifecycle compatibility work.

Gate: the real-Safe fixture corpus matches Safe{Wallet}; malformed Safe-like
contracts and unsupported configurations fail closed.

### Step 3 — Import and discovery UX

1. Add the Safe Add Account tile and two entry paths.
2. Implement manual chain-prefixed/ordinary address probing with partial
   failure handling.
3. Implement opt-in owner discovery for PK, seed, Ledger, and Bankr addresses.
4. Auto-link matching signing accounts by normalized address and account ID.
5. Build the import review, capability badge, security screen, and remove flow.
6. Cache completed background verification behind bounded, expiring opaque
   receipts so import confirmation performs no duplicate Safe-service/RPC scan;
   fail closed when a receipt is missing, expired, or mismatched.

Gate: users can import the same Safe address on multiple chains without
copying authority state between chains; observe-only behavior is explicit.

### Step 4 — Portfolio and read-only approvals inbox

1. Route portfolio, assets, receive, and explorer links through the Safe
   address.
2. Add bounded backend read routes and extension service client.
3. Fetch pending proposals and rebuild their hashes locally.
4. Validate confirmations and group by chain/nonce/conflict.
5. Add the approvals rail, inbox, proposal detail, sync, and notification
   dedupe without any signing.

Gate: WalletChan displays only locally validated proposals as trusted and
continues to show local Safe data during a service outage.

### Step 5 — Safe transaction builder and clear signing

1. Convert in-wallet Send and arbitrary calls into immutable Safe transaction
   fields.
2. Implement canonical MultiSend encode/decode with strict inner-call limits.
3. Reuse transaction decoding, clear signing, simulation asset changes, and
   address identity UI against the underlying calls.
4. Persist a draft before owner authorization.
5. Block unknown delegatecall and unsupported security configuration.

Gate: single and multi-call proposal hashes match Protocol Kit and Safe{Wallet}
fixtures byte-for-byte.

### Step 6 — Owner approvals for all wallet types

1. Implement owner selection and one-authorization-per-owner UI.
2. Route PK and seed approvals through requested-account-only local key
   resolution, session restoration, and final effect checks.
3. Route Bankr approvals through pinned credentials and recovered-signature
   verification.
4. Validate, deduplicate, sort, and persist signatures before publication.
5. Publish first proposals and later confirmations idempotently.
6. Add signed-offchain/waiting/ready outcomes and notifications.

Gate: PK, seed, Ledger, and Bankr owners can create and confirm proposals visible in
Safe{Wallet}; impersonators and mismatched cached credentials cannot sign.

### Step 7 — Execution

1. Determine readiness from current onchain state and validated signatures.
2. Build the exact `execTransaction` call and executor picker.
3. Estimate and simulate with the current guard and packed signatures.
4. Sign/broadcast the outer transaction through the selected supported EOA
   path with ambiguity-safe effect leasing.
5. Reconcile receipt, Safe nonce, same-nonce conflicts, and service indexing.
6. Store `safeTxHash` and `transactionHash` separately in Activity.

Gate: execution survives popup/service-worker restart, never double-broadcasts,
and losing same-nonce proposals become replaced.

### Step 8 — Injected dapps, ERC-5792, and WalletConnect

1. Enable Safe rows in connection UI only on verified actionable chains.
2. Add durable delayed `eth_sendTransaction` routing with pre-publication user
   choice and explicit detach semantics.
3. Extend pinned request types with Safe account/config identity.
4. Add ERC-5792 bundle IDs and Safe pending/executed status.
5. Route WalletConnect through the same proposal lifecycle and terminal outbox.
6. Run compatibility tests against representative Safe-heavy dapps.

Gate: every successful `eth_sendTransaction` result is a real chain
transaction hash; relay/session replay cannot create a second proposal or
execution.

### Step 9 — Hardening and staged release

1. Run full extension build, typechecks, security architecture tests, storage
   reset tests, UI tests, and browser QA.
2. Update `_docs/IMPLEMENTATION.md`, `_docs/SECURITY.md`, `_docs/STORAGE.md`,
   the relevant domain READMEs, and AGENTS key-file references.
3. Add internal feature flags for read-only, approval, execution, and provider
   capabilities so rollout can stop at a safe boundary.
4. Start with internal/allowlisted Safes, then a read-only cohort, then signing,
   then provider support.
5. Monitor only privacy-safe operational metrics.

Gate: the mainnet checklist in section 17 passes with no unresolved critical
or high-severity finding.

### Later phases

- Safe message approvals and EIP-1271/SIWE compatibility.
- WalletChan-sponsored `execTransaction`.
- Existing canonical Safe4337Module support without auto-installation.
- Safe creation.
- Owner, threshold, module, guard, and fallback management as separately
  reviewed master-only operations.

## 15. Required test plan

### 15.1 Owner matrix

Every propose, confirm, restore-session, stale-account, and agent-password test
runs for:

- Bankr owner;
- private-key owner;
- seed-phrase owner;
- Ledger owner with automated no-device coverage plus real-device QA; and
- impersonator/view-only negative path.

Also test one Safe linked to all four signing types and prove that each
approval requires the intended account's current credential.

### 15.2 Safe configurations

- 1-of-1, 2-of-3, and N-of-N;
- every initially allowlisted Safe version/domain variant;
- same address with different owners/thresholds across chains;
- unsupported contract owner and nested Safe owner;
- no modules, known module, unknown module, guard, custom fallback;
- single call, canonical MultiSend, malformed MultiSend, arbitrary delegatecall;
- current nonce, future-nonce approval before execution eligibility, stale
  nonce, and same-nonce conflicts; and
- service behind RPC head or unavailable.

### 15.3 Lifecycle and concurrency

- close/reopen popup at every proposal state;
- suspend/restart service worker during signing, publication, and execution;
- browser restart while waiting for external approvals;
- two UI surfaces approve simultaneously;
- approval arrives from Safe{Wallet} during local approval;
- POST succeeds and response is lost;
- broadcast succeeds and RPC response is lost;
- dapp reload, tab close, WalletConnect session expiry, and explicit detach;
- linked owner removal, Safe removal, wallet reset, and configuration change
  during an effect; and
- same proposal executing externally while WalletChan is open.

### 15.4 Adversarial inputs

- wrong chain, Safe, nonce, call, operation, gas/refund field, or hash from the
  service;
- duplicate/removed owner confirmations;
- invalid signature length or `v`, wrong EIP-712 domain, and unknown signature
  type;
- Safe-like proxy with spoofed owner methods;
- oversized owner list, calldata, MultiSend, pagination, and response;
- malicious inner delegatecall and trailing MultiSend bytes;
- owner/threshold/module/guard/fallback change after review;
- agent password attempting a future configuration change; and
- default/exhaustive account branches accidentally treating `safe` as Bankr,
  local signer, or impersonator.

### 15.5 UX and accessibility

- popup and sidepanel widths in both themes;
- keyboard/focus order, screen transitions, sticky actions, and back behavior;
- partial network scan failures and offline/service-outage copy;
- address copy icon feedback and explorer links;
- unambiguous approval versus execution labels and sounds;
- long Safe names, many owners, long token values, and unknown calls; and
- deterministic preview screenshots for every Safe scenario.

## 16. Metrics and privacy

Allowed aggregate metrics:

- Safe import started/completed/failed by error category;
- imported Safe capability category;
- proposal created, approval added, ready, execution attempted/succeeded;
- service/RPC timeout category; and
- time between proposal, threshold, and execution as coarse buckets.

Never collect Safe addresses, owner addresses, calldata, `safeTxHash`, token
amounts, dapp origins, Safe names, or owner labels in analytics. Discovery
queries are user-initiated and disclose exactly one user-selected owner address
directly to Safe infrastructure across its supported EVM networks. Safe address
imports use a Safe-service existence preflight followed by onchain contract
verification and disclose no local owner address. WalletChan infrastructure
receives neither flow, nor any Safe proposal or confirmation write.

## 17. Mainnet acceptance checklist

- [x] A Safe is represented by `type: "safe"`; no Safe private key is stored.
- [x] Chain-specific owners, threshold, nonce, deployment, modules, guard, and
      fallback are verified onchain.
- [x] Unknown configurations are observe-only.
- [x] Manual import and opt-in discovery work with partial network failure.
- [x] Safe portfolio, receive, account selection, security, Activity, and
      approval inbox work across supported chains.
- [x] Every service proposal hash and confirmation is locally validated.
- [x] Single and canonical MultiSend calls use WalletChan clear signing.
- [x] Private-key, seed, Ledger, and Bankr owners use explicitly tested approval
      paths.
- [x] Impersonator and unsupported contract-owner paths cannot sign.
- [x] Agent-password policy is tested for all owner types; secret reveal remains
      blocked.
- [x] Each owner approval requires a separate explicit authorization.
- [ ] Real Safe{Wallet} staging QA confirms bidirectional proposal/confirmation interoperability.
- [x] Proposal publication and execution are idempotent across lost responses
      and MV3 restarts.
- [x] Same-nonce conflicts and live configuration changes invalidate readiness.
- [x] Exact `execTransaction` simulation runs immediately before execution.
- [x] `safeTxHash` and onchain `transactionHash` are stored and labeled
      separately.
- [x] `eth_sendTransaction` never returns a Safe proposal hash.
- [x] ERC-5792 and WalletConnect use the same durable proposal state machine.
- [x] Same-chain wallet swaps create ordered Safe proposals without entering
      Bankr or local EOA swap execution; cross-chain Safe bridge remains gated.
- [x] Safe API credentials are absent from extension source and built assets.
- [x] Safe service reads/writes bypass WalletChan infrastructure, and owner
      discovery discloses only one explicitly selected local account address.
- [x] Storage keys, reset behavior, migrations/compatibility, implementation,
      and security documentation are updated.
- [ ] Manual Safe QA matrix passes in installed Chrome and Firefox before release (both production bundles build successfully).

## 18. Definition of done

Safe support is complete for the first release only when a user can import a
real existing Safe, see its verified chain-specific configuration and assets,
create and clear-sign a proposal, approve it through each WalletChan signing
account type, exchange approvals with Safe{Wallet}, execute after quorum, and
observe the correct durable result after browser/service-worker interruptions.

Read-only import by itself is a milestone, not completion. PK-only or
seed-only approval is not completion. Returning a `safeTxHash` to a dapp as a
transaction hash is a release blocker.
