# Provider boundary tests

This directory audits requests entering from dapps and the injected provider:

- `externalMessageValidation.test.ts` freezes untrusted envelope, identifier,
  URL, payload, and resource limits.
- `chainBoundary.test.ts` freezes exact provider-chain pinning.
- `caps.test.ts` freezes shared resource ceilings, coercion resistance, and the
  page-facing EIP-1193 error contract.
- `architecture.test.ts` enforces direct domain imports, root cleanup, and
  per-module audit budgets.
- `effectBoundary.test.ts` prevents validation policy from acquiring storage,
  network, secret, signing, or broadcast effects and freezes ingress ordering.
- `entrypoints.test.ts` freezes manifest build roots, bootstrap identity, exact
  page/runtime allowlists, entry sizes, and one-way domain dependencies.
- `inpageRouting.test.ts` exercises account, transaction, ERC-5792, safe-RPC,
  request/result correlation, EIP-6963, and legacy `window.ethereum` behavior.
- `connectionBoundary.test.ts` exercises the injected/content-script bridge and
  statically checks that privileged routes retain their connection guard.

Tests for Chrome listener audience classification live in `../background/`.
Exact-origin authorization and removal privacy live in `../dapp/`.
Tests for actual RPC egress live in `../network/`.
