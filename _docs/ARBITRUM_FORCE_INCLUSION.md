# Arbitrum Nitro delayed-inbox and force-inclusion research

> Research status: exploration, not an implementation specification
>
> Last verified: 2026-07-13
>
> Scope: Arbitrum Nitro Rollup/AnyTrust chains, signed L2 messages through the
> parent-chain delayed inbox, forced inclusion, WalletChan account types,
> transaction tracking, and implementation risks

## Executive conclusion

Arbitrum Nitro has a censorship-resistant path analogous in purpose to the OP
Stack L1 deposit path, but its mechanics and product timing are materially
different.

WalletChan cannot make one L1 portal call that immediately represents a normal
L2 call. The complete Nitro path is:

1. prepare and sign the **actual child-chain transaction**;
2. wrap its serialized bytes as an L2 signed-message payload;
3. submit that payload to the parent-chain `Inbox`, which appends it to the
   delayed queue;
4. wait for the sequencer to consume it normally (currently usually around
   10–15 minutes on Arbitrum One); and
5. only if the message remains unread past the onchain delay deadline, submit a
   second parent-chain transaction to `SequencerInbox.forceInclusion()`.

For Arbitrum One, current onchain parameters make the ordinary upper delay
7,200 Ethereum blocks, roughly 24 hours. The delay is governed and dynamically
buffered, so WalletChan must read it onchain instead of hardcoding “24 hours.”

The recommended first integration, if implementation proceeds, is:

- Arbitrum One and Arbitrum Sepolia only;
- single transactions for **Private Key and Seed Phrase** accounts;
- raw signed L2 transactions submitted with `Inbox.sendL2Message(bytes)`;
- normal delayed-inbox inclusion first, followed by an explicit permissionless
  force step only when `forceInclusionDeadline()` has passed; and
- no Bankr or Impersonator support until the capability gap described below is
  resolved.

This should be presented as **censorship-resistant submission** rather than an
instant “Force Inclusion” toggle. On Nitro, the initial L1 transaction queues
the message; it does not immediately force it into the canonical inbox.

## OP Stack comparison

| Dimension | Current OP Stack path | Arbitrum Nitro path |
| --- | --- | --- |
| First L1 target | `OptimismPortal` | Rollup `Inbox` (delayed inbox) |
| First call | `depositTransaction(...)` | `sendL2Message(0x04 || signedL2Tx)` |
| Child authorization | Deposit semantics derive the L2 sender | A real signed child-chain transaction preserves the EOA sender |
| Parent transactions needed | One | One normally; a second `forceInclusion()` call if censored |
| Expected normal child inclusion | Approximately minutes | Official tutorial says approximately 15 minutes; whitepaper describes a 10-minute sequencer delay |
| Worst-case permissionless force window | OP-chain portal rules | Read from `SequencerInbox`; about 24 hours on Arbitrum One when verified |
| Child value source | Parent call value is deposited | Existing child-chain balance of the signed L2 account |
| Child gas source | Deposit supplies an L2 gas limit | Signed L2 account pays child gas from its child balance |
| Parent fee source | Parent account | Parent account for enqueue; any parent account for force step |
| Known child tx hash | Derived from deposit event | Ordinary hash of the serialized signed L2 transaction, known before enqueue |
| Bankr compatibility | Bankr can submit the portal call | Blocked: Bankr does not expose a raw signed child transaction |
| Ordering | Portal deposit ordering | Delayed messages are FIFO; forcing message `N` consumes all unread delayed messages through `N` |

## Protocol model

Nitro has three relevant parent-chain contracts:

- **Inbox**: user-facing entry point. `sendL2Message()` appends an arbitrary L2
  message to the Bridge's delayed accumulator.
- **Bridge**: stores the delayed-message accumulator and emits the canonical
  `MessageDelivered` event/preimage data.
- **SequencerInbox**: records canonical batches, tracks
  `totalDelayedMessagesRead`, exposes the force deadline, and allows anyone to
  advance the canonical inbox through an eligible delayed message.

