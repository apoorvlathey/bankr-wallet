# Adding a New Chain

All chain data lives in a single file: `src/constants/chainRegistry.ts`. Adding a new chain means adding **one entry** to the `CHAIN_REGISTRY` array.

## Step 1: Add a chain icon

Place an SVG icon at `public/chainIcons/<chain-name>.svg`.

## Step 2: Add the registry entry

Open `src/constants/chainRegistry.ts` and add a new object to the `CHAIN_REGISTRY` array:

```ts
{
  chainId: 12345,
  name: "NewChain",
  rpcUrl: "https://rpc.newchain.io",
  explorer: "https://explorer.newchain.io",
  icon: "/chainIcons/newchain.svg",
  bg: "rgba(R, G, B, 0.15)",       // brand color at 15% opacity
  border: "rgba(R, G, B, 0.4)",    // brand color at 40% opacity
  text: "#RRGGBB",                  // brand color (solid)
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  isOpStack: false,                  // true if OP Stack L2 (enables L1 fee breakdown)
  isBankrSupported: false,           // true only if the Bankr API supports this chain
  isSwapSupported: true,             // true if 0x Swap API supports this chain (see ZEROX_SUPPORTED_CHAIN_IDS)
  coingeckoTokenId: "ethereum",      // CoinGecko token ID for native gas price, or undefined
  // viemChain: myChain,             // optional: pass a viem/chains built-in if one exists
},
```

### Field reference

| Field | Required | Description |
| --- | --- | --- |
| `chainId` | yes | The chain's numeric ID |
| `name` | yes | Human-readable name (used in UI dropdown, `CHAIN_NAMES`, and `DEFAULT_NETWORKS` key) |
| `rpcUrl` | yes | Default public RPC URL |
| `explorer` | yes | Block explorer base URL (used for address/tx links) |
| `icon` | yes | Path to SVG icon in `public/` |
| `bg`, `border`, `text` | yes | UI brand colors for chain badge/selector |
| `nativeCurrency` | yes | `{ name, symbol, decimals }` for the native token |
| `isOpStack` | yes | `true` for OP Stack L2s (shows L1 fee breakdown in gas estimation) |
| `isBankrSupported` | yes | `true` if the Bankr API can execute transactions on this chain |
| `isSwapSupported` | yes | `true` if the 0x Swap API supports this chain. Check `ZEROX_SUPPORTED_CHAIN_IDS` in `chainRegistry.ts` for the canonical list ([source](https://docs.0x.org/docs/introduction/supported-chains)). |
| `coingeckoTokenId` | no | CoinGecko token ID for USD gas estimates. Omit if no price feed needed. |
| `viemChain` | no | A pre-built `Chain` object from `viem/chains`. If omitted, one is auto-built from `rpcUrl`, `explorer`, and `nativeCurrency`. |

## What auto-populates

From that single entry, the following are all derived automatically:

| Derived export | Used by |
| --- | --- |
| `CHAIN_CONFIG[chainId]` | UI components (chain badge colors, icons, explorer links) |
| `DEFAULT_NETWORKS[name]` | Settings, RPC resolution fallback, onchain balances |
| `ALLOWED_CHAIN_IDS` | Inpage provider validation, chain switch validation |
| `BANKR_SUPPORTED_CHAIN_IDS` | UI dropdown filtering, tx handler validation |
| `SWAP_SUPPORTED_CHAIN_IDS` | Swap UI eligibility (alias for `ZEROX_SUPPORTED_CHAIN_IDS`) |
| `ZEROX_SUPPORTED_CHAIN_IDS` | Canonical set of 0x-supported chain IDs (also used for custom chains) |
| `OP_STACK_CHAIN_IDS` | Gas estimation L1 fee breakdown |
| `CHAIN_NAMES[chainId]` | Human-readable name lookups |
| `VIEM_CHAINS[chainId]` | Local signing (viem wallet client) |
| `RPC_URLS[chainId]` | Local signing fallback, onchain balance fetching |
| `CHAIN_TOKEN_IDS[chainId]` | CoinGecko native token price for gas estimation |

## Step 3: Build and test

```bash
pnpm build:extension
```

Then load the extension in Chrome and verify:
- The new chain appears in the chain selector dropdown
- Transactions can be signed and broadcast on the new chain (PK account)
- Gas estimation shows USD values (if `coingeckoTokenId` was provided)
- Explorer links work correctly

## Files you should NOT need to edit

The old pattern required touching 4+ files. With the registry, these are now thin re-export shims and should not need changes:

- `constants/chainConfig.ts` — re-exports from `chainRegistry.ts`
- `constants/networks.ts` — re-exports from `chainRegistry.ts`
- `chrome/localSigner.ts` — imports `VIEM_CHAINS` and `RPC_URLS` from registry
- `chrome/gasEstimation.ts` — imports `CHAIN_TOKEN_IDS` from registry
- `chrome/onchainBalances.ts` — imports `RPC_URLS` from registry
