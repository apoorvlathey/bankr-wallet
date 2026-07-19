# dapp3 browser presentation

- `BookmarkPageReminder.tsx` keeps a quiet bookmark reminder fixed to the
  viewport's upper-right corner. It displays the platform-appropriate native
  browser shortcut because the extension page cannot invoke Chrome's bookmark
  dialog itself and needs no bookmarks permission. Hover/focus reveals a
  dismiss action; dismissal writes only the non-secret
  `walletchan:browseBookmarkReminderDismissed:v1` DOM-localStorage flag.
- `FavoriteDappsSection.tsx` renders both resolver and ordinary HTTP(S)
  favorites above the permission-backed connected list. It shows the normalized
  hostname or resolver URL beneath the title and opens HTTPS favorites through
  the exact-launcher new-tab route. Removing a favorite never changes dapp
  permission state. It also owns optimistic grid reordering and reports a
  recoverable persistence error without losing the prior order.
- `SortableDapp3SiteCard.tsx` connects the favorite card's dedicated drag grip
  to pointer, touch, and keyboard sorting. Focusing or hovering the grip also
  reveals previous/next buttons as a no-drag pointer alternative. The shared
  card's open and remove controls remain independent actions.
- `ConnectedDappsSection.tsx` filters ordinary injected dapps from the launcher
  input, caps the grid at three scrollable rows, and owns favorite/disconnect
  actions. Disconnect uses the narrow browser-only background route; favorite
  state uses the non-secret bookmark repository. `usePersistentScrollbar.ts`
  measures that native scroll container and projects an always-visible visual
  thumb only while its content overflows; wheel, touch, keyboard, and trackpad
  behavior remain native.
- `Dapp3SiteCard.tsx` owns the shared open target and keyboard-accessible hover
  actions. Actions remain visible on coarse pointers and on focus-within.
- The recently cached grid reuses that card action to save resolver metadata as
  a favorite. The storage subscription then moves the dapp into the favorite
  grid without a page reload.
- `bookmarks.ts` persists the optional favorite `sortOrder` in the existing
  non-secret `ensBookmarks` map. Legacy entries remain newest-first, newly
  added favorites appear first, and reorder writes trigger the existing
  cross-page storage reconciliation.
- `Dapp3SiteIcon.tsx` owns the shared safe-raster favicon and letter fallback.
  It uses the exact browser-only raster-cache route, so DefiLlama and connected
  dapp logos cross the background decode/re-encode boundary before rendering.
  Image and letter states share one near-white contrast canvas; raster marks
  are enlarged and rounded without changing the outer icon footprint.
- `DappDirectorySuggestions.tsx` and `useDappDirectorySearch.ts` own the
  debounced, keyboard-operable DefiLlama result list. Suggestions receive only
  the bounded background projection and render logos through the safe-raster
  icon boundary. Activating a suggestion asks the exact-page background route
  to open its validated HTTPS URL in a new tab. Hover/focus reveals a separate
  star action that updates the non-secret favorite repository without opening
  the dapp.
- `dapp3BrowserModel.ts` owns safe direct-HTTPS parsing plus pure filtering and
  connected-favorite projection. It also derives favorite display URLs and
  remaps local IPFS/onchain favicon paths to known public gateways before safe
  raster caching. Resolver gateway URLs are still normalized into the
  ENS/GNS/onchain path before ordinary HTTPS handling.
- `useConnectedDapps.ts` owns the narrow browser-page message read and refresh
  subscriptions. Runtime permission broadcasts, exact storage-key changes,
  page visibility, and window focus all reconcile without a manual reload.
- Shared `useDappOriginDisplay.ts` presentation converts an exact configured
  local gateway origin back to its cached `.eth`, `.gwei`, or `0x` identity.
  Card navigation, permission revocation, and favorite launch URLs retain the
  original browser-attested origin.

The background ENS browsing domain owns sender authorization and the bounded
public display projection. This renderer domain never reads `dappPermissions`
directly and never receives the DefiLlama client key. Revocation reuses the
background's complete dapp-origin revocation lifecycle, including
pending-request cancellation and connected-tab updates.
