# WCHAN staking UI audit map

`StakingScreen.tsx` is the public composition root. It owns tab and amount
selection, composes the balance, condition, amount, and review surfaces, and
contains no RPC or signing implementation.

- `hooks/useStakingState.ts` owns trusted background reads and refresh timing.
- `hooks/useWchanPrice.ts` reuses the wallet's cached token-price route for the
  accessible token/USD amount toggle.
- `hooks/useWchanApy.ts` is the shared More/Staking 7-day APY source. It uses
  the trusted wallet-UI transport first, retains the released bounded website
  request as fallback, and preserves zero as a valid resolved APY.
- `hooks/useStakingController.ts` owns reviewed call preparation, batch
  capability resolution, and the irreversible runtime-message boundary.
- `model/stakingModel.ts` owns pure amount, penalty-window, and calldata plans.
- `model/stakingApy.ts` preserves valid zero APY values while rejecting malformed
  remote projections.
- `model/stakingFormatting.ts` owns pure financial display formatting.
- `StakingBalanceSummary.tsx`, `StakingAmountPanel.tsx`, and
  `StakingConditions.tsx` are focused presentation modules.
- `StakingReviewScreen.tsx` owns final call, gas, batching, and Ledger review
  presentation.

Data flows from the screen into the feature hooks and pure models, then into
domain-free UI primitives. Background reads live under `chrome/staking/`.
Execution remains account-pinned and reset-aware through the existing internal
multi-transaction handlers. Tests cover calldata/amount decisions and every
wallet-type execution plan; Ledger additionally requires real-device QA.
