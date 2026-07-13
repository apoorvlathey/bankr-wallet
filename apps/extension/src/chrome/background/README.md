# Background transport audit domain

`../background.ts` is the MV3 composition root. It owns service-worker
lifecycle, sender gating, and delegation—not wallet business logic.

Review order:

1. `messageAccessPolicy.ts` — exhaustive `wallet-ui` vs `provider` audience.
2. `providerRequestRejection.ts` — pure durable rejection mapping.
3. `authRouter.ts`, `onboardingRouter.ts` — trusted-UI auth transport only.
4. `accountStateRouter.ts`, `settingsRouter.ts` — non-secret wallet UI state.
5. `dappPermissionRouter.ts`, `watchAssetRouter.ts`, `chainPromptRouter.ts` —
   exact sender/tab/origin-bound provider prompts.
6. `walletConnectSessionRouter.ts` — trusted-UI session management.
7. `signingRequestRouter.ts` — provider intake plus trusted-UI pending
   transaction/signature reads and first-action decisions.
8. `transactionStatusRouter.ts` — trusted-UI history, processing, failed-result,
   nonce-cache, enrichment, and receipt-status transport.

Routers return an explicit handled/channel-lifetime result and delegate domain
effects through focused modules or injected dependencies. They must not contain
cryptography, secret persistence, transaction signing, or reusable authority
issuance. Adding a route without an audience classification fails the security
suite.
