# L2 Force Inclusion (OP Stack L1 Deposit)

## Overview

Force Inclusion allows users to bypass L2 sequencer censorship by submitting transactions directly to the L1 OptimismPortal contract. The L2 chain is required to include deposit transactions within ~10 minutes, guaranteeing execution even if the sequencer refuses to process the tx normally.

When enabled, the original L2 transaction is wrapped as an L1 deposit call to the `OptimismPortal.depositTransaction()` contract on Ethereum Mainnet (or Sepolia for testnets). The user pays L1 gas fees instead of L2 gas fees.

## Supported Chains

Force inclusion is available for OP Stack chains that have a portal contract defined in viem's chain definitions. Detection is automatic — `FORCE_INCLUSION_CHAINS` in `chainRegistry.ts` is built by iterating viem chain objects and checking for `sourceId` + `contracts.portal`.

**Currently supported** (mainnet + testnet):

| L2 Chain | Chain ID | L1 Target | L1 Chain ID |
|----------|----------|-----------|-------------|
| Base | 8453 | Ethereum | 1 |
| Unichain | 130 | Ethereum | 1 |
| Optimism | 10 | Ethereum | 1 |
| Blast | 81457 | Ethereum | 1 |
| Zora | 7777777 | Ethereum | 1 |
| Worldchain | 480 | Ethereum | 1 |
| Base Sepolia | 84532 | Sepolia | 11155111 |
| Unichain Sepolia | 1301 | Sepolia | 11155111 |
| Optimism Sepolia | 11155420 | Sepolia | 11155111 |
| Zora Sepolia | 999999999 | Sepolia | 11155111 |
| Worldchain Sepolia | 4801 | Sepolia | 11155111 |

**Not supported**: MegaETH (4326) — marked `isOpStack` for L1 fee display but not in viem's OP Stack chain list, so no portal contract is available.

**Custom chains**: Automatically supported if their chain ID matches any viem OP Stack chain definition.

## Supported Account Types

- **Bankr API** — Deposit tx params are encoded and submitted as an L1 transaction via the Bankr API. **Restricted to L1 chains in `BANKR_SUPPORTED_CHAIN_IDS`** (currently Ethereum mainnet only). Force inclusion of testnets requires PK/Seed because Bankr API can't broadcast to Sepolia.
- **Private Key** — Deposit tx is signed locally and broadcast to L1 RPC
- **Seed Phrase** — Same as Private Key (derived key)
- **Impersonator** — Not supported (cannot sign/submit)

The gear icon visibility is gated by `isForceInclusionSupportedForAccount(l2ChainId, accountType)` in `chainRegistry.ts`, which combines the chain check with the per-account L1-reachability check. The backend confirm handlers (`handleConfirmTransactionAsync`, `handleConfirmBatchTransaction`) re-validate this server-side as defense in depth.

## Architecture

### Key Files

