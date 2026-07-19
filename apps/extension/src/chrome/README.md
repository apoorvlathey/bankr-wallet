# Service-worker domain map

The `chrome/` root is an integration boundary, not a general-purpose source
directory. A file should remain here only when it is one of:

1. a manifest/Vite entrypoint (`background.ts`, `inject.ts`, `impersonator.ts`,
   `ensBanner.ts`);
2. a documented compatibility facade that preserves a widely used public API;
3. a genuinely cross-domain primitive such as shared types, lock ordering, or
   authorization-transition state.

Implementations belong in named audit domains. Current domains include:

- `cryptography/`, `accounts/`, `auth/`, `passkey/`, `session/`, `mnemonic/`,
  `secrets/`, and `localSigning/` for record codecs, key wrapping, account
  state, plaintext release, and secret authority;
- `transactions/`, `signatures/`, `batch/`, `erc7715/`, `simulation/` for
  signing, execution, permission, and review flows;
- `bankr/`, `walletConnect/`, `forceInclusion/`, `arbitrumForceInclusion/`, and `sponsoredTransfers/` for
  remote signing, remote sessions, L1 recovery, and ERC-3009 relay recovery;
- `onboarding/`, `requests/`, and `portfolio/` for fresh-wallet
  initialization, durable prompt coordination, and non-secret asset state;
- `dapp/` for exact-origin account visibility, connection privacy, and the
  page-local read-only RPC fast path;
- `delegation/` for EIP-7702 status/probing, custom-delegate mirror storage,
  authority policy, and construction/queueing of pinned Set/Revoke requests;
- `background/` for message-channel adapters only;
- `ensBrowsing/` for ENS/IPFS resolution and bounded remote content.
- `provider/` for effect-free external envelope, payload-cap, metadata, chain,
  and EIP-1193 error policy shared by injected and WalletConnect ingress;
- `network/` for bounded HTTP/RPC egress and custom-network persistence.
- `swap/` for bounded swap quotes, configured-chain reads, approval calldata,
  and non-secret token metadata caches.
- `tokens/` for custom-token storage, shared display metadata, bounded NFT
  tokenURI resolution, and calldata-derived asset discovery.
- `history/` for the released transaction-history schema, locked repository,
  cleanup, receipt projection, and best-effort post-confirm enrichment.
- `bridge/` for bounded bridge API/catalog access, EVM chain policy, and
  durable destination-settlement polling over `pendingBridges`.
- `storage/` for the shared per-key lock, exact reset manifest, non-critical
  cache pruning, and durable provider-result waiting primitives.
- `clearSigning/` for bounded ERC-7730 descriptor resolution, proxy deployment
  binding, optional Activity summaries, and fire-and-forget history attachment.
- `avatar/` for public-only remote-image policy, bounded manual-redirect
  transport, raster decode/re-encode, FIFO/reset scheduling, and the locked
  best-effort `ensAvatarImageCache` repository.
- `windowing/` for Chrome/Firefox/Arc capability policy, released display-mode
  settings, verified side-panel request opening, and reusable/clamped detached
  popup placement. `sidepanelManager.ts` and `extensionPopup.ts` remain
  export-only compatibility facades.

The remaining root implementations are migrated in behavior-preserving
tranches into explicit domains. Each domain must have its own
`README.md`, one-way dependencies, mirrored tests, and implementation files
below the audit-size budget. A move must not change storage keys, serialized
records, message names, or public function identity unless an explicit
migration is designed.
