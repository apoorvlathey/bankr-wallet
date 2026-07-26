# Safe account support exploration

> Research status: exploration, not an implementation specification
>
> Last verified: 2026-07-13
>
> Scope: importing and discovering existing Safe smart accounts, owner
> authentication through WalletChan's Bankr/private-key/seed-phrase accounts,
> transaction proposals, approvals, execution, message signing, dapp and
> WalletConnect compatibility, Safe Transaction Service, ERC-4337, gas UX,
> Ambire and Rabby behavior, security, and rollout gates

> Implementation PRD: [`SAFE_ACCOUNTS_PRD.md`](./SAFE_ACCOUNTS_PRD.md)

## Executive recommendation

WalletChan should support Safe as a **shared account with an approval
lifecycle**, not as a fifth flavor of private key and not as a renamed
view-only address.

The best first product is **Bring your existing Safe**:

1. Discover Safes owned by the user's existing WalletChan signing accounts, or
   let the user paste a Safe address.
2. Verify the Safe and its current configuration on every supported chain.
3. Link each Safe to the WalletChan Bankr, private-key, and seed-phrase
   accounts that are current owners.
4. Let the user initiate a transaction from the Safe, review the underlying
   calls with WalletChan's normal clear-signing UI, and approve with one or
   more eligible owner accounts.
5. Publish the proposal and owner signatures through the Safe Transaction
   Service so other owners can approve in WalletChan or Safe{Wallet}.
6. When the threshold is reached, make **Execute now** the primary action and,
   where policy permits, offer WalletChan-sponsored execution so the owner
   does not need native gas.
7. Treat proposed, awaiting approvals, ready, executing, executed, replaced,
   rejected, and expired/stale as real durable states in Activity.

The product promise should be:

> Use your Safe everywhere with WalletChan. Create and review transactions,
> collect approvals, and execute when your Safe is ready.

It should not be:

> A Safe behaves exactly like a normal wallet account.

That distinction matters. Calling `eth_sendTransaction` from an EOA normally
produces an onchain transaction hash. Approving a 2-of-3 Safe transaction may
only produce the first offchain owner signature and a `safeTxHash`; execution
can happen much later. Returning that `safeTxHash` as if it were an Ethereum
transaction hash is incorrect and breaks dapps that poll for a receipt.

Recommended sequencing:

1. Ship discovery/import, verified read-only Safe details, and a unified Safe
   approval inbox.
2. Add in-wallet Send and arbitrary call proposals with Bankr, PK, and seed
   owners, then execute through a selected owner EOA.
3. Add injected-dapp and WalletConnect transaction flows with an explicit
   delayed-execution contract. Prefer ERC-5792 where available because its
   bundle identifier and status polling fit Safe better than
   `eth_sendTransaction`.
4. Add Safe message signing only after an EIP-1271 compatibility program.
5. Add WalletChan-sponsored execution. Reuse the gas-abstraction work at the
   execution layer, but do not silently install a Safe module.
6. Consider Safe creation, owner/threshold management, ERC-4337, passkeys, and
   recovery only after existing-Safe support is proven.

## Product principles

1. **The Safe is the account; owner accounts are approval methods.** The UI
   should say “Approve with Apoorv” rather than making users reason about a
   nested keyring.
2. **Show the next outcome.** “1 of 2 approvals · You can approve” is more
   useful than “nonce 14 / hash 0x…”.
3. **One review, no hidden mutation.** The calls, Safe chain, Safe address,
   nonce, operation, gas/refund fields, and approval hash must remain bound
   from review through signature publication and execution.
4. **Never confuse approval with execution.** Use different verbs, sounds,
   success states, history entries, and notifications.
5. **Coordinate with the existing Safe ecosystem.** Proposals created in
   WalletChan should appear in Safe{Wallet}; confirmations made elsewhere
   should appear in WalletChan.
6. **Onchain state is authority.** Safe infrastructure improves UX but is not
   the source of truth for owners, threshold, nonce, bytecode, modules, guard,
   fallback handler, execution, or signature validity.
7. **Do not modify a Safe to make it work.** Importing a Safe must never install
   a module, guard, fallback handler, delegate, or owner. Those are separate
   threshold-authorized security decisions.
8. **Fail closed on unfamiliar authority.** Unknown singleton versions,
   unsupported owner contracts, unrecognized signature types, unsafe
   modules/guards, or transaction-hash mismatches may remain visible but must
   not be signable until explicitly supported.
9. **Preserve account separation.** A Safe may be owned by several WalletChan
   accounts. Agent-password authority for one owner must not authorize another
   owner or a threshold-wide action.
10. **Make waiting useful.** The user should always know who can approve, what
    is blocking execution, and whether they can safely close the popup.

## The Safe model WalletChan must represent

### A Safe is chain-specific contract state

A Safe address can exist on several chains, but its owners, threshold, nonce,
singleton version, modules, guard, fallback handler, balance, and pending
transactions can differ on each chain. WalletChan can group the same address
as one visual account, but the authority record must be keyed by at least:

```text
safeAccountId -> chainId -> verified Safe configuration
```

Never copy the owner list or threshold learned on Base to Ethereum, even when
the address is identical.

Safe's supported-network registry spans far beyond WalletChan's built-in chain
list and changes independently. Safe support must therefore resolve the live
official Config Service by chain ID rather than hardcode WalletChan networks.
Hidden built-ins and user-added custom EVM chains receive the same Safe support
when the official registry advertises a Transaction Service for that chain.
Version and module availability remain chain-specific.

Official reference:

