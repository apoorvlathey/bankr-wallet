# Fee-payment tests

- `tokens.test.ts` freezes the exact native/ERC-20 chain capability catalog.
- `capabilities.test.ts` covers Bankr, private-key, seed-phrase, view-only,
  deployment, first-use, and foreign-delegate gates.
- `userOperation.test.ts` pins MetaMask Stateless DeleGator call encoding and
  typed-data signature recovery.
- `authorization.test.ts` freezes real/dummy EIP-7702 authorization formatting.
- `paymaster.test.ts` and `prepareUserOperation.test.ts` cover bounded approval,
  quote math, provider ordering, allowance reads, and absolute per-token caps.
- `pimlicoClient.test.ts` rejects malformed, substituted, cross-request, and
  insecure provider responses, while mapping the known insufficient-remaining-
  selected-token paymaster failure to actionable user copy.
- `quoteStore.test.ts` and `quoteValidation.test.ts` freeze quote expiry,
  single-use request/account/call binding, and delegation/nonce races.
- `submission.test.ts` proves deterministic pre-broadcast hash persistence,
  definite rejection cleanup, and ambiguous-response recovery.
- `receiptValidation.test.ts` requires an independently fetched matching
  EntryPoint event before activity or ERC-5792 finality.
- `selectorLifecycle.test.ts` freezes bounded option/quote loading, explicit
  retry, and the no-automatic-retry error state.

Background router tests separately freeze the trusted-UI audience and exact
three-wallet-type fee-selection arguments.
