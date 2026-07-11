# WalletChan Marketing

Working positioning document for the next landing page. This is intentionally
broader than the current Bankr-centric homepage.

## Core Positioning

WalletChan is a self-custody browser wallet for EVM users who want fewer
signing interruptions, clearer transaction intent, built-in swap/bridge flows,
and a browser that understands the onchain web. It should feel like the wallet
that adopts useful Ethereum UX standards early, ships them quickly, and exposes
the benefit in plain language.

Bankr remains a strong account option, but it should not be the top-level
promise. The top-level promise is:

> WalletChan upgrades your browser into a safer, faster EVM wallet.

Longer version:

> A self-custody browser wallet with smart-account batching, decoded signing,
> asset-change previews, swap and bridge, ENS/IPFS browsing, custom EVM chains,
> optional Bankr accounts, open-source code, no user tracking, and
> $WCHAN-powered perks.

## Messaging Principles

- Lead with the wallet, not Bankr.
- Explain protocol features in user language first, then name the standard.
- Make speed of execution a trust signal: WalletChan should be positioned as a
  wallet that quickly ships modern Ethereum wallet ERCs when they improve real
  UX, not as a slow incumbent waiting for the whole market.
- Show product UI early. Wallet users need to see confirmations, balances,
  swap/bridge, and browsing flows before they trust the claims.
- Avoid raw chain-count competition. Trust, OKX, Zerion, and Phantom already
  own huge-chain-count messaging. WalletChan should own power-user EVM workflow
  plus browser-native onchain UX.
- Avoid absolute claims where support depends on chain, RPC, dapp, or account
  type. Phrase as "on supported chains", "where available", or "for eligible
  flows" when needed.
- Make trust concrete. WalletChan is fully open source and built with privacy
  in mind: no user tracking should be a visible landing-page claim, not a
  footer afterthought.
- Treat $WCHAN as ecosystem power, not the only reason to install.

## Primary Audience

- EVM power users who sign a lot of dapp transactions.
- DeFi users frustrated by approve-then-swap / approve-then-bridge flows.
- Users who want Rabby-like clarity but also smart account batching and
  in-wallet movement.
- Browser-first users who care about ENS, IPFS, onchain HTML, and dapp browsing.
- Bankr users who want their account to work across normal dapps.
- Agent / automation users who need constrained wallet access without exposing
  seed phrases or private keys.

## USP Hierarchy

### Tier 1: Homepage Hero Claims

1. **One review, many actions**
   - User benefit: fewer popups and fewer repeated approvals.
   - Product proof: ERC-5792 `wallet_sendCalls`, ERC-7821 encoding, EIP-7702
     smart-account execution for private key and seed phrase accounts on
     supported chains, Bankr atomic path.
   - Plain copy: "Bundle approve + action into one clear confirmation."
   - Technical label: EIP-7702 smart accounts + ERC-5792 batch transactions.
   - Strategic message: WalletChan is already shipping the newer wallet ERCs
     meant to fix Ethereum's click-heavy UX.

2. **Know what you are signing**
   - User benefit: understand transactions before confirming.
   - Product proof: ERC-7730 clear signing, decoded calldata, nested calldata,
     EIP-712 display, SIWE parsing, asset-change simulation, editable ERC-20
     approvals, gas tiers.
   - Plain copy: "See the token flows, decoded intent, calldata, and login
     domain before you sign."
   - Strategic message: ERC-7730 clear signing belongs in everyday wallet UX,
     not only in developer demos.

3. **Swap and bridge from the wallet**
   - User benefit: move assets without bouncing between extra tabs.
   - Product proof: 0x-backed swaps, Bungee-backed bridging, batched bridge
     approve + bridge when wallet capabilities allow it, WCHAN custom V4 route.
   - Plain copy: "Trade and move assets across chains without leaving the
     wallet."

4. **The browser understands ENS and IPFS**
   - User benefit: browse the onchain web from a normal browser.
   - Product proof: ENS browsing, IPFS/IPNS routing, local Kubo gateway support,
     onchain HTML pinning, dapp3 browser/OS surfaces.
   - Plain copy: "Open ENS, IPFS, and onchain HTML sites from your browser, with
     optional local IPFS."

5. **Open source and privacy-minded**
   - User benefit: users can inspect the wallet and use it without behavioral
     tracking.
   - Product proof: public GitHub repository, self-custody local key storage,
     no user tracking.
   - Plain copy: "Fully open source. Built with privacy in mind. No user
     tracking."

