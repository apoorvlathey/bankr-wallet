# Background transport audit domain

`../background.ts` is a five-line MV3 entrypoint. It only invokes
`bootstrap.ts`; it owns no lifecycle, sender policy, router wiring, or wallet
business logic.

Review order:

1. `bootstrap.ts` — route construction, pipeline construction, lifecycle registration.
2. `messagePipeline.ts` — ENS-first, audience/provider gates, exact route order.
3. `composition/` — audit-sized route-family dependencies and lifecycle wiring.
4. `messageAccessPolicy.ts` — exhaustive `wallet-ui` vs `provider` audience.
5. `providerRequestRejection.ts` — pure durable rejection mapping.
6. `authRouter.ts`, `bankrCredentialRouter.ts`, `onboardingRouter.ts`,
   `privacyRouter.ts`, `privacyRecoveryRouter.ts` — trusted-UI auth transport, atomic Bankr
   credential/account binding, status-only privacy identity initialization,
   the deployment-first fixed-fixture Shield readiness trigger, aggregate-only
   prover QA timing route, the
   account-pinned read-only active-profile Shield quote, master-only non-submittable
   review preparation, encrypted durable operation/list transport, and
   explicit master-only Shield phrase backup/restore/rescan transport.
   `privacyListShieldOperations` returns aggregates and bounded public
   lifecycle projections only; it omits user-rejected public-withdrawal prompts
   after the domain has safely released their claims while preserving genuine
   failure and submitted/recovered states. A cold dedicated privacy key keeps
   encrypted ready/recoverable balances unavailable, but the list route still
   derives confirmed and ASP-pending totals from those same public operation
   projections so popup reopen cannot erase visible processing state.
   The sync route refreshes those known operation labels before the bounded
   mainnet event-history scan; matching lifecycle broadcasts can therefore
   update an open renderer without waiting for the backfill response.
   `lifecycle/privacyAspRefresh.ts` handles the exact one-shot compliance alarm
   so pending work can reach publicly verified `asp_approved` and emit its
   generic approval notification while no WalletChan renderer is open and the
   privacy key is cold. Secret-derived `private_ready` reconciliation remains
   unlock-gated.
   Transaction-detail public recovery
   may include one bounded source Shield operation ID, which `privacy/ragequit/`
   must bind to the exact encrypted commitment rather than treating as proof or
   falling back to another deposit. `privacyPreviewRagequit` is the read-only
   whole-commitment review boundary: it lists every current ragequittable
   deposit with only its opaque commitment-record ID, timestamp, exact amount,
   and original account/source binding. It cannot prove, persist a recovery
   intent, claim, or queue. The router may materialize already-indexed encrypted
   state. `privacyPrepareRagequit` repeats one selected commitment ID,
   account/source binding, and reviewed amount before any proof or normal
   transaction request is created. `privacyPrepareRagequitBatch` accepts 2–8
   distinct selections only when every original-account field matches, then
   queues an immutable atomic request with canonical operation-ID/call order.
7. `accountStateRouter.ts`, `contactBookRouter.ts`, `accountManagementRouter.ts` — non-secret account/contact
   state plus master-gated account/seed mutation orchestration.
8. `secretManagementRouter.ts` — trusted-sender plaintext release and pinned
   signature/delegated-permission confirmation transport.
9. `batchRequestRouter.ts`, `delegationRouter.ts`,
   `crossDappBatchRouter.ts`, `erc7715PermissionRouter.ts` — ERC-5792
   intake/decisions, EIP-7702 controls, delegated permissions, and multi-source
   batch assembly.
10. `gasSimulationRouter.ts`, `swapBridgeDataRouter.ts`, `tokenDataRouter.ts` —
   trusted-UI estimation plus read-only quote, metadata, catalog, price,
   allowance, and balance transport.
11. `chatRouter.ts`, `clearSigningRouter.ts` — Bankr chat and clear-signing
   preference/descriptor transport.
12. `settingsRouter.ts` — non-secret wallet UI settings.
13. `dappPermissionRouter.ts`, `providerRpcRouter.ts`, `watchAssetRouter.ts`,
   `chainPromptRouter.ts` — exact sender/tab/origin-bound provider prompts and
   durable read-only RPC forwarding.
14. `providerIngress.ts`, `signatureValidation.ts`,
   `chainSwitchNotification.ts` — connected-origin rejection, EIP-712 intake,
   and notification/cooldown helpers used by the ordered provider pipeline.
15. `walletConnectSessionRouter.ts` — trusted-UI session management.
16. `signingRequestRouter.ts` — provider intake plus trusted-UI pending
   transaction/signature reads, rejection, and cancellation.
17. `transactionExecutionRouter.ts`, `swapExecutionRouter.ts`,
   `sponsoredTransferRouter.ts`, `internalOperationBarrier.ts` — first-action
   transaction confirmation and reset-barrier-protected internal
   execution/recovery transport.
18. `transactionStatusRouter.ts` — trusted-UI history, processing, failed-result,
   nonce-cache, enrichment, and receipt-status transport.
19. `resetRouter.ts` and `reset/execution.ts` — public Shield-risk preflight,
   exact acknowledgement, synchronous reset-barrier installation, then the
   master-only serialized destructive reset sequence.
20. `lifecycle/` — focused Chrome callbacks and immediate startup effects;
   review its `README.md` in service-worker execution order.

`lifecycle/trustedUiPorts.ts` treats a main wallet port as an authentication
presence signal only after an exact `{ type: "wallet-ui-register", surfaceId }`
handshake from a trusted top-level `index.html` sender. The port may then send
only same-ID heartbeats. Duplicate/changing/malformed IDs disconnect. Popup,
side-panel, and full-page documents share the bounded surface lease; onboarding
uses `onboarding-keepalive` solely for worker liveness and never pauses
auto-lock. Surface transitions are serialized with manual lock and factor
changes through `session/uiSurfaceLease.ts`.

Routers return an explicit handled/channel-lifetime result and delegate domain
effects through focused modules or injected dependencies. They must not contain
cryptography, secret persistence, transaction signing, or reusable authority
issuance. Adding a route without an audience classification fails the security
suite: the architecture tests enumerate every root router and require its actual
dispatch literals to exactly match its exported message manifest. They also
enforce one-way entrypoint → bootstrap → composition/pipeline → router/domain
dependencies. `composition/lifecycle.ts` owns the single `onMessage`
registration and released listener order; focused callbacks and startup effects
live under `lifecycle/`.
