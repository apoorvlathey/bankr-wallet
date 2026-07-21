# Gas abstraction and fee-token payments

> Status: implemented behind exact account, chain, delegation, and token
> capability gates
>
> Last full catalog verification against live Pimlico token quotes: 2026-07-21

WalletChan lets an eligible user choose the chain's native currency or a
reviewed ERC-20 token to pay a transaction's network fee. Token payment uses an
ERC-4337 v0.7 UserOperation, WalletChan's official EIP-7702 delegation, a
Pimlico ERC-20 paymaster, and Pimlico's bundler. The extension never contains a
Pimlico credential; all provider traffic passes through the policy-constrained
WalletChan website route.

This document describes the shipped architecture and current catalog. It is
the source of truth for gas-payment behavior. Chain-add research must also
follow `.agents/skills/walletchan-chain-research/SKILL.md`.

## Product behavior

The transaction and atomic-batch confirmation screens show **Pay network fee
with** when the active request is eligible. The picker:

- always preserves the existing native-fee path;
- shows each available token with its logo and current nonzero balance before a
  quote is requested, omitting exact zero-balance catalog entries;
- requests a quote only after the user selects a token;
- displays the bounded maximum fee in the token's own units;
- uses an **Estimating Fees** three-dot loader while preparing the quote;
- disables Confirm until the quote is complete and valid;
- shows an explicit retry state after a timeout or provider failure;
- never silently falls back to native payment after a token was selected.

Stablecoin quotes may show an approximate dollar value. Non-stable assets do
not pretend that one token equals one dollar.

When a transaction spends the selected token, WalletChan reserves the quoted
maximum before allowing confirmation. If the requested transfer would leave
too little balance for the paymaster, the user sees a plain-language
insufficient-balance error instead of the provider's raw simulation code.

## Current fee-token catalog

Native payment remains available on every registered chain. The following
ERC-20 entries are enabled only for their exact chain/address pairs:

| Chain | Chain ID | Token-paid fee assets |
| --- | ---: | --- |
| Ethereum | 1 | USDC, USDT, stETH, wstETH, WETH |
| Optimism | 10 | USDC, USDC.e, USDT, stETH, wstETH |
| BNB Chain | 56 | USDT |
| Polygon | 137 | USDC, USDT |
| Monad | 143 | USDC, WMON |
| MegaETH | 4326 | USDm, USDT0 |
| Base | 8453 | USDC, USDT |
| Base Sepolia | 84532 | USDC |
| Arbitrum One | 42161 | USDC, USDT |
| Linea | 59144 | USDT |
| Polygon Amoy | 80002 | USDC |
| Ethereum Sepolia | 11155111 | USDC |
| Optimism Sepolia | 11155420 | USDC |
| Arbitrum Sepolia | 421614 | USDC |

Base Sepolia's Circle USDC at
`0x036CbD53842c5426634e7929541eC2318f3dCF7e` became live-quoteable in the
2026-07-21 verification and is now enabled in both catalogs. The previous
2026-07-19 check returned no quote; current live quoteability, exact Circle
address verification, and onchain `symbol()` / `decimals()` reads supersede
that older native-only result.

Robinhood Chain mainnet (`4663`) and testnet (`46630`) are also intentionally
native-only. Authenticated `pimlico_getSupportedTokens` calls returned empty
lists for both networks on 2026-07-21, so enabling their verified default
DeleGator does not add either chain to the extension or website fee-token
catalog.

The same 2026-07-21 pass checked every native testnet with a verified default
DeleGator. Hoodi, Berachain Bepolia, BNB Testnet, Ink Sepolia, Mantle Sepolia,
MegaETH Testnet, Monad Testnet, Robinhood Testnet, Sonic Testnet, Tempo
Moderato, and Unichain Sepolia returned no approved token. Linea Sepolia
returned only EURe. Ethereum Sepolia and Arbitrum Sepolia also returned PIM
and EURe, Ethereum Sepolia additionally returned `USD₮`, Polygon Amoy returned
EURe, and Base Sepolia returned PIM; those assets remain excluded because they
are outside the reviewed exact-address catalog. Existing USDC entries on
Ethereum Sepolia, Arbitrum Sepolia, Optimism Sepolia, and Polygon Amoy all
returned live quotes and remain enabled.

The exact checksummed addresses, decimals, stablecoin classification, logos,
and maximum fee ceilings live in:

- `apps/extension/src/chrome/feePayment/tokens.ts`
- `apps/website/app/api/gas/pimlico/[chainId]/tokens.ts`

These files are independent security boundaries and must contain the same
normalized address set for every enabled chain. Hardcoded addresses include a
chain-name comment so reviewers never have to interpret a bare chain ID.

