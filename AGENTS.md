# WalletChan

Browser wallet extension + landing page website in a pnpm workspace monorepo.

## Project Overview

**What it does**: WalletChan is a Wallet Chrome extension that enables and executing transactions through the Bankr API on all the dapps. Like MetaMask, but AI-powered. Supports Private Keys and Seed phrases as well.

**Supported chains**: Base (8453), Ethereum (1), MegaETH, Polygon (137), Unichain (130)

## Critical: Test ALL Wallet Types

**IMPORTANT**: WalletChan supports THREE wallet types:

1. **Bankr API accounts** (`type: "bankr"`) - Remote signing and transactions via the Bankr API
2. **Private Key accounts** (`type: "privateKey"`) - Local signing with imported private keys
3. **Seed Phrase accounts** (`type: "seedPhrase"`) - Local signing with HD wallet derivation

WalletChan also supports **view-only impersonator accounts**
(`type: "impersonator"`). They may receive reject-only transaction/signature
prompts but must never reach a signing or submission path.

**When implementing ANY feature that touches transactions, signatures, or authentication:**

- **Test with ALL THREE wallet types** before considering it done
- Different wallet types use different code paths (e.g., `confirmTransactionAsync` vs `confirmTransactionAsyncPK`)
- Agent password must work for signing transactions/messages for ALL types (not just Bankr API accounts)
- Private key reveal is blocked for agent password regardless of wallet type

**Common mistake**: Fixing something only for Bankr API accounts and forgetting that private key/seed phrase accounts have separate handlers.

## AI Session Workflow

**At the start of each session**, before writing any code:

1. **Read `_docs/IMPLEMENTATION.md`** when working on extension logic, message passing, background handlers, or crypto
2. **Read `_docs/STYLING.md`** when working on any UI components or styling
3. **Read `_docs/EXTENSION_UI_ARCHITECTURE.md`** when moving, splitting, or adding extension UI components, hooks, models, or feature folders
4. **Read `_docs/WEBSITE.md`** when working on the landing page

**Before every commit** that touches extension code:

5. **Read `_docs/SECURITY.md`** and verify changes against the pre-commit security checklist. This is critical for any changes to message handlers, storage, crypto, content scripts, or session management.

**After making any changes, before handing work back to the user:**

6. **Run `pnpm build:extension`** and confirm it succeeds. This is required even when targeted tests or typechecks already passed, so `apps/extension/build/` is always refreshed and ready for the user to reload and test in the browser.

**After making significant changes:**

- **Update `_docs/IMPLEMENTATION.md`** if you modified:
  - Message types or message flow
  - Background handler logic
  - Storage keys or encryption patterns
  - New features or architectural decisions
- **Update `_docs/SECURITY.md`** if you modified:
  - Message handlers that touch secrets or account data
  - Agent password access control (new blocked/allowed operations)
  - Storage keys (add to the storage keys reference)
  - Content script message filtering (new message types forwarded)
  - Encryption parameters or crypto logic
- Keep the documentation in sync with the code - future sessions depend on accurate docs

## Monorepo Structure

```
walletchan/
├── apps/
│   ├── extension/        # Browser extension (Vite + React + Chakra UI)
│   ├── website/          # Landing page (Next.js + Chakra UI)
│   ├── indexer/          # Ponder indexer for coin launches
│   ├── staking-indexer/  # Ponder indexer for sBNKRW vault staking
│   ├── tg-bot/           # Token-gated Telegram bot (Grammy + Hono)
│   ├── arb-bot/          # WETH↔WCHAN/BNKRW cross-pool arbitrage bot (Base)
│   ├── walletchan-rpc/   # Local JSON-RPC -> WalletConnect bridge
│   ├── walletchan-mcp/   # Local stdio MCP adapter for WalletChan RPC + Base skills
│   └── contracts/        # Solidity smart contracts (Foundry)
├── packages/
│   ├── shared/           # Shared design tokens, assets, and contract constants
│   └── wchan-swap/       # Shared swap logic (quoting, encoding, permit2)
├── _docs/                # LLM-facing documentation
│   ├── IMPLEMENTATION.md  # Extension architecture and message flows
│   ├── SECURITY.md        # Security audit guide, threat model, pre-commit checklists
│   ├── SECURITY_ARCHITECTURE.md # Audit map and critical module boundaries
│   ├── STYLING.md         # Bauhaus design system (colors, typography, components)
│   ├── WEBSITE.md         # Website PRD and section specs
│   ├── DEVELOPMENT.md     # Build and dev environment setup
│   └── PUBLISHING.md      # Release workflow, CWS upload, auto-update system
```

## Tech Stack

| App             | Framework               | UI Library | Build Tool |
| --------------- | ----------------------- | ---------- | ---------- |
| Extension       | React 18                | Chakra UI  | Vite       |
| Website         | Next.js 14 (App Router) | Chakra UI  | Next.js    |
| Indexer         | Ponder                  | Hono       | Ponder     |
| Staking Indexer | Ponder                  | Hono       | Ponder     |
| TG Bot          | Grammy + Hono           | —          | tsc        |
| Arb Bot         | Node.js + viem          | —          | tsc        |
| WalletChan RPC  | Node.js + Hono          | —          | tsc        |
| WalletChan MCP  | Node.js stdio MCP       | —          | tsc        |
| Contracts       | Solidity                | —          | Foundry    |

