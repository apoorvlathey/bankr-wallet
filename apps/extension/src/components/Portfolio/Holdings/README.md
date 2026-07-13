# Holdings UI audit map

The holdings domain keeps the portfolio list behavior reviewable without
changing its public `TokenHoldings` contract.

| File | Responsibility |
| --- | --- |
| `TokenHoldings.tsx` | Composes controller hooks and the holdings presentation. |
| `types.ts` | Public props and shared domain types. |
| `cache.ts` | Renderer-first snapshot cache and persistent cache codec. |
| `transforms.ts` | Pure token enrichment, filtering, aggregation, and totals. |
| `useHoldingsState.ts` | Local state, verified-balance refs, and snapshot application. |
| `usePortfolioLoader.ts` | Catalog paint, detached RPC refresh, enrichment, and snapshot recording. |
| `useHoldingsLifecycle.ts` | Address/network hydration and transaction-history refresh effects. |
| `useLowValueBalanceRefresh.ts` | On-demand RPC refresh for expanded low-value assets. |
| `useHoldingsViewModel.ts` | Memoized filters, rows, totals, and visible logo cache. |
| `useTokenManagement.ts` | Edit/hide modal state and hide-token mutation flow. |
| `TokenRow.tsx` | Adapter for a single existing portfolio token row. |
| `AggregatedAssetRow.tsx` | Expandable cross-network asset summary. |
| `AssetRow.tsx` | Selects single-token versus aggregate row presentation. |
| `LowValueAssetsSection.tsx` | Collapsible low-value asset group. |
| `HoldingsList.tsx` | Loading, empty, asset, and DeFi list composition. |
| `HoldingsModals.tsx` | Edit and hide modal composition. |

Dependency direction is `TokenHoldings` -> hooks/view -> pure transforms/cache.
Presentation modules receive data and callbacks; they do not fetch or mutate
portfolio storage. Chrome portfolio modules remain the effect boundary.

`usePortfolioLoader.ts`, `useHoldingsLifecycle.ts`,
`useLowValueBalanceRefresh.ts`, and `useTokenManagement.ts` own Chrome/RPC,
storage, and transaction-refresh effects. `useHoldingsState.ts` owns only React
state/refs; rows and modals own callback-driven interaction state. Pure
transform coverage lives in `tests/ui/portfolioHoldingsModel.test.ts`; cache,
privacy, and navigation coverage lives under `tests/portfolio/`.
