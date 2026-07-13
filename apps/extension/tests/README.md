# Extension test organization

Security and logic tests mirror the service-worker domains they exercise:

- `cryptography/`, `auth/`, `passkey/`, `session/` — record encryption,
  authorization factors, and secret sessions.
- `vault/`, `mnemonic/`, `secrets/` — local signing material, recovery
  secrets, and master-only plaintext release.
- `accounts/`, `onboarding/` — account metadata and fresh-wallet lifecycle.
- `erc7715/`, `batch/`, `transactions/`, `signatures/`, `simulation/`,
  `forceInclusion/`, `gas/`, `history/` — provider authority,
  signing/broadcast, fee estimation, asset-preview/history, L1-deposit, and
  transaction-recovery flows.
- `requests/` — pending-request claims, lifecycle, expiry, and capacity.
- `background/`, `walletConnect/`, `provider/` — Chrome transport, remote
  sessions, and injected-provider boundaries.
- `network/`, `ensBrowsing/`, `navigation/`, `manifest/` — egress, remote
  content, external URL, and packaged-exposure policy.
- `storage/`, `security/` — shared infrastructure and cross-domain invariants.
- `windowing/` — browser capability/mode policy, side-panel verification,
  popup reuse/geometry, Chrome effect order, and historical facade identity.
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