**Design System**: Bauhaus - geometric, primary colors (Red #D02020, Blue #1040C0, Yellow #F0C020), hard shadows, thick borders. See `_docs/STYLING.md`.

## Commands

```bash
# Install dependencies
pnpm install

# Development
pnpm dev:extension         # Build extension in dev mode
pnpm dev:website           # Start website dev server at localhost:3000
pnpm dev:staking-indexer   # Start staking indexer at localhost:42070
pnpm dev:tg-bot            # Start TG bot + API at localhost:3001
pnpm dev:arb-bot           # Start arb bot (requires .env with PRIVATE_KEY + BASE_RPC_URL)
pnpm dev:walletchan-rpc    # Start local JSON-RPC -> WalletConnect proxy at localhost:4209
pnpm dev:walletchan-mcp    # Start local stdio MCP adapter backed by walletchan-rpc

# Build
pnpm build              # Build both extension and website
pnpm build:extension    # Full Chrome extension build (all manifest scripts; output: apps/extension/build/)
pnpm build:website      # Build website only; do NOT use this to verify extension reloads
pnpm build:walletchan-rpc # Build WalletChan RPC CLI only
pnpm build:walletchan-mcp # Build WalletChan MCP CLI only

# Extension-specific
pnpm zip                # Build + zip (for GitHub Releases)
pnpm zip:cws            # Build + zip (strips `key` defensively, for CWS upload)
pnpm lint               # Lint extension code
pnpm test:extension-ui  # UI architecture, facade, pure-model, and size guardrails

# Contracts
pnpm build:contracts    # Compile Solidity contracts
pnpm test:contracts     # Run Foundry tests

# Foundry library installation (ALWAYS use git submodules)
cd apps/contracts && forge install <org>/<repo>   # Do NOT use --no-git

# Release (auto-bumps version, syncs manifest, creates tag, pushes)
pnpm release:patch      # 0.1.0 → 0.1.1
pnpm release:minor      # 0.1.0 → 0.2.0
pnpm release:major      # 0.1.0 → 1.0.0

# Store artifacts (required after every extension version bump)
pnpm zip:cws            # Fresh Chrome Web Store zip + Firefox zip for store uploads
```

## Extension Architecture

The extension has 5 build targets (see `apps/extension/vite.config.*.ts`):

| Script        | Purpose                                            |
| ------------- | -------------------------------------------------- |
| main.js       | Popup/sidepanel UI (React app)                     |
| onboarding.js | Full-page onboarding wizard                        |
| inpage.js     | Injected provider (EIP-6963 + window.ethereum)     |
| inject.js     | Content script (bridges inpage ↔ background)       |
| background.js | Service worker (API calls, storage, notifications) |

**Message flow**: Dapp → inpage.js → inject.js → background.js → Bankr API

For detailed architecture, message types, and flows, see `_docs/IMPLEMENTATION.md`.

## Key Extension Files

```
apps/extension/src/
├── chrome/
│   ├── background.ts        # Five-line MV3 bootstrap entrypoint
│   ├── background/          # Message transport audit domain (see README.md)
│   │   ├── bootstrap.ts     # Route/pipeline/lifecycle composition only
│   │   ├── messagePipeline.ts # Ordered ENS/audience/provider/route pipeline
│   │   ├── composition/     # Audit-sized route-family and lifecycle wiring
│   │   ├── messageAccessPolicy.ts # Exhaustive wallet-UI/provider audience
│   │   ├── authRouter.ts    # Wallet-UI auth/session delegation
│   │   ├── bankrCredentialRouter.ts # Atomic Bankr credential/account update transport
│   │   ├── onboardingRouter.ts # Fresh-wallet lifecycle transport
│   │   ├── accountStateRouter.ts # Non-secret account state/selection
│   │   ├── accountManagementRouter.ts # Master-gated account/seed mutations
│   │   ├── secretManagementRouter.ts # Reveal and signing confirmation transport
│   │   ├── batchRequestRouter.ts # ERC-5792 intake/status/decisions
│   │   ├── delegationRouter.ts # EIP-7702 status/probe/set/revoke transport
│   │   ├── crossDappBatchRouter.ts # Multi-source batch assembly/decisions
│   │   ├── erc7715PermissionRouter.ts # Delegated-permission query/provider transport
│   │   ├── gasSimulationRouter.ts # Gas and asset-preview transport
│   │   ├── swapBridgeDataRouter.ts # Swap/bridge quote and catalog transport
│   │   ├── tokenDataRouter.ts # Token metadata/storage/price/balance transport
│   │   ├── chatRouter.ts    # Bankr chat transport
│   │   ├── clearSigningRouter.ts # ERC-7730 descriptor/settings transport
│   │   ├── dappPermissionRouter.ts # Dapp connection/permission prompts
│   │   ├── providerRpcRouter.ts # Origin-authorized durable read-only RPC transport
│   │   ├── providerIngress.ts # Connected-origin/rejection/ERC-7715 ingress helpers
│   │   ├── signatureValidation.ts # Provider signature/EIP-712 intake validation
│   │   ├── chainSwitchNotification.ts # Connected-site chain-change effects/cooldown
│   │   ├── resetRouter.ts # Master-only reset barrier and destructive ordering
│   │   ├── lifecycle/      # Chrome registration/startup audit domain (see README.md)
│   │   ├── watchAssetRouter.ts # EIP-747 prompt transport
│   │   ├── chainPromptRouter.ts # EIP-3085 and chain notices
│   │   ├── signingRequestRouter.ts # Single tx/signature intake, reads, rejection/cancel
│   │   ├── transactionExecutionRouter.ts # Bankr/local confirmation and transfer intake
│   │   ├── swapExecutionRouter.ts # Account-bound Bankr/local swap transport
│   │   ├── sponsoredTransferRouter.ts # Sponsored submission/status/ACK transport
│   │   ├── internalOperationBarrier.ts # Reset-aware internal effect claims
│   │   └── transactionStatusRouter.ts # History, processing, result, receipt transport
│   ├── requests/            # Durable pending-request audit domain (see README.md)
│   │   ├── pinnedRequest.ts # Account-bound tx/signature/batch factories
│   │   ├── pendingRequestResolution.ts # First-action claims and reset barrier
│   │   ├── pendingRequestLifecycle.ts # Origin/account/WC authorization gates
│   │   ├── pendingRequestTerminalization.ts # Remove-before-result publication
│   │   ├── pendingTxStorage.ts # Persistent transaction prompts
│   │   ├── pendingSignatureStorage.ts # Persistent signature prompts
│   │   ├── pendingBatchTxStorage.ts # Persistent ERC-5792 prompts
│   │   ├── dappPermissionStorage.ts # Approved and pending dapp connections
│   │   └── pendingWalletConnectLifecycle.ts # Topic termination gates
│   ├── authHandlers.ts      # Stable factor/credential/password-management facade
│   ├── auth/                # Authentication audit domain (see README.md)
│   │   ├── walletUnlock.ts  # Modern master/agent and legacy unlock routing
│   │   ├── sessionHydration.ts # Atomic credential/key cache hydration
│   │   ├── legacyVaultKeyMigration.ts # Legacy general/private-key migration
│   │   ├── masterPasswordVerification.ts # Side-effect-free current/legacy master proof
│   │   ├── agentFactorHandlers.ts # Agent-password setup/removal policy and commits
│   │   ├── bankrCredentialUpdate.ts # Prepared Bankr credential mutation boundary
│   │   ├── masterPasswordRotation.ts # Atomic current/legacy password rotation
│   │   └── sessionTermination.ts # Manual lock ordered with secret/account mutations
│   ├── authTransition.ts    # Serialized auth mutations + WebAuthn ceremony invalidation
│   ├── secretRevealHandlers.ts # Stable master-only reveal facade
│   ├── masterAuthorization.ts # Stable live-master authorization facade
│   ├── secrets/             # Plaintext-release audit domain (see README.md)
│   │   ├── masterAuthorization.ts # Exact epoch + live master proof
│   │   └── revealHandlers.ts # Locked, revalidated key/phrase release
│   ├── delegatedAuthorityPolicy.ts # Master-only ERC-7715/custom-7702 authority boundary
│   ├── onboardingInitialization.ts # Stable fresh-wallet initialization facade
│   ├── onboarding/          # Fresh-wallet setup audit domain (see README.md)
│   │   ├── state.ts         # Marker codec, completeness, and recovery state
│   │   ├── lifecycle.ts     # Begin/status/complete/rollback orchestration
│   │   └── credential.ts    # First general-vault credential commit
│   ├── passkeyUnlock.ts     # Stable biometric orchestration facade
│   ├── passkeyUnlockCrypto.ts # Compatibility facade for passkey record/crypto/storage APIs
│   ├── passkey/             # WebAuthn-PRF audit domain (see README.md)
│   │   ├── status.ts        # Status and explicit/cached-master preflight
│   │   ├── setup.ts         # Atomic V1/V2 setup and mnemonic-vault commit
│   │   ├── hydration.ts     # V1/V2 unwrap and master-session hydration
│   │   ├── removal.ts       # Recovery proofs and factor removal
│   │   ├── record.ts        # Passkey V1/V2 record types and bounded validation
│   │   ├── keyWrapping.ts   # Purpose-separated PRF/HKDF key wrapping
│   │   └── repository.ts    # Validated passkey record storage
│   ├── mnemonicStorage.ts # Stable mnemonic-vault compatibility facade
│   ├── mnemonic/            # Mnemonic/seed-account audit domain (see README.md)
│   │   ├── record.ts        # Validated released/current V1/V2 record codec
│   │   ├── crypto.ts        # Pure password/key/AAD/key-check transformations
│   │   ├── repository.ts    # Locked mnemonicVault storage repository
│   │   ├── operations.ts    # Store/read/remove coordination
│   │   ├── recovery.ts      # V2 preparation, verification, and password rotation
│   │   ├── derivation.ts    # Pure bounded BIP39/BIP44 operations
│   │   ├── masterAccess.ts  # Master-only call-stack mnemonic capability
│   │   ├── integrity.ts     # Master recovery + seed-account binding proof
│   │   ├── addressPreview.ts # Secret-free public-address preview
│   │   ├── accountPersistence.ts # Collision, compensation, and cache refresh
│   │   └── accountHandlers.ts # Master-only add/derive orchestration
│   ├── sessionCache.ts      # Stable auth-session facade and restore orchestration
│   ├── session/             # Session-state audit domain (see README.md)
│   │   ├── inMemoryCache.ts # Decrypted capability state + expiry timestamps
│   │   ├── autoLockPolicy.ts # Timeout normalization and synced setting cache
│   │   ├── persistence.ts   # Native Never-session encrypted envelope
│   │   └── storage.ts       # Cross-browser session-storage adapter
│   ├── txHandlers.ts        # Stable transaction/signature compatibility facade
│   ├── transactions/        # Transaction coordinator audit domain (see README.md)
│   │   ├── requestIntake.ts # Provider validation and pinned prompt intake
│   │   ├── runtime.ts       # Results, expiry, pinned accounts, and process state
│   │   ├── localConfirmation.ts # PK/seed preflight and key/session recovery
│   │   ├── localExecution.ts # Sign-once preparation, final authority gate, and publication
│   │   ├── bankrConfirmation.ts # Pinned Bankr confirmation and effect leasing
│   │   ├── bankrProcessing.ts # Remote result/history publication
│   │   ├── requestActions.ts # Reject and cancellation terminalization
│   │   ├── swaps/           # Locked direct, Bankr batch, and atomic-7702 swaps
│   │   └── failure.ts       # Durable failure/history/notification publication
│   ├── signatures/          # Signature confirmation audit domain (see README.md)
│   │   ├── requestSigner.ts # Method-specific signer parameter selection
│   │   ├── confirmationPolicy.ts # Shared expiry, signer, SIWE, and pinned-account preflight
│   │   ├── confirmationHandlers.ts # Local/Bankr orchestration and final release gate
│   │   └── eip712/          # Pure typed-data policy audit domain (see README.md)
│   │       ├── validator.ts # Bounded parsing and validation ordering
│   │       ├── delegationPolicy.ts # Raw ERC-7710 rejection
│   │       ├── schemaValidation.ts # Graph/type/depth validation
│   │       ├── sanitization.ts # Schema-only signing projection
│   │       └── types.ts     # Validation result contract
│   ├── sidepanelManager.ts  # Stable export-only windowing facade
│   ├── extensionPopup.ts    # Stable export-only request-surface facade
│   ├── windowing/           # Browser/mode policy, verified sidepanel, popup effects
│   ├── crypto.ts            # Stable credential/vault-key crypto facade
│   ├── cryptoUtils.ts       # Stable codec/KDF compatibility facade
│   ├── cryptography/        # Bounded record-crypto audit domain (see README.md)
│   │   ├── types.ts         # Released AES-GCM envelope
│   │   ├── base64.ts        # Bounded persisted-field codecs
│   │   ├── passwordKey.ts   # Fixed PBKDF2-SHA-256 policy
│   │   ├── passwordCipher.ts # Legacy password-derived records
│   │   ├── vaultKey.ts      # 32-byte vault-key wrapping/direct AES-GCM
│   │   └── credentialStorage.ts # Vault-first legacy-compatible Bankr lookup
│   ├── vaultCrypto.ts       # Stable private-key vault compatibility facade
│   ├── vault/               # Private-key vault audit domain (see README.md)
│   │   ├── entryCrypto.ts   # Pure released password/vault-key transforms
│   │   ├── accountIntegrity.ts # Local key/account binding proof
│   │   ├── generalIntegrity.ts # Master recovery proof for API/local keys
│   │   ├── repository.ts    # Exact pkVault V1 storage authority
│   │   └── operations.ts    # Serialized mutations, hydration, migration prep
│   ├── localSigner.ts       # Stable local-signing compatibility facade
│   ├── localSigning/        # Local signer audit domain (see README.md)
│   │   ├── messageSigner.ts # Personal-message and EIP-712 policy
│   │   ├── transactionSigner.ts # Transaction and EIP-7702 preparation
│   │   ├── transactionBroadcast.ts # Sign-once raw-RPC effect boundary
│   │   └── client.ts       # Viem client and bounded RPC transport
│   ├── ensBrowsing/        # Untrusted ENS/GNS browsing audit domain (see README.md)
│   │   ├── handlers.ts     # Stable message-entry facade
│   │   ├── senderAuthorization.ts # Exact page/message/top-frame allowlist
│   │   ├── messageRoutes.ts # Bounded message dispatch
│   │   ├── navigation.ts   # Gateway choice, tab bypass, cache/session navigation
│   │   ├── resolver.ts     # Stable ENS/GNS/ERC-4804 resolver facade
│   │   ├── resolverSupport.ts # Direct RPC and Universal Resolver primitives
│   │   ├── nameResolvers.ts # ENS/GNS contenthash and ENS address fallback
│   │   └── erc4804Resolver.ts # Onchain HTML probe, pin, and cache policy
│   ├── eip712Validator.ts # Stable policy-free typed-data facade
│   ├── bankr/               # Remote signer/agent audit domain (see README.md)
│   │   ├── response.ts      # Strict bounded response/error schemas
│   │   ├── transport.ts     # Redirect/deadline/byte-bounded HTTP transport
│   │   ├── signing.ts       # Request mapping + recovered-signer proof
│   │   ├── submission.ts    # Irreversible submit + ambiguity boundary
│   │   ├── jobs.ts          # Bounded polling and cancellation
│   │   ├── credentialBinding.ts # Ciphertext-generation request tags
│   │   ├── pendingAuthorization.ts # Final pinned authority gate
│   │   └── chat/            # Agent chat client/storage/handlers (see README.md)
│   ├── network/             # Bounded HTTP/RPC/network-config audit domain
│   │   ├── boundedHttp.ts   # Shared response byte/deadline enforcement
│   │   ├── rpcClient.ts     # Configured-RPC URL/SSRF/bounds policy
│   │   ├── safeRpcForwarding.ts # Provider/WC read-only RPC allowlist
│   │   ├── proxyResolver.ts # Configured-RPC proxy implementation lookup
│   │   ├── customNetworkValidation.ts # Custom-chain schema/URL validation
│   │   ├── networkRepository.ts # networksInfo/chainName sync storage
│   │   ├── rpcHistoryRepository.ts # Local saved-RPC history storage
│   │   ├── networkPolicy.ts # Pure fallback and mutation result policy
│   │   └── networkMutations.ts # Locked ensure/add/update/hide/delete
│   ├── provider/            # Effect-free external provider validation domain
│   │   ├── messageValidation.ts # Fail-closed external envelope dispatcher
│   │   ├── transactionValidation.ts # Address/calldata/quantity schemas
│   │   ├── signatureValidation.ts # Method/signer/payload schemas
│   │   ├── batchValidation.ts # Shared injected/WC wallet_sendCalls bounds
│   │   ├── metadataValidation.ts # EIP-3085/EIP-747 URL/metadata policy
│   │   ├── chainBoundary.ts # Coercion-safe parsing and exact chain pinning
│   │   ├── limits.ts        # Shared immutable resource ceilings
│   │   ├── primitives.ts    # Request-id/address/URL primitives
│   │   ├── errors.ts        # EIP-1193 page-facing error construction
│   │   ├── validation.ts    # Common validation result contract
│   │   ├── contentBridge/   # Isolated-world page↔runtime bridge
│   │   │   ├── messagePolicy.ts # Exact bidirectional message allowlists
│   │   │   ├── runtimeForwarding.ts # Privacy-bounded reverse events
│   │   │   ├── pageRouter.ts # Page request dispatcher
│   │   │   └── bootstrap.ts # Content-script initialization order
│   │   └── inpage/          # EIP-1193/EIP-6963 page-world provider
│   │       ├── provider.ts  # Provider state/events
│   │       ├── requestRouter.ts # Method routing
│   │       ├── resultRouter.ts # Correlated result/event forwarding
│   │       ├── announcement.ts # EIP-6963 + legacy window.ethereum
│   │       └── bootstrap.ts # Inpage initialization order
│   ├── txSimulation.ts      # Stable asset-change simulation coordinator/facade
│   ├── simulation/          # Transaction simulation audit domain (see README.md)
│   │   ├── types.ts         # Normalized asset-change and raw simulator shapes
│   │   ├── constants.ts     # Shared gas caps and canonical infrastructure addresses
│   │   ├── stateOverrides.ts # ERC-20/Permit2 retry override construction
│   │   ├── ethSimulateLogs.ts # Pure eth_simulateV1 transfer-log parser
│   │   ├── client.ts        # Bounded RPC client cache
│   │   ├── nativeCurrency.ts # Built-in/custom native metadata
│   │   ├── portfolioPrices.ts # Reset-aware cached price map
│   │   ├── assetChangeNormalization.ts # Pure result normalization
│   │   ├── nftEnrichment.ts # NFT detection and post-state metadata
│   │   ├── tokenEnrichment.ts # Ordered token/NFT/price enrichment
│   │   ├── metadataRetry.ts # Token/NFT/native retry flow
│   │   ├── resultBuilder.ts # Raw-to-public simulation result mapping
│   │   ├── simulatorContract.ts # Canonical bytecode and ABIs
│   │   ├── erc7715Preview.ts # Narrow delegated-redemption preview
│   │   ├── singleSimulation.ts # Single access-list/eth_call orchestration
│   │   ├── batchSimulation.ts # Atomic batch simulation fallback
│   │   ├── ethSimulateBatch.ts # Bounded eth_simulateV1 path
│   │   └── nonAtomicBatch.ts # Dual-path merge precedence
│   ├── txHistoryStorage.ts  # Stable transaction-history compatibility facade
│   ├── assetChangesExtractor.ts # Stable post-confirm enrichment facade
│   ├── receiptEnrichment.ts # Stable receipt retry/backfill facade
│   ├── history/             # Transaction history/receipt audit domain (see README.md)
│   │   ├── types.ts         # Released additive txHistory record shape
│   │   ├── repository.ts    # Locked newest-first storage authority
│   │   ├── maintenance.ts   # Stale processing and clear-history policy
│   │   ├── assetTransferParser.ts # Pure fungible Transfer-log decoder
│   │   ├── rpc.ts           # Bounded receipt/balance/block helpers
│   │   ├── assetChangeExtraction.ts # ERC-20/native delta assembly
│   │   ├── assetChangePersistence.ts # Recent-token and history writes
│   │   ├── receiptTransport.ts # Configured receipt and bundle projection
│   │   └── receiptEnrichment.ts # Retry and old-entry backfill policy
│   ├── bridgeApi.ts         # Stable bridge API/catalog compatibility facade
│   ├── bridgeChainsResolver.ts # Stable bridge-chain compatibility facade
│   ├── bridgeStatusPoller.ts # Stable bridge-settlement compatibility facade
│   ├── bridge/              # Bridge client/cache/status audit domain (see README.md)
│   │   ├── client.ts        # Bounded quote/status/catalog API transport
│   │   ├── catalogCache.ts  # Released 24h chain/token caches and WCHAN pin
│   │   ├── chainPolicy.ts   # Pure EVM and source/destination eligibility
│   │   ├── chainResolver.ts # Runtime configured-chain composition
│   │   ├── statusNotification.ts # Terminal copy, explorer, notification
│   │   ├── statusApplication.ts # Ordered status/history/pending transition
│   │   └── statusPolling.ts # Backoff, dedupe, resume, and registration
│   ├── avatarImageCache.ts # Stable remote-avatar cache compatibility facade
│   ├── avatar/             # Privileged raster image cache audit domain (see README.md)
│   │   ├── constants.ts    # Released storage, size, redirect, and queue limits
│   │   ├── types.ts        # Exact ensAvatarImageCache entry schema
│   │   ├── policy.ts       # Public-HTTPS, raster MIME, and cached-data gates
│   │   ├── bodyReader.ts   # Streaming 2 MiB response ceiling
│   │   ├── scheduler.ts    # Two-wide FIFO, single-flight, reset epoch/abort
│   │   ├── transport.ts    # Manual redirect and ambient-authority-free fetch
│   │   ├── rasterizer.ts   # 128px bounded decode and WebP re-encode
│   │   ├── repository.ts   # Locked best-effort TTL/LRU storage authority
│   │   └── coordinator.ts  # Cache-first null-on-error public orchestration
│   ├── clearSigningHandlers.ts # Stable descriptor/settings compatibility facade
│   ├── clearSignedMetaSnapshot.ts # Stable Activity snapshot compatibility facade
│   ├── clearSigning/        # ERC-7730 descriptor/snapshot audit domain (see README.md)
│   │   ├── types.ts         # Transport, lookup, and snapshot input contracts
│   │   ├── descriptorCache.ts # Exact v3 key/schema/TTL repository
│   │   ├── settings.ts      # Default-on preference and disable-time purge
│   │   ├── descriptorClient.ts # Bounded public descriptor transport
│   │   ├── deploymentExtension.ts # Pure proxy deployment binding
│   │   ├── descriptorResolver.ts # Direct then configured-RPC proxy fallback
│   │   ├── handlers.ts      # Validation/cache/resolution coordinator
│   │   ├── counterparty.ts  # Best-effort label/name enrichment
│   │   ├── assetSnapshotBuilders.ts # Approve/transfer/native summaries
│   │   ├── erc7730Snapshot.ts # Remote-plus-built-in descriptor summary
│   │   ├── snapshot.ts      # Summary precedence and null-on-error boundary
│   │   └── historyAttachment.ts # Fire-and-forget history patch
│   ├── gasEstimation.ts     # Stable single-gas compatibility facade
│   ├── feeEstimation.ts     # Stable fee-policy compatibility facade
│   ├── batchGasEstimation.ts # Stable batch-gas compatibility facade
│   ├── gas/                 # Gas and fee estimation audit domain (see README.md)
│   ├── transactionValidation.ts # Dapp transaction quantity validation/normalization
│   ├── batchTxHandlers.ts   # Implementation-free ERC-5792 compatibility facade
│   ├── batch/               # Focused ERC-5792 audit boundaries (see README.md)
│   │   ├── bundleStatusStorage.ts # Locked released status repository
│   │   ├── batchCapabilities.ts # Connected-account capability/delegate probes
│   │   ├── batchRequestIntake.ts # Pinned two-record wallet_sendCalls commit
│   │   ├── batchBankrExecution.ts # Bankr confirmation and publication
│   │   ├── batchLocalConfirmation.ts # PK/seed recovery and path selection
│   │   ├── batchLocalAuthorization.ts # Final account/transport RPC gate
│   │   ├── batchSingleExecution.ts # One-call local shortcut
│   │   ├── batchSequentialExecution.ts # Ordered ambiguity-aware local legs
│   │   ├── batchAtomic7702Execution.ts # EIP-7702 atomic sign-once execution
│   │   └── batchCompletionTracking.ts # Receipt-to-bundle terminal mirroring
│   ├── crossDappBatchHandlers.ts # Export-only cross-dapp batch facade
│   ├── crossDappBatch/      # User-assembled multi-origin batch audit domain
│   │   ├── storage.ts       # Released staged-call schema and storage key
│   │   ├── lifecycle.ts     # Source grouping, cancellation, epoch commits
│   │   ├── intake.ts        # Pinned tx/bundle staging
│   │   ├── staging.ts       # Edit, remove, and reject terminalization
│   │   ├── confirmation.ts  # Lock, encode, history, signer composition
│   │   ├── bankr.ts         # Pinned Bankr submit boundary
│   │   ├── local.ts         # PK/seed EIP-7702 sign-once boundary
│   │   └── completion.ts    # Source-aware result and receipt fan-out
│   ├── forceInclusion/      # L1 deposit, nonce, receipt, and split recovery domain
│   │   ├── single.ts        # Single Bankr/local OP Stack deposit + recovery
│   │   ├── batch.ts         # Atomic/sequential batch deposits + aggregate tracking
│   │   ├── nonceManager.ts  # Pending-nonce cache and explicit reset boundaries
│   │   ├── receiptPoller.ts # Receipt terminalization, dropped detection, and resume
│   │   ├── broadcastPolicy.ts # Pure ambiguous-broadcast retention/halt policy
│   │   └── splitBatchSequencer.ts # Durable one-at-a-time split execution
│   ├── erc5792Types.ts      # ERC-5792 type definitions
│   ├── erc7715PermissionHandlers.ts # Stable ERC-7715 permission facade
│   ├── pendingErc7715PermissionStorage.ts # Stable ERC-7715 persistence facade
│   ├── erc7715/             # ERC-7715/ERC-7710 audit domain (see README.md)
│   │   ├── methods.ts       # Method recognition and capabilities
│   │   ├── preflight.ts     # Stable preflight facade
│   │   ├── preflightNormalization.ts # Pure request normalization
│   │   ├── preflightRpc.ts  # Bounded public-chain reads
│   │   ├── preflightEligibility.ts # Account/delegate policy orchestration
│   │   ├── requestHandler.ts # Provider dispatch and durable prompt intake
│   │   ├── confirmation.ts  # Master-only approval/rejection
│   │   ├── revocation.ts    # Account-pinned revoke transaction intake
│   │   ├── onchainStatus.ts # Live grant verification and revocation sync
│   │   ├── registry.ts      # Stable validation facade
│   │   ├── permissionValidation.ts # Bounded permission schemas
│   │   ├── caveats.ts       # Stable caveat facade
│   │   ├── caveatBuilder.ts # Permission-to-DeleGator mapping
│   │   ├── delegationSigning.ts # WalletChan-owned ERC-7710 encoding
│   │   ├── grantStorage.ts  # Master-authorized atomic grant commits
│   │   ├── pendingRequestStorage.ts # Locked prompt repository
│   │   └── resultStorage.ts # Injected/WalletConnect result bridge
│   ├── accountStorage.ts # Stable account-metadata compatibility facade
│   ├── accounts/            # Account identity/selection audit domain (see README.md)
│   │   ├── repository.ts    # accounts record, normalization, ordering, queries
│   │   ├── selectionStorage.ts # Global/per-tab selection and stale-ID repair
│   │   ├── bankrStorage.ts  # Atomic Bankr account + credential metadata
│   │   ├── localStorage.ts  # Private-key/view-only metadata mutations
│   │   ├── seedStorage.ts   # Seed-derived account metadata
│   │   ├── seedGroupStorage.ts # Non-secret recovery-group metadata
│   │   ├── legacyMigration.ts # Serialized pre-multi-account migration
│   │   ├── tabResolver.ts   # Connected-dapp-only per-tab account scope
│   │   ├── localKeyResolver.ts # Session-restoring local signer key lookup
│   │   └── localEffectBoundary.ts # Final identity check before local effects
│   ├── dapp/                # Dapp authorization/privacy audit domain (see README.md)
│   │   ├── requestPolicy.ts # Exact top-level Chrome origin authorization
│   │   ├── accountScope.ts  # Approved/pending per-tab scope
│   │   ├── connectionHandlers.ts # Connection queue/results and revocation
│   │   ├── accountRemovalPrivacy.ts # Disconnect-before-delete boundary
│   │   └── rpcForwarding.ts # Narrow page-discovered read-only RPC path
│   ├── walletConnect/       # WalletConnect relay audit domain (see README.md)
│   │   ├── client.ts        # SDK lifecycle, listeners, generation, reset cutover
│   │   ├── sessionCommands.ts # Trusted-UI list/pair/disconnect/chain commands
│   │   ├── sessionProposal.ts # Signing-account namespace approval policy
│   │   ├── requestRouter.ts # Claimed, validated session-request dispatch
│   │   ├── pendingRequests.ts # Pinned tx/signature confirmation prompts
│   │   ├── batchRequests.ts # ERC-5792 request adapters
│   │   ├── rpcRequests.ts   # Chain mutation and bounded safe-RPC adapters
│   │   ├── storage.ts       # Durable request claims/routes/terminal outbox
│   │   ├── protocol.ts      # Persist-before-relay JSON-RPC responses
│   │   ├── resultBridge.ts  # Injected-result to relay delivery bridge
│   │   ├── keepalive.ts     # Active-session relay liveness
│   │   └── reset.ts         # SDK teardown and replacement namespace rotation
│   ├── portfolio/           # Portfolio display-state audit domain (see README.md)
│   │   ├── api.ts           # Bounded provider-agnostic portfolio client
│   │   ├── tokenCatalog.ts  # API/custom/recent/native token merge coordinator
│   │   ├── onchainBalances.ts # Multicall balance verification
│   │   ├── holdingsCache.ts # Reset-aware optional first-paint cache
│   │   ├── snapshotStorage.ts # Per-address aggregate value history
│   │   ├── hiddenTokens.ts  # Global hidden-token display state
│   │   ├── recentTokens.ts  # Short-lived received-token overlay
│   │   ├── coingecko.ts     # Shared native/ERC-20 pricing facade
│   │   └── snapshotRefresh.ts # Catalog → onchain → snapshot ordering
│   ├── sponsoredTransfers/ # ERC-3009 sponsored-transfer audit domain (see README.md)
│   │   ├── handlers.ts     # Intake and existing-intent coordinator
│   │   ├── authorization.ts # Account-pinned signing and encryption
│   │   ├── intentStorage.ts # Encrypted recovery/ACK repository
│   │   ├── submission.ts   # Sole relayer POST and ambiguity boundary
│   │   ├── reconciliation.ts # Finalized dual-RPC authorization checks
│   │   └── status.ts       # Trusted-UI recovery and acknowledgment
│   ├── bundleStatusStorage.ts # Stable ERC-5792 status-storage facade
│   ├── storageLock.ts       # Stable shared storage-lock facade
│   ├── walletResetStorage.ts # Stable wallet-reset manifest facade
│   ├── storageCachePruner.ts # Stable non-critical cache-pruner facade
│   ├── storageResultWaiter.ts # Stable durable-result waiter facade
│   ├── storage/             # Shared cross-domain storage primitives (see README.md)
│   │   ├── lock.ts          # Per-key in-process RMW serializer
│   │   ├── resetManifest.ts # Exact wallet-owned keys and transient prefixes
│   │   ├── cachePolicy.ts   # Pure TTL/schema/LRU prune plan
│   │   ├── cachePruner.ts   # Ordered local-storage prune effects
│   │   └── resultWaiter.ts  # Durable result listener and expiry retry handshake
│   ├── impersonator.ts      # Thin inpage Vite/manifest entrypoint
│   └── inject.ts            # Thin content-script Vite/manifest entrypoint
├── app/                       # Renderer-wide App models and adapters (see README.md)
│   ├── requestModel.ts        # Pure pending-request union and stable ordering
│   ├── lazyScreens.ts         # Route lazy imports and idle preloading
│   ├── hooks/                 # App-owned renderer runtime boundaries
│   ├── home/                  # App-owned home presentation
│   └── screens/               # Small App-owned route screens
├── components/                # Feature domains and compatibility facades (see README.md)
│   ├── Activity/              # Transaction-history UI domain
│   ├── BatchConfirmation/     # ERC-5792 review/decision UI domain
│   ├── ClearSigning/          # Clear-signing descriptor/rendering UI domain
│   ├── Portfolio/Holdings/    # Portfolio loading and holdings UI domain
│   ├── TransactionConfirmation/ # Single-tx review/decision UI domain
│   ├── TransactionDetails/    # Activity detail UI domain
│   ├── Transfer/              # Send/transfer UI domain
│   ├── TransactionConfirmation.tsx # Re-export-only compatibility facade
│   ├── TransactionConfirmationErrorBoundary.tsx # Last-resort reject UI for malformed tx renders
│   ├── BatchTransactionConfirmation.tsx  # Re-export-only compatibility facade
│   ├── TokenHoldings.tsx      # Re-export-only compatibility facade
│   ├── TokenTransfer.tsx      # Re-export-only compatibility facade
│   ├── TxDetailModal.tsx      # Re-export-only compatibility facade
│   ├── TxDetailScreen.tsx     # Re-export-only compatibility facade
│   ├── TxStatusList.tsx       # Re-export-only compatibility facade
│   ├── Erc7715PermissionConfirmation.tsx # Delegated permission confirmation UI
│   ├── Erc7715PermissionEditableControls.tsx # Adjustable delegated permission fields
│   ├── Erc7715PermissionReview.tsx # Human-readable ERC-7715 permission details
│   ├── Erc7715PermissionTokenCard.tsx # ERC-7715 token metadata, balance, and value summary
│   ├── useErc7715PermissionAsset.ts # ERC-7715 token metadata and live balance hook
│   ├── AssetChangesDisplay.tsx    # Simulated token flow display
│   ├── SignatureRequestConfirmation.tsx
│   ├── UnlockScreen.tsx
│   ├── passkeyPromptGate.ts # Renderer-local single-flight gate for biometric prompts
│   └── Settings/              # Settings feature domain
│       ├── EditChain.tsx      # Network edit/save composition
│       ├── RpcEndpointManager.tsx # Saved RPC selection and list controls
│       ├── CustomNetworkDetails.tsx # Custom-chain metadata fields
│       └── useNetworkRpcUrls.ts # Saved-RPC history lifecycle
├── pages/
│   └── Onboarding.tsx
└── App.tsx                   # Main popup app
```

## Key Website Files

```
apps/website/
├── app/
│   ├── layout.tsx
│   ├── page.tsx
│   ├── components/        # Hero, Features, TokenSection, etc.
│   └── lib/
│       ├── siteRouting.ts # Subdomain registry + pure URL resolution functions
│       ├── useSiteNav.ts  # React hook wrapping siteRouting for client components
│       └── theme.ts       # Chakra UI Bauhaus theme
```

## Documentation References

When working on features, refer to these docs:

| Doc                                                      | When to read                                              |
| -------------------------------------------------------- | --------------------------------------------------------- |
| `_docs/IMPLEMENTATION.md`                                | Extension internals, message types, tx flow               |
| `_docs/SECURITY.md`                                      | Threat model, access control, pre-commit checklists       |
| `_docs/CHAT.md`                                          | Chat interface to directly chat & prompt to bankr api     |
| `_docs/STYLING.md`                                       | UI components, design tokens, Bauhaus system              |
| `_docs/EXTENSION_UI_ARCHITECTURE.md`                     | Extension React feature folders, hooks, models, facades, and size budgets |
| `_docs/WEBSITE.md`                                       | Website sections, layout specs, animations                |
| `_docs/APPS.md`                                          | Apps page data source, fetch script, adding chains        |
| `_docs/SWAP.md`                                          | Swap page: 0x API integration, fees, slippage, UI         |
| `_docs/COINS.md`                                         | Coins page: SSE streaming, indexer API, pagination        |
| `_docs/CALLDATA.md`                                      | Calldata decoder UI, param components, type routing       |
| `_docs/ASSET_CHANGES_SIMULATION.md`                      | Tx simulation: state override injection, metadata retry   |
| `_docs/ERC5792.md`                                       | ERC-5792 batch txs: message flow, ERC-7821 encoding, 7702 plan |
| `_docs/WALLETCHAN_RPC.md`                                | Local JSON-RPC -> WalletConnect bridge implementation      |
| `_docs/WALLETCHAN_MCP.md`                                | Local MCP adapter, managed RPC, and Base skill wrapping              |
| `apps/staking-indexer/STAKING_INDEXER_IMPLEMENTATION.md` | Staking indexer: sBNKRW vault events, balance tracking (legacy) |
| `apps/wchan-vault-indexer/IMPLEMENTATION.md`             | WCHAN vault indexer: sWCHAN balance tracking, APY, snapshots    |
| `.agents/skills/walletchan-chain-research/SKILL.md`      | Codex-local research checklist for adding/updating WalletChan chain params |
| `_docs/DEVELOPMENT.md`                                   | Build process, dev environment setup                      |
| `_docs/PUBLISHING.md`                                    | Release workflow, CWS upload, auto-update, signing        |
| `_docs/STORAGE.md`                                       | Every chrome.storage key, shapes, version history         |
| `_docs/ADD_CHAIN.md`                                     | How to add a new chain (single registry entry)            |
| `apps/tg-bot/IMPLEMENTATION.md`                          | TG bot: verification flow, commands, API, balance checker |
| `apps/arb-bot/IMPLEMENTATION.md`                         | Arb bot: cross-pool arb strategy, batched RPC, encoding   |
| `_docs/TOKEN_GATED_TG.md`                                | Token-gated TG system: architecture, DB schema, security  |
| `_docs/bankr-skills/bankr/SKILL.md`                      | Bankr API interactions, workflows, error handling         |

## Important Patterns

- **API key encryption**: AES-256-GCM with PBKDF2 (600k iterations)
- **Session caching**: Decrypted API key cached in background worker memory with auto-lock timeout
- **Per-tab chain state**: Each browser tab maintains its own selected chain
- **Transaction persistence**: Pending transactions survive popup close (stored in chrome.storage.local)
- **EIP-6963**: Modern wallet discovery alongside legacy window.ethereum
- **Shared contract constants**: `packages/shared/src/contracts.ts` is the single source of truth for `BASE_CHAIN_ID`, `BNKRW_TOKEN_ADDRESS`, `SBNKRW_VAULT_ADDRESS`, `BNKRW_POOL_ADDRESS`. Import via `@walletchan/shared/contracts`.
- **Address display standard**: Whenever a `0x` address is shown in the UI, always include a **copy button** (CopyIcon/CheckIcon toggle) and a **view on explorer** link (ExternalLinkIcon, opens `${chainConfig.explorer}/address/${addr}`). See `TypedDataDisplay.tsx` `AddressValue` component for the reference pattern.
- **Copy button feedback**: NEVER use toast notifications for copy actions — toasts block nearby buttons (e.g., Reject/Confirm on tx confirmation, Chat button on homepage). Instead, toggle the icon from `CopyIcon` → `CheckIcon` (with `bauhaus.yellow` color) for 2 seconds. Use the shared `CopyButton` component from `components/CopyButton.tsx` when possible. For inline copy buttons, follow the same pattern: `setCopied(true)` + `setTimeout(() => setCopied(false), 2000)`.

## Code Quality Guidelines

### File Size & Modularity

- **Keep implementation files under ~400 lines.** If a file approaches that
  limit, split it before adding more behavior. Do not treat 400 lines as a
  target. Generated data and frozen fixtures are the only routine exceptions.
- **Oversized composition roots are ratchets.** Existing transitional roots
  such as `txSimulation.ts` and `App.tsx` may remain
  above the limit only while being decomposed. Every change to one must keep or
  lower its enforced size budget and should extract policy rather than add more.
- **One concern per file.** Each module should have a clear, single purpose (e.g., `session/inMemoryCache.ts` owns decrypted capability state, `auth/walletUnlock.ts` owns unlock routing, and `authHandlers.ts` coordinates factor/credential/password mutations behind stable exports).
- **`background.ts` is a bootstrap invocation only.** It imports and invokes
  `background/bootstrap.ts`; route wiring, the ordered message pipeline, Chrome
  lifecycle behavior, authorization policy, storage work, and other business logic belong
  under `chrome/background/` or the owning domain, never inline in the entrypoint.

### Extension Domain Folder Contract

- **The `src/chrome/` root is not a general source directory.** Read
  `src/chrome/README.md` before adding or moving service-worker logic. New root
  files are allowed only for manifest/Vite entrypoints, documented compatibility
  facades, or genuinely cross-domain primitives.
- **Group related logic in a named domain folder.** If a feature has two or
  more implementation files—or is likely to grow—create or reuse a folder such
  as `auth/`, `mnemonic/`, `transactions/`, `walletConnect/`, or `bankr/`.
  Do not add a new flat family of prefixed files to `src/chrome/`.
- **Every domain folder needs a `README.md` audit map.** State each file's single
  responsibility, dependency direction, storage/network effects, public facade,
  and matching test folder. Keep this map current when files move.
- **Facades contain no policy.** A compatibility facade may re-export types and
  exact function identities so callers survive a move; it must not own storage,
  cryptography, authorization decisions, network effects, or new business logic.
- **Dependencies point inward.** Entry routers may depend on domain handlers;
  handlers may depend on policy/repositories; repositories and cryptographic
  transforms must not import routers. Use dependency injection for the rare
  cross-domain callback instead of creating cycles.
- **Mirror source domains under `tests/`.** Domain tests live in the matching
  subfolder with their own short `README.md`; shared frozen records and harnesses
  live only in `tests/fixtures/` and `tests/helpers/`. Keep the test root empty.
  `scripts/run-security-tests.mjs` discovers tests recursively.
- **The layout contract is a release gate.**
  `tests/security/chromeDomainLayout.test.ts` rejects unreviewed root files and
  source domains without mirrored source/test audit maps. Update its admission
  list only for a deliberate entrypoint, compatibility facade, or shared
  primitive—not merely to make a new flat implementation pass.
- **Moves must be behavior-neutral.** Preserve message names, storage keys,
  serialized shapes, export identities, and effect ordering. Add architecture
  tests for facade identity, forbidden dependencies, and module-size budgets in
  the same tranche as the move.

### Extension UI Domain Folder Contract

- **The flat `src/components/` root is an integration boundary.** Read
  `src/components/README.md` and `_docs/EXTENSION_UI_ARCHITECTURE.md` before
  adding or moving renderer code. New multi-file features belong in a named
  domain folder with a local `README.md` audit map.
- **Keep public imports stable during migration.** A root compatibility facade
  may preserve default/named exports and lazy-loading paths, but it contains no
  JSX, state, effects, styling, storage, message calls, or policy.
- **Composition roots compose.** `App.tsx`, pages, and feature screens choose
  routes and connect focused hooks/components. Reusable child presentation,
  pure formatting, and independent subscriptions belong in focused modules.
- **Colocate feature concerns.** Feature-only components, hooks, types, and
  models stay with their domain. Promote a hook to `src/hooks/` only when
  multiple unrelated domains use it.
- **Separate effects from presentation.** Hooks/controllers own one coherent
  Chrome/storage/network/timer lifecycle. Presentational components receive
  render-ready props and callbacks. Pure `model/` modules import no React,
  Chakra, Chrome, storage, DOM, or network code.
- **Protect the shared layers.** `components/ui/` is domain-free application
  grammar; `components/shared/` is genuinely cross-feature wallet
  presentation; `theme/primitives/` is token-driven visual atoms. None is a
  dumping ground for feature-specific behavior.
- **UI moves are behavior-neutral.** Preserve props/exports, route and lazy
  boundaries, request IDs/order, message shapes, effect ordering, focus/scroll
  restoration, popup-versus-sidepanel behavior, and all Bankr/private-key/seed
  phrase paths. Add or retain pure model, preview, and packaged QA coverage.
- **Architecture tests are release gates.** Keep
  `tests/ui/architecture.test.ts`, `tests/ui/moduleSizeBudget.test.ts`, domain
  READMEs, and ratcheting oversized-file budgets current as files move.

### Reuse Over Duplication

- **Extract shared utilities** when the same logic appears in 2+ files. See `cryptoUtils.ts` for the pattern (shared constants + functions used by both `crypto.ts` and `vault/entryCrypto.ts`).
- **Reuse existing React components** before creating new ones. Check `components/` for existing UI patterns.
- **Use dependency injection** to avoid circular imports (e.g., `tryRestoreSession(unlockFn)` in `sessionCache.ts` takes a callback instead of importing `authHandlers.ts` directly).

### Naming & Organization

- **Handler files**: use `*Handlers.ts` for a stable multi-operation facade and
  specific role names inside a domain (`requestIntake.ts`, `confirmation.ts`,
  `repository.ts`, `statusRouter.ts`).
- **State/cache files**: descriptive names (e.g., `sessionCache.ts`, `pendingTxStorage.ts`)
- **Utility files**: `*Utils.ts` (e.g., `cryptoUtils.ts`)
- **Keep related functions together** - if functions share state (like in-memory Maps), they belong in the same module, inside the owning domain folder.

### When Adding New Features

- Place new message handlers in the owning domain, not in `background.ts`.
- Add the message type to exactly one focused `chrome/background/*Router.ts`,
  classify its audience explicitly in `messageAccessPolicy.ts`, and compose the
  router through the background message pipeline. Do not recreate a residual
  switch or import domain implementations into the entrypoint.
- If a feature doesn't fit an existing domain, create a focused domain folder
  and audit map rather than growing an unrelated module or the `chrome/` root.
- Before adding code to a file above 300 lines, identify the extraction seam
  first. Reviewability and a linear security story take precedence over fewer files.
- Update `_docs/IMPLEMENTATION.md` and this file's Key Extension Files section if you add new modules.

### When Adding New Handlers That Need Credentials

**CRITICAL**: Any message handler that uses `getCachedPassword()` or `getCachedApiKey()` MUST include session restoration logic. Without it, the handler will fail when auto-lock is "Never" and Chrome restarts the service worker.

**Required pattern:**

```typescript
let password = getCachedPassword();

// If no cached password, try session restoration (for "Never" auto-lock mode)
if (!password) {
  const autoLockTimeout = await getAutoLockTimeout();
  if (autoLockTimeout === 0) {
    const restored = await tryRestoreSession(handleUnlockWallet);
    if (restored) {
      password = getCachedPassword();
    }
  }
}

if (!password) {
  sendResponse({ success: false, error: "Wallet must be unlocked" });
  return;
}
```

See `_docs/IMPLEMENTATION.md` → "Handlers with Session Restoration" for the full list of handlers that implement this pattern.

## Development Practices

### Environment Variables

**When adding or using new environment variables in any app**, always update (or create) the `.env.example` file in that app's directory. This ensures developers know what env vars are needed.

### Storage/Encryption Changes

**CRITICAL**: Chrome extensions auto-update silently — users on ANY previous version will receive new code. Before adding, removing, renaming, or changing the shape of ANY `chrome.storage` key, you **MUST**:

1. **Read [`_docs/STORAGE.md`](/_docs/STORAGE.md)** — full reference of every key, its shape, and which version introduced it
2. **Read [`_docs/PUBLISHING.md`](/_docs/PUBLISHING.md)** — migration rules, how to write an idempotent migration, and the pre-release storage checklist
3. **Write an idempotent migration** in the focused install/update lifecycle
   module registered by `background/composition/lifecycle.ts` if old users would break without one;
   do not put migration logic inline in the entrypoint
4. **Update `_docs/STORAGE.md`** with any new/changed keys and their version

Failure to do this **will brick the extension** for existing users (they get stuck in an onboarding loop or lose data).

Additional checks when modifying storage:

1. **Audit ALL read AND write paths** - grep for storage key names (`encryptedApiKey`, `encryptedApiKeyVault`, etc.)
2. **Check every file** that touches the data - follow the owning router/composition/domain paths; renderer settings surfaces can also save directly
3. **Common mistake**: updating read paths but forgetting write paths in different files/handlers

### Key Storage Locations

| Key                       | Purpose                                           |
| ------------------------- | ------------------------------------------------- |
| `encryptedApiKeyVault`    | API key encrypted with vault key (current format) |
| `encryptedApiKey`         | API key encrypted with password (legacy format)   |
| `encryptedVaultKeyMaster` | Vault key encrypted with master password          |

**Rule**: Check `cachedVaultKey` to determine which system is active before saving API keys.

### User-Reported Anomalies

When a user reports something unexpected (like a wrong value appearing):

- Don't dismiss it - trace the full data flow
- Ask: "Where does this value come from? What code path could produce it?"
- The anomaly is often a symptom of a deeper storage/migration issue

### Website Pages with Wagmi/RainbowKit Hooks

**CRITICAL**: Any website page (`page.tsx`) that uses wagmi hooks (`useAccount`, `useChainId`, `useReadContract`, etc.) or RainbowKit components (`ConnectButton`) will **fail on Vercel** during `next build` static prerendering with `WagmiProviderNotFoundError`.

**Required pattern** for new pages that use wagmi:

1. Put all page content in a separate `"use client"` file (e.g., `MyPageContent.tsx`)
2. Make `page.tsx` a **Server Component** that imports the content and exports `force-dynamic`:

```tsx
// page.tsx (Server Component — no "use client")
import MyPageContent from "./MyPageContent";

export const dynamic = "force-dynamic";

export default function MyPage() {
  return <MyPageContent />;
}
```

**Why**: `next build` statically prerenders pages at build time. Even though `WagmiProvider` is in the layout, wagmi's config initialization can fail during Node.js prerendering. `force-dynamic` skips prerendering entirely. These pages are inherently dynamic (wallet state) so there's no benefit to static generation.

**Existing pages using this pattern**: `migrate`, `admin`, `coins`, `stake`, `verify`

**Note**: Pages that only import child components using wagmi (like `swap/page.tsx` importing `SwapCard`) don't need this — only pages that directly use wagmi hooks in the page file itself.

### Adding New Website Subdomains

When adding a new page that should be accessible via a subdomain (e.g., `foo.walletchan.com`), you must update **four things**:

1. **Add a `beforeFiles` rewrite** in `apps/website/next.config.js` to map the subdomain to the route:
   ```js
   { source: "/:path((?!_next|api|images|og|screenshots).*)", has: [{ type: "host", value: "foo.walletchan.com" }], destination: "/foo/:path*" }
   ```
2. **Add a redirect** in `apps/website/next.config.js` from the old `bankrwallet.app` subdomain:
   ```js
   { source: "/:path*", has: [{ type: "host", value: "foo.bankrwallet.app" }], destination: "https://foo.walletchan.com/:path*", permanent: true }
   ```
3. **Add the route to the subdomain registry** in `apps/website/app/lib/siteRouting.ts`:
   ```ts
   { path: "/foo", subdomain: "foo.walletchan.com" }
   ```
   This is the single source of truth for client-side subdomain routing. All navigation helpers (`resolveHref`, `useSiteNav` hook, `getBasePath`) derive from this array.
4. **Add the subdomain in Vercel** project domain settings.

**Existing subdomains**: `os`, `stake`, `migrate`, `compare`, `mainnet`, `admin`

### Cross-Subdomain URL Routing

**CRITICAL**: Never construct subdomain URLs manually or use raw `window.location.hostname` checks for routing. Always use the centralized routing helpers:

- **`useSiteNav()` hook** (`apps/website/app/lib/useSiteNav.ts`) — for React components. Provides:
  - `href(path)` — resolves any internal path to the correct URL (handles localhost vs subdomain vs main site)
  - `homeHref` — logo/home link (`"/"` on localhost, `"https://walletchan.com"` on subdomains)
  - `isOnPage(route)` — checks if on a specific page (works with both pathname and subdomain)
  - `getRouteBasePath(route)` — returns `""` on own subdomain, `"/os"` etc. elsewhere
  - `isLocalhost`, `isOnSubdomain`, `currentRoute`
- **`siteRouting.ts`** (`apps/website/app/lib/siteRouting.ts`) — pure functions for non-React code. Same logic, takes `hostname` as parameter.

**Examples:**
```tsx
// In a component on any page/subdomain:
const { href, homeHref, isOnPage } = useSiteNav();
<Link href={href("/stake")}>Stake</Link>        // → "/stake" on localhost, "https://stake.walletchan.com" on prod
<Link href={href("#install")}>Install</Link>     // → "#install" on homepage, "https://walletchan.com/#install" on subdomains
<Link href={homeHref}>Home</Link>                // → "/" on localhost, "https://walletchan.com" on subdomains
const isOnStake = isOnPage("/stake");            // → true on /stake path OR stake.walletchan.com
```

## Ponder Indexer Performance

**CRITICAL**: When indexing events from **shared contracts** (contracts used by many users, like ClankerFeeLocker), always use Ponder's `filter` option in `ponder.config.ts` to filter by indexed event parameters at the RPC level — do NOT rely solely on filtering inside the event handler.

Without config-level filtering, Ponder fetches **all** events from the contract via `eth_getLogs` and your handler discards 99%+ of them. With `filter.args`, the RPC node uses topic filtering to only return matching events, which is orders of magnitude faster.

```ts
// BAD: fetches ALL ClaimTokens events, filters in handler
ClankerFeeLocker: {
  abi, address, startBlock,
}

// GOOD: RPC node filters by indexed args before returning
ClankerFeeLocker: {
  abi, address, startBlock,
  filter: {
    event: "ClaimTokens",
    args: { feeOwner: "0x...", token: ["0x...", "0x..."] },
  },
}
```

**Rule of thumb**: If an event parameter is `indexed` in the ABI and you only care about specific values, put it in `filter.args`. Keep the handler-level filter as a safety net if you want.

## Railway Deployment (pnpm Monorepo)

Railway's default Nixpacks builder does NOT work for this pnpm monorepo with `workspace:*` dependencies. Always use a **Dockerfile** + **`railway.toml`**.

**Pattern** (see `apps/indexer/` for reference):

- `Dockerfile`: `node:20-slim`, enable corepack/pnpm, copy workspace root files + the app + any `packages/*` workspace deps, `pnpm install --frozen-lockfile --filter <pkg>`
- `railway.toml`: sets `dockerfilePath` (from repo root), deploy config
- Do NOT set Root Directory, Build Command, or Start Command in Railway UI — `railway.toml` handles it
- For Ponder indexers: start command uses `--schema $RAILWAY_DEPLOYMENT_ID` for zero-downtime deploys

## Testing Extension Changes

1. `pnpm build:extension`
2. Go to `chrome://extensions`
3. Click refresh icon on WalletChan card
4. Test in a dapp (e.g., app.aave.com)

Always run the full `pnpm build:extension` before reloading the unpacked
Chrome extension. Do not use package-level partial builds such as
`pnpm --filter @walletchan/extension build:web` for reload testing: they only
refresh part of `apps/extension/build/` and can leave manifest-referenced
scripts like `static/js/inject.js`, `static/js/inpage.js`, or
`static/js/background.js` missing or stale.
