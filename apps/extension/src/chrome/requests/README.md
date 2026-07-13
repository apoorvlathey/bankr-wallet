# Durable request audit domain

Pending prompts are durable authorization state. Review the implementation in
this order:

1. `pinnedRequest.ts` — account-bound transaction, signature, and batch
   factories with no storage effects.
2. `pendingRequestResolution.ts` — synchronous first-action claims, effect
   leases, and the wallet-reset barrier.
3. `pendingTxStorage.ts`, `pendingSignatureStorage.ts`,
   `pendingBatchTxStorage.ts`, `pendingWatchAssetStorage.ts`,
   `pendingAddChainStorage.ts`, `dappPermissionStorage.ts`, and
   `pendingBridgeStorage.ts` — locked durable repositories and badge updates.
4. `pendingRequestLifecycle.ts` — injected-origin, account credential, and
   WalletConnect authorization immediately before effects.
5. `pendingRequestTerminalization.ts`, `pendingRequestExpiry.ts`, and
   `pendingSignatureRelease.ts` — remove-before-result failures, claimed
   expiry, and post-sign authority revalidation.
6. `pendingDappRequestLifecycle.ts`, `pendingMetadataPromptLifecycle.ts`,
   `pendingBatchAcknowledgementLifecycle.ts`, and
   `pendingWalletConnectLifecycle.ts` — exact origin/tab/topic cancellation
   and terminalization.

The storage keys and result prefixes in these repositories are upgrade and
provider-protocol boundaries. File moves must not change their schemas,
request IDs, timestamps, expiry windows, per-origin limits, account/origin/tab
pinning, first-action claim/release order, remove-before-result ordering, or
WalletConnect durable terminal-outbox routing. The root
`pendingErc7715PermissionStorage.ts` remains the existing stable ERC facade;
WalletConnect routes/outbox stay in `walletConnect/storage.ts`, and bundle
status stays with the batch domain.
