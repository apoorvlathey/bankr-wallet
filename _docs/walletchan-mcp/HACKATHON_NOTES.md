# WalletChan MCP Hackathon Notes

This page captures the current MetaMask Smart Accounts Kit x 1Shot API x Venice AI hackathon direction for WalletChan MCP.

Research date: 2026-06-15.

## Active Bounty Focus

The active submission should focus on three bounty tracks:

| Bounty | WalletChan angle |
|---|---|
| Best Agent | A local agent profile can execute DeFi transactions without per-transaction user approval after the main WalletChan wallet grants a scoped daily ERC-7710 allowance. |
| Best use of 1Shot | Delegated ERC-7710 calls are relayed through 1Shot, with WalletChan MCP surfacing capability, fee, relay, and status tooling. |
| Venice | Venice is used by the external agent harness as the LLM/provider layer. No Venice-specific logic needs to live inside WalletChan MCP for the core demo. |

The primary demo story is:

```text
User pairs WalletChan once
  -> user creates/imports a local MCP agent wallet
  -> MCP fetches 1Shot capabilities and targetAddress
  -> user signs a daily ERC-7710 delegation in WalletChan
  -> agent profile executes DeFi calls through 1Shot
  -> no WalletChan popup is needed for each in-scope agent transaction
```

For the hackathon, prefer `agent:<walletId>` for automated execution. Use `walletconnect` when the user wants normal WalletChan approval, and use `agent-eoa:<walletId>` only when the user explicitly asks to spend directly from the raw local agent wallet.

## Demo Requirements

Show these properties clearly in the demo:

- the main WalletChan wallet grants a scoped allowance, not its private key
- the local agent wallet key stays encrypted in the MCP vault
- the default execution profile can be set to the delegated `agent` profile
- DeFi calls prepared by MCP tools, Base skills, or protocol integrations route through 1Shot
- 1Shot `targetAddress`, fee data, relay task ID, status, and final transaction hash are visible
- raw `agent-eoa` funding is not silently used as a fallback

Good DeFi demo candidates are existing WalletChan MCP integrations that already prepare calls, such as Morpho and first-party swap/bridge preview flows. The core point is delegated execution through 1Shot, so prefer small Base USDC actions with tight daily caps.

## x402 Research Parked For Later

x402 is not the current bounty focus. The current code and notes should remain available, but the hackathon submission should not depend on finding arbitrary public x402 endpoints that support ERC-7710 delegation.

Observed project categories from the HackQuest gallery:

| Category | Projects | Notes |
|---|---|---|
| Strong live/reference ERC-7710 x402 | [remit](https://www.hackquest.io/projects/remit), [Briefcase](https://www.hackquest.io/projects/Briefcase), [Quotra](https://www.hackquest.io/projects/Quotra), [ClashBoard](https://www.hackquest.io/projects/ClashBoard) | Best references for real delegated x402 resource-server and facilitator patterns. |
| Useful architecture references | [Guardian](https://www.hackquest.io/projects/Guardian-RAGjfA), [ARIA](https://www.hackquest.io/projects/ARIA-mluKSP), [Frost](https://www.hackquest.io/projects/Frost) | Strong lessons around 1Shot facilitator targets, parent permission context, async paid jobs, and avoiding hand-rolled x402 payloads. |
| Custom or mixed x402-like demos | [Wifix402](https://www.hackquest.io/projects/Wifix402), [WorkAgnt.Ai](https://www.hackquest.io/projects/WorkAgntAi), [PayCrawl](https://www.hackquest.io/projects/PayCrawl), [Axiom](https://www.hackquest.io/projects/Axiom-tHgcAz) | Useful product ideas, but some use custom headers, tx-hash proofs, skipped settlement, or nonstandard verification. |

Useful public endpoints for later testing:

| Project | Endpoint |
|---|---|
| remit | `GET https://remit-api.s0nderlabs.xyz/demo/premium-data` |
| Briefcase | `GET https://briefcase-api-rekh.onrender.com/api/intel/defi` |
| Quotra | `POST https://quotra-app.vercel.app/api/v1/<listingId>/chat` |
| WorkAgnt.Ai | `POST https://workagnt.ai/api/v1/chat/friday` |
| Wifix402 | `POST https://wifi-x402.vercel.app/api/purchase` |

## Future x402 Product Idea

If there is time later, build a WalletChan-owned x402 endpoint for WalletChan's own clear-signing and calldata-decoder logic.

The future product shape should be:

```text
Client submits tx / calldata / chain context
  -> WalletChan x402 endpoint advertises ERC-7710 payment
  -> delegated payment settles to WalletChan
  -> endpoint returns decoded calldata, token/spender/amount analysis, selector metadata, and risk notes
```

The paid resource is WalletChan's own decoding and clear-signing analysis.

Useful implementation lessons from the research:

- advertise `extra.assetTransferMethod: "erc7710"` in the x402 payment requirement
- use official MetaMask/x402 client helpers where possible instead of hand-rolled payment payloads
- bind the quote to method, URL, body hash, chain, asset, amount, and expiry
- keep slow analysis asynchronous if needed: paid `POST /decode` returns a job ID, free `GET /decode/:jobId` returns the result
- reject unsupported endpoints or unsupported payment rails instead of falling back to `agent-eoa`
- document whether the payment delegation target is the agent wallet, the x402 facilitator, or the 1Shot `targetAddress`; several projects require the leaf delegation to target the 1Shot relayer target advertised by the facilitator

Related implementation notes remain in `_docs/walletchan-mcp/X402_DELEGATED_PAYMENTS.md`.
