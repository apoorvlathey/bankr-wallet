# Gas and fee estimation audit domain

Stable caller paths remain policy-free facades:

- `chrome/feeEstimation.ts` re-exports fee tier estimation and public types.
- `chrome/gasEstimation.ts` re-exports single-transaction estimation, native
  pricing, buffered limits, and the EIP-7702 intrinsic-gas bump.
- `chrome/batchGasEstimation.ts` re-exports sequential batch estimation.

Focused ownership:

- `types.ts` contains JSON-safe gas results and bigint fee-tier contracts.
- `feePolicy.ts` owns per-chain priority floors, percentile math, tier spacing,
  base-fee prediction, and custom-tier constants.
- `feeRpc.ts` owns `eth_feeHistory`, `eth_maxPriorityFeePerGas`, and legacy
  `eth_gasPrice` fallbacks; `feeEstimator.ts` composes the tier ladder.
- `client.ts` owns the RPC-client cache, native price fallback, and buffered
  single-call estimate helper.
- `singlePolicy.ts` owns non-standard-chain/EIP-7702 gas policy and tier
  serialization; `singleEstimator.ts` owns single transaction orchestration.
- `batchSimulation.ts` owns `eth_simulateV1` capability caching and results.
- `batchInjection.ts` owns sequential TxSimulator state-override measurement.
- `batchFallback.ts` owns independent `eth_estimateGas` plus the explicit
  500,000 dependent-call fallback.
- `batchResult.ts` owns per-call JSON-safe result construction;
  `batchEstimator.ts` composes the three batch tiers in their existing order.

No module signs, broadcasts, mutates accounts, or handles Chrome messages.
RPC egress continues through the configured bounded transport.
