# WalletChan MCP

Connect AI agents to WalletChan accounts with popup approval by default, plus scoped delegated execution when you opt in. Works with Claude, Cursor, Codex, and other local MCP clients.

WalletChan MCP is a local Model Context Protocol server that lets an AI assistant prepare wallet actions, route normal requests to a paired wallet for approval, and execute pre-authorized agent flows through signed ERC-7710 delegations. It is designed for the same kind of chat-based onchain workflow as Base MCP, but the normal approval path happens through WalletChan RPC with WalletConnect or MetaMask Connect instead of Base Account.

For the normal `walletconnect` execution profile, nothing moves onchain just because the assistant suggests it: transactions and signatures still require you to review and approve them in the WalletChan popup. For delegated `agent` profiles, you approve a scoped ERC-7710 delegation once, then the local agent can execute only in-scope transactions through that delegation.

## What You Can Do

- Connect your WalletChan extension to an AI assistant via WalletConnect, or connect MetaMask Mobile through MetaMask Connect.
- Check connected wallets and portfolio balances.
- Resolve user-provided names to EVM addresses with WalletChan extension parity: ENS/subdomains, Basenames, WNS `.wei`, GNS `.gwei`, and MegaNames `.mega`.
- Swap and bridge tokens using WalletChan's first-party APIs.
- Send transactions, ERC-5792 batch calls, sequential fallback call sets, and sign messages.
- Create local encrypted agent wallets and choose an execution profile for future delegated/relayed execution while keeping the main-wallet approval path available.
- Delegate scoped permissions from your main WalletChan wallet to 1Shot so an agent can relay in-scope DeFi transactions without a WalletChan popup every time.
- Use one-time WalletChan signature approvals for reusable function-call delegations, so matching contract calls can be consumed later by the agent until the signed scope no longer covers the request.
- Use Base MCP-style DeFi skills when a protocol skill can produce wallet calls for WalletChan approval or delegated agent execution.
- Use Veil Cash on Base through a managed Veil MCP child process, with register/deposit calldata approved by WalletChan.

| Skill     | What It Supports                                                                                         |
| --------- | -------------------------------------------------------------------------------------------------------- |
| Morpho    | Vault discovery and prepared supply/deposit flows.                                                       |
| Moonwell  | Lending market discovery and prepared supply/borrow flows.                                               |
| Aerodrome | Pool discovery, swap/liquidity preparation through supported CLI flows.                                  |
| Uniswap   | Pool and liquidity workflows when the skill returns executable calls.                                    |
| Avantis   | Perps market actions when the skill returns executable calls.                                            |
| Bankr     | Token discovery and supported token actions.                                                             |
| Virtuals  | Agent/token discovery and SIWE login with WalletChan signature approval.                                 |
| Veil      | Local key setup, status/balances, register/deposit preparation, and WalletChan-approved public deposits. |

## Requirements

- Node.js 20.19.0 or newer.
- WalletChan browser extension or any other wallet supporting WalletConnect, or MetaMask Mobile for MetaMask Connect.
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

The assistant should call `get_pairing_uri` and show the pairing result. The response includes a local `pairingUrl` such as `http://127.0.0.1:4209/qr`; open it to scan a browser QR code or copy the raw pairing URI. Clients that render MCP images may also show a QR code directly in chat. WalletConnect URIs start with `wc:`. MetaMask Connect URIs may use a MetaMask deep link or app link.

For WalletConnect with WalletChan:

1. Open the extension.
2. Go to `More -> WalletConnect`.
3. Scan the browser QR, scan the chat QR if your client displayed one, or paste the URI.
4. Approve the pairing.

After pairing, ask:

```text
Show me my connected WalletChan wallets.
```

To switch wallets or force a fresh proposal, ask the assistant to get a new WalletChan pairing URI. The tool supports `forceNewSession: true`; this clears the selected transport session and returns a new QR/URI. The browser QR page also has a fresh URI control, or can be opened with `/qr?force=true`.

To switch the already-running managed RPC to MetaMask Connect without restarting MCP:

