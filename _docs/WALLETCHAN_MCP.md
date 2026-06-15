# WalletChan MCP Implementation

## Overview

`apps/walletchan-mcp` is a local stdio MCP server that adapts WalletChan RPC and selected Base MCP-style DeFi skill instructions into a chat-agent tool surface.

The design goal is:

- keep the MCP runtime local and chat-client agnostic
- reuse the growing Base MCP skill/plugin markdown ecosystem
- replace Base Account approval links with WalletChan popup approvals
- start and manage `walletchan-rpc` automatically by default

For `walletconnect` profiles, the MCP server never signs directly. It sends JSON-RPC requests to `walletchan-rpc`, which forwards transaction/signature requests to WalletChan over WalletConnect. Local `agent` and `agent-eoa` profiles are different: MCP stores an encrypted agent wallet key, uses it to sign ERC-7710 redelegations or raw agent EOA transactions, and never exposes the private key through tools.

Detailed agent/delegation docs live under `_docs/walletchan-mcp/`:

- `_docs/walletchan-mcp/HACKATHON_NOTES.md`
- `_docs/walletchan-mcp/AGENT_WALLETS.md`
- `_docs/walletchan-mcp/X402_DELEGATED_PAYMENTS.md`
- `_docs/walletchan-mcp/BASE_SKILLS_AND_PROTOCOLS.md`

## Source Map

| File | Responsibility |
|---|---|
| `apps/walletchan-mcp/src/index.ts` | CLI entrypoint, dependency wiring, shutdown lifecycle |
| `apps/walletchan-mcp/src/cli.ts` | CLI/env parsing for RPC URL, managed RPC, chain config, and timeouts |
| `apps/walletchan-mcp/src/mcpServer.ts` | Minimal newline-delimited stdio MCP JSON-RPC server |
| `apps/walletchan-mcp/src/tools.ts` | MCP tool definitions and tool call implementations |
| `apps/walletchan-mcp/src/rpcClient.ts` | HTTP JSON-RPC client for `walletchan-rpc` |
| `apps/walletchan-mcp/src/managedRpc.ts` | Optional child-process manager for `walletchan-rpc` |
| `apps/walletchan-mcp/src/requestTracker.ts` | Async status tracking for single tx/signature requests |
| `apps/walletchan-mcp/src/agentWallets.ts` | Local encrypted agent wallet vault and execution-profile state |
| `apps/walletchan-mcp/src/agentDelegation.ts` | MetaMask Smart Accounts Kit delegation preparation, typed-data payload construction, and signature verification |
| `apps/walletchan-mcp/src/agentEoaExecutor.ts` | Raw local agent EOA balance reads and direct signing/broadcast helpers |
| `apps/walletchan-mcp/src/oneShotRelayer.ts` | 1Shot public relayer JSON-RPC adapter for ERC-7710 delegated execution |
| `apps/walletchan-mcp/src/agentX402.ts` | Agent x402 buyer flow using MetaMask ERC-7710 delegation by default, with explicit raw `agent-eoa` fallback |
| `apps/walletchan-mcp/src/baseSkills.ts` | WalletChan skill resource and adapted upstream Base skill resources |
| `apps/walletchan-mcp/src/basePluginCli.ts` | Pinned, allowlisted protocol CLI runners for Base plugin flows |
| `apps/walletchan-mcp/src/remoteMcp.ts` | Allowlisted remote protocol MCP proxy profiles such as Virtuals ACP |
| `apps/walletchan-mcp/src/protocols/` | Modular protocol integration runtime for managed MCPs, CLIs, HTTP APIs, SDK adapters, and related wrappers |
| `apps/walletchan-mcp/src/protocols/stdioMcpClient.ts` | Generic newline-delimited MCP-over-stdio child-process client |
| `apps/walletchan-mcp/src/protocols/localData.ts` | OS app-data directory resolution for protocol working directories |
| `apps/walletchan-mcp/src/protocols/veil/` | Veil MCP profile, controlled env/cwd policy, and first-class Veil tool definitions |
| `apps/walletchan-mcp/src/siwe.ts` | MCP-side EIP-4361/SIWE validation and exact-message preparation |
| `apps/walletchan-mcp/src/walletchanApi.ts` | First-party WalletChan API client for portfolio, swap, and bridge |
| `apps/walletchan-mcp/src/walletchanActions.ts` | Portfolio/swap/bridge tool orchestration and approval-call preparation |
| `apps/walletchan-mcp/src/walletchanActionHelpers.ts` | Shared portfolio filtering, route selection, warning, and input helpers |
| `apps/walletchan-mcp/src/walletchanTokens.ts` | WalletChan token-list resolution and human amount parsing for swap/bridge |
| `apps/walletchan-mcp/src/evmEncoding.ts` | Minimal ERC-20/Permit2 calldata and amount encoding helpers |
| `apps/walletchan-mcp/src/webRequest.ts` | Allowlisted HTTPS protocol API request helper |
| `apps/walletchan-mcp/src/walletchanRpcDefaults.ts` | Default upstream RPC URLs/hosts mirrored from `walletchan-rpc` |
| `apps/walletchan-mcp/src/chains.ts` | Chain parsing/formatting helpers for MCP-side validation |

