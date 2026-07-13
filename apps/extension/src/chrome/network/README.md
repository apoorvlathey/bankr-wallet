# Network infrastructure audit domain

- `boundedHttp.ts` owns shared response deadlines, byte ceilings, redirect
  rejection, and credential/referrer-free HTTP consumption.
- `rpcClient.ts` owns configured-RPC URL/SSRF policy, bounded viem transport,
  direct JSON-RPC envelopes, concurrency, and probe limits.
- `safeRpcForwarding.ts` owns the exact provider/WalletConnect read-method
  allowlist and configured-endpoint forwarding boundary.
- `proxyResolver.ts` performs bounded configured-RPC proxy-slot discovery.
- `customNetworkValidation.ts` validates custom names, RPCs, explorers, chain
  IDs, and native-currency metadata without storage access.
- `networkRepository.ts` alone reads/writes the released `networksInfo` and
  `chainName` sync-storage state and owns its mutation lock key.
- `networkPolicy.ts` owns pure chain-ID lookup, visibility fallback, and typed
  mutation results.
- `networkMutations.ts` serializes ensure/add/update/hide/delete operations.

There are no root compatibility facades for these internal boundaries. Imports
must point directly into this domain. URL validation must remain at final egress
as well as configuration time; redirects, ambient credentials/referrers,
unbounded bodies, unconfigured provider targets, and remote-to-private pivots
fail closed.
