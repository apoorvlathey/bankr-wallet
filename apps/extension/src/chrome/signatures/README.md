# Signature domain

`txHandlers.ts` remains the stable public facade. This directory contains the
focused confirmation policy and signer orchestration behind that facade:

- `requestSigner.ts` identifies the signer parameter for each supported RPC
  signature method.
- `confirmationPolicy.ts` applies expiry, pinned-account, raw ERC-7710,
  signer-address, and SIWE checks once for both signer transports.
- `confirmationHandlers.ts` restores local or Bankr credentials, owns the
  signing effect lease, and revalidates account, origin/WalletConnect, and
  Bankr credential authority before releasing the signature capability.

Pending signature persistence, request lifecycle claims, EIP-712 validation,
SIWE parsing, local-signing primitives, and Bankr transport stay in their
shared root domains.
