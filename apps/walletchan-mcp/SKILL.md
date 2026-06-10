---
name: walletchan-mcp
description: Use when interacting with WalletChan through MCP tools backed by the local WalletChan RPC server, including Base MCP-style DeFi plugins that prepare unsigned calls.
---

# WalletChan MCP

WalletChan MCP is a local MCP adapter for WalletChan RPC. It lets agents use Base MCP-style DeFi skill plugins while sending wallet actions to WalletChan instead of Base Account.

## Setup

Start this MCP server in your MCP client:

```bash
npx @walletchan/mcp
```

WalletChan MCP starts a managed local `walletchan-rpc` bridge by default. Before wallet tools can succeed, call `get_pairing_uri` and show the returned `pairingUrl` or WalletConnect URI to the user. `pairingUrl` opens the local RPC browser QR page, normally `/qr`. If the client renders MCP image content, the tool response may also include a QR code image; the URI remains the raw fallback.

The user pairs a wallet by scanning the browser QR or pasting the URI in any WalletConnect-capable wallet.

## Tool Mapping

When an upstream Base MCP plugin says:

- `get_wallets` before pairing -> first call WalletChan MCP `get_pairing_uri`
- `get_wallets` -> use WalletChan MCP `get_wallets`
- `send_calls` -> use WalletChan MCP `send_calls`
- prepared transaction responses -> prefer WalletChan MCP `send_prepared_calls` instead of manually mapping common `transactions[]`, `calls[]`, approval+action, or `{ data: { to, value, data } }` shapes
- Base MCP `swap` or user swap requests -> use WalletChan MCP `swap`; use `get_swap_price` first only when the user asks for a quote/preview
- portfolio/balance requests -> use WalletChan MCP `get_portfolio_balances`
- bridge requests -> use WalletChan MCP `get_bridge_quote`, `bridge`, and `get_bridge_status`
- `get_request_status` -> use WalletChan MCP `get_request_status`
- `sign` -> use WalletChan MCP `sign`; for SIWE/EIP-4361 auth challenges, prefer `sign_siwe`
- `web_request` or external API instructions -> use WalletChan MCP `web_request` first when the target host is allowlisted; otherwise use the harness' web/fetch tooling or a protocol MCP.
- CLI-capable plugin paths such as `npx @morpho-org/cli@latest ...` -> use WalletChan MCP `run_base_plugin_cli` first when `list_base_plugin_runners` shows a supported runner; otherwise use the harness shell/terminal or a protocol MCP.
- remote MCP plugin paths such as Virtuals MCP -> use WalletChan MCP `list_remote_mcp_tools`, `call_remote_mcp_tool`, and the remote SIWE login helpers when the protocol profile is allowlisted. If no profile exists, use the harness' configured MCP connector.
- managed protocol integrations such as Veil MCP -> use WalletChan MCP `list_protocols`, first-class `veil_*` tools, or `call_protocol_tool` for raw allowlisted protocol tools.

Do not use x402 tools or other Base MCP-specific tools unless WalletChan MCP exposes compatible tools for them.

## Approval Flow

WalletChan does not return a Base Account approval URL. Wallet requests are sent through WalletChan RPC to the WalletChan extension via WalletConnect. The user approves or rejects in the WalletChan popup.

If WalletChan is not paired, call `get_pairing_uri` and show the `pairingUrl` to the user when present. If a QR image appears in chat, the user can scan it instead; otherwise they can paste the exact `pairingUri`. After they pair, retry `get_wallets`.

To switch wallets or force a fresh WalletConnect proposal, call `get_pairing_uri` with `forceNewSession: true` and show the returned QR/URI. The local QR page can also force a fresh URI at `/qr?force=true`.

If a wallet action returns `status: "needs_pairing"` or `errorCode: "walletconnect_disconnected"`, the WalletConnect session was closed or lost. Show the returned `pairingUrl` or `pairingUri` if present, otherwise call `get_pairing_uri`; use the QR image too when the client displays one. After the user pairs again, retry the wallet action; if `reprepareRequired` is true, refresh calldata first.

