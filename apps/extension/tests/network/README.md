# Network and remote-content tests

This directory audits service-worker and renderer egress boundaries:

- `rpcHttpClient.test.ts` and `safeRpcForwarding.test.ts` cover configured RPC
  target policy, bounded JSON-RPC, redirects, credentials, and concurrency.
- `boundedHttp.test.ts` freezes the shared deadline, byte, redirect, credential,
  referrer, and cache defaults.
- `architecture.test.ts` enforces the network domain, root cleanup, module-size
  ceilings, storage ownership, and RPC allowlist/egress constants.
- `apiEgress.test.ts` covers swap, bridge, and portfolio API redirect/body
  limits; `storageSecurity.test.ts` covers custom-network validation, including
  bounded local saved-RPC lists. `chains.test.ts` covers active-first,
  deduplicated endpoint-list normalization without changing runtime networks.
- `nftMetadataBoundary.test.ts` and `remoteImageRendererBoundary.test.ts` cover
  NFT metadata egress and safe renderer primitives. The privileged avatar
  fetch/decode/cache pipeline now has its own mirrored `../avatar/` audit map.

ENS gateway traffic has additional page/sender rules and therefore lives in
`../ensBrowsing/`. URL-to-browser navigation policy lives in `../navigation/`.
