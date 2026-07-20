# Activity UI audit map

This folder owns the extension's transaction-activity list. The public import
path remains `components/TxStatusList.tsx`; that file is a compatibility facade
and must not accumulate rendering or state-management policy.

## Modules

| File | Responsibility | Effects / dependencies |
| --- | --- | --- |
| `ActivityList.tsx` | Loads, filters, groups, expands, selects, and live-enriches transaction-history rows. | Chrome history messages, receipt polling, Shield lifecycle sync, contact subscriptions, avatar-cache prewarming, detail-modal state. |
| `ActivityItem.tsx` | Composes one accessible activity row from the focused presentation modules. | Theme selection and click delegation only. |
| `ActivityMedia.tsx` | Renders rounded-square website identities and circular token/chain arrangements, including adaptive token tandems and collapsed same-asset bridges. | Image loading through the existing safe-image and cached-logo paths. |
| `ActivityStatus.tsx` | Renders transaction, Shield lifecycle, force-inclusion, and bridge status language. | Presentation only. |
| `ActivityExplorerActions.tsx` | Renders first-line trailing explorer controls, including bridge source/destination actions. | Presentation only; delegates effects to the explorer hook. |
| `useActivityExplorers.ts` | Resolves exact source, L1, and destination transaction links. | Network context and `chrome.tabs.create`. |
| `usePrivacyShieldActivitySync.ts` | Keeps public Shield lifecycle snapshots current while wallet Activity is mounted. | Existing bounded `privacySyncShield` route; ten-second active and two-minute ASP cadences. |
| `activityModel.ts` | Pure grouping, formatting, status, and row-label derivation helpers. | No React, Chakra, storage, or network dependencies. |
| `privacyShieldActivityModel.ts` | Selects Shield rows and derives their bounded lifecycle-sync cadence. | Pure model; no React, Chrome, storage, or network dependencies. |
| `activityIdentityModel.ts` | Merges current wallet names and contact labels by address, with contacts taking precedence. | Pure model; no React, Chrome, storage, or network dependencies. |

## Dependency direction

`TxStatusList` facade → `ActivityList` → `ActivityItem` → focused presentation
modules. UI modules may consume the pure Activity models; those models must
never import UI modules. Explorer URL resolution and tab effects stay behind
`useActivityExplorers`; an overlay details button and first-line explorer
siblings keep the complete row clickable without nesting interactive controls.
Shield rows remain normal `CompletedTransaction` entries and retain that same
detail navigation. Their optional public projection supplies only the gross
amount, net Shield credit, lifecycle state, operation ID, and update time; the
pure Activity model maps it to the same four stages used by the Shield screen.
Public-withdrawal rows come from the bounded Shield operation projection.
User-rejected prompts are filtered by the background after their claims are
safely released, so cancelling one's own prompt does not create a failed
Activity card. Genuine failures and submitted/recovered exits remain visible.

Keep implementation modules below roughly 400 lines and extract a coherent
component, hook, or pure model concern before adding another independent
responsibility. Behavior-level activity coverage belongs with extension UI
tests; pure formatting/grouping coverage should target `activityModel.ts`.
