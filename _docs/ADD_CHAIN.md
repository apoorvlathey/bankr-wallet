# Adding a New Chain

Core chain metadata lives in `src/constants/chainRegistry.ts`. Adding a new
chain starts with one `CHAIN_REGISTRY` entry. Feature-specific security
allowlists, including token-paid gas, remain separate and must be updated only
after their own live capability checks.

> **Before adding a built-in entry:** if the only reason is to give a custom
> chain known metadata and EIP-7702 atomic batching, a registry entry may not
> be necessary. Chains with WalletChan's default delegate are already covered
> by the generated `KNOWN_CHAINS` map. Keep the default dropdown lean and
> promote a chain only when WalletChan surfaces need first-class support.

## Step 1: Add a chain icon

Place an SVG icon at `public/chainIcons/<chain-name>.svg`.

## Step 2: Add the registry entry

Open `src/constants/chainRegistry.ts` and add a new object to the `CHAIN_REGISTRY` array:

```ts
{
  chainId: 12345,
  testnetChainIds: [12346],          // current public testnets; IDs only
  name: "NewChain",
  rpcUrl: "https://rpc.newchain.io",
  explorer: "https://explorer.newchain.io",
  icon: "/chainIcons/newchain.svg",
  bg: "rgba(R, G, B, 0.15)",       // brand color at 15% opacity
  border: "rgba(R, G, B, 0.4)",    // brand color at 40% opacity
  text: "#RRGGBB",                  // brand color (solid)
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  hiddenByDefault: false,             // optional: hide until enabled in Settings
  isOpStack: false,                  // true if OP Stack L2 (enables L1 fee breakdown)
  isBankrSupported: false,           // true only if the Bankr API supports this chain
  isSwapSupported: true,             // true only when 0x's Swap API table lists this chain ID
  coingeckoTokenId: "ethereum",      // CoinGecko token ID for native gas price, or undefined
  // viemChain: myChain,             // optional: pass a viem/chains built-in if one exists
},
```

### Field reference

| Field | Required | Description |
| --- | --- | --- |
| `chainId` | yes | The chain's numeric ID |
| `testnetChainIds` | yes | Numeric IDs of current official public testnets that should reuse this mainnet entry's icon and brand colors. Use `[]` when none are verified. Do not add testnet RPC, explorer, currency, or other metadata. |
| `name` | yes | Human-readable name (used in UI dropdown, `CHAIN_NAMES`, and `DEFAULT_NETWORKS` key) |
| `rpcUrl` | yes | Default public RPC URL |
| `explorer` | yes | Block explorer base URL (used for address/tx links) |
| `icon` | yes | Path to SVG icon in `public/` |
| `bg`, `border`, `text` | yes | UI brand colors for chain badge/selector |
| `nativeCurrency` | yes | `{ name, symbol, decimals }` for the native token |
| `hiddenByDefault` | no | When `true`, fresh installs and existing users without a stored entry do not query or display the chain until they enable it in Settings → Chains. An existing stored visibility choice wins over this default. |
| `isOpStack` | yes | `true` for OP Stack L2s (shows L1 fee breakdown in gas estimation) |
| `isBankrSupported` | yes | `true` if the Bankr API can execute transactions on this chain |
| `isSwapSupported` | yes | `true` only when the exact chain ID has a checked Swap API cell in 0x's **Swap and Gasless APIs** table ([source](https://docs.0x.org/docs/introduction/supported-chains)). Do not infer this from the separate Cross-Chain API table. |
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
| `ZEROX_SUPPORTED_CHAIN_IDS` | Set derived from registry entries whose `isSwapSupported` flag is true |
| `OP_STACK_CHAIN_IDS` | Gas estimation L1 fee breakdown |
| `CHAIN_NAMES[chainId]` | Human-readable name lookups |
| `VIEM_CHAINS[chainId]` | Local signing (viem wallet client) |
| `RPC_URLS[chainId]` | Local signing fallback, onchain balance fetching |
| `CHAIN_TOKEN_IDS[chainId]` | CoinGecko native token price for gas estimation |

