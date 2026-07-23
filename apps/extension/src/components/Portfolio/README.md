# Portfolio UI domain

Portfolio screens and controllers live here instead of accumulating in the
shared `components/` root. The historical
`components/TokenHoldings.tsx` import is a policy-free compatibility facade for
`Holdings/TokenHoldings.tsx` and its public prop/state types.

- `Holdings/` owns the assets/DeFi holdings controller, cache adapter, derived
  display model, rows, and list presentation.
- `PortfolioOptionsSheet.tsx` owns the compact portfolio action and preference
  surface; `useUnifyPortfolioBalances.ts` and `useFollowDappNetwork.ts` own its
  synced display preferences.
- `portfolioPreferences.ts` defines the preference key and fail-safe default.
- `PortfolioBalanceChart.tsx` isolates chart-hover and animated-balance state
  from the holdings and Activity subtrees.
- `usePortfolioChartSnapshots.ts` keeps a same-address chart mounted while
  snapshot storage refreshes in the background.
- `performanceDebug.ts` and `usePortfolioChartHoverMetrics.ts` provide opt-in
  renderer timings without routine production-console noise.
- Root-level historical component paths remain compatibility facades only.

Keep data loading and effects in hooks, deterministic transforms in plain
modules, and Chakra presentation in focused components. A feature file should
stay below roughly 400 lines; split at a state/effect or presentation boundary
before it reaches that size.

Pure filtering, enrichment, aggregation, and totals are covered by
`tests/ui/portfolioHoldingsModel.test.ts`. Portfolio cache, privacy, navigation,
and balance behavior remain covered under `tests/portfolio/`; rendered states
belong in preview/runtime QA.

For a local performance trace, run
`localStorage.setItem("walletchan:debug:portfolio-performance", "1")` in the
extension view's DevTools console and reload. Logs use the
`[WalletChan portfolio perf]` prefix and include React commits, tab-paint
latency, chart-hover event gaps, token-transform timings, and RPC batch sizes.
Remove the key and reload to disable them.
