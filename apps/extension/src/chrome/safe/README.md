# Safe audit map

This domain owns Safe contract authority, proposal identity, owner approvals,
service coordination, execution, and MV3 reconciliation. No module stores a
Safe private key or treats a Safe as an EOA.

- `types.ts`, `featurePolicy.ts`: validated vocabulary and staged fail-closed policy.
- `accountTypePolicy.ts`: exhaustive account-type capability matrix and type
  guards for owner approval, outer execution, signing-path dispatch, and
  fee-token execution. Storage, discovery, authorization, execution, and
  renderer filtering all import this single policy.
- `deploymentMetadata.generated.json`, `deploymentRegistry.ts`, `onchainState.ts`,
  `capabilities.ts`, `discovery.ts`: canonical onchain verification and import
  capability projection. The generated metadata retains every released
  network alias, address, and code hash from the pinned Safe Deployments
  package, while excluding unused ABI and bytecode payloads from the MV3
  service worker. Regenerate it with `pnpm regen:safe-deployment-metadata`.
- `accountRepository.ts`, `proposalRepository.ts`: bounded versioned storage,
  atomic proposal nonce reservation/rebasing, and effect claims protected from
  stale recovery while their worker operation remains active.
- `accountRefresh.ts`: chain-scoped direct-RPC re-verification for already
  imported Safes. Transaction Service discovery never decides whether a known
  Safe remains available onchain.
- `proposalStatus.ts`: shared pending/terminal request classification used by
  both renderer summaries and the extension action badge.
- `proposalNonce.ts`, `proposalNonceReconciliation.ts`: lowest-free automatic
  allocation, explicit unsigned custom-nonce rules, and queued-request
  activation/terminalization as the verified onchain nonce advances. When a
  queued nonce becomes current, readiness is normalized from its validated
  confirmations and fresh threshold under a second in-lock effect/execution
  claim check.
- `transactionBuilder.ts`, `transactionHash.ts`, `multiSend.ts`: immutable Safe
  transaction construction. The hash boundary implements the exact chain-bound
  SafeTx EIP-712 schema shared by supported Safe 1.3.0–1.5.0 releases without
  loading unrelated Protocol Kit surfaces into the service worker.
- `proposalRejectionPolicy.ts`, `proposalRejection.ts`: canonical same-nonce
  rejection classification and creation. Unsigned requests may cancel locally;
  any supported or unsupported collected signature requires a fresh Safe
  rejection proposal and normal threshold execution.
- `signatureValidation.ts`, `ownerAuthorization.ts`: one-owner authorization,
  centralized live-session restoration for
  private-key/seed-phrase/Ledger/Bankr owners, auth-epoch revalidation, and
  signature recovery. Ledger approval delegates only the exact SafeTx EIP-712
  payload to the central device signer.
- `serviceRegistry.ts`: bounded, cached Safe Config Service discovery for every
  official EVM network. Transaction URLs are accepted only on the pinned
  `api.safe.global/tx-service/*` boundary; user-configured hidden/custom RPCs
  take precedence over validated public Safe RPC fallbacks.
- `serviceClient.ts`, `serviceValidation.ts`, `serviceMerge.ts`, `publication.ts`:
  bounded direct-to-Safe coordination; service refreshes merge confirmations
  without downgrading locally claimed, prepared, or broadcast effects. Direct
  reconciliation uses the same merge so a second renderer cannot cancel a
  hardware operation's first-action claim, and publication completion applies
  published markers to the latest locked confirmation set.
- `executionData.ts`, `executionGas.ts`: pure construction of the exact outer
  `execTransaction` envelope and bounded reviewed fee validation shared by
  renderer review and the background broadcast path.
- `executorHistory.ts`: deterministic normal transaction-history publication
  for the private-key, seed-phrase, or Ledger EOA that pays Safe execution gas. It
  reuses the ordinary receipt poller and details surface rather than adding a
  second Safe-specific executor activity model.
- `feePaymentExecution.ts`: executor- and proposal-pinned ERC-20 fee quotes,
  EIP-7702 UserOperation submission, deterministic-hash recovery, independently
  verified EntryPoint finality, and delayed publication of the real onchain
  hash to provider/ERC-5792 callers. Only private-key and seed-phrase Safe
  executors enter this path; Ledger Safe execution is native-gas-only.
- `executionPolicy.ts`, `executionStatus.ts`, `executionReceipt.ts`,
  `executionSettlement.ts`, `execution.ts`: durable duplicate-submit guards,
  exact-envelope simulation, session-restoring local/Ledger executor signing,
  validated fee overrides, configured-then-pinned receipt fallback reads,
  explicit retryable RPC status, MV3-alarm/startup recovery, broadcast
  ambiguity, and terminalization of provider/ERC-5792 routes only after a
  competing or rejection transaction consumes the nonce onchain. A failed
  final simulation remains blocking unless the trusted UI forwards the user's
  explicit likely-to-fail acknowledgement; every authority and broadcast gate
  still runs in either case.
- `sync.ts`, `notifications.ts`: serialized full/targeted refresh, alarm-driven
  reconciliation, and deduplicated transitions.

Mirrored tests and fixture intent are documented in `tests/safe/README.md`.
