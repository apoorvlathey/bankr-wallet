# Swap and bridge UI audit map

`SwapView.tsx` is the stable public composition root. It chooses between the
form, nested chain/token picker, and confirmation screen, and composes the
feature-local hooks below. Keep it free of RPC/storage implementations.

## Form and presentation

- `SwapFormScreen.tsx` lays out the form and sticky review action.
- `SellTokenCard.tsx` owns sell amount, USD mode, balance, and the same compact
  amber rounded-square slider used by Send.
- `BuyTokenCard.tsx` owns the read-only quoted output presentation.
- `SwapQuoteSection.tsx` renders quote details, bridge recovery, ETA, warnings,
  and slippage settings.
- `SwapTokenControls.tsx` contains the shared token trigger, address actions,
  and direction icon.
- `SwapConfirmation.tsx` reviews staged same-chain and bridge actions.
- Picker modules (`BridgeChainToken*`, `TokenPicker*`, and `TokenSelector`) own
  token/chain discovery and selection presentation. The bridge picker uses one
  token/address search, balance-prioritized network chips, compact popular-token
  shortcuts, then wallet holdings and the remaining catalog.

The compact wallet form gives each amount field a full row, keeps its fiat
conversion inside that field, and separates network and token into compact
header pills above the amount. Network pills open a searchable vertical browser
with funded networks ordered by portfolio value, followed by Ethereum and then
the remaining unfunded networks alphabetically; token pills open holdings and
catalog discovery for the selected network. The network browser is the shared
wallet selector also used by Send and homepage portfolio filtering. A
generic Swap entry starts from the highest-value funded token in the cached
portfolio, while asset-row entry continues to honor its explicit token. The
form infers same-chain swap versus bridge from the selected pair, keeps route
and fee detail behind the minimum-received disclosure, and leaves custom
slippage available in its bottom sheet. Amber is reserved for active routing
controls and the sticky review commitment.

Presentation modules receive state and callbacks. They must not add runtime
message, RPC, or storage effects except the existing explorer/copy actions in
`SwapTokenControls.tsx`.

## State and effects

- `useSellTokenData.ts` loads the cross-chain catalog and hydrates missing sell
  balances/prices.
- `useBuyTokenData.ts` resolves selected buy-token metadata and price.
- `useSwapAmount.ts` owns amount-mode and balance-slider transformations.
- `useSwapPairSelection.ts` owns initial sell-token selection plus flip and
  token-picker transitions, keeping the composition root below its size gate.
- `useSwapSlippage.ts` owns the `swapSlippageBps` sync-storage preference.
- `useSwapQuotes.ts` owns debounced 0x/Bungee indicative quotes and destination
  native-token recovery metadata.
- `usePreparedSwap.ts` stages confirmation state and coordinates preparation
  and final execution. For a Safe, the staged same-chain calls create a draft
  proposal and open the shared Safe request screen instead of entering an EOA
  or Bankr submission path.

## Transaction boundaries

- `prepareSameChainSwap.ts` obtains a firm quote and stages allowance, Permit2,
  and swap calls.
- `prepareBridgeSwap.ts` refreshes the expiring Bungee route and stages approval
  and bridge calls.
- `swapBatchPlan.ts` preserves the Bankr atomic, private-key/seed EIP-7702, and
  sequential fallback decision.
- `executePreparedSwap.ts` is the irreversible runtime-message boundary for
  Bankr batch, local EIP-7702, and sequential execution.
- `safeSwapProposal.ts` maps the already reviewed swap calls into ordered Safe
  calls and creates the wallet-origin proposal. The Safe transaction builder
  owns canonical MultiSend wrapping when an approval and swap must be atomic.
- `swapSubmissionModel.ts` keeps Bankr, private-key, seed-phrase, Safe, and
  view-only routing explicit and pure. Same-chain Safe swaps are supported;
  cross-chain Safe bridges remain guarded until destination deployment
  verification is part of the flow.
- `swapViewTypes.ts` and `swapViewUtils.ts` contain shared contracts and pure
  adapters (apart from the documented delegate-status runtime message).

Dependencies point from `SwapView` → hooks/coordinators → preparation/execution
boundaries. Presentation must not import preparation or execution modules.
Preserve account pinning and all Bankr, private-key, seed-phrase, and view-only
branches when changing this domain.

UI architecture tests live under `tests/ui/`; transaction behavior remains
covered by the existing swap, batch, local-signing, and security suites.