```text
get_pairing_uri({ walletTransport: "metamask-connect", forceNewSession: true })
```

To switch back to WalletConnect:

```text
get_pairing_uri({ walletTransport: "walletconnect", forceNewSession: true })
```

For MetaMask Connect account changes, call `get_wallets` after switching accounts in MetaMask Mobile. If the address still has not updated, ask MetaMask Connect to request the account explicitly:

```text
get_pairing_uri({ walletTransport: "metamask-connect", account: "0x...", forceRequest: true })
```

The assistant should report the approved wallet address and chain.

## Name Resolution

WalletChan MCP exposes forward name resolution tools for user-provided recipient or signer inputs:

```text
resolve_name({ name: "vitalik.eth" })
resolve_name({ name: "name.base.eth" })
resolve_name({ name: "name.wei" })
resolve_name({ name: "name.gwei" })
resolve_name({ name: "name.mega" })
```

`resolve_names` resolves a batch. The tools support the same forward-resolution families as the extension: ENS and subdomains, Basenames under `.base.eth`, WNS `.wei`, GNS `.gwei`, and MegaNames `.mega`. They use MCP `--rpc` overrides first for the relevant chain, then WalletChan default RPCs. They do not reverse-resolve addresses, fetch avatars, or silently rewrite transaction inputs; agents should call `resolve_name` explicitly, show the resolved address when useful, then pass the returned `address` into wallet tools.

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

For transactions and signatures, the assistant prepares the request and WalletChan opens a popup when the execution profile is `walletconnect`. Agent profiles use a local agent key plus signed delegations, so in-scope transactions do not open a popup each time.

### Agent Wallets, Delegations, and 1Shot

WalletChan MCP supports three execution profiles:

| Profile                | What happens                                                                                                                                                 |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `walletconnect`        | Uses the paired WalletChan wallet and opens WalletChan popup approval for transactions/signatures.                                                           |
| `agent:<walletId>`     | Uses a local encrypted agent wallet plus signed ERC-7710 delegations from the main wallet, then submits matching calls through the 1Shot relayer.            |
| `agent-eoa:<walletId>` | Signs directly with the raw local agent EOA and broadcasts sequential calls. This bypasses WalletChan popup approval and is only for explicit raw-agent use. |

The delegated `agent` flow does not fund the local agent EOA for normal DeFi actions. The main WalletChan wallet remains the delegator/source account. The agent wallet signs and submits the redelegated permission context, while 1Shot relays the transaction. That is why an unfunded agent EOA can still execute a delegated Morpho deposit from the main wallet when the signed delegation covers the prepared calls.

Create or import an agent wallet:

```text
agent_create_wallet({ label: "Hackathon Agent" })
```

or:

```text
agent_import_wallet({ privateKey: "0x...", label: "Hackathon Agent" })
```

No env setup is required for the normal path. MCP creates a local `vault-secret` file automatically on first use; private keys and signed delegation payloads are encrypted locally and never returned by tools.

Inspect and choose execution profiles:

```text
list_execution_profiles()
set_default_execution_profile({ profileId: "agent:<walletId>" })
get_default_execution_profile()
clear_default_execution_profile()
```

Setting the default to `agent:<walletId>` makes mutating tools try delegated 1Shot execution by default. Use a per-call `executionProfile: "walletconnect"` override when the user wants the normal WalletChan popup path for a specific transaction. Use `agent-eoa:<walletId>` only when the user explicitly wants the raw local agent wallet to spend directly.

For 1Shot delegated DeFi execution, the delegation target must be the 1Shot relayer `targetAddress`. `agent_prepare_delegation` defaults to `delegateMode: "oneshot-relayer"` and resolves the current target automatically:

```text
agent_prepare_delegation({
  walletId: "<walletId>",
  chain: 8453,
  amount: "10",
  label: "Base agent allowance"
})
agent_request_delegation_signature({ delegationId: "<delegationId>" })
```

After the WalletChan popup is approved:

```text
agent_complete_delegation({ delegationId: "<delegationId>" })
set_default_execution_profile({ profileId: "agent:<walletId>" })
```

That first delegation can cover direct token-transfer-style actions, depending on its scope. DeFi protocols usually need more than a token transfer. For example, a Morpho USDC vault deposit may require a USDC approval call and a vault deposit call, so a simple daily USDC transfer scope is not enough.

When a prepared DeFi transaction needs protocol contract calls outside the active delegation, MCP preflights the call bundle and returns a structured request such as `needs_function_call_delegation` / `needs_delegation_signature`. The response includes `prepareDelegationArgs` and often `recommendedNextArgs`. The assistant should use those arguments exactly:

```text
agent_prepare_delegation({ ...prepareDelegationArgs })
agent_request_delegation_signature({ delegationId: "<delegationId>" })
```

After the user approves the one-time WalletChan signature request:

```text
agent_complete_delegation({ ...recommendedNextArgs })
```

This stores a reusable function-call delegation scoped to the prepared targets/selectors, such as USDC `approve` plus a Morpho vault `deposit` selector. Future matching calls can be consumed by the agent without new WalletChan popups until the signed scope, expiry, or configured limits no longer cover the request. If a future transaction targets a different contract or selector, MCP asks for a new scoped delegation instead of silently broadening authority.

Once the `agent` profile is active, these tools can route through the selected profile unless an `executionProfile` override is passed:

- `send_calls`
- `send_prepared_calls`
- `send_transaction`
- `swap`
- `bridge`
- `run_base_plugin_cli({ submitPreparedCalls: true })`

For Base DeFi skill flows, `run_base_plugin_cli` and `send_prepared_calls` treat the delegation `delegator` as the protocol user. Supported CLI write commands automatically bind owner-style arguments such as Morpho `user-address` and Aerodrome `wallet` to the main delegator address, not the local agent EOA. This prevents false insufficient-balance simulations against an unfunded agent wallet.

Confirmed 1Shot submissions always estimate before sending. When 1Shot returns a higher `requiredPaymentAmount`, MCP updates only the ERC-20 `transfer` to the 1Shot fee collector, adds a tiny fee buffer, and re-estimates, preserving protocol approvals/deposits in the bundle. If estimation still fails, MCP returns `status: "estimate_failed"` and does not submit a relayer task.

Use these 1Shot tools directly when debugging or building a custom flow:

- `agent_oneshot_get_capabilities`
- `agent_oneshot_get_fee_data`
- `agent_oneshot_relay_calls`
- `agent_oneshot_get_status`

For x402 hackathon resources, use `agent_x402_quote` and `agent_x402_pay`. The default `agent:<walletId>` path pays through the main wallet's ERC-7710 delegation only when the endpoint advertises `extra.assetTransferMethod: "erc7710"`. x402 requires a separate delegation with `delegateMode: "agent-wallet"` because x402 delegated payment targets the local agent wallet address, not the 1Shot relayer target. Use `agent-eoa:<walletId>` only when the user explicitly wants raw agent-wallet USDC payment.

If `agent_x402_quote` returns `delegatedPaymentSupported: false`, the endpoint cannot be paid through the delegated agent path directly. Do not retry with `agent-eoa` unless you explicitly want to spend the agent wallet's own USDC. For future demos, prefer a WalletChan-owned x402 endpoint that advertises ERC-7710 delegated payment directly.

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
- `list_protocols`, `list_protocol_tools`, and `call_protocol_tool` for managed protocol integrations such as Veil MCP.

WalletChan MCP does not run arbitrary shell commands, proxy arbitrary MCP servers, or call arbitrary web hosts from a skill file.

### Veil Cash

WalletChan MCP can start a managed Veil MCP child process for Veil Cash on Base. Public Veil actions use Veil MCP to prepare calldata, then WalletChan MCP submits that calldata through the existing WalletChan popup approval path.

Useful prompts:

```text
Check my Veil status.
```

```text
Register my WalletChan account with Veil.
```