The sequencer normally reads delayed messages after enough parent-chain
confirmations to reduce reorg risk. If it does not, any account can call
`forceInclusion()`. The force call creates an empty sequencer batch whose
`afterDelayedMessagesRead` value advances through the selected delayed message.

Force inclusion guarantees that the message becomes part of canonical input.
It does **not** guarantee successful L2 execution. A signed transaction can
still be discarded or fail for the usual reasons: wrong nonce, insufficient
child balance, insufficient fee cap, invalid signature/chain ID, expired state
assumptions, revert, or insufficient gas.

## Recommended signed-transaction path

### 1. Prepare the child transaction

Build an ordinary EIP-1559 (or supported legacy/access-list) transaction for
the Arbitrum child chain with:

- `chainId`: child chain ID;
- `nonce`: child account nonce;
- `to`, `value`, and `data`: original reviewed dapp intent;
- `maxFeePerGas` / `maxPriorityFeePerGas`: child-chain fee fields; and
- `gas`: execution gas appropriate for a delayed-inbox transaction.

Gas needs special treatment. Arbitrum's normal `eth_estimateGas` includes an L1
data component for sequencer submission. A delayed-inbox message pays its data
cost in the parent `sendL2Message` transaction, so the child gas limit should
exclude that component. The official SDK calls NodeInterface at
`0x00000000000000000000000000000000000000C8`:

```solidity
gasEstimateComponents(address to, bool contractCreation, bytes data)
    returns (
        uint64 gasEstimate,
        uint64 gasEstimateForL1,
        uint256 baseFee,
        uint256 l1BaseFeeEstimate
    );
```

Its current helper uses:

```text
childExecutionGas = gasEstimate - gasEstimateForL1
```

WalletChan should add a safety margin to the child execution component and test
the behavior across contract creation, value transfer, reverts, and large
calldata. Do not blindly reuse the ordinary WalletChan Arbitrum gas limit.

### 2. Sign before touching the parent chain

Sign the exact child transaction with the local account key and serialize it.
The child transaction hash is the normal hash of those serialized bytes. It is
known immediately and is the hash to poll on the child RPC.

The signed transaction must remain immutable after enqueue. Fee edits, nonce
replacement, or calldata edits require a newly signed payload and therefore a
new delayed message.

### 3. Encode the Nitro L2 message

Nitro's inner L2 message kind for a signed transaction is decimal `4`.

```text
messageData = 0x04 || serializedSignedChildTransaction
```

Submit it to the parent-chain Inbox:

```solidity
function sendL2Message(bytes messageData) external returns (uint256 messageNum);
```

The outer delayed-message kind emitted by the Bridge is `L2_MSG = 3`.
`sendL2Message()` is nonpayable for this path. The parent transaction pays only
parent gas; L2 value and execution gas come from the signed account's existing
child-chain balance.

The Inbox currently limits message data to `maxDataSize()`. Arbitrum One
returned `117,964` bytes when verified. Always query this value because Nitro
contracts and Orbit configurations are upgradeable/configurable.

Do not use these alternatives for a normal WalletChan EOA transaction:

- `sendUnsignedTransaction(...)`: its L2 sender is the remapped/aliased parent
  poster, not the user's ordinary child EOA.
- `sendContractTransaction(...)`: intended for an aliased L1 contract sender.
- `createRetryableTicket(...)`: useful for parent-to-child contract calls and
  deposits, but it does not preserve an arbitrary original EOA sender.
- `sendL2MessageFromOrigin(...)`: saves event data but requires a codeless
  origin and adds avoidable restrictions; the ordinary function has clearer
  compatibility for WalletChan and Bankr-submitted parent calls.

### 4. Record the delayed-message identity

The successful parent receipt contains both:

```solidity
event InboxMessageDelivered(uint256 indexed messageNum, bytes data);
```

from Inbox, and:

