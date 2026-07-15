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
- `requestSurfacePreflight.ts` synchronously reuses the bounded provider schema
  and cached account/chain state so rejected requests cannot consume the early
  sidepanel-opening gesture; background validation remains authoritative.
- `requestSurfaceSignaturePreflight.ts` mirrors the complete synchronous
  EIP-712 schema, raw-delegation, and domain-chain rejection policy used before
  a signature request can be persisted.
- `requestSurfaceBatchPreflight.ts` mirrors ERC-5792 account/chain binding and
  self-recursion rejection before provisional persistence.
- `requestSurfacePermissionPreflight.ts` mirrors request-only ERC-7715 shape,
  permission/rule, address, account-type, and supported-chain policy before
  network-backed delegation eligibility.
- `requestSurface.ts` owns the preference-aware, user-activation-preserving
  sidepanel signal for requests that pass that preflight.
- `gatewayMetadata.ts` preserves the document-start ENS gateway fallback and
  bounded metadata capture that historically lived in the entrypoint.
- `bootstrap.ts` fixes listener and injection startup order.

Every effectful request creates its extension-owned correlation id before it is
persisted. State-changing routes retain exact chain pinning and connected-site
privacy. `inject.ts` is only the Vite/manifest entrypoint.
