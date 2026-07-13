# Service-worker domain map

The `chrome/` root is an integration boundary, not a general-purpose source
directory. A file should remain here only when it is one of:

1. a manifest/Vite entrypoint (`background.ts`, `inject.ts`, `impersonator.ts`,
   `ensBanner.ts`);
2. a documented compatibility facade that preserves a widely used public API;
3. a genuinely cross-domain primitive such as shared types, lock ordering, or
   authorization-transition state.

Implementations belong in named audit domains. Current domains include:

- `accounts/`, `auth/`, `passkey/`, `session/`, `mnemonic/`, `localSigning/`
  for account and secret authority;
- `transactions/`, `signatures/`, `batch/`, `erc7715/`, `simulation/` for
  signing, execution, permission, and review flows;
- `background/` for message-channel adapters only;
- `ensBrowsing/` for ENS/IPFS resolution and bounded remote content.

The remaining root implementations are migrated in behavior-preserving
tranches into `bankr/`, `requests/`, `dapp/`, `walletConnect/`,
`sponsoredTransfers/`, `portfolio/`, `network/`, `tokens/`, and
`forceInclusion/`. Each domain must have its own `README.md`, one-way
dependencies, mirrored tests, and implementation files below the audit-size
budget. A move must not change storage keys, serialized records, message names,
or public function identity unless an explicit migration is designed.