| File | Purpose |
|------|---------|
| `src/chrome/forceInclusion/single.ts` | Core logic: gas estimation, deposit tx building, L1 submission (Bankr + local), progress tracking |
| `src/chrome/forceInclusion/batch.ts` | Batch tx force inclusion: atomic (Bankr ERC-7821) + non-atomic (PK/Seed sequential L1 deposits) |
| `src/chrome/forceInclusion/nonceManager.ts` | Short-lived pending nonce assignment and explicit reset boundaries |
| `src/chrome/forceInclusion/receiptPoller.ts` | Receipt polling, terminal history application, and restart resumption |
| `src/chrome/forceInclusion/broadcastPolicy.ts` | Pure fail-closed policy for ambiguous L1 broadcasts |
| `src/chrome/forceInclusion/splitBatchSequencer.ts` | Durable one-at-a-time execution for user-split batches |
| `src/components/ForceInclusionProgress.tsx` | Multi-step progress UI shown during confirmation |
| `src/constants/chainRegistry.ts` | `FORCE_INCLUSION_CHAINS` map, `isForceInclusionSupported()`, `isForceInclusionSupportedForAccount()` (account-aware gate that hides the gear icon when Bankr can't reach the L1) |
| `src/components/TransactionConfirmation.tsx` | Advanced options gear icon + toggle in tx confirmation screen |
| `src/components/BatchTransactionConfirmation.tsx` | Advanced options gear icon + toggle for batch tx confirmation |
| `src/components/GasEstimateDisplay.tsx` | Re-fetches gas for L1 when force inclusion is toggled |
| `src/components/MultiTxGasEstimateDisplay.tsx` | Re-fetches gas for L1 when force inclusion is toggled (batch txs) |
| `src/chrome/txHandlers.ts` | `forceInclusion` param on both confirm handlers, branches to force inclusion processors |
| `src/chrome/batchTxHandlers.ts` | `forceInclusion` param on both batch confirm handlers, branches to batch force inclusion |
| `src/chrome/background/gasSimulationRouter.ts` + `background/composition/advancedRoutes.ts` | Route `estimateForceInclusionGas` into `forceInclusion/deposit.ts` |
| `src/chrome/background/transactionExecutionRouter.ts` + `background/batchRequestRouter.ts` | Preserve `forceInclusion` through single and batch confirmation handlers |
| `src/chrome/txHistoryStorage.ts` | `ForceInclusionMeta` interface on `CompletedTransaction` |
| `src/components/TxStatusList.tsx` | Custom 2-step status display (L1 Pending → L1 Confirmed / L2 Pending) |
| `src/components/TxDetailModal.tsx` | `ForceInclusionSteps` component, separate L1/L2 explorer links |

### Transaction Flow

```
User toggles "Force Inclusion" in tx confirmation screen
  │
  ├─ Gas re-estimated for L1 (estimateForceInclusionGas message)
  │
  ▼
User clicks Confirm
  │
  ├─ Single tx, atomic Bankr batch: UI stays open showing ForceInclusionProgress
  ├─ Non-atomic PK/Seed batch: popup closes, sub-txs tracked in activity feed
  │
  ▼
Background: confirmTransactionAsync/PK (forceInclusion=true)
  │
  ├─ Bankr path: processForceInclusionBankr()
  │   ├─ Encode OptimismPortal.depositTransaction() calldata
  │   ├─ Submit as L1 tx to Bankr API
  │   └─ waitForTransactionReceipt on L1
  │
  ├─ PK/Seed path: processForceInclusionLocal()
  │   ├─ buildDepositTransaction() on L2 client
  │   ├─ walletActionsL1().depositTransaction() on L1 wallet client
  │   └─ waitForTransactionReceipt on L1
  │
  ▼
Check receipt.status (CRITICAL — see "L1 Receipt Status Handling" below)
  │
  ├─ "reverted" → writeFailure() → activity feed shows "Failed"
  │
  └─ "success" → extractL2Hash(receipt) → tx becomes "pending"
      │
      ├─ Activity feed shows: "L1 Confirmed / L2 Pending"
      ├─ Detail modal shows: ForceInclusionSteps + L1 Tx + L2 Tx explorer links
      │
      ▼
      L2 receipt polling confirms L2 hash → status updated to "success"
        │
        └─ Activity feed shows: "L1 + L2 Confirmed"
```

### Message Types

| Message | Direction | Purpose |
|---------|-----------|---------|
| `estimateForceInclusionGas` | UI → Background | Estimate L1 gas for a single L1 deposit tx |
| `confirmTransactionAsync` | UI → Background | Single tx Bankr path with `forceInclusion: true` |
| `confirmTransactionAsyncPK` | UI → Background | Single tx PK/Seed path with `forceInclusion: true` |
| `confirmBatchTransactionAsync` | UI → Background | Batch Bankr path with `forceInclusion: true` |
| `confirmBatchTransactionAsyncPK` | UI → Background | Batch PK/Seed path with `forceInclusion: true` (accepts pre-computed `gasEstimates` where `gasLimit` = L2 `_gasLimit`) |

All three `confirm*` messages are listed in `EXTENSION_ONLY_MESSAGES` in `background.ts` so content scripts can't forge them.

### Progress Tracking

Progress is communicated from background to the popup/sidepanel via `chrome.storage.local`:

- **Storage key**: `fiProgress:{txId}`
- **Stages**: `building` → `submitting` → `waiting-l1` → `complete` | `error`
- **UI listener**: `ForceInclusionProgress.tsx` uses `chrome.storage.onChanged`

### Transaction History

Force inclusion transactions have a `forceInclusionMeta` field on `CompletedTransaction`:

```typescript
interface ForceInclusionMeta {
  l1TxHash: string;      // L1 deposit tx hash (Ethereum/Sepolia)
  l1ChainId: number;     // 1 or 11155111
  l2ChainId: number;     // Original target chain (e.g. 8453 for Base)
  l2Confirmed?: boolean; // Whether L2 sequencer has included it
}
```

**Status progression**:
1. `"processing"` + `forceInclusionMeta.l1TxHash: ""` → L1 tx being built/submitted
2. `"processing"` + `forceInclusionMeta.l1TxHash: "0x..."` → L1 tx broadcast, awaiting confirmation
3. `"pending"` + `forceInclusionMeta` → L1 confirmed, awaiting L2 sequencer inclusion
4. `"success"` + `forceInclusionMeta` → Both L1 and L2 confirmed

## UI Components

### Transaction Confirmation Screen

- **Gear icon** next to the Network badge (only for OP Stack chains, non-Impersonator accounts)
- Opens a collapsible section with a **Force Inclusion toggle** (Switch)
- When on: Network badge shows original chain + "via Ethereum", gas re-estimates for L1
- On confirm: popup stays open showing `ForceInclusionProgress` with numbered steps

### Activity Feed (TxStatusList)

| State | Status Display | Explorer Link |
|-------|---------------|---------------|
| L1 building/submitting | "L1 Pending" (spinner) | L1 explorer (once hash available) |
| L1 confirmed, L2 pending | "L1 Confirmed" + "L2 Pending" (spinner) | **L1 explorer** (L2 isn't yet indexed by the L2 explorer) |
| Both confirmed | "L1 + L2 Confirmed" | L2 explorer |
| Reverted on L1 | "Failed" with error "L1 deposit transaction reverted onchain" | L1 explorer |

**Explorer link rules** — `handleViewTx` in `TxStatusList.tsx` only routes to the L2 explorer when `tx.status === "success"` (i.e. the L2 receipt poller has confirmed the tx is actually onchain). Until then, every state links to the L1 explorer, because L2 explorers don't index force-inclusion txs until the sequencer includes them — linking earlier just leads to a "tx not found" page.

There's also a fallback guard for the case where `extractL2Hash` failed: `tx.txHash` falls back to the L1 hash, so the L2 link is hidden entirely (`TxDetailModal.tsx`'s "L2 Tx" button) or rerouted to the L1 explorer (`TxStatusList.handleViewTx`) to avoid generating a broken URL like `basescan.org/tx/<L1_hash>`.

### Transaction Detail Modal (TxDetailModal)

- Shows `ForceInclusionSteps` component with 2-step progress tracker
- Separate **L1 Tx** and **L2 Tx** explorer link buttons
- L1 Tx button appears as soon as the L1 hash is known (before confirmation)
- L2 Tx button only appears once `tx.status === "success"` (the L2 sequencer has included the tx and the L2 explorer can resolve it). Hidden during the "L1 Confirmed / L2 Pending" window to avoid sending users to a "tx not found" page.

## Portal Call Encoding and Native-Value Semantics

All Bankr, private-key, and seed-phrase paths use the shared
`buildL1DepositTxParams()` encoder. Bankr signs the returned L1 transaction
remotely; private-key and seed-phrase accounts sign that same transaction
locally.

```typescript
// Minimal ABI for OptimismPortal.depositTransaction
const PORTAL_DEPOSIT_ABI = [{
  type: "function",
  name: "depositTransaction",
  inputs: [
    { name: "_to", type: "address" },      // L2 target address
    { name: "_value", type: "uint256" },    // L2 value (ETH to send on L2)
    { name: "_gasLimit", type: "uint64" },  // L2 gas limit
    { name: "_isCreation", type: "bool" },  // true if contract deployment
    { name: "_data", type: "bytes" },       // L2 calldata
  ],
  stateMutability: "payable",
}];

// Encode with original L2 tx params (NOT buildDepositTransaction output)
encodeFunctionData({
  abi: PORTAL_DEPOSIT_ABI,
  functionName: "depositTransaction",
  args: [l2To, value, l2Gas, isCreation, l2Data],
});
```

**Important**: The args must use the original L2 transaction parameters directly. Do NOT use fields from `buildDepositTransaction`'s return value — those are restructured for viem's internal `depositTransaction` action and will produce incorrect encoding (empty `_to`, empty `_data`).

OP Stack deposits have two independent native-value fields:

- the outer L1 call's `msg.value` becomes the deposit's L2 `mint`
- portal `_value` becomes the native value executed by the L2 call

WalletChan force inclusion is an execution path, not an ETH bridge. The shared
builder therefore keeps `_value = originalL2Tx.value` but always sends the L1
portal transaction with `value = 0`. The reviewed value is spent from the
user's existing L2 balance; the L1 balance pays only L1 gas. Setting both
fields to the original value would silently bridge/mint fresh ETH and would
make the L1 balance check incorrectly require `gas + L2 value`.

## PK/Seed Path: Account Override + L1 Gas Overrides

Local signing broadcasts the shared encoded portal transaction directly:

```typescript
const l1TxParams = await buildL1DepositTxParams(l2Tx, info, l2Gas);
await prepareSignAndBroadcastTransaction(l1WalletClient, {
  account: viemAccount,
  chain: l1Chain,
  to: l1TxParams.to,
  data: l1TxParams.data,
  value: 0n,
  ...(gasOverrides
    ? {
        gas: BigInt(gasOverrides.gasLimit),
        maxFeePerGas: BigInt(gasOverrides.maxFeePerGas),
        maxPriorityFeePerGas: BigInt(gasOverrides.maxPriorityFeePerGas),
      }
    : {}),
});
```

**L1 gas override flow** — when force inclusion is on, `GasEstimateDisplay` fetches L1-side estimates via `estimateForceInclusionGas`. If the user edits any of the gas limit / max fee / priority fee fields in the (PK/Seed-only) editable inputs, the values flow:

```
GasEstimateDisplay edited fields
  → onGasOverrides callback
  → TransactionConfirmation.gasOverrides state
  → confirm message: { type: "confirmTransactionAsyncPK", forceInclusion: true, gasOverrides }
  → handleConfirmTransactionAsyncPK
  → processForceInclusionLocal(txId, pending, account, privateKey, gasOverrides)
  → spread into the locally signed L1 portal transaction
```

If `gasOverrides` is undefined, the local broadcaster estimates its L1 gas and
fees as before. It never changes the zero outer L1 value.

## Gas Estimation

### Why L1 Gas Is Non-Trivial: The OptimismPortal Burn

`OptimismPortal.depositTransaction()` routes through `ResourceMetering._metered()` which calls `Burn.gas(burnAmount)`:

```solidity
// Burn.sol
function gas(uint256 _amount) internal view {
  uint256 initialGas = gasleft();
  while (initialGas - gasleft() < _amount) {}
}
```

This loop **intentionally burns L1 gas** to enforce deposit fairness. The `burnAmount` is computed by an EIP-1559-style formula:

- **Baseline**: proportional to the L2 `_gasLimit` being requested (linear)
- **Multiplier**: scales up exponentially when recent L1 blocks have had many deposits (surge pricing)

Consequences:
- For an 8M L2-gas deposit on a busy L1, the burn alone can be **300k+ L1 gas**
- A hardcoded L1 gas limit (e.g. 200k) **will revert with "out of gas" inside `Burn.gas()`** for any non-trivial L2 tx
- The L1 gas used scales roughly linearly with L2 `_gasLimit` — so setting a smaller `_gasLimit` on the portal call directly reduces L1 cost

### `estimateForceInclusionGas()` (single tx / UI display)

Returns a `GasEstimate`-compatible object with L1 values:

1. Calls `buildL1DepositTxParams()` to build the actual encoded portal call (with L2 gas estimated + 20% buffer, or `DEFAULT_L2_GAS = 8M` fallback)
2. Calls `l1Client.estimateGas()` on the encoded portal call — the L1 RPC actually executes the burn loop during simulation, so the returned value includes the burn cost accurately
3. Estimates the L1 portal call with outer `value: 0`, so the source-chain
   balance requirement is L1 gas only
4. Fetches the L1 balance and the sender's L2 native balance independently;
   the L2 balance is compared with the original transaction value
5. Fetches L1 fees and native ETH price in parallel
6. Applies a 20% buffer to the gas estimate; falls back to `1_000_000n` if `estimateGas` fails

### UI Integration

The `GasEstimateDisplay` component toggles between `estimateGas` and `estimateForceInclusionGas` messages based on the `forceInclusion` prop, with `forceInclusion` in its useEffect dependency array to re-fetch on toggle. For PK/Seed accounts the gas/fee fields remain editable when force inclusion is on; edited values are sent to the background as `gasOverrides` and applied to viem's `depositTransaction` call (see "PK/Seed Path: Account Override + L1 Gas Overrides" above).

The `MultiTxGasEstimateDisplay` component handles both single-tx batches (Bankr atomic, via `batchedTx` prop) and per-call batches (non-atomic PK/SP). For force inclusion mode on non-atomic batches it fetches **two parallel estimates**:

1. **`estimateForceInclusionGas` per call** — for the L1 cost display at the top of the gas fee row
2. **`estimateBatchGasSequential`** — for the editable L2 `_gasLimit` baked into each portal call

The two are kept in separate state (`estimates` vs `passthroughEstimates`) because they represent fundamentally different gas values: one is the L1 tx cost, the other is what gets argued to `depositTransaction()`.

For multi-deposit force inclusion, the UI totals the L1 gas costs before
checking the L1 balance and totals the reviewed native outlay before checking
the L2 balance. The resulting warning names the deficient chain and whether
the missing balance is for gas or transaction value.

**`fallbackUsed` flag on `eth_simulateV1`** — `tryEthSimulateV1` in `batchGasEstimation.ts` returns `Array<{ gasLimit, fallbackUsed }>`. If a `cr.gasUsed` field is missing on a call result (rare, but possible), the function falls back to a hardcoded `200_000n` and sets `fallbackUsed: true` so the UI surfaces it via the same yellow warning banner used for the per-call `eth_estimateGas` fallback. Without this flag, an undersized 200k could silently be baked into a force-inclusion portal `_gasLimit` and revert L2 execution.

### Force Inclusion Batch Path: Background Gas Handling

`processForceInclusionBatchLocal` accepts `precomputedL2GasEstimates?: GasEstimate[]` from the UI. These carry the (possibly user-edited) L2 gas limits. For each deposit:

1. **L2 gas** comes from `precomputedL2GasEstimates[i].gasLimit` (or falls back to running `estimateBatchGasSequential` itself if the UI didn't provide any) → passed as `l2GasOverride` to `buildL1DepositTxParams` → baked into the portal call
2. **L1 gas** is estimated via `l1PublicClient.estimateGas()` on the encoded portal call, with 20% buffer and 1M fallback — not passed from the UI, always freshly computed against the final portal calldata
3. **L1 fees** fetched once via `estimateFeesPerGas()` and shared across all deposits
4. **L1 nonces** fetched once via `getTransactionCount()` and assigned sequentially (`startNonce + i`) — `forceInclusion/nonceManager.ts` is NOT used because it depends on `getRpcUrl()` which may not have L1 chain entries (e.g. Sepolia)

## Batch Transaction Support

Force inclusion works with ERC-5792 batch transactions (`wallet_sendCalls`). The gear icon appears in `BatchTransactionConfirmation.tsx` when the chain supports force inclusion and the active account isn't an Impersonator.

Non-atomic batches with many dependent calls (e.g. `approve → swap`) are the highest-stakes case: each call becomes its own L1 deposit, and the L2 `_gasLimit` baked into each portal call directly drives the L1 burn cost. This section explains how we get those values right.

### Bankr API (Atomic) Batch Flow

Calls are encoded into a single ERC-7821 self-call and wrapped as a single L1 deposit:

```
encodeBatchCalls(calls, walletAddress)  (from batchTxHandlers.ts)
  → { to: walletAddress, data: ERC-7821 encode(calls), value: totalValue }
  → buildL1DepositTxParams(syntheticL2Tx, info)
  → submitTransactionDirect() to Bankr API (L1 tx params)
  → waitForTransactionReceipt on L1
  → check receipt.status → extractL2Hash → L2 receipt polling
```

Popup stays open showing `ForceInclusionProgress` (same as single tx).

### PK/Seed (Non-Atomic) Batch Flow — `processForceInclusionBatchLocal`

Each call becomes a separate L1 deposit transaction:

```
// Phase 0: L2 gas estimation (or use UI-provided override)
  precomputedL2GasEstimates (from UI) OR
  estimateBatchGasSequential(calls, from, l2ChainId)
    ├─ Tier 1: eth_simulateV1 on L2 RPC (dependent calls see prior state)
    ├─ Tier 2: TxSimulator bytecode injection — eth_call + state override
    │          runs simulateBatchGas() sequentially at the user's address
    │          (works on any chain with state override support)
    └─ Tier 3: per-call eth_estimateGas with 500k for failed dependent calls
               (marks each estimate with fallbackUsed: true for UI warning —
                near-extinct in practice now that tier 2 catches the gap)

// Phase 1: Build deposits in parallel (with L2 gas baked in)
  For each call:
    buildL1DepositTxParams(syntheticTx, info, l2GasOverride = BigInt(estimate.gasLimit))
    → encodes OptimismPortal.depositTransaction(_to, _value, _gasLimit=l2Gas, _isCreation, _data)

// Phase 2: Nonce assignment + history writes (sequential)
  startNonce = l1PublicClient.getTransactionCount({ address: from, blockTag: "pending" })
  l1Fees = l1PublicClient.estimateFeesPerGas()  // once, shared
  For each call:
    nonce = startNonce + i
    addTxToHistory({ id: "{bundleId}:{i}", status: "processing", forceInclusionMeta: { l1TxHash: "" } })

// Phase 2.5: L1 gas estimation per deposit (parallel)
  For each prepared deposit:
    l1PublicClient.estimateGas({ to: portal, data: portalCalldata, value })
    → gasLimit × 1.2 (20% buffer)
    → fallback: 1_000_000n
  (Critical — burn cost scales with L2 _gasLimit; a hardcoded 200k reverts inside Burn.gas())

// Phase 3: Broadcast L1 deposits SEQUENTIALLY (with fail-fast)
  for i in 0..N:
    l1WalletClient.sendTransaction({
      to: portal, data, value, nonce, gas: l1GasLimit, maxFeePerGas, maxPriorityFeePerGas,
    })
    → update sub-tx with l1TxHash in forceInclusionMeta
    if broadcast fails → mark this AND all later sub-txs as "failed" → break
  (MUST be sequential. See "L1 Broadcast Ordering" below — parallel sends with
   sequential nonces silently drop on managed RPCs.)

// Phase 4: Wait for L1 receipts concurrently
  For each successful broadcast:
    receipt = waitForTransactionReceipt({ hash: l1TxHash })
    if (receipt.status === "reverted") → mark sub-tx as "failed" (item.success = false)
    else → extractL2Hash → update to "pending" with txHash = l2Hash → startReceiptPolling
  (Concurrent updates here are safe because txHistoryStorage now serializes
   writes via withTxHistoryLock — without it, two parallel updateTxInHistory
   calls would race and one would clobber the other's status update.)

// Phase 5: Aggregate bundle tracking
  trackBatchForceInclusionCompletion — polls local storage every 5s until all sub-txs resolve
  → computes final BundleStatus (200 CONFIRMED / 500 REVERTED / 600 PARTIAL_REVERT)
```

Popup closes after broadcast (consistent with normal non-atomic behavior). Each sub-tx appears in the activity feed with force inclusion 2-step status (L1 Pending → L1 Confirmed / L2 Pending → L1 + L2 Confirmed).

### User-Editable L2 Gas Limits (Non-Atomic PK/Seed Only)

In the rare case where both `eth_simulateV1` AND the TxSimulator bytecode-injection tier fail, the sequential estimator falls back to a hardcoded 500k per call. Since this value is baked into the portal `_gasLimit` and drives L1 burn cost, letting it go unchallenged on mainnet could easily cost the user an extra $10-30. The editable inputs remain available regardless of which tier produced the estimate, so power users can override even a successful simulation result if they want to.

The UI surfaces this via `MultiTxGasEstimateDisplay`:

1. **Detection** — `batchGasEstimation.ts` sets `fallbackUsed: true` on any `GasEstimate` that came from the hardcoded fallback (not a real `eth_estimateGas` or `eth_simulateV1` result). See the `GasEstimate` interface in `gasEstimation.ts`.
2. **Auto-expand** — the gas fee section automatically opens when any estimate has `fallbackUsed: true` (tracked via `autoExpanded` state so manual collapse sticks).
3. **Warning banner** — yellow Bauhaus banner above the gas box with concise, force-inclusion-specific wording:
   - > COULDN'T ESTIMATE N CALL(S) — USING 500K DEFAULT
   - > Edit highlighted row below — too high wastes L1 burn, too low reverts on L2 (burn lost).
4. **Highlighted rows** — affected rows show a warning icon next to the function name, bolded label, yellow-bordered editable input, light yellow input background.
5. **Editable input** — PK/Seed accounts only; Bankr atomic batches aren't editable because Bankr manages gas. Validation: positive integer. Red border if invalid.
6. **Explorer link per call** — each row has a small external-link icon after the function name. Clicking opens `${explorer}/address/${call.to}` so power users can sanity-check the contract's typical gas usage onchain before deciding what number to enter. Tooltip: "View contract on explorer — check past txs to learn typical gas".
7. **Edit propagation** — `MultiTxGasEstimateDisplay` merges `editedGasLimits[i]` into `passthroughEstimates[i].gasLimit` and fires `onGasEstimates`. `BatchTransactionConfirmation` caches the result in `cachedGasEstimates`, passes it via the confirm message as `gasEstimates`, `background.ts` routes it to `handleConfirmBatchTransactionPK`, which forwards it to `processForceInclusionBatchLocal` as `precomputedL2GasEstimates`.

The L1 cost shown to the user is the initial estimate (computed before editing). A small italic note — "L1 cost is re-estimated at broadcast based on these values" — tells power users that bumping the L2 gas will change the final L1 burn.

### Key Design Decisions

1. **L1 nonces managed manually** — `l1PublicClient.getTransactionCount({ blockTag: "pending" })` fetched once, nonces assigned sequentially (`startNonce + i`). The `pending` blockTag is critical: `latest` would return the last *mined* nonce and collide with any in-flight L1 tx the user already has. Avoids dependence on `forceInclusion/nonceManager.ts` which uses `getRpcUrl()` and doesn't know about L1 chain IDs like Sepolia.
2. **L1 fees fetched once** — Single `estimateFeesPerGas()` call shared for all deposit txs (they all go to the same portal on the same L1).
3. **L1 gas estimated per deposit at broadcast time** — Not passed from the UI. Uses `l1PublicClient.estimateGas()` which runs the portal's burn loop during simulation and returns the accurate value. 20% buffer, 1M fallback.
4. **L2 gas estimated sequentially via `estimateBatchGasSequential`** — Same function the normal non-atomic batch flow uses. Shared logic means dependent-call state propagation is handled the same way (3-tier: eth_simulateV1 → TxSimulator bytecode injection → per-call fallback with `fallbackUsed` flag).
5. **User overrides flow through end-to-end** — Edited L2 gas limits in the UI bake into the portal `_gasLimit` in the background, and the L1 `estimateGas` is then run against the finalized portal calldata so the L1 burn reflects the user's choice.
6. **Non-atomic popup closes after broadcast** — Consistent with the normal non-atomic flow. Each sub-tx appears in the activity feed independently with its own force inclusion 2-step status. Atomic (single-L1-deposit) force inclusion keeps the popup open with `ForceInclusionProgress`, same as single tx.
7. **L1 broadcast is sequential, not parallel** — See "L1 Broadcast Ordering" below. Strict L1 RPCs (Alchemy, Infura, etc.) silently park nonce N+1 in the queued pool if it arrives before nonce N, then evict it without propagating. The node still returns a hash from `eth_sendRawTransaction` (computed locally from the signed bytes) so we'd record it and show "L1 Pending" forever while Etherscan never sees the tx.

### L1 Broadcast Ordering

`processForceInclusionBatchLocal` Phase 3 broadcasts L1 deposits one at a time in a `for` loop with `await`, NOT in `Promise.all`. This is a hard correctness requirement, not a performance choice:

- **Symptom of getting it wrong**: One or more sub-txs are stuck on "L1 Pending" forever. The activity feed shows a hash, but Etherscan reports "Transaction Hash not found on Ethereum" for that hash. Eventually `waitForTransactionReceipt` times out at `L1_RECEIPT_TIMEOUT` (10 min) and the sub-tx flips to "failed: L1 receipt timeout".
- **Why parallel breaks**: With `Promise.all`, two `eth_sendRawTransaction` calls hit the L1 RPC within milliseconds of each other. There's no guarantee about which lands first. If nonce N+1 arrives before nonce N, strict managed RPCs (Alchemy, Infura, QuickNode) park the higher-nonce tx in the "queued" pool — and most of them then evict it after a short timeout *without ever propagating it to peers*. The JSON-RPC call still returns successfully because the hash is computed deterministically from the signed bytes (it doesn't require network state), so the wallet records the hash and shows the tx as "pending" while it's actually a phantom.
- **Why L2 non-atomic broadcasts get away with it**: The L2 non-atomic batch path (`processBatchTransactionNonAtomicInBackground` in `batchTxHandlers.ts`) DOES use `Promise.all` for parallel broadcast. This works on L2 because chain-specific RPCs (Base sequencer, Optimism, etc.) have looser mempool semantics and don't aggressively evict queued nonces. Don't generalize from L2 to L1.
- **Fail-fast**: If broadcast `i` fails, the sequential loop marks `i+1..N-1` as `"failed"` ("Skipped — earlier deposit failed") and breaks. Their nonces depend on tx `i` landing, so submitting them now would just produce more phantom hashes.
- **Cost**: A typical batch is 2 calls (approve + swap). Sequential broadcast adds ~1s vs the parallel path. Negligible.
- **Diagnostic logs**: `[ForceInclusion] batch start: ... startNonce=N` on entry, `broadcasting L1 deposit i/N: ... nonce=N+i-1` per send, `L1 deposit i/N accepted by RPC: hash=0x...` on success. Use these to verify ordering when debugging stuck txs.

## L1 Receipt Status Handling

**Critical safety invariant**: `waitForTransactionReceipt` resolves as soon as a receipt is available — it does NOT throw for reverted txs. Every force inclusion path must inspect `receipt.status` and treat `"reverted"` as a failure.

### Why It Matters

A reverted L1 deposit emits no `TransactionDeposited` event (or any other logs). `extractL2Hash(receipt)` returns `undefined`. Without an explicit check, the natural fallback of `resultHash = l2Hash || l1Hash` causes:

1. `txHash` set to the L1 hash (instead of a non-existent L2 hash)
2. Status set to `"pending"`
3. L2 receipt polling never starts (because there's no L2 hash)
4. Tx stuck **forever** in the activity feed showing "L1 Confirmed / L2 Pending" — but the L1 tx was actually reverted

Even worse: the reverted L1 tx shows up as "L1 Confirmed" in the UI, contradicting reality.

### The Check

All four force inclusion paths (`processForceInclusionBankr`, `processForceInclusionLocal`, `processForceInclusionBatchBankr`, `processForceInclusionBatchLocal`) now do this after `waitForTransactionReceipt`:

```typescript
const receipt = await l1Client.waitForTransactionReceipt({
  hash: l1Hash,
  timeout: L1_RECEIPT_TIMEOUT, // 10 minutes — see "L1 Receipt Timeout" below
});

if (receipt.status === "reverted") {
  await progress("error", { error: "L1 deposit transaction reverted onchain" });
  await writeFailure(txId, pending, "L1 deposit transaction reverted onchain");
  return;
}

const l2Hash = extractL2Hash(receipt);
// ... continue with success path
```

For non-atomic batches, the reverted sub-tx additionally mutates `item.success = false` so `trackBatchForceInclusionCompletion` computes the correct aggregate bundle status (PARTIAL_REVERT / REVERTED). The same mutation happens in the receipt-timeout `catch` block for the same reason — without it, `lastSuccessful` (used to pick the bundle's primary `txHash`) could pick a sub-tx that never confirmed.

**Contract**: this mutation works because `successfulResults = results.filter(...)` shares object identity with `results`. If you ever refactor that filter to clone (e.g., `.filter(...).map(r => ({...r}))`), you'll break the aggregate bundle status computation.

### L1 Receipt Timeout

`L1_RECEIPT_TIMEOUT = 10 * 60 * 1000` (10 minutes), exported from `forceInclusion/single.ts`. Used by all four `waitForTransactionReceipt` sites. Long enough to absorb L1 mainnet congestion (slow base fee adjustment can leave a tx pending for many minutes). If this fires, the catch handler marks the tx as failed — but `recoverStuckForceInclusionTxs()` reconciles on the next service worker startup if the L1 tx eventually confirms.

`cleanupStaleProcessingTxs` (in `txHistoryStorage.ts`) also has a 5-minute "stuck in processing" cleanup that runs on SW startup. **Force-inclusion txs are explicitly skipped** by that cleanup (`if (tx.forceInclusionMeta) continue;`) — recovery handles them via the L1-receipt re-fetch path instead.

### Common Revert Cause: Burn Out-Of-Gas

The most common revert (from my testing) is **out-of-gas inside `OptimismPortal.Burn.gas()`** because the L1 gas limit was too low for the requested L2 `_gasLimit`. This is now prevented by:

- `estimateForceInclusionGas` — uses real `l1Client.estimateGas()` instead of hardcoded 200k
- `processForceInclusionBatchLocal` Phase 2.5 — per-deposit `estimateGas` with 20% buffer + 1M fallback
- Single tx PK path — uses viem's `walletActionsL1().depositTransaction()` which auto-estimates

### Recovery: `recoverStuckForceInclusionTxs()`

For txs that were written to history under the old (buggy) behavior or crashed mid-flow, `forceInclusion/single.ts` exports a recovery function called from `background.ts` on service worker startup (alongside `resumePendingPollers()`):

```
For each tx in history with forceInclusionMeta and status ∈ {processing, pending}:
  Skip if tx.txHash !== l1TxHash (L2 hash already extracted, normal poller handles it)

  l1Client.getTransactionReceipt(l1TxHash)
    ├─ no receipt yet → leave as-is
    ├─ reverted → mark as "failed" with "L1 deposit transaction reverted onchain"
    └─ success → try extractL2Hash again
        ├─ L2 hash found → update tx to "pending" with l2Hash, start L2 polling
        └─ still no L2 hash + status was "processing" → bump to "pending" with L1 hash as txHash
```

This means users who had stuck txs from the pre-fix version get them auto-cleaned up the next time the extension's service worker starts.

### Recovery: `recoverStuckForceInclusionBundles()`

The per-tx recovery above only fixes individual sub-tx state. Batch force-inclusion bundles also rely on `trackBatchForceInclusionCompletion` — a 15-minute polling loop that computes the aggregate bundle status (`200 CONFIRMED` / `500 REVERTED` / `600 PARTIAL_REVERT`) once all sub-txs resolve. If the service worker dies mid-loop, that aggregate status would stay `100 PENDING` forever.

`recoverStuckForceInclusionBundles()` runs in Phase 2 of `recoverStuckForceInclusionTxs()`:

```
1. Group force-inclusion sub-txs in history by bundleId prefix
   (sub-tx ids follow the format `${bundleId}:${index}`)

2. For each bundle:
   ├─ Look up bundleStatus via getBundleStatus(bundleId)
   ├─ Skip unless status === BUNDLE_STATUS.PENDING (already finalized bundles don't need re-tracking)
   ├─ Sort sub-txs by their `:index` suffix to match original broadcast order
   ├─ Reconstruct the `results` array shape that the tracker expects:
   │     success = !!l1TxHash && tx.status !== "failed"
   │     l1TxHash = forceInclusionMeta.l1TxHash
   ├─ Pull chainName from the first sub-tx's history entry
   └─ Re-launch trackBatchForceInclusionCompletion(bundleId, chainName, results) (fire-and-forget)
```

`trackBatchForceInclusionCompletion` is exported from `forceInclusion/batch.ts` so the recovery function can call it. Its signature was changed from `(bundleId, pending: PendingBatchTxRequest, results)` to `(bundleId, chainName: string, results)` because the original `PendingBatchTxRequest` is removed from storage after broadcast — recovery can only reconstruct what's in tx history.

The reconstructed `results` array preserves the runtime contract where `r.success === false` means "this sub-tx is in a definitively failed state" (matching the original Phase 4 mutation semantics — see the L1 Receipt Status Handling section above).
