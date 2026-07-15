# ERC-7715 permission confirmation UI domain

`../Erc7715PermissionConfirmation.tsx` is the policy-free compatibility facade
used by App and lazy loading.

## Audit map

| File | Responsibility | Effects |
| --- | --- | --- |
| `Erc7715PermissionConfirmation.tsx` | Coordinates the pinned request draft and explicit confirm/reject decisions. | Chrome messages and themed toast only. |
| `Erc7715PermissionScreen.tsx` | Composes shared request identity, queue, chain context, disclosure, and sticky actions. | Disclosure scroll state only. |
| `PermissionSummary.tsx` | Explains reusable authority in plain language. | None. |
| `PermissionLimits.tsx` | Presents the dapp-provided reason, live permission exposure, asset context, and delegate, then progressively discloses edits and validation. | Address popover callbacks and disclosure scroll state. |
| `PermissionAdvancedDetails.tsx` | Keeps request type, manager, caveats, and exact JSON auditable. | Copy and address-popover callbacks only. |
| `PermissionDecisionSummary.tsx` | Reuses the transaction/signature `Signing with` footer row. | Account display lookup only. |
| `permissionPresentation.ts` | Pure origin, intent, amount, cadence, expiry, and wallet eligibility projection. | None. |
| `streamRateUnit.ts` | Converts editable stream rates between per-second caveat units and human-readable daily units without rounding authority upward. | None. |
| `StreamRateField.tsx` | Presents the stream-rate amount, per-second/per-day selector, fiat preview, and precision notice. | Input callbacks only. |
| `Erc7715PermissionEditableControls.tsx` | Owns adjustment inputs within the background-approved edit envelope. | Local form state and validation callbacks only. |
| `Erc7715ApprovalRevocationControls.tsx` | Isolates approval-cleanup methods and expiration editing from token allowance controls. | Local validation callback only. |
| `useErc7715PermissionAsset.ts` | Resolves verified token metadata, current balance, and fiat context. | Token metadata, portfolio catalog, and bounded balance reads. |
| `useDisplayedPermissionCaveats.ts` | Rebuilds display caveats from the edited request while retaining the pinned nonce. | Memoization only. |
| `useErc7715PermissionActions.ts` | Owns explicit confirm/reject transport and result feedback. | Chrome messages and themed toast. |
| `types.ts` | Public screen and wallet-type contract. | None. |

The renderer may edit only fields already permitted by the request. Validation,
master-session authorization, account pinning, caveat reconstruction, signing,
first-action claims, and grant publication remain in the background ERC-7715
domain. Permission prompts do not expire automatically.
