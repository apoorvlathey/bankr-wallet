# WalletChan MCP Base Skills and Protocol Integrations

This page documents how WalletChan MCP adapts Base MCP-style skill markdown, protocol CLIs, allowlisted HTTP APIs, remote MCP profiles, and managed protocol integrations.

## Base Skill Adaptation

`baseSkills.ts` exposes resources under WalletChan URIs:

- `walletchan://skill/SKILL.md`
- `walletchan://base-mcp/plugins/morpho.md`
- `walletchan://base-mcp/plugins/moonwell.md`
- `walletchan://base-mcp/plugins/uniswap.md`
- `walletchan://base-mcp/plugins/avantis.md`
- `walletchan://base-mcp/plugins/aerodrome.md`
- `walletchan://base-mcp/plugins/virtuals.md`
- `walletchan://base-mcp/plugins/bankr.md`
- `walletchan://base-mcp/references/batch-calls.md`
- `walletchan://base-mcp/references/approval-mode.md`
- `walletchan://base-mcp/references/custom-plugins.md`

Plugin and reference resources are fetched from:

```text
https://raw.githubusercontent.com/base/skills/refs/heads/master/skills/base-mcp
```

Before returning upstream markdown, MCP prepends a WalletChan override that tells the agent:

- use WalletChan MCP `get_pairing_uri` if the wallet is not paired
- map Base MCP `get_wallets`, `send_calls`, `get_request_status`, and `sign` to WalletChan MCP tools with the same names
- prefer `send_prepared_calls` for prepare responses instead of making the agent manually map calldata
- use WalletChan MCP `web_request` for external API or `web_request` plugin paths when the target host is allowlisted
- use WalletChan MCP `run_base_plugin_cli` for CLI-capable plugin paths when `list_base_plugin_runners` shows a supported runner
- prepare delegated `agent` DeFi actions with the main-wallet delegator as the protocol user, not the raw agent EOA
- use WalletChan MCP `swap` for Base MCP `swap`-style paths
- use WalletChan MCP portfolio/bridge tools for portfolio and bridge requests
- use WalletChan MCP remote MCP tools for allowlisted profiles such as Virtuals
- use harness-configured protocol MCP connectors for remote MCP plugin paths when no allowlisted WalletChan profile exists
- expect approval in the WalletChan popup
- do not use Base Account approval URLs
- use `agent_x402_quote` and `agent_x402_pay` for ERC-7710 x402 resources paid through an active agent delegation

This keeps the skill text close to upstream Base while changing only the execution layer.

## Compatibility Model

The scalable compatibility model is pattern-based:

- supported CLI plugins: `run_base_plugin_cli` -> `send_prepared_calls`; current defaults cover Morpho and Aerodrome
- delegated agent CLI write commands automatically bind owner arguments such as Morpho `user-address` and Aerodrome `wallet` to the delegation `delegator` before simulation/preparation
- delegated agent submissions preflight the call bundle and can return `needs_delegation_signature`; after the user approves, call `agent_complete_delegation` with `recommendedNextArgs` to activate the reusable 1Shot function-call delegation and submit the pending action
- confirmed 1Shot submissions estimate before sending; if 1Shot returns a new `requiredPaymentAmount`, MCP rewrites only the fee-collector `transfer` with a tiny fee buffer and preserves protocol approvals before re-estimating
- Base MCP swap-style flows: `swap` via WalletChan's first-party swap API
- HTTP tx-builder plugins: `web_request` for allowlisted hosts -> `send_prepared_calls`; current defaults cover Moonwell, Uniswap, Avantis, Bankr discovery, and Morpho API hosts
- allowlisted remote MCP plugins: `list_remote_mcp_tools` / `call_remote_mcp_tool`; SIWE login uses `start_remote_mcp_siwe_login` -> WalletChan popup -> `complete_remote_mcp_siwe_login`
- other remote MCP plugins: harness protocol MCP connector -> WalletChan MCP wallet tools
- already-normalized calldata: `send_calls`
- signature/session plugins: `sign_siwe` or `sign` + `get_request_status`
- managed protocol integrations: `src/protocols/<protocol>` + optional first-class wrappers; current initial profile is Veil MCP

