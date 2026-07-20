# Activity UI audit map

This folder owns the extension's single transaction/activity timeline. The
public `components/TxStatusList.tsx` import remains a policy-free facade.

## Modules

| File | Responsibility | Effects / dependencies |
| --- | --- | --- |
| `ActivityList.tsx` | Loads, filters, groups, expands, selects, and enriches transaction history, then merges sanitized private-send operations supplied by the portfolio owner. | Chrome history messages, receipt polling, contacts, avatar prewarming, detail state. |
| `PrivacySendActivityItem.tsx` | Renders one relayed Shielded ETH withdrawal inside the normal dated timeline. | Presentation only. |
| `ActivityItem.tsx` | Composes one normal clickable transaction row. | Theme selection and click delegation only. |
| `ActivityMedia.tsx` | Renders website, token, chain, paired asset, and shared Shield identities. | Safe image/cached-logo paths. |
| `ActivityStatus.tsx` | Renders transaction, Shield lifecycle, force-inclusion, and bridge status language. | Presentation only. |
| `ActivityExplorerActions.tsx` | Renders valid source/L1/destination explorer controls. | Delegates to the explorer hook. |
| `useActivityExplorers.ts` | Resolves explorer URLs and opens tabs. | Network context and `chrome.tabs.create`. |
| `activityModel.ts` | Pure generic date grouping, formatting, status, and row-label helpers. | No effects. |
| `activityIdentityModel.ts` | Merges wallet/contact labels by address. | No effects. |

## Dependency direction

`TxStatusList` facade → `ActivityList` → focused rows/presentation. Shield
deposit rows remain exact-bound `CompletedTransaction` entries and keep normal
Sepolia detail navigation. Relayed private sends remain sanitized withdrawal
projections but share the same date groups and list surface. `PortfolioTabs`
owns one `useShieldOperations` subscription for both the permanent Shielded ETH
asset row and Activity, so hidden warm panels do not start duplicate sync loops.
The asset action can apply a privacy-only filter without creating another
activity destination.

User-rejected public-recovery prompts are omitted by the background after their
claims are released; genuine proof, submission, revert, and recovery outcomes
remain visible. Every exact WalletChan Shield origin, including the public
recovery confirmation, reuses the privacy mark; recovery rows project the
concise `Shield Recovery` title. Keep implementation modules below roughly 400 lines and place
pure formatting/grouping coverage in `tests/ui/activityModel.test.ts`.
