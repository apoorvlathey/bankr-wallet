# WalletChan MCP Delegated x402 Payments

This page documents WalletChan MCP's delegated x402 flow for MetaMask ERC-7710 payments.

Status: parked for later. The current hackathon submission should focus on delegated DeFi execution through 1Shot and Venice in the external agent harness. Keep this page as implementation and research context for future delegated x402 work.

The delegated x402 flow is:

```text
Agent harness
  -> WalletChan MCP agent_x402_quote / agent_x402_pay
  -> x402 resource server that advertises ERC-7710
  -> MetaMask x402 facilitator verification and settlement
  -> USDC paid from the main WalletChan smart account's delegation
```

The agent wallet signs the delegated payment context. The main WalletChan wallet is the payer.

## Tools

Use:

- `agent_x402_quote`
- `agent_x402_pay`

`agent_x402_quote` probes the endpoint without signing or paying. It returns `delegatedPaymentSupported: true` only when the endpoint's x402 payment requirements include an ERC-7710 option.

`agent_x402_pay` defaults to the delegated `agent:<walletId>` profile. This path requires:

- an agent wallet
- an active ERC-7710 delegation to the agent wallet address
- a x402 endpoint that advertises `extra.assetTransferMethod: "erc7710"`
- a payment amount within `maxPayment` or `maxPaymentUnits`

The delegated path returns `executionMode: "delegated_erc7710_x402"` and `fundingSource: "delegated_main_wallet_usdc"` when payment is submitted.

`agent-eoa:<walletId>` is an explicit raw fallback. It uses the agent wallet as the payer and returns `fundingSource: "agent_wallet_usdc"`. Do not use it for the delegated hackathon flow unless the user explicitly asks for raw agent-wallet payment.

## Delegation Target

Delegated x402 payment needs a delegation whose `delegate` is the agent wallet address itself.

That differs from 1Shot execution:

| Flow | Delegation target |
|---|---|
| 1Shot DeFi execution | 1Shot relayer `targetAddress` |
| x402 payment | agent wallet address |

The x402 code rejects a delegated payment when it cannot find an active delegation for the agent wallet address, the x402 asset, and an amount at least as large as the payment requirement.

## Seller Requirement

Delegated x402 is seller-advertised. The buyer cannot force an arbitrary x402 endpoint to accept ERC-7710.

The resource server must return HTTP `402 Payment Required` with x402 requirements that include:

```json
{
  "scheme": "exact",
  "network": "eip155:8453",
  "extra": {
    "assetTransferMethod": "erc7710"
  }
}
```

If `agent_x402_quote` returns:

```json
{
  "delegatedPaymentSupported": false,
  "delegatedPaymentOptions": []
}
```

then the endpoint does not support delegated ERC-7710 x402 payment directly. The correct behavior is to stop and report that, not to pay from `agent-eoa`.

## Fund Flow

When the endpoint supports ERC-7710, the flow is:

```text
1. MCP calls the resource without payment.
2. Resource server returns HTTP 402 and ERC-7710 x402 requirements.
3. MCP selects an ERC-7710 requirement within maxPayment.
4. MCP finds an active delegation from the main WalletChan account to the agent wallet.
5. Agent wallet signs/produces the redelegated x402 payment payload.
6. Resource server sends the payload to the MetaMask x402 facilitator.
7. Facilitator verifies and settles the USDC transfer from the main wallet's delegated authority.
8. Resource server returns the protected response.
```

The USDC is transferred to the resource server's `payTo` address. The agent wallet does not need to hold USDC for this delegated path, although it may still need gas or funds for unrelated raw-agent flows.

## Future WalletChan x402 Endpoint

Most public x402 endpoints currently advertise EIP-3009 or Permit2 style exact payment, not ERC-7710. Do not prioritize x402 for the current hackathon unless the endpoint directly supports ERC-7710 delegation.

The preferred future WalletChan product is a first-party x402 endpoint for WalletChan's own clear-signing and calldata-decoder logic:

```text
Client submits transaction / calldata / chain context
  -> WalletChan x402 endpoint advertises ERC-7710 payment
  -> delegated payment settles to WalletChan
  -> endpoint returns decoded calldata, token/spender/amount analysis, selector metadata, and risk notes
```

The paid resource is WalletChan's own decoding and clear-signing analysis.

Research notes and candidate reference projects are tracked in `_docs/walletchan-mcp/HACKATHON_NOTES.md`.

## Prompting Pattern

For future delegated x402 tests, prompts should be explicit:

```text
Use WalletChan MCP delegated agent profile, not agent-eoa.
Call agent_x402_quote first.
If delegatedPaymentSupported is false, stop and report that the endpoint does not support ERC-7710 x402.
If delegatedPaymentSupported is true, call agent_x402_pay with profileId "agent:<walletId>".
Do not use agent-eoa and do not pay from the raw agent wallet.
```

If the MCP server is configured as `npx -y @walletchan/mcp`, the client may be running the published package rather than local repo changes. For local testing after editing this repo, build and point the MCP client at:

```bash
pnpm --filter @walletchan/mcp build
node /Users/apoorvlathey/blockchain/wchan/walletchan/apps/walletchan-mcp/dist/index.js
```

## Troubleshooting

`delegatedPaymentSupported: false`

The endpoint did not advertise ERC-7710. Use an ERC-7710-aware endpoint or a future WalletChan-owned x402 endpoint.

`No active ERC-7710 x402-compatible delegation found`

Prepare a delegation to the agent wallet address, not the 1Shot `targetAddress`, with the same token and enough `amountUnits`.

Payment result says `paid via agent EOA` or `fundingSource: "agent_wallet_usdc"`

The caller used `agent-eoa:<walletId>` or an older MCP build. Use `agent:<walletId>` and restart the MCP server after building local changes.

Endpoint returns success without a payment response header

The resource did not require x402 payment for that request. MCP reports `payment_not_required` and `fundingSource: "none"` for the delegated path.
