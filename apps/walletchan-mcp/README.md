# WalletChan MCP

Connect AI agents to your existing WalletChan local accounts, with every transaction approved by you. Works with Claude, Cursor, Codex, and other local MCP clients.

WalletChan MCP is a local Model Context Protocol server that lets an AI assistant prepare wallet actions and route them to your WalletChan extension for approval. It is designed for the same kind of chat-based onchain workflow as Base MCP, but approvals happen in WalletChan through WalletConnect instead of Base Account.

Nothing moves onchain just because the assistant suggests it. Transactions and signatures still require you to review and approve them in the WalletChan popup.

## What You Can Do

- Connect your WalletChan extension to an AI assistant via WalletConnect.
- Check connected wallets and portfolio balances.
- Swap and bridge tokens using WalletChan's first-party APIs.
- Send transactions, ERC-5792 batch calls, sequential fallback call sets, and sign messages.
- Use Base MCP-style DeFi skills when a protocol skill can produce wallet calls for WalletChan approval.

| Skill | What It Supports |
| --- | --- |
| Morpho | Vault discovery and prepared supply/deposit flows. |
| Moonwell | Lending market discovery and prepared supply/borrow flows. |
| Aerodrome | Pool discovery, swap/liquidity preparation through supported CLI flows. |
| Uniswap | Pool and liquidity workflows when the skill returns executable calls. |
| Avantis | Perps market actions when the skill returns executable calls. |
| Bankr | Token discovery and supported token actions. |
| Virtuals | Agent/token discovery and SIWE login with WalletChan signature approval. |

## Requirements

- Node.js 18 or newer.
- WalletChan browser extension installed and unlocked.
- An MCP client that supports local stdio MCP servers, such as Claude Desktop, Claude Code, Cursor, or Codex.

WalletChan MCP starts a local `walletchan-rpc` bridge for you. You do not need to run a separate RPC process in normal use.

## Install

Add WalletChan MCP to your MCP client with `npx`:

```json
{
  "mcpServers": {
    "walletchan": {
      "command": "npx",
      "args": ["-y", "@walletchan/mcp"]
    }
  }
}
```

Restart or reload your MCP client after changing its config.

### Claude Desktop

Open Claude Desktop settings, find the developer/MCP configuration file, and add:

```json
{
  "mcpServers": {
    "walletchan": {
      "command": "npx",
      "args": ["-y", "@walletchan/mcp"]
    }
  }
}
```

Restart Claude Desktop. In a new chat, ask:

```text
Connect to WalletChan.
```

### Claude Code

Install globally:

```bash
claude mcp add --scope user walletchan -- npx -y @walletchan/mcp
```

Verify:

```bash
claude mcp list
```

Inside a Claude Code session, `/mcp` should show `walletchan` as active.

### Cursor

Add this to `~/.cursor/mcp.json` for global use, or `.cursor/mcp.json` for one project:

```json
{
  "mcpServers": {
    "walletchan": {
      "command": "npx",
      "args": ["-y", "@walletchan/mcp"]
    }
  }
}
```

Restart Cursor, then open Cursor settings and confirm the WalletChan MCP server is active.

### Codex

Add the local stdio server:

```bash
codex mcp add walletchan -- npx -y @walletchan/mcp
```

Or add it manually to your Codex MCP config:

```toml
[mcp_servers.walletchan]
command = "npx"
args = ["-y", "@walletchan/mcp"]
```

### ChatGPT

ChatGPT custom connectors currently expect remote HTTPS MCP servers. WalletChan MCP is intentionally local because it talks to your local WalletChan extension. Use it with local MCP clients such as Claude Desktop, Claude Code, Cursor, or Codex unless you intentionally run your own private MCP relay.

## First Connection

After installation, ask your assistant:

```text
Connect to WalletChan.
```

The assistant should call `get_pairing_uri` and show the pairing result. The response includes a local `pairingUrl` such as `http://127.0.0.1:4209/qr`; open it to scan a browser QR code or copy the WalletConnect URI. Clients that render MCP images may also show a QR code directly in chat. The response still includes a WalletConnect URI that starts with `wc:` as the raw paste fallback.

In WalletChan:

1. Open the extension.
2. Go to `More -> WalletConnect`.
3. Scan the browser QR, scan the chat QR if your client displayed one, or paste the URI.
4. Approve the pairing.

After pairing, ask:

```text
Show me my connected WalletChan wallets.
```

The assistant should report the approved wallet address and chain.

## Try It

Once connected, try prompts like:

```text
What's my USDC balance on Base?
```

```text
Swap 5 USDC to ETH on Base with WalletChan.
```

```text
Bridge 0.01 ETH from Base to Ethereum with WalletChan.
```

```text
Find USDC vault options on Morpho Base, then prepare a 1 USDC deposit into the vault I choose.
```

```text
Sign in to Virtuals with my WalletChan wallet.
```

