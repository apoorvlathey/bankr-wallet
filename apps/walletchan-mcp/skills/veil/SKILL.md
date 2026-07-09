---
name: walletchan-veil-mcp
description: Use Veil Cash through WalletChan MCP, with public Base transactions approved in WalletChan and Veil private relay actions explicitly gated.
---

# WalletChan Veil MCP

Use this skill when the user wants to use Veil Cash on Base through WalletChan MCP.

Read `walletchan://veil-mcp/plugins/veil.md` before calling Veil tools.

WalletChan MCP manages a local Veil MCP child process. Veil key material is stored by Veil MCP in WalletChan MCP's managed Veil data directory, not in the WalletChan browser extension vault. By default this is a platform app-data directory under WalletChan MCP, and it can be overridden with `WALLETCHAN_MCP_VEIL_DIR`.

Public Veil wallet actions:

- use `veil_prepare_register` and `veil_prepare_deposit`
- pass `submitPreparedCalls: true` when the user wants WalletChan to submit the prepared calldata
- approval happens in the paired wallet through WalletChan RPC's selected wallet transport
- deposits must meet Veil's current net minimums before fee: `0.01 ETH` or `20 USDC`

Private Veil relay actions:

- `veil_withdraw`
- `veil_transfer`
- `veil_consolidate_utxos`
- `veil_pay_x402`

These submit through the Veil relay and do not open a WalletChan popup. `veil_pay_x402` is available by default only after `veil_x402_quote`, with a tight `maxPayment` and `confirm: true` after explicit user approval. Withdraw, transfer, and consolidation require `WALLETCHAN_MCP_VEIL_PRIVATE_ACTIONS=true` and explicit user confirmation.

WalletChan MCP preflights minimum relay withdrawal amounts before calling Veil's relay:

- `veil_withdraw` minimums: `0.001 ETH` or `0.01 USDC`
- `veil_pay_x402` minimum Veil USDC relay withdrawal: `0.01 USDC`

If an x402 quote is below `0.01 USDC`, do not keep retrying `veil_pay_x402` with different payer indexes or `forceFresh`; report that the endpoint is below Veil's current x402 relay withdrawal minimum.

If Veil returns `Gas price too high, try again later`, the hosted Veil relay is refusing the private withdrawal because Base gas is above its relay cap. This is not a WalletChan RPC override problem and WalletChan MCP cannot raise the relay cap. Do not retry immediately. For x402, check `veil_x402_payer_balances` once; if a payer already has enough USDC, retry with that `payerIndex`, otherwise wait for Base gas to fall.