## Runtime Flow

1. `index.ts` parses CLI args and environment variables.
2. A `WalletChanRpcClient` is created for `--rpc-url`, defaulting to `http://127.0.0.1:4209`.
3. A `ManagedRpcProcess` is created unless `--no-managed-rpc` or `WALLETCHAN_MCP_MANAGED_RPC=false` disables it.
4. `RequestTracker` tracks async single-transaction and signature requests because those RPC calls block until the user approves or rejects.
5. `WalletChanTools` exposes MCP tools backed by the RPC client, managed RPC, request tracker, and Base skill loader.
6. `McpServer` listens on stdin, writes JSON-RPC responses to stdout, and writes logs/errors only to stderr.

MCP stdout must stay clean JSON. Child `walletchan-rpc` stdout/stderr are piped to the parent stderr so they cannot corrupt the MCP protocol stream.

## MCP Protocol Surface

The server implements the stdio MCP JSON-RPC methods needed by current clients:

| MCP method | Behavior |
|---|---|
| `initialize` | Returns protocol `2025-06-18`, server title `WalletChan`, tool/resource capabilities, and pairing instructions |
| `notifications/initialized` | No-op |
| `notifications/cancelled` | No-op |
| `ping` | Returns `{}` |
| `tools/list` | Returns the WalletChan tool set with `title`, `description`, and JSON schemas |
| `tools/call` | Executes a tool and returns `structuredContent`; when a WalletConnect pairing QR is available, the PNG image content block is returned before the text fallback |
| `resources/list` | Lists WalletChan skill and adapted Base plugin resources |
| `resources/read` | Reads WalletChan skill markdown or fetches upstream Base markdown with overrides |
| `resources/templates/list` | Returns no templates |
| `prompts/list` | Returns no prompts |

The current implementation uses newline-delimited JSON messages over stdio.

`tools/call` always returns object-shaped `structuredContent` for MCP client compatibility. Tool results that are already plain objects are passed through; primitive or array results from managed protocol children are wrapped as `{ result: ... }`. The text content block still contains the human-readable raw result.

## Tool Surface