```solidity
event MessageDelivered(
    uint256 indexed messageIndex,
    bytes32 indexed beforeInboxAcc,
    address inbox,
    uint8 kind,
    address sender,
    bytes32 messageDataHash,
    uint256 baseFeeL1,
    uint64 timestamp
);
```

from Bridge. Persist the parent transaction hash, child transaction hash,
`messageIndex`, log block number/hash, `kind`, `sender`, `messageDataHash`,
`baseFeeL1`, and timestamp. These values are needed to construct and audit the
force call later.

For Arbitrum One/Arbitrum Sepolia, the block number in the force preimage is the
Ethereum/Sepolia block containing the event. For an Orbit L3 whose parent is
itself an Arbitrum chain, the contract preimage uses the underlying L1 block
number exposed by the parent Arbitrum block, not simply the parent RPC's local
block height. The official SDK handles this with
`getL1BlockNumberOfArbBlock()`. Do not claim generic L3 support until this path
is implemented and tested.

### 5. Wait for normal delayed-inbox inclusion

Poll the child transaction hash and the parent
`SequencerInbox.totalDelayedMessagesRead()` value.

- If `totalDelayedMessagesRead > messageIndex`, the canonical inbox has already
  consumed the message. A force transaction is unnecessary.
- If the child receipt appears, show its execution status normally.
- A consumed message with no successful receipt may have been invalid/discarded
  or may still be processing. It must not remain labeled simply “pending”
  forever; WalletChan needs a terminal diagnostic state.

The user must avoid sending another child transaction that consumes the same
nonce while the delayed message is waiting. WalletChan should reserve/lock the
nonce locally and warn that activity from another wallet can invalidate the
queued transaction.

### 6. Calculate force eligibility onchain

Current `SequencerInbox.forceInclusion()` checks the parent **block deadline**.
Use:

```solidity
function forceInclusionDeadline(uint64 messageBlockNumber)
    external view returns (uint64 blockNumberDeadline);
```

The force call is eligible only once:

```text
currentParentBlock > forceInclusionDeadline(messageBlockNumber)
```

The strict `>` matters: the implementation reverts with
`ForceIncludeBlockTooSoon` while
`messageBlockNumber + effectiveDelay >= block.number`.

Do not hardcode `maxTimeVariation.delayBlocks`, and do not treat
`delaySeconds` as the current contract's sole eligibility rule. Modern Nitro
can use a delay buffer. The effective block delay is capped by
`delayBlocks` and can shrink toward the configured buffer threshold after
unexpected sequencer delays. `forceInclusionDeadline()` applies pending buffer
changes and is the authoritative read for the target message.

The official TypeScript SDK's `InboxTools.getForceIncludableEvent()` still
derives a conservative search window from both `delayBlocks` and
`delaySeconds`, and does not use `forceInclusionDeadline()`. It is useful as
reference code, but WalletChan should not copy that eligibility calculation
unchanged.

### 7. Build and submit `forceInclusion()`

The current ABI is:

```solidity
function forceInclusion(
    uint256 totalDelayedMessagesRead,
    uint8 kind,
    uint64[2] l1BlockAndTime,
    uint256 baseFeeL1,
    address sender,
    bytes32 messageDataHash
) external;
```

For a selected Bridge `MessageDelivered` event:

```text
totalDelayedMessagesRead = messageIndex + 1
kind                     = event.kind
l1BlockAndTime[0]        = event parent/L1 block number
l1BlockAndTime[1]        = event.timestamp (or containing block timestamp)
baseFeeL1                = event.baseFeeL1
sender                   = event.sender
messageDataHash          = event.messageDataHash
```

Before signing, re-read `totalDelayedMessagesRead`. If it already exceeds the
target index, skip the force call. Then simulate/estimate the exact call. The
contract reconstructs the message hash and checks it against
`Bridge.delayedInboxAccs(messageIndex)`; a stale or malformed preimage reverts.

The force caller need not be the child signer or the parent enqueue signer.
Any account can pay the parent gas. Forcing through index `N` consumes every
unread delayed message through `N` in FIFO order, not just WalletChan's
message. This is expected protocol behavior and should be disclosed in
advanced details.

