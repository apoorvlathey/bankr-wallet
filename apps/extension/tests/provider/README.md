# Provider boundary tests

This directory audits requests entering from dapps and the injected provider:

- `externalMessageValidation.test.ts` freezes untrusted envelope, identifier,
  URL, payload, and resource limits.
- `chainBoundary.test.ts` freezes exact provider-chain pinning.
- `dappRequestPolicy.test.ts` freezes exact-origin/top-frame authorization.
- `connectionBoundary.test.ts` exercises the injected/content-script bridge and
  statically checks that privileged routes retain their connection guard.

Tests for Chrome listener audience classification live in `../background/`.
Tests for actual RPC egress live in `../network/`.