| Tool | Backing behavior |
|---|---|
| `get_pairing_uri` | Starts or inspects managed `walletchan-rpc`; returns WalletConnect URI and local `/qr` QR page when pairing is needed, with an MCP image block containing a QR code for clients that render tool images |
| `get_wallets` | Ensures RPC is started, reads `/health` and `eth_accounts`, optionally validates a chain |
| `list_execution_profiles`, `get_default_execution_profile`, `set_default_execution_profile`, `clear_default_execution_profile` | Manage local MCP execution-profile preference. `walletconnect` is the existing WalletChan popup path; `agent:<walletId>` and `agent-eoa:<walletId>` are local agent wallet profiles. |
| `agent_create_wallet`, `agent_import_wallet`, `agent_list_wallets`, `agent_get_wallet`, `agent_delete_wallet`, `agent_reset_vault` | Manage local encrypted agent wallet metadata and key material. Tools return addresses/profile IDs only, never private keys. `agent_reset_vault` forgets local agent state without decrypting, for explicit fresh-start flows. |
| `agent_prepare_delegation`, `agent_request_delegation_signature`, `agent_complete_delegation`, `agent_list_delegations`, `agent_get_delegation`, `agent_delete_delegation` | Create and store ERC-7710 delegation sessions. `agent_prepare_delegation` defaults to `delegateMode: "oneshot-relayer"` and resolves the current 1Shot `targetAddress` automatically; use `delegateMode: "agent-wallet"` for delegated x402. Signature requests go through the existing WalletChan typed-data popup; signed delegation payloads are encrypted in the local agent vault. |
| `agent_oneshot_get_capabilities`, `agent_oneshot_get_fee_data`, `agent_oneshot_relay_calls`, `agent_oneshot_get_status` | 1Shot public relayer integration for ERC-7710 delegated calls. Relay calls automatically prefer an active delegation whose `delegate` matches the relayer `targetAddress`. If the active delegation scope cannot authorize prepared DeFi calls, the relay path returns `needs_function_call_delegation` with `prepareDelegationArgs` for a scoped function-call delegation. Confirmed submissions estimate first, update only the fee transfer when 1Shot returns a different required payment amount, add a tiny fee buffer, and stop with `estimate_failed` instead of submitting when estimation fails. |
| `agent_x402_quote`, `agent_x402_pay` | x402 resource probe/pay flow. `agent:<walletId>` consumes the main wallet's ERC-7710 delegation when the endpoint advertises `assetTransferMethod: "erc7710"`; `agent-eoa:<walletId>` is the explicit raw agent-wallet fallback. |
| `agent_eoa_get_balance`, `agent_eoa_send_transaction`, `agent_eoa_send_calls` | Raw local agent EOA balance reads and direct local signing/broadcast. This bypasses WalletChan popup approval and is intended for explicit raw-agent use, funding checks, and fallback/debug paths. |
| `send_calls` | Routes calls by `executionProfile` or stored default. `walletconnect` submits to `walletchan-rpc`; `agent` submits via 1Shot; `agent-eoa` signs/broadcasts locally. |
| `send_prepared_calls` | Extracts calls from common Base plugin prepare-response shapes and routes them through the same selected execution profile |
| `get_portfolio_balances` | Fetches first-party WalletChan portfolio balances for an address or connected account |
| `get_swap_price` | Fetches an indicative first-party WalletChan swap price |
| `swap` | Quotes a swap, adds required ERC-20/Permit2 approvals, and routes the prepared calls through the selected execution profile |
| `get_bridge_quote` | Fetches a first-party WalletChan bridge quote |
| `bridge` | Quotes a bridge, builds required approval + bridge calls, and routes the prepared calls through the selected execution profile |
| `get_bridge_status` | Fetches bridge status by Bungee request hash or source transaction hash |
| `web_request` | Calls allowlisted HTTPS protocol APIs from the local MCP process |
| `run_base_plugin_cli` | Runs pinned, allowlisted protocol CLI commands such as Morpho CLI and Aerodrome Sugar SDK |
| `list_base_plugin_runners` | Lists supported protocol CLI runners, commands, and structured argument names |
| `list_remote_mcp_tools` | Lists tools from an allowlisted protocol MCP profile such as Virtuals |
| `call_remote_mcp_tool` | Calls non-login tools on an allowlisted protocol MCP profile |
| `start_remote_mcp_siwe_login` | Starts an allowlisted remote MCP SIWE login and opens WalletChan signature approval for the exact challenge |
| `complete_remote_mcp_siwe_login` | Completes an allowlisted remote MCP SIWE login after WalletChan signature approval |
| `list_protocols` | Lists managed protocol integrations such as Veil MCP |
| `list_protocol_tools` | Lists raw tools exposed by a managed protocol integration |
| `call_protocol_tool` | Calls raw allowlisted protocol tools; first-class wrappers are preferred |
| `veil_status`, `veil_init_keypair`, `veil_get_balances`, `veil_deposit_status`, `veil_wait_for_deposit` | Veil read/setup/status flows through a managed Veil MCP child |
| `veil_prepare_register`, `veil_prepare_deposit` | Veil public Base calldata preparation; `submitPreparedCalls: true` submits the prepared calls through WalletChan |
| `veil_x402_quote`, `veil_x402_receipts`, `veil_x402_payer_balances`, `veil_subaccount_status` | Veil read-only x402/subaccount helpers |
| `veil_pay_x402` | Veil private x402 payment through the Veil relay; requires `maxPayment` and `confirm: true` after explicit user approval |
| `sign_siwe` | Validates an EIP-4361 SIWE message, then signs the exact message through WalletChan |
| `get_request_status` | Reads local async request status or calls `wallet_getCallsStatus` |
| `sign` | Starts `personal_sign`, `eth_signTypedData_v3`, or `eth_signTypedData_v4` through RPC |
| `send_transaction` | Routes a single transaction through `walletconnect`, `agent`, or `agent-eoa` |
| `load_base_plugin` | Fetches upstream Base plugin markdown and prepends WalletChan execution rules |
| `list_skill_resources` | Lists MCP resources exposed by `baseSkills.ts` |

`send_calls` returns the bundle ID from WalletChan RPC. `sign` and `send_transaction` return a local `walletchan-<uuid>` request ID immediately; the underlying RPC call resolves later when the user approves or rejects in WalletChan.

### WalletConnect Disconnect Recovery

WalletChan MCP treats a closed/lost WalletConnect session as a recoverable tool state, not a generic MCP failure. When `walletchan-rpc` reports JSON-RPC `4900`, when approved accounts disappear, or when a request fails with a WalletConnect session/topic error, wallet-action tools return structured content like:

