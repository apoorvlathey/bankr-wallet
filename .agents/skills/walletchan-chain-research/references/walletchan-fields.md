# WalletChan Chain Field Mapping

Use this reference after collecting live facts.

## ChainEntry fields

- `chainId`: decimal chain ID. Verify by RPC `eth_chainId` when an RPC URL is available.
- `testnetChainIds`: decimal IDs for the chain operator's current public
  testnets. Verify the set from official network docs and each ID by live
  `eth_chainId` where possible. Store IDs only; do not duplicate testnet RPC,
  explorer, native-currency, or icon metadata. Exclude local/dev networks and
  deprecated testnets unless an existing WalletChan mapping must remain
  compatible, and note any such legacy ID in the research report.
- `name`: user-facing chain name from the chain operator or Bungee/0x if operator docs are unavailable.
- `rpcUrl`: stable public RPC. Prefer the chain's official public RPC or an existing WalletChan provider pattern (`*.drpc.org`) when available.
- `explorer`: base explorer URL without trailing `/address/...`.
- `icon`: local extension path such as `/chainIcons/robinhood.webp`. Download remote icons into `apps/extension/public/chainIcons/`; keep the true file type.
- `bg`, `border`, `text`: brand colors. Use the icon/brand color, with readable badge contrast.
- `nativeCurrency`: name/symbol/decimals. Verify via chain docs, Chainlist, Bungee `currency`, or CoinGecko platform.
- `isOpStack`: true only when the chain is actually OP Stack/Superchain. Do not infer from ETH gas token.
- `supportsFlashblocks`, `supportsSyncSend`, `usesNonStandardGasModel`: set only when the chain-specific behavior is known and the repo already has logic for it.
- `isBankrSupported`: true only when the user confirms Bankr support or Bankr/API docs prove it. Bankr support is independent of 0x/Bungee support.
- Safe account support is intentionally **not** a `ChainEntry` boolean. The
  extension resolves it dynamically by exact chain ID through Safe's live
  Config Service, so adding a built-in/custom WalletChan chain must not create
  a second Safe allowlist in `chainRegistry.ts`.
- `isSwapSupported`: true only when the exact chain ID has a checked Swap API
  cell in 0x's **Swap and Gasless APIs** table. `ZEROX_SUPPORTED_CHAIN_IDS` is
  derived from these registry flags.
- `isEip7702Supported`: true only when WalletChan's default delegate is usable on that chain, not merely when the protocol supports EIP-7702.
- `coingeckoTokenId`: native token price ID. ETH-gas chains often use `ethereum`, but verify if native token differs.
- `coingeckoPlatformId`: CoinGecko asset platform ID used for token prices/logos. Verify from `https://api.coingecko.com/api/v3/asset_platforms`.
- `geckoTerminalNetworkId`: GeckoTerminal network ID. Verify from `https://api.geckoterminal.com/api/v2/networks`.
- `viemChain`: include only if `viem/chains` exports a matching chain object in this repo's installed viem version.

## Swap support

Primary source: `https://docs.0x.org/docs/introduction/supported-chains`.

Read only the **Swap and Gasless APIs** table for this decision. Match the
numeric chain ID and require `✅` in the **Swap API** column. Do not accept a
page-wide name/ID match: the same page has a separate Cross-Chain API table,
and a chain can appear there without supporting the single-chain Swap API
(for example, Mode). Absence from the reachable Swap API table means false.

Update both local sources of 0x support:

- `apps/extension/src/constants/chainRegistry.ts` → the chain's
  `isSwapSupported` flag (`ZEROX_SUPPORTED_CHAIN_IDS` is derived)
- `apps/website/app/api/swap/supportedChains.ts` →
  `ZEROX_SWAP_SUPPORTED_CHAIN_IDS`
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

## Safe multisig account support

Primary source: Safe's live Config Service:

```bash
curl -sS 'https://safe-config.safe.global/api/v1/chains/?limit=100'
```

Match only the exact numeric chain ID. A WalletChan chain is eligible for Safe
accounts when all of these are true:

