# Clear-signing tests

- `architecture.test.ts` freezes facade identities, dependency direction,
  root clutter, and audit-size budgets.
- `descriptor.test.ts` covers exact cache keys/schema/TTLs, default-on settings,
  opt-out purge/short-circuit, input bounds, bounded descriptor egress, and
  404/null behavior.
- `proxyFallback.test.ts` covers direct priority, configured-RPC fallback
  orchestration, immutable deployment extension, and proxy failure behavior.
- `snapshot.test.ts` covers approve/transfer/native/ERC-7730 priority, remote
  versus built-in matching, null-on-error behavior, and fire-and-forget history
  attachment.

UI rendering and descriptor formatting remain in `tests/ui/`; trusted message
transport remains in `tests/background/clearSigningRouter.test.ts`.