```json
{
  "status": "needs_pairing",
  "errorCode": "walletconnect_disconnected",
  "needsPairing": true,
  "pairingUri": "wc:...",
  "pairingUrl": "http://127.0.0.1:4209/qr",
  "recommendedNextTool": "get_pairing_uri",
  "retryAfterPairingTool": "send_prepared_calls",
  "reprepareRequired": true
}
```

The harness should show `pairingUrl` when present so the user can open a browser QR page, or show `pairingUri` directly when a link is not usable. If neither is present, call `get_pairing_uri`. Tool responses that include a `pairingUri` also include a standard MCP `image` content block with a PNG QR code when generation succeeds. Clients that render MCP images can show the QR directly; terminal clients may still show only a placeholder, so `/qr` and the raw `wc:` URI remain the reliable fallbacks. After the user pairs a wallet again, retry the action. If `reprepareRequired` is true, rebuild or re-fetch prepared calldata first because quotes, simulations, and nonces can go stale.

`get_wallets` also reports `status: "needs_pairing"` / `needsPairing: true` when the RPC process is running but no approved WalletConnect account is available. `get_request_status` applies the same recovery shape for async signature/transaction requests that failed after the initial tool call returned a request ID.

`send_prepared_calls` is the main speed path for Base plugins. It accepts already-prepared output from a harness-run protocol API request, harness-run protocol CLI, or harness-configured protocol MCP prepare tool and extracts calls from these common shapes:

- `transactions[]`
- `calls[]`
- `{ data: { to, value, data } }`
- approval/action objects such as Uniswap `approval` + `swap`
- wrapper objects where the plugin payload is nested under `body`

Use `previewOnly: true` to inspect the normalized call list without sending it.

Mutating tools accept `executionProfile` (or `profileId`) to override the stored default for a single call. `walletconnect` preserves the existing WalletChan popup path. `agent:<walletId>` submits delegated calls through 1Shot with the active delegation for that agent wallet and chain. `agent-eoa:<walletId>` signs locally with the agent wallet private key and broadcasts calls sequentially; this path is not atomic.

For delegated `agent` execution, the protocol account is the delegation `delegator` main wallet, not the local agent EOA address. `run_base_plugin_cli` write commands automatically default or rewrite owner-style arguments such as Morpho `user-address` and Aerodrome `wallet` to that delegator before preparing/simulating calldata. If a delegated-agent prepare command is explicitly pointed at an unrelated address, MCP refuses it because 1Shot cannot spend from that account through the stored delegation. Use `agent-eoa` only when the raw agent wallet itself should be the protocol user and source of funds.

ERC-20 transfer scopes are only sufficient for direct token transfer-style actions. DeFi flows such as Morpho deposits include protocol calls such as token approval and vault deposit, so delegated `agent` submission preflights the prepared call bundle against active 1Shot delegations. If no reusable function-call delegation covers the call targets/selectors, MCP prepares the correct 1Shot relayer delegation, opens the WalletChan signature request, and stores the original action as a short-lived pending action. After approval, `agent_complete_delegation` can submit that pending action automatically.

Before submitting through 1Shot, MCP calls `relayer_estimate7710Transaction`. If the estimate returns a new `requiredPaymentAmount`, MCP rewrites only the ERC-20 `transfer(feeCollector, amount)` execution that pays 1Shot and re-estimates; protocol token calls such as Morpho approvals must be preserved. The rewritten payment uses `requiredPaymentAmount` plus a small buffer so 1-unit relayer-side price drift does not fail the task. If estimation still returns `success: false`, MCP returns `status: "estimate_failed"` and does not call `relayer_send7710Transaction`.

Actual submission is blocked by default when the prepared response contains error-level warnings such as failed simulation or insufficient balance. Callers can pass `allowWarnings: true`, but only after the user explicitly asks to continue despite the warning.

When `atomicRequired` is omitted, MCP submits batches with the Base-like atomic default first. If WalletChan rejects before opening a popup because the active account does not support atomic multi-call execution, MCP retries once with `atomicRequired: false`. This keeps prepared DeFi flows usable for WalletChan account types that do not have a 7702 delegate configured. If a caller explicitly sets `atomicRequired: true`, MCP does not override it.

### First-Party WalletChan Tools

`get_portfolio_balances`, `get_swap_price`, `swap`, `get_bridge_quote`, `bridge`, and `get_bridge_status` call the same first-party WalletChan API surface used by the extension. The default API base is `https://walletchan.com/api`; local website API development can override it with `--api-base` or `WALLETCHAN_MCP_API_BASE`.

