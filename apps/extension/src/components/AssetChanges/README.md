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
  approval/Send/Receive presentation. Approval increases are rendered
  before asset deltas and remain visible when asset simulation is unavailable.
- `ApprovalChangesGroup.tsx` renders verified and unverified ERC-20/Permit2
  allowance increases as a separator-led token/allowance/spender ledger,
  promotes unlimited grants to danger styling, and discloses
  incomplete-detection state without nesting another warning card.
- `AssetRow.tsx` renders one asset delta, restores shared token-symbol contract
  disclosure, and owns the persistent metadata-row copy/explorer effects.
- `TokenIcon.tsx` delegates fungible-token imagery and symbol fallback to the
  shared `TokenLogo`, keeping request and receipt identities synchronized.
- `NftMedia.tsx` owns NFT tags, bounded-raster `SafeImage` rendering, and the
  fullscreen preview. Raw SVG/data markup and metadata-controlled subresources
  must never enter this renderer.
- `SimulationBanners.tsx` owns the two parent-rendered simulation warnings.
- `assetChangesModel.ts` contains pure message selection, retry predicates,
  risk ordering, grouping, and approval-first collapsed-summary projection.
- `types.ts` contains feature-local component and batch-call contracts.

## Dependency and effect direction

`AssetChangesDisplay` → simulation hook / panel → rows and media. The hook is
the only Chrome-message boundary. `AssetRow` alone owns clipboard, timeout, and
explorer-window effects. Media depends on `SafeImage` and the sanitized avatar
cache; it never performs network requests. `TokenLogo` keeps its symbol fallback
visible while remote rasterization is pending. The pure model imports only types.

## Coverage

- `tests/ui/assetChangesModel.test.ts` protects message selection, stable batch
  keys, approval metadata retry decisions, risk ordering, grouping, and
  approval-first summaries.
- `tests/ui/tokenContractPopover.test.ts` requires both estimated and confirmed
  ERC-20 symbols to retain the shared hover/focus address, copy, and explorer
  disclosure with help-cursor and amber interaction feedback.
- `tests/network/remoteImageRendererBoundary.test.ts` protects the NFT and
  fungible-token `SafeImage` boundaries plus the shared token fallback.
- `tests/ui/architecture.test.ts` and `moduleSizeBudget.test.ts` protect the
  compatibility facade and implementation size.
