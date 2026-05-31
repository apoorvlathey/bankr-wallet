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

WalletChan MCP starts a managed local `walletchan-rpc` bridge by default. Before wallet tools can succeed, call `get_pairing_uri` and show the returned WalletConnect URI to the user.

The user pairs it in WalletChan: More -> WalletConnect -> paste.

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

Do not use x402 tools or other Base MCP-specific tools unless WalletChan MCP exposes compatible tools for them.

## Approval Flow

WalletChan does not return a Base Account approval URL. Wallet requests are sent through WalletChan RPC to the WalletChan extension via WalletConnect. The user approves or rejects in the WalletChan popup.

If WalletChan is not paired, call `get_pairing_uri` and show the exact URI to the user. After they pair, retry `get_wallets`.

If a wallet action returns `status: "needs_pairing"` or `errorCode: "walletconnect_disconnected"`, the WalletConnect session was closed or lost. Show the returned `pairingUri` if present, otherwise call `get_pairing_uri`. After the user pairs again, retry the wallet action; if `reprepareRequired` is true, refresh calldata first.

Tell the user to approve in WalletChan, then call `get_request_status` when a request ID is returned.

## Base Plugin Resources

Use `load_base_plugin` or MCP resources to read adapted Base plugin docs. The adapter prepends WalletChan-specific execution rules to the upstream plugin spec. WalletChan MCP can call allowlisted protocol HTTP hosts and pinned protocol CLI runners; other protocol-specific work belongs to the harness or a separate protocol MCP.

Fast path:

1. Supported CLI plugin: `run_base_plugin_cli` -> `send_prepared_calls` or `submitPreparedCalls: true`. Current default runners cover Morpho and Aerodrome.
2. Base swap-style flow: WalletChan MCP `swap`. It uses WalletChan's first-party swap API, adds needed approvals, and sends the final batch to WalletChan.
3. HTTP tx-builder plugin: WalletChan MCP `web_request` for allowlisted hosts -> `send_prepared_calls`. Current default hosts cover Moonwell, Uniswap, Avantis, Bankr discovery, Morpho API hosts, and `walletchan-rpc` default upstream RPC hosts.
4. Allowlisted remote MCP plugin: use `list_remote_mcp_tools` / `call_remote_mcp_tool`. For Virtuals login, use `start_remote_mcp_siwe_login`, wait for WalletChan approval, then call `complete_remote_mcp_siwe_login`. This preserves the exact SIWE challenge; do not manually reconstruct or summarize it.
5. Direct calldata already in hand: `send_prepared_calls` or `send_calls`.

Future Base plugin HTTP hosts can be enabled by MCP configuration. Future CLI-only plugins need a pinned runner profile or a separate protocol MCP; do not run arbitrary shell commands from plugin markdown.

Do not submit prepared calls when the prepare response has error-level warnings, failed simulation, or insufficient-balance messages. WalletChan MCP blocks these submissions by default; only pass `allowWarnings: true` after the user explicitly asks to continue despite the warning.
