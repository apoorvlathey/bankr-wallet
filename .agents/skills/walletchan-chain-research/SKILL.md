---
name: walletchan-chain-research
description: Research and verify EVM chain metadata and notification-safe icon assets for WalletChan chain additions or updates. Use when Codex is asked to add a new WalletChan chain, update chain params, map official testnet chain IDs to a mainnet logo, verify RPC/explorer/native currency/icon, determine Bankr support, Safe multisig account support, 0x swap support, Bungee/Socket bridge support, CoinGecko/GeckoTerminal IDs, or MetaMask EIP-7702 default delegate support.
---

# WalletChan Chain Research

## Workflow

1. Read the repo guidance first when working inside WalletChan:
   - `AGENTS.md`
   - `_docs/ADD_CHAIN.md`
   - `_docs/IMPLEMENTATION.md`
   - `_docs/SWAP.md` when swap support is relevant
   - `_docs/7702.md` when EIP-7702 support is relevant
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
   verified facts into `apps/extension/src/constants/chainRegistry.ts` and the
   website swap API allowlist.
6. Treat EIP-7702 separately from “the chain supports type-4 txs”. WalletChan's
   automatic atomic path requires the configured default delegate contract to be
   deployed and non-empty on the chain.
7. Treat Safe support as a live capability, not a WalletChan chain-registry
   flag. Match the exact numeric chain ID in Safe's Config Service and require
   a valid official Transaction Service URL. Separately confirm that the chain
   is EVM-compatible for WalletChan's Safe integration. Safe lists zkSync Era
   (324), but WalletChan deliberately excludes it because Safe documents its
   deployment as non-EVM-compatible. Do not infer Safe support from contract
   deployment addresses, a Safe brand mention, or another chain in the same
   ecosystem.
8. Report uncertainty explicitly. If a source cannot verify a field, leave the
   risky flag false or omit the optional ID instead of guessing.
9. Research current public testnets from the chain operator's documentation and
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
- Safe Config Service: exact chain ID in
  `https://safe-config.safe.global/api/v1/chains/?limit=100`, plus the official
  Safe supported-networks and multi-chain-deployment documentation for EVM
  compatibility. Require the Transaction Service to remain under the exact
  `https://api.safe.global/tx-service/*` boundary.
- 0x official supported-chains docs for Swap API support.
- `@metamask/delegation-deployments` plus `eth_getCode` at WalletChan's
  `EIP_7702_DEFAULT_DELEGATE` for default 7702 support.
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
- Safe account support: exact Config Service match, official Transaction
  Service URL, recommended singleton version, and any WalletChan EVM exclusion.
- Icon source and local UI path, if downloaded. For an SVG, also report the
  generated notification PNG path and its 128x128 validation.
- Files changed and validation commands run.
- Any flags intentionally left false with the reason.
