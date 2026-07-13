# Extension UI tests

Renderer architecture, pure feature models, and view-model tests belong here.
The architecture tests protect feature-folder audit maps, domain-free mobile
primitives, one-way dependencies, and ratcheting source-size budgets without
launching a browser.

Mirror a source feature with a test subfolder once it has multiple focused
tests. Keep pure transformation/model coverage in Node tests. Rendered behavior,
accessibility, overflow, themes, frame sizes, and wallet variants belong in the
production-backed preview/runtime QA harness.

`scripts/run-security-tests.mjs` discovers these `*.test.ts` files recursively,
so structural UI regressions are part of the extension release gate.
