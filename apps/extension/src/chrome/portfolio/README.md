# Portfolio audit domain

Portfolio data is public display state, but its merge, cache, and refresh
ordering must remain deterministic. Review the implementation in this order:

1. `api.ts`, `responsePolicy.ts`, `consumerPolicy.ts`, `catalogTypes.ts`, `catalogTransforms.ts` —
   byte-bounded API transport, runtime response/working-set ceilings, and pure
   catalog shapes/transforms.
2. `hiddenTokens.ts`, `recentTokens.ts`, `holdingsCache.ts`,
   `holdingsCachePolicy.ts`, `snapshotStorage.ts` — storage repositories and
   pure size/LRU policy for optional display state.
3. `onchainBalances.ts` — Multicall balance verification and RPC fallbacks.
4. `catalogEnrichment.ts`, `tokenPageEnrichment.ts`, `tokenCatalog.ts` —
   bounded visible-page metadata/price enrichment and the
   API/custom/recent/native merge coordinator.
5. `coingeckoTypes.ts`, `coingeckoState.ts`, `coingeckoNativePolicy.ts`,
   `coingeckoNative.ts`, `coingeckoErc20.ts`, `directTokenPricing.ts`, and
   `coingecko.ts` — shared cache state, resolution policy, bounded price
   providers, and the public composition facade.
6. `snapshotRefresh.ts` — enrichment-free aggregate catalog load and forced
   snapshot persistence without whole-catalog RPC fan-out.

The storage keys `portfolioSnapshotsV2`, `portfolioHoldingsCache`,
`hiddenPortfolioTokens`, `recentlyReceivedTokens`, `coingeckoMarketCache`,
`coingeckoSearchCache`, `coingeckoNativeResolutionCache`, and
`coingeckoErc20PriceCache` are compatibility boundaries. Their shapes, TTLs,
best-effort cache writes, CoinGecko/GeckoTerminal fallback order, and snapshot
refresh ordering must not change during file-only refactors. The legacy
`portfolioSnapshots` key is purge-only and remains in the wallet-reset manifest.
