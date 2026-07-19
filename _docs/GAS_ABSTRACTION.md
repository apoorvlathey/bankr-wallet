# Gas abstraction and fee-token payments

> Status: implementation code-complete behind capability gates; live Pimlico token quotes verified, while the manual wallet matrix and external security review remain release blockers
>
> Last verified: 2026-07-19
>
> Scope: native-gas-free transactions across every WalletChan EVM chain with a
> verified smart-account deployment, ERC-20 fee payments, EIP-7702, ERC-7710,
> ERC-4337 paymasters, relayers, MetaMask, Ambire, Rabby, WalletChan
> send/swap/bridge/dapp flows, all signing account types, UX, security, and
> rollout gates

## Executive recommendation

WalletChan should add **Pay network fee with** as a native property of every
transaction review, not create a separate “gas wallet” product for the first
release.

For private-key and seed-phrase accounts, the first implementation should use
**Pimlico's ERC-4337 v0.7 bundler and ERC-20 paymaster** with the MetaMask
Delegation Framework contract that WalletChan already makes the default
EIP-7702 delegate:

1. Prepare and simulate the user's exact requested call or atomic batch.
2. Construct a MetaMask `EIP7702StatelessDeleGator` PackedUserOperation for
   EntryPoint v0.7, using the DeleGator's `execute`/`executeWithMode` encoding.
3. Ask Pimlico for the selected catalog-token quote and paymaster data. If the current
   allowance is insufficient, prepend an exact bounded approval to the quoted
   paymaster inside the same UserOperation.
4. Have the local account sign the MetaMask DeleGator UserOperation typed data.
5. If the account is not yet delegated to WalletChan's canonical official
   delegate, attach an `eip7702Auth` signed with the EOA's current nonce.
6. Submit through Pimlico's v0.7 bundler and track the UserOperation through
   inclusion, replacement, timeout, and final transaction receipt.

This is materially different from WalletChan's current self-sponsored EIP-7702
path. EIP-7702 makes the account programmable, but a normal type-4 transaction
signed and sent by the EOA still requires that EOA to hold the chain's native
gas token. Gas abstraction requires a second account, bundler, or relayer to
pay the outer transaction.

Pimlico is the primary infrastructure choice because it supports the exact
standards WalletChan needs: EntryPoint v0.7, `eip7702Auth` on
`eth_sendUserOperation`, ERC-20 token quotes, and token paymaster data. This
keeps the official MetaMask delegate at the user's address while avoiding a
custom production relayer in the first release. It:

- reuses the exact MetaMask DeleGator already present in WalletChan's
  architecture and its fixed EntryPoint v0.7;
- lets the approval, user calls, and fee settlement share one atomic
  UserOperation;
- can install the official delegate on first use without requiring native gas;
- provides standardized estimation, submission, and receipt endpoints;
- preserves the original EOA address and dapp-facing account;
- can be added behind the current transaction confirmation paths without
  exposing a new dapp signing method.

The first production scope should be deliberately narrow:

- **Accounts:** private key and seed phrase accounts support both existing and
  one-time official delegation. Bankr API accounts are enabled only when the
  official delegate is already active: Bankr can sign the UserOperation typed
  data, but its API does not expose the special first-use EIP-7702 authorization
  signer. View-only impersonator accounts remain ineligible.
- **Chains:** USDC payment ships on the verified Pimlico/EIP-7702 overlap:
  Ethereum, Base, Polygon, Arbitrum, Optimism, Monad, Ethereum Sepolia,
  Polygon Amoy, Arbitrum Sepolia, and Optimism Sepolia. Base Sepolia is omitted
  because Pimlico currently returns no USDC quote there. Native payment remains
  available through the existing transaction path on every supported chain.
- **Fee assets:** the chain's native token plus exact catalog entries for USDC,
  USDT, USDT0, USDm, USDC.e, WETH, stETH, wstETH, and WMON. Additional chains
  and tokens require an explicit provider/token capability entry and
  the same conformance gate; never infer support from token deployment alone.
- **Flows:** normal dapp `eth_sendTransaction`, WalletChan Send, ERC-5792 atomic
  batches, then in-wallet swap and bridge after Max/reserve accounting is
  correct.
- **No cross-chain fee balance in v1:** the fee token must be held on the same
  source chain as the transaction.

Do not launch a prepaid custodial “Gas Tank” in v1. Ambire and Rabby show that
it can offer excellent cross-chain convenience, but it introduces deposit and
withdrawal policy, custody/accounting, reconciliation, insolvency, abuse,
regulatory, and recovery surfaces that are disproportionate to WalletChan's
immediate goal: letting a USDC-only account use its USDC.

## User problem and product promise

The core failure case is simple:

> The account has useful funds but cannot spend them because it has no native
> gas token on that chain.

Examples:

- A user receives USDC on any supported EVM chain and wants to deposit it into
  Aave or another protocol.
- A user receives USDC and wants to swap part of it to ETH.
- A user wants to send USDC to another account.
- A dapp asks for an approval and a deposit, but the account has no ETH.
- A bridge source transaction requires native gas even though the account has
  ample ERC-20 balance.

WalletChan's user-facing promise should be:

> Pay the network fee with a token you already hold. No ETH needed for this
> transaction.

It should not say “gasless” when the user is paying a token-denominated fee.
“Gasless” should be reserved for true sponsorship where WalletChan or a dapp
pays the entire fee.

## Product principles

1. **Network fee, not protocol mechanics.** New users choose a payment asset;
   they do not choose a paymaster, bundler, EntryPoint, or relayer.
2. **Native remains the quiet default when healthy.** Do not unexpectedly sell
   or transfer a user's ERC-20 when they have enough native token and have not
   expressed a preference.
3. **Rescue automatically when native is insufficient.** If an eligible held
   token can cover the fee, select the best option and keep Confirm enabled.
4. **One review, one signature, one result.** The app action and fee payment
   are one intent. A separate approval or setup prompt defeats the rescue UX.
5. **Exact total before approval.** Show the token amount, fiat value, service
   fee/spread, and the user's resulting balance.
6. **Progressive disclosure.** Put relay and smart-account details under
   Advanced; keep material fee and failure information in the main review.
7. **No silent fallback that changes who pays.** If the relay route fails,
   never broadcast a native-gas transaction unless the user explicitly reviews
   and confirms that fallback.
8. **All flows share one quote/execution policy.** Send, swap, bridge, dapp
   single transactions, ERC-5792, and WalletConnect must not grow independent
   gas-abstraction implementations.
9. **Account and intent pinning are mandatory.** A quote belongs to an exact
   account, chain, calls hash, fee token, amount, and expiry.
10. **Allowlist before breadth.** “Any token” is a long-term routing goal, not a
    safe v1 contract promise.

## What EIP-7702 does and does not provide

EIP-7702 adds a type-4 transaction whose authorization list can point an EOA's
code to a delegate implementation. It explicitly targets batching,
sponsorship, and reduced permissions. The outer transaction still has an
ordinary transaction sender that pays gas.

There are two sponsorship shapes:

### Self-sponsored type-4 transaction

```text
EOA signs outer type-4 transaction
  -> EOA is transaction sender
  -> EOA pays native gas
  -> authorization may install/replace delegate
  -> EOA self-calls delegate execute(...)
```

This is WalletChan's current PK/seed atomic batching path. It solves atomicity,
not a zero-native balance.

### Third-party sponsored execution

```text
User signs narrowly scoped authority or UserOperation
  -> relayer/bundler is outer transaction sender
  -> relayer/paymaster supplies native gas
  -> smart-account logic validates user authority
  -> user reimburses in ERC-20, or sponsor absorbs the fee
```

EIP-7702's security section warns that a sponsored-transaction user can grief a
relayer by invalidating authorization or moving reimbursement assets before
inclusion. WalletChan must treat quote-to-submit as an adversarial race, not
just an API integration.

Primary standards:

