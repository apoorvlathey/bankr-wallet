# Transaction Details UI

This domain owns the post-submission transaction detail experience shared by
the Activity modal and full-screen navigation destination. The two legacy
component paths remain compatibility facades; new implementation code belongs
here and should stay organized by one user-facing responsibility per file.

## Public boundary

- `../TxDetailModal.tsx` preserves the default modal export and the named
  `TxDetailController` / `TxDetailControllerProps` exports.
- `../TxDetailScreen.tsx` preserves the default screen export and the named
  `TxDetailScreenProps` export.
- `TxDetailModal.tsx` and `TxDetailScreen.tsx` are host adapters only.
- `TxDetailController.tsx` coordinates shared state and data sources, then
  composes the focused views below. Do not add large render sections to it.

## Audit map

| File | Single responsibility | Effects |
| --- | --- | --- |
| `TxDetailController.tsx` | Coordinate shared detail state and compose sections in the established visual/message order | Native-symbol lookup, delegate-label lookup, rebroadcast request, explorer navigation |
| `TxDetailModal.tsx` | Adapt the shared controller to the modal host | None |
| `TxDetailScreen.tsx` | Adapt the shared controller to navigation and refresh pending history | History messages, receipt polling, runtime listener |
| `StatusHeader.tsx` | Render chain and terminal/pending status before all detail sections | None |
| `BridgeSummary.tsx` | Render source and destination bridge legs, status, amounts, and explorer actions | Explorer navigation |
| `TransactionImpact.tsx` | Render source/destination asset changes, force-inclusion explorer links, and timestamp | Explorer navigation |
| `ClearSigningSummary.tsx` | Render ERC-7715 revoke, ERC-7821 batch, EIP-7702 delegation, and clear-signed summaries | Copy/explorer actions delegated to shared components |
| `RawTransactionDetails.tsx` | Render the disclosure for function, transfer, addresses, value, calldata, and deploy data | Copy/explorer actions delegated to shared components |
| `GasDetails.tsx` | Render confirmed or estimated gas details behind one disclosure | None |
| `TransactionError.tsx` | Render bounded error detail and the optional rebroadcast action | Copy action; rebroadcast callback is owned by the controller |
| `AssetChangesCard.tsx` | Order native/ERC-20 outflows before inflows and own group expansion state | None directly |
| `Erc20TransferRow.tsx` | Render one summarized ERC-20 counterparty row | Explorer navigation |
| `ForceInclusionSteps.tsx` | Render the L1/L2 progress indicator without deriving transport state | None |
| `formatting.ts` | Pure amount, grouping, swap-selection, and timestamp helpers | None |
| `forceInclusionState.ts` | Pure L1/L2 progress derivation | None |
| `tokenMetadata.ts` | Pure token-metadata request collection and record enrichment | None |
| `useAssetChangeData.ts` | Enrich token metadata, backfill asset changes, and fetch native/token prices | Runtime messages only |
| `useGasData.ts` | Fetch missing receipt gas data and derive display values | Bounded RPC reads only |

## Dependency direction

The modal and screen adapters depend on `TxDetailController`; the controller
depends on section components and focused data hooks; sections depend on pure
formatters and existing shared UI. Pure helpers never import React views or
effect-owning hooks. Sections do not import either public compatibility facade.

Keep the controller below the extension's approximately 400-line implementation
budget. When a section grows, split its rendering or effect boundary rather
than adding another multipurpose hook or moving the entire controller into one
large hook.

## Behavior invariants

- Preserve section and message ordering: status, bridge, asset impact,
  clear-signing summaries, raw details, gas, then failure details.
- Force-inclusion state comes from the distinct L1/L2 hash invariant; do not
  infer stages from error strings.
- Wallet-type-neutral history rendering must remain shared across Bankr,
  private-key, and seed-phrase transactions.
- Existing message names, receipt polling cadence, explorer URL validation,
  metadata fallback rules, and collapse defaults are compatibility behavior.

## Coverage

- `tests/portfolio/portfolioBalanceNavigation.test.ts` covers the Activity →
  transaction-details → Back path for all three wallet types.
- `src/preview/PreviewScreens.tsx` exercises the full-screen adapter and
  representative transaction states.
- Run `pnpm --filter @walletchan/extension typecheck:ui` and targeted ESLint
  whenever this domain changes.
