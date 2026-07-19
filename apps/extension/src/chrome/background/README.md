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
6. `authRouter.ts`, `bankrCredentialRouter.ts`, `onboardingRouter.ts` —
   trusted-UI auth transport and atomic Bankr credential/account binding.
7. `accountStateRouter.ts`, `contactBookRouter.ts`, `accountManagementRouter.ts`,
   `ledgerRouter.ts` — non-secret account/contact state plus master-gated
   account/seed/Ledger mutation and hardware discovery transport.
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
19. `resetRouter.ts` — synchronous reset-barrier installation followed by the
   master-only, serialized destructive reset sequence.
20. `lifecycle/` — focused Chrome callbacks and immediate startup effects;
   review its `README.md` in service-worker execution order.

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
