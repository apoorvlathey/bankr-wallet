# Transaction simulation audit domain

`txSimulation.ts` is now a policy-free stable public facade over focused
simulation modules:

- `types.ts` owns the shared normalized asset-change and raw simulator shapes.
- `constants.ts` owns shared simulation gas caps and canonical infrastructure
  addresses so retry and coordinator paths cannot drift.
- `approvalTypes.ts` owns the released permission-change schema.
- `approvalAbis.ts` owns the exact ERC-20, ERC-2612, Permit2,
  self-delegatecall `multicall(bytes[])`, Multicall3, ERC-7821, and Safe
  MultiSend decode/read contracts used by permission projection.
- `approvalIntents.ts` performs bounded local discovery of direct and
  recognized nested approval intents. Opaque calls are never guessed.
- `approvalLogs.ts` extracts approval intents emitted by successful
  `eth_simulateV1` calls, including approvals hidden inside arbitrary protocol
  execution.
- `approvalProjection.ts` compares pinned pre-state with simulated final
  allowance state and retains only persistent increases or Permit2 expiry
  extensions.
- `residualApprovalCandidates.ts` derives bounded spender candidates only from
  successful positive outgoing fungible transfers, exact approval events, and
  the successful top-level call-target fallback.
- `approvalAllowanceState.ts` owns the shared pinned Multicall3 pre-read and
  exact allowance result decoding for permission and residual candidates.
- `residualApprovalProjection.ts` releases only final nonzero ERC-20
  allowances with complete pre/final reads.
- `approvalSimulation.ts` coordinates the two-pass, block-pinned approval
  simulation, shares its read/replay work with residual-allowance projection,
  and produces explicitly unverified calldata fallback rows when
  `eth_simulateV1` or final readback is unavailable.
- `approvalAttachment.ts` applies the shared projection to single and atomic
  asset results, including authoritative-revert suppression.
- `approvalMetadata.ts` enriches permission rows with bounded token and spender
  display metadata without changing their verification state.
- `stateOverrides.ts` discovers ERC-20 storage slots and constructs retry-only
  balance, approval, and nonce-preserving Permit2 overrides.
- `ethSimulateLogs.ts` is a pure parser for `eth_simulateV1` status and transfer
  logs. It deliberately excludes NFT-shaped logs from fungible-token deltas.
- `ethSimulateClient.ts` owns the raw bounded, block-pinned RPC runner and
  support cache shared by transfer and approval projection.
- `client.ts` owns the bounded RPC client cache used by simulation and retry.
- `nativeCurrency.ts` resolves built-in and user-added native metadata.
- `portfolioPrices.ts` mirrors reset-aware portfolio snapshots as canonical
  native/contract price keys.
- `assetChangeNormalization.ts` owns pure amount, native-change, and decoded NFT
  normalization.
- `nftEnrichment.ts` detects NFT standards and resolves captured post-state
  metadata.
- `tokenEnrichment.ts` applies token-list, preflight, onchain, NFT, and price
  metadata in the established order.
- `metadataRetry.ts` owns the stable token/NFT/native/approval display-metadata
  retry flow.
- `resultBuilder.ts` converts raw simulator output into the public result shape.
- `simulatorContract.ts` owns the canonical simulator bytecode and ABIs.
- `simulatorOverride.ts` installs that bytecode with full replacement storage,
  preventing Safe proxy or other contract-account slots from colliding with
  the simulator's slot-zero NFT receipt array.
- `erc7715Preview.ts` decodes the narrow safe ERC-7715 redemption preview.
- `singleSimulation.ts` owns access-list discovery, retry overrides, and the
  single-call `eth_call` execution order.
- `batchCandidates.ts` owns bounded batch candidate discovery. ERC-7821
  accounts trace their sequential `execute` path; Safe proposals trace the
  underlying calls directly and supplement them with calldata candidates so a
  reverted-but-nonempty Safe fallback access list cannot hide token deltas.
- `batchSimulation.ts` owns atomic batch access-list fallback and bytecode
  execution.
- `ethSimulateBatch.ts` owns the bounded `eth_simulateV1` RPC path and support
  cache.
- `nonAtomicBatch.ts` starts both non-atomic paths together and applies their
  established result precedence.
- `safeSimulation.ts` always uses Safe-aware direct-call discovery for
  Safe-address asset deltas. Once enough signatures exist, it also simulates
  the exact signed `execTransaction`; that outer envelope owns the revert
  verdict because simulator injection at a Safe address replaces its proxy
  runtime and cannot faithfully execute Safe self-calls.

## Persistent approval projection

Approval warnings are intentionally based on the final simulated allowance,
not merely calldata or the presence of an event:

1. A first `eth_simulateV1` run collects successful ERC-20 and Permit2
   approval events. Bounded static decoding supplements direct ERC-20,
   ERC-2612, Permit2, self-delegatecall `multicall(bytes[])`, canonical
   Multicall3, ERC-7821, and Safe MultiSend calls.
2. The coordinator reads every discovered allowance at the pinned parent
   block, then replays the reviewed calls at that same block with allowance
   reads appended.
3. ERC-20 rows survive only when final allowance is greater than pre-state.
   Permit2 rows survive only for an effective amount increase or a live expiry
   extension. Grants fully spent, expired, reduced, or revoked in the same
   batch are omitted.
4. If the second pass or a state read is unavailable, nonzero grant intents
   remain visible as `unverified`; they are never presented as final state.

Residual approval warnings reuse those same bounded passes:

1. Successful positive outgoing fungible transfers identify token/owner rows.
   An exact approval event supplies the spender when available; otherwise only
   the successful top-level call target is considered.
2. One pinned Multicall3 pre-read covers every permission and residual pair.
   One exact reviewed-call replay appends every final allowance read.
3. A residual row is emitted only when both reads are known and the final
   ERC-20 allowance is nonzero. Unchanged maximum allowances therefore remain
   visible, while zero final allowance and incomplete guesses do not become
   actionable warnings.
4. Permission and residual token/spender metadata share one bounded enrichment
   pass, avoiding per-row RPC amplification.

The permission projection never consumes TxSimulator retry overrides, never
traces debug APIs, and never signs or submits. Results are capped at 64
owner/token/spender pairs, nested static decoding is capped at 128 calls and
four levels, configured RPC transport retains its byte/deadline ceilings, and
all untrusted RPC fields are decoded fail-closed. Event detection improves
coverage for arbitrary complex calls but is not treated as proof of persistent
risk without the final allowance readback.

Dependency direction is `types/constants/pure normalization -> metadata and
state-override helpers -> execution paths -> txSimulation facade`. These
modules do not own dapp authorization, credentials, signing, broadcast, Chrome
message routing, or persisted wallet state.

`tests/simulation/tokenLogoRegression.test.ts` requires both the full metadata
path and the preflight fast-retry path to consume the shared per-address logo
resolver, preventing transaction requests from drifting from confirmed receipt
display again.
