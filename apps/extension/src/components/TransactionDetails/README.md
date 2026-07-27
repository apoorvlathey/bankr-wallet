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
| `PendingTransactionActions.tsx` | Render the paired Cancel and Speed Up actions for an eligible pending row | Callback-driven only |
| `transactionReplacementModel.ts` | Pure renderer eligibility hint for pending replacement actions | None |
| `usePendingReplacementActions.ts` | Prepare one background-authored replacement review and surface bounded errors | Trusted runtime message |
| `StatusHeader.tsx` | Render the requesting identity plus color-independent chain and terminal/pending status; privacy transactions use the shared Shield mark and Activity label, and pending Shield status exposes the shared compliance-time explanation | Opens the requesting site and transaction explorer |
| `PrivacyShieldLifecycleSummary.tsx` | Render the same durable Shield state used by Activity, plus net Shielded ETH, the receipt-timed compliance indicator and elapsed value, and locally bundled Privacy Pools attribution | Elapsed value delegates its renderer-only timer to the Shield compliance component |
| `PrivacyShieldPendingAction.tsx` | Render the centered pending-only `Cancel Shielding and Withdraw?` navigation action | Invokes the host's existing Unshield-screen callback only; the host carries the selected operation and net amount |
| `BridgeSummary.tsx` | Render source and destination bridge legs, status, amounts, and explorer actions | Explorer navigation |
| `TransactionImpact.tsx` | Render source/destination asset changes in the shared request-review direction hierarchy | None |
| `ClearSigningSummary.tsx` | Render ERC-7715 revoke, ERC-7821 batch, EIP-7702 delegation, and clear-signed summaries | Copy/explorer actions delegated to shared components |
| `SwapSummary.tsx` | Render same-chain swaps as a compact action/from/to receipt ledger when bridge context is absent | None |
| `DelegationReceipt.tsx` | Render EIP-7702 enable/revoke results with delegate and policy context | Address tools delegated to the shared labeled-address popover |
| `Erc7715RevokeReceipt.tsx` | Render a confirmed permission revocation as the shared summary ledger rather than reusing its pre-confirmation warning card | Address and token tools delegated to shared popovers |
| `DecodedFunctionSummary.tsx` | Render the existing calldata decoder's resolved function, contract, and optional native payment when no clear-signed summary exists | Address actions delegated to the shared labeled-address popover |
| `TransactionMeta.tsx` | Render the signing identity, gas fee, sequential-batch context, and timestamp as compact post-submission metadata | None |
| `feeDisplay.ts` | Pure ERC-20 fee amount and unresolved-state formatting | None |
| `AdvancedDetails.tsx` | Own the single technical disclosure, scroll its heading into view on user expansion, and compose raw transaction, gas diagnostics, then the signed nonce | Scrolls the existing detail viewport only |
| `RawTransactionDetails.tsx` | Render function, transfer, addresses, value, calldata, and deploy data inside the advanced owner; publish the existing decoder's resolved function name | Copy/explorer actions delegated to shared components |
| `GasDetails.tsx` | Render confirmed or estimated gas diagnostics inside the advanced owner | None |
| `TransactionError.tsx` | Render bounded error detail and the optional rebroadcast action | Copy action; rebroadcast callback is owned by the controller |
| `AssetChangesCard.tsx` | Order native/ERC-20/NFT outflows before inflows and reuse the request-review NFT row/media boundary | None directly |
| `Erc20TransferRow.tsx` | Render one summarized ERC-20 counterparty row with shared safe token imagery, symbol fallback, and hover/focus token-symbol contract disclosure | Explorer navigation, token copy delegated to the shared popover |
| `Erc20TransferGroupRow.tsx` | Render aggregate ERC-20 movement and own multi-counterparty expansion | Explorer navigation, token copy delegated to the shared popover |
| `ForceInclusionSteps.tsx` | Render L1 deposit and L2 inclusion as one rounded two-stage receipt ledger, with each terminal status linked to its chain explorer | Opens the matching L1 or L2 explorer transaction |
| `ArbitrumForceInclusionAction.tsx` | Show the delayed Arbitrum recovery action only after on-chain force eligibility | Reads force status and requests the guarded L1 force transaction |
| `formatting.ts` | Pure amount, grouping, swap-selection, and timestamp helpers | None |
| `forceInclusionState.ts` | Pure L1/L2 progress derivation | None |
| `tokenMetadata.ts` | Pure ERC-20/NFT metadata request collection and record enrichment | None |
| `useAssetChangeData.ts` | Enrich token metadata, backfill asset changes, and fetch native/token prices | Runtime messages only |
| `useResolvedCalldata.ts` | Resolve settled calldata by trusted history ID only when details need it | Runtime messages only |
| `useGasData.ts` | Read persisted receipt gas data, fetch missing ordinary receipt gas, and derive display values; force-inclusion history supplies its fee-bearing L1 gas record | Bounded RPC reads only |

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

