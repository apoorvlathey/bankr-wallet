# Activity UI audit map

This folder owns the extension's single transaction/activity timeline. The
public `components/TxStatusList.tsx` import remains a policy-free facade.

## Modules

| File | Responsibility | Effects / dependencies |
| --- | --- | --- |
| `ActivityList.tsx` | Loads paginated transaction history, filters and groups scoped public/private rows, merges sanitized relay- and receiver-paid Unshield projections, and delegates detail selection to its host. | Chrome history messages, inactive-tab-aware receipt polling, contact subscriptions, avatar-cache prewarming, detail-modal state. |
| `ActivityDateHeader.tsx` | Shared Warm Midnight date separator for transaction and Safe proposal ledgers. | Presentation only. |
| `UnshieldActivityItem.tsx` | Renders one Shielded ETH withdrawal inside the normal dated timeline with live account/contact recipient identity and an explorer action once submitted. | Opens the configured explorer link. |
| `ActivityItem.tsx` | Composes one accessible transaction row and the pending Shield compliance indicator. | Theme selection, click delegation, interaction sound, and the shared renderer-only elapsed-time timer. |
| `ActivityMedia.tsx` | Renders website, token, chain, paired asset, bridge, and shared Shield identities. | Safe image and cached-logo paths. |
| `ActivityStatus.tsx` | Renders transaction, Shield lifecycle, force-inclusion, and bridge status language and exports the shared compact semantic status label. | Presentation only. |
| `ActivityExplorerActions.tsx` | Renders first-line source/L1/destination explorer controls. | Presentation only; delegates effects to the explorer hook. |
| `useActivityExplorers.ts` | Resolves exact source, L1, and destination explorer URLs. | Network context and `chrome.tabs.create`. |
| `activityModel.ts` | Pure generic date grouping, formatting, status, and row-label helpers; privacy row titles consume the shared privacy-transaction identity. | No React, Chakra, storage, or network dependencies. |
| `activityScopeModel.ts` | Applies signer-owned Public visibility and privacy-ledger Private visibility without duplicating receiver-paid Unshield history. | No effects. |
| `activityIdentityModel.ts` | Merges current wallet names and contact labels by address, with contacts taking precedence. | Pure model; no effects. |

Wallet-authored cancellation rows use the WalletChan mark and the single
“Cancel Transaction” label. Because that label has no secondary context, its
title spans the row's two text tracks and sits on the mark's vertical
centerline while status metadata retains the lower track. Ordinary rows keep
their two-line hierarchy. Speed-up rows retain the original transaction's
identity and presentation. A displaced mempool transaction renders `Dropped`
rather than sharing the `Failed` execution state.

Safe executor rows retain a durable Safe address/nonce marker in normal
account history. Activity uses that marker for the Safe mark and the
`Execute Safe Tx #n` identity instead of presenting the outer
`execTransaction` as a dapp contract interaction.

## Dependency direction

`TxStatusList` facade → `ActivityList` → focused rows/presentation. Shield
deposit rows remain exact-bound `CompletedTransaction` entries and keep normal
active-network detail navigation. After receipt confirmation, pending Shield
rows replace numbered lifecycle steps with one full-width amber `Compliance
check pending` status and a continuous one-hour elapsed-time bar capped at 90%
until compliance confirmation. Relay- and receiver-paid Unshield operations
remain sanitized withdrawal projections but share the same date groups and
list surface. Receiver-paid operations enter the timeline while waiting for
wallet confirmation and then mirror Processing, confirming, and confirmed
transaction stages. Definite failures before publication use the explicit
`Transaction was not submitted` error state and release the private commitment;
ambiguous broadcast outcomes remain pending until reconciliation. Their
selection is routed through `App.tsx` to Shield's full-screen
`UnshieldDetailScreen`; Activity owns no Unshield modal or duplicate detail
state. Public and Private lifecycle projections receive the same canonical
receipt callback; the private poller is restart recovery only. `PortfolioTabs`
owns one `useShieldOperations` subscription for both the permanent Shielded ETH
asset row and Activity, so hidden warm panels do not start duplicate sync loops.
The asset action can apply a privacy-only filter without creating another
activity destination.

User-rejected public-recovery prompts are omitted by the background after their
claims are released; genuine proof, submission, revert, and recovery outcomes
remain visible. Shield and public-exit history rows carry bounded, versioned
privacy markers and retain their privacy-ledger row in Private Activity. Since
the same transaction was submitted by a wallet account, it also appears in
that signer's Public Activity. Receiver-paid Unshield similarly uses its
sanitized operation in Private and its normal transaction-history row in
Public; Private suppresses that duplicate history row. Exact internal origin matching keeps
already-persisted Shield, Shield Recovery, and Public Exit entries compatible;
substring matching is forbidden so a similarly named dapp cannot cross the
scope boundary. These rows reuse the privacy mark, and recovery rows project
the concise `Shield Recovery` title. Activity and transaction details consume
the same `lib/privacyTransactionIdentity.ts` labels so internal storage origins
never leak into either presentation. Keep implementation modules below roughly
400 lines and place pure formatting/grouping coverage in
`tests/ui/activityModel.test.ts`.
