# Apps Page

The `/apps` page lets users browse and interact with dApps in an iframe via WalletChan. Dapps are embedded using the Safe Apps SDK protocol via `@impersonator/iframe` — dapps think they're running inside a Gnosis Safe wallet.

## Data Source

Dapp data comes from the [Safe Global registry API](https://safe-client.safe.global), fetched and processed by `apps/website/scripts/fetchSafeDapps.ts`. This is the same approach used by [swiss-knife](https://github.com/apoorvlathey/swiss-knife).

### Refreshing Dapp Data

```bash
cd apps/website
pnpm fetch-dapps
```

This regenerates `app/apps/data/dapps.json` (~46 dapps) and downloads all dapp icons to `public/images/dapp-icons/`. Both the JSON and icons are committed to the repo so builds work without running the script.

### How the Fetch Script Works

1. Fetches dapps from Safe API for all 15 supported chains
2. Merges chain lists for dapps that appear on multiple chains
3. Filters out disabled dapps (broken in iframes, deprecated, Safe-internal)
4. Adds custom dapps with corrected chain support (Uniswap, Revoke.cash, Yearn, Curve, sky.money, Aura, Enzyme ETH/Polygon, dump.services, Pods Yield, DefiLlama Swap, EFP, Sushi, TokenOps)
5. Applies priority sorting (popular dapps first)
6. Downloads all dapp icons locally to `public/images/dapp-icons/{id}.png` for instant loading (avoids Chakra `Image` fallback flash)
7. Preserves manually-set `categories` and `autoConnect` values from existing `dapps.json`

### Dapp Data Fields

| Field         | Type       | Description                                                                |
| ------------- | ---------- | -------------------------------------------------------------------------- |
| `id`          | `number`   | Unique dapp ID (from Safe API or custom)                                   |
| `name`        | `string`   | Display name                                                               |
| `description` | `string`   | Short description                                                          |
| `url`         | `string`   | Dapp URL loaded in the iframe                                              |
| `iconUrl`     | `string`   | Local path to icon (`/images/dapp-icons/{id}.png`)                         |
| `chains`      | `number[]` | Supported chain IDs                                                        |
| `categories`  | `string[]` | Category tags (swap, yield, bridge, etc.) — manually maintained            |
| `autoConnect` | `boolean`  | Whether the dapp auto-connects via Safe SDK. `false` = user must manually select "Safe" wallet in the dapp. Manually maintained. |

## URL Parameters

The apps page uses URL params for shareability and reload persistence:

| Param     | Description                                                        |
| --------- | ------------------------------------------------------------------ |
| `url`     | Dapp URL to open in iframe view (restored on page load)            |
| `chainId` | Active chain ID for the iframe (restored on reload, auto-corrected if unsupported) |

Example: `/apps?url=https://app.uniswap.org&chainId=8453`

State is initialized synchronously from `searchParams` in `useState` initializers (not `useEffect`) to avoid flashing the dapp grid before showing the iframe view.

## Chain Management

Chain state in the iframe view is managed **locally** (`activeChainId` state), independent of wagmi's `switchChain`. This is necessary because the Safe connector doesn't support programmatic chain switching (`SwitchChainNotSupportedError`).

**Chain resolution priority** (on mount):
1. `initialChainId` from URL param (if supported by the dapp)
2. Wallet's current chain (if supported by the dapp)
3. First chain in the dapp's supported chains list

**On chain switch** (from toolbar dropdown):
- `activeChainId` updates → `ImpersonatorIframeProvider` remounts via `key={activeChainId}` → iframe reloads → dapp re-queries `getSafeInfo` and gets the new chainId
- Loading overlay resets with "Switching chain..." text
- URL param `chainId` is updated via `router.replace`

**Chain switch from dapp** (via `wallet_switchEthereumChain`):
- The `@impersonator/iframe` library (v0.4.1+) intercepts `wallet_switchEthereumChain` RPC calls and exposes them via `onChainSwitchRequest` callback
- Note: Most dapps using Safe Apps SDK won't send this — the SDK client-side rejects it before sending. This mainly helps dapps using raw EIP-1193 providers.

## Loading Overlay

A full-screen loading overlay with the WalletChan character is shown when:
1. A dapp is first opened (text: "Loading {appName}...")
2. The chain is switched (text: "Switching chain...")

**Dismissal trigger**: The overlay dismisses on whichever comes first:
- First `postMessage` from the iframe (Safe SDK init = the dapp has rendered its JS)
- 800ms fallback timeout (for dapps that don't auto-connect via Safe SDK)

**Animation lifecycle**: `bounceIn` → `floatBob` (idle) → `slideOut` (on dismiss)

## Auto-Connect Banner

For dapps with `autoConnect: false`, a yellow banner is shown below the toolbar:
> "Select 'Safe' as the wallet option inside the dapp to connect"

The banner auto-dismisses when the first Safe SDK `postMessage` is received (`safeConnected` state), confirming the user has selected Safe in the dapp.

## Scroll Preservation

When opening a dapp from the grid, the scroll position is saved to a ref. On back navigation, scroll is restored via `requestAnimationFrame` after React re-renders the grid.

## Page Title

While a dapp is open, `document.title` is set to `"{appName} | WalletChan"`. A `MutationObserver` on `<head>` re-applies the title after Next.js metadata overwrites it on route changes. The original title is restored in `handleBack`.

## Supported Chains

| Chain      | ID        | RPC                                     | Fallback RPC               |
| ---------- | --------- | --------------------------------------- | -------------------------- |
| Ethereum   | 1         | env or `https://eth.llamarpc.com`       |                            |
| Base       | 8453      | env or `https://base.llamarpc.com`      | `https://mainnet.base.org` |
| Polygon    | 137       | env or `https://polygon-rpc.com`        |                            |
| Unichain   | 130       | `https://mainnet.unichain.org`          |                            |
| Arbitrum   | 42161     | `https://arb1.arbitrum.io/rpc`          |                            |
| Optimism   | 10        | `https://mainnet.optimism.io`           |                            |
| BSC        | 56        | `https://bsc-dataseed.binance.org`      |                            |
| Avalanche  | 43114     | `https://api.avax.network/ext/bc/C/rpc` |                            |
| Zora       | 7777777   | `https://rpc.zora.energy`               |                            |
| Celo       | 42220     | `https://forno.celo.org`               |                            |
| Gnosis     | 100       | `https://rpc.gnosischain.com`           |                            |
| Ink        | 57073     | `https://rpc-gel.inkonchain.com`        |                            |
| PulseChain | 369       | `https://rpc.pulsechain.com`            |                            |
| Soneium    | 1868      | `https://rpc.soneium.org`              |                            |
| Sonic      | 146       | `https://rpc.soniclabs.com`            |                            |
| MegaETH    | 4326      | `https://mainnet.megaeth.com/rpc`       |                            |

Fallback RPCs are configured in `CHAIN_FALLBACK_RPCS` in `wagmiConfig.ts` using viem's `fallback()` transport.

## Key Files

| File                                             | Purpose                                                                          |
| ------------------------------------------------ | -------------------------------------------------------------------------------- |
| `apps/website/scripts/fetchSafeDapps.ts`         | Fetch script — pulls from Safe API, filters, adds custom dapps, downloads icons  |
| `apps/website/app/apps/data/dapps.json`          | Generated dapp data (committed)                                                  |
| `apps/website/app/apps/data/dapps.ts`            | TypeScript exports: `DAPPS`, `DappEntry`, `CHAIN_NAMES`, categories/colors       |
| `apps/website/app/wagmiConfig.ts`                | Wagmi config — chains, RainbowKit connectors, `CHAIN_RPC_URLS`, fallback RPCs    |
| `apps/website/app/apps/page.tsx`                 | Apps grid page — search, chain/category filters, URL param persistence, scroll   |
| `apps/website/app/apps/components/IframeApp.tsx` | Iframe view — local chain state, loading overlay, Safe SDK bridge, toolbar        |
| `apps/website/app/apps/components/AppCard.tsx`   | Dapp card — icon (native `<img>`), name, domain, description, chain/category badges |
| `apps/website/app/apps/components/ChainIcon.tsx` | Chain icon component (SVG or colored dot fallback)                               |
| `apps/website/public/images/dapp-icons/`         | Downloaded dapp icons (committed, regenerated by fetch script)                   |
| `apps/website/app/api/meta/`                     | API route for fetching page title/description for custom URL cards               |

## Adding a New Chain

1. Add the chain to `CHAIN_IDS` in `scripts/fetchSafeDapps.ts`
2. Add the chain to `CHAIN_NAMES` in `app/apps/data/dapps.ts`
3. Add the chain import to `walletChains` in `app/wagmiConfig.ts`
4. Add the chain's RPC URL to `CHAIN_RPC_URLS` in `app/wagmiConfig.ts`
5. Optionally add fallback RPCs to `CHAIN_FALLBACK_RPCS` in `app/wagmiConfig.ts`
6. Run `pnpm fetch-dapps` to regenerate data and download icons

## Adding a Custom Dapp

Add an entry to `CUSTOM_DAPPS` in `scripts/fetchSafeDapps.ts`, then run `pnpm fetch-dapps`. Custom dapps override the Safe registry version (the original is disabled by ID).

After adding, manually set `categories` and `autoConnect` in the generated `dapps.json` — these are preserved across subsequent fetch runs.

## Disabling a Dapp

Add its Safe API ID to `DISABLED_IDS` in `scripts/fetchSafeDapps.ts`, then run `pnpm fetch-dapps`.

## Important Patterns

- **Native `<img>` for dapp icons**: AppCard uses native `<img>` instead of Chakra `Image` to avoid the fallback/loading-state flash that Chakra's `useImage` hook causes.
- **Synchronous URL param restore**: `activeDapp`, `customUrl`, and `initialChainId` are initialized in `useState` initializers (not `useEffect`) to prevent the grid from flashing before the iframe view.
- **MutationObserver for page title**: Next.js overwrites `document.title` on route changes; a MutationObserver on `<head>` re-applies the dapp title.
- **`accountStatus` vs `isConnected`**: The iframe view uses `accountStatus === "disconnected"` instead of `!isConnected` to avoid flashing the "Connect Wallet" screen during wagmi hydration.