- Preserve the post-submission information order: requesting identity and status,
  failure (when present), bridge route, balance changes, human-readable summary,
  compact transaction metadata, then one advanced technical disclosure.
- Force-inclusion state comes from the distinct L1/L2 hash invariant; do not
  infer stages from error strings.
- Wallet-type-neutral history rendering must remain shared across private-key,
  seed-phrase, and Bankr transactions.
- Existing message names, receipt polling cadence, explorer URL validation,
  metadata fallback rules, and collapse defaults are compatibility behavior.
- Safe executor history metadata owns the semantic detail action
  `Execute Safe Tx #n`; the nested calldata decoder may expose the technical
  `execTransaction` call in Advanced details but cannot replace that summary.
- Token-funded entries show their settled ERC-20 fee in both compact metadata
  and Advanced details, resolve metadata/prices lazily from shared caches, and
  never present the bundler's outer native receipt cost as wallet-paid gas.
- Non-zero balance changes must remain visible. Eighteen-decimal dust up to
  99,999 base units uses exact wei; other narrow tiny values use the shared
  compact subscript-zero notation rather than rounding to zero.
- Confirmed ERC-721 and ERC-1155 transfers reuse the request screen's NFT row,
  standard tag, sanitized preview, contract copy action, and explorer action.
- Settled calldata and NFT display metadata are loaded on demand. Durable
  history retains the selector plus NFT contract/token ID only; raw token URI
  never enters renderer state.
- Token identities reuse the request-review `TokenLogo` fallback. Missing,
  rejected, and still-rasterizing remote logos must show the token symbol rather
  than an invisible inert image. Keep the symbol and its `to` / `from`
  counterparty visually tight while preserving the counterparty explorer
  action's 24px minimum target. Vertically center the token mark against the
  complete symbol-and-counterparty identity stack.
- When no structured clear-signing summary exists, the already-mounted calldata
  decoder may promote its resolved function name into a lightweight summary;
  the summary must not start a second decode or show a zero-value payment row.
- Summary actions use the same left-label/right-value ledger row as Contract,
  Asset, and Payment. Once a decoded-function summary is available, Advanced
  details defaults closed while keeping its mounted decoder state available.
- Same-chain swaps use a dedicated Action/From/To ledger; bridge transactions
  continue to use the chain-aware route ledger instead of duplicating it.
- EIP-7702 set/revoke results and force-inclusion L1/L2 progress use the same
  defined-edge receipt grammar as ordinary summaries, not request-era cards.
- Transactions without a decoded or clear-signed action still receive a
  truthful generic Action row: contract deployment, contract interaction, or
  transaction. Their Advanced details remain open so raw context is visible.
- Processing and broadcast-uncertain records remain explicitly in progress;
  sequential batch receipts identify their call index without implying atomic
  execution.
- Ordinary pending PK/seed/Ledger rows expose Cancel and Speed Up immediately
  below status. Bankr, impersonator, fee-token, force-inclusion, and already-
  superseded rows do not advertise the action; background policy remains
  authoritative.
- Signed local/Ledger transactions show their address nonce as the final
  Advanced-details row. Dropped history is distinct from failed execution.
- Leaving full-screen pending details restores Activity. Home honors only the
  newer monotonic Activity/Holdings trigger so stale Holdings state cannot
  override the return destination when `PortfolioTabs` remounts.
- Shield deposits replace the generic confirmed label with their durable
  Privacy Pools stage and show the same stage/context projection as Activity.
  Their hero identity, plus Shield Recovery and Public Exit identities, also
  reuse Activity's shared privacy mark and concise action label instead of the
  mascot and internal persistence origin.
  The ordinary transaction, fee, account, explorer, and technical details stay
  available beneath that lifecycle summary. While the compliance check is
  pending, both its header loader and its Privacy Pools-attributed status card
  expose the shared one-hour timing popover. The pending-only cancellation
  action opens the existing Unshield screen with the selected operation ID and
  exact net Shielded ETH amount; it never starts a withdrawal from the details
  surface itself.
- Confirmed ERC-7715 revocations use a receipt-specific ledger. The blue
  explanatory warning and nested allowance panel remain exclusive to the
  pre-confirmation review surface.

## Coverage

- `tests/portfolio/portfolioBalanceNavigation.test.ts` covers the Activity →
  transaction-details → Back path for its three account fixtures.
- `src/preview/PreviewScreens.tsx` exercises the full-screen adapter across
  confirmed, pending, failed, bridge settlement, swap, approval/transfer,
  EIP-7702 and ERC-7715 revocation, atomic and sequential batch, force
  inclusion, deployment, legacy, metadata, and stress states. Its wallet
  selector rebinds the history record to private-key, seed-phrase, and Bankr
  identities rather than only changing chrome.
- Run `pnpm --filter @walletchan/extension typecheck:ui` and targeted ESLint
  whenever this domain changes.
