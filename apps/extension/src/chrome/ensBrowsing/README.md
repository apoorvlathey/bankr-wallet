# ENS browsing domain

- `handlers.ts` is the stable message-entry facade.
- `senderAuthorization.ts` owns the exact page/message/top-frame allowlist.
- `messageRoutes.ts` validates bounded message fields and dispatches routes.
- `navigation.ts` owns gateway choice, per-tab bypasses, cache/session context,
  and tab navigation.
- `resolver.ts` is the stable ENS/GNS/ERC-4804 resolver facade.
- `resolverSupport.ts` owns the direct RPC client, resolver ABI, DNS encoding,
  and Universal Resolver call.
- `nameResolvers.ts` resolves ENS/GNS contenthash records and ENS address
  fallbacks.
- `erc4804Resolver.ts` probes, fetches, pins, and caches onchain HTML.
- `web3url.ts` and `kubo.ts` enforce bounded onchain/Kubo content reads.
- `gateway.ts`, `dnrRules.ts`, and `settingsStorage.ts` own gateway/network policy.
- `cache.ts`, `web3UrlCache.ts`, and `bookmarks.ts` own non-secret persistence.
- `types.ts` defines the shared domain records; `index.ts` is the public surface.

Dependencies flow from the message facade to authorization/routing, then from
routing to navigation and the resolver facade. Resolver support is the lowest
layer; name and ERC-4804 resolvers never import navigation or message routing.

Remote ENS/IPFS content remains untrusted throughout this domain. Network
fetches must retain URL, redirect, MIME, and response-size validation before any
content becomes renderer-visible.