Tell the user to approve in WalletChan, then call `get_request_status` when a request ID is returned. If the paired wallet does not support ERC-5792 batching, `send_calls`, `send_prepared_calls`, `swap`, and `bridge` still work by sending each call as an individual transaction and waiting for each receipt before the next prompt.

## Base Plugin Resources

Use `load_base_plugin` or MCP resources to read adapted Base plugin docs. The adapter prepends WalletChan-specific execution rules to the upstream plugin spec. WalletChan MCP can call allowlisted protocol HTTP hosts and pinned protocol CLI runners; other protocol-specific work belongs to the harness or a separate protocol MCP.

Fast path:

1. Supported CLI plugin: `run_base_plugin_cli` -> `send_prepared_calls` or `submitPreparedCalls: true`. Current default runners cover Morpho and Aerodrome.
2. Base swap-style flow: WalletChan MCP `swap`. It uses WalletChan's first-party swap API, adds needed approvals, and sends the final call set to WalletChan.
3. HTTP tx-builder plugin: WalletChan MCP `web_request` for allowlisted hosts -> `send_prepared_calls`. Current default hosts cover Moonwell, Uniswap, Avantis, Bankr discovery, Morpho API hosts, and `walletchan-rpc` default upstream RPC hosts.
4. Allowlisted remote MCP plugin: use `list_remote_mcp_tools` / `call_remote_mcp_tool`. For Virtuals login, use `start_remote_mcp_siwe_login`, wait for WalletChan approval, then call `complete_remote_mcp_siwe_login`. This preserves the exact SIWE challenge; do not manually reconstruct or summarize it.
5. Managed protocol integration: use first-class tools such as `veil_status`, `veil_prepare_register`, and `veil_prepare_deposit`. For Veil public register/deposit, pass `submitPreparedCalls: true` only after the user wants WalletChan to submit the prepared calldata.
6. Direct calldata already in hand: `send_prepared_calls` or `send_calls`.

Future Base plugin HTTP hosts can be enabled by MCP configuration. Future CLI-only plugins need a pinned runner profile or a separate protocol MCP; do not run arbitrary shell commands from plugin markdown.

Do not submit prepared calls when the prepare response has error-level warnings, failed simulation, or insufficient-balance messages. WalletChan MCP blocks these submissions by default; only pass `allowWarnings: true` after the user explicitly asks to continue despite the warning.

## Veil Cash

For Veil Cash, read `walletchan://veil-mcp/SKILL.md` or `walletchan://veil-mcp/plugins/veil.md`.

Veil MCP is launched in a controlled WalletChan MCP data directory so `.env.veil` and `.veil-x402-receipts.json` are not written to the current project or MCP client launch directory. Veil key material is local to Veil MCP and is not stored in the WalletChan browser extension vault.

Use:

- `veil_status` to inspect key/relay/registration status
- `veil_init_keypair` when no managed Veil key exists
- `veil_prepare_register({ submitPreparedCalls: true })` to register through WalletChan approval
- `veil_prepare_deposit({ asset, amount, submitPreparedCalls: true })` to deposit through WalletChan approval

Veil x402 payment submits through the Veil relay and does not open a WalletChan popup. Use it only after `veil_x402_quote`, with a tight `maxPayment` and `confirm: true` after explicit user approval. Broader relay-backed tools such as withdraw, transfer, and consolidation stay disabled unless the MCP server explicitly enables them.

WalletChan MCP preflights Veil relay minimums before calling the Veil relay. Normal withdrawals require at least `0.001 ETH` or `0.01 USDC`. x402 payments quote first; if the supported quote is below `0.01 USDC`, do not retry `veil_pay_x402` with payer indexes or `forceFresh`.

If a Veil private relay action returns `Gas price too high, try again later`, the hosted Veil relay is refusing submission because Base gas is above its relay cap. It is not fixed by changing WalletChan's Base RPC. Do not retry immediately; for x402, inspect payer balances once and only retry with a funded `payerIndex` if one has enough USDC.