XAUt, XAUt0, and USAT are deliberately excluded from the product catalog.
Provider discovery must not add niche or newly listed assets automatically.

## Account eligibility

WalletChan has four signing account types and the fee path must be tested with
all four. Ledger remains deliberately ineligible because the ERC-4337 path has
no hardware-signing implementation:

| Account type | Existing official delegation | First-use delegation |
| --- | --- | --- |
| Private key | Supported | Supported in the submitted UserOperation |
| Seed phrase | Supported | Supported in the submitted UserOperation |
| Bankr API | Supported | Not supported until its signing API can create the required first-use authorization |
| Ledger | Not supported | Not supported |

View-only impersonator accounts are never eligible.

Eligibility also requires:

- the request to be a supported transaction or atomic ERC-5792 batch;
- a chain with a deployed and verified WalletChan official delegate;
- an exact token entry in the built-in catalog;
- a live token balance read;
- a nonzero balance for the token to appear in the picker;
- no conflicting pending EOA transaction during first-use authorization;
- no foreign onchain delegation;
- force inclusion to be disabled.

Unknown chains, unknown token addresses, contract deployments without the
expected delegate behavior, and stale account/request bindings fail closed.
An exact zero balance removes only that ERC-20 option; native payment remains
available. A nonzero but insufficient balance remains visible so the bounded
quote can explain the actual maximum-fee shortfall.

## Execution flow

For an eligible token selection, WalletChan performs the following sequence:

1. Pin the pending request family, request ID, account, chain, exact calls,
   EntryPoint nonce, EOA nonce, delegation state, and selected token.
2. Ask the WalletChan proxy for a live Pimlico token quote.
3. Read the quoted paymaster allowance and selected-token balance.
4. Construct the delegated account call. When allowance is insufficient,
   prepend `approve(quotedPaymaster, maximumTokenCost)` to the same atomic
   UserOperation.
5. Request paymaster stub data and estimate the complete UserOperation.
6. Request final paymaster data after the final gas estimate. Gas fields are
   never mutated after this point.
7. Re-read the account, request authority, nonces, delegate, allowance, and
   token balance immediately before signing.
8. For a fresh private-key or seed account, create the one-time EIP-7702
   authorization for WalletChan's official delegate.
9. Sign the exact EntryPoint v0.7 UserOperation typed data.
10. Persist the locally computed UserOperation hash and public recovery routing
    before broadcast.
11. Submit through the policy-constrained proxy and wait for independently
    verified onchain finality.

The token approval is exact and bounded. `uint256.max` is permitted only in an
unsigned estimation envelope that is replaced before signing. A submitted
operation either has no approval because allowance already covers the quote or
contains the precise approval needed for that operation.

## Quote lifecycle

Prepared quotes live only in service-worker memory for 45 seconds. A quote is
single-use and binds:

- transaction or batch family and request ID;
- account ID, address, and signing type;
- chain ID and exact calls;
- selected token address, symbol, and decimals;
- paymaster and maximum token cost;
- EntryPoint and EOA nonce snapshots;
- delegation state.

Any edited call, account switch, chain switch, nonce race, delegate change,
allowance change, token substitution, expiration, or service-worker restart
invalidates the quote and requires explicit retry.

The renderer bounds fee-option discovery to 10 seconds and quote preparation
to 30 seconds. Late callbacks are ignored. A failed or expired request never
automatically loops, and the confirmation parent remains the sole owner of a
completed quote so ordinary rerenders cannot restart estimation.

## First-use delegation simulation

A fresh local account has no delegated code yet, but the account code is needed
to estimate its first UserOperation. Estimation therefore uses:

- Pimlico's documented dummy authorization; and
- an exact sender-only state override containing WalletChan's immutable
  delegation designator.

The proxy accepts that override only for
`eth_estimateUserOperationGas`, only when a matching authorization is present,
and only when the override contains the single expected code field. Submission
never accepts a state override. The real authorization is created only after
the user confirms and is included in the signed operation.

## Fee safety ceilings

Every catalog token has an absolute base-unit limit for one network fee:

- stablecoins: 100 whole tokens;
- currently enabled non-stable assets: one whole token.

The extension rejects a provider quote above the selected asset's ceiling
before it can reach signing. The ceiling is a final loss bound, not a displayed
estimate or a substitute for the live quote.

## Website proxy boundary

The public route is:

`/api/gas/pimlico/[chainId]`

`PIMLICO_API_KEY` is server-only. `PIMLICO_PROXY_DISABLED=true` is the
operational kill switch. The proxy:

- accepts only explicitly allowlisted JSON-RPC methods;
- accepts only exact catalog chains, EntryPoint, and token addresses;
- bounds request size, response size, duration, and rate;
- rejects arbitrary RPC forwarding;
- permits the exact estimation-only sender-code override described above;
- never permits a state override on submission;
- verifies the sender's UserOperation signature before forwarding
  `eth_sendUserOperation`;
- verifies any attached EIP-7702 authorization recovers to the same sender and
  targets WalletChan's official delegate on the route chain;
- logs bounded operational metadata but never credentials, full signatures,
  authorizations, or calldata.

The proxy token catalog is kept separate from the extension catalog on purpose:
the renderer cannot grant itself relay access by supplying an arbitrary token.
Tests must prove the two exact address sets stay synchronized.

## Recovery and transaction history

Immediately before submission, WalletChan stores a bounded
`pendingUserOperations` record containing only:

- version;
- request family and transaction ID;
- locally computed UserOperation hash;
- public sender address;
- chain ID;
- creation timestamp.

Calldata, token quotes, paymaster data, signatures, authorizations, private
keys, passwords, and API credentials are never persisted in this record.

A definite provider rejection removes the record. A timeout, transport error,
5xx response, malformed response, or returned-hash mismatch is outcome
unknown: WalletChan retains the record and never blindly resubmits it. Startup
recovery checks the exact onchain EntryPoint event and sender before updating
transaction history or ERC-5792 status.

Completed history stores the selected fee-token symbol. Receipt enrichment
uses that marker to avoid attributing the bundler's native gas transfer to the
user. The activity view therefore shows the user's actual asset changes rather
than a false native-token receipt.

## Adding a chain or token

Use `.agents/skills/walletchan-chain-research/SKILL.md`. The minimum gate is:

1. Verify chain metadata and live RPC chain ID.
2. Verify WalletChan's official delegate is deployed and usable.
3. Call `pimlico_getSupportedTokens` with the server-side developer key on the
   exact chain endpoint.
4. Select only already approved product asset families unless the user
   explicitly approves a new one.
5. Call `pimlico_getTokenQuotes` for every proposed exact address using
   WalletChan's EntryPoint v0.7 and route chain ID.
6. Verify address checksum, symbol, and decimals onchain.
7. Update both catalog files in the same change and include readable chain-name
   comments.
8. Extend extension catalog and proxy-policy tests so normalized sets cannot
   drift.
9. Re-run live quote checks immediately before handoff.

Never infer support from a token deployment, ticker, static documentation, or
another chain. If discovery cannot be authenticated or the live quote result
is empty, leave the chain native-only.

## Required validation

Before release or commit, run:

```bash
pnpm --filter @walletchan/extension exec tsx --test 'tests/feePayment/*.test.ts'
pnpm --filter @walletchan/website exec tsx --test tests/pimlicoProxyPolicy.test.ts tests/pimlicoProxyRoute.test.ts
pnpm --filter @walletchan/extension exec tsx --test tests/background/transactionExecutionRouter.test.ts tests/background/batchRequestRouter.test.ts tests/history/assetExtraction.test.ts tests/storage/resetManifest.test.ts
pnpm build:extension
```

The automated matrix must cover private-key, seed-phrase, and Bankr API account
routes. Manual testing must cover existing delegation and first-use delegation
where supported, insufficient selected-token balance, allowance present and
absent, provider timeout, quote expiry, service-worker restart, successful
receipt reconciliation, and transaction-history asset attribution.

## Operational notes

- Token and chain capability data can change without a WalletChan release.
- The production API must be deployed with `PIMLICO_API_KEY`; the extension
  must never receive that value.
- The local development extension targets the website server on port 3030.
- If provider behavior is uncertain, disable the exact chain/token pair or use
  `PIMLICO_PROXY_DISABLED=true` rather than weakening validation.
- Native fee payment remains the safe fallback only when the user explicitly
  selects it.

## Primary references

- Pimlico ERC-20 paymaster supported tokens:
  `https://docs.pimlico.io/references/paymaster/erc20-paymaster/supported-tokens`
- Pimlico token discovery endpoint:
  `https://docs.pimlico.io/references/paymaster/erc20-paymaster/endpoints/pimlico_getSupportedTokens`
- Pimlico token quote endpoint:
  `https://docs.pimlico.io/references/paymaster/erc20-paymaster/endpoints/pimlico_getTokenQuotes`
- ERC-4337: `https://eips.ethereum.org/EIPS/eip-4337`
- EIP-7702: `https://eips.ethereum.org/EIPS/eip-7702`
- ERC-5792: `https://eips.ethereum.org/EIPS/eip-5792`