### 8. Track canonical inclusion and child execution separately

A successful force receipt means the delayed messages were inserted into a
canonical empty batch. Continue polling the known child hash. Suggested states:

```text
preparing-child
  -> submitting-parent
  -> parent-confirmed / waiting-for-sequencer
  -> force-eligible
  -> force-submitting
  -> force-confirmed / child-processing
  -> child-success | child-reverted | child-invalid-or-discarded
```

Suggested persistent metadata:

```typescript
interface ArbitrumDelayedInclusionMeta {
  parentChainId: number;
  childChainId: number;
  inbox: `0x${string}`;
  bridge: `0x${string}`;
  sequencerInbox: `0x${string}`;
  parentSubmissionHash: `0x${string}`;
  childTransactionHash: `0x${string}`;
  messageIndex?: string;
  messageBlockNumber?: string;
  messageBlockHash?: `0x${string}`;
  messageTimestamp?: string;
  kind?: number;
  sender?: `0x${string}`;
  baseFeeL1?: string;
  messageDataHash?: `0x${string}`;
  forceDeadlineBlock?: string;
  forceTransactionHash?: `0x${string}`;
}
```

The exact storage design would require the normal WalletChan storage migration
process and is intentionally not specified here as a code change.

## Current core contracts and parameters

Values below were checked against the official Arbitrum SDK registry and read
from the deployed contracts on 2026-07-13. Treat them as research snapshots,
not permanent constants. Inbox and SequencerInbox are upgradeable proxies.

| Child chain | Parent | Bridge | Inbox | SequencerInbox |
| --- | --- | --- | --- | --- |
| Arbitrum One (`42161`) | Ethereum (`1`) | `0x8315177aB297bA92A06054cE80a67Ed4DBd7ed3a` | `0x4Dbd4fc535Ac27206064B68FfCf827b0A60BAB3f` | `0x1c479675ad559DC151F6Ec7ed3FbF8ceE79582B6` |
| Arbitrum Sepolia (`421614`) | Sepolia (`11155111`) | `0x38f918D0E9F1b721EDaA41302E399fa1B79333a9` | `0xaAe29B0366299461418F5324a79Afc425BE5ae21` | `0x6c97864CE4bEf387dE0b3310A44230f7E3F1be0D` |

Observed `maxTimeVariation()` on both networks:

| Field | Value | Meaning for this feature |
| --- | ---: | --- |
| `delayBlocks` | `7200` | Maximum ordinary block delay before force inclusion |
| `futureBlocks` | `64` | Sequencer batch time-bound parameter, not the force wait |
| `delaySeconds` | `86400` | Sequencer time-bound parameter; approximately 24 hours |
| `futureSeconds` | `768` | Sequencer batch time-bound parameter |

Both SequencerInbox contracts reported `isDelayBufferable() == true`.

Observed buffer snapshots:

| Child chain | `bufferBlocks` | `max` | `threshold` | `replenishRateInBasis` |
| --- | ---: | ---: | ---: | ---: |
| Arbitrum One | `14400` | `14400` | `150` | `500` |
| Arbitrum Sepolia | `14400` | `14400` | `300` | `500` |

Because force inclusion uses `min(delayBlocks, effectiveBufferBlocks)`, the
normal observed effective delay was 7,200 blocks. During an outage the buffer
can deplete, lowering future force deadlines toward the threshold. The owner
can also change time-variation and buffer configuration. Read the current
proxy contracts immediately before presenting estimates and again before the
force call.

## WalletChan account-type support

### Private Key: feasible

WalletChan can prepare and sign the child transaction locally, then sign and
broadcast the parent Inbox call with the same key. The same address needs:

- enough parent native currency for the Inbox call (and possibly force call);
- enough child native currency for L2 gas; and
- enough child balance for the transaction value.

The protocol permits separate parent submitter/forcer accounts, but using the
same locally controlled account is the simplest first UX.

### Seed Phrase: feasible

