# Portfolio UI domain

Portfolio screens and controllers live here instead of accumulating in the
shared `components/` root. The historical
`components/TokenHoldings.tsx` import is a policy-free compatibility facade for
`Holdings/TokenHoldings.tsx` and its public prop/state types.

- `Holdings/` owns the assets/DeFi holdings controller, cache adapter, derived
  display model, rows, and list presentation.
- Root-level historical component paths remain compatibility facades only.

Keep data loading and effects in hooks, deterministic transforms in plain
modules, and Chakra presentation in focused components. A feature file should
stay below roughly 400 lines; split at a state/effect or presentation boundary
before it reaches that size.

Pure filtering, enrichment, aggregation, and totals are covered by
`tests/ui/portfolioHoldingsModel.test.ts`. Portfolio cache, privacy, navigation,
and balance behavior remain covered under `tests/portfolio/`; rendered states
belong in preview/runtime QA.
