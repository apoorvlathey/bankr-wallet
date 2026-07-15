# Shared Request Confirmation UI

Renderer-only primitives shared by transaction, batch, and signature decision
screens.

| File | Responsibility | Effects |
| --- | --- | --- |
| `RequestIdentity.tsx` | Centered requesting-app identity shared by every signing decision. | None. |
| `EstimatedChangesHeading.tsx` | Shared `on <chain> name` heading context plus the transaction/batch simulation heading. | None. |
| `QueueNavigation.tsx` | Pending-request navigation and reject-all action. | Callbacks only. |
| `ForceInclusionOption.tsx` | OP Stack force-inclusion advanced row. | Callback only. |
| `RequestToolActions.tsx` | Compact Tenderly and add-to-batch action rows, with disabled batch reasons disclosed on hover/focus and retained in accessible labels. | Local tooltip state; callbacks only. |
| `SimulationFailureConfirmButton.tsx` | Warning-state Confirm action and explicit proceed-anyway dialog shared by single, batch, and cross-dapp requests. | Local dialog state; invokes the supplied confirm callback only after the gate. |
| `simulationFailure.ts` | Pure policy for explicit simulation failures that require the second confirmation. | None. |

Feature roots own request policy and pass already-resolved labels, chain data,
and callbacks into these components.