Same protocol path as Private Key using the derived account key. Tests must
cover derivation/account selection, child signing, parent signing, session
restoration, nonce reservation, service-worker restart, and force resumption.

### Bankr API: not currently equivalent

Bankr `/wallet/submit` can submit the parent Inbox call, but WalletChan first
needs the raw serialized transaction signed for child chain `42161`.
Bankr's current surface provides:

- transaction submission, returning a transaction hash; and
- `personal_sign` / EIP-712 signatures.

It does not provide `eth_signTransaction` or return raw signed transaction
bytes. Submitting the child transaction through Bankr first is not a solution:
it sends the transaction to the sequencer and still does not give WalletChan
the signed bytes to put in the delayed inbox.

Unsigned Inbox transactions and retryable tickets execute from an aliased or
protocol-derived sender, not the reviewed Bankr EOA, so they cannot safely act
on the EOA's arbitrary assets and approvals. A future EIP-7702/delegated
executor design might bridge the gap, but that is a separate authority model
and security project, not parity with the signed-transaction path.

Recommendation: hide/disable Arbitrum censorship-resistant submission for
Bankr accounts until Bankr exposes a verified raw-transaction signing method,
or a separately reviewed delegated design is approved.

### Impersonator: unsupported

Impersonator accounts cannot authorize either the child transaction or parent
transactions and remain view-only.

## Batch transactions

An atomic WalletChan batch that is ultimately represented as one signed child
transaction can use the same single-message path. This includes a locally
signed ERC-7821/EIP-7702 execution transaction after all existing authority and
simulation checks pass.

Nitro also supports an inner batch of signed child transactions. Its raw
message format is:

```text
0x03                                           // L2MessageKind_Batch
|| uint64_be(length(tx1) + 1) || 0x04 || tx1
|| uint64_be(length(tx2) + 1) || 0x04 || tx2
|| ...
```

The parser permits nesting to depth 16 and applies the global message-size
limit. This could enqueue a non-atomic sequential batch in one parent call,
but it adds nonce, partial-failure, size, estimation, and recovery complexity.
Recommendation: do not include this in a first implementation. Prefer one
atomic signed child transaction where available; otherwise require individual
reviewed delayed messages and make their independent outcomes explicit.

## Security and reliability requirements for a future implementation

1. **Preserve the reviewed intent.** The signed child transaction must match
   the approved `from`, chain, target, value, calldata, nonce, gas, and fees.
   Re-run the existing pending-request authorization immediately before child
   signing and again before irreversible parent submission.
2. **Never sign the child transaction with the parent chain ID.** Validate the
   recovered signer and decoded signed transaction before enveloping it.
3. **Validate core-contract relationships onchain.** For a configured Inbox,
   read `bridge()` and `sequencerInbox()`, then confirm the Bridge recognizes
   the Inbox and points at the same SequencerInbox. Do not trust a custom chain
   label or user-supplied address alone.
4. **Treat proxies/configuration as mutable.** Pin supported deployments and
   expected code/ABI versions, monitor upgrades, and fail closed on incompatible
   behavior.
5. **Use bounded parent RPC calls and logs.** Event scans must be address- and
   topic-filtered, block-bounded, reorg-aware, and routed through WalletChan's
   existing safe RPC client.
6. **Handle parent reorgs.** Do not finalize the message preimage from an
   unconfirmed receipt. Store block hash and revalidate the receipt before
   constructing a force call.
7. **Prevent nonce races.** Reserve the child nonce while queued. Detect when
   the nonce has advanced and explain that the delayed transaction may be
   discarded rather than encouraging a blind retry.
8. **Do not promise execution.** Distinguish parent submission, canonical
   inclusion, and child execution in storage and UI.
9. **Avoid duplicate irreversible submission.** Parent submission and force
   submission need the same effect-lease, ambiguity handling, and restart
   reconciliation used by current transaction flows.
10. **Estimate both parent transactions separately.** The Inbox call cost
    scales with signed payload bytes. The exact force call should be estimated
    only when eligible. Unlike OP Stack resource metering, it does not burn L1
    gas proportional to a requested L2 gas limit.