Adding a new Base skill should not require arbitrary third-party execution code in WalletChan MCP. Future HTTP-only skills can usually work by adding allowlisted hosts with `WALLETCHAN_MCP_WEB_HOSTS` / `--allow-web-host`. Future CLI-only skills need a small pinned runner profile or a separate protocol MCP. Otherwise the harness should run protocol-specific CLIs or call protocol-specific MCP servers, and WalletChan MCP should handle wallet state, signatures, and transaction approval.

## Managed Protocol Integrations

Runtime protocol integrations live under `apps/walletchan-mcp/src/protocols`, while agent-readable markdown lives under `apps/walletchan-mcp/skills`.

Use `src/protocols/<protocol>` for protocol-specific execution code, regardless of whether that protocol uses a local MCP child, a pinned CLI, an HTTP API, or a future SDK adapter. Keep `tools.ts` as a thin public MCP surface that delegates into protocol modules.

The first managed protocol profile is Veil:

- WalletChan MCP starts Veil MCP as a long-lived stdio child on first Veil call.
- The default invocation is `npx -y --ignore-scripts --no-audit --no-fund @veil-cash/mcp@0.2.1`; users can set `WALLETCHAN_MCP_VEIL_COMMAND=veil-mcp` after a global install for faster startup.
- Veil's cwd is controlled by WalletChan MCP so `.env.veil` and `.veil-x402-receipts.json` are written under the managed Veil data directory, not an arbitrary MCP client cwd.
- The default Veil data root is OS app-data (`~/Library/Application Support/WalletChan MCP/veil` on macOS, `%APPDATA%/WalletChan MCP/veil` on Windows, `$XDG_DATA_HOME/walletchan-mcp/veil` or `~/.local/share/walletchan-mcp/veil` on Linux). `WALLETCHAN_MCP_VEIL_DIR` overrides the exact Veil working directory. `WALLETCHAN_MCP_DATA_DIR` overrides the shared WalletChan MCP data root.
- WalletChan MCP always passes a Base `RPC_URL` to Veil. Veil inherits from WalletChan MCP's global Base RPC resolution: `--rpc base=<url>` or `WALLETCHAN_MCP_RPC_OVERRIDES=base=<url>`, otherwise WalletChan's Base default `https://base.drpc.org`. There is no Veil-specific Base RPC option. This avoids Veil falling back to rate-limited public Base RPC endpoints while keeping protocol integrations aligned with WalletChan's chain configuration.
- Veil public actions return `{ chain: "base", calls: [...] }`, which `send_prepared_calls` already accepts. `veil_prepare_register` and `veil_prepare_deposit` expose `submitPreparedCalls: true` as the convenience path.
- `veil_prepare_deposit` validates current Veil minimum net deposit amounts before preparing calldata: `0.01 ETH` and `20 USDC`. This blocks requests that would revert with `MinimumDepositNotMet` before opening WalletChan.
- Veil x402 payment is visible in the tool catalog. Call `veil_x402_quote` first to confirm the resource is x402 v2 exact Base USDC and below the requested cap. After explicit user approval, call `veil_pay_x402` with the same request fields, `maxPayment`, and `confirm: true`.
- WalletChan MCP normalizes Veil x402 HTTP methods before forwarding to Veil MCP: lowercase or padded `method` values are uppercased, and a present non-null `body` implies `POST` when `method` is omitted. A non-POST body is rejected at the WalletChan boundary with a clear error.
- WalletChan MCP preflights Veil relay withdrawal minimums before calling private relay tools. `veil_withdraw` requires at least `0.001 ETH` or `0.01 USDC`. `veil_pay_x402` quotes first and blocks supported x402 payments below the Veil USDC relay withdrawal minimum of `0.01 USDC`, preventing wasted payer discovery/funding attempts.
- WalletChan MCP normalizes Veil relay gas-cap failures. If the hosted Veil relay returns `Gas price too high, try again later`, the wrapper reports that the private withdrawal was refused because Base gas is above the Veil relay cap. This is independent of WalletChan's configured Base RPC URL, and WalletChan MCP cannot raise the hosted relay cap. x402 agents should check payer balances once, reuse a funded `payerIndex` only when it can cover the payment, otherwise wait before retrying.
- Broader Veil private relay actions (`veil_withdraw`, `veil_transfer`, `veil_consolidate_utxos`) are blocked unless `WALLETCHAN_MCP_VEIL_PRIVATE_ACTIONS=true`, because they submit through the Veil relay without WalletChan popup approval.

