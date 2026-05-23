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

## Adding a NEW tx-confirmation surface

List it in the table above and make sure every gas feature here works on it before merging.
