# Swap and bridge UI audit map

`SwapView.tsx` is the stable public composition root. It chooses between the
form, nested chain/token picker, and confirmation screen, and composes the
feature-local hooks below. Keep it free of RPC/storage implementations.

## Form and presentation

- `SwapFormScreen.tsx` lays out the form and sticky review action.
- `SellTokenCard.tsx` owns sell amount, USD mode, balance, and slider controls.
- `BuyTokenCard.tsx` owns the read-only quoted output presentation.
- `SwapQuoteSection.tsx` renders quote details, bridge recovery, ETA, warnings,
  and slippage settings.
- `SwapTokenControls.tsx` contains the shared token trigger, address actions,
  and direction icon.
- `SwapConfirmation.tsx` reviews staged same-chain and bridge actions.
- Picker modules (`BridgeChainToken*`, `TokenPicker*`, and `TokenSelector`) own
  token/chain discovery and selection presentation.

Presentation modules receive state and callbacks. They must not add runtime
message, RPC, or storage effects except the existing explorer/copy actions in
`SwapTokenControls.tsx`.

## State and effects

- `useSellTokenData.ts` loads the cross-chain catalog and hydrates missing sell
  balances/prices.
- `useBuyTokenData.ts` resolves selected buy-token metadata and price.
- `useSwapAmount.ts` owns amount-mode and balance-slider transformations.
- `useSwapSlippage.ts` owns the `swapSlippageBps` sync-storage preference.
- `useSwapQuotes.ts` owns debounced 0x/Bungee indicative quotes and destination
  native-token recovery metadata.
- `usePreparedSwap.ts` stages confirmation state and coordinates preparation
  and final execution.

## Transaction boundaries

- `prepareSameChainSwap.ts` obtains a firm quote and stages allowance, Permit2,
  and swap calls.
- `prepareBridgeSwap.ts` refreshes the expiring Bungee route and stages approval
  and bridge calls.
- `swapBatchPlan.ts` preserves the Bankr atomic, private-key/seed EIP-7702, and
  sequential fallback decision.
- `executePreparedSwap.ts` is the irreversible runtime-message boundary for
  Bankr batch, local EIP-7702, and sequential execution.
- `swapViewTypes.ts` and `swapViewUtils.ts` contain shared contracts and pure
  adapters (apart from the documented delegate-status runtime message).

Dependencies point from `SwapView` → hooks/coordinators → preparation/execution
boundaries. Presentation must not import preparation or execution modules.
Preserve account pinning and all Bankr, private-key, seed-phrase, and view-only
branches when changing this domain.

UI architecture tests live under `tests/ui/`; transaction behavior remains
covered by the existing swap, batch, local-signing, and security suites.