- [Safe supported networks and canonical deployments](https://docs.safe.global/advanced/smart-account-supported-networks)
- [Safe deployments repository](https://github.com/safe-global/safe-deployments)

### Owners are heterogeneous

Safe owners can be EOAs or smart accounts that validate signatures through
EIP-1271. A WalletChan v1 integration should support an owner only when it can
produce and validate the exact Safe signature form required:

| Owner available in WalletChan | Initial capability | Gate |
| --- | --- | --- |
| Private-key account | Sign Safe transaction/message hash locally | Master or permitted agent auth; stored key/address integrity recheck |
| Seed-phrase account | Sign through the derived local key | Same protections as every seed transaction/signature path |
| Bankr API account | Candidate owner signer through `/wallet/sign` | Prove exact EIP-712/hash signing behavior, signature recovery, chain binding, and pending credential binding before enabling |
| View-only account | Observe Safe and owner status | Never sign, propose as owner, or execute |
| External EOA not in WalletChan | Display as another owner | Approval arrives through Safe Transaction Service or Safe{Wallet} |
| Contract owner | Display initially | Signing is unsupported until its EIP-1271/nested-account flow is explicitly implemented |

Safe accepts multiple signature forms and requires packed signatures to be
sorted by signer address. WalletChan should use the official Protocol Kit for
construction, but independently recover/validate every EOA signer and verify
contract-owner signatures onchain before execution.

Official references:

- [Safe signature types and encoding](https://docs.safe.global/advanced/smart-account-signatures)
- [Protocol Kit signature overview](https://docs.safe.global/sdk/protocol-kit/guides/signatures)
- [EIP-1271](https://eips.ethereum.org/EIPS/eip-1271)

### Transaction identity is not execution identity

A Safe transaction signs these material fields:

- destination;
- value;
- calldata;
- operation (`CALL` or `DELEGATECALL`);
- `safeTxGas`;
- `baseGas`;
- `gasPrice`;
- `gasToken`;
- `refundReceiver`; and
- Safe nonce.

Those fields and the EIP-712 domain produce the `safeTxHash`. The hash
identifies the proposal and collected approvals. Only a later call to
`execTransaction` produces the ordinary chain transaction hash and receipt.

WalletChan must store both:

```text
safeTxHash       proposal/approval identity
transactionHash onchain execution identity, absent until submitted
```

The service-returned hash must be recomputed locally. Never sign, display as
verified, or execute a proposal whose local hash differs.

Official references:

- [Safe transaction signatures guide](https://docs.safe.global/sdk/protocol-kit/guides/signatures/transactions)
- [Execute Safe transactions](https://docs.safe.global/sdk/protocol-kit/guides/execute-transactions)
- [Safe Smart Account concepts and `execTransaction`](https://docs.safe.global/advanced/smart-account-concepts)

### Nonces form a shared queue

All owners share the Safe's sequential nonce. Several proposals can exist for
the same nonce, but only one can execute. A transaction for nonce `n + 1`
cannot execute before nonce `n`. “Rejecting” a proposal locally does not cancel
it onchain, and removing a proposal from a service does not invalidate already
shared signatures. A replacement/rejection transaction normally consumes the
same nonce by executing another approved Safe transaction.

WalletChan should therefore group proposals by nonce, mark conflicts clearly,
show the canonical next nonce, and automatically mark losing same-nonce
proposals as replaced after one executes.

WalletChan-created requests refresh the Safe onchain, then allocate the lowest
free nonce at or above that value while holding the proposal-storage lock. Every unresolved
local or service proposal reserves its nonce, so simultaneous dapp requests
cannot accidentally become replacements. Later nonces remain queued until the
Safe reaches them. Advanced details may explicitly reassign an unsigned request
to any nonce at or above the live nonce; reusing an occupied nonce is presented
as an intentional competing replacement and is never the automatic default.

## Recommended WalletChan account model

### One Safe account, many linked owner capabilities

Add a distinct conceptual account type such as `safe`, but do not store a Safe
private key because none exists. The minimum durable model would contain:

```text
SafeAccount
  id
  address
  name
  discoveredBy | manuallyImported
  chains[]
    chainId
    verifiedAtBlock
    singleton
    version
    owners[]
    threshold
    nonce
    modules[]
    guard
    fallbackHandler
    transactionServiceSupport
  linkedOwners[]
    ownerAddress
    walletchanAccountId
    walletchanAccountType
    chainIds[]
    signingCapability
```

Configuration fields are cacheable display state, not permanent authority.
Refresh them before every signing or execution effect. Subscribe/poll for
`AddedOwner`, `RemovedOwner`, `ChangedThreshold`, module, guard, fallback, and
execution changes, then invalidate pending eligibility immediately.

### Capability levels

Use explicit capability labels rather than overloading view-only:

| Level | Meaning | UX |
| --- | --- | --- |
| Observe | No supported owner is available | Portfolio, configuration, history, pending proposals |
| Approve | At least one supported WalletChan account is a current owner | Can add that owner's approval |
| Quorum available | WalletChan controls enough distinct current owners to reach threshold | Can collect several approvals with explicit per-owner authorization |
| Ready to execute | Valid approvals meet the current threshold and nonce is executable | Can choose an executor or sponsored execution |

Do not label a Safe “fully controlled.” Owners, modules, guards, and fallback
handlers can create authority that a simple M-of-N count does not capture.

### Discovery and import

Offer two complementary paths.

#### Automatic discovery

For one explicitly selected WalletChan Bankr, private-key, or seed-phrase
address, query `getSafesByOwner` on every EVM chain advertised by Safe's live
Config Service. Deduplicate by Safe address and chain, fetch live configuration,
then show a non-destructive review:

> We found 3 Safes you can approve from this wallet.

Discovery is a privacy-sensitive remote query because it links owner addresses
and chains to WalletChan/Safe infrastructure. Make it user-initiated during
the first release, explain the lookup, batch conservatively, and provide manual
import without discovery.

WalletChan returns owner discovery progressively in bounded four-chain pages.
It first intersects Safe's live EVM registry with the user's visible WalletChan
networks, so hidden chains make no request and do not appear in the progress
total. When visible, Ethereum, Base, Arbitrum, and OP Mainnet lead; later pages
use a DefiLlama activity snapshot (24-hour fees with TVL fallback). This
ordering only improves time-to-first-result; eligibility remains the visible
Safe intersection. Verified results append as each page finishes and show chain
logos with hover names. Users can include another Safe-supported built-in or
custom chain by showing/adding it in Network settings before scanning.

Activity references used for the 2026-07-20 ordering snapshot:

- [DefiLlama fees by chain](https://defillama.com/fees/chains)
- [DefiLlama chain TVL API](https://api.llama.fi/v2/chains)

Official reference:

- [`getSafesByOwner`](https://docs.safe.global/reference-sdk-api-kit/getsafesbyowner)

#### Manual import

Accept a numeric chain-prefixed address or ordinary address. Preflight against
every EVM chain advertised by Safe, then verify only candidates onchain. User
RPC configuration—including hidden/custom chains—takes precedence over a
validated no-auth Safe public RPC fallback. Do not accept “has contract code”
as sufficient proof: verify Safe behavior and deployment lineage, read live
owners/threshold/nonce, and show where it was found.

Ambire probes enabled supported networks, then uses Safe creation and info data.
Rabby probes supported chains by trying to read Safe owners and stores the
chains per address. WalletChan should combine the good parts: chain discovery
plus stronger canonical singleton/proxy and live-state verification.

### Auto-linking and changes

Link by exact normalized address, never by display name. If a PK account later
becomes a seed-derived account at the same address, preserve the Safe link via
WalletChan account ID/address reconciliation. If an owner account is removed
from WalletChan, the Safe remains as Observe unless another supported owner is
linked.

When Safe ownership changes:

- newly linked current owners can become available after a fresh auth check;
- removed owners immediately lose approve/execute eligibility;
- a threshold change invalidates all cached “ready” decisions;
- contract owners remain visible but unsupported;
- the UI should show “Safe settings changed” before allowing another action.

## Market and inspected-code comparison

### Summary

| Dimension | Ambire | Rabby | Recommended WalletChan |
| --- | --- | --- | --- |
| Import | Paste address; scan supported enabled networks | Paste address; scan supported chains | Auto-discovery plus manual import |
| Owner model | Safe carries associated imported keys | Separate Gnosis keyring; user chooses an owner/executor | Safe with linked WalletChan owner capabilities |
| Pending coordination | Safe API Kit; imports txs/messages into common request queue | Dedicated Safe transaction/message queue | Unified Activity plus focused Approvals inbox |
| Proposal validation | Rich conversion/humanization; code contains a TODO about trusting returned Safe tx | Rebuilds hashes and validates confirmations before queue display | Recompute hash, validate every signature, then clear-sign underlying calls |
| Batch | MultiSend delegatecall | SDK-built Safe transaction | Official Protocol Kit MultiSend with strict target/version allowlist |
| Execution | Another EOA broadcasts; native fee only for Safe path | Selected account executes | Selected owner/executor or WalletChan sponsor |
| Unsupported configuration | Module-owned null-owner Safe becomes view-only | General SDK path, fewer visible import restrictions | Read-only for unfamiliar versions/authority until supported |
| Dapp UX | Common queued request architecture | Safe-specific approval drawer and queue | Common confirmation plus explicit Safe lifecycle |

### Ambire findings

Ambire has the cleaner account abstraction. A Safe has `safeCreation` metadata
and is routed through a Safe-specific `BaseAccount` implementation. It:

- scans an explicit Safe-network list;
- reads deployment/code and Safe Transaction Service creation/config data;
- marks a Safe whose only owner is the null owner as requiring unsupported
  modules and imports it view-only;
- uses `@safe-global/api-kit` for proposing, confirming, pending transactions,
  messages, and executed-state resolution;
- converts Safe proposals into the same call request model used elsewhere;
- decodes MultiSend calls for human-readable review;
- sorts/combines owner signatures and broadcasts `execTransaction` through a
  separate EOA;
- treats Safe execution gas as native-token-only and does not currently use
  ERC-4337 for Safe accounts;
- accounts for Safe-specific simulation/gas differences; and
- prevents undeployed Safe message signing on a network.

The most important warning is in Ambire's own source: when an `AccountOp`
already contains a Safe Transaction Service object, `getSafeTxn` has a TODO
asking whether blindly trusting it is acceptable. WalletChan should close that
gap by reconstructing the transaction from locally verified fields and
recomputing the hash before signing.

Inspected Ambire commit:
`54db83b1fdb54db345e418cf930cf8edcd9c810a`.

- [Safe account implementation](https://github.com/AmbireTech/extension/blob/54db83b1fdb54db345e418cf930cf8edcd9c810a/src/ambire-common/src/libs/account/Safe.ts)
- [Safe transaction construction, API Kit, MultiSend decoding, and validation helpers](https://github.com/AmbireTech/extension/blob/54db83b1fdb54db345e418cf930cf8edcd9c810a/src/ambire-common/src/libs/safe/safe.ts)
- [Safe discovery and unsupported-module gate](https://github.com/AmbireTech/extension/blob/54db83b1fdb54db345e418cf930cf8edcd9c810a/src/ambire-common/src/controllers/safe/safe.ts)
- [Safe import UI](https://github.com/AmbireTech/extension/blob/54db83b1fdb54db345e418cf930cf8edcd9c810a/src/web/modules/auth/screens/SafeImportScreen/SafeImportScreen.tsx)
- [Safe-supported network and MultiSend constants](https://github.com/AmbireTech/extension/blob/54db83b1fdb54db345e418cf930cf8edcd9c810a/src/ambire-common/src/consts/safe.ts)
- [Safe signing/proposal integration](https://github.com/AmbireTech/extension/blob/54db83b1fdb54db345e418cf930cf8edcd9c810a/src/ambire-common/src/controllers/signAccountOp/signAccountOp.ts)

### Rabby findings

Rabby models Safe as a dedicated `Gnosis` keyring. It:

- imports an address only after finding Safe owner data on supported chains;
- stores a per-address list of networks and periodically expands it;
- builds version-aware Safe EIP-712 typed data, including the pre-1.3 domain
  difference;
- separates transaction build, owner confirmation, service publication, and
  execution;
- maintains dedicated transaction and message queues across every discovered
  chain;
- displays owner confirmation progress and groups conflicting same-nonce
  proposals;
- lets the user view, sign, execute, replace, or reject queued proposals;
- reconstructs a service transaction and checks that its hash matches;
- validates each service-returned confirmation before showing it as trusted;
- selects a separate account for the outer execution transaction; and
- changes send/gas behavior for Safe accounts rather than reserving native gas
  as if the Safe itself were an EOA.

Rabby's strongest reusable UX idea is the cross-chain Safe queue with visible
threshold progress. Its main architectural caution is the mutable singleton
state (`currentTransaction`, `currentSafeMessage`, `safeInstance`) in one
keyring. WalletChan's persistent concurrent pending-request model should keep
each Safe proposal isolated by chain, Safe address, nonce, and `safeTxHash`.

Inspected Rabby commit:
`69cd2655d634ee9d8b838015d97df53e11364264`.

- [Gnosis keyring and version-aware signing](https://github.com/RabbyHub/Rabby/blob/69cd2655d634ee9d8b838015d97df53e11364264/src/background/service/keyring/eth-gnosis-keyring.ts)
- [Safe service construction](https://github.com/RabbyHub/Rabby/blob/69cd2655d634ee9d8b838015d97df53e11364264/src/background/utils/safe.ts)
- [Import and chain discovery controller](https://github.com/RabbyHub/Rabby/blob/69cd2655d634ee9d8b838015d97df53e11364264/src/background/controller/wallet.ts)
- [Safe import UI](https://github.com/RabbyHub/Rabby/blob/69cd2655d634ee9d8b838015d97df53e11364264/src/ui/views/ImportGnosisAddress/index.tsx)
- [Cross-chain transaction queue and confirmation validation](https://github.com/RabbyHub/Rabby/blob/69cd2655d634ee9d8b838015d97df53e11364264/src/ui/views/GnosisQueue/components/GnosisTransactionQueue/GnosisTransactionQueueList.tsx)
- [Cross-chain message queue](https://github.com/RabbyHub/Rabby/tree/69cd2655d634ee9d8b838015d97df53e11364264/src/ui/views/GnosisQueue/components/GnosisMessageQueue)

## Proposed UX

### Entry points

Add **Safe account** under Add account, with two actions:

- **Find my Safes** — explains that WalletChan will check Safe infrastructure
  for Safes owned by the user's current account addresses.
- **Import Safe address** — manual and privacy-preserving except for necessary
  RPC/service validation.

Do not add Safe creation to the first entry screen. Most target users already
have funds in an existing Safe; creation introduces owner selection, threshold,
deployment, recovery, module, and cross-chain-address decisions before the
core integration has proven itself.

### Import review

For each discovered Safe show:

- verified-chain logos beside the review heading;
- one chain-led card with labeled balance and approval threshold;
- linked owners as named WalletChan accounts or **Your owner account**;
- unlinked owners as **External owner** and contract owners as unsupported;
- unsupported contract owners or security-critical extensions;
- capability: View only, Can approve, or Ready to use.

Do not repeat the Safe address or a verified-network count in this review. The
address was just selected or entered, and each chain card already communicates
where the Safe was verified. Full security configuration remains available
after import.

If the same address has materially different configuration across chains, say
so before grouping it.

### Home and account switcher

A Safe account row should use the Safe mark and a capability badge. When
selected, the primary balance is the Safe balance, not the linked owner's
balance. The home action row must remain the same Send, Swap, Shield, and More
component used by signing accounts. Safe capability controls whether Send is
enabled and now gates same-chain Swap as well. Swap preparation creates ordered
Safe proposal calls and opens the shared request screen; it never enters a
Bankr/local EOA swap execution handler. Cross-chain Safe bridge and Shield
remain visible but disabled. Do not add Safe-specific buttons beneath the
action row. When proposals need attention,
show one compact approval banner below the account identity with the Safe mark,
**Pending Safe Requests**, one unresolved-request total, and a quiet **View**
cue. Blocked and stale requests remain pending until hidden or terminal. The
entire banner is the clickable, keyboard-accessible single homepage entry
point:

> 2 pending requests

The Safe detail screen should have:

- Assets
- Approvals
- Activity
- Settings/security

Avoid exposing “owners,” “nonce,” and “modules” on the home screen unless they
change what the user can do.

Safe proposal rows in Activity must resolve custom/built-in chain identity,
normalize Safe service JSON origin metadata into a compact app label, and reuse
the standard date-grouped Warm Midnight transaction ledger. Rows use the same
dapp-media/chain-badge, plain-language intent/context, inline semantic status,
and compact age hierarchy as ordinary Activity. Sort by Safe nonce descending
and show **Nonce** as muted metadata with **#N** in primary text. Do not show
card-per-record buttons, lifecycle badges, or same-nonce conflict warnings in
history; the terminal states already explain the outcome. When proposal
activity exists, do not render the ordinary transaction list's **No activity
yet** state beneath it. Opening a proposal from Activity makes Back return to
Activity, never the pending Safe Requests inbox.

The proposal inbox is titled **Safe Requests** and pairs the official Safe mark
with the title. It reuses the account-settings identity row so the Safe name,
type, address, copy action, and current-chain explorer remain familiar. Requests
use one separator-based list rather than independent button cards: each row
shows a muted **Nonce** label with a high-emphasis **#N** at the upper left,
leads with the chain mark,
describes native sends, token transfers/approvals, batches, and contract
interactions in plain language, then shows a
wallet/contact-resolved counterparty and compact labeled lifecycle state. The
chain name and Safe-service origin are not repeated beside the chain mark.
Future-nonce requests stay signable and publishable: before quorum they show
**Needs approval · Queued**, and at quorum they name the execution dependency
as **Queued · Execute #N first**. Only final execution waits for that nonce;
other blocked causes do not show sequencing copy. A
header reload action refreshes the selected Safe immediately; selecting a Safe
or opening the wallet with that Safe active starts the same refresh without
waiting for the periodic alarm. The inbox does not expose a raw **New
proposal** form; reviewed Send and dapp flows are the proposal entry points.

### New transaction flow

The normal Send/dapp review should retain WalletChan's clear-signing and asset
change surface. Add a Safe status block:

```text
From                 Treasury Safe
Approval needed      2 of 3
You can approve      with Apoorv (Seed #1 · #0)
After approval       1 more approval will be needed
Execution fee        Paid when the transaction executes
Safe nonce           14
```

Advanced details exposes the editable custom nonce only before any supported or
unsupported signature, publication, or execution evidence exists. Saving it
re-verifies the current Safe configuration and onchain nonce, keeps the calls
and initiating-app route immutable, and recomputes the proposal hash. Signed
proposals are never edited; they require the onchain rejection flow.

Primary action by state:

- no linked owner: **View only**;
- can add one signature: **Sign offchain**;
- controls enough owners: **Review approvals** then individually authorize
  each distinct owner; do not silently sign all keys from one click;
- threshold reached: **Execute now**;
- threshold reached and sponsorship eligible: **Execute free** with fee
  details beneath it;
- outer execution prepared or broadcast: passive **Confirming onchain…** while
  automatic receipt/nonce reconciliation runs. Durable execution evidence must
  suppress Execute even if Safe Transaction Service still reports the proposal
  as ready, and only identical signed bytes may be retried in the background.
  A dedicated MV3 alarm keeps the check alive after worker suspension; if all
  trusted receipt RPCs fail, show the explicit yellow retrying RPC notice rather
  than implying the transaction is merely unmined.

After the first signature, show an inline success notice:

> Signed offchain.

Never show the ordinary “Transaction submitted” state at this point.

### Approvals inbox

Sort requests by Safe nonce from highest to lowest. Requests that share a nonce
stay adjacent, with the newer proposal first so replacements and onchain
rejections read as one sequence. Lifecycle state remains explicit on every row
instead of silently controlling list position.

This inbox contains pending requests only. Executed, cancelled, replaced, and
failed proposals remain available through Activity and never appear in the Safe
Requests list.

Each row should show the chain logo, humanized action, resolved counterparty,
compact approval/execution state, and a nonce-conflict warning only when
needed. Origin, chain-name text, nonce, threshold detail, and validation state
belong on the detail screen. Opening a row always re-fetches and revalidates
current Safe state.

### Notifications

Useful browser notifications are:

- a proposal now needs this user's approval;
- the approval threshold has been reached;
- a proposal the user approved was replaced;
- execution succeeded or failed;
- Safe owners/threshold/modules/guard changed.

Do not notify repeatedly for every service poll. Notification payloads must not
include calldata, values, or sensitive dapp context on the lock screen by
default.

### Safe settings

The first release should be read-only and security-focused:

- owners and threshold;
- linked WalletChan owner accounts;
- singleton/version;
- enabled modules;
- guard;
- fallback handler;
- supported chains;
- open in Safe{Wallet};
- refresh/revalidate;
- remove from WalletChan.

Owner, threshold, module, guard, and fallback changes are transactions with
exceptional authority. Add management only later with dedicated clear-signing
and warnings.

## Dapp and WalletConnect behavior

### `eth_accounts` and connection

A selected Safe can be exposed as the connected account only on a chain where
it is verified and has a supported action capability. Observe-only Safes can be
used for portfolio viewing but should not approve a dapp connection that
advertises transaction/signature capability unless WalletChan clearly exposes
them as read-only and rejects signing with EIP-1193 `4100`/unsupported errors.

Pin every request to:

```text
safeAccountId + safeAddress + chainId + safeConfigEpoch + linkedOwnerId
```

The Safe's owner link and configuration must be rechecked at confirmation and
again immediately before signature release or execution.

### `eth_sendTransaction`

There is no fully compatible answer when one WalletChan approval cannot reach
the Safe threshold:

- returning `safeTxHash` is not standards-compliant because it has no Ethereum
  receipt;
- returning success before execution lies to the dapp;
- returning an error after creating a proposal causes a dangerous side effect
  the dapp believes did not occur;
- holding the request open until other owners approve can take indefinitely
  and can be lost when the page navigates.

Recommended policy:

1. **Immediate path:** if WalletChan can collect the required approvals and
   execute now, resolve with the actual onchain transaction hash.
2. **Delayed path:** show “This Safe needs more approvals” before any signature
   or proposal is published. If the user elects **Request approvals**, keep the
   dapp request durably pending and resolve only after execution. Provide an
   explicit **Detach from dapp** action that cancels the RPC request without
   deleting the Safe proposal, and make that distinction unmissable.
3. If WalletChan cannot maintain the caller/result route safely, do not publish
   a proposal from that `eth_sendTransaction` request. Reject before side
   effects and offer the user a separately initiated in-wallet proposal.

This needs targeted compatibility testing with major Safe-heavy dapps. The
policy should preserve WalletChan's user-controlled, non-expiring prompt model;
legitimate multisig approvals can take much longer than an arbitrary timeout.

### ERC-5792

`wallet_sendCalls` is the better conceptual fit. WalletChan can return a bundle
identifier, expose `pending` while Safe approvals are collected, then attach
the execution receipt when available. Capabilities must be Safe/chain-specific,
and WalletChan must clarify whether “atomic” means one Safe MultiSend
transaction.

For multiple calls, use the canonical version-compatible MultiSend deployment
from Safe's registry. `DELEGATECALL` to MultiSend is expected but must be shown
as a trusted batching primitive; arbitrary dapp-requested delegatecalls remain
high risk.

### WalletConnect

Reuse the same Safe pending records and confirmation views. A WalletConnect
session is only a transport; termination, chain changes, or account removal
must not change the pinned Safe or owner. If a session ends while a proposal
exists, stop trying to deliver the result, preserve the Safe proposal in
Activity, and label its initiating dapp as disconnected.

### Message signing and SIWE

A Safe does not create a normal single EOA signature. Owners sign a Safe
message, signatures are aggregated, and the relying application must verify
the Safe through EIP-1271. Safe messages may be coordinated offchain through
the Transaction Service or recorded onchain.

The first message release should:

- support `personal_sign` and EIP-712 only for audited compatibility targets;
- show approval progress like transactions;
- resolve the dapp request only when a threshold-valid prepared signature is
  available;
- verify the final aggregate locally/onchain before release;
- explain that some dapps do not support smart-account signatures;
- treat SIWE as supported only when the relying party actually validates
  EIP-1271/ERC-6492 as applicable; and
- never return one owner's 65-byte signature as though the Safe signed it.

Official reference:

- [Safe message signatures](https://docs.safe.global/sdk/protocol-kit/guides/signatures/messages)

## Transaction Service and infrastructure

### Recommended role

Use the official Safe Transaction Service initially for ecosystem
interoperability:

- discover Safes by owner;
- propose a transaction with the first valid owner signature;
- add confirmations;
- retrieve pending proposals and messages;
- observe execution/indexing state; and
- make WalletChan-created proposals visible in Safe{Wallet}.

The service is centralized infrastructure, not transaction authority. It is
open source and self-hostable, but production API access requires a backend
API key and quota planning. The official API Kit constructor supports a custom
Transaction Service URL.

The implemented privacy model uses credential-free official Safe Transaction
Service origins directly from the extension, matching Ambire's client-side
coordination model. WalletChan does not proxy owner discovery, proposal reads,
or writes. The extension pins origins and operations and applies response byte
limits, deadlines, schema validation, pagination caps, and local authority
verification. An extension-bundled API key would be public and must never be
treated as a secret.

Import confirmation does not repeat that network work. The background retains
the already verified onchain snapshots behind short-lived opaque receipt IDs;
the trusted wallet UI returns those IDs when the user presses Add Safe. Import
binds every receipt to the exact address and selected chains, refreshes only
the local-account capability projection, and writes the account. Missing or
expired receipts require a fresh probe rather than trusting renderer-provided
authority data.

Official references:

- [Safe Transaction Service architecture and endpoints](https://docs.safe.global/core-api/api-safe-transaction-service)
- [Safe Infrastructure architecture](https://docs.safe.global/core-api/api-overview)
- [API keys](https://docs.safe.global/core-api/how-to-use-api-keys)
- [Quotas and limits](https://docs.safe.global/core-api/api-authentication)
- [API Kit constructor and custom service URL](https://docs.safe.global/reference-sdk-api-kit/constructor)
- [Safe Transaction Service repository](https://github.com/safe-global/safe-transaction-service)

### Local verification boundary

Treat every service field as untrusted until checked. At minimum:

1. Fetch the current Safe nonce, owners, threshold, singleton/version, modules,
   guard, and fallback handler from the configured chain RPC.
2. Validate the Safe proxy/deployment against supported Safe artifacts.
3. Parse every numeric/address/bytes field with strict bounds.
4. Reconstruct the Safe transaction and recompute `safeTxHash` locally.
5. Decode MultiSend locally with strict length and operation validation.
6. Recover each EOA confirmation and bind it to a current owner.
7. Validate EIP-1271 contract confirmations onchain when supported.
8. Deduplicate owners and signatures, then sort signatures correctly.
9. Re-simulate the exact `execTransaction` envelope with the actual signatures,
   executor, guard, and current state.
10. Recheck all authority immediately before broadcast.

Do not rely solely on the Transaction Service's decoded transaction. Its
decoder may lag or lack an ABI; WalletChan's clear-signing result should be
locally derived and visibly marked raw/unknown when decoding is incomplete.

## Gas and execution UX

### Who pays

In the standard flow, any EOA can submit `execTransaction`; it does not need to
be a Safe owner. That executor pays the outer native gas. Safe transaction
fields can reimburse an executor, potentially in another gas token, but those
fields are part of the signed intent and add estimation, pricing, and refund
complexity.

First release:

- let the user select an eligible WalletChan PK/seed owner or another supported
  local EOA as executor;
- estimate the full `execTransaction`, including signature count, MultiSend,
  guards, and Safe nonce effects;
- clearly separate “Safe sends” from “executor pays gas”;
- never require the Safe itself to hold native gas when another executor pays;
- do not assume the owner that approved must execute; and
- preserve an already valid signature if the user changes only the outer
  executor fee settings.

### Best-UX target: sponsored execution

Once threshold-valid signatures exist, a WalletChan relayer can submit the
unchanged `execTransaction` and pay native gas. This gives the strongest UX:

> All approvals received · Executing free

The relayer must not alter signed Safe fields and must apply spend/value,
chain, simulation, abuse, and gas caps. Sponsorship eligibility can be decided
after threshold without weakening owner approval.

This is simpler and safer for existing Safes than installing ERC-4337 solely
for WalletChan. It also aligns with `_docs/GAS_ABSTRACTION.md`: gas abstraction
belongs in the normal confirmation/execution experience, not in a separate
mode.

### ERC-4337 later

Safe supports ERC-4337 through a module/fallback handler and Relay Kit. It can
batch, sponsor, or pay gas in ERC-20s, but an existing Safe must already have
the compatible module enabled or approve a security-sensitive configuration
change. Safe documentation currently says the Safe4337Module flow requires
Safe v1.4.1 or newer.

WalletChan should:

- detect and display an already enabled, canonical supported Safe4337Module;
- never enable it during import or ordinary transaction confirmation;
- treat module enablement as a separate threshold-approved settings action;
- validate EntryPoint, module, fallback handler, bundler, paymaster, and module
  version per chain; and
- maintain a standard `execTransaction` escape path.

Official references:

- [Safe and ERC-4337](https://docs.safe.global/advanced/erc-4337/4337-safe)
- [Safe4337Module SDK guide](https://docs.safe.global/sdk/relay-kit/guides/4337-safe-sdk)
- [Safe Relay Kit overview](https://docs.safe.global/sdk/overview)

## Security and threat model

### Configuration substitution

An attacker or stale cache could present the wrong owners, threshold, nonce,
chain, or singleton. Pin the review to a configuration epoch/block and re-read
authority at signature release and execution. A changed configuration forces a
new review.

### Proposal substitution

The Transaction Service or network could return altered calls or gas/refund
fields. Recompute the EIP-712 domain and `safeTxHash`, compare every reviewed
field, and validate every signature. Hash mismatch is terminal for that fetched
record.

### Malicious modules

Safe modules can execute transactions without the normal owner-threshold path.
A malicious module can take over the Safe. WalletChan must inventory modules,
identify canonical audited modules, warn on unknown modules, and avoid claiming
that an M-of-N threshold is the complete authority model.

Official reference:

- [Safe modules and security warning](https://docs.safe.global/advanced/smart-account-modules)

### Broken or malicious guard

A guard can block execution and permanently deny service if it is broken.
Simulation must include the current guard, and execution failure should explain
guard involvement without encouraging blind removal.

Official reference:

- [Safe guards](https://docs.safe.global/advanced/smart-account-guards)

### Fallback handler risk

Fallback handlers extend the Safe and commonly provide EIP-1271/message
behavior. An untrusted handler can introduce arbitrary external behavior.
Version and address must be visible in security details and included in message
compatibility decisions.

Official reference:

- [Safe fallback handlers](https://docs.safe.global/advanced/smart-account-fallback-handler)

### Delegatecall and MultiSend

Safe batching uses `DELEGATECALL` into MultiSend. Allow only canonical
version-compatible MultiSend deployments for WalletChan-created batches and
strictly decode every packed inner call. Arbitrary delegatecalls get a critical
warning or are blocked by initial policy.

### Service censorship, outage, and privacy

Safe Transaction Service can hide, delay, rate-limit, or fail to serve pending
offchain proposals. It also learns Safe addresses, owners queried for
discovery, proposal contents, signers, IP/timing metadata, and messages.

WalletChan should retain locally created proposal material and signatures,
support export/open-in-Safe fallback, distinguish service outage from onchain
failure, and design for a future alternate/self-hosted service. Do not send
unapproved draft calldata to the service before the user authorizes proposal
publication.

### Stale and replayed signatures

A Safe signature is bound to chain/domain, Safe address, nonce, and transaction
fields, but a stale signature can remain valid until its nonce is consumed or
configuration makes it invalid. Never republish signatures to a changed
transaction, never “edit” a signed proposal, and mark same-nonce competitors.

### Authentication and all WalletChan account types

- PK and seed owners use the same master/agent-password rules and session
  restoration as their normal signatures.
- Safe confirmation never adds a second password form. The trusted request UI
  submits the selected account identity only; Bankr and local owner/executor
  paths consume the existing expiry-checked session, attempt the same native
  session restoration as ordinary confirmations, and fail closed when the
  wallet is locked. Passwordless passkey sessions remain valid because a null
  cached plaintext password is not treated as a missing capability.
- A Bankr owner needs the same pending credential-generation binding and final
  account/tag gate as other Bankr signing effects.
- Agent password may authorize an ordinary Safe transaction approval only if
  policy explicitly permits it; owner/threshold/module/guard/fallback changes
  are master-only authority changes.
- Each owner signature is a separate capability release. Unlocking one owner
  does not authorize another.
- View-only accounts never become signers merely because their address matches
  an owner; only a verified signing account link qualifies.

### MV3 lifecycle and concurrency

Safe proposals can outlive the service worker, popup, tab, and WalletConnect
session. Persist each proposal and result route independently. Use
first-action-wins claims for approve/reject/execute, idempotency keys for
service publication, and broadcast-uncertain handling for the outer execution
hash. Never keep a mutable global “current Safe transaction.”

## Proposed module boundaries

The implementation phase should favor focused modules such as:

```text
safeAccountStorage.ts           logical Safe accounts and chain-scoped metadata
safeAccountDiscovery.ts         manual probe and owner-based discovery
safeOnchainState.ts             verified owners/threshold/nonce/extensions
safeDeploymentRegistry.ts       canonical supported artifacts per chain/version
safeTransactionService.ts       bounded API Kit/backend adapter
safeTransactionBuilder.ts       calls -> Safe transaction and local hash
safeSignatureValidation.ts      EOA/EIP-1271 validation and packing
safePendingStorage.ts           durable proposal/message lifecycle
safeTransactionHandlers.ts      propose, approve, execute orchestration
safeMessageHandlers.ts          EIP-1271 message lifecycle
safeSimulation.ts               exact execTransaction simulation
safeExecution.ts                selected-executor and sponsored broadcast
```

`background.ts` remains routing only. UI receives humanized calls, status,
addresses, threshold progress, and validated configuration. It never receives
private keys, mnemonics, API credentials, or an authorization that can be
replayed without a background recheck.

## Testing matrix

### Required owner account matrix

Every signing and execution flow must cover:

| Scenario | Bankr owner | PK owner | Seed owner | Ledger owner | View-only |
| --- | --- | --- | --- | --- | --- |
| Discover Safe by owner | Yes | Yes | Yes | Yes | Optional lookup only |
| Import and link | Yes | Yes | Yes | Yes | Observe only |
| Propose first signature | Required before ship | Required | Required | Automated + device QA | Blocked |
| Add confirmation | Required before ship | Required | Required | Automated + device QA | Blocked |
| Execute with owner EOA | Approval only | Required | Required | Automated + device QA | Blocked |
| Execute with unrelated local EOA | Approval only | Required | Required | Automated + device QA | Blocked |
| Safe message approval | Compatibility-gated | Compatibility-gated | Compatibility-gated | Compatibility-gated | Blocked |
| Owner/module/settings change | Master-only if supported | Master-only | Master-only | Master-only | Blocked |
| Agent password ordinary approval | Explicit policy test | Explicit policy test | Explicit policy test | Explicit policy + device QA | Blocked |

Also test one Safe linked to multiple WalletChan owner types and prove that the
wrong cached password/API key/private key can never approve for another owner.

### Required Safe configuration matrix

- 1-of-1, 2-of-3, and threshold equal to owner count;
- v1.3.0, v1.4.1, v1.5.0, and supported legacy domains;
- same address with different configs on different chains;
- EOA owners, unsupported contract owner, and nested Safe owner;
- no modules, canonical module, unknown module, guard, and custom fallback;
- normal single call, canonical MultiSend, and arbitrary delegatecall;
- nonce zero, queued future-nonce approval across all four signing wallet
  types, execution gating until that nonce becomes current, two proposals at
  one nonce, and stale nonce;
- service proposal whose fields/hash/signatures are malformed;
- owner/threshold/guard change while confirmation is open;
- Safe deployed but Transaction Service unavailable or behind chain head.

### Required flow matrix

- manual import and owner discovery across every visible Safe-supported EVM
  chain, including user-added custom networks, plus hidden-chain exclusion and
  re-inclusion after the user shows the network;
- portfolio, receive, Send, token send, dapp transaction, WalletConnect;
- ERC-5792 single and multi-call;
- create proposal, add approval, threshold reached, execute;
- zero-signature local rejection, signed same-nonce onchain rejection, nonce
  races, terminal-only hiding, and service proposal removal;
- outer execution success, revert, timeout, dropped response, and receipt poll;
- popup close, service-worker restart, browser restart, dapp reload, session
  termination, account switch/removal;
- notification action after owner or Safe configuration changed;
- message/SIWE against EIP-1271-aware and unaware relying parties.

### Adversarial cases

- service swaps chain, Safe, nonce, call, gas token, or refund receiver;
- confirmations contain duplicate owners, invalid `v`, wrong Safe hash, wrong
  chain domain, removed owner, or malicious contract signature;
- MultiSend length confusion, trailing bytes, inner delegatecall, huge batch;
- malicious module executes while a proposal is pending;
- guard changes after simulation;
- same proposal approved simultaneously in WalletChan and Safe{Wallet};
- two WalletChan views attempt execute simultaneously;
- API publication succeeds but response is lost;
- onchain broadcast succeeds but response is lost;
- Transaction Service quota is exhausted or returns oversized data;
- an unsupported Safe-like proxy fakes owner methods;
- agent password tries to add an owner or module;
- user removes the linked owner while a signature is being produced.

## Rollout plan and gates

### Phase 0: read-only spike

- Resolve Safe's live Config Service for every supported EVM chain without a
  WalletChan allowlist.
- Discover/import Safes and verify chain-scoped state.
- Display owners, threshold, nonce, extensions, balances, and pending queue.
- Recompute service transaction hashes and validate confirmations.
- No signing or service writes.

Gate: a corpus of real Safe versions/configurations matches Safe{Wallet} and
all unrecognized configurations fail closed.

### Phase 1: in-wallet proposals

- Send and arbitrary call from the Safe.
- PK and seed owner approvals.
- Safe Transaction Service publication/interoperability.
- Approvals inbox and browser notifications.
- Selected local EOA execution with exact simulation.

Gate: WalletChan and Safe{Wallet} can propose/confirm each other's transactions
without hash drift, duplication, or nonce confusion.

### Phase 2: all owner paths

- Bankr owner approval after capability verification.
- Multiple WalletChan owners with separate authorization.
- Durable concurrent request and MV3 recovery hardening.
- Comprehensive master/agent-password policy.

Gate: the full Bankr/PK/seed/view-only matrix passes and no signer can be
substituted across pending requests.

### Phase 3: dapps and WalletConnect

- Immediate `eth_sendTransaction` execution path.
- Explicit delayed-approval path with no hidden side effect on rejection.
- ERC-5792 pending bundle lifecycle.
- WalletConnect result routing and disconnected-origin behavior.

Gate: compatibility suite covers major Safe-heavy dapps and every resolved
`eth_sendTransaction` value is a real onchain transaction hash.

### Phase 4: messages

- Safe message proposals and approvals.
- EIP-1271 aggregate validation.
- SIWE and typed-data compatibility program.

Gate: no owner signature is ever returned as a Safe signature, and supported
relying parties verify the final result.

### Phase 5: sponsored execution

- WalletChan relay after threshold.
- Per-chain gas, abuse, simulation, and value policy.
- Optional fee-token execution design aligned with gas abstraction research.

Gate: relayer cannot change signed Safe intent and broadcast uncertainty is
idempotent.

### Phase 6: advanced Safe management

- Create a Safe.
- Add/remove/replace owner and change threshold.
- Canonical module/guard/fallback management.
- Existing canonical Safe4337Module and paymaster support.
- Passkey/recovery evaluation.

Each feature needs an independent security review. None is required for the
core “bring your existing Safe” value proposition.

## Mainnet go/no-go checklist

- Every enabled chain/version/deployment is resolved from reviewed canonical
  Safe registries.
- Onchain configuration is checked at review, signature release, and execution.
- Every service proposal hash and confirmation is locally validated.
- Unknown singleton/module/guard/fallback/owner types fail closed for signing.
- Bankr, PK, seed, and view-only behavior matches the required matrix.
- Agent password cannot authorize Safe security-configuration changes.
- Service API keys are not shipped in extension assets.
- Service outage/quota and RPC lag have legible fallbacks.
- Proposal publication is idempotent across MV3 restarts and lost responses.
- Outer execution broadcast uncertainty cannot double-submit.
- Same-nonce conflicts and configuration changes invalidate stale readiness.
- Clear signing decodes single calls and canonical MultiSend locally.
- `eth_sendTransaction` never returns `safeTxHash` as a chain tx hash.
- EIP-1271 messages ship only for verified compatibility targets.
- Sponsored execution preserves the exact owner-approved Safe transaction.
- Documentation, storage migration, implementation, and security references are
  updated during implementation.

## Open decisions

1. **Resolved:** Safe discovery is opt-in every time and sends only one
   user-selected owner address directly to Safe infrastructure. Manual address
   import remains separate.
2. Should a Safe with a linked Bankr owner be enabled in the first signing
   release, or held until Bankr documents raw Safe hash/EIP-712 compatibility?
3. When WalletChan controls enough owners for quorum, should “approve all” ever
   exist, or should every owner always require a separate explicit action?
4. How long can an injected dapp request remain pending while awaiting external
   approvals, and what exact detach/cancel UX avoids hidden side effects?
5. **Resolved:** WalletChan does not operate a Safe API proxy. Reads and writes
   use Safe's official Config and Transaction Service gateway directly.
6. Which Safe versions and contract-owner signature schemes are in the first
   supported allowlist?
7. Should a Safe with an unknown module remain approvable with a critical
   warning, or be read-only until the module is reviewed?
8. Who pays standard execution gas before WalletChan sponsorship: linked owner,
   any local EOA, or an explicitly imported executor account?
9. Should WalletChan auto-execute when threshold is reached? Recommendation:
   no by default; require an execution policy or fresh confirmation because
   state, guard, and simulation may have changed.
10. What notification content is acceptable for shared/organizational Safes?
11. Should future Safe creation target the same deterministic address on every
    supported chain, and how are partial deployments communicated?

## Source log

### Safe protocol, SDK, and infrastructure

- [Safe Smart Account overview](https://docs.safe.global/advanced/smart-account-overview)
- [Safe Smart Account concepts](https://docs.safe.global/advanced/smart-account-concepts)
- [Supported networks and deployments](https://docs.safe.global/advanced/smart-account-supported-networks)
- [Safe signature encoding](https://docs.safe.global/advanced/smart-account-signatures)
- [Protocol Kit transaction signatures](https://docs.safe.global/sdk/protocol-kit/guides/signatures/transactions)
- [Protocol Kit message signatures](https://docs.safe.global/sdk/protocol-kit/guides/signatures/messages)
- [Execute transactions guide](https://docs.safe.global/sdk/protocol-kit/guides/execute-transactions)
- [API Kit overview](https://docs.safe.global/sdk/api-kit)
- [API Kit reference](https://docs.safe.global/reference-sdk-api-kit/overview)
- [`getSafesByOwner`](https://docs.safe.global/reference-sdk-api-kit/getsafesbyowner)
- [Transaction Service overview](https://docs.safe.global/core-api/transaction-service-overview)
- [Transaction Service architecture and endpoints](https://docs.safe.global/core-api/api-safe-transaction-service)
- [Transactions with offchain signatures](https://docs.safe.global/core-api/transaction-service-guides/transactions)
- [Safe Infrastructure architecture](https://docs.safe.global/core-api/api-overview)
- [API keys](https://docs.safe.global/core-api/how-to-use-api-keys)
- [Quotas and limits](https://docs.safe.global/core-api/api-authentication)
- [API Kit custom Transaction Service URL](https://docs.safe.global/reference-sdk-api-kit/constructor)
- [Safe modules](https://docs.safe.global/advanced/smart-account-modules)
- [Safe guards](https://docs.safe.global/advanced/smart-account-guards)
- [Safe fallback handlers](https://docs.safe.global/advanced/smart-account-fallback-handler)
- [Safe and ERC-4337](https://docs.safe.global/advanced/erc-4337/4337-safe)
- [Safe4337Module guide](https://docs.safe.global/sdk/relay-kit/guides/4337-safe-sdk)
- [Safe audits](https://docs.safe.global/advanced/smart-account-audits)
- [Safe Smart Account contracts](https://github.com/safe-global/safe-smart-account)
- [Safe contract releases](https://github.com/safe-global/safe-contracts/releases)
- [Safe deployments](https://github.com/safe-global/safe-deployments)
- [Safe Transaction Service](https://github.com/safe-global/safe-transaction-service)
- [Safe wallet monorepo](https://github.com/safe-global/safe-wallet-monorepo)
- [EIP-1271](https://eips.ethereum.org/EIPS/eip-1271)
- [ERC-4337](https://eips.ethereum.org/EIPS/eip-4337)
- [EIP-5792](https://eips.ethereum.org/EIPS/eip-5792)

### Inspected wallet code

- [Ambire Safe account implementation](https://github.com/AmbireTech/extension/blob/54db83b1fdb54db345e418cf930cf8edcd9c810a/src/ambire-common/src/libs/account/Safe.ts)
- [Ambire Safe library](https://github.com/AmbireTech/extension/blob/54db83b1fdb54db345e418cf930cf8edcd9c810a/src/ambire-common/src/libs/safe/safe.ts)
- [Ambire Safe controller](https://github.com/AmbireTech/extension/blob/54db83b1fdb54db345e418cf930cf8edcd9c810a/src/ambire-common/src/controllers/safe/safe.ts)
- [Ambire Safe import UI](https://github.com/AmbireTech/extension/blob/54db83b1fdb54db345e418cf930cf8edcd9c810a/src/web/modules/auth/screens/SafeImportScreen/SafeImportScreen.tsx)
- [Rabby Gnosis keyring](https://github.com/RabbyHub/Rabby/blob/69cd2655d634ee9d8b838015d97df53e11364264/src/background/service/keyring/eth-gnosis-keyring.ts)
- [Rabby Safe service adapter](https://github.com/RabbyHub/Rabby/blob/69cd2655d634ee9d8b838015d97df53e11364264/src/background/utils/safe.ts)
- [Rabby import/controller flows](https://github.com/RabbyHub/Rabby/blob/69cd2655d634ee9d8b838015d97df53e11364264/src/background/controller/wallet.ts)
- [Rabby Safe import UI](https://github.com/RabbyHub/Rabby/blob/69cd2655d634ee9d8b838015d97df53e11364264/src/ui/views/ImportGnosisAddress/index.tsx)
- [Rabby Safe transaction queue](https://github.com/RabbyHub/Rabby/blob/69cd2655d634ee9d8b838015d97df53e11364264/src/ui/views/GnosisQueue/components/GnosisTransactionQueue/GnosisTransactionQueueList.tsx)

## Bottom line

WalletChan can offer a better Safe experience than treating the address as
watch-only or sending users back to Safe{Wallet}. The winning design is a
native shared-account experience: automatically find the Safes a user can
approve, link them to existing WalletChan owner accounts, clear-sign the real
underlying calls, coordinate approvals across WalletChan and Safe{Wallet}, and
make execution—including sponsored execution—feel like the final step of one
continuous flow.

The hard part is not Safe transaction encoding. It is accurately representing
the time between **I approved** and **the Safe executed**, while remaining
compatible with dapps that were designed around immediate EOA transaction
hashes. WalletChan should make that lifecycle its product advantage rather
than hiding it.
