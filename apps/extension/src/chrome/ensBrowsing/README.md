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
- `cache.ts`, `web3UrlCache.ts`, and `bookmarks.ts` own non-secret persistence;
  bookmark records may include a display-only `sortOrder` written by the
  launcher's accessible favorite-grid reordering.
- `connectedDapps.ts` owns the bounded, sanitized permission-display projection
  available only to the top-level `browse.html` launcher. The same exact page
  may request origin revocation through a separate narrow route, which reuses
  the full dapp permission revocation lifecycle rather than deleting storage
  directly.
- `dappDirectorySearch.ts` owns the browser-only DefiLlama directory client.
  It sends a bounded user query to one exact HTTPS endpoint and projects at
  most eight name/HTTPS-route/sanitized-logo results. The public client key is
  compiled into the background bundle only.
- `contenthashHistory.ts` queries the ENS subgraph for the latest contenthash
  change block and resolves its timestamp through the bounded Ethereum RPC
  client. The background build accepts the public `VITE_THE_GRAPH_API_KEY` (or
  `NEXT_PUBLIC_THE_GRAPH_API_KEY`) used by swiss-knife. Only trusted wallet UI
  can request this display-only provenance.
- `ens-cache-browser-image` lets only the exact top-level browser page request
  the shared bounded raster fetch/decode/re-encode cache. Remote image URLs are
  never assigned directly in the renderer.
- `ens-open-dapp-url` lets the same exact top-level launcher open one bounded,
  credential-free HTTPS suggestion in a new active tab. It rejects ordinary
  HTTP, malformed, credential-bearing, and oversized URLs.
- `types.ts` defines the shared domain records; `index.ts` is the public surface.

Dependencies flow from the message facade to authorization/routing, then from
routing to navigation and the resolver facade. Resolver support is the lowest
layer; name and ERC-4804 resolvers never import navigation or message routing.

Remote ENS/IPFS content remains untrusted throughout this domain. Network
fetches must retain URL, redirect, MIME, and response-size validation before any
content becomes renderer-visible.
