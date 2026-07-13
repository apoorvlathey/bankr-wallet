# ENS browsing domain

- `handlers.ts` validates trusted ENS-page messages and coordinates navigation.
- `resolver.ts`, `web3url.ts`, and `kubo.ts` resolve names and bounded content.
- `gateway.ts`, `dnrRules.ts`, and `settingsStorage.ts` own gateway/network policy.
- `cache.ts`, `web3UrlCache.ts`, and `bookmarks.ts` own non-secret persistence.
- `types.ts` defines the shared domain records; `index.ts` is the public surface.

Remote ENS/IPFS content remains untrusted throughout this domain. Network
fetches must retain URL, redirect, MIME, and response-size validation before any
content becomes renderer-visible.
