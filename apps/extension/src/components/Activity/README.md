# Activity UI audit map

This folder owns the extension's transaction-activity list. The public import
path remains `components/TxStatusList.tsx`; that file is a compatibility facade
and must not accumulate rendering or state-management policy.

## Modules

| File | Responsibility | Effects / dependencies |
| --- | --- | --- |
| `ActivityList.tsx` | Loads, filters, groups, expands, and selects transaction-history rows. | Chrome history messages, receipt polling, avatar-cache prewarming, detail-modal state. |
| `ActivityItem.tsx` | Composes one accessible activity row from the focused presentation modules. | Theme selection and click delegation only. |
| `ActivityMedia.tsx` | Renders favicon/token/chain icon arrangements for an activity row. | Image loading through the existing safe-image and cached-logo paths. |
| `ActivityStatus.tsx` | Renders the transaction, force-inclusion, and bridge status language. | Presentation only. |
| `ActivityExplorerActions.tsx` | Renders source and destination explorer buttons. | Presentation only; delegates effects to the explorer hook. |
| `useActivityExplorers.ts` | Resolves source/L1/destination explorers and owns explorer-tab callbacks. | Network context and `chrome.tabs.create`. |
| `activityModel.ts` | Pure grouping, formatting, status, and row-label derivation helpers. | No React, Chakra, storage, or network dependencies. |

## Dependency direction

`TxStatusList` facade → `ActivityList` → `ActivityItem` → focused presentation
modules. UI modules may consume `activityModel`; the model must never import UI
modules. Explorer URL resolution and tab effects stay behind
`useActivityExplorers`.

Keep implementation modules below roughly 400 lines and extract a coherent
component, hook, or pure model concern before adding another independent
responsibility. Behavior-level activity coverage belongs with extension UI
tests; pure formatting/grouping coverage should target `activityModel.ts`.
