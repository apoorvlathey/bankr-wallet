# WalletChan MCP Agent Wallets

This page documents the local agent wallet and execution-profile layer in `apps/walletchan-mcp`.

The extension does not need agent-wallet changes for this flow. WalletChan MCP creates or imports a local agent EOA, stores it encrypted on disk, requests ERC-7710 delegation signatures through the existing WalletChan typed-data popup, and later uses the signed delegation for automated agent execution.

## Runtime Files

| File | Responsibility |
|---|---|
| `apps/walletchan-mcp/src/agentWallets.ts` | Encrypted local agent wallet vault, delegation records, and execution-profile defaults |
| `apps/walletchan-mcp/src/agentDelegation.ts` | ERC-7710 delegation creation, EIP-712 typed data, and recovered-signer verification |
| `apps/walletchan-mcp/src/oneShotRelayer.ts` | 1Shot public relayer JSON-RPC adapter |
| `apps/walletchan-mcp/src/agentEoaExecutor.ts` | Raw agent EOA balance, transaction, and sequential-call helpers |
| `apps/walletchan-mcp/src/agentX402.ts` | Delegated ERC-7710 x402 buyer flow and explicit raw-agent fallback |

## Storage

Agent wallet state is stored under the WalletChan MCP app-data root:

- macOS: `~/Library/Application Support/WalletChan MCP/agent-wallets`
- Windows: `%APPDATA%/WalletChan MCP/agent-wallets`
- Linux: `$XDG_DATA_HOME/walletchan-mcp/agent-wallets` or `~/.local/share/walletchan-mcp/agent-wallets`

`WALLETCHAN_MCP_DATA_DIR` overrides the shared app-data root. `WALLETCHAN_MCP_AGENT_WALLET_DIR` overrides the exact agent-wallet directory.

The state file is `agent-wallets.json`. Public metadata, such as wallet IDs, labels, addresses, profile defaults, and non-secret delegation metadata, is readable. Agent private keys and full signed delegation payloads are encrypted inside the same file with AES-256-GCM and PBKDF2-SHA256 at 600,000 iterations.

For normal onboarding, users do not need to set a vault secret manually. On the first `agent_create_wallet` or `agent_import_wallet`, MCP generates a random local `vault-secret` file in the agent-wallet directory, writes it with best-effort `0600` permissions, and uses it for the encrypted key vault.

Advanced override/recovery paths can still supply the vault secret from process environment:

- `WALLETCHAN_MCP_AGENT_VAULT_SECRET`
- `WALLETCHAN_MCP_AGENT_VAULT_SECRET_FILE`

MCP tools never accept this secret as an argument and never return private keys. If an existing vault was created with an env secret and the env secret is later removed, MCP requires the original secret instead of silently generating a new one that cannot decrypt existing data.

Do not commit the `vault-secret` file or put vault secrets in prompts. Back up the agent-wallet data directory if you want to preserve local agent wallets across machines.

## Execution Profiles

WalletChan MCP supports these profile IDs:

| Profile | Meaning |
|---|---|
| `walletconnect` | Existing WalletChan path through `walletchan-rpc`, WalletConnect, and WalletChan popup approval |
| `agent:<walletId>` | Delegated agent path. Used for 1Shot ERC-7710 relayed execution and delegated x402 |
| `agent-eoa:<walletId>` | Raw local agent EOA path. Signs locally and broadcasts directly |

The shorthand `agent` resolves to the only available delegated agent profile. The shorthand `agent-eoa` resolves to the only available raw agent profile. If multiple agent wallets exist, callers must use the concrete profile ID returned by `list_execution_profiles`.

Mutating tools accept `executionProfile` or `profileId` as a per-call override. If neither is supplied, the stored default is used; if no default is stored, `walletconnect` is used.

Use `agent` for the hackathon agent flow. Use `agent-eoa` only when the user explicitly asks to spend directly from the raw agent wallet.

## Wallet Lifecycle

Use these tools for local agent wallets:

- `agent_create_wallet`
- `agent_import_wallet`
- `agent_list_wallets`
- `agent_get_wallet`
- `agent_delete_wallet`
- `agent_reset_vault`

The create/import path auto-creates the local vault secret when no env override is configured. Delete/use paths require the original vault secret to be available, either from the auto-created file or an env override. List/get/profile reads can show public metadata without exposing secrets.

Deleting an agent wallet removes its encrypted private key, related delegation records, and any default profile that points at that wallet.

If `agent-wallets.json` exists but the matching vault secret is unavailable, MCP still lists public wallet metadata but marks `agent` and `agent-eoa` profiles as `locked`. A locked stored default does not remain the effective default; `get_default_execution_profile` falls back to `walletconnect`. Explicit `agent` selection fails with a recovery/reset message.

`agent_reset_vault({ confirm: true, confirmationText: "RESET_AGENT_VAULT" })` forgets all local agent wallet metadata, encrypted key material, delegations, and the stored default profile without decrypting the old vault. Use this only when the user intentionally wants a fresh local agent setup, such as after removing an old env vault secret. The next create/import auto-creates a fresh local `vault-secret` file.

## Delegation Lifecycle

