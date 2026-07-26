# Approval cleanup audit map

- `revokeCall.ts` is the pure, reducing-authority boundary for wallet-authored
  `ERC20.approve(spender, 0)` calls. It validates exact non-zero EVM addresses,
  emits canonical calldata, and detects duplicate cleanup calls.
- `revokeList.ts` validates, bounds, normalizes, and pair-deduplicates a bulk
  cleanup request before an owning storage domain may mutate state.
- `accountPolicy.ts` is the exhaustive signing-account policy for atomic EOA
  cleanup. Only private-key and seed-phrase accounts are eligible; Bankr,
  Ledger, impersonator, and Safe behavior stays with their owning domains.

Pending single, ERC-5792 batch, and Safe proposal storage remains owned by the
existing cross-dapp batch, pending-batch, and Safe proposal domains. Those
domains may import this pure helper, but this folder never reads storage,
authorizes requests, signs, broadcasts, or performs network work.
