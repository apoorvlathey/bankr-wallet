# ENS gateway banner audit map

`chrome/ensBanner.ts` is the Vite/manifest entrypoint and only invokes
`initializeEnsBanner()`.

- `controller.ts` owns mount order, address-field state, and SPA navigation
  synchronization.
- `pageState.ts` contains the restricted `.eth`/`.gwei`/ERC-4804 input parser,
  current path calculation, and safe page metadata extraction.
- `transport.ts` contains the four outbound runtime message contracts and the
  static theme fallback. Page metadata remains untrusted display data and only
  `http(s)` or `data:image/*` favicon URLs are forwarded.
- `contentUpdates.ts` consumes only the `ens-content-updated` background push.
- `bookmarkActions.ts` preserves normalized path-scoped bookmark semantics and
  records Chrome's processed favicon endpoint for the exact local gateway page,
  so inline SVG icons never enter the extension renderer as raw markup.
- `menuActions.ts` owns copy, history, and hosted-gateway actions. Hosted
  navigation still asks the service worker for the per-tab DNR bypass first.
- `addressField.ts` owns closed-shadow-root selection, plain-text paste, mixed
  host/path coloring, and keyboard behavior.
- `view.ts` constructs the fixed banner DOM; `styles.ts` owns its isolated CSS;
  `layout.ts` owns the page body offset.
- `types.ts` defines the background-provided context/theme and DOM references.

The banner never resolves names, fetches remote content, evaluates page data,
or directly changes DNR rules. Those privileges remain behind the existing ENS
browsing background sender-authorization and navigation modules.