Use these tools for ERC-7710 delegation records:

- `agent_prepare_delegation`
- `agent_request_delegation_signature`
- `agent_complete_delegation`
- `agent_list_delegations`
- `agent_get_delegation`
- `agent_delete_delegation`

`agent_prepare_delegation` builds the MetaMask Smart Accounts Kit delegation object and WalletChan-compatible EIP-712 typed data. The delegation is initially stored as `pending_signature`.

`agent_request_delegation_signature` sends the typed-data signature request through the existing WalletConnect path. The main WalletChan wallet sees a popup.

`agent_complete_delegation` verifies that the signature recovers the expected `delegator`, then stores the signed delegation as `active`.

Supported scope types:

- `erc20-period-transfer`
- `erc20-transfer-amount`
- `native-token-period-transfer`
- `native-token-transfer-amount`
- `function-call`

For Base USDC, `tokenAddress` and `tokenDecimals` can be omitted; the defaults are Base USDC `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` and 6 decimals. `erc20-period-transfer` defaults to a daily period of 86,400 seconds.

## 1Shot Delegated Execution

1Shot delegated execution needs a delegation whose `delegate` is the 1Shot relayer `targetAddress`.

Flow:

1. `agent_oneshot_get_capabilities({ chainIds: [8453] })`
2. Read `targetAddress` from the result.
3. `agent_prepare_delegation({ walletId, delegateAddress: targetAddress, amount: "5" })`
4. `agent_request_delegation_signature({ delegationId })`
5. User approves the typed-data signature in WalletChan.
6. `agent_complete_delegation({ delegationId })`
7. `set_default_execution_profile({ profileId: "agent:<walletId>" })`

After that, these tools can route through the delegated agent profile:

- `send_calls`
- `send_prepared_calls`
- `send_transaction`
- `swap`
- `bridge`
- `run_base_plugin_cli` with `submitPreparedCalls: true`

The `agent` path is automated after the right delegation is active. It does not open a WalletChan popup for every in-scope transaction.

For DeFi prepare/simulation tools, `agent` does not mean the raw agent EOA is the protocol user. The effective onchain sender is the delegation `delegator`, usually the main WalletChan account that signed the ERC-7710 delegation. `run_base_plugin_cli` write commands therefore default or rewrite owner arguments such as Morpho `user-address` and Aerodrome `wallet` to the delegator before preparing calldata. This avoids false insufficient-balance simulations against an unfunded agent EOA. Use `agent-eoa` only when the raw local agent wallet should be the source of funds.

For DeFi execution, a daily USDC transfer scope does not authorize protocol calls. Morpho deposits, swaps, bridge calls, and similar flows need a 1Shot `function-call` delegation covering the prepared call targets and selectors. `send_prepared_calls`, `send_calls`, `swap`, `bridge`, and `run_base_plugin_cli` submissions preflight delegated agent calls before relay submission. If no active function-call delegation covers the prepared calls, MCP prepares the reusable 1Shot delegation, opens the WalletChan signature request, and stores the original action as a pending action. After approval, call `agent_complete_delegation` with the returned `recommendedNextArgs`; it activates the delegation and submits the pending action automatically.

Confirmed 1Shot relay submission estimates before sending. If 1Shot returns a different `requiredPaymentAmount`, MCP only rewrites the fee-collector ERC-20 transfer, adds a tiny fee buffer, and then re-estimates; prepared protocol calls such as USDC approvals must stay intact. If the estimate still fails, MCP returns `estimate_failed` and does not submit a task.

## x402 Delegated Payment

x402 uses the same agent wallet but a different delegation target. For x402, prepare a delegation to the agent wallet address itself. Do not use the 1Shot `targetAddress`.

If a demo uses both 1Shot DeFi execution and delegated x402 payment, create two scoped delegations:

| Use | Delegation `delegate` |
|---|---|
| 1Shot relayed DeFi execution | 1Shot `targetAddress` |
| x402 delegated payment | agent wallet address |

See `_docs/walletchan-mcp/X402_DELEGATED_PAYMENTS.md` for seller-side x402 requirements and the future first-party decoder endpoint idea.

## Raw Agent EOA Path

Use these tools only when the user explicitly chooses the raw local agent wallet:

- `agent_eoa_get_balance`
- `agent_eoa_send_transaction`
- `agent_eoa_send_calls`

The raw path signs with the locally stored agent private key and broadcasts directly to the configured chain RPC. It does not use the main WalletChan wallet, does not use WalletChan popup approval, and does not make sequential calls atomic.

Raw EOA x402 payment through `agent-eoa:<walletId>` spends USDC from the agent wallet itself. It is useful for fallback/debug flows, but it is not the hackathon delegation flow.

## Security Notes

- WalletChan MCP never receives the main WalletChan private key or seed phrase.
- Agent private keys are local to MCP and encrypted with the agent vault secret.
- Signed delegation payloads are stored encrypted because they authorize spending within the signed scope.
- `agent:<walletId>` should be treated as automated authority bounded by the delegation scope.
- `agent-eoa:<walletId>` should be treated as a local hot wallet.
- Do not silently fall back from `agent` to `agent-eoa`; that changes the source of funds.
