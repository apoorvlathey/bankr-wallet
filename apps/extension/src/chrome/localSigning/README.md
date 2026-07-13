# Local signing audit domain

`../localSigner.ts` is the stable public facade. Review this directory in
effect order:

1. `types.ts` — explicit transaction and broadcast contracts.
2. `privateKey.ts` — address derivation and key-format validation.
3. `messageSigner.ts` — signer-address checks, personal signing, and EIP-712.
4. `client.ts` — chain resolution and bounded RPC transport construction.
5. `transactionSigner.ts` — transaction/EIP-7702 preparation and signing intent.
6. `transactionBroadcast.ts` — wallet-operation lock, final authorization hook,
   sign-once raw-RPC effect, and ambiguous-outcome handling.

Message/key helpers must not access Chrome storage or network transports.
`transactionBroadcast.ts` never re-prepares an ambiguous transaction; it
retains the deterministic local hash for receipt polling.