`swap` resolves token symbols from the WalletChan swap token list when possible, fetches both the indicative price and firm quote, checks current ERC-20 and Permit2 allowance through `walletchan-rpc` `eth_call`, and adds only the approval calls still needed. It then submits the approval + swap batch through the same `send_calls` approval path. `previewOnly: true` or `submit: false` returns the quote and prepared calls without opening WalletChan.

`bridge` resolves token symbols from WalletChan/Bungee token lists, fetches a fresh quote, prefers Bungee manual routes, calls `build-tx` when needed, checks ERC-20 allowance, and submits approval + bridge as a WalletChan batch. Auto routes with executable `txData` are supported. Auto routes that require a Permit2 typed-data submit path are intentionally not submitted by this high-level tool yet; use protocol-specific handling plus WalletChan `sign` if that path becomes necessary.

### Agent Wallet Profiles

WalletChan MCP has an execution-profile registry so mutating tools can choose between the paired WalletChan wallet and locally managed agent wallets without extension changes:

- `walletconnect` — existing path through `walletchan-rpc`, WalletConnect, and the WalletChan popup.
- `agent:<walletId>` — delegated agent path for ERC-7710/1Shot execution and delegated x402 payment.
- `agent-eoa:<walletId>` — raw local agent EOA path for direct agent-wallet interactions.

Agent wallets are stored under the WalletChan MCP app-data root in `agent-wallets`. Private keys and signed delegation payloads are encrypted in `agent-wallets.json` with AES-256-GCM and PBKDF2-SHA256. On first agent-wallet create/import, MCP automatically creates a local `vault-secret` file in the agent-wallet directory; `WALLETCHAN_MCP_AGENT_VAULT_SECRET` and `WALLETCHAN_MCP_AGENT_VAULT_SECRET_FILE` are advanced overrides for migration/recovery. MCP tool arguments never accept the vault secret and no tool returns private keys.

The two delegated targets are intentionally different:

| Use | Delegation `delegate` |
|---|---|
| 1Shot relayed DeFi execution | 1Shot `targetAddress` from `agent_oneshot_get_capabilities` |
| x402 delegated payment | agent wallet address |

The `agent` profile never falls back to raw agent-wallet payment for x402. If an endpoint does not advertise `extra.assetTransferMethod: "erc7710"`, `agent_x402_quote` reports `delegatedPaymentSupported: false` and `agent_x402_pay` rejects instead of spending the agent EOA's USDC. Use an ERC-7710 x402 server or a future WalletChan-owned x402 endpoint documented in `_docs/walletchan-mcp/X402_DELEGATED_PAYMENTS.md`.

See `_docs/walletchan-mcp/AGENT_WALLETS.md` for storage, secret generation, profile resolution, and delegation lifecycle details.

### SIWE and Remote MCP Login

`sign_siwe` exists for protocol login challenges such as Virtuals ACP. It accepts either the exact EIP-4361 message returned by a protocol tool or enough SIWE fields to build one. The preferred path is always the exact `message` returned by the protocol. The tool validates the header, address, URI, version, chain ID, nonce, and issued-at timestamp before opening WalletChan, so malformed copied challenges fail before a user sees a popup.

Some remote MCPs return SIWE challenges wrapped as `{ "message": "..." }`, and some chat clients may pass that wrapper as either an object or a JSON string. WalletChan MCP unwraps that envelope before validation/signing. The WalletConnect request sent to `walletchan-rpc` must stay the standard `personal_sign` shape:

```json
["app.virtuals.io wants you to sign in with your Ethereum account:\n...", "0xSigner"]
```

Do not send the wrapper itself as the message, and do not add WalletChan-specific `personal_sign` params. WalletChan extension should receive the same standard request any WalletConnect wallet would receive. Since the WalletConnect peer is the local RPC bridge, wallet UIs may still show `127.0.0.1:4209` as the requester, but the raw SIWE message should be the protocol challenge, for example `app.virtuals.io`.

`start_remote_mcp_siwe_login` and `complete_remote_mcp_siwe_login` wrap the common remote-MCP SIWE pattern:

1. call the allowlisted remote MCP login-start tool
2. preserve the exact returned SIWE `message` inside WalletChan MCP
3. open a WalletChan signature request for that exact message
4. after approval, call the remote MCP login-complete tool with the stored message and returned signature

The initial allowlisted profile is `virtuals`, backed by `https://mcp.acp.virtuals.io/`. Generic `call_remote_mcp_tool` intentionally refuses profile login tools so agents do not manually copy SIWE challenges between tools. After login, agents can pass the returned token to non-login Virtuals tools through `call_remote_mcp_tool`.

## Managed RPC

Managed RPC is enabled by default. The MCP server uses this logic:

