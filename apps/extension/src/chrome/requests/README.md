# Durable request audit domain

Pending prompts are durable authorization state. Review the implementation in
this order:

1. `pinnedRequest.ts` — account-bound transaction, signature, and batch
   factories with no storage effects.
2. `pendingRequestResolution.ts` — synchronous first-action claims, effect
   leases, and the wallet-reset barrier.
3. `pendingTxStorage.ts`, `pendingSignatureStorage.ts`,
   `pendingBatchTxStorage.ts`, `pendingBatchApprovalCleanup.ts`,
   `pendingWatchAssetStorage.ts`,
   `pendingAddChainStorage.ts`, `dappPermissionStorage.ts`, and
   `pendingBridgeStorage.ts` — locked durable repositories and badge updates.
4. `pendingRequestLifecycle.ts` — injected-origin, account credential, and
   WalletConnect authorization immediately before effects.
5. `pendingRequestTerminalization.ts` and `pendingSignatureRelease.ts` —
   remove-before-result failures and post-sign authority revalidation.
6. `pendingDappRequestLifecycle.ts`, `pendingMetadataPromptLifecycle.ts`, and
   `pendingWalletConnectLifecycle.ts` — exact origin/tab/topic cancellation and
   terminalization.

Every user-review prompt is durable and deliberately has no age-based expiry:
transactions, signatures, ERC-5792 batches, cross-dapp batches, dapp
connections, add-chain prompts, watch-asset prompts, and ERC-7715 permission
requests remain pending until the user decides or their authorization context
is explicitly invalidated. Short-lived WalletConnect intake claims and
already-terminal response routes are transport artifacts, not prompts, and may
still be pruned.

The storage keys and result prefixes in these repositories are upgrade and
provider-protocol boundaries. File moves must not change their schemas,
request IDs, timestamps, per-origin limits, account/origin/tab pinning,
first-action claim/release order, remove-before-result ordering, or
WalletConnect durable terminal-outbox routing. The root
`pendingErc7715PermissionStorage.ts` remains the existing stable ERC facade;
WalletConnect routes/outbox stay in `walletConnect/storage.ts`, and bundle
status stays with the batch domain.

`pendingBatchApprovalCleanup.ts` may append only canonical
`ERC20.approve(spender, 0)` calls after fully validated, actionable ERC-5792
rows. It validates and deduplicates a bounded bulk set before entering the
pending-batch storage lock, rejects aggregate over-limit edits, preserves every
dapp-authored prefix call and route field, and marks the request
atomic-required.
