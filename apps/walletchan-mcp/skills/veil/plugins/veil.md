# Veil Cash Plugin for WalletChan MCP

Veil Cash is a privacy pool for ETH and USDC on Base mainnet.

Supported chain: Base mainnet (`8453`, WalletChan chain name `base`).

## Setup

Call WalletChan MCP `veil_status` first. If it reports no Veil key, call `veil_init_keypair`. This creates `.env.veil` in WalletChan MCP's managed Veil directory and returns only the public deposit key.

Do not ask the user to paste a raw `VEIL_KEY` unless they explicitly want to import an existing Veil key outside this flow.

WalletChan MCP passes a Base `RPC_URL` to the Veil MCP child. It always inherits from WalletChan MCP's global Base RPC resolution: `--rpc base=<url>` or `WALLETCHAN_MCP_RPC_OVERRIDES=base=<url>`, otherwise WalletChan's Base default. If Veil reports public RPC rate limits, retry after configuring the global Base RPC with `--rpc base=...`.

## Wallet Mapping

Use WalletChan MCP tools instead of Base MCP:

- Base MCP `get_wallets` -> WalletChan MCP `get_wallets`
- Base MCP `send_calls` -> WalletChan MCP `send_prepared_calls`
- Base MCP `get_request_status` -> WalletChan MCP `get_request_status`

The first-class WalletChan Veil prepare wrappers can do this mapping directly:

```json
{
  "owner": "0x...",
  "asset": "USDC",
  "amount": "10",
  "submitPreparedCalls": true
}
```

If `owner` is omitted on owner-required Veil tools, WalletChan MCP uses the first approved WalletChan account.

## Read Tools

```text
veil_status({ owner? })
veil_get_balances({ owner?, pool?: "eth" | "usdc" | "all" })
veil_deposit_status({ owner?, pool: "eth" | "usdc", nonce })
veil_wait_for_deposit({ owner?, pool: "eth" | "usdc", nonce, timeoutSeconds?, intervalSeconds? })
veil_x402_quote({ url, method?, body?, headers?, maxPayment? })
veil_x402_receipts({ limit? })
veil_x402_payer_balances({ discover?, startIndex?, count?, nonZeroOnly? })
veil_subaccount_status({ slot })
```

## Public Prepare and Submit Tools

```text
veil_prepare_register({ owner?, force?, submitPreparedCalls? })
veil_prepare_deposit({ owner?, asset: "ETH" | "USDC", amount, submitPreparedCalls? })
```

Without `submitPreparedCalls`, these return Veil's prepared payload:

```json
{
  "chain": "base",
  "calls": [
    { "to": "0x...", "value": "0x0", "data": "0x..." }
  ]
}
```

With `submitPreparedCalls: true`, WalletChan MCP submits the prepared calls through WalletChan popup approval and returns a `submission` object with the WalletChan request id.

For USDC deposits, the prepared calls are ordered approval first, then deposit. Submit the full call set.

Before preparing or submitting a deposit, WalletChan MCP checks Veil's current net minimums. Requests below `0.01 ETH` or `20 USDC` are blocked because Veil would revert with `MinimumDepositNotMet`.

If `veil_prepare_register` returns `action: "alreadyRegistered"` with an empty `calls` array, do not submit calls. Continue to deposit or balance checks.

Deposit amounts are net amounts. Veil includes the protocol fee in the prepared calldata. Minimums are `0.01 ETH` and `20 USDC`.

## Deposit Lifecycle

After WalletChan confirms the Base transaction, funds enter the Veil queue before becoming private balance. Typical processing is around 8-12 minutes.

Use `veil_get_balances` to discover pending deposits and `veil_deposit_status` to track a known nonce. Report the lifecycle clearly: submitted on Base, pending in queue, then accepted into private balance.

## Private Relay Actions

Do not route private Veil relay actions through WalletChan `send_calls`.

`veil_withdraw`, `veil_transfer`, `veil_consolidate_utxos`, and `veil_pay_x402` move funds through the Veil relay without a WalletChan popup. `veil_pay_x402` is available by default only after a successful quote, with a tight `maxPayment` and `confirm: true` after explicit user approval. Withdraw, transfer, and consolidation require `WALLETCHAN_MCP_VEIL_PRIVATE_ACTIONS=true`.

WalletChan MCP blocks under-minimum relay withdrawals before calling Veil:

- normal `veil_withdraw`: minimum `0.001 ETH` or `0.01 USDC`
- `veil_pay_x402` USDC relay withdrawal: minimum `0.01 USDC`

When `veil_x402_quote` returns a supported price below `0.01 USDC`, do not keep retrying payment with different payer indexes or `forceFresh`; report that the endpoint price is below Veil's x402 relay withdrawal minimum.

When a private relay action returns `Gas price too high, try again later`, the hosted Veil relay refused the withdrawal because Base gas is above its relay cap. This is independent of WalletChan MCP's configured Base RPC URL. Do not retry immediately. For x402, call `veil_x402_payer_balances` once; if a payer already has enough USDC, retry payment with that `payerIndex`, otherwise wait for Base gas to fall.

For x402, quote first:

```text
veil_x402_quote({ url, method?, body?, headers?, maxPayment? })
```

If the quote is supported and the user approves the exact spend, pay with the same request fields plus `maxPayment` and `confirm: true`:

```text
veil_pay_x402({ url, method?, body?, headers?, maxPayment?, payerIndex?, forceFresh?, confirm: true })
```

For POST endpoints, keep `method: "POST"` and the request `body` as top-level fields on both quote and pay. WalletChan MCP normalizes lowercase method values and infers POST when a body is present, but agents should still send the explicit uppercase method to match Veil's raw MCP schema.

Never reveal `VEIL_KEY`, proof internals, nullifiers, encrypted outputs, payer private keys, or signatures.