1. If `--rpc-url` is reachable at `/health`, use that existing process.
2. If not reachable, resolve the `@walletchan/rpc` package.
3. Prefer `@walletchan/rpc/dist/index.js`.
4. If no dist file exists but source is available in the monorepo, fall back to `pnpm --dir <repoRoot> --filter @walletchan/rpc dev --`.
5. Spawn the child with selected chain flags, RPC overrides, timeouts, batching mode, project ID, and optional `--force-new-session`.
6. Ask the RPC `/pairing` route for a fresh `wc:` URI when `/health` reports no usable session. The response includes `pairingUrl` for the RPC `/qr` browser QR page. Child stdout parsing is kept as a startup fallback.
7. On MCP shutdown, terminate the managed child.

Default managed RPC config:

- RPC URL: `http://127.0.0.1:4209`
- RPC bind host: `127.0.0.1` (`--rpc-host 0.0.0.0` is useful inside isolated containers whose published port is restricted to host loopback)
- Chain: `base`
- Batching: enabled
- Request timeout: `300` seconds
- Upstream timeout: `15000` ms

If another older `walletchan-rpc` is already running on the same URL and does not expose `/pairing`, MCP cannot recover its original printed `wc:` URI. In that case `get_pairing_uri` reports that the existing process is external and asks the user to use that process's terminal output or restart on an unused port with `--force-new-session`.

If the user manually disconnects the WalletConnect session from the wallet, the RPC marks the session disconnected when it sees a delete/expire/update-to-empty signal. Interactive `walletchan-rpc` terminals prompt for Enter before printing a new URI. MCP-managed RPC runs non-interactively, so the next `get_pairing_uri` call asks `/pairing` for a new URI without restarting the MCP server. MCP also returns the `/qr` page URL so the user can scan a QR in the browser.

`get_pairing_uri` accepts `forceNewSession: true` (or `force: true`) to disconnect stored WalletConnect sessions and create a fresh URI for switching wallets. The RPC `/pairing?force=true` endpoint backs this behavior. The browser QR page also supports `/qr?force=true` and a "New Wallet URI" button. A normal `get_pairing_uri` call should only report `connected: true` / "already paired" when the RPC also reports at least one approved account.

When `get_pairing_uri` returns an unpaired state with a `wc:` URI, `mcpServer.ts` appends a PNG QR code as a standard MCP `image` content item. The structured result stays unchanged and still contains `pairingUri`; QR image support is intentionally additive because not every MCP terminal client renders image blocks inline.

The QR image block is emitted before the text fallback so clients that show the first renderable content item can display the QR. Clients that do not render MCP images should still show `pairingUrl` and the raw `wc:` URI.

## Base Skill Adaptation

`baseSkills.ts` exposes WalletChan-adapted Base MCP plugin resources, including Morpho, Moonwell, Uniswap, Avantis, Aerodrome, Virtuals, Bankr, and Base MCP references. The adapter keeps upstream markdown close to Base while prepending WalletChan-specific execution rules: use `get_pairing_uri` for pairing, map Base wallet tools to WalletChan tools, prefer `send_prepared_calls`, use allowlisted web/CLI/remote MCP helpers, expect WalletChan popup approval, and use `agent_x402_quote` / `agent_x402_pay` only for ERC-7710 x402 resources.

Detailed Base skill, CLI runner, remote MCP, and protocol-expansion guidance lives in `_docs/walletchan-mcp/BASE_SKILLS_AND_PROTOCOLS.md`.

## Managed Protocol Integrations

Runtime protocol integrations live under `apps/walletchan-mcp/src/protocols`, while agent-readable markdown lives under `apps/walletchan-mcp/skills`. The first managed protocol profile is Veil MCP. It runs in a controlled working directory, inherits WalletChan MCP's Base RPC configuration, and gates private relay-backed actions behind explicit env configuration.

Detailed managed protocol behavior and the checklist for expanding Base skill support live in `_docs/walletchan-mcp/BASE_SKILLS_AND_PROTOCOLS.md`.

## Third-Party Boundary

WalletChan MCP is not a general third-party execution layer. It has two narrow protocol escape hatches for smoother UX when Claude/Cursor/Codex harnesses block direct protocol egress:

- `web_request` only supports HTTPS `GET`/`POST` to allowlisted hosts. Default hosts cover the current HTTP-based Base plugins and all default upstream RPC hosts from `walletchan-rpc`.
- `run_base_plugin_cli` only supports pinned protocol packages and known command/argument schemas. It uses `spawn` without a shell, rejects unknown args, applies timeout/output caps, and sets official protocol endpoint env vars instead of trusting ambient endpoint overrides.
- The Aerodrome runner uses `uvx` to execute the pinned Sugar SDK git ref and needs `uvx` on `PATH`. It defaults to `walletchan-rpc`'s Base upstream RPC, `https://base.drpc.org`.
- Managed protocol MCPs are profile-based and run with controlled cwd/env. Private protocol actions that bypass WalletChan approval must be explicitly gated.

