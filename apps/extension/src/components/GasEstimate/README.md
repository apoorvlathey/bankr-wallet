# Gas estimate presentation audit map

- `GasFeeTrigger.tsx` owns the compact fee summary shown at the transaction
  decision point. It is presentational and receives already-formatted fee and
  tier values from `GasEstimateDisplay.tsx`.
- `GasFeePopover.tsx` owns the standard anchored fee selector shell, its
  tier/custom transition, and reduced-motion fallback. Single-transaction and
  multi-transaction confirmations reuse this surface; the batch coordinator
  supplies its call breakdown as fallback content.
- `CustomGasEditor.tsx` owns the focused gas-parameter fields, the automatic
  Priority/Base-to-Max calculation affordance, the network-determined Base fee
  hint, validation copy, and compact Cancel/Set action row. It receives
  controlled draft values and callbacks.
- `MaxFeeField.tsx` isolates the computed/read-only Max Fee state, its linked
  Auto information tooltip, animated inline Edit affordance, and manual-to-auto
  control.
- `BatchGasIcons.tsx` owns the small linked/edited SVG marks shared by the
  batch gas-tier presentation.
- `model/balanceWarnings.ts` is the pure policy for aggregating native outlay,
  separating force-inclusion L1 gas from L2 transaction value, and producing
  chain-specific insufficient-balance copy.
- `model/tierPresentation.ts` owns the semantic color mapping shared by gas-tier
  icons and the compact selected-tier badge.
- Estimation, validation, tier persistence, and gas-override behavior remain in
  the existing `GasEstimateDisplay.tsx` coordinator.
