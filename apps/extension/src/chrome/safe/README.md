# Safe audit map

This domain owns Safe contract authority, proposal identity, owner approvals,
service coordination, execution, and MV3 reconciliation. No module stores a
Safe private key or treats a Safe as an EOA.

- `types.ts`, `featurePolicy.ts`: validated vocabulary and staged fail-closed policy.
- `deploymentRegistry.ts`, `onchainState.ts`, `capabilities.ts`, `discovery.ts`: canonical onchain verification and import capability projection.
- `accountRepository.ts`, `proposalRepository.ts`: bounded versioned storage and effect claims.
- `accountRefresh.ts`: chain-scoped direct-RPC re-verification for already
  imported Safes. Transaction Service discovery never decides whether a known
  Safe remains available onchain.
- `proposalStatus.ts`: shared pending/terminal request classification used by
  both renderer summaries and the extension action badge.
- `transactionBuilder.ts`, `transactionHash.ts`, `multiSend.ts`: immutable Safe transaction construction.
- `proposalRejectionPolicy.ts`, `proposalRejection.ts`: canonical same-nonce
  rejection classification and creation. Unsigned requests may cancel locally;
  any supported or unsupported collected signature requires a fresh Safe
  rejection proposal and normal threshold execution.
- `signatureValidation.ts`, `ownerAuthorization.ts`: one-owner authorization,
  centralized live-session restoration for Bankr/private-key/seed-phrase
  owners, auth-epoch revalidation, and signature recovery.
- `serviceRegistry.ts`: bounded, cached Safe Config Service discovery for every
  official EVM network. Transaction URLs are accepted only on the pinned
  `api.safe.global/tx-service/*` boundary; user-configured hidden/custom RPCs
  take precedence over validated public Safe RPC fallbacks.
- `serviceClient.ts`, `serviceValidation.ts`, `serviceMerge.ts`, `publication.ts`:
  bounded direct-to-Safe coordination; service refreshes merge confirmations
  without downgrading locally claimed, prepared, or broadcast effects.
- `executionData.ts`, `executionGas.ts`: pure construction of the exact outer
  `execTransaction` envelope and bounded reviewed fee validation shared by
  renderer review and the background broadcast path.
- `executorHistory.ts`: deterministic normal transaction-history publication
  for the private-key or seed-phrase EOA that pays Safe execution gas. It
  reuses the ordinary receipt poller and details surface rather than adding a
  second Safe-specific executor activity model.
- `executionPolicy.ts`, `executionStatus.ts`, `executionReceipt.ts`,
  `executionSettlement.ts`, `execution.ts`: durable duplicate-submit guards,
  exact-envelope simulation, session-restoring local executor signing,
  validated fee overrides, configured-then-pinned receipt fallback reads,
  explicit retryable RPC status, MV3-alarm/startup recovery, broadcast
  ambiguity, and terminalization of provider/ERC-5792 routes only after a
  competing or rejection transaction consumes the nonce onchain.
- `sync.ts`, `notifications.ts`: serialized full/targeted refresh, alarm-driven
  reconciliation, and deduplicated transitions.

Mirrored tests and fixture intent are documented in `tests/safe/README.md`.
