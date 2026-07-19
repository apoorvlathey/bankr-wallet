# Fee payment domain

This directory owns WalletChan's fee-payment execution strategy. Native fees
continue through existing transaction handlers. Address-pinned ERC-20 tokens use the
official WalletChan EIP-7702 Stateless DeleGator, EntryPoint v0.7, and Pimlico's
ERC-20 paymaster/bundler through a WalletChan proxy.

Implemented modules:

- `constants.ts` pins EntryPoint and delegate identities.
- `tokens.ts` is the chain/token capability allowlist.
- `pimlicoTypes.ts` defines the provider boundary.
- `pimlicoClient.ts` performs bounded, strict JSON-RPC calls.
- `errors.ts` maps known provider failures to actionable confirmation copy.
- `userOperation.ts` encodes and signs WalletChan delegate UserOperations.
- `authorization.ts` owns first-use third-party EIP-7702 authorization.
- `paymaster.ts` computes the token bound and exact approval.
- `prepareUserOperation.ts` assembles the final unsigned provider envelope.
- `chainState.ts` owns delegation, nonce, balance, and allowance reads.
- `capabilities.ts` gates pinned single/batch requests and account types.
- `quotes.ts` owns short-lived exact-call quote pinning and one-time consume.
- `quoteValidation.ts` rechecks live nonce and delegation bindings at confirm.
- `signing.ts` chooses local or recovered-signer-verified Bankr EIP-712 signing.
- `submission.ts` hashes and persists before broadcast, then classifies definite
  rejection versus an outcome-unknown transport response.
- `receiptValidation.ts` requires a matching onchain EntryPoint event before
  accepting a bundler receipt.
- `execution.ts` and `batchExecution.ts` recheck, sign, submit, and reconcile.
- `pendingOperations.ts` and `recovery.ts` own bounded MV3 receipt recovery.

Keep provider data separate from locally constructed executable calldata and
keep `background.ts` routing-only. A real authorization, calldata envelope, or
UserOperation signature must never be persisted. Recovery stores the
deterministic UserOperation hash and public routing fields immediately before
broadcast; a definite provider rejection removes it, while an ambiguous
response retains it for receipt reconciliation without retrying.
