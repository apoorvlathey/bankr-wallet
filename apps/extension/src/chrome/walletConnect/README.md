# WalletConnect audit domain

All implementations and callers use this folder directly; there is no root
compatibility family. Review implementation in this order:

1. `requestValidation.ts`, `sessionPolicy.ts` — bounded request, CAIP, method,
   account, and metadata policy without SDK ownership.
2. `storage.ts`, `protocol.ts`, `outbox.ts` — durable remote-request claims,
   first terminal responses, and replay/removal ordering.
3. `pendingRequests.ts`, `batchRequests.ts`, `rpcRequests.ts` — transaction,
   signature, ERC-5792, and safe RPC method adapters.
4. `requestRouter.ts` — claimed session-request dispatch after validation and
   method approval.
5. `proposal.ts`, `sessionProposal.ts`, `chainState.ts` — namespace approval,
   rejection metadata, and active-chain synchronization.
6. `keepalive.ts`, `reset.ts` — relay liveness and replacement-wallet SDK
   namespace teardown.
7. `client.ts`, `sessionCommands.ts`, `resultBridge.ts` — SDK lifecycle,
   trusted-UI commands, and durable result delivery composition.
8. `payUnavailable.ts` — CSP-safe fail-closed alias for optional Pay support.

Storage key names, namespace rotation, SDK listener generation checks, and
terminal-response persistence are compatibility boundaries. Folder moves must
not alter them.
