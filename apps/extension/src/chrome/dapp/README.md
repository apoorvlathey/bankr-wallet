# Dapp authorization audit domain

This domain controls when a webpage may see an account or use a page-discovered
read-only RPC. Review it in this order:

1. `requestPolicy.ts` — Chrome-attested top-level sender, exact current-tab
   origin, and existing permission authorization.
2. `accountScope.ts` — approved-origin or exact pending-tab eligibility for a
   per-tab account override.
3. `accountRemovalPrivacy.ts` — shared binding lock, pending connection
   terminalization, exact-origin revocation, then account deletion.
4. `connectionHandlers.ts` — connection intake, confirm/reject, durable result
   routing, origin revocation gates, per-tab cleanup, and UI broadcasts.
5. `rpcForwarding.ts` — page-local discovery, narrow read-only method allowlist,
   URL/chain probing limits, bounded timeouts, and extension-RPC fallback.

Approved and pending connection records remain owned by
`requests/dappPermissionStorage.ts`. A page-supplied origin is never an
authorization input: only Chrome sender/tab metadata may grant access. Account
removal must revoke every exact origin and terminalize affected pending
connections before deleting account metadata, otherwise tab fallback could
expose an unrelated account. Page-discovered RPCs never handle signing,
submission, account/chain mutation, nonce/code reads, gas estimation, or
stateful filters; failures return `forwarded: false` to the authoritative
extension RPC path.