## Expanding Base Skill Support

Use this checklist when Base adds a new skill or an existing skill changes its execution path:

1. Load the upstream plugin first with `load_base_plugin` using the Base plugin slug. `load_base_plugin` accepts any safe lowercase slug matching `^[a-z0-9-]+$`, so new upstream markdown can be tested without a code change if the file exists under Base's `skills/base-mcp/plugins/` directory.
2. Classify the plugin's action path:
   - Wallet-only: if it already produces `calls[]`, `transactions[]`, approval/action objects, or `{ data: { to, value, data } }`, route it through `send_prepared_calls`.
   - HTTP/API: if it asks for a `web_request` or direct protocol API call, prefer WalletChan MCP `web_request`, then pass the complete prepare response to `send_prepared_calls`.
   - CLI: if it asks for `npx`, `uvx`, or another CLI, use `run_base_plugin_cli` only when `list_base_plugin_runners` exposes a pinned runner for that plugin and command.
   - Remote MCP: if it matches an allowlisted profile, use `list_remote_mcp_tools` / `call_remote_mcp_tool`; if the profile has SIWE login, use `start_remote_mcp_siwe_login` and `complete_remote_mcp_siwe_login`. Otherwise configure that MCP in the harness and use WalletChan MCP only for wallet state, signatures, and final transaction approval.
   - Base swap/tool path: if it requires Base MCP `swap`, use WalletChan MCP `swap`.
   - x402 resource: use `agent_x402_quote` and `agent_x402_pay` when the endpoint supports `extra.assetTransferMethod: "erc7710"` and the user has an active delegation to the agent wallet address. Skip or ask for explicit `agent-eoa` fallback when the endpoint only supports non-delegated EIP-3009 or Permit2 payment.
3. For a new HTTP/API plugin, add only the minimal official hosts needed for prepare/discovery calls. Prefer deployment config first with `WALLETCHAN_MCP_WEB_HOSTS` / `--allow-web-host`. Add hosts to `DEFAULT_WEB_REQUEST_HOSTS` only when the skill should work out of the box for all local WalletChan MCP users.
4. For a new CLI plugin, add a runner profile in `basePluginCli.ts` instead of allowing arbitrary shell execution. Pin the package or git ref, define explicit commands/options, validate every argument type, use `spawn` with `shell: false`, and set any required official endpoint/RPC env vars in `defaultEnv`.
5. If a CLI prepare command returns a new response shape, extend `preparedCalls.ts` so `send_prepared_calls` can normalize it. Keep the normalization shape-based and generic when possible, rather than protocol-specific.
6. For a new remote MCP plugin that should work without user-side connector setup, add a small allowlisted profile in `remoteMcp.ts`. Prefer generic profile metadata and only special-case login orchestration when the remote MCP requires exact SIWE challenge preservation.
7. Update `apps/walletchan-mcp/SKILL.md`, `apps/walletchan-mcp/README.md`, and this doc with the new host/runner/env behavior. If new env vars are added, update `apps/walletchan-mcp/.env.example`. If `walletchan-rpc` default upstream RPCs change, update `apps/walletchan-mcp/src/walletchanRpcDefaults.ts` so MCP web/CLI host allowlists remain aligned.
8. Smoke test the safest read-only path first, then a `previewOnly: true` prepare path, then an actual WalletChan approval path if the change touches transaction submission or signing.

Do not add a generic "run whatever the skill says" shell/web escape hatch. That would make future skills feel automatic, but it would also let upstream markdown expand local execution privileges without a code review.