WalletChan MCP still does not proxy arbitrary remote MCPs, execute arbitrary shell commands, or fetch arbitrary web hosts. Remote MCP proxying is profile-based and currently allowlists Virtuals ACP only. Managed protocol integrations are also profile-based; the initial stdio profile is Veil MCP.

## Client Compatibility

WalletChan MCP is client-agnostic at the protocol layer because it is stdio MCP.

Practical setup paths:

| Client | Setup path |
|---|---|
| Claude Desktop | Configure stdio MCP with `node /path/to/walletchan/apps/walletchan-mcp/dist/index.js` |
| Codex | Configure stdio MCP command, e.g. `codex mcp add walletchan -- node /path/to/walletchan/apps/walletchan-mcp/dist/index.js` |
| Cursor | Configure `.cursor/mcp.json` or `~/.cursor/mcp.json` with `command: "node"` and the built entrypoint |
| ChatGPT | Custom connectors require a reachable HTTPS MCP endpoint or tunnel; local-only stdio MCP is not directly supported |

Plain stdio MCP does not provide a standard cross-client icon field. Some clients may show a monogram fallback even though the server and tools expose readable `title` metadata.

Pairing QR display depends on the client. MCP image content is part of the protocol, and Claude Code/Codex can consume image blocks, but terminal UIs may render only a placeholder rather than a scannable inline image. WalletChan MCP therefore returns `pairingUrl` for the RPC browser QR page, the `wc:` URI in text/structured content, and the optional QR image block.

## Environment Variables

| Variable | Purpose |
|---|---|
| `WALLETCHAN_RPC_URL` | Override RPC URL, default `http://127.0.0.1:4209` |
| `WALLETCHAN_MCP_RPC_HOST` / `WALLETCHAN_RPC_HOST` | Bind host for the managed `walletchan-rpc` child, default `127.0.0.1` |
| `WALLETCHAN_MCP_API_BASE` / `WALLETCHAN_API_BASE` | First-party WalletChan API base for portfolio, swap, and bridge tools, default `https://walletchan.com/api` |
| `WALLETCHAN_MCP_MANAGED_RPC` | Set to `false` to disable automatic RPC child process |
| `WALLETCHAN_MCP_CHAINS` | Comma-separated managed RPC chains |
| `WALLETCHAN_MCP_RPC_OVERRIDES` | Comma-separated managed RPC upstream overrides |
| `WALLETCHAN_MCP_WALLETCONNECT_PROJECT_ID` | WalletConnect project ID for managed RPC |
| `WALLETCONNECT_PROJECT_ID` / `WC_PROJECT_ID` | Fallback WalletConnect project ID |
| `WALLETCHAN_MCP_WEB_REQUEST` | Set to `false` to disable allowlisted `web_request` |
| `WALLETCHAN_MCP_WEB_HOSTS` | Comma-separated extra HTTPS hosts for `web_request` |
| `WALLETCHAN_MCP_PLUGIN_CLI` | Set to `false` to disable pinned protocol CLI runners |
| `WALLETCHAN_MCP_MORPHO_API_URL` | Optional Morpho API URL override, restricted to official Morpho API hosts |
| `WALLETCHAN_MCP_AERODROME_RPC_URL` | Optional Base RPC URL for Aerodrome Sugar SDK runner, default `https://base.drpc.org` |
| `WALLETCHAN_MCP_DATA_DIR` | Optional shared app-data root for managed protocol state |
| `WALLETCHAN_MCP_AGENT_WALLET_DIR` | Optional exact directory for local agent wallet metadata/key vault; defaults to the WalletChan MCP app-data root under `agent-wallets` |
| `WALLETCHAN_MCP_AGENT_VAULT_SECRET` | Optional advanced override secret for local agent wallet encryption; normally MCP uses the auto-created `vault-secret` file |
| `WALLETCHAN_MCP_AGENT_VAULT_SECRET_FILE` | Optional advanced override file containing the agent vault secret |
| `WALLETCHAN_MCP_ONESHOT_RELAYER_URL` | Optional 1Shot public relayer JSON-RPC endpoint override, default `https://relayer.1shotapi.com/relayers` |
| `WALLETCHAN_MCP_VEIL` | Set to `false` to disable managed Veil MCP tools |
| `WALLETCHAN_MCP_VEIL_PRIVATE_ACTIONS` | Set to `true` to enable Veil relay-backed private tools |
| `WALLETCHAN_MCP_VEIL_DIR` | Exact working directory for Veil `.env.veil` and receipts |
| `WALLETCHAN_MCP_VEIL_RELAY_URL` | Veil relay URL passed as `RELAY_URL` |
| `WALLETCHAN_MCP_VEIL_X402_RELAY_URL` | x402 relay URL passed as `X402_RELAY_URL` |
| `WALLETCHAN_MCP_VEIL_COMMAND` | Override Veil MCP child command; default is `npx` |
| `WALLETCHAN_MCP_VEIL_ARGS` | Extra Veil command args; JSON string array or whitespace-separated |
| `WALLETCHAN_MCP_VEIL_STARTUP_TIMEOUT_MS` | Veil MCP startup timeout, default `120000` |
| `WALLETCHAN_MCP_VEIL_CALL_TIMEOUT_MS` | Veil MCP call timeout, default `120000` |