Custom chains whose ID appears in a built-in entry's `testnetChainIds` reuse
that entry's local mainnet icon and brand colors. The existing testnet overlay
(`SEP`, `FUJI`, or `T`) remains visible, so the shared logo does not make the
testnet look like mainnet. Keep this relationship in the registry instead of
adding one-off icon aliases.

## Step 3: Verify token-paid gas support

Follow `.agents/skills/walletchan-chain-research/SKILL.md` and
`_docs/GAS_ABSTRACTION.md` for every built-in EVM chain addition.

1. Confirm WalletChan's official delegate is deployed and usable. Protocol
   support or a type-4 transaction sample alone is insufficient.
2. Using the server-side developer key, call `pimlico_getSupportedTokens` on
   the exact chain endpoint. Never print, commit, or pass the key as a shell
   argument.
3. Consider only WalletChan-approved fee-asset families. Do not automatically
   expose every provider result.
4. Confirm every proposed exact token address with
   `pimlico_getTokenQuotes`, WalletChan's EntryPoint v0.7, and the route chain
   ID. Empty quotes fail closed even if static documentation lists the token.
5. Verify checksum, symbol, and decimals onchain.
6. Update both exact-address catalogs in the same change:
   - `apps/extension/src/chrome/feePayment/tokens.ts`
   - `apps/website/app/api/gas/pimlico/[chainId]/tokens.ts`
7. Put a readable chain-name comment beside each hardcoded address and extend
   catalog/proxy tests so normalized address-set drift fails CI.

If no approved token returns a live quote, the chain remains native-only.
Never infer token-paid gas support from a ticker, token deployment, static
support table, or another chain.

## Step 4: Build and test

```bash
pnpm build:extension
```

Then load the extension in Chrome and verify:
- The new chain appears in the chain selector dropdown
- Transactions can be signed and broadcast on the new chain (PK account)
- Gas estimation shows USD values (if `coingeckoTokenId` was provided)
- Explorer links work correctly
- The native fee path still works for Bankr, private-key, and seed-phrase
  accounts
- Every enabled fee token appears only on its exact chain, shows its balance,
  produces a bounded live quote, and follows the account/delegation gates

## Files you should NOT need to edit

The old pattern required touching 4+ files. With the registry, these are now thin re-export shims and should not need changes:

- `constants/chainConfig.ts` — re-exports from `chainRegistry.ts`
- `constants/networks.ts` — re-exports from `chainRegistry.ts`
- `chrome/localSigner.ts` — imports `VIEM_CHAINS` and `RPC_URLS` from registry
- `chrome/gasEstimation.ts` — imports `CHAIN_TOKEN_IDS` from registry
- `chrome/portfolio/onchainBalances.ts` — imports `RPC_URLS` from registry

## Auto-prefill from KNOWN_CHAINS

The custom-chain add form (`Settings/AddChain.tsx`) consults `apps/extension/src/constants/knownChains.generated.ts` whenever the user enters or auto-detects a chainId. If the chainId matches an entry, the form prefills name, explorer, native currency, decimals — and an inline hint notes that EIP-7702 atomic batching is enabled by default for the chain.

`KNOWN_CHAINS` is auto-generated from WalletChan's installed delegate
deployment registry. Every included chain ID has the same
`EIP_7702_DEFAULT_DELEGATE` address deployed. See [`_docs/7702.md` § Known
chains](./7702.md#known-chains) for the regeneration workflow.

Practical effect: a user who adds Linea or Monad or Sonic as a custom chain skips the manual delegate-setup step entirely. The resolver's `hasDefaultDelegateForChain()` automatically extends 7702 eligibility to anything in `KNOWN_CHAINS`, so the first batch on the chain atomically bundles a delegation to the WalletChan default without the user touching Settings.

To add a chain to `KNOWN_CHAINS` outside the generated registry after manually
verifying the delegate, add a `MANUAL_OVERRIDES` entry in
`apps/extension/scripts/generate-known-chains.ts` and run
`pnpm regen-chains`.
