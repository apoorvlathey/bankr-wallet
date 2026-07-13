# ENS browsing tests

This directory audits the web-accessible ENS browsing subsystem:

- `senderAuthorization.test.ts` freezes the exact page, top-frame, and content
  script combinations allowed to call each ENS browsing message.
- `gatewayEgress.test.ts` freezes local Kubo host validation and redirect-free,
  credential-free probe requests.
- `resolverFacade.test.ts` freezes the stable resolver entrypoint and its
  fail-closed input validation without requiring network access.
- `architecture.test.ts` keeps the message and resolver facades small, enforces
  one-way domain dependencies, and ratchets each extracted module below the
  repository's audit-size ceiling.
- `bannerContracts.test.ts` freezes the restricted `.eth`, `.gwei`, and raw
  ERC-4804 input grammar, safe favicon schemes, path rendering, and hosted
  gateway selection.
- `bannerArchitecture.test.ts` keeps `ensBanner.ts` as the exact thin
  Vite/manifest entrypoint and separates page parsing, runtime transport,
  bookmark/gateway actions, rendering, and SPA state wiring.

The manifest exposure of the packaged ENS pages is covered in `../manifest/`.
