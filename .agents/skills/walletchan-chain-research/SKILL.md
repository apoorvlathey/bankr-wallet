---
name: walletchan-chain-research
description: Research and verify EVM chain metadata, WalletChan feature support, Pimlico fee-token availability, and notification-safe icon assets for WalletChan chain additions or updates. Use when Codex is asked to add a new WalletChan chain, update chain params, map official testnet chain IDs to a mainnet logo, verify RPC/explorer/native currency/icon, determine Bankr, swap, bridge, EIP-7702, or token-paid gas support, or keep the extension and website chain allowlists synchronized.
---

# WalletChan Chain Research

## Workflow

1. Read the repo guidance first when working inside WalletChan:
   - `AGENTS.md`
   - `_docs/ADD_CHAIN.md`
   - `_docs/IMPLEMENTATION.md`
   - `_docs/SWAP.md` when swap support is relevant
   - `_docs/7702.md` when EIP-7702 support is relevant
   - `_docs/GAS_ABSTRACTION.md` for every built-in EVM chain addition, because
     token-paid gas support is an explicit per-chain capability
2. Verify current facts from primary/live sources. Chain support, API support,
   and contract deployments are unstable; do not rely on memory.
3. Run the helper when network access is available:
   ```bash
   node .agents/skills/walletchan-chain-research/scripts/research_chain.mjs \
     --chain-id 4663 \
     --name "Robinhood Chain" \
     --rpc "https://rpc.mainnet.chain.robinhood.com" \
     --testnet-rpc "https://rpc.testnet.chain.robinhood.com"
   ```
   Repeat `--testnet-rpc` for each current official public testnet. The helper
   records only its live `eth_chainId`; WalletChan does not store testnet RPC,
   explorer, currency, or other duplicated metadata in the built-in entry.
   Add `--icon-out apps/extension/public/chainIcons/<name>.<ext>` to download
   the best chain icon. The script chooses the extension from `content-type`
   when possible.
4. Make every downloaded SVG icon notification-safe before finishing the chain
   addition. Chrome's native notification bridge does not reliably render SVG,
   so preserve the SVG for the registry and extension UI, then automatically
   generate its 128x128 PNG counterpart:
   ```bash
   apps/extension/scripts/generate-notification-chain-icons.sh
   ```
   Confirm that
   `apps/extension/public/notificationChainIcons/<same-basename>.png` exists,
   is a valid 128x128 PNG, and is included in `apps/extension/build/` after the
   required extension build. Do not create a duplicate when the downloaded
   chain icon is already a raster format such as PNG or WebP; notifications use
   that bundled raster directly. Treat a missing PNG counterpart for an SVG as
   an incomplete chain addition.
5. Read `references/walletchan-fields.md` before editing code. Use it to map
   verified facts into `apps/extension/src/constants/chainRegistry.ts`, the
   website swap API allowlist, and both Pimlico fee-token catalogs.
6. Treat EIP-7702 separately from “the chain supports type-4 txs”. WalletChan's
   automatic atomic path requires the configured default delegate contract to be
   deployed and non-empty on the chain.
7. Treat Pimlico support as account- and chain-specific live data. Query
   `pimlico_getSupportedTokens` against the exact chain endpoint using the
   developer's server-side key, then confirm each candidate with
   `pimlico_getTokenQuotes`. Never print, commit, or place the key in a command
   argument. A documentation table, token deployment, matching symbol, or
   support on another chain is not sufficient proof. An empty quote result
   means the token must stay unavailable even if static provider docs list it.
8. For every verified fee token, update both exact-address allowlists in the
   same change:
   - `apps/extension/src/chrome/feePayment/tokens.ts` for symbol, decimals,
     stablecoin classification, logo, and safety ceiling
   - `apps/website/app/api/gas/pimlico/[chainId]/tokens.ts` for the public
     proxy's exact chain/address policy
   Keep chain-name comments beside every hardcoded address. Compare normalized
   address sets in tests so either side failing to update is caught. If the
   chain has no live quoteable approved token, leave it native-only.
9. Report uncertainty explicitly. If a source cannot verify a field, leave the
   risky flag false or omit the optional ID instead of guessing.
10. Research current public testnets from the chain operator's documentation and
   verify every candidate with `eth_chainId` when an RPC is available. Add the
   resulting IDs to the mainnet entry's `testnetChainIds` array so custom-added
   testnets reuse its icon and testnet overlay. Exclude local/dev networks and
   deprecated testnets unless retaining an ID preserves existing WalletChan
   behavior; document any retained legacy ID.

## Required Sources

Prefer these sources, in this order:

- RPC: `eth_chainId`, `eth_getCode`, and optionally block samples for type-4 txs.
- Chain-operator network documentation for the set of current public testnets;
  confirm each numeric ID against its live RPC where possible.
- WalletChan/Bungee bridge endpoint: `/api/bridge/chains`.
- 0x official supported-chains docs for Swap API support.
- WalletChan's installed default-delegate deployment registry plus
  `eth_getCode` at `EIP_7702_DEFAULT_DELEGATE` for default 7702 support.
- Pimlico's official ERC-20 paymaster docs for discovery semantics, followed
  by live `pimlico_getSupportedTokens` and `pimlico_getTokenQuotes` calls on
  the exact chain endpoint for actual availability.
- CoinGecko asset platforms and token-list endpoints for `coingeckoPlatformId`.
- GeckoTerminal networks API for `geckoTerminalNetworkId`.
- Chainlist/chainid.network only as secondary metadata, not final support proof.

For 0x, verify the chain by exact chain ID in the **Swap and Gasless APIs**
table and require a checkmark in the **Swap API** column. A chain name or ID
appearing elsewhere on that page is not proof of Swap API support. In
particular, do not infer single-chain swap support from the separate
Cross-Chain API table, token metadata, a marketing page, or historical support.
When the official table is reachable and the chain ID is absent, set swap
support to false.

## Output Checklist

When finishing a chain research task, include:

- Proposed `ChainEntry` values, including explicit true/false support flags.
- Verified `testnetChainIds`, including the reason for any retained legacy ID.
- Which swap/bridge/7702 facts were verified and from where.
- Pimlico discovery result for mainnet and each enabled testnet: exact token
  address, symbol, decimals, whether a live quote was returned, and which
  approved assets were added or intentionally left unavailable.
- Confirmation that extension and website fee-token address sets match for
  every changed chain, including chain-name comments and test coverage.
- Icon source and local UI path, if downloaded. For an SVG, also report the
  generated notification PNG path and its 128x128 validation.
- Files changed and validation commands run.
- Any flags intentionally left false with the reason.
