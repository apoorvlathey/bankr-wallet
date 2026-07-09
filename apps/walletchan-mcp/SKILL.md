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

WalletChan MCP starts a managed local `walletchan-rpc` bridge by default. Before wallet tools can succeed, call `get_pairing_uri` and show the returned `pairingUrl` or pairing URI to the user. `pairingUrl` opens the local RPC browser QR page, normally `/qr`. If the client renders MCP image content, the tool response may also include a QR code image; the URI remains the raw fallback.

The default wallet transport is WalletConnect. Use `get_pairing_uri({ walletTransport: "metamask-connect", forceNewSession: true })` to switch the already-running managed RPC to MetaMask Connect, or `get_pairing_uri({ walletTransport: "walletconnect", forceNewSession: true })` to switch back without restarting MCP. `transport` is accepted as an alias for `walletTransport`.

For MetaMask Connect account switching, first call `get_wallets` after the user switches accounts in MetaMask Mobile; WalletChan RPC refreshes from MetaMask Connect's selected account when accounts are read. If it still shows the old account, call `get_pairing_uri({ walletTransport: "metamask-connect", account: "0x...", forceRequest: true })` to ask MetaMask Connect for that specific account without restarting MCP.

The user pairs a wallet by scanning the browser QR or pasting the URI in the selected wallet app.

Use `resolve_name` before passing a user-provided name as an address. It resolves ENS/subdomains, Basenames under `.base.eth`, WNS `.wei`, GNS `.gwei`, and MegaNames `.mega` to EVM addresses using MCP RPC overrides first and WalletChan defaults second. Use `resolve_names` for batches. Do not assume wallet tools accept names directly; pass the returned `address`.

## Execution Profiles

WalletChan MCP supports execution profiles:

- `walletconnect` is the existing main-wallet approval profile through WalletChan RPC and its selected wallet transport.
- `agent:<walletId>` is the delegated local agent-wallet path for ERC-7710/1Shot execution work.
- `agent-eoa:<walletId>` is the raw local agent EOA path for direct agent-wallet actions.

Use `list_execution_profiles` and `get_default_execution_profile` before choosing an executor for user-controlled flows. If the user says to use their main wallet, use `walletconnect`. If the user says to use the agent wallet, use `agent` or a concrete `agent:<walletId>` profile. If they specifically ask for the raw agent wallet, use `agent-eoa` or `agent-eoa:<walletId>`.

Agent wallet key material and signed delegation payloads are encrypted locally under the WalletChan MCP app-data directory. On first agent wallet create/import, MCP auto-creates a local `vault-secret` file when no advanced env override is configured. Never ask for the vault secret as an MCP tool argument. Current agent-wallet tools return addresses and profile IDs only, never private keys.

If the user intentionally wants to forget old local agent wallets and start fresh, use `agent_reset_vault` with `confirm: true` and `confirmationText: "RESET_AGENT_VAULT"`. This clears local agent-wallet metadata/delegations/defaults without requiring the old vault secret; the next create/import will auto-create a new local `vault-secret`.

For 1Shot delegated execution, call `agent_prepare_delegation` directly; it defaults to `delegateMode: "oneshot-relayer"` and resolves the current 1Shot `targetAddress` automatically. Then call `agent_request_delegation_signature`, wait for WalletChan popup approval, call `agent_complete_delegation`, and set the default profile to `agent:<walletId>` if the user wants agent execution by default. Use `delegateMode: "agent-wallet"` only for delegated x402 endpoints that require the local agent wallet address as the delegate.

If `send_calls`, `send_prepared_calls`, or `agent_oneshot_relay_calls` returns `status: "needs_function_call_delegation"`, do not retry the same transaction or switch vaults. Call `agent_prepare_delegation` with the returned `prepareDelegationArgs`, then request and complete the delegation signature, then retry the original transaction. This happens when the active delegation is a token-transfer scope but the prepared DeFi calls require protocol contract methods.

