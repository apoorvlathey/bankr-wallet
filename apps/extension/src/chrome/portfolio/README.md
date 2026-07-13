# Portfolio audit domain

Portfolio data is public display state, but its merge, cache, and refresh
ordering must remain deterministic. Review the implementation in this order:

1. `api.ts`, `catalogTypes.ts`, `catalogTransforms.ts` — bounded API response
   handling and pure catalog shapes/transforms.
2. `hiddenTokens.ts`, `recentTokens.ts`, `holdingsCache.ts`,
   `snapshotStorage.ts` — storage repositories for optional display state.
3. `onchainBalances.ts` — Multicall balance verification and RPC fallbacks.
4. `catalogEnrichment.ts`, `tokenCatalog.ts` — metadata/price enrichment and
   the API/custom/recent/native merge coordinator.
5. `coingeckoTypes.ts`, `coingeckoState.ts`, `coingeckoNativePolicy.ts`,
   `coingeckoNative.ts`, `coingeckoErc20.ts`, `directTokenPricing.ts`, and
   `coingecko.ts` — shared cache state, resolution policy, bounded price
   providers, and the public composition facade.
6. `snapshotRefresh.ts` — catalog load, live onchain refresh, then forced
   snapshot persistence.

The storage keys `portfolioSnapshots`, `portfolioHoldingsCache`,
`hiddenPortfolioTokens`, `recentlyReceivedTokens`, `coingeckoMarketCache`,
`coingeckoSearchCache`, `coingeckoNativeResolutionCache`, and
`coingeckoErc20PriceCache` are compatibility boundaries. Their shapes, TTLs,
best-effort cache writes, CoinGecko/GeckoTerminal fallback order, and snapshot
refresh ordering must not change during file-only refactors.