```text
Prepare a 20 USDC Veil deposit and submit it through WalletChan.
```

Veil key material is managed by Veil MCP locally, not by the WalletChan extension vault. WalletChan MCP launches Veil MCP in a controlled working directory so `.env.veil` and `.veil-x402-receipts.json` are not written into your project or random MCP client launch directories. Override the directory with `WALLETCHAN_MCP_VEIL_DIR`. WalletChan MCP also passes a Base `RPC_URL` to Veil; it is inherited from the global WalletChan MCP Base RPC override (`--rpc base=<url>` or `WALLETCHAN_MCP_RPC_OVERRIDES=base=<url>`) or defaults to `https://base.drpc.org`.

Veil x402 payment submits through the Veil relay and does not open a WalletChan popup. Use `veil_x402_quote` first, then call `veil_pay_x402` with a tight `maxPayment` and `confirm: true` after the user approves the exact spend. WalletChan MCP blocks under-minimum relay attempts before calling Veil: normal withdrawals require at least `0.001 ETH` or `0.01 USDC`, and x402 payments require a supported quote of at least `0.01 USDC`. Other private Veil relay tools such as withdraw, transfer, and UTXO consolidation remain disabled by default; enable them only for explicit user-controlled flows with `WALLETCHAN_MCP_VEIL_PRIVATE_ACTIONS=true`.

If the hosted Veil relay returns `Gas price too high, try again later`, WalletChan MCP surfaces a dedicated error explaining that the relay refused the private withdrawal because Base gas is above the relay cap. WalletChan MCP cannot override that cap with `--rpc base=...`; x402 callers should check for an already-funded payer once, then wait before retrying if none can cover the payment.

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

Start the managed RPC with MetaMask Connect instead of WalletConnect:

```bash
walletchan-mcp --wallet-transport metamask-connect
```

The same default can be set with `WALLETCHAN_MCP_WALLET_TRANSPORT=metamask-connect`.

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

Disable the managed Veil MCP integration:

```bash
walletchan-mcp --disable-veil
```

Use a persistent global Veil MCP binary for faster startup:

```bash
npm install -g @veil-cash/mcp@0.2.1
walletchan-mcp --veil-command veil-mcp
```

Use a dedicated Veil data directory:

```bash
walletchan-mcp --veil-dir ~/.walletchan-mcp/veil
```

Use a dedicated Base RPC for both WalletChan RPC and Veil:

```bash
walletchan-mcp --rpc base=https://your-base-rpc.example
```

Use dedicated RPCs for name resolution:

```bash
walletchan-mcp --chain ethereum --rpc ethereum=https://your-ethereum-rpc.example
walletchan-mcp --chain megaeth --rpc megaeth=https://your-megaeth-rpc.example
```

Ethereum RPC is used for ENS, Basenames, `.wei`, and `.gwei`. MegaETH RPC is used for `.mega`.

Add an extra allowlisted HTTPS host for protocol data:

```bash
walletchan-mcp --allow-web-host api.example.org
```

### Agent Wallet Storage and Recovery

WalletChan MCP can create or import local agent wallets for delegated agent execution work. Agent wallet metadata, private keys, and signed delegation payloads are stored encrypted locally.

No env setup is required for the normal path. On first agent wallet create/import, MCP generates a random `vault-secret` file under the agent-wallet data directory, locks it down with best-effort `0600` permissions, and uses it to encrypt the local key vault. `WALLETCHAN_MCP_AGENT_VAULT_SECRET` and `WALLETCHAN_MCP_AGENT_VAULT_SECRET_FILE` remain advanced overrides for migration/recovery.

Agent wallets are stored under the WalletChan MCP app-data root in an `agent-wallets` directory by default. Override the exact directory with `WALLETCHAN_MCP_AGENT_WALLET_DIR`.

To intentionally forget all local agent wallets/delegations and start fresh, call:

```text
agent_reset_vault({ confirm: true, confirmationText: "RESET_AGENT_VAULT" })
```

