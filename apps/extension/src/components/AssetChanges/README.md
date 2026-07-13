# Asset Changes UI audit map

`../AssetChangesDisplay.tsx` is the compatibility facade used by transaction
and batch confirmation callers. It preserves the default display export and
the named simulation-warning banner exports.

## Responsibilities

- `AssetChangesDisplay.tsx` resolves the active chain explorer, composes the
  simulation hook and presentation, and owns the memoized public component.
- `useAssetChangesSimulation.ts` owns Chrome simulation messages, screen-entry
  deferral, parent status callbacks, and the released three-attempt metadata
  retry schedule.
- `AssetChangesPanel.tsx` owns loading, empty, collapsed-summary, and grouped
  Send/Receive presentation.
- `AssetRow.tsx` renders one asset delta and owns address copy/explorer effects.
- `TokenIcon.tsx` renders fungible-token imagery through the shared sanitized
  avatar cache.
- `NftMedia.tsx` owns NFT tags, bounded-raster `SafeImage` rendering, and the
  fullscreen preview. Raw SVG/data markup and metadata-controlled subresources
  must never enter this renderer.
- `SimulationBanners.tsx` owns the two parent-rendered simulation warnings.
- `assetChangesModel.ts` contains pure message selection, retry predicates,
  grouping, and collapsed-summary projection.
- `types.ts` contains feature-local component and batch-call contracts.

## Dependency and effect direction

`AssetChangesDisplay` → simulation hook / panel → rows and media. The hook is
the only Chrome-message boundary. `AssetRow` alone owns clipboard, timeout, and
explorer-window effects. Media depends on `SafeImage` and the sanitized avatar
cache; it never performs network requests. The pure model imports only types.

## Coverage

- `tests/ui/assetChangesModel.test.ts` protects message selection, stable batch
  keys, retry decisions, grouping, and summaries.
- `tests/network/remoteImageRendererBoundary.test.ts` protects the NFT
  `SafeImage` boundary.
- `tests/ui/architecture.test.ts` and `moduleSizeBudget.test.ts` protect the
  compatibility facade and implementation size.
