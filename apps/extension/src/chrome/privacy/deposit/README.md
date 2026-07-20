# Privacy deposit quote and review boundary

The public quote validates an exact account snapshot, rejects impersonators,
enforces the onchain 0.001 ETH minimum and valid `uint256` input, simulates the
exact Entrypoint native `deposit(uint256)` call, and returns only serialized
public amounts. It applies no arbitrary application maximum: affordability is
bounded by the public source balance after the gas reserve. The shared active-chain
RPC policy caps JSON-RPC batches at three requests for free-tier compatibility.

The review path requires a current password or fresh biometric master session.
Under the wallet-secret lock it re-pins the stored account, decrypts the phrase
inside the service worker, derives a disposable precommitment, ABI-encodes the
call, and independently decodes its chain, source, destination, value, fee
math, selector, and argument. Its type is always `submittable: false`; the
router exposes no calldata or commitment material.

There is deliberately no durable note reservation, signing, submission,
transaction persistence, or mutation route in this quote/review directory.
The later sibling `operations/` boundary reserves and encrypts a distinct real
index only after the user confirms the reviewed details. The random
precommitment used by `eth_estimateGas` is public, short-lived, and never
returned or reused as a future deposit intent.

## Files

- `quotePolicy.ts` / `quoteClient.ts` / `quote.ts`: pure amount policy,
  bounded public RPC reads, and exact-account quote coordination.
- `intent.ts`: exact review-only call construction plus independent decoding.
- `prepare.ts`: master-authorized, lock-held phrase derivation and public
  review preparation with no storage write.