Use `agent_eoa_get_balance` for raw agent funding checks. Use `agent_eoa_send_transaction` or `agent_eoa_send_calls` only when the user explicitly asks to use the raw agent wallet; these tools sign locally and do not open a WalletChan popup. Sequential raw calls are not atomic.

## Tool Mapping

When an upstream Base MCP plugin says:

- `get_wallets` before pairing -> first call WalletChan MCP `get_pairing_uri`
- `get_wallets` -> use WalletChan MCP `get_wallets`
- user-provided name such as `alice.eth`, `name.base.eth`, `name.wei`, `name.gwei`, or `name.mega` -> use WalletChan MCP `resolve_name`, then use the returned `address`
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

Use `executionProfile` on mutating tools when the user wants a per-call override. `walletconnect` means the paired WalletChan wallet and popup approval. `agent:<walletId>` means delegated 1Shot execution from an active ERC-7710 delegation. `agent-eoa:<walletId>` means raw local agent EOA signing.

When using `agent:<walletId>` for DeFi prepare flows, the effective protocol user is the delegation's main-wallet `delegator`, not the local agent EOA address. For supported CLI write commands, `run_base_plugin_cli` automatically binds owner-style arguments such as Morpho `user-address` and Aerodrome `wallet` to that delegator before simulation/preparation. Do not manually set those arguments to the agent EOA unless the user explicitly chose `agent-eoa`.

A daily USDC transfer delegation is not enough for DeFi protocol calls. If delegated `agent` submission returns `status: "needs_delegation_signature"`, show the user the WalletChan signature request and, after approval, call `agent_complete_delegation` with the returned `recommendedNextArgs`. That activates the reusable 1Shot function-call delegation and submits the original pending action automatically. Reuse the active function-call delegation for later matching calls; do not request a new delegation unless the targets/selectors are not covered.

Delegated 1Shot submissions estimate before sending. If the result is `status: "estimate_failed"`, stop and report the estimate error; do not retry blindly or switch to `agent-eoa`. The MCP relayer logic updates only the 1Shot fee-collector transfer when `requiredPaymentAmount` changes and adds a tiny fee buffer, so protocol approvals in prepared DeFi bundles must remain intact.

For x402 resources, use `agent_x402_quote` and `agent_x402_pay`. The default `agent:<walletId>` path requires the endpoint to advertise `extra.assetTransferMethod: "erc7710"` and consumes an active delegation to the agent wallet address. Do not use the 1Shot `targetAddress` delegation for x402. If the quote returns `delegatedPaymentSupported: false`, stop and tell the user the endpoint does not support ERC-7710 delegated x402 payment; do not retry with `agent-eoa` unless the user explicitly wants raw agent-wallet USDC payment. Use Veil x402 tools only when the user explicitly wants the private Veil flow.

## Approval Flow

WalletChan does not return a Base Account approval URL. Wallet requests are sent through WalletChan RPC to the paired wallet transport. The user approves or rejects in the wallet popup.

If WalletChan is not paired, call `get_pairing_uri` and show the `pairingUrl` to the user when present. If a QR image appears in chat, the user can scan it instead; otherwise they can paste the exact `pairingUri`. After they pair, retry `get_wallets`.

To switch wallets or force a fresh proposal on the current transport, call `get_pairing_uri` with `forceNewSession: true` and show the returned QR/URI. To switch transports on the fly, include `walletTransport: "metamask-connect"` or `walletTransport: "walletconnect"` with `forceNewSession: true`. The local QR page can also force a fresh URI at `/qr?force=true`.

If a wallet action returns `status: "needs_pairing"` or `errorCode: "walletconnect_disconnected"`, the wallet session was closed or lost. Show the returned `pairingUrl` or `pairingUri` if present, otherwise call `get_pairing_uri`; use the QR image too when the client displays one. After the user pairs again, retry the wallet action; if `reprepareRequired` is true, refresh calldata first.

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
