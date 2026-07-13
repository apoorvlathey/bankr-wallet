# Content-script provider bridge

This folder is the isolated-world boundary between page `postMessage` traffic
and extension runtime/storage messages.

- `messagePolicy.ts` is the exact bidirectional message allowlist and source check.
- `initialization.ts` injects the manifest-built inpage script and publishes the
  connected-site-scoped initial account.
- `runtimeForwarding.ts` forwards only account/chain/revocation events and never
  leaks configured RPC URLs or unrelated wallet activity.
- `pageRouter.ts` dispatches accepted page messages to focused account/chain,
  signing/RPC, ERC-5792, and delegated-permission adapters.
- `bridgeState.ts` owns non-secret content-script account/chain state and the
  extension-attested chain lookup.
- `gatewayMetadata.ts` preserves the document-start ENS gateway fallback and
  bounded metadata capture that historically lived in the entrypoint.
- `bootstrap.ts` fixes listener and injection startup order.

Every effectful request creates its extension-owned correlation id before it is
persisted. State-changing routes retain exact chain pinning and connected-site
privacy. `inject.ts` is only the Vite/manifest entrypoint.
