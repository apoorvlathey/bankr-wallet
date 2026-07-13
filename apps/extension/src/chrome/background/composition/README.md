# Background composition audit map

These modules wire released domain implementations into transport routers. They
contain no wallet policy, storage schema, cryptography, signing, or lifecycle
effects of their own.

Review order:

1. `pendingResolution.ts` — shared request-claim identities and conflict copy.
2. `providerContext.ts` — one provider-origin/rejection/signature/chain context.
3. `identityRoutes.ts` — auth, Bankr credential, onboarding, account-state, and settings routes.
4. `accountRoutes.ts` — dapp/WalletConnect permissions and account/secret management.
5. `providerRoutes.ts` — read-only RPC, metadata prompts, and single signing intake.
6. `advancedRoutes.ts` — ERC-5792, EIP-7702, cross-dapp, ERC-7715, and simulation.
7. `executionRoutes.ts` — transaction, swap, sponsored-transfer, and status routes.
8. `dataRoutes.ts` — quote/token/chat/clear-signing/reset routes.
9. `routes.ts` — constructs the shared contexts once and aggregates route identities.
10. `lifecycle.ts` — registers lifecycle modules and the message listener in released order.

`../bootstrap.ts` invokes only route construction, pipeline construction, and
lifecycle registration. `../../background.ts` invokes only that bootstrap.
