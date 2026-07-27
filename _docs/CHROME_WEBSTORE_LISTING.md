# Chrome Web Store listing

## Item title

WalletChan - Web3 Wallet

## Item summary

Character count: **80/132**

> Self-custodial Web3 wallet for Ethereum and EVM. Swap, Bridge, and Sign clearly.

## Official website

https://walletchan.com

Use this URL for the Chrome Web Store website field and the Chromium manifest
`homepage_url`.

## Detailed description

WalletChan is a self-custodial Ethereum and EVM browser wallet. Create or import
an account, connect to Web3 and DeFi dapps, view your portfolio, send tokens,
swap and bridge, and understand each request before you approve.

WalletChan brings Ledger hardware accounts, Safe multisigs, ETH shielding
through Privacy Pools, and stablecoin gas fees into the same extension that works right from your browser side panel.

Wallet essentials:

- Create a seed-phrase wallet or import seed-phrase and private-key accounts.
- Add view-only accounts and optional Bankr remote-signing accounts for the
  workflows that need them.
- Connect to dapps across supported Ethereum and EVM chains.
- View portfolio balances, send tokens, and swap or bridge without leaving the
  wallet.
- Review human-readable transaction intent, clear-signing details, decoded
  calldata, signatures, and simulated asset changes.

Advanced control:

- Use Ledger hardware accounts and bring existing Safe multisigs into WalletChan.
- Shield and unshield ETH on Ethereum through Privacy Pools.
- Pay network fees with supported tokens such as USDC on eligible accounts,
  chains, and transactions.
- Batch compatible approvals and actions into fewer confirmations.
- Browse ENS and IPFS websites, with optional support for your own local IPFS
  node.

Built for control:

Private keys and seed phrases are encrypted locally. Ledger keys remain on the
device. WalletChan does not add behavioral analytics, advertising trackers, or
session replay to the extension. User-invoked features still connect to
blockchain RPCs and required service providers, including those used for
portfolio data, swaps, bridges, Bankr, metadata, token-funded fees, Safe accounts,
decentralized browsing, and Privacy Pools.

Important scope:

- Ledger setup uses Chromium WebHID, and Ledger transactions use native gas.
- WalletChan supports existing Safes; it does not create new Safes.
- Safe owner signing supports private-key, seed-phrase, Ledger, and Bankr API
  accounts. Ledger Safe execution uses native gas.
- Privacy Pools currently supports shielding and unshielding Ethereum ETH, not
  private in-pool transfers.
- Privacy Pools uses ASP/compliance processing. Shielding has a minimum and fees;
  private-relay exits may charge a quoted fee. Public recovery can link the
  original deposit and exit.
- Supported fee tokens and eligible workflows vary by account, chain, and
  transaction.
- Transaction previews improve comprehension but do not guarantee safety.

WalletChan is open source.

Install WalletChan and sign smarter across your EVM workflows.

## Screenshot sequence

Chrome accepts up to five screenshots. Use current UI from the exact submitted
package and keep captions short.

1. **Wallet beside your dapps** — Show the Warm Midnight portfolio and main
   actions open in Chrome's side panel beside a real dapp.
2. **Understand before approving** — Show readable intent and simulated asset
   changes.
3. **Ledger and existing Safe accounts** — Show a Ledger owner approving or
   executing a Safe request.
4. **Privacy Pools ETH shielding** — Show the real Ethereum Shield/Unshield flow.
5. **Supported-token network fees** — Show an eligible USDC fee quote with the
   selected account and chain visible.

> **Screenshot placeholders**
>
> Replace this block with the five final 1280×800 full-bleed images captured from
> the submitted v4 package.

## Pre-submission gates

- Verify every sentence against the final packaged v4 artifact.
- Verify the Chromium manifest name and description match the approved item title
  and summary; keep Firefox metadata aligned where accurate.
- Reconcile `PRIVACY_POLICY.md` and the Chrome privacy-practices responses with
  the complete v4 provider and data-flow inventory.
- Confirm all requested permission justifications in `CHROME_WEBSTORE.md` against
  the final manifest and packaged behavior.
- Capture the five screenshots from the submitted package.

## Sources

- `apps/website/app/home-v2/HeroStorySection.tsx`
- `_docs/LEDGER.md`
- `_docs/SAFE_ACCOUNTS_PRD.md`
- `_docs/PRIVACY_POOLS_HANDOFF.md`
- `_docs/GAS_ABSTRACTION.md`
- `_docs/PRIVACY_POOLS_MAINNET_TEST.md`
- [Chrome listing guidance](https://developer.chrome.com/docs/webstore/best-listing)
- [Chrome Web Store program policies](https://developer.chrome.com/docs/webstore/program-policies/policies)
