# Transaction Confirmation Surfaces

**ALL transaction confirmation screens must offer the same gas-fee UX.** The wallet has multiple confirmation surfaces and they must stay in lockstep — when one ships a new gas feature, the others have to ship it too, or users get inconsistent behavior depending on how they triggered the tx.

## Confirmation surfaces today

| Surface | File | Underlying gas component |
|---|---|---|
| Single-tx confirmation (dapp-initiated) | `apps/extension/src/components/TransactionConfirmation.tsx` | `GasEstimateDisplay.tsx` |
| Batch tx confirmation (ERC-5792, dapp-initiated) | `apps/extension/src/components/BatchTransactionConfirmation.tsx` | `MultiTxGasEstimateDisplay.tsx` |
| Cross-dapp batch confirmation (user-assembled) | `apps/extension/src/components/CrossDappBatchConfirmation.tsx` | `MultiTxGasEstimateDisplay.tsx` (wraps BatchTransactionConfirmation) |
| **Swap / Bridge confirmation (internal)** | `apps/extension/src/components/Swap/SwapConfirmation.tsx` | `MultiTxGasEstimateDisplay.tsx` |

**When you change anything about gas params, the tier picker, validity, or override plumbing in ANY of these screens, audit the others.** The swap path in particular is easy to miss — it's its own confirmation UI separate from the dapp-initiated batch flow but uses the same underlying `MultiTxGasEstimateDisplay`.

**Cross-chain bridges ride inside the same `SwapConfirmation.tsx`** via the optional `bridgeMeta` prop (no new surface). When set, the title flips to "Confirm Bridge", the network row shows source → destination chains, and a Bungee route / ETA row appears. Gas plumbing is unchanged. After the source-tx confirms, `bridgeStatusPoller` watches `/api/bridge/status` and fires a destination notification — see [`BRIDGE.md`](./BRIDGE.md) "Extension support".

## Required wiring (PK / Seed accounts)

For any tx-confirmation surface:

1. Pass `isNonAtomic={true}` to `MultiTxGasEstimateDisplay` (or use `GasEstimateDisplay` for single tx) so the tier picker actually renders.
2. Wire `onGasEstimates` (or `onGasOverrides` for single tx) to a parent state.
3. Wire `onValidityChange` to a `gasValid` state and disable the Confirm button on `!gasValid`.
4. Send the gas estimates / overrides through to the background handler that signs the tx.
5. Make sure the background handler actually applies them at sign time (clears legacy `gasPrice`, sets `maxFeePerGas` / `maxPriorityFeePerGas` / `gas` from the override).

**Bankr / impersonator paths are exempt:** Bankr handles gas server-side; impersonator can't broadcast. The gas component handles these gracefully (picker auto-hides), but the parent should still set `isNonAtomic` correctly so the picker only fires its callbacks for PK / Seed.

## Atomic-7702 wiring (PK / Seed batch surfaces)

When a PK/SP batch resolves to `strategy === "atomic-7702"` (the dapp-batch screens flip `isNonAtomic` to `false`), `MultiTxGasEstimateDisplay` switches to "wrapped batch" mode and needs one extra prop:

- `eip7702Delegate={batchPlan.delegate}` **only when `batchPlan.needsAuthorization === true`** — triggers a state-override path in `estimateGas` that injects the delegate's runtime code at the EOA so the simulation matches post-auth chain state. When `needsAuthorization === false` the EOA is already onchain-delegated; pass `undefined` so we use plain `estimateGas` (more RPC-robust on Base public RPC and similar tiers where `stateOverride` support on `eth_estimateGas` lags behind `eth_call`).

The component additionally fires `estimateBatchGasSequential` over the inner calls in parallel as a fallback for any PK/SP batchedTx surface — handles `eth_estimateGas` binary-search divergence on deeply nested executor calldata (1inch v6 with executor, V4-with-hooks) so the "may revert" banner doesn't false-fire on batches that land cleanly. See [`7702.md` → Gas estimation](./7702.md#gas-estimation).

## Adding a NEW tx-confirmation surface

List it in the table above and make sure every gas feature here works on it before merging.