### Tier 2: Supporting Feature Sections

- **Every EVM workflow, your way**
  - Built-in chains include Ethereum, Arbitrum, Base, BNB Chain, Optimism,
    MegaETH, Polygon, and Unichain.
  - Users can add custom EVM chains.
  - Swap support extends to 0x-supported chain IDs when configured.
  - Bankr account support is chain-limited; private key and seed phrase
    accounts cover normal local signing paths.

- **Multiple account modes**
  - Bankr accounts for API-backed execution.
  - Private key accounts for local signing.
  - Seed phrase accounts with HD derivation.
  - View-only / watch-style impersonator accounts for inspection.
  - Public copy should say "three signing modes plus watch-only accounts."

- **Fast confirmations where the chain supports it**
  - Flashblocks-aware receipt polling on supported chains such as Base,
    Optimism, and Unichain.
  - MegaETH sync-send support exists, but should be marketed carefully as
    chain-specific fast UX, not a universal guarantee.

- **Rich transaction history**
  - Stores status, gas data, decoded clear-signed metadata, swaps, bridges,
    source/destination asset changes, batch call origins, and force-inclusion
    metadata where available.

- **WalletConnect and modern dapp compatibility**
  - EIP-6963 injected-provider discovery.
  - WalletConnect session support for dapps that do not discover the injected
    provider.

- **Agent-ready access control**
  - Agent password can unlock operational signing while blocking secret reveal
    and sensitive account changes.
  - This is a high-value but advanced feature; likely a lower homepage section
    or docs/developer section, not the hero.

- **Open source, no tracking**
  - Fully open-source codebase.
  - Privacy-minded product stance: no user tracking.
  - Self-custody should be paired with local encrypted key storage in copy.
  - This should appear in the hero trust row and as a dedicated section.

- **Cutting-edge Ethereum UX**
  - Modern ERCs are not just technical badges. They should be framed as a
    product habit: WalletChan ships the useful standards fast and translates
    them into fewer clicks, clearer signing, and faster confirmations.
  - Proof points: EIP-7702, ERC-5792, ERC-7821, ERC-7730, SIWE parsing, EIP-6963
    wallet discovery.
  - Avoid saying every flow is universally supported; chain and account support
    still matters.

- **Powered by $WCHAN**
  - Token, staking, premium fee tier, sponsored transfer eligibility, community
    identity, comparison page, WCHAN custom swap route.
  - Lead with utility/perks. Avoid making the landing page feel like only a
    token page.

## Competitor Analysis

