# Holdings UI audit map

The holdings domain keeps the portfolio list behavior reviewable without
changing its public `TokenHoldings` contract.

| File | Responsibility |
| --- | --- |
| `TokenHoldings.tsx` | Composes controller hooks and the holdings presentation. |
| `types.ts` | Public props and shared domain types. |
| `cache.ts` | Four-entry renderer LRU, persistent snapshot adapter, and coalesced progressive writes. |
| `transforms.ts` | Pure token enrichment, filtering, aggregation, and totals. |
| `progressiveRowsModel.ts` | Pure bounded page projection across ordered holdings sections. |
| `useHoldingsState.ts` | Local state, verified-balance refs, and snapshot application. |
| `usePortfolioLoader.ts` | Catalog paint, detached RPC refresh, enrichment, and snapshot recording. |
| `useHoldingsLifecycle.ts` | Address/network hydration and transaction-history refresh effects. |
| `useProgressiveHoldingsRows.ts` | Bounded render-window state for assets and positions. |
| `useProgressiveBalanceRefresh.ts` | On-demand RPC verification for the currently rendered token page. |
| `useVisibleHoldingLogos.ts` | Restricts raster image caching to rendered rows. |
| `useHoldingsViewModel.ts` | Memoized filters, rows, and totals. |
| `useTokenManagement.ts` | Edit/hide modal state and hide-token mutation flow. |
| `TokenRow.tsx` | Adapter for a single existing portfolio token row. |
| `AggregatedAssetRow.tsx` | Expandable cross-network asset summary. |
| `AssetRow.tsx` | Selects single-token versus aggregate row presentation. |
| `ShieldedEthRow.tsx` | Permanent zero-USD Shielded ETH row and Shield/Unshield/activity action sheet. |
| `LowValueAssetsSection.tsx` | Collapsible low-value asset group. |
| `ProgressiveListSentinel.tsx` | Intersection-driven and keyboard-accessible page advance. |
| `HoldingsList.tsx` | Loading, empty, asset, and DeFi list composition. |
| `HoldingsModals.tsx` | Edit and hide modal composition. |

Dependency direction is `TokenHoldings` -> hooks/view -> pure transforms/cache.
Presentation modules receive data and callbacks; they do not fetch or mutate
portfolio storage. Chrome portfolio modules remain the effect boundary.

`PortfolioTabs` supplies one bounded privacy snapshot. Shielded ETH is inserted
after public ETH, remains visible at zero, and is excluded from public
portfolio totals, charts, low-value assets, and chain totals.

Snapshot hydration restores display data but never republishes cached RPC issue
IDs. Only the detached live balance refresh can update the home RPC warning.
The Chrome portfolio boundary caps remote/cache tokens before this UI receives
them; Holdings retains omitted count/value metadata so totals remain complete
without exposing internal response-truncation copy in the interface.

`usePortfolioLoader.ts`, `useHoldingsLifecycle.ts`,
`useProgressiveBalanceRefresh.ts`, and `useTokenManagement.ts` own Chrome/RPC,
storage, and transaction-refresh effects. `useHoldingsState.ts` owns only React
state/refs; rows and modals own callback-driven interaction state. Pure
transform coverage lives in `tests/ui/portfolioHoldingsModel.test.ts`; cache,
privacy, and navigation coverage lives under `tests/portfolio/`.
