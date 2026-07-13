# Network and remote-content tests

This directory audits service-worker and renderer egress boundaries:

- `rpcHttpClient.test.ts` and `safeRpcForwarding.test.ts` cover configured RPC
  target policy, bounded JSON-RPC, redirects, credentials, and concurrency.
- `apiEgress.test.ts` covers swap, bridge, and portfolio API redirect/body
  limits; `storageSecurity.test.ts` covers custom-network validation.
- `avatarImageBoundary.test.ts`, `nftMetadataBoundary.test.ts`, and
  `remoteImageRendererBoundary.test.ts` cover SSRF-resistant remote media,
  bounded raster handling, and safe renderer primitives.

ENS gateway traffic has additional page/sender rules and therefore lives in
`../ensBrowsing/`. URL-to-browser navigation policy lives in `../navigation/`.