| Wallet | Current positioning | Strengths to learn from | Opening for WalletChan |
| --- | --- | --- | --- |
| [Rainbow](https://rainbow.me/) | "Experience Crypto in Color"; fun, powerful, secure wallets; extension speed, keyboard shortcuts, many wallets, swap/bridge, watch/impersonate. | Delight, color, motion, direct screenshots, command-menu story. | WalletChan can borrow the "fast power user" energy, but differentiate with smart-account batching, clear signing, and onchain browser features. |
| [Ambire](https://www.ambire.com/) | "Your Web3 wallet that just works"; fewer clicks, no clutter, every EVM network, bridge, EIP-7702, no annoying approvals, privacy. | Very close overlap on 7702, approvals, and smart-wallet UX. Strong simple language. | WalletChan must not claim 7702 alone as the moat. Pair it with decoded signing, IPFS/ENS browsing, WCHAN perks, and optional Bankr/agent workflows. |
| [MetaMask](https://metamask.io/) | "Your home onchain" / "The everything wallet"; buy, swap, earn, perps, RWAs, prediction markets, security, privacy, trust. | Big consumer promise, broad use-case grid, strong product imagery. | Avoid fighting "everything wallet" directly. WalletChan can feel sharper: an EVM power wallet for people who want safer signing and fewer clicks. |
| [Zerion](https://zerion.io/) | "Browse the New Internet"; every dapp, every asset, every chain; portfolio clarity; bridge and swap in one transaction; social proof and community stats. | Great portfolio/clarity language and "new internet" narrative. | WalletChan can take the browser/internet narrative further with actual ENS/IPFS/local Kubo browsing and extension-level dapp workflows. |
| [Rabby](https://rabby.io/) | EVM-focused safety wallet; official page is JS-only, but search snippets and public reviews emphasize transaction simulation, risk scanning, auto chain handling, open source/audits. | Owns "safer EVM signing" in many users' minds. | WalletChan needs to show parity on simulation/decoded calldata while adding batching, swap/bridge, agent access, and browser superpowers. |
| [Trust Wallet](https://trustwallet.com/) | "True crypto ownership"; 200M users, 100+ blockchains, millions of assets, audits, privacy/security, high app-store ratings. | Social proof, trust language, breadth, beginner confidence. | WalletChan cannot beat Trust on scale. Use craftsmanship and power features instead of giant-number marketing. |
| [Phantom](https://phantom.com/) | "The money app that'll take you places"; trading, predictions, perps, spend/send/save, security, 20M+ users. | Consumer-grade money-app framing and lifestyle confidence. | WalletChan should stay more browser/EVM-native, not become a generic finance super-app in messaging. |
| [Base App](https://join.base.app/) | "Built to Trade"; trade, mini apps, chat, free global USDC sends, social feed. | Clear action-oriented hero and consumer-native copy. | WalletChan can mention Base/Flashblocks/WCHAN, but should remain chain-neutral for EVM users. |
| [OKX Wallet](https://web3.okx.com/) | "One crypto wallet, 130+ native chains"; store, analyze, swap, trade, stake, security, dapp gateway. | Strong all-in-one trading and chain breadth pitch. | WalletChan should not try to match all-chain breadth; win on EVM transaction UX, local browser capabilities, and open-source/community feel. |

## Market Gaps WalletChan Can Own

- **Smart transaction flow plus transaction comprehension.** Ambire owns fewer
  clicks; Rabby owns safer previews. WalletChan can combine both.
- **Fast-moving standards adoption.** Many incumbents move slowly on newer
  Ethereum UX standards. WalletChan can credibly present itself as a wallet that
  ships those standards quickly when they help users.
- **Browser-native onchain web.** Most wallet sites say "browse dapps"; few make
  ENS/IPFS/local node browsing a hero-grade feature.
- **Power wallet without hiding raw details.** Clear signing plus raw calldata
  fallback is a trust signal for advanced users.
- **Agent-aware self-custody.** Agent password is unusually concrete for
  automation: agents can operate without getting secret-reveal privileges.
- **Community token with actual product hooks.** $WCHAN has staking, fee tiers,
  sponsored transfer eligibility, custom swap routing, and OS/community pages.
- **Transparent wallet with a private default.** Many wallet pages talk about
  security and privacy generically. WalletChan can say the code is open source
  and the wallet does not track users.

## Homepage Strategy

Build the new homepage at a separate path first, likely `/home-v2` or `/new`, so
the old page can remain available for comparison.

Recommended first-viewport structure:

- H1: `WalletChan`
- Subhead: `A self-custody browser wallet with smart-account batching, safer signing, swap and bridge, ENS/IPFS browsing, and optional Bankr accounts.`
- Primary CTA: `Add to Chrome`
- Secondary CTA: `Add to Firefox`
- Tertiary link: `View on GitHub`
- Visual: real extension UI or a high-fidelity animated product composition,
  not an abstract illustration.
- Three proof chips near the hero:
  - `Modern wallet ERCs, shipped fast`
  - `7702 + 5792 batching`
  - `Clear signing + asset preview`
  - `ENS/IPFS browser mode`
  - `Open source + no tracking`

Recommended page flow:

1. **Hero: WalletChan as browser wallet command center**
   - Product screenshot/video composite: confirmation popup, sidepanel, batch
     calls, asset changes, ENS/IPFS browsing.

2. **Less clicking, more doing**
   - Explain approve + swap / approve + bridge batching.
   - Show "before: 3 popups" vs "after: 1 review" interaction.
   - Include technical pill: EIP-7702, ERC-5792, ERC-7821.

3. **Understand every signature**
   - Asset changes, clear signing, decoded calldata, SIWE.
   - Show a real transaction confirmation with token in/out rows and decoded
     function labels.

4. **Trade and move assets**
   - Swap and bridge modules.
   - Mention 0x/Bungee only in details, not headline.
   - Include WCHAN fee/perk callout separately.

5. **Browse the onchain web**
   - ENS, IPFS, IPNS, onchain HTML, local Kubo.
   - This should feel visually distinct: browser address bar, local node status,
     ENS page loaded.

6. **Bring any EVM account**
   - Private key, seed phrase, Bankr, watch-only.
   - Built-in chains plus custom chains.

7. **Open source, private by design**
   - Fully open source.
   - No user tracking.
   - Self-custody with encrypted local key storage.

8. **Built for serious dapp sessions**
   - Sidepanel mode, per-tab chains/accounts, WalletConnect, rich history,
     notifications, fast polling where available.

9. **Powered by $WCHAN**
   - Token utility, staking/premium fees, sponsored transfers, ecosystem pages.
   - CTA to buy/stake should be secondary to wallet install.

10. **Final CTA**
   - `Install WalletChan`
   - Short trust row: open source, self-custody, local key storage, audited
     dependencies/standards where true.

## Visual Direction

The Bauhaus homepage now feels like a v1 brand experiment. The new page should
feel more like a premium product surface:

- Product-first, dark neutral canvas with sharp contrast.
- Real UI screenshots, animated interface states, and motion demos.
- Use depth, light, and motion, but avoid generic gradient-orb SaaS styling.
- Palette idea: near-black / graphite base, clean white text, WCHAN yellow as
  energy, cyan/blue for chain/network motion, green for received assets, red
  only for risk/outflows.
- Typography should be confident but not all-uppercase everywhere.
- Cards should be functional product panels, not decorative nested cards.
- Use short, punchy section headers with compact explanatory copy.

## MotionSites Prompt Adaptation

The user-provided MotionSites prompts worth adapting are **Audio Showcase** and
**SaaS Value**. Do not copy their fictional brands or exact content; extract the
layout mechanics and interaction quality.

### Audio Showcase Pattern

Original pattern: single-viewport, cinematic hero with a full-bleed boomerang
video background, translucent "liquid glass" UI, small premium nav, centered
minimal headline, and a bottom-right media control widget.

WalletChan adaptation:

- Use a full-bleed hero media layer. Best candidate: a short silent screen
  recording or staged animation of WalletChan confirmations rather than an
  abstract generated clip.
- Boomerang loop idea maps well to transaction flow:
  `dapp request -> decoded review -> bundled calls -> signed -> confirmed`,
  looping forward/backward as a visual rhythm.
- Use liquid-glass sparingly for nav, proof chips, and one floating status
  widget. The main product UI should remain crisp and readable, not blurred.
- Replace the "Now Playing" music widget with a "Now Signing" widget:
  - top row: `Batch ready`
  - title: `Approve USDC + Swap to WCHAN`
  - progress: `Asset preview -> Gas -> Confirm`
  - controls: `Inspect`, `Simulate`, `Confirm`
- Keep the hero copy minimal. This pattern works best when the product visual
  carries most of the explanation.
- Motion note: if using glass elements inside animated wrappers, avoid
  persistent transforms after entrance animations. The prompt's warning about
  `animation-fill-mode: backwards` is relevant because lingering transforms can
  break `backdrop-filter` behavior.

Possible WalletChan hero using this pattern:

- H1: `WalletChan`
- Subhead: `A self-custody browser wallet that bundles actions, explains what
  you sign, and opens the onchain web.`
- Badge: `Smart batching . Clear signing . ENS/IPFS`
- Primary CTA: `Add to Chrome`
- Secondary CTA: `Watch the flow`

### SaaS Value Pattern

Original pattern: full-viewport SaaS hero with a bright background image,
simple nav, centered value proposition, search/prompt bar, and a large scaled
dashboard mockup rising from the bottom.

WalletChan adaptation:

- Use this structure for the v2 homepage if we want clarity over cinema.
- Replace the search bar with a command-style wallet prompt:
  `What are you about to sign?`
  or
  `Paste calldata, simulate a tx, or search a dapp`
  This can stay non-functional in the hero, but it should visually point to the
  wallet's decoded-signing and agent-adjacent strengths.
- Replace the SaaS dashboard mockup with a fixed-width wallet command center:
  - browser chrome title bar: `walletchan.com`
  - left sidebar: Accounts, Activity, Swap, Bridge, Browser
  - top stats: `1 review`, `3 calls`, `$0.08 gas`, `2 asset changes`
  - cards: Smart Batch, Clear Signing, Asset Preview
  - table: transaction history rows with decoded labels and chain icons
- Keep the scaled-dashboard technique. A fixed design-width mockup scaled down
  with `ResizeObserver` is useful for preserving a polished product composition
  across mobile and desktop.
- This pattern is stronger for explaining the product than Audio Showcase. It
  can show many WalletChan USPs in one viewport without making users scroll.

Possible WalletChan hero using this pattern:

- H1 line 1: `Sign smarter.`
- H1 line 2: `Move faster.`
- Description: `Bundle approvals, preview asset changes, decode calldata, and
  browse ENS/IPFS from one self-custody browser wallet.`
- Search placeholder: `What is this transaction doing?`
- CTA: `Add to Chrome`, `View demo`

### Recommended Hybrid

Use a hybrid instead of choosing one prompt literally:

- **Audio Showcase** supplies atmosphere: full-bleed motion, premium glass nav,
  cinematic confidence.
- **SaaS Value** supplies clarity: centered headline, compact value prop,
  product mockup, proof metrics.

Concrete v2 direction:

1. Full-viewport first section, but allow a hint of the next section below the
   fold on common viewports.
2. Dark, full-bleed animated background built from WalletChan product states,
   not stock video.
3. Centered H1 and CTA stack.
4. Large product command-center mockup rising from the bottom.
5. Floating "Now Signing" card in the lower right, adapted from Audio Showcase.
6. Glass nav and proof chips, but readable opaque panels for transaction data.
7. Staggered fade-up animations, reduced-motion safe.

This hybrid should feel like a high-end wallet product, not a generic SaaS page
and not a token landing page.

## Copy Bank

Hero options:

- `WalletChan`
- `The browser wallet for serious EVM sessions`
- `A safer, faster wallet for the onchain browser`
- `One wallet for signing, swapping, bridging, and browsing the EVM web`

Subheads:

- `Bundle approvals, preview asset changes, decode calldata, and move assets across chains from a self-custody browser wallet.`
- `Smart-account batching, clear signing, swap and bridge, custom chains, ENS/IPFS browsing, and optional Bankr accounts.`
- `For users who want fewer popups, more context, and a browser that can actually navigate the onchain web.`

Feature headlines:

- `One Review, Many Actions`
- `Know Before You Sign`
- `Swap And Bridge In Wallet`
- `Browse ENS And IPFS Locally`
- `Every EVM Chain You Need`
- `Bring Your Keys, Seed, Or Bankr Account`
- `Rich History For Real DeFi Sessions`
- `Powered By $WCHAN`

Avoid:

- `Like MetaMask, but AI-powered`
- `Bankr wallet address, in your browser`
- `No seed phrases needed`
- `All chains` without clarifying EVM/custom-chain support
- `Instant confirmation` without supported-chain context

## Claims Requiring Care

- "No more infinite approvals" should be softened to "fewer approval loops" or
  "bundle approvals with the action where supported." Some flows still require
  approvals due to protocol design.
- "All EVM chains supported" should be phrased as "built-in EVM chains plus
  custom EVM chains"; feature availability varies by chain, RPC, provider, and
  account type.
- "Instant tx confirmation" should be "fast confirmation detection on
  Flashblocks-aware chains/RPCs."
- "Bankr accounts" should be "optional Bankr accounts" and not the main product
  category.
- "Sponsored transfers" should be tied to sWCHAN eligibility and current API
  availability.

## Source Notes

Local product docs reviewed:

- `_docs/WEBSITE.md`
- `_docs/STYLING.md`
- `_docs/IMPLEMENTATION.md`
- `_docs/7702.md`
- `_docs/ERC5792.md`
- `_docs/CLEAR_SIGNING.md`
- `_docs/CALLDATA.md`
- `_docs/SWAP.md`
- `_docs/BRIDGE.md`
- `_docs/ASSET_CHANGES_SIMULATION.md`
- `_docs/OS.md`
- `_docs/SECURITY.md`

Competitor/reference pages reviewed:

- Rainbow: https://rainbow.me/
- Ambire: https://www.ambire.com/
- MetaMask: https://metamask.io/
- Zerion: https://zerion.io/
- Rabby: https://rabby.io/
- Trust Wallet: https://trustwallet.com/
- Phantom: https://phantom.com/
- Base App: https://join.base.app/
- OKX Wallet: https://web3.okx.com/
- MotionSites: https://motionsites.ai/

## Open Questions

1. Should the new homepage speak mainly to power users or mainstream wallet
   users? The product is strongest for power users today.
2. How prominent should $WCHAN be above the fold: hero proof chip, navbar
   banner, or lower utility section?
3. Should "browser superpowers" be the primary differentiator, or should it sit
   after the transaction UX sections?
4. Do we want a polished premium dark style, or a louder crypto-native style?
5. Do we have current product screenshots/recordings for the new hero, or
   should the v2 page generate its own staged UI mockups from live components?
6. Which route should host the test page: `/home-v2`, `/new`, or another path?
