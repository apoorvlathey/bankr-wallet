# WalletChan Chain Field Mapping

Use this reference after collecting live facts.

## ChainEntry fields

- `chainId`: decimal chain ID. Verify by RPC `eth_chainId` when an RPC URL is available.
- `name`: user-facing chain name from the chain operator or Bungee/0x if operator docs are unavailable.
- `rpcUrl`: stable public RPC. Prefer the chain's official public RPC or an existing WalletChan provider pattern (`*.drpc.org`) when available.
- `explorer`: base explorer URL without trailing `/address/...`.
- `icon`: local extension path such as `/chainIcons/robinhood.webp`. Download remote icons into `apps/extension/public/chainIcons/`; keep the true file type.
- `bg`, `border`, `text`: brand colors. Use the icon/brand color, with readable badge contrast.
- `nativeCurrency`: name/symbol/decimals. Verify via chain docs, Chainlist, Bungee `currency`, or CoinGecko platform.
- `isOpStack`: true only when the chain is actually OP Stack/Superchain. Do not infer from ETH gas token.
- `supportsFlashblocks`, `supportsSyncSend`, `usesNonStandardGasModel`: set only when the chain-specific behavior is known and the repo already has logic for it.
- `isBankrSupported`: true only when the user confirms Bankr support or Bankr/API docs prove it. Bankr support is independent of 0x/Bungee support.
- `isSwapSupported`: true when 0x Swap API supports the chain. Also add the chain ID to `ZEROX_SUPPORTED_CHAIN_IDS`.
- `isEip7702Supported`: true only when WalletChan's default delegate is usable on that chain, not merely when the protocol supports EIP-7702.
- `coingeckoTokenId`: native token price ID. ETH-gas chains often use `ethereum`, but verify if native token differs.
- `coingeckoPlatformId`: CoinGecko asset platform ID used for token prices/logos. Verify from `https://api.coingecko.com/api/v3/asset_platforms`.
- `geckoTerminalNetworkId`: GeckoTerminal network ID. Verify from `https://api.geckoterminal.com/api/v2/networks`.
- `viemChain`: include only if `viem/chains` exports a matching chain object in this repo's installed viem version.

## Swap support

Primary source: `https://docs.0x.org/docs/introduction/supported-chains`.

Update all local allowlists that duplicate 0x support:

- `apps/extension/src/constants/chainRegistry.ts` → `ZEROX_SUPPORTED_CHAIN_IDS`
- `apps/website/app/api/swap/price/route.ts` → `SUPPORTED_CHAIN_IDS`
- `apps/website/app/api/swap/quote/route.ts` → `SUPPORTED_CHAIN_IDS`
- `apps/website/app/api/swap/token-list/route.ts` only when CoinGecko has a platform ID

Token-list support is not the same as quote support. A chain can quote via 0x
while the token-list route remains unsupported if CoinGecko has no platform.

## Bridge support

Primary source: WalletChan bridge chain endpoint backed by Bungee/Socket:

```bash
curl -sS 'https://walletchan.eth.sh/api/bridge/chains'
```

Accept the chain as bridge-supported when the endpoint reports the chain ID and
`sendingEnabled` or `receivingEnabled` as true. Save the endpoint's icon locally
for built-in WalletChan chains when it is the best available source.

## EIP-7702 support

WalletChan's automatic PK/seed atomic path needs a deployed compatible delegate.

Checks:

1. `@metamask/delegation-deployments` contains the chain ID for the version used by the repo.
2. The chain RPC returns non-empty bytecode at `EIP_7702_DEFAULT_DELEGATE`.
3. Ideally, `supportsExecutionMode(BATCH_MODE_PLAIN)` succeeds, or the repo's existing probe supports it.

If the chain supports type-4 transactions but the default delegate is absent,
leave `isEip7702Supported: false`. Users can still use explicit/custom delegate
flows if the product supports them.

## Documentation

Update `_docs/IMPLEMENTATION.md` when built-in chain support changes.
Update `_docs/SWAP.md` when swap chain counts or allowlists change.
Update `_docs/ADD_CHAIN.md` only if the chain-add process itself changes.