For transactions and signatures, the assistant prepares the request and WalletChan opens a popup. Review the details there and approve or reject.

## How Base MCP-Style Skills Work

WalletChan MCP includes skill resources and tool adapters for Base MCP-style plugin workflows.

When a Base skill says to use Base MCP wallet tools such as `send_calls`, `sign`, or an approval URL, the assistant should use WalletChan MCP tools instead:

- Base `send_calls` -> WalletChan `send_calls`
- Prepared protocol transaction response -> WalletChan `send_prepared_calls`
- Base `sign` -> WalletChan `sign` or `sign_siwe`
- Base approval link -> WalletChan popup approval

Some protocol skills fetch data from protocol APIs, run protocol CLIs, or call protocol MCP servers. WalletChan MCP provides narrow, allowlisted helpers for common cases:

- `web_request` for allowlisted HTTPS protocol APIs.
- `run_base_plugin_cli` for pinned protocol CLIs such as Morpho and Aerodrome.
- `list_remote_mcp_tools` and `call_remote_mcp_tool` for allowlisted remote protocol MCP profiles.
- `start_remote_mcp_siwe_login` and `complete_remote_mcp_siwe_login` for SIWE login flows that must preserve the exact challenge message.

WalletChan MCP does not run arbitrary shell commands, proxy arbitrary MCP servers, or call arbitrary web hosts from a skill file.

## Advanced Configuration

By default WalletChan MCP:

- starts a managed `walletchan-rpc` child process;
- listens on `http://127.0.0.1:4209`;
- uses Base as the default chain;
- uses WalletChan's first-party API at `https://walletchan.com/api`.

Use an existing RPC bridge instead of the managed child process:

```bash
walletchan-mcp --no-managed-rpc --rpc-url http://127.0.0.1:4209
```

Expose more chains to WalletChan RPC:

```bash
walletchan-mcp --chain base --chain ethereum --chain polygon
```

Use a different local RPC port:

```bash
walletchan-mcp --rpc-url http://127.0.0.1:4210
```

Bind the managed RPC to all interfaces inside an isolated container while Docker publishes the port only to host loopback:

```bash
walletchan-mcp --rpc-host 0.0.0.0
```

Disable protocol helper surfaces:

```bash
walletchan-mcp --disable-plugin-cli --disable-web-request
```

Add an extra allowlisted HTTPS host for protocol data:

```bash
walletchan-mcp --allow-web-host api.example.org
```

## Security Model

- WalletChan MCP never receives your private keys or seed phrase.
- WalletChan MCP does not approve transactions by itself.
- Transaction and signature approval happens in the WalletChan extension.
- Protocol helpers are allowlisted and constrained.
- CLI helpers use pinned packages, structured arguments, no shell execution, timeouts, and output caps.
- `web_request` only supports allowlisted HTTPS hosts.
- `send_prepared_calls` refuses protocol prepare responses with error-level warnings unless the user explicitly chooses to continue.

The approval path is:

```text
AI assistant -> WalletChan MCP -> local walletchan-rpc -> WalletConnect -> WalletChan popup -> user approval
```

## Troubleshooting

### The assistant cannot find WalletChan tools

Restart or reload your MCP client after adding the config. In Claude Code, run `/mcp`. In Cursor, check Settings -> MCP.

### The assistant shows a WalletConnect URI but pairing does not complete

Make sure your wallet is unlocked, open the returned `pairingUrl` or paste the full `wc:` URI, and approve the pairing in the wallet. If the URI expired, ask the assistant to connect again.

### The assistant does not show a QR code

WalletChan MCP returns a standard MCP image block for the pairing QR when a `wc:` URI is available, but terminal clients may show only text or an image placeholder. Use the `wc:` URI in the same response: WalletChan -> More -> WalletConnect -> paste.

For a scannable QR that does not depend on chat image rendering, open the `pairingUrl` returned by `get_pairing_uri`, usually `http://127.0.0.1:4209/qr`.

### A transaction tool says `needs_pairing`

The WalletConnect session was closed or expired. Pair again with the URI returned by the tool. For prepared DeFi transactions, ask the assistant to prepare a fresh transaction before resubmitting.

### A protocol skill cannot fetch data

Some DeFi skills depend on external protocol APIs, protocol CLIs, or remote MCP servers. WalletChan MCP includes allowlisted helpers for common Base skill patterns, but it intentionally does not provide arbitrary network or shell access. If a future skill needs a new host, CLI runner, or MCP profile, it should be added explicitly.

## Local Development

From this repository:

```bash
pnpm build:walletchan-mcp
```

Use the built local server:

```json
{
  "mcpServers": {
    "walletchan": {
      "command": "node",
      "args": ["/path/to/walletchan/apps/walletchan-mcp/dist/index.js"]
    }
  }
}
```

For local iteration:

```bash
pnpm dev:walletchan-mcp
```