Keep `apps/walletchan-mcp/.env.example` in sync when adding env vars.

For agent vault secret generation and storage guidance, see `_docs/walletchan-mcp/AGENT_WALLETS.md`.

## NPM Publishing

`@walletchan/mcp` is published from `apps/walletchan-mcp`. For publishable MCP changes, bump both `apps/walletchan-mcp/package.json` and `serverInfo.version` in `apps/walletchan-mcp/src/mcpServer.ts`. If MCP depends on new `walletchan-rpc` behavior, bump `apps/walletchan-mcp/package.json` `dependencies["@walletchan/rpc"]` to the new workspace range and publish `@walletchan/rpc` first.

From the repo root:

```bash
pnpm install --lockfile-only
pnpm build:walletchan-mcp
pnpm publish:walletchan-mcp:dry-run
pnpm publish:walletchan-mcp
```

For combined RPC + MCP releases, run both dry-runs before publishing either package, then publish RPC first and MCP second. Keep the detailed release flow in `_docs/PUBLISHING.md` in sync.

## Testing Checklist

For MCP-only changes:

1. Build: `pnpm build:walletchan-mcp`
2. Smoke stdio:
   ```bash
   printf '%s\n' \
     '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"smoke","version":"0"}}}' \
     '{"jsonrpc":"2.0","method":"notifications/initialized","params":{}}' \
     '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}' \
     | node apps/walletchan-mcp/dist/index.js --no-managed-rpc
   ```
3. Run `get_pairing_uri` on an unused port with `--force-new-session` and `forceNewSession: true`; verify a `wc:` URI is returned.
4. Pair a wallet and run `get_wallets`.
5. Call `get_portfolio_balances` for the paired address.
6. Call `get_swap_price` with a small read-only quote, then `swap` with `previewOnly: true`.
7. Call `get_bridge_quote` with a small read-only route, then `bridge` with `previewOnly: true`.
8. Load a Base plugin with `load_base_plugin`, then verify it contains WalletChan override text.
9. Call `list_base_plugin_runners` and verify Morpho and Aerodrome commands are listed.
10. Call `run_base_plugin_cli` with a read-only command such as Morpho `query-vaults` or Aerodrome `pools`.
11. Call `web_request` against `https://api.morpho.org/graphql` with a small `POST` introspection query and verify non-allowlisted hosts are rejected.
12. For Base skill changes, load at least one plugin with `load_base_plugin` and confirm supported external API/CLI steps point to `web_request` / `run_base_plugin_cli` before harness fallbacks.
13. Call `list_skill_resources` and verify Veil resources are listed.
14. Call `list_protocols` and verify the Veil profile reports its managed data directory.
15. With `WALLETCHAN_MCP_VEIL_COMMAND=veil-mcp` or the default npx path, call `veil_status` and verify it does not write `.env.veil` into the repo.
16. Call `veil_prepare_deposit` with `submitPreparedCalls: false` or omitted to verify the prepare payload shape and the `walletchanPreflight.veilDeposit` result before testing WalletChan approval.
17. For agent-wallet changes, use a temporary `WALLETCHAN_MCP_AGENT_WALLET_DIR`, then smoke `agent_create_wallet`, `list_execution_profiles`, `agent_delete_wallet`, and `agent_reset_vault`. Verify a `vault-secret` file is auto-created in the temp directory and reset works without the old secret.
18. For delegated x402 changes, call `agent_x402_quote` against both an ERC-7710-supporting test endpoint and a non-ERC-7710 x402 endpoint. Verify the latter returns `delegatedPaymentSupported: false` or rejects without falling back to `agent-eoa`.

If a change touches transaction or signature behavior through RPC, also test the WalletChan approval path across all WalletChan account types:

- Bankr API accounts (`impersonator`)
- Private key accounts (`privateKey`)
- Seed phrase accounts (`seedPhrase`)