- [EIP-7702: Set Code for EOAs](https://eips.ethereum.org/EIPS/eip-7702)
- [EIP-5792: Wallet Call API](https://eips.ethereum.org/EIPS/eip-5792)
- [ERC-7821: Minimal Batch Executor Interface](https://eips.ethereum.org/EIPS/eip-7821)
- [ERC-4337: Account Abstraction Using Alt Mempool](https://eips.ethereum.org/EIPS/eip-4337)
- [ERC-7677: Paymaster Web Service Capability](https://ercs.ethereum.org/ERCS/erc-7677)
- [ERC-7902: Wallet Capabilities for Account Abstraction](https://ercs.ethereum.org/ERCS/erc-7902)

## Multi-chain scope

Gas abstraction is a WalletChan account capability, not a Base feature. The
first USDC implementation boundary is the intersection of:

```text
WalletChan built-in EVM chain
AND EIP-7702 active
AND canonical MetaMask v1.3 contracts verified onchain
AND chain gas estimation validated
AND canonical USDC configured
AND Pimlico documents and live-verifies EntryPoint v0.7 ERC-20 paymaster support
```

The initial production set is Ethereum, Base, Polygon, Arbitrum, and Optimism.
The wider table remains the research target for future provider support or the
custom-relay fallback; deployment presence alone does not enable USDC payment.

| Chain | Chain ID | Native fee asset | Canonical v1.3 stack in installed registry | Gas-abstraction focus |
| --- | ---: | --- | --- | --- |
| Ethereum | 1 | ETH | Yes | High absolute revert-loss risk, EIP-1559 spikes, token liquidity, strict quote caps |
| Optimism | 10 | ETH | Yes | L1 data fee accounting and OP Stack estimation |
| BNB Chain | 56 | BNB | Yes | Native pricing and BNB-specific fee behavior; USDT/USDC address allowlist |
| Unichain | 130 | ETH | Yes | OP Stack L1 fee plus Flashblocks receipt behavior |
| Polygon | 137 | POL | Yes | POL-native accounting and canonical-versus-bridged stablecoins |
| Monad | 143 | MON | Yes | Newer-chain RPC/fee-market maturity and canonical stablecoin discovery |
| Sonic | 146 | S | Yes | Native-token pricing, stablecoin liquidity, and hidden-by-default product state |
| Berachain | 80094 | BERA | Yes | BERA-native accounting and chain-specific token allowlist |
| Arbitrum | 42161 | ETH | Yes | L1 data fee accounting; Circle v0.7 is a possible benchmark, not the wallet architecture |
| Ink | 57073 | ETH | Yes | OP Stack accounting and chain/token liquidity validation |
| Linea | 59144 | ETH | Yes | L1/L2 fee model and canonical stablecoin validation |
| Mantle | 5000 | MNT | Yes | Non-ETH native token and hidden-by-default product state |
| MegaETH | 4326 | ETH | Yes | Special gate: dual compute/storage gas, chain-native estimation only, type-4 validation |
| Tempo | 4217 | USD, 6 decimals | Yes | Special gate: chain-native fee-token transaction model may be preferable to relay abstraction |
| Base | 8453 | ETH | Yes | OP Stack L1 fee plus Flashblocks; one of several deployment targets |

This list must be derived from the registry at build time or generated into a
reviewed capability table; it must not become another manually drifting chain
list. A future built-in or custom chain can qualify through the same live code,
gas, token, and relay checks. Presence in MetaMask's broader deployment package
alone does not make a chain a WalletChan product target.

### Chain-neutral architecture, chain-specific policy

The signed exact-execution format, quote schema, confirmation UI, storage state
machine, and relay API should be identical across chains. The following remain
per-chain configuration:

- native asset address/symbol/decimals and price source;
- EIP-1559 versus chain-specific fee fields;
- L1 data fee and other rollup surcharges;
- gas buffer and estimator strategy;
- confirmation/reorg policy;
- canonical fee-token addresses and behavior flags;
- minimum/maximum token payment and service fee;
- maximum relayer gas loss per transaction/account/origin;
- relay hot-wallet inventory and replenishment threshold;
- RPC quorum/failover;
- whether native-token sends, swaps, and bridges are eligible.

This is why a provider-only ERC-4337 strategy is not the main recommendation:
today's paymaster network and EntryPoint coverage is fragmented. A WalletChan
relay can support the same canonical DeleGator execution on every verified
chain while still allowing a provider-backed route where it is genuinely
compatible.

## Market comparison

### Summary

| Product | User mental model | Execution/payment model | Token source | Strongest UX idea | Main drawback for WalletChan |
| --- | --- | --- | --- | --- | --- |
| MetaMask gas-included transactions | Pick the token beside Network fee | EIP-7702 + exact ERC-7710 delegation + MetaMask relay; an ERC-20 fee transfer is appended to execution | Same-chain wallet balance | Auto-select eligible token only when native is insufficient; always allow changing it | Proprietary relay/quote service; bridge not currently covered; hardware and contract-deployment restrictions |
| MetaMask gas sponsorship | “Paid by MetaMask” | EIP-7702 + relay; no token repayment | Sponsor budget | No user decision when eligible | Limited networks/types and availability; not a user-funded general solution |
| Ambire fee token | Choose token/account/speed in fee estimation | Smart-account meta-transaction or ERC-4337 paymaster; fee call included | Same-chain token or another owned EOA | Powerful payer/token/speed matrix | Much more UI and account machinery than WalletChan needs initially |
| Ambire Gas Tank | Prepay once, spend gas across chains | Custodial/offchain relayer credit plus onchain fee calls | Prepaid tokens from supported chains | Cross-chain gas balance and savings/cashback | Deposits are documented as non-withdrawable; custody/accounting and relayer dependency |
| Rabby GasAccount | One USD gas balance for all chains | Hosted account/session + backend gas delivery/submission | Prepaid hosted balance | Clear rescue path, top-up from the failed confirmation, broad flow coverage | Hosted/custodial dependency; login signature; custom RPC and WalletConnect limitations; native top-up overhead |
| OKX Gas Station | Stablecoin selected in Network Fee | Third-party relayer; repayment in same transaction; first-use EIP-7702 setup bundled | Same-chain USDC/USDT/USDG | Highest stablecoin balance auto-selected when native is low | Stablecoin/network limits, third-party relay, first-use setup fee, no native-token transfers |
| Coinbase CDP ERC-20 Paymaster | Pay gas in USDC | ERC-4337 paymaster pulls token under allowance | Same-chain USDC | Standard paymaster RPC exposes accepted tokens and max fee | Base-only, standing/top-up allowance, and EntryPoint v0.6 is incompatible with WalletChan's current delegate |
| Circle Paymaster | Pay gas in USDC | Permissionless ERC-4337 token paymaster, prefund then refund | Same-chain USDC | No API key; clear onchain fee/refund events | USDC only; 10% surcharge on Base/Arbitrum; EntryPoint/version compatibility must match delegate |
| Alchemy token gas policy | App configures token and fee recipient | Managed paymaster; post-op settlement | Same-chain configured token | Exact post-op charging and automatic approval path | Policy owner is billed; approval/revert loss modes; vendor account stack |
| Biconomy MEE | Any token, potentially on another chain | Vendor orchestration and EIP-7702/Fusion | Same- or cross-chain | Most ambitious chain abstraction | Different delegate/account orchestration and larger vendor/trust surface |

### MetaMask: gas-included transactions

The inspected MetaMask extension checkout was commit
`07dbd776df87515f6fc4a80a2a07107f77df2046` (2026-06-22).

MetaMask's official user documentation currently describes gas-included Send
and dapp transactions on Ethereum, BNB Chain, Arbitrum, Polygon, Linea, Base,
and Tempo. If native balance is insufficient, an eligible token is selected
automatically. If native balance is sufficient, the user can still open the
Network fee row and choose a token. The picker shows token fee amounts,
balances, and a small MetaMask fee.

Official product references:

- [How to use gas-included transactions](https://support.metamask.io/manage-crypto/transactions/metamask-gas-station/)
- [How gas and gas-included transactions work](https://support.metamask.io/more-web3/learn/user-guide-gas)
- [MetaMask smart accounts and the canonical delegate](https://support.metamask.io/configure/accounts/what-is-a-smart-account/)
- [MetaMask 2025 gas-abstraction roadmap](https://metamask.io/news/metamask-roadmap-2025)

The implementation is more informative than the marketing language:

1. Transaction simulation returns `tokenFees`, including token address,
   decimals, required balance, current balance, recipient, conversion rate,
   gas for the transfer, and optional service fee.
2. The confirmation stores a selected gas token. If native balance is
   insufficient, the first eligible non-native token is selected
   automatically.
   The compact selected-token control shows an icon, symbol, and chevron; its
   modal rows show balance on the left and fee in fiat/token units on the
   right, with a visible selection rail and actionable native-balance warning.
3. Confirmation builds an extra `ERC20.transfer(feeRecipient, amount)`
   execution.
4. The original execution plus fee transfer are encoded into a constrained
   `redeemDelegations` call.
5. The account signs an ERC-7710 delegation with `LimitedCallsEnforcer(1)` and
   `ExactExecutionEnforcer` or `ExactExecutionBatchEnforcer`.
6. MetaMask's relay submits the outer transaction and returns a job UUID; the
   extension polls until a transaction hash or failure is available.
7. For a fresh smart account, the relay request may also contain an EIP-7702
   authorization list.

This is not a generic ERC-4337 paymaster flow. It is a relayed, exact
delegation redemption. That distinction matters because WalletChan already has
the required DeleGator and ERC-7710 signing primitives.

Inspected source:

- [Relay publish hook and appended token transfer](https://github.com/MetaMask/metamask-extension/blob/07dbd776df87515f6fc4a80a2a07107f77df2046/app/scripts/lib/transaction/hooks/delegation-7702-publish.ts)
- [Exact delegation and `redeemDelegations` construction](https://github.com/MetaMask/metamask-extension/blob/07dbd776df87515f6fc4a80a2a07107f77df2046/app/scripts/lib/transaction/delegation.ts)
- [Automatic fee-token selection](https://github.com/MetaMask/metamask-extension/blob/07dbd776df87515f6fc4a80a2a07107f77df2046/ui/pages/confirmations/hooks/useAutomaticGasFeeTokenSelect.ts)
- [Fee-token picker](https://github.com/MetaMask/metamask-extension/blob/07dbd776df87515f6fc4a80a2a07107f77df2046/ui/pages/confirmations/components/confirm/info/shared/gas-fee-token-modal/gas-fee-token-modal.tsx)
- [Fee-token quote adaptation and transfer calldata](https://github.com/MetaMask/metamask-extension/blob/07dbd776df87515f6fc4a80a2a07107f77df2046/ui/pages/confirmations/components/confirm/info/hooks/useGasFeeToken.ts)
- [EIP-7702 gas-fee-token end-to-end coverage](https://github.com/MetaMask/metamask-extension/blob/07dbd776df87515f6fc4a80a2a07107f77df2046/test/e2e/tests/confirmations/transactions/gas-fee-tokens-eip-7702.spec.ts)

MetaMask's strongest lesson is architectural and UX consistency: fee-token
payment is part of the normal confirmation, not a separate mode. Its main
implementation lesson is to sign exact one-time execution authority rather
than hand a relay a broad transaction signature.

MetaMask limitations relevant to WalletChan:

- contract creation has no normal target and is excluded from the relay path;
- hardware wallets are excluded in the inspected implementation;
- relay support is chain-gated;
- a quote depends on MetaMask simulation and relay services;
- token payment is currently documented for Send and dapp transactions, while
  swap has a separate gas-included quote path and bridge is not generally
  supported;
- if an atomic execution reverts, the relayer can pay native gas without
  collecting the appended fee transfer.

### MetaMask: true sponsorship

MetaMask also supports transactions marked “Paid by MetaMask” on selected
networks. This uses the same relay-capable smart-account foundation but does
not charge the user a fee token. The official documentation currently lists
Monad and Sei, excludes bridge transactions and hardware wallets, caps gas at
5,000,000 units, and notes that availability can change.

Reference:

- [Understanding MetaMask gas sponsorship](https://support.metamask.io/manage-crypto/transactions/gas-sponsorship)

WalletChan should model “sponsored” and “paid in USDC” as two quote outcomes of
one fee system:

```ts
type FeePayer =
  | { kind: "user-native" }
  | { kind: "user-token"; token: Address; maxAmount: bigint }
  | { kind: "sponsor"; sponsorName: string };
```

### Ambire: fee tokens and Gas Tank

The inspected Ambire extension checkout was commit
`54db83b1fdb54db345e418cf930cf8edcd9c810a` (2026-03-27). Its
`ambire-common` checkout was commit
`53a87c1dcb77f35f172f2d7ec31389fce23fe73f` (2026-04-06).

Ambire has two related but distinct payment models:

1. **Per-chain fee tokens.** The account operation includes a native transfer,
   ERC-20 fee transfer, or paymaster-backed fee call as part of smart-account
   execution.
2. **Gas Tank.** The user prepays the Ambire relayer using supported tokens on
   one chain and spends the hosted balance to cover transactions on other
   supported chains.

The estimator merges tokens held on the transaction chain with Gas Tank
balances, produces `FeePaymentOption` values, and can also show a different
owned EOA as the fee payer for account types that allow it. The confirmation
groups payment options, identifies the payer, token, Gas Tank source, fee
speed, amount, and USD value. Its defaulting logic prioritizes options that can
actually cover the selected speed.

The ERC-4337 path implements an Ambire Paymaster and also supports dapp-provided
ERC-7677 paymaster services. The account operation embeds a fee call; an ERC-20
fee uses `transfer`, while Gas Tank accounting uses a fee-collector call with
encoded balance metadata.

Inspected source:

- [Fee-token and Gas Tank estimation inputs](https://github.com/AmbireTech/ambire-common/blob/53a87c1dcb77f35f172f2d7ec31389fce23fe73f/src/controllers/estimation/estimation.ts)
- [Paymaster selection and ERC-7677 support](https://github.com/AmbireTech/ambire-common/blob/53a87c1dcb77f35f172f2d7ec31389fce23fe73f/src/libs/paymaster/paymaster.ts)
- [Fee-call construction](https://github.com/AmbireTech/ambire-common/blob/53a87c1dcb77f35f172f2d7ec31389fce23fe73f/src/libs/calls/calls.ts)
- [Fee selection and Gas Tank accounting](https://github.com/AmbireTech/ambire-common/blob/53a87c1dcb77f35f172f2d7ec31389fce23fe73f/src/controllers/signAccountOp/signAccountOp.ts)
- [Confirmation payment selector](https://github.com/AmbireTech/extension/blob/54db83b1fdb54db345e418cf930cf8edcd9c810a/src/common/modules/sign-account-op/components/Estimation/Estimation.tsx)
- [Gas Tank product surface](https://github.com/AmbireTech/extension/blob/54db83b1fdb54db345e418cf930cf8edcd9c810a/src/common/components/GasTankModal/GasTankModal.tsx)

Official product references:

- [What is the Gas Tank?](https://help.ambire.com/en/articles/13752152-what-is-the-gas-tank)
- [Supported fee tokens](https://help.ambire.com/en/articles/13752160-which-tokens-can-be-used-to-pay-gas-fees)
- [How stablecoin fee payment works](https://help.ambire.com/en/articles/13752170-how-can-ambire-wallet-allow-gas-fees-to-be-paid-in-stablecoins)
- [Bridge fee limitations](https://help.ambire.com/en/articles/13752133-bridge-fees)

What WalletChan should copy:

- compute fee choices from verified holdings, not a hardcoded selector;
- show USD and token-denominated cost together;
- keep sponsor, user token, native token, and stored balance as variants of one
  payment-option model;
- mark the payer when it can differ from the acting account;
- reject options whose balance does not cover the selected execution speed;
- persist and reconcile asynchronous relayer state.

What WalletChan should not copy in v1:

- a standalone prepaid Gas Tank;
- many fee speeds for token-relayed transactions;
- cross-account gas payers before the same-account flow is safe;
- a large selector exposing every possible token regardless of execution
  reliability;
- nonwithdrawable hosted balances.

### Rabby: GasAccount and Free Gas

The inspected Rabby checkout was commit
`69cd2655d634ee9d8b838015d97df53e11364264` (2026-07-03).

Rabby separates promotional **Free Gas** from a prepaid **GasAccount**. The
GasAccount is authenticated by a wallet signature and held as a backend
session. Before confirmation, Rabby sends the candidate transaction list to an
API that reports chain support, eligibility, estimated cost, and whether the
hosted balance is sufficient. When selected, the signed transaction is sent
through Rabby's backend with `gas_type: "gas_account"` rather than directly to
the user's custom RPC.

The UI treats low native balance as the trigger:

- use free gas if eligible;
- otherwise use an existing GasAccount balance;
- otherwise offer Deposit or switch the GasAccount;
- preserve and resume some transaction contexts after a top-up;
- show explicit custom-RPC, WalletConnect, unsupported-chain, login, and
  insufficient-balance states.

Rabby's own localized product text says GasAccount covers Swap, Bridge, Send,
dapps, and more across 80+ networks, charges no Rabby fee, and includes both
the target transaction's gas and a small amount of gas needed to deliver gas
to the user's address. This indicates a hosted/native-top-up model rather than
the exact atomic ERC-20 repayment used by MetaMask.

Inspected source:

- [Persisted GasAccount login/session state](https://github.com/RabbyHub/Rabby/blob/69cd2655d634ee9d8b838015d97df53e11364264/src/background/service/gasAccount.ts)
- [Eligibility and unsupported-state decision model](https://github.com/RabbyHub/Rabby/blob/69cd2655d634ee9d8b838015d97df53e11364264/src/ui/views/Approval/components/FooterBar/gasAccountDecision.ts)
- [Transaction cost check](https://github.com/RabbyHub/Rabby/blob/69cd2655d634ee9d8b838015d97df53e11364264/src/ui/views/GasAccount/hooks/checkTxs.ts)
- [Backend gas-account submission route](https://github.com/RabbyHub/Rabby/blob/69cd2655d634ee9d8b838015d97df53e11364264/src/background/controller/provider/controller.ts)
- [Confirmation rescue/top-up UI](https://github.com/RabbyHub/Rabby/blob/69cd2655d634ee9d8b838015d97df53e11364264/src/ui/views/Approval/components/FooterBar/GasLessComponents.tsx)
- [GasAccount deposit and bridge top-up flow](https://github.com/RabbyHub/Rabby/blob/69cd2655d634ee9d8b838015d97df53e11364264/src/ui/views/GasAccount/components/GasAccountDepositTokenForm.tsx)

Rabby's strongest lesson is its recovery UX: insufficient gas produces a
specific next action, not a disabled confirmation and a generic error. Its
weakness for WalletChan is that the hosted GasAccount is a separate product
with a login session and backend account state. WalletChan can deliver the
core rescue without requiring a deposit first.

### OKX Gas Station

OKX's April 2026 product is close to the proposed WalletChan experience. A
third-party relayer fronts native gas; USDC, USDT, or USDG repays it in the
same transaction. It supports Ethereum, X Layer, BNB Chain, Base, Polygon,
Arbitrum, and Optimism. If native balance is low, OKX automatically picks the
highest stablecoin balance; otherwise the user can still change the Network
Fee asset. First use bundles the EIP-7702 setup and charges a one-time setup
fee. Native-token sends are excluded.

Reference:

- [OKX Gas Station announcement and usage](https://web3.okx.com/en/learn/wallet-gas-station)

This independently validates the MetaMask-style UX: automatic rescue, a
changeable Network Fee row, same-transaction repayment, and invisible smart
account setup.

### Coinbase CDP and Base Account

CDP's documented ERC-20 paymaster currently accepts USDC on Base. The user
must approve the paymaster, which can be included in the same UserOperation
batch. `pm_getAcceptedPaymentTokens` exposes supported assets and
`pm_getPaymasterData` returns a maximum token fee.

CDP's current Paymaster/Bundler API supports only EntryPoint v0.6 at
`0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789`. WalletChan's MetaMask
DeleGator v1.3.0 accepts UserOperations only from its immutable EntryPoint v0.7,
so CDP is a product/API benchmark rather than a drop-in provider for the
current delegate.

References:

- [CDP ERC-20 gas payment](https://docs.cdp.coinbase.com/paymaster/guides/erc20-gas-payments)
- [CDP Paymaster overview and ERC-7677 compatibility](https://docs.cdp.coinbase.com/paymaster/introduction/welcome)
- [CDP Paymaster JSON-RPC and EntryPoint v0.6](https://docs.cdp.coinbase.com/api-reference/json-rpc-api/paymaster)
- [CDP EIP-7702 account support](https://docs.cdp.coinbase.com/wallets/using-wallets/eip-7702)

This is a useful standardized managed-provider benchmark, but it is not
compatible with WalletChan's current delegate and does not solve WalletChan's
multi-chain requirement. The standing or topped-up allowance is also a larger
user authority than WalletChan's recommended exact fee transfer. The model
introduces UserOperation, bundler, EntryPoint, and paymaster state alongside
WalletChan's existing relay-less type-4 flow.

### Circle Paymaster

Circle operates permissionless ERC-4337 paymasters that charge USDC. Current
documentation lists EntryPoint v0.7 on Base and Arbitrum and v0.8 on a broader
set including Ethereum, Base, Polygon, Optimism, and Unichain. Base and
Arbitrum carry a documented 10% surcharge. The paymaster charges a prefund and
refunds the difference after actual gas is known.

References:

- [Circle Paymaster overview, pricing, and networks](https://developers.circle.com/paymaster)
- [EIP-7702 Paymaster quickstart](https://developers.circle.com/paymaster/pay-gas-fees-usdc)
- [Paymaster charging/refund events](https://developers.circle.com/paymaster/addresses-and-events)

The MetaMask DeleGator v1.3.0 used by WalletChan is bound to EntryPoint v0.7 at
`0x0000000071727De22E5E9d8BAf0edAc6f37da032`. Therefore Circle is an
immediate compatibility candidate only where Circle supports that EntryPoint,
not automatically on every chain in Circle's v0.8 table. Base is the useful
overlap to spike.

### Alchemy and Biconomy

Alchemy's token gas policy fronts native gas and transfers a configured token
to a fee recipient. Its documentation recommends post-operation settlement,
and explicitly warns that if a batched token approval reverts with the user's
calls, the policy owner can pay gas without receiving token compensation.

- [Alchemy: Pay gas with any token](https://www.alchemy.com/docs/wallets/transactions/pay-gas-with-any-token)

Biconomy MEE supports same-chain and cross-chain fee tokens, including a wide
range of ERC-20s, and can orchestrate EIP-7702 accounts. Its external-wallet
Fusion mode requires ERC-2612 for a truly gas-free first trigger; otherwise an
approval needs native gas.

- [Biconomy MEE: Pay gas with ERC-20 tokens](https://docs.biconomy.io/new/getting-started/pay-gas-erc20-token)

Both are valuable benchmarks. Neither should replace WalletChan's canonical
MetaMask delegate in the first implementation without a separate delegate
migration, trust, pricing, and lock-in decision.

## Approach comparison for WalletChan

| Approach | Fits current MetaMask delegate | First use with zero native | Same-chain ERC-20 | Cross-chain fee source | New backend | Main risk | Recommendation |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Pimlico ERC-4337 v0.7 UserOp + ERC-20 paymaster | Yes, its fixed v0.7 EntryPoint is supported | Yes, bundler carries `eip7702Auth` | Yes, USDC on verified chains | No | Thin authenticated API-key proxy | Provider availability, allowance, UserOp lifecycle | **Primary** |
| Exact ERC-7710 delegation + WalletChan relay | Yes, directly | Yes, relay carries 7702 auth | Yes | No | Quote, submit, relay inventory | Relayer loses gas on revert; custom backend correctness | Fallback/later |
| WalletChan prepaid Gas Tank | Execution-independent | Yes after deposit | Yes | Yes | Custodial ledger and relayer | Custody, solvency, reconciliation, regulation | Not v1 |
| Just-in-time native top-up then user tx | Works with any normal signer | Potentially | Indirect | Hosted balance can be cross-chain | Funding and submission backend | Funding front-run, leftover dust, two txs, nonce races | Avoid as primary |
| In-action swap of token to native | Current batching helps | Usually no: outer tx still needs gas | Yes after sponsor fronts gas | No | Solver/relay | Circular dependency and slippage | Useful settlement detail, not execution model |
| Dapp-provided ERC-7677 paymaster | Requires ERC-4337 path | Yes if sponsor accepts | Sponsor-defined | No | Paymaster URL proxy/security | Dapp-controlled endpoint and inconsistent policies | Later dapp capability |

## Recommended execution design

### Transaction envelope

For an account already delegated to WalletChan's canonical MetaMask delegate:

```text
WalletChan UI
  -> prepares calls C[0..n]
  -> creates an unsigned EntryPoint v0.7 PackedUserOperation
  -> requests Pimlico USDC token quote and paymaster data
  -> prepends USDC.approve(paymaster, boundedMaxCost) only when needed
  -> re-estimates and obtains final paymaster data
  -> signs MetaMask DeleGator PackedUserOperation typed data
  -> submits eth_sendUserOperation through the WalletChan Pimlico proxy

Pimlico bundler
  -> validates and simulates the complete UserOperation
  -> submits EntryPoint.handleOps(...)
  -> Pimlico ERC-20 paymaster settles the bounded USDC fee
```

For a fresh account, the same UserOperation carries `eip7702Auth` for the
canonical delegate. Because the EOA is not the outer transaction sender, the
authorization nonce is the EOA's current nonce, not WalletChan's existing
`txNonce + 1` self-sponsored case. A differently delegated account is not
silently overwritten: the review must show the one-time upgrade and require
explicit confirmation.

When the user selects the native token, WalletChan keeps the existing direct
transaction/type-4 path. Native payment must not be wrapped in a UserOperation
for v1; this limits change and avoids bundler overhead for an already healthy
flow.

### UserOperation construction contract

- EntryPoint is the MetaMask v1.3 DeleGator's fixed v0.7 address
  `0x0000000071727De22E5E9d8BAf0edAc6f37da032`.
- Account calldata uses MetaMask Smart Accounts Kit semantics:
  `execute` for one call and `executeWithMode` for a batch. Do not reuse the
  self-call ERC-7821 envelope without verifying byte-for-byte compatibility.
- The account signs MetaMask's `PackedUserOperation` EIP-712 domain
  (`name = EIP7702StatelessDeleGator`, `version = 1`, verifying contract = the
  EOA address) and includes the EntryPoint in the signed message.
- Quote and paymaster responses are pinned to chain, account, calls hash,
  token address, paymaster address, expiry, and bounded maximum token cost.
- The extension builds all approval and execution calldata locally. Provider
  responses are data inputs, never opaque executable calldata.
- A failed or ambiguous submission is recovered by UserOperation hash and
  receipt queries; it is never automatically resubmitted as a native-gas tx.

### Custom relay fallback: delegatee policy

The remainder of this section documents the previously researched exact
ERC-7710 WalletChan relay. It is retained as a provider-outage or future
chain-coverage fallback, not part of the first Pimlico implementation.

MetaMask currently signs to an “any beneficiary” delegate and relies on exact
execution plus a single-call caveat. WalletChan has two reasonable choices:

1. **Any redeemer + exact calls + short expiry.** Anyone can submit the signed
   intent, but nobody can change its effects. This reduces relay lock-in and
   makes a stolen payload mostly a gas-griefing concern for the thief.
2. **WalletChan relayer allowlist.** Add `RedeemerEnforcer` or set the delegate
   to a rotating relay identity. This reduces public front-running but creates
   key rotation and liveness coupling.

Recommended first implementation: exact calls, `LimitedCalls(1)`, short
timestamp window, and an explicit redeemer constraint that supports a small
versioned set of WalletChan relay addresses. The quote must carry the accepted
redeemer-set version. A later review can remove the constraint if it proves to
harm failover more than it helps.

### Why exact transfer instead of allowance

An exact `ERC20.transfer` inside the signed batch:

- grants no reusable allowance;
- binds recipient and amount in the same user-reviewed intent;
- cannot be pulled later by the relayer;
- is easy to simulate and clear-sign;
- reverts atomically with the main action.

Its cost is relayer exposure: when the user action reverts, the fee transfer
also reverts and the relayer pays native gas without reimbursement. This is
preferable to charging users for failed actions in v1, but the quote spread,
rate limits, simulation, and per-account loss controls must price the risk.

### Quote contract

The extension should consume a strictly validated response similar to:

```ts
type FeeTokenQuote = {
  quoteId: string;
  chainId: number;
  account: Address;
  callsHash: Hex;
  token: {
    address: Address;
    symbol: string;
    decimals: number;
    logoUrl?: string;
  };
  paymentAmount: string;
  networkCostNative: string;
  networkCostUsd: string;
  serviceFeeAmount: string;
  totalUsd: string;
  feeRecipient: Address;
  relayAddresses: Address[];
  delegate: Address;
  delegationManager: Address;
  expiresAt: number;
  maxGas: string;
  gasFeeFields: {
    maxFeePerGas: string;
    maxPriorityFeePerGas: string;
  };
};
```

The extension recomputes `callsHash`, validates chain/account/token/decimals,
checks all addresses against a built-in signed configuration, and displays the
full payment. It must never accept relay-supplied opaque execution calldata as
the source of truth.

At confirmation, the extension rebuilds every call, caveat, and typed-data
field locally. The relay independently performs the same validation.

### Fixed quote versus refund

The exact-delegation route naturally supports a fixed token charge. The
relayer quotes a conservative amount and keeps the difference between quoted
and actual gas. That difference must be shown as service/risk fee, not hidden
as “network fee.”

An exact post-execution refund requires another transfer from the relayer or a
paymaster-style `postOp`, which adds state and failure modes. Do not add it to
the first release. Keep quote lifetimes short and margins bounded instead.

### Pimlico ERC-4337 provider requirements

The canonical MetaMask DeleGator implements `validateUserOp`, but v1.3.0 is
immutably tied to EntryPoint v0.7. On a chain where a compatible token
paymaster and bundler support that exact EntryPoint, a spike can use:

```text
EOA at same address
  -> EIP-7702 delegate = MetaMask StatelessDeleGator v1.3.0
  -> signed PackedUserOperation
  -> EntryPoint v0.7
  -> compatible v0.7 token paymaster
  -> bundler submits outer transaction
```

This primary route is standardized and gets post-op actual-cost settlement,
but requires:

- MetaMask-specific UserOperation typed-data signing;
- EntryPoint nonce management separate from EOA nonce management;
- paymaster allowance or permit logic;
- bundler estimation and submission;
- UserOperation hash-to-transaction-hash lifecycle storage;
- paymaster and bundler failover;
- version-aware capabilities;
- a second simulation stack.

USDC must be capability-gated per chain. Pimlico currently documents canonical
USDC support on Ethereum, Base, Polygon, Arbitrum, and Optimism (plus their
listed testnets). WalletChan must not offer USDC on another chain until both
the token address and live Pimlico v0.7 quote/paymaster behavior are verified.

## WalletChan architecture fit

### Existing primitives to reuse

WalletChan already has most client-side foundations:

- canonical MetaMask `EIP7702StatelessDeleGator` v1.3.0 as default;
- per-chain delegate resolution and live onchain code probing;
- type-4 EIP-7702 authorization signing for private-key and seed accounts;
- ERC-7821 atomic call encoding;
- internal ERC-7710 typed-data construction/signing for ERC-7715 grants;
- exact account, chain, origin, and account-type pinning on pending requests;
- persistent single and batch request state across MV3 worker restarts;
- transaction and batch simulation;
- direct, batch, swap, bridge, WalletConnect, and dapp paths;
- bounded HTTP responses and ambiguous-submit handling;
- an existing Base USDC ERC-3009 sponsored-transfer relay flow supporting all
  three signing account types;
- authentication epoch and pending-signature release checks.

Relevant current documentation:

- [`_docs/7702.md`](./7702.md)
- [`_docs/ERC5792.md`](./ERC5792.md)
- [`_docs/IMPLEMENTATION.md`](./IMPLEMENTATION.md)
- [`_docs/SECURITY.md`](./SECURITY.md)
- [`_docs/SWAP.md`](./SWAP.md)
- [`_docs/BRIDGE.md`](./BRIDGE.md)

### What must change conceptually

The current local atomic path signs and broadcasts an EIP-7702 self-call:

```text
to = EOA
data = ERC-7821 execute(...)
outer sender = EOA
outer gas payer = EOA
```

The gas-abstracted path is a separate execution strategy selected after the
same calls are prepared:

```text
sender = user EOA with MetaMask Stateless DeleGator code
callData = DeleGator execute(...) or executeWithMode(...)
envelope = EntryPoint v0.7 PackedUserOperation
outer sender = Pimlico bundler
outer gas payer = Pimlico ERC-20 paymaster
token settlement = bounded USDC paymaster charge
```

Do not overload `confirmTransactionAsyncPK` with remote quote/submission
business logic. The future implementation should use focused modules such as:

```text
chrome/
  pimlicoClient.ts               # bounded JSON-RPC transport and strict parsing
  pimlicoUserOperation.ts        # v0.7 construction, packing, typed-data signing
  pimlicoPaymaster.ts            # token quote, allowance, final paymaster data
  feePaymentEligibility.ts       # account/chain/token/call eligibility
  feePaymentIntent.ts            # exact calls hash and local reconstruction
  feePaymentAuthorization.ts     # third-party EIP-7702 auth nonce/signing
  feePaymentHandlers.ts          # extension-only prepare/confirm/cancel routes
  feePaymentSubmission.ts        # UserOp submit + receipt recovery
  feePaymentStorage.ts           # pending UserOp persistence and reconciliation
  feePaymentTokens.ts            # built-in chain/token capability catalog
```

`background.ts` remains a router.

### Unified execution planner

All flows should converge on one plan type:

```ts
type PreparedExecutionPlan = {
  accountId: string;
  accountAddress: Address;
  accountType: "bankr" | "privateKey" | "seedPhrase";
  chainId: number;
  origin: string;
  calls: Array<{ to: Address; value: bigint; data: Hex }>;
  callsHash: Hex;
  atomicRequired: boolean;
  source: "dapp" | "walletconnect" | "send" | "swap" | "bridge" | "batch";
  feePlan:
    | { kind: "native"; gas: GasOverrides }
    | { kind: "token"; quote: FeeTokenQuote }
    | { kind: "sponsored"; sponsor: SponsorInfo };
};
```

The planner decides execution strategy only after the user selects a fee plan:

```text
native + Bankr       -> existing Bankr API path
native + PK/seed     -> existing direct/type-4 path
token + PK/seed      -> MetaMask DeleGator UserOp + Pimlico paymaster
sponsored + PK/seed  -> future sponsor adapter
token + Bankr        -> Bankr-specific adapter or unsupported
view-only            -> never executable
```

### All signing account types

The current checkout distinguishes three signing account types—`bankr`,
`privateKey`, and `seedPhrase`—plus a view-only `impersonator`. Any build phase
must test all three signing types as required by `AGENTS.md`.

#### Private-key account

Feasible with the recommended model:

- sign the exact MetaMask DeleGator PackedUserOperation typed data locally;
- sign relayed EIP-7702 authorization locally when needed;
- never expose the private key to Pimlico, the proxy, or renderer;
- agent-password policy may allow a single-use exact transaction intent only
  after the authority policy described below is implemented.

#### Seed-phrase account

Same execution as private key after resolving the pinned derived account.
Tests must include a non-zero derivation index and account switching while the
quote is open.

#### Bankr API account

The Bankr Wallet API can sign some EIP-712 typed data, but the first release
must report USDC gas payment as unsupported until its ability to sign the exact
MetaMask PackedUserOperation domain and first-use EIP-7702 authorization is
proven. WalletChan's existing sponsored Base-USDC transfer does not establish
that broader capability.

The blocking first-use issue is the EIP-7702 authorization tuple. Bankr's
public Wallet API documents `personal_sign`, `eth_signTypedData_v4`, and
`eth_signTransaction`, but not a standalone `signAuthorization` method. A
third-party outer relayer needs the authorization tuple signature, not a
Bankr-signed outer transaction. Therefore WalletChan cannot safely assume it
can install the MetaMask delegate gaslessly for a Bankr account.

Bankr also controls its own transaction submission path and account semantics.
Before claiming support, verify one of:

1. Bankr accounts are already canonical MetaMask-delegated on each chain;
2. Bankr adds standalone EIP-7702 authorization signing;
3. Bankr adds a general fee-token/paymaster option to `/wallet/submit`; or
4. the Bankr account exposes a separately audited one-time meta-transaction
   interface compatible with WalletChan's relay.

Until then:

- preserve current Bankr submission behavior;
- show token fee payment only when live capability probing proves it works;
- keep the existing ERC-3009 Base-USDC sponsored Send path as a narrow special
  case;
- never route a Bankr API account into a PK/seed local signer fallback.

Bankr references:

- [Wallet API overview](https://docs.bankr.bot/wallet-api/overview/)
- [Sign endpoint](https://docs.bankr.bot/wallet-api/sign/)

#### View-only impersonator

Never eligible. It may inspect quotes for preview only if that does not cause a
relay reservation or leak private wallet state, but Confirm stays blocked.

### Authentication and agent password

WalletChan treats reusable ERC-7715 delegation contexts as master-session-only.
A fee-payment delegation is intended to be equivalent to approving one exact
transaction, not issuing reusable authority.

Agent-password signing should be allowed only if every condition holds:

- `LimitedCallsEnforcer(1)` is present;
- exact single/batch execution covers every call including fee transfer;
- chain, account, token, recipient, amount, and values are exact;
- a short timestamp expiry is present;
- no parent delegation or broad authority is used;
- no contract creation, delegate change beyond canonical setup, or arbitrary
  enforcer is present;
- local reconstruction matches the approved calls hash;
- the authentication epoch is rechecked immediately before signature release;
- the relay cannot substitute calldata after signing.

Any broader shape remains master-only. Reusing the ERC-7715 “all delegations
are master-only” rule without this distinction would unnecessarily break
routine agent-signed transactions; relaxing it without exact caveat validation
would create a serious authority escalation.

## Proposed UX

### Normal confirmation

The primary fee row should always use the same language:

```text
Network fee                         $0.24
Paid with                         ETH  ›
```

If native gas is insufficient and USDC is eligible:

```text
Network fee                         $0.26
Paid with                    0.26 USDC ›

✓ No ETH needed
```

The Confirm button stays enabled once quote, simulation, balance, and signature
policy checks are ready.

Do not show a persistent promotional banner when everything is normal. The fee
row and token icon are enough. Use a short inline status only for the rescue
case or a material fee difference.

### Automatic selection policy

1. If native balance covers value plus safely buffered gas, default to native.
2. If native is insufficient, find eligible held tokens with enough balance
   after the transaction's own token outflows.
3. Prefer, in order:
   - canonical stablecoin already used by the transaction, if reserving the fee
     does not change the intended amount;
   - canonical USDC;
   - lowest all-in USD fee among stablecoins;
   - other allowlisted assets by liquidity/risk score.
4. If multiple choices are materially equivalent, prefer the highest resulting
   balance safety margin rather than the highest raw balance.
5. Never automatically select a volatile or fee-on-transfer token.
6. Do not persist an automatic rescue selection as a global preference.

An optional later setting can remember a user's manual choice per
account × chain, but it must fall back safely when balance, token support, or
quote availability changes.

### Token picker

Open a compact bottom sheet titled **Pay network fee with**.

Each eligible row shows:

```text
[icon] USDC                    0.26 USDC
       Balance $42.10             $0.26
```

Sorting:

1. Recommended;
2. native token;
3. supported stablecoins;
4. other supported tokens.

Disabled rows should be shown only when the reason helps the user:

- “Not enough after this send”
- “Not supported for network fees”
- “Quote unavailable—try again”
- “Token transfer is paused”

Do not list every portfolio token as disabled noise.

### Fee details

The main review shows total payment. Advanced details show:

```text
Network cost estimate             $0.22
Provider/service fee              $0.04
You pay                       0.26 USDC
Quote expires in                     38s
```

If WalletChan chooses fixed-price settlement, label the first line “Estimated
network cost” and the total “You pay.” Never imply that the full charge is paid
to validators.

Advanced smart-account detail:

```text
Execution: ERC-4337 smart-account transaction
Gas payer: Pimlico ERC-20 paymaster
Account delegate: MetaMask Stateless DeleGator
```

Every displayed `0x` address follows WalletChan's copy-button and explorer-link
standard.

### True sponsorship

If WalletChan or a dapp pays:

```text
Network fee                       Sponsored
Paid by                          WalletChan
```

Do not open the token picker unless a user-paid fallback is available and
needed.

### Failure and fallback

Before signing:

- quote expired -> refresh in place and highlight any changed amount;
- no eligible token -> show **Add ETH** and, later, **Top up from another
  chain**, not a dead Confirm button;
- relay unavailable -> offer native gas only if the account can cover it;
- token balance changed -> recompute Max/outflows and re-quote.

After signing/submission:

- relay job pending -> Activity row says “Submitting through relayer”;
- transaction hash assigned -> normal pending state and explorer link;
- relay rejected before broadcast -> safe retry only with a fresh quote and
  fresh one-time delegation;
- outcome unknown -> do not generate a replacement intent until the backend
  idempotency/status endpoint proves the prior intent unsubmitted;
- onchain revert -> show the original dapp error where possible and “No USDC
  fee was collected”; WalletChan absorbs relay gas under the proposed atomic
  model.

### Newcomer versus pro presentation

Default:

- “Paid with USDC”
- total token and fiat cost
- “No ETH needed” when relevant
- one chevron to change token

Advanced:

- native gas estimate and max fee per gas;
- relay/service fee;
- quote expiry;
- exact fee recipient;
- delegate and DelegationManager;
- simulation and decoded fee-transfer call;
- signed-authority scope.

Do not make users choose between “7702,” “4337,” “paymaster,” and “Gas Tank.”

## Flow-specific behavior

### Dapp `eth_sendTransaction`

The dapp supplies its requested transaction exactly as today. WalletChan may
change only the internal execution envelope after user approval.

Requirements:

- preserve connected-origin and tab-account scoping;
- pin `from`, chain, origin, calldata, value, and request ID before quoting;
- simulate the original effect and the final relayed envelope;
- return the relayed outer transaction hash to the dapp;
- preserve the current async result storage across worker suspension;
- reject contract creation in v1;
- if the dapp supplies gas fields, treat them as user intent hints but use the
  relay's independently bounded gas quote for economic risk.

### ERC-5792 `wallet_sendCalls`

WalletChan already returns a bundle ID before execution. Extend bundle state
with fee-plan and relay-job metadata. A token-paid atomic batch remains
`atomic: true`; the fee transfer is wallet-added and must not appear as a
dapp-supplied receipt.

The dapp's `wallet_getCallsStatus` response should contain the actual outer
receipt/transaction hash while WalletChan Activity can separately decode inner
calls and fee payment.

Do not advertise ERC-7677 `paymasterService` merely because WalletChan has its
own fee-token relay. That capability specifically describes an ERC-4337 wallet
calling an app-provided paymaster service. Advertise it only after the
UserOperation path exists and hostile URL/API-key handling is implemented.

### WalletConnect

WalletConnect must reuse the same prepared plan and account pinned by the WC
session. WalletConnect peer metadata is display-only. A remote peer cannot
provide or override WalletChan's relay URL, fee recipient, supported token
list, or delegate.

The terminal outbox must persist the relayed transaction result before relay
delivery to the WC peer, matching WalletChan's current replay protection.

### In-wallet Send

For an ERC-20 send:

- quote after recipient and amount are valid;
- if send token equals fee token, `Max` is
  `balance - exactFee - safetyForRequote`, not the full balance;
- show “Recipient gets” separately from “You pay as network fee”;
- preserve the existing address copy/explorer UX;
- retain the current Base-USDC ERC-3009 sponsored path only as a specialized
  quote route until the general relay supersedes it.

For native-token sends, v1 should not offer token fee payment unless the relay
quote proves that `native value + relayer gas` can be settled safely. OKX
excludes native-token sends, and that is a reasonable conservative first gate.

### In-wallet swap

The crucial case is a stablecoin -> native-token swap when the account has no
native token. USDC -> ETH is the most familiar example, but the same reserve
logic applies independently to every supported chain and native fee asset. Fee
payment makes this possible, but Max handling is easy to get wrong.

If sell token equals fee token:

```text
sellAmount + feeTokenAmount <= verifiedBalance
```

For Max, reserve a quoted fee before requesting the final swap quote, then
iterate once if the changed calldata materially changes gas. Put a hard bound
on iterations and require the final calls hash to match the final fee quote.

Do not append the fee transfer after a router call that consumes the entire
sell-token balance. The final execution order and balance simulation must prove
the transfer can succeed. Either:

- reduce the router sell amount and transfer fee first; or
- transfer the fee last after proving the router leaves the exact reserve.

The first is easier to reason about for exact-input swaps.

If buy token is the only eligible payment asset, do not charge it in v1. The
output amount may vary and is not held before execution. MetaMask's “future
native” mode and gas-included swap quotes are a later, route-specific design.

### Bridge

Fee-token payment covers the **source-chain transaction gas**. It does not
automatically give the user native gas on the destination chain.

The bridge review must keep three costs distinct:

1. source network execution fee, payable through WalletChan fee-token relay;
2. bridge/provider fee encoded in the Socket route, which may include native
   `msg.value` and destination delivery costs;
3. optional destination gas drop/top-up, if the route provides one.

WalletChan must not relabel the bridge provider's native `msg.value` as a
payable ERC-20 network fee. If the Socket route requires native value beyond
the bridged native amount, a zero-native account may still be ineligible unless
the route itself accepts that cost from the sold token.

For Max ERC-20 bridge, reserve the WalletChan fee exactly as in swap. Persist
the fee-token payment on the source Activity entry while destination polling
continues through the existing bridge state machine.

## Eligibility policy

### Chain eligibility

Require all of:

- chain has EIP-7702 active;
- canonical v1.3 DeleGator has code at the expected address and its fixed
  EntryPoint v0.7 is available;
- chain/token pair is in WalletChan's built-in Pimlico USDC capability catalog;
- live Pimlico token quote, paymaster, bundler, and receipt endpoints pass
  bounded health checks;
- simulation supports the final envelope;
- chain gas model is explicitly tested;
- chain finality/reorg policy is configured;
- token-price and native-price feeds are fresh.

WalletChan's current EIP-7702 built-ins have MetaMask v1.3 deployments at the
expected same-address set: Ethereum, Optimism, BNB Chain, Unichain, Polygon,
Monad, Sonic, Berachain, Arbitrum, Ink, Linea, Mantle, MegaETH, Tempo, and
Base. Deployment presence is necessary, not sufficient; every row keeps its
own runtime and release gate.

### Token eligibility

V1 allowlist criteria:

- verified contract address and decimals;
- standard ERC-20 `transfer` behavior;
- no transfer tax, rebasing, reflection, or callback behavior;
- deep liquidity against native asset or stable inventory strategy;
- reliable USD price with staleness bounds;
- no known pause/blacklist affecting fee collector;
- sufficient account balance after all intended outflows;
- successful final-envelope simulation;
- per-token min/max fee and exposure cap.

Start with canonical USDC per chain. Never infer canonical status from symbol.

Add later only after dedicated tests:

- USDT variants with nonstandard return behavior;
- DAI and USDS;
- wrapped native assets;
- liquid staking tokens;
- volatile assets.

Never v1:

- fee-on-transfer tokens;
- rebasing/reflection tokens;
- unverified custom tokens;
- tokens whose transfer can invoke arbitrary callbacks;
- assets without a bounded reliable price;
- the token being fully consumed by the primary call.

### Call eligibility

Reject or native-fallback:

- contract deployment;
- delegate set/revoke other than exact canonical first-use setup;
- calls to WalletChan's fee collector supplied by the dapp;
- an existing fee transfer that could be confused with wallet-added payment;
- unsupported self-recursion;
- calls whose simulation is unavailable or ambiguous;
- gas above chain/relayer caps;
- calls involving tokens or protocols on a denylist;
- force-inclusion flows;
- replacement/cancellation transactions;
- unknown custom chains.

## Security and threat model

### Signed-intent substitution

The relay must not be able to change:

- target, value, calldata, order, or atomicity;
- account or chain;
- fee token, amount, or recipient;
- delegate or DelegationManager;
- expiry, salt, or redeemer policy.

The extension builds and signs the exact delegation locally. The server decodes
and checks it. Both compare against a canonical `callsHash`.

### Quote server compromise

A compromised quote server could overcharge, substitute an attacker fee
recipient, lie about token metadata, or create an unsafe authority envelope.

Controls:

- fee collector, delegate, manager, enforcers, and relay set are pinned in a
  signed extension configuration;
- quote amounts have client-side USD and percentage caps;
- decimals and balance are re-read onchain;
- unknown fields and addresses fail closed;
- the UI displays exact charge and recipient under Advanced;
- confirmation reconstructs typed data locally;
- server-provided calldata is never signed blindly.

### Relayer gas griefing

Attacks include moving the fee token, consuming allowance/balance elsewhere,
invalidating EIP-7702 auth nonce, racing another redemption, or deliberately
submitting a reverting call.

Controls:

- short quote and signature expiry;
- fresh balance, code, and nonce checks immediately before submit;
- final simulation on the relay's RPC;
- one in-flight intent per account × chain initially;
- per-account/origin/IP/token loss and rate limits;
- minimum economic transaction value or fee floor on expensive chains;
- deny repeated reverts and anomalous contracts;
- relayer inventory and circuit breakers;
- never retry a potentially submitted outer transaction with a newly changed
  intent.

### Relay key compromise

The relay key holds native gas inventory, not user custody authority. Still:

- keep limited hot balances per chain;
- use per-chain keys and automated replenishment from cold treasury;
- enforce contract/address/call policy server-side before signing;
- rate-limit at signer boundary, not only API edge;
- support rapid relay-set rotation in the extension's signed configuration;
- monitor unexpected nonce use and destinations;
- do not let relay keys withdraw user tokens through standing allowances.

### Token pricing and insolvency

The relay fronts volatile native costs and receives tokens after success.

- use conservative, multi-source price bounds;
- cap quote lifetime;
- maintain per-token inventory limits;
- include L1 data fees on rollups;
- account for authorization, DelegationManager, enforcer, and fee-transfer gas;
- reject when gas price or token price moves beyond quote tolerance;
- separate service/risk fee from validator cost in UI and accounting;
- reconcile every quote, outer tx, receipt, gas paid, token received, and
  treasury settlement.

### Simulation mismatch

Simulate the actual final envelope, including:

- current EIP-7702 delegate state or state override for first use;
- DelegationManager redemption;
- exact caveats;
- original calls;
- fee transfer;
- correct outer sender and fee fields.

WalletChan's current asset simulator injects bytecode at the user address and
has special handling for DelegationManager redemption. Reuse that knowledge,
but do not assume the existing UI-only asset preview is sufficient for relayer
economic validation.

MegaETH requires a dedicated path. Its compute/storage dual gas model already
forces WalletChan to defer to chain-native estimation. A relay must validate
type-4 authorization, DelegationManager, and storage-heavy fee transfer costs
against MegaETH's own estimator and production-like execution before launch.

### MV3 lifecycle and idempotency

The popup can close and the service worker can die after the user signs but
before a transaction hash returns.

Persist:

- quote ID and expiry;
- calls hash and display-safe plan snapshot;
- signed-intent hash, but only encrypted/raw signature data if truly required;
- relay job ID;
- state: prepared, signed, submit-unknown, accepted, tx-hash, confirmed,
  reverted, expired, rejected;
- account/chain/origin binding;
- fee token/amount/recipient;
- outer transaction hash and receipt.

The server's submit endpoint must be idempotent on a wallet-generated intent
ID and signed-intent hash. A repeated request returns the same job/transaction,
not a second submission.

Follow WalletChan's existing irreversible-operation lease: once submission may
have crossed the network boundary, a timeout is **outcome unknown**, not “safe
to retry.”

### Privacy

The quote/relay service learns account, chain, dapp origin or category, exact
calls, balances needed for eligibility, chosen fee token, IP, and timing.

Minimize:

- do not send full portfolio; send candidate addresses/balances or let the
  extension filter locally;
- origin is not required for onchain execution and should be omitted or reduced
  to an abuse-policy hash where possible;
- do not log raw calldata or signed delegation by default;
- define bounded retention for quotes and failed intents;
- document relay visibility in privacy policy;
- do not accept third-party remote image URLs without WalletChan's existing
  sanitization.

### Dapp-provided paymaster services

ERC-7677 lets a dapp provide a paymaster service URL through
`wallet_sendCalls`. Supporting it creates an SSRF/API-key and trust boundary:

- URL must pass public-network policy and redirect restrictions;
- response sizes/deadlines are bounded;
- wallet independently validates sponsor/paymaster data;
- sponsor icon is untrusted media;
- dapp cannot force its paymaster if WalletChan chooses another;
- optional versus required capability semantics must follow EIP-5792.

Keep this out of the first WalletChan-owned fee-token release.

## Edge cases

### Balance and Max

- fee token is also sent/swapped/bridged;
- token balance changes while confirmation is open;
- primary calls receive and then spend the same token;
- primary calls spend an unknown amount through an allowance;
- Max quote changes calldata, which changes gas, which changes Max;
- dust after decimals rounding;
- token balance is sufficient at quote but insufficient at inclusion;
- USD price exists but onchain balance lookup fails;
- hidden/low-value token holdings are not loaded yet.

### EIP-7702 and delegation

- no current delegation;
- canonical delegation already active;
- old MetaMask DeleGator version;
- incompatible external delegate;
- delegate changes between quote, sign, and submit;
- authorization nonce changes;
- first-use authorization succeeds but execution reverts—the delegation still
  changes under EIP-7702;
- chain ID zero must never be signed;
- canonical deployment code hash differs from expected;
- required enforcer missing on a nominally supported chain.

### Fee token behavior

- token returns no boolean;
- token returns false;
- transfer fee produces less than quoted receipt;
- blacklist/pause changes after simulation;
- proxy implementation upgrades;
- rebasing between quote and inclusion;
- token has 0, 6, 8, 18, or malicious decimals;
- symbol/logo spoofing;
- same symbol at multiple addresses;
- fee collector receives a different token amount than expected.

### Transaction behavior

- original call reverts;
- fee transfer reverts;
- call consumes fee reserve;
- dapp transaction is already an ERC-7821 self-call;
- dapp calls DelegationManager or an enforcer;
- nested multicall hides a transfer to fee collector;
- native `value` exceeds user balance even though gas is abstracted;
- contract creation;
- replacement, speed-up, cancel, force inclusion;
- reorg after relay considers success;
- RPCs disagree about nonce, code, balance, or receipt;
- outer transaction stays pending and only relayer can replace it.

### UX and lifecycle

- quote expires while password/passkey prompt is open;
- account or chain changes in popup/sidepanel;
- dapp tab navigates or loses permission;
- extension locks after quote but before signing;
- agent session replaces master session;
- user closes popup after signature;
- relay accepts but response is lost;
- token becomes unsupported between extension releases;
- service fee is greater than transaction value;
- native fee becomes cheaper while token quote is selected.

## Testing matrix

### Required account matrix

Every supported flow must test:

| Case | Bankr API | Private key | Seed phrase |
| --- | --- | --- | --- |
| Native fee unchanged | Required | Required | Required |
| USDC fee, already delegated | Capability-gated | Required | Required |
| USDC fee, fresh canonical 7702 auth | Blocked until Bankr support | Required | Required |
| Replace incompatible delegate | Blocked until Bankr support | Required | Required |
| Agent password exact one-time intent | Required if supported | Required | Required |
| Master password | Required if supported | Required | Required |
| Passkey master | Required if supported | Required | Required |
| Session restore after MV3 restart | Required if supported | Required | Required |
| Account switch during quote | Required | Required | Required |
| View-only impersonator | Reject | Reject | Reject |

Seed tests include multiple derivation indices and multiple groups. Bankr tests
include read-only, recipient-allowlisted, Wallet API disabled, API credential
generation changes, and response ambiguity.

### Required flow matrix

- normal dapp ERC-20 approval;
- Aave USDC approval + deposit batch;
- dapp native-value call;
- ERC-5792 one call and multiple atomic calls;
- WalletConnect single and batch;
- Send USDC, exact amount and Max;
- swap a supported fee token -> that chain's native token, partial and Max;
- swap where fee token differs from sell token;
- bridge USDC source, partial and Max;
- bridge route with native provider `msg.value`;
- user rejection, quote expiry, simulation failure, relay rejection;
- onchain revert and fee-transfer revert;
- service-worker death at every persisted state transition.

### Required chain matrix

For each enabled chain:

- canonical deployment/code hashes;
- fresh and existing delegation;
- exact single and exact batch delegation;
- authorization nonce correctness for third-party outer sender;
- gas estimate versus actual, including L1 data fee;
- base fee spike and stale quote;
- receipt/reorg policy;
- RPC failure and disagreement;
- native inventory circuit breaker.

Run this matrix across every EIP-7702 chain in the multi-chain scope. Ethereum
needs explicit high-absolute-cost loss caps; rollups need their L1 fee included;
non-ETH-native chains need independent pricing/inventory; MegaETH needs
dual-gas validation; Tempo needs a decision between its native fee-token model
and WalletChan's relay envelope.

### Adversarial cases

- quote response substitutes fee recipient;
- relay mutates/reorders calls;
- replay same delegation after success;
- two relays race the same delegation;
- dapp embeds lookalike fee transfer;
- malicious token metadata and decimals;
- fee-on-transfer token slips into catalog;
- balance moved between simulation and inclusion;
- auth nonce invalidated after signature;
- delegated code replaced after quote;
- malicious/compromised relay tries arbitrary redemption;
- origin sends oversized calldata or request fan-out;
- timeout after server broadcast;
- stale quote accepted after clock skew;
- agent session signs a reusable or non-exact delegation;
- relayer key submits outside allowed manager/destination policy.

## Implementation task breakdown

These tasks are ordered delivery units. Each task must leave the native-gas
path working and must be tested against private-key, seed-phrase, and Bankr API
account behavior before the next task is considered complete.

### Task 1: provider and capability foundation

**Implementation status:** complete; production enablement remains chain-gated.

- Add a typed Pimlico JSON-RPC client for EntryPoint v0.7 token quotes,
  paymaster data, UserOperation estimation/submission, and receipts.
- Route requests through a bounded, policy-constrained WalletChan proxy so a
  reusable Pimlico API key is never shipped in extension code.
- Add an address-based fee-token catalog containing native currency and exact
  Pimlico-supported ERC-20 entries; enable only chain/token pairs returned by
  live provider capability checks.
- Fail closed when the chain, EntryPoint, token, delegate, or provider response
  does not match the built-in capability definition.

### Task 2: MetaMask DeleGator UserOperation construction

**Implementation status:** complete with byte/signature compatibility tests.

- Implement `execute`/`executeWithMode` calldata using the official MetaMask
  Smart Accounts Kit behavior as the compatibility reference.
- Implement v0.7 PackedUserOperation packing, hashing, nonce lookup, gas
  estimation, and MetaMask DeleGator EIP-712 signing.
- Keep this strategy separate from WalletChan's existing EOA-funded EIP-7702
  self-call encoding.
- Unit-test single calls, batches, value calls, reverts, and signature recovery.

### Task 3: USDC quote, allowance, and first-use upgrade

**Implementation status:** complete for fresh local accounts and already
officially delegated Bankr/local accounts; foreign delegates fail closed.

- Fetch `pimlico_getTokenQuotes`, calculate a bounded maximum USDC cost, and
  obtain final `pm_getPaymasterData` after all calls are fixed.
- Read USDC allowance and prepend `approve(paymaster, boundedMaxCost)` only when
  insufficient. Never request an unlimited allowance.
- Add a distinct third-party-sender EIP-7702 authorization signer using the
  EOA's current nonce, and attach `eip7702Auth` for a fresh account.
- Treat an undelegated local account as a visible one-time upgrade. A different
  or unknown delegate fails closed and is never overwritten implicitly.

### Task 4: background execution and lifecycle

**Implementation status:** complete, including pre-broadcast deterministic-hash
recovery and independently verified EntryPoint receipt finality.

- Add focused quote, prepare, submit, and receipt modules; keep
  `background.ts` as routing only.
- Persist only the minimum pending UserOperation state needed to recover after
  an MV3 worker restart, with idempotent migration and bounded retention.
- Map UserOperation states to WalletChan Activity and ERC-5792 statuses without
  inventing success before the transaction receipt is final.
- Handle timeout-after-submit as outcome unknown and recover by hash.

### Task 5: confirmation UX

**Implementation status:** complete for single and ERC-5792 confirmation.

- Add a compact **Pay network fee with** row to single and batch confirmation.
- Open an action sheet containing only currently eligible native and USDC
  options, with token amount, fiat estimate, balance, and insufficiency state.
- Show **One-time smart account upgrade** in the same review when first-use
  authorization is required; preserve one final Confirm action.
- Put EntryPoint, bundler, paymaster, allowance, and UserOperation details under
  Advanced. Use the existing Warm Midnight/Bauhaus tokens and selection states.

### Task 6: account and flow gates

**Implementation status:** complete for the v1 single/Send and atomic ERC-5792
scope; swap, bridge, cross-dapp custom batches, and Max remain deliberately
deferred.

- Enable signing for private-key and seed-phrase accounts first.
- Capability-gate Bankr API accounts and return a precise unsupported error
  until Bankr can sign both the MetaMask UserOperation typed data and the
  first-use authorization tuple.
- Start with dapp single transactions and Send; then add atomic ERC-5792
  batches. Defer swap, bridge, and Max flows until reserve/fixed-point tests
  pass.

### Task 7: verification and release hardening

**Implementation status:** automated unit/integration coverage and docs are in
place. Base Sepolia zero-native proofs, the manual three-wallet matrix, and
external review remain release gates.

- First prove Base Sepolia with a zero-native test account: already delegated
  and fresh-account authorization, private-key then seed-phrase.
- Run unit/integration tests for quote pinning, malicious provider responses,
  approval bounds, nonce races, replay, replacement, reverts, and ambiguous
  submission.
- Run the full extension build and manual three-account-type matrix.
- Update implementation, security, storage, and design documentation before
  release; require an external review before mainnet enablement.

## Rollout plan and gates

### Phase 0: local research prototype

- Reproduce the official MetaMask v1.3 DeleGator UserOperation signature and
  call encoding against EntryPoint v0.7.
- Prove Pimlico bundler submission and ERC-20 paymaster settlement on Base
  Sepolia with test USDC.
- Prove both already-delegated and first-use `eip7702Auth` accounts with zero
  native balance.
- Verify replay rejection, nonce semantics, approval behavior, atomic revert,
  and delegated-code state when execution reverts.
- No production API or UI.

### Phase 1: Base Sepolia extension slice

- PK and seed only.
- Send and a fixed test contract call.
- Thin WalletChan proxy with origin/auth/rate/size limits and no extension-side
  provider secret.
- Persistent UserOperation lifecycle and restart recovery.
- Native/USDC picker and visible one-time-upgrade state.
- Explicit unsupported behavior for Bankr API accounts.

Exit gate:

- no broad authority in signed payloads;
- quote/calls reconstruction proven by tests;
- relay cannot mutate intent;
- first-use auth works with zero native;
- outcome-unknown recovery is safe;
- fee accounting reconciles exactly.

### Phase 2: five-chain private beta

- dapp single transactions and Send;
- canonical USDC on Ethereum, Base, Polygon, Arbitrum, and Optimism, enabled
  independently after live v0.7 quote/paymaster conformance;
- native-insufficient automatic selection;
- per-chain sponsor budgets for failed/reverted transactions;
- user-visible service fee and relayer terms;
- monitoring, alerting, emergency disable switch;
- external security review of extension, API, signer, and contracts used.

### Phase 3: ERC-5792, swap, and bridge

- atomic dapp batches;
- supported fee token -> source chain native token, partial and Max;
- source-chain bridge fee with explicit provider-native-value checks;
- WalletConnect reuse;
- Activity inner-call and fee-payment summaries.

Do not enter until Max/reserve fixed-point tests and bridge native-value tests
pass.

### Phase 4: complete supported-chain coverage and more tokens

- enable every remaining WalletChan EIP-7702 built-in that passed its chain
  gate;
- Ethereum under tighter gas-loss limits;
- MegaETH only after production-like dual-gas tests;
- Tempo through its safest native or relayed fee-token execution path;
- new chains automatically enter the same research/test gate instead of being
  assumed compatible from deployment presence;
- USDT/DAI per-chain after token behavior and liquidity review;
- optional dapp-provided ERC-7677 sponsorship only after a real ERC-4337 path.

### Phase 5: cross-chain gas balance decision

Revisit Gas Tank only if user data shows same-chain token payment is
insufficient. Evaluate:

- noncustodial cross-chain solver/MEE routes;
- withdrawable prepaid balances;
- treasury/custody and regulatory requirements;
- balance proofs and reconciliation;
- destination gas delivery after bridges.

## Mainnet go/no-go checklist

- [ ] Canonical deployed bytecode and audit mapping are pinned.
- [ ] All signed delegations are exact, single-use, short-lived, and locally
      reconstructed.
- [ ] Third-party-sender EIP-7702 authorization nonce semantics are proven on
      every chain.
- [ ] First-use authorization plus failed execution state is understood and
      displayed.
- [ ] Quote API, relay API, and signer enforce the same independent policy.
- [ ] Submit is idempotent and timeout ambiguity cannot duplicate effects.
- [ ] Relayer keys are per-chain, capped, monitored, and rotatable.
- [ ] Fee collector and treasury reconciliation are automated.
- [ ] Token list is address-based, signed, and behavior-tested.
- [ ] Price, gas, service fee, and quote-expiry caps are enforced client and
      server side.
- [ ] Final relayed envelope simulation is mandatory.
- [ ] Revert-loss, abuse, and insolvency circuit breakers are live.
- [ ] PK, seed, and capability-gated Bankr behavior are all tested.
- [ ] Send, dapp, batch, WalletConnect, swap, and bridge eligibility cannot
      drift into separate policy implementations.
- [ ] Agent-password policy rejects every non-exact or reusable authority.
- [ ] Storage changes follow `_docs/STORAGE.md` and `_docs/PUBLISHING.md` with
      an idempotent migration.
- [ ] `_docs/IMPLEMENTATION.md` and `_docs/SECURITY.md` are updated before
      release.
- [ ] Independent smart-contract and backend security review is complete.
- [ ] Privacy policy explains relay-visible transaction data and retention.
- [ ] Emergency server and extension kill switches fail back to reviewed native
      gas, never silent sponsorship changes.

## Open decisions

1. What authentication, quota, and deployment model should the thin Pimlico
   API-key proxy use?
2. Fixed token fee or actual-cost refund/accounting?
3. Fee collector per chain or deterministic same address?
4. Which secondary v0.7 bundler/paymaster should be qualified for failover?
5. Who absorbs gas for onchain reverts, and what limits apply?
6. Should true WalletChan sponsorship be a premium benefit, while token-paid
   relay remains available to everyone?
7. What service fee cap is acceptable on Ethereum versus L2s?
8. Is native-token Send eligible in the first release?
9. Can Bankr expose standalone EIP-7702 authorization signing or general
   fee-token submission?
10. Should a manually chosen fee token be remembered per account and chain?
11. When should a dapp-provided ERC-7677 paymaster override WalletChan's route?
12. Is destination gas delivery a bridge feature or a later Gas Tank feature?

## Source log

### Standards and contracts

- [EIP-7702](https://eips.ethereum.org/EIPS/eip-7702)
- [EIP-5792](https://eips.ethereum.org/EIPS/eip-5792)
- [ERC-7821](https://eips.ethereum.org/EIPS/eip-7821)
- [ERC-4337](https://eips.ethereum.org/EIPS/eip-4337)
- [ERC-7677](https://ercs.ethereum.org/ERCS/erc-7677)
- [ERC-7902](https://ercs.ethereum.org/ERCS/erc-7902)
- [MetaMask Delegation Framework v1.3.0](https://github.com/MetaMask/delegation-framework/tree/v1.3.0)
- [MetaMask Smart Accounts Kit deployment registry](https://github.com/MetaMask/smart-accounts-kit/tree/main/packages/delegation-deployments)
- [EIP7702 Stateless DeleGator](https://github.com/MetaMask/delegation-framework/blob/v1.3.0/src/EIP7702/EIP7702StatelessDeleGator.sol)
- [EIP7702 DeleGator Core and ERC-4337 validation](https://github.com/MetaMask/delegation-framework/blob/v1.3.0/src/EIP7702/EIP7702DeleGatorCore.sol)

### Wallet products and inspected code

- [MetaMask gas-included transactions](https://support.metamask.io/manage-crypto/transactions/metamask-gas-station/)
- [MetaMask gas sponsorship](https://support.metamask.io/manage-crypto/transactions/gas-sponsorship)
- [MetaMask extension inspected commit](https://github.com/MetaMask/metamask-extension/tree/07dbd776df87515f6fc4a80a2a07107f77df2046)
- [Ambire Gas Tank](https://help.ambire.com/en/articles/13752152-what-is-the-gas-tank)
- [Ambire extension inspected commit](https://github.com/AmbireTech/extension/tree/54db83b1fdb54db345e418cf930cf8edcd9c810a)
- [Ambire common inspected commit](https://github.com/AmbireTech/ambire-common/tree/53a87c1dcb77f35f172f2d7ec31389fce23fe73f)
- [Rabby inspected commit](https://github.com/RabbyHub/Rabby/tree/69cd2655d634ee9d8b838015d97df53e11364264)
- [Rabby product site](https://rabby.io/)
- [OKX Gas Station](https://web3.okx.com/en/learn/wallet-gas-station)

### Paymasters and infrastructure

- [Pimlico ERC-20 paymaster](https://docs.pimlico.io/references/paymaster/erc20-paymaster)
- [Pimlico supported ERC-20 tokens](https://docs.pimlico.io/references/paymaster/erc20-paymaster/supported-tokens)
- [Pimlico token quotes](https://docs.pimlico.io/references/paymaster/erc20-paymaster/endpoints/pimlico_getTokenQuotes)
- [Pimlico paymaster data](https://docs.pimlico.io/references/paymaster/erc20-paymaster/endpoints/pm_getPaymasterData)
- [Pimlico send UserOperation](https://docs.pimlico.io/references/bundler/endpoints/eth_sendUserOperation)
- [Pimlico permissionless.js inspected commit](https://github.com/pimlicolabs/permissionless.js/tree/660c8e25fe455faf05deaa258f54789b5abc14ab)
- [Coinbase CDP ERC-20 gas payments](https://docs.cdp.coinbase.com/paymaster/guides/erc20-gas-payments)
- [Coinbase CDP Paymaster](https://docs.cdp.coinbase.com/paymaster/introduction/welcome)
- [Coinbase CDP EntryPoint compatibility](https://docs.cdp.coinbase.com/api-reference/json-rpc-api/paymaster)
- [Circle Paymaster](https://developers.circle.com/paymaster)
- [Circle USDC Paymaster quickstart](https://developers.circle.com/paymaster/pay-gas-fees-usdc)
- [Alchemy token gas payments](https://www.alchemy.com/docs/wallets/transactions/pay-gas-with-any-token)
- [Biconomy MEE fee tokens](https://docs.biconomy.io/new/getting-started/pay-gas-erc20-token)
- [ZeroDev EIP-7702 quickstart](https://docs.zerodev.app/get-started/eip-7702/quickstart)

## Bottom line

WalletChan does not need a new smart-account contract to solve the USDC-only
account problem. It already defaults to the contract family MetaMask uses for
this exact feature.

The approved first build is:

- keep the ordinary confirmation;
- add a changeable **Paid with** asset to the Network fee row;
- auto-rescue insufficient native balance with canonical USDC;
- build and sign the official MetaMask DeleGator PackedUserOperation for its
  fixed EntryPoint v0.7;
- obtain a bounded USDC quote/paymaster envelope and submit through Pimlico;
- include first-use `eip7702Auth` in the UserOperation submission so a
  zero-native account can install WalletChan's official delegate atomically;
- protect the Pimlico credential behind a thin, rate-limited WalletChan proxy;
- retain the researched exact ERC-7710 custom relay as a future fallback;
- defer prepaid cross-chain Gas Tank until the custody and demand justify it.

The largest engineering risks are not EIP-7702 itself. They are exact
MetaMask-compatible UserOperation construction, malicious or stale paymaster
responses, bounded allowance handling, first-use authorization nonce
correctness, outcome-unknown recovery across MV3 restarts, API-key abuse,
Max-balance accounting, and honest capability handling for Bankr API accounts.
Those are release gates, not follow-up polish.
