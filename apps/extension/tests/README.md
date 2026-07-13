# Extension test organization

Security and logic tests mirror the service-worker domains they exercise:

- `auth/`, `passkey/`, `session/` — authorization factors and secret sessions.
- `vault/`, `mnemonic/` — local signing material and recovery secrets.
- `accounts/`, `onboarding/` — account metadata and fresh-wallet lifecycle.
- `erc7715/`, `batch/`, `transactions/`, `signatures/`, `simulation/` —
  provider authority, signing/broadcast, and asset-preview flows.
- `requests/` — pending-request claims, lifecycle, expiry, and capacity.
- `background/`, `walletConnect/`, `provider/` — Chrome transport, remote
  sessions, and injected-provider boundaries.
- `network/`, `ensBrowsing/`, `navigation/`, `manifest/` — egress, remote
  content, external URL, and packaged-exposure policy.
- `storage/`, `security/` — shared infrastructure and cross-domain invariants.
- `bankr/`, `sponsoredTransfers/` — remote signer and sponsored-authorization
  boundaries.
- `portfolio/`, `preview/`, `ui/` — renderer/view-model and preview tests;
  interactive QA remains outside
  `test:security`.

`scripts/run-security-tests.mjs` discovers `*.test.ts` recursively. Keep the
test root free of test files: domain-specific coverage belongs in its matching
folder, and cross-cutting invariants belong in `security/`. Moving a test must
not change what it asserts; update its relative imports and any focused package
script in the same change.

Architecture tests belong beside the domain whose dependency direction and
size budgets they enforce. Frozen historical records remain in `fixtures/`,
and reusable Chrome-storage harnesses remain in `helpers/`.