This does not require the old vault secret. The next `agent_create_wallet` or `agent_import_wallet` call creates a new local `vault-secret` file automatically.

If an old `agent-wallets.json` exists but the matching vault secret is unavailable, MCP may still list the public wallet metadata. Those agent profiles are marked `locked`, and the effective default falls back to `walletconnect` until you restore the old secret or run `agent_reset_vault`.

Raw agent EOA helpers:

```text
Show the Base USDC balance for my raw agent wallet.
```

```text
Use the raw agent wallet to send this prepared transaction.
```

The raw `agent-eoa` path signs locally and broadcasts directly to the configured chain RPC. It does not open a WalletChan popup, and sequential raw calls are not atomic. Use the `walletconnect` profile whenever the user wants their main WalletChan wallet approval flow.

## Security Model

- WalletChan MCP never receives your main WalletChan private keys or seed phrase. Local agent wallet keys are created or imported into MCP only when you use agent-wallet tools.
- The `walletconnect` profile does not approve transactions by itself. Transaction and signature approval happens in the WalletChan extension.
- The delegated `agent` profile can execute without a per-transaction popup only after the main WalletChan wallet signs an ERC-7710 delegation. Execution remains bounded by the signed delegation scope, target, selectors, expiry, and configured limits.
- Signed delegation payloads are stored encrypted because they authorize future in-scope execution.
- Local agent wallet private keys are encrypted on disk with AES-256-GCM and PBKDF2-SHA256 using the local `vault-secret` file or an advanced env override; no MCP tool returns private keys.
- Raw `agent-eoa` tools sign locally and broadcast directly from the agent wallet. They must only be used when the user explicitly chooses the raw agent wallet.
- Protocol helpers are allowlisted and constrained.
- CLI helpers use pinned packages, structured arguments, no shell execution, timeouts, and output caps.
- `web_request` only supports allowlisted HTTPS hosts.
- `send_prepared_calls` refuses protocol prepare responses with error-level warnings unless the user explicitly chooses to continue.
- Managed protocol integrations run in controlled working directories. Veil `.env.veil` stays in the managed Veil directory unless you override it.
- Veil x402 relay payment requires a quoted cap and explicit confirmation; broader Veil private relay actions are disabled by default because they do not use WalletChan popup approval.

The normal wallet-transport approval path is:

```text
AI assistant -> WalletChan MCP -> local walletchan-rpc -> WalletConnect or MetaMask Connect -> wallet approval UI -> user approval
```

The delegated agent execution path is:

```text
AI assistant -> WalletChan MCP agent profile -> signed ERC-7710 delegation -> 1Shot relayer -> in-scope onchain execution
```

## Troubleshooting

### The assistant cannot find WalletChan tools

Restart or reload your MCP client after adding the config. In Claude Code, run `/mcp`. In Cursor, check Settings -> MCP.

### The assistant shows a pairing URI but pairing does not complete

Make sure your wallet is unlocked, open the returned `pairingUrl` or paste the full raw URI, and approve the pairing in the wallet. If the URI expired, ask the assistant to connect again.

### The assistant does not show a QR code

WalletChan MCP returns a standard MCP image block for WalletConnect and MetaMask Connect pairing URIs, but terminal clients may show only text or an image placeholder. Use the raw URI in the same response as the fallback.

For a scannable QR that does not depend on chat image rendering, open the `pairingUrl` returned by `get_pairing_uri`, usually `http://127.0.0.1:4209/qr`.

### A transaction tool says `needs_pairing`

The selected wallet transport session was closed or expired. Pair again with the URI returned by the tool. For prepared DeFi transactions, ask the assistant to prepare a fresh transaction before resubmitting.

### An old agent wallet still appears

Agent wallet public metadata is stored in `agent-wallets.json`, so it may still be listed after removing an old vault secret. If the matching secret is unavailable, the profile is marked `locked` and does not remain the effective default. To intentionally forget local agent wallets/delegations and start fresh, call:

```text
agent_reset_vault({ confirm: true, confirmationText: "RESET_AGENT_VAULT" })
```

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