11. **Warn about long-lived transaction assumptions.** Slippage deadlines,
    permit deadlines, oracle conditions, allowances, balances, and fee caps can
    become stale during a 10-minute-to-24-hour wait. Many DeFi transactions are
    poor candidates for this path.
12. **Keep raw signed transactions secret-adjacent.** They are broadcastable
    capabilities until consumed/replaced. Persist only if necessary, encrypted
    or with a narrowly justified lifecycle, and never expose them to the page.

## Chain discovery and support policy

Arbitrum One and Arbitrum Sepolia have canonical core-contract entries in the
official SDK. Arbitrum Nova is also registered there and uses the same Nitro
mechanism, but WalletChan does not currently expose Nova as a built-in active
chain. Orbit chains do not share a universal Inbox address.

For each additional Nitro/Orbit chain WalletChan would need verified metadata:

- child and parent chain IDs/RPCs;
- Rollup, Bridge, Inbox, and SequencerInbox addresses;
- whether the parent is Ethereum or another Arbitrum chain;
- native/custom fee token behavior on both chains;
- current delay-buffer support and configuration;
- message-size limit and deployed ABI/version; and
- explorer links for parent submission, force transaction, and child result.

Do not infer “Arbitrum Stack” support from chain branding or chain ID alone.
Use a reviewed registry entry plus onchain relationship checks. Generic Orbit
L3 support should remain off until underlying-L1 block-number reconstruction is
tested.

## Suggested research-to-implementation phases

1. **Local/fork proof**: reproduce the official tutorial with a locally signed
   child transaction, verify child hash prediction, decode both parent events,
   advance beyond the deadline, and force include.
2. **Arbitrum Sepolia spike**: enqueue a harmless self-transfer/call, observe
   normal delayed inclusion, and separately test force inclusion in an
   environment where the sequencer does not consume the message. Public
   Arbitrum Sepolia normally consumes it, so a deterministic force test likely
   still needs a local Orbit chain or controlled fork.
3. **Failure matrix**: wrong nonce, duplicate nonce, low fee cap, insufficient
   child balance, child revert, parent reorg simulation, stale force preimage,
   already-consumed message, service-worker restart, and parent RPC timeout.
4. **Wallet-type gate**: Private Key and Seed Phrase end-to-end. Explicitly
   assert Bankr and Impersonator are hidden/rejected on both UI and background
   boundaries.
5. **Single-transaction UI**: only after status/recovery behavior is proven.
6. **Atomic batch assessment**: reuse one locally signed child execution tx.
   Defer raw Nitro multi-message batches.

## Open questions before implementation

- Should WalletChan sign with a high fee cap suitable for a 24-hour window, or
  require the user to choose/acknowledge a cap? A low cap can make the message
  canonically included but unexecutable.
- How long should WalletChan reserve a nonce, and how should it reconcile
  activity performed by another wallet instance?
- Should the parent force call use the wallet's account or an optional public
  relayer/keeper? The protocol allows either, but a relayer introduces a new
  availability and privacy boundary.
- What terminal evidence should classify a consumed signed transaction as
  invalid/discarded when no child receipt exists?
- Is raw signed-transaction persistence necessary for restart recovery, or can
  all later logic rely on the stored child hash plus event preimage?
- Does Bankr plan to expose a raw transaction signing endpoint with returned
  serialized bytes and verified signer/chain binding?
- Should the product support only emergency/censorship use, or allow routine
  delayed submission? Routine use creates long nonce locks and poor DeFi UX.

## Primary resources

Protocol and contracts:

- [Nitro whitepaper: delayed inbox and liveness](https://docs.arbitrum.io/nitro-whitepaper.pdf)
- [Current `Inbox.sol`](https://github.com/OffchainLabs/nitro-contracts/blob/67487333202561b74492d07de62a4f56be28560e/src/bridge/Inbox.sol)
- [Current `AbsInbox.sol`](https://github.com/OffchainLabs/nitro-contracts/blob/67487333202561b74492d07de62a4f56be28560e/src/bridge/AbsInbox.sol)
- [Current `IInboxBase.sol` ABI](https://github.com/OffchainLabs/nitro-contracts/blob/67487333202561b74492d07de62a4f56be28560e/src/bridge/IInboxBase.sol)
- [Current `SequencerInbox.sol`](https://github.com/OffchainLabs/nitro-contracts/blob/67487333202561b74492d07de62a4f56be28560e/src/bridge/SequencerInbox.sol)
- [Current `ISequencerInbox.sol` ABI](https://github.com/OffchainLabs/nitro-contracts/blob/67487333202561b74492d07de62a4f56be28560e/src/bridge/ISequencerInbox.sol)
- [Bridge event and delayed accumulator](https://github.com/OffchainLabs/nitro-contracts/blob/67487333202561b74492d07de62a4f56be28560e/src/bridge/AbsBridge.sol)
- [Delay-buffer implementation](https://github.com/OffchainLabs/nitro-contracts/blob/67487333202561b74492d07de62a4f56be28560e/src/bridge/DelayBuffer.sol)
- [Message constants](https://github.com/OffchainLabs/nitro-contracts/blob/67487333202561b74492d07de62a4f56be28560e/src/libraries/MessageTypes.sol)
- [Nitro signed-message parser](https://github.com/OffchainLabs/nitro/blob/a618155919315241665356fe60f3cd00d66d5e46/arbos/parse_l2.go)
- [NodeInterface gas components](https://github.com/OffchainLabs/nitro-contracts/blob/67487333202561b74492d07de62a4f56be28560e/src/node-interface/NodeInterface.sol)

Official SDK and tutorials:

- [`InboxTools`: signing, delayed submission, event lookup, and force call](https://github.com/OffchainLabs/arbitrum-sdk/blob/7948889f97bdbb01ef0ba03a98507027ff5586fa/packages/sdk/src/lib/inbox/inbox.ts)
- [Official network/core-contract registry](https://github.com/OffchainLabs/arbitrum-sdk/blob/7948889f97bdbb01ef0ba03a98507027ff5586fa/packages/sdk/src/lib/dataEntities/networks.ts)
- [Official signed delayed-inbox transaction tutorial](https://github.com/OffchainLabs/arbitrum-tutorials/tree/a9013001a5ea060bbc75ddc62e1bb39619974cda/packages/delayedInbox-l2msg)
- [Official end-to-end force-inclusion tutorial](https://github.com/OffchainLabs/arbitrum-tutorials/tree/a9013001a5ea060bbc75ddc62e1bb39619974cda/packages/force-inclusion)
- [SDK force-inclusion fork tests](https://github.com/OffchainLabs/arbitrum-sdk/blob/7948889f97bdbb01ef0ba03a98507027ff5586fa/packages/sdk/tests/fork/inbox.test.ts)
- [Nitro contract force-inclusion tests](https://github.com/OffchainLabs/nitro-contracts/blob/67487333202561b74492d07de62a4f56be28560e/test/contract/sequencerInboxForceInclude.spec.ts)

Deployment explorers:

- [Arbitrum One Inbox proxy](https://etherscan.io/address/0x4Dbd4fc535Ac27206064B68FfCf827b0A60BAB3f)
- [Arbitrum One SequencerInbox proxy](https://etherscan.io/address/0x1c479675ad559DC151F6Ec7ed3FbF8ceE79582B6)
- [Arbitrum One Bridge](https://etherscan.io/address/0x8315177aB297bA92A06054cE80a67Ed4DBd7ed3a)
- [Arbitrum Sepolia Inbox proxy](https://sepolia.etherscan.io/address/0xaAe29B0366299461418F5324a79Afc425BE5ae21)
- [Arbitrum Sepolia SequencerInbox proxy](https://sepolia.etherscan.io/address/0x6c97864CE4bEf387dE0b3310A44230f7E3F1be0D)
