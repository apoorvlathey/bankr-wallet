# Swap API and chain-read audit domain

`chrome/swapApi.ts` is the stable caller-facing facade. It exports no policy and
performs no storage, HTTP, or RPC effects itself.

Focused ownership:

- `types.ts` contains the public quote, request, and token contracts.
- `constants.ts` freezes public slippage/native-token constants plus HTTP/RPC
  deadlines, response ceilings, and cache TTLs.
- `transport.ts` owns redirect-safe, credential-free, byte-bounded JSON reads
  and the released remote-error normalization rules.
- `quotes.ts` owns the exact price/quote query contracts.
- `rpcClient.ts` is the sole configured-RPC client factory for this domain.
- `erc20.ts` owns balance/allowance reads and standard approval calldata.
- `permit2.ts` owns canonical Permit2 allowance reads and approval calldata.
- `tokenInfo.ts` owns native/onchain metadata resolution and its 30-day cache.
- `tokenListCodec.ts` validates and caps token catalogs at 2,000 entries;
  `tokenListPolicy.ts` is the pure pinned-token merge rule; `tokenList.ts` owns
  the upstream 24-hour list cache.
- `tokenLogo.ts` owns the per-address logo-result cache. Positive results retain
  the 30-day TTL; misses use a six-hour TTL and fall back through the
  WalletChan API to a verified MetaMask token-icon asset.
- `tokenLogoFallback.ts` owns that bounded WalletChan fallback request and
  accepts only the exact chain/address-derived MetaMask CDN URL.
- `tokenPrice.ts` owns proxy pricing and the existing direct CoinGecko fallback.

No module signs or broadcasts transactions. Failed RPC balance and allowance
reads retain the released `0n` fallback, while HTTP quote errors remain visible
to callers. Storage cache writes are best-effort; storage reads retain their
existing fail-visible behavior.
