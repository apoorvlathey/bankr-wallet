# Residual approval cleanup audit domain

- `revokeCall.ts` is the pure reducing-authority boundary for canonical
  `ERC20.approve(spender, 0)` calls and duplicate detection.
- `revokeList.ts` validates, bounds, normalizes, and pair-deduplicates bulk
  cleanup targets before an owning storage domain mutates state.
- `accountPolicy.ts` is the exhaustive atomic EOA cleanup policy. Only
  private-key and seed-phrase accounts are eligible; Bankr, Ledger,
  impersonator, and Safe behavior remains with their owning domains.
- `requestResolver.ts` resolves trusted pending request IDs into the exact
  owner, chain, and call sequence and computes the immutable evidence
  fingerprint.
- `detection.ts` runs late best-effort residual detection against that resolved
  request.
- `evidenceRegistry.ts` binds short-lived opaque renderer IDs to verified
  token/spender pairs. Cleanup routes re-resolve the current request and reject
  stale evidence before calling their existing request-family mutation policy.

This domain never signs or broadcasts. It owns no dapp response route and
stores no durable data or secrets. Pending single, ERC-5792 batch, cross-dapp,
and Safe proposal storage remains owned by the existing request domains.