1. The chain appears in Safe Config.
2. `transactionService` is HTTPS on the exact `api.safe.global` host and its
   path starts with `/tx-service/`.
3. The chain is compatible with WalletChan's standard EVM Safe deployment and
   runtime verification.

Also record `chainName`, `shortName`, `isTestnet`, and
`recommendedMasterCopyVersion`. Presence of Safe singleton addresses alone is
not support proof: discovery and proposal coordination require the official
Transaction Service entry. Conversely, do not add a static WalletChan Safe
allowlist when a Config entry is present; hidden and custom chains are matched
dynamically by chain ID.

Review Safe's official supported-network and multi-chain-deployment docs for
exceptions. Current explicit exception: Safe Config lists zkSync Era (324), but
WalletChan excludes it because Safe documents that deployment as non-EVM
compatible. Report this as unsupported even though the Config lookup succeeds.

Primary references:

- `https://docs.safe.global/advanced/smart-account-supported-networks`
- `https://docs.safe.global/advanced/smart-account-multi-chain-deployment`

## EIP-7702 support

WalletChan's automatic PK/seed atomic path needs a deployed compatible delegate.

Checks:

1. WalletChan's installed default-delegate deployment registry contains the
   chain ID for the version used by the repo.
2. The chain RPC returns non-empty bytecode at `EIP_7702_DEFAULT_DELEGATE`.
3. Ideally, `supportsExecutionMode(BATCH_MODE_PLAIN)` succeeds, or the repo's existing probe supports it.

If the chain supports type-4 transactions but the default delegate is absent,
leave `isEip7702Supported: false`. Users can still use explicit/custom delegate
flows if the product supports them.

## Pimlico token-paid gas support

Token-paid gas is not a `ChainEntry` boolean. It is enabled only by an exact
chain/token pair in two independent allowlists:

- `apps/extension/src/chrome/feePayment/tokens.ts` controls what the wallet UI
  offers and contains the token symbol, decimals, stablecoin flag, logo, and
  absolute fee safety ceiling.
- `apps/website/app/api/gas/pimlico/[chainId]/tokens.ts` constrains the public
  proxy to exact token addresses. It must never become a general ERC-20 or RPC
  relay.

For a new chain or testnet:

1. Require `isEip7702Supported: true` for WalletChan's automatic token-paid gas
   path. A Pimlico token listing alone is not sufficient.
2. Use the server-side `PIMLICO_API_KEY` without printing it. Call the exact
   chain endpoint with `pimlico_getSupportedTokens` and no parameters. Treat
   its address, symbol, and decimals as live account-specific discovery data.
3. Select only WalletChan-approved fee-asset families. A newly discovered
   symbol outside the current product catalog requires explicit product and
   security review; do not add every returned token automatically.
4. Call `pimlico_getTokenQuotes` for each proposed exact address using
   WalletChan's EntryPoint v0.7 and the route chain ID. Enable only addresses
   that return a live quote. Empty quotes fail closed even when static docs
   claim support.
5. Verify address checksum, onchain `decimals()`, symbol, and balance-read
   behavior. Do not infer canonicality from a ticker such as `USDC` or `USDT`.
6. Add the same normalized address set to both files above. Include a readable
   chain-name comment beside every hardcoded address and extend the catalog and
   proxy tests so drift fails CI.
7. Re-run the live quote check immediately before handoff because provider
   availability can change independently of a WalletChan release.

If discovery cannot be authenticated, returns an error, or yields no live
quote for an approved token, document the result and leave that chain
native-only. Never expose `PIMLICO_API_KEY` through `NEXT_PUBLIC_*`, extension
environment variables, logs, committed fixtures, or shell command arguments.

## Documentation

Update `_docs/IMPLEMENTATION.md` when built-in chain support changes.
Update `_docs/SWAP.md` when swap chain counts or allowlists change.
Update `_docs/GAS_ABSTRACTION.md` when the fee-token matrix changes.
Update `_docs/ADD_CHAIN.md` only if the chain-add process itself changes.
