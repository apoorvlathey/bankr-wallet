# Native privacy and shielded assets exploration

> Research status: exploration, not an implementation specification  
> Last verified: 2026-07-20
> Scope: Railgun, Privacy Pools v1, Veil Cash, Kohaku, WalletChan UX,
> key recovery, extension architecture, and security gates

> **Implementation PRD:** The approved WalletChan product and engineering
> requirements for the first Privacy Pools integration live in
> [`PRIVACY_POOLS_PRD.md`](./PRIVACY_POOLS_PRD.md). This document remains the
> broader protocol comparison and research record.
> The fresh-session implementation handoff is
> [`PRIVACY_POOLS_HANDOFF.md`](./PRIVACY_POOLS_HANDOFF.md).

> **Current implementation slice (2026-07-20):** First eligible Private-mode entry
> creates a separate encrypted Privacy Pools recovery phrase in the background.
> Password login and fresh biometric login both support this; a biometric
> factor that predates Shield receives an empty purpose-separated scaffold on
> its next assertion. Pressing Shield opens the exact ETH quote/review flow
> immediately above the active deployment's onchain minimum; no proof-readiness
> wait blocks amount entry. Final durable preparation independently verifies the
> compile-time-selected official Sepolia/mainnet ETH deployment, while packaged proof self-tests stay
> available as a trusted diagnostic and release gate.
> Private-key and seed-phrase accounts can Shield on Sepolia through the normal
> pinned confirmation flow; receipt/event sync, encrypted commitments, strict
> ASP verification, partial/full relayed Unshield, public recovery, and clean
> phrase restore/rescan are implemented. The normal wallet Activity row mirrors
> only a public exact-bound Shield stage and amount snapshot, remains linked to
> the underlying Sepolia transaction details, and never receives commitment,
> label, index, proof, or recovery material. Confirmed/indexed deposits count
> in the headline balance before ASP approval, while the pending subset is
> displayed separately and can be withdrawn publicly by the exact original
> depositor. One real Sepolia public withdrawal has been observed after fixing
> and regression-testing the distinction between the deposit precommitment and
> spent-nullifier hash. Normal production builds now select the pinned Ethereum
> mainnet profile and support Bankr/private-key/seed-phrase mutations; Sepolia
> development continues to block Bankr. Impersonator signing, agent-password
> mutations, value-bearing mainnet rollout, and store distribution remain
> blocked by their respective gates. The automated dual-profile implementation
> is complete, but the complete written browser rehearsals are not. See
> [`PRIVACY_POOLS_TASKS.md`](./PRIVACY_POOLS_TASKS.md).

[privacy.eth.sh](https://privacy.eth.sh/) was used as the discovery directory
for this comparison. Its comparison data is helpful for orientation, but all
shipping decisions must be revalidated against the protocol-owned sources
linked below and current onchain configuration.

## Executive recommendation

WalletChan should expose privacy as a native balance mode, not as a protocol
marketplace. The primary model should be:

- **Public balance**: ordinary WalletChan assets and addresses.
- **Private balance**: assets controlled by WalletChan's privacy recovery
  material and held in one or more supported shielded protocols.
- **Shield**, **Send privately**, and **Withdraw**: user actions.
- **Privacy route**: Railgun, Privacy Pools, or Veil, selected automatically
  when there is one clearly suitable route and shown as a material detail
  before confirmation.

The protocols are not interchangeable. They have different networks, assets,
recipient types, recovery models, waiting periods, relayer dependencies, and
privacy guarantees. WalletChan can unify the navigation and balance language,
but must not flatten those differences into a false promise of “anonymous.”

Recommended sequencing:

1. Build a protocol-neutral privacy account, recovery, storage, sync, and
   confirmation architecture first.
2. Run two spikes in parallel conceptually, but do not ship either as-is:
   - Privacy Pools v1 through Kohaku on Ethereum/Sepolia to validate the
     EF-aligned plugin and keystore model.
   - Veil on Base to validate the lower-cost product flow, ETH/USDC routing,
     screening queue, and existing WalletChan MCP knowledge.
3. If Veil's operator/relayer and verified-deposit model is acceptable, it is
   the best **first product beta** for WalletChan's Base-heavy audience.
4. If the goal is the smallest protocol surface and strongest alignment with
   Kohaku, Privacy Pools v1 is the best **first engineering integration**, but
   its current Kohaku adapter must be treated as alpha and security-reviewed.
5. Add Railgun after proving, indexing, recovery, and background execution are
   robust. It offers the richest long-term private-wallet capability, but it is
   the largest integration and currently has no Base deployment.

Do not ship the current Kohaku Privacy Pools relayer path without fixing or
upstreaming its missing withdrawal-data validation. The code currently logs a
warning instead of decoding the relayer payload and proving that the recipient
and fee match the user's approved values.

## Product principles

The product is a mobile-first browser wallet for newcomers and power users.
Privacy should feel **native, protective, legible, and honest**. The aesthetic
and interaction essence remains WalletChan's “warm financial confidence,” not
a separate cyberpunk privacy application.

1. **Outcome first**: “Move 0.1 ETH into your private balance,” not “Use
   Privacy Pools.”
2. **One main action per screen**: recovery setup, route review, transaction
   approval, waiting, and ready states are separate decisions.
3. **Progressive disclosure, not concealed risk**: protocol mechanics can live
   under Route details, but fees, wait time, public data, and recovery risk
   belong in the primary review.
4. **No anonymity promise**: explain exactly what becomes private and what
   remains public.
5. **Privacy-safe defaults**: warn about same-amount, timing, address-reuse, and
   transaction-graph correlation before withdrawal.
6. **Secrets never enter the renderer**: the UI receives addresses, balances,
   status, and prepared summaries, never a privacy root, spending key, raw
   witness, or decrypted protocol state.
7. **Recovery before deposit**: no mainnet shielding until WalletChan has
   verified that the user can recover the privacy account.
8. **Every route has an escape path**: normal private withdrawal and the
   protocol's emergency/public exit must both be understood and tested.

## What privacy can and cannot mean

Shielded pools protect the link between public entry and later private actions,
but cryptography does not remove all metadata. A public shield still exposes
the source account, token, amount, time, chain, and protocol. A public
withdrawal exposes its recipient, token, amount, time, and protocol. Internal
private transfers differ by protocol.

A June 2026 measurement study of Railgun found that timing, address reuse,
prior public transaction proximity, distinctive amount digits, and sums of
amounts all create behavioral leakage. Its five heuristics uniquely linked
17.65% of observed withdrawals to deposits; this is evidence for UX safeguards,
not proof that every linked transaction was correctly attributed. See
[A Tattered Cloak of Invisibility](https://arxiv.org/abs/2606.25926).

WalletChan should therefore say:

> This route hides the onchain link between your deposit and later private
> activity. Your deposit and withdrawal are still public, and matching amounts,
> timing, or reused addresses can weaken privacy.

It should not say:

> This transaction is anonymous or untraceable.

## Protocol comparison

Facts in this table reflect official sources checked on the date above. “Live
asset” means an asset with an official documented deployment, not every asset
the protocol design could theoretically support.

| Dimension | Privacy Pools v1 | Railgun | Veil Cash |
| --- | --- | --- | --- |
| Best mental model | Deposit, later withdraw privately | Full private wallet and private DeFi balance | Base private balance with verified/screened entry |
| WalletChan network overlap | Ethereum | Ethereum and Polygon | Base |
| Officially documented networks | Ethereum mainnet deployment; Sepolia in Kohaku | Ethereum, Arbitrum, BNB Chain, Polygon | Base |
| Live/documented assets relevant here | ETH pool on Ethereum | Arbitrary ERC-20s; docs also describe ERC-721 shielding | ETH and USDC |
| Internal private send | Not in the current v1 Kohaku feature surface | Yes, to a `0zk` address | Yes, to a registered Ethereum `0x` address |
| Private DeFi | No | Yes, through Adapt Modules | Not the current core wallet surface |
| Public entry | Depositor, asset, amount, time are public | Shielder, asset, amount, time are public | Registration/deposit and queue are public |
| Normal private exit | ASP membership proof; direct or relayed | ZK transaction through broadcaster or self-broadcast | Hosted relayer |
| Compliance/assurance | ASP controls approved labels | Private Proofs of Innocence list proofs | Verified address or 0xbow KYT queue |
| Emergency exit | Ragequit to original depositor, without ASP approval; public link | During PPOI standby, self-broadcast back to original shielder | Rejected queued deposits refund to original depositor; private pool exit otherwise depends on Veil flow |
| Protocol fee | Configurable vetting fee per pool | 0.25% on shield and unshield | 0.3% on deposit |
| Relay fee | Configurable relayer fee | Gas plus broadcaster premium, generally around 10% of gas according to Railgun docs | Docs say no extra relay fee for transfer/withdrawal |
| Waiting/status model | Wait for ASP inclusion; ragequit if not approved/revoked | Initial PPOI unshield-only standby documented as one hour | Instant verified paths, or usually <15 minute screening; complex cases up to five days; documented six-hour holding window |
| Recovery material | Deposit and rotating withdrawal secrets; Kohaku derives them from a host BIP-32 keystore | Mnemonic-derived spending and viewing keys | Separate Veil private key derived by wallet signature, passkey PRF, or import |
| Main trust/dependency | Entrypoint is upgradeable; ASP/postmen publish current approved root; relayer optional | Broadcasters, indexers/quick-sync and PPOI infrastructure affect availability; protocol claims no owner | Veil operator finalizes screened deposits; hosted screening and relayer affect availability |
| Wallet integration maturity | Upstream protocol SDK exists; Kohaku package is alpha and explicitly not production-ready | Mature community Wallet SDK exists; Kohaku Rust implementation is newer and currently configures only Ethereum/Sepolia | Official TypeScript SDK is active; WalletChan MCP already integrates its MCP surface |
| Main WalletChan advantage | Simple capability and strongest Kohaku alignment | Richest long-term private wallet | Base support, low fees, ETH/USDC, existing WalletChan familiarity |
| Main WalletChan concern | Ethereum gas, only ETH live, ASP eligibility, Kohaku alpha gaps | Large bundle/state/proving surface, separate `0zk` UX, no Base | Separate key, registration link, operator/relayer dependency, verification/queue friction |

### Privacy Pools v1

Privacy Pools creates a private commitment from a public deposit. A normal
withdrawal proves both ownership of a commitment and membership of its label in
the ASP's approved set. A partial withdrawal creates a replacement commitment
for the remaining amount. The original depositor can use **ragequit** to recover
the remaining value without ASP approval, but that exit is public and is
available only to the original depositor. WalletChan exposes this as
**Withdraw publicly** as soon as the exact confirmed deposit is indexed, so a
user can choose it while ASP review is still pending instead of waiting.

The official deployment page currently lists one Ethereum mainnet ETH pool:

- Entrypoint proxy: `0x6818809eefce719e480a7526d76bd3e561526b46`
- ETH pool: `0xf241d57c6debae225c0f2e6ea1529373c9a9c9fb`

The protocol design supports native and ERC-20 pools, but WalletChan must use
the deployment registry as the product truth. “ERC-20 capable” must not become
“all tokens supported” in the UI.

Important properties:

- The ASP publishes an approved-label Merkle root through authorized postmen.
- Withdrawal uses the latest valid ASP root.
- A removed or never-approved label cannot use the normal private withdrawal;
  ragequit remains the complaint exit.
- Direct withdrawal makes the submitter visible and responsible for gas.
- Relayed withdrawal improves submitter unlinkability but adds a relayer quote
  and payload as an additional trust boundary.
- Entrypoint is documented as upgradeable. WalletChan should resolve and pin
  supported proxy/implementation versions and warn/disable on unexpected
  upgrades until reviewed.

Official references:

- [Protocol overview](https://docs.privacypools.com/)
- [Core concepts and commitment model](https://docs.privacypools.com/overview/core-concepts)
- [ASP layer](https://docs.privacypools.com/layers/asp)
- [Deposit flow and configurable fee](https://docs.privacypools.com/protocol/deposit)
- [Direct and relayed withdrawal](https://docs.privacypools.com/protocol/withdrawal)
- [Ragequit](https://docs.privacypools.com/protocol/ragequit)
- [Ethereum deployments](https://docs.privacypools.com/deployments)
- [Core repository and published audits](https://github.com/0xbow-io/privacy-pools-core)

The core repository contains Oxorio circuit/contract reviews and an Auditware
contract review. The existence of audits is not sufficient for WalletChan:
the deployed proxy implementation, circuit artifacts, SDK release, and any
WalletChan adapter changes must map to reviewed commits.

### Railgun

Railgun is the broadest option. It maintains encrypted UTXO-like private
balances and supports private transfers, withdrawals, and external contract
interactions. A Railgun address begins with `0zk` and contains public spending
and viewing key material. The spending key authorizes funds; the viewing key
can decrypt activity without spending it.

Railgun's official docs list Ethereum, Arbitrum, BNB Chain, and Polygon. That
gives WalletChan Ethereum and Polygon overlap, but not Base. The docs describe
arbitrary ERC-20 and ERC-721 shielding. Product support should still use an
allowlist based on tested SDK/network token behavior rather than claiming every
token works.

Private Proofs of Innocence (PPOI) is separate from the core contracts. New
shields initially enter an unshield-only standby period, documented as one
hour, during which the safe action is a self-broadcast return to the original
shielding address. After proof completion, broadcasters can submit private
actions and receive gas plus premium from the private balance.

Important properties:

- A Railgun mnemonic is a full custody secret. WalletChan must never equate a
  `0zk` address or viewing key with recovery authority.
- Viewing keys are sensitive financial metadata. Railgun docs currently warn
  that a shared viewing key exposes private interactions indefinitely; treat
  export as master-only, explicit, and high risk.
- Syncing means fetching contract history, maintaining Merkle trees, and trying
  to decrypt notes. It needs persistent local state and a clear rescan path.
- Quick-sync/Subsquid and PPOI endpoints improve usability but add privacy and
  availability dependencies. WalletChan should support direct RPC verification
  or integrity checks and disclose which remote services are contacted.
- Private DeFi is a later product. It greatly increases clear-signing and
  simulation complexity; do not include it in the first shielded-balance phase.

Fees are a 0.25% protocol deduction on shield and unshield, plus gas. A
broadcaster premium is charged on gas rather than transfer value; official docs
say it is generally around 10% of gas but it is market-configured.

Official references:

- [Railgun overview and networks](https://docs.railgun.org/wiki)
- [Wallets, spending keys, and viewing keys](https://docs.railgun.org/wiki/learn/wallets-and-keys)
- [Shielding behavior](https://docs.railgun.org/wiki/learn/shielding-tokens)
- [Private balances and UTXOs](https://docs.railgun.org/wiki/learn/using-private-tokens)
- [PPOI and standby behavior](https://docs.railgun.org/wiki/assurance/private-proofs-of-innocence)
- [Protocol deductions and broadcaster premiums](https://docs.railgun.org/wiki/learn/railgun-deductions)
- [Wallet SDK scope](https://docs.railgun.org/wiki/learn/integrating-railgun/railgun-sdks)
- [Community Wallet SDK](https://github.com/Railgun-Community/wallet)
- [Engine SDK and scanning APIs](https://github.com/Railgun-Community/engine)
- [ABDK audit](https://assets.railgun.org/docs/audits/2021-04-01%20ABDK.pdf)
- [Zokyo audit](https://assets.railgun.org/docs/audits/2022-09-14%20Zokyo.pdf)
- [Bug bounty](https://www.railgun.org/bug-bounty)

### Veil Cash

Veil is a Base-only private pool product supporting ETH and USDC. A user has a
Veil private key and a public deposit key. Registration publishes the deposit
key and ties it to the user's Ethereum address, so registration is not a
private act. The private key decrypts incoming notes and authorizes private
spending.

Veil offers three independent key creation paths:

1. deterministic EOA message signature;
2. WebAuthn PRF passkey derivation; or
3. imported Veil private key.

The same EVM address gets a different Veil identity under each method. This is
a serious recovery footgun. WalletChan should choose one internal method and
never expose a casual method switch. The cleanest integration is to derive and
import a Veil key from WalletChan's dedicated privacy root.

Deposit eligibility is part of the product, not a footnote:

- Coinbase, Binance, or Ethos verification can provide an instant path.
- Otherwise the deposit enters queue contracts for 0xbow KYT screening.
- Official docs say screening is usually under 15 minutes, can take up to five
  days for complex cases, and uses a six-hour holding period.
- Approved deposits are finalized by a Veil operator into the private pool.
- Rejected deposits are refunded to the original depositor with no fee and no
  privacy benefit.

The minimum net shielded amounts are 0.01 ETH and 20 USDC. The deposit fee is
0.3%. The docs state that private transfers and withdrawals use Veil's relayer
without an extra relay fee. WalletChan must still fetch and display a current
quote/total and never encode these numbers as permanent assumptions.

Veil documents a collaborative Sherlock audit completed March 10, 2026 for
the live ETH and USDC pool contracts and core ZK components. Its pool builds on
Tornado Nova with scoped entry changes. Before shipping, WalletChan must obtain
the exact report and audited commit/deployment mapping rather than relying only
on the documentation statement.

Official references:

- [How to use Veil](https://docs.veil.cash/veil-cash-pools/how-to-use-veil-cash)
- [Keypair and recovery](https://docs.veil.cash/technical/veil-keypair)
- [Fees, minimums, assets, recipients, and relayer](https://docs.veil.cash/veil-cash-pools/faq)
- [Verified deposit paths](https://docs.veil.cash/intro/verified-users)
- [0xbow queue and rejection flow](https://docs.veil.cash/intro/verified-users/0xbow-screening)
- [Contracts and audit statement](https://docs.veil.cash/technical/deployments)
- [Official SDK](https://github.com/veildotcash/veildotcash-sdk)

## Kohaku assessment

The inspected Kohaku checkout was at commit `08febc2` dated 2026-07-08. Kohaku
is an EF-led reference wallet and SDK intended to expose privacy/security
primitives to wallet builders, while its reference extension is explicitly
power-user-oriented rather than a consumer product. This matches the supplied
screenshots: they demonstrate protocol reach, not the UX WalletChan should
copy.

The strongest reusable idea is the host contract:

- `network.fetch` for protocol network access;
- `storage` supplied by the wallet, with the explicit expectation that it can
  contain sensitive data and should be encrypted;
- `keystore.deriveAt(path)` supplied by the wallet;
- a provider and optional pre-scraped event source;
- protocol plugins that prepare public/private operations without owning the
  whole wallet UI.

This is the right dependency direction for WalletChan: the protocol asks the
wallet for narrow capabilities; it does not receive WalletChan's vault or raw
account objects.

### Privacy Pools package state

The inspected `@kohaku-eth/privacy-pools` version is `0.0.2-alpha.14`. Its
README says it is unaudited, not ready for production, and subject to breaking
changes. Its v2 implementation is a stub. Several public docs are TODO.

The implemented v1 secret manager uses the domain:

```text
m/28784'/1'/account'/secretType'/deposit'/secretIndex'
```

It derives separate salt and nullifier material, binds secrets to the chain ID
and entrypoint address, uses secret index 0 for the deposit, and sequential
indices for withdrawal/change secrets. This is a good recovery pattern because
the secrets can be rediscovered from one stable root plus scanned protocol
events.

The blocking issue is the relayer quote validator. It contains a TODO where it
should decode `withdrawalData` and verify recipient and fee, then accepts the
quote after logging a warning. A malicious or compromised relayer must never be
able to substitute a recipient or increase a fee between review and proof.

Kohaku's Privacy Pools config covers Ethereum mainnet and Sepolia. Its current
Railgun Rust config covers only Ethereum mainnet and Sepolia even though the
underlying Railgun protocol has additional deployments. Do not infer Kohaku
adapter support from protocol support.

Kohaku references:

- [Kohaku repository](https://github.com/ethereum/kohaku)
- [EF privacy commitment](https://blog.ethereum.org/2025/10/08/privacy-commitment)
- [Kohaku roadmap](https://notes.ethereum.org/@niard/KohakuRoadmap)
- [Plugin host interfaces](https://github.com/ethereum/kohaku/blob/main/packages/plugins/src/host/index.ts)
- [Privacy Pools warning](https://github.com/ethereum/kohaku/blob/main/packages/privacy-pools/README.md)
- [Privacy Pools secret derivation](https://github.com/ethereum/kohaku/blob/main/packages/privacy-pools/src/account/keys.ts)
- [Relayer quote validation gap](https://github.com/ethereum/kohaku/blob/main/packages/privacy-pools/src/state/thunks/quoteThunk.ts)
- [Railgun chain config](https://github.com/ethereum/kohaku/blob/main/crates/railgun/src/chain_config.rs)

### What to reuse and what not to reuse

Reuse:

- protocol-neutral host/plugin boundaries;
- deterministic, domain-separated secret derivation;
- local proof generation and wallet-owned encrypted storage;
- explicit public versus private operation types;
- incremental event sync and optional integrity-checked acceleration;
- the concept of a combined private balance and pending privacy states.

Do not reuse blindly:

- alpha packages without a WalletChan security review and pinned commit;
- in-memory storage examples;
- a protocol dropdown as the main user decision;
- a separately branded “private wallet inside the wallet”;
- remote circuit/WASM downloads that violate MV3 or are not integrity-pinned;
- incomplete relayer validation;
- the screenshot's long, late privacy warning as the only hygiene guidance.

## WalletChan privacy account and recovery model

### Recommended model: one dedicated privacy recovery root

WalletChan supports Bankr API, imported private-key, and seed-phrase accounts.
Deriving privacy identity directly from each account would produce three
different recovery experiences and can make a Bankr account unrecoverable if
the API cannot reproduce the exact signing secret. A single WalletChan-owned
privacy root gives all account types the same safety contract.

Generate a dedicated **Privacy recovery phrase** on the first privacy setup.
It must be distinct in naming, derivation domain, storage, and UI from every
ordinary WalletChan seed phrase. From its seed, derive protocol material with
explicit versioned domains, for example:

```text
WalletChan Privacy Root v1
  -> Privacy Pools v1 / chain / entrypoint / deposit sequence
  -> Railgun / chain / private account index
  -> Veil / chain / normalized public account address
```

Use the protocol's standard derivation where interoperability requires it. The
WalletChan derivation specification must be versioned and documented so a
future recovery tool can reproduce every key without the extension database.
Do not use a mutable display name, internal random account ID, installation ID,
or master password as derivation input.

Why not derive from the master password:

- passwords change;
- weak passwords are not custody-grade entropy;
- a reinstall cannot recover the key from the password alone;
- agent and passkey unlock paths do not necessarily expose that password.

Why not rely only on WebAuthn PRF:

- passkey sync is provider- and ecosystem-dependent;
- origin/RP binding complicates disaster recovery;
- a deleted passkey can permanently lose pool funds;
- Veil itself warns that its signature, passkey, and import paths produce
  different keys.

Passkeys should unwrap the encrypted privacy root for convenience, not be its
only backup.

### Setup and backup UX

Sepolia setup is deliberately invisible: first eligible Private-mode entry under a master or
fresh biometric session creates the identity in the service worker and shows
only the balance/actions dashboard. Backup and restore live in one compact
Settings -> Shield Recovery leaf. Reveal requires the explicitly entered
current main password; restore validates a user-entered BIP-39 phrase and runs
a bounded rescan. Agent sessions cannot create, reveal, restore, or rescan.
Plaintext exists in renderer memory only while that trusted Settings leaf is
open and is cleared on close; content scripts, dapp frames, and ordinary Shield
routes never receive it. The production mainnet profile retains the same
recovery boundary; value-bearing rollout may add a stricter pre-deposit backup
gate after product/security review.

### Storage and access control

The implementation stores its independent encrypted recovery in `privacyVault`.
Sepolia development preserves the released `walletchan-privacy-*-v1` database
names; production uses corresponding `*-mainnet-v1` names for durable
pre-signing operations, commitments, withdrawals, ragequits, portfolio, and
public event checkpoints. All
follow `_docs/STORAGE.md` and `_docs/PUBLISHING.md` and need no eager migration.
The implemented separation is:

- encrypted privacy root and versioned derivation metadata in the vault;
- non-secret protocol configuration and an exact key-ID/timestamp backup marker
  in `chrome.storage.local`;
- encrypted protocol notes and operation intents in IndexedDB (deposit and
  withdrawal indexes, current lineage, relayer payloads, nullifiers, and
  calldata use summary/revision-bound AAD);
- public, rebuildable Merkle/index caches in IndexedDB, integrity-checked;
- no privacy keys, notes, balances, recipient history, or viewing keys in
  `chrome.storage.sync`;
- no plaintext secret persistence in storage, logs, crash reports, analytics,
  Sentry, or MCP working directories; the explicit recovery leaf holds its
  reveal/import value only in transient local component state.

The privacy root should have a dedicated random encryption key with wrappers
matching WalletChan's master, passkey, and intentionally agent-capable signing
policy. Routine private sends can be allowed to an agent session only if the
team deliberately treats them like ordinary transaction signing. Recovery
phrase reveal/export and protocol viewing-key export remain master-only.

Account removal, reset, password rotation, and passkey changes need special
handling:

- Account removal is blocked before any dapp revocation and rechecked inside
  the final mutation lock when unresolved Shield operations, active recovery,
  unspent commitments, or unverifiable privacy state exist.
- Reset exposes only public Shield-data/backup status and requires an explicit
  phrase-saved-or-loss-risk acknowledgement before destructive effects.
- Password rotation rewraps keys; it must never derive a new privacy identity.
- Removing a passkey must not delete privacy material.
- A full rescan from the privacy phrase must restore balances without relying
  on old IndexedDB state.

### Protocol-specific recovery consequences

| Protocol | Privacy phrase alone restores | Additional dependency |
| --- | --- | --- |
| Privacy Pools | Deposit/withdrawal secrets and normal eligible withdrawals after rescan | Original public depositor control is required for ragequit |
| Railgun | Spending/viewing identity and balances after full scan | Network/index availability; optional PPOI services for normal spendability |
| Veil | Imported Veil private key if WalletChan's derivation is documented | Registration mapping and hosted relay availability for normal UX |

Bankr Sepolia Shield is disabled because the Bankr raw transaction API does not
support Sepolia. The production mainnet path is implemented through the normal
Bankr confirmation/submission coordinator with privacy authorization at its
final effect boundary. Impersonator deposits are always disabled. Before a
value-bearing Bankr rollout, WalletChan must prove that the same original Bankr
depositor can still authorize public recovery after a clean phrase rescan.

## Proposed UX

### Information architecture

The existing home **Shield** action remains the entry point. The destination
becomes a native privacy portfolio rather than an empty protocol form.

```text
Shield
├── Private balance summary
│   ├── Ready
│   ├── Pending screening / standby / confirmation
│   └── Needs attention
├── Shield assets
├── Send privately
├── Withdraw
└── Activity and recovery status
```

Do not put Railgun / Privacy Pools / Veil as top-level tabs. Route selection is
an advanced choice inside Shield and a visible attribute of each private asset
row. A user with funds in multiple protocols sees separate rows because those
balances are not fungible without a public or protocol-specific transition.

### Empty state

The first screen should answer three questions before presenting a form:

- What will improve: the later link from the user's public account can be
  hidden.
- What stays public: the shield transaction and its amount.
- What must be backed up: the separate privacy recovery phrase.

Primary action: **Set up private balance**.  
Secondary action: **How privacy works**.

### Shield flow

1. **Choose source**: public WalletChan account, network, and asset.
2. **Enter amount**: show public balance, Max that reserves gas, minimum, and
   approval requirement.
3. **Recommended route**: plain-language outcome, readiness, estimated time,
   and total cost. “Other routes” is secondary.
4. **Review**:
   - You shield / private balance receives;
   - protocol fee, network fee, approval, and total debit;
   - public information;
   - estimated wait and what can happen during it;
   - route/operator/ASP/broadcaster dependency;
   - recovery status and emergency exit.
5. **Confirm** through the existing WalletChan transaction confirmation path.
6. **Track** the full lifecycle after the public transaction confirms.

Recommended route examples:

- Base + ETH/USDC → Veil, if deposit eligibility and minimum pass.
- Ethereum + ETH → Privacy Pools for simple shield/withdraw, or Railgun if the
  user selects private sends/DeFi as the goal.
- Polygon + supported tested token → Railgun.
- Unsupported route → do not offer a disabled mystery button; explain the
  exact network/asset limitation.

### Pending lifecycle

“Pending” must not be a single spinner. Persist a protocol-neutral state
machine with protocol detail:

```text
draft
-> approval_required
-> awaiting_wallet_confirmation
-> submitted
-> public_confirmed
-> screening_or_standby
-> proof_preparing
-> private_ready

terminal alternatives:
rejected_refund_available | refunding | refunded
ragequit_available | withdrawing | failed_recoverable | failed_needs_support
```

The user should always see:

- current state in plain language;
- what is happening;
- whether funds are public, queued, or private;
- the earliest next action;
- an exact transaction/explorer link where one exists;
- a safe retry that cannot duplicate a deposit or withdrawal.

Examples:

- “Screening deposit · usually under 15 min · funds are in the Veil queue.”
- “Building proof of innocence · private sends unlock after completion.”
- “Not approved by the association set · recover publicly to Account 4.”

### Send privately

Recipient validation must be route-aware before proof generation:

- Railgun expects a valid chain-compatible `0zk` address.
- Veil expects an Ethereum `0x` address with an onchain registered deposit key.
- Privacy Pools v1 does not expose private transfer in the current integration.

Show recipient identity and route before amount. For every displayed `0x`
address, follow WalletChan's standard copy and explorer-link pattern. A `0zk`
address needs copy plus a protocol-aware explanation; an EVM explorer link is
not applicable to the private address itself.

### Withdraw

The withdrawal screen should provide privacy hygiene inline, not in a long
legal notice after the amount field:

- warn when the amount exactly matches a recent shield;
- warn when withdrawing shortly after readiness;
- warn when returning to the original source address, unless this is an
  explicit standby/ragequit recovery;
- explain that splitting or rounding can reduce simple amount correlation but
  costs more and is not a guarantee;
- never silently change an amount, delay a transaction, or choose a recipient;
- separate **Private withdrawal** from **Public emergency recovery**.

The final review binds the approved recipient, amount, token, route, fee cap,
relayer/broadcaster, and chain into the operation. Any quote refresh that changes
one of these invalidates the prior confirmation.

### What to take from the supplied Kohaku screenshots

Keep:

- clear separation between public and private funds;
- persistent pending balances;
- Shield and Private Send as first-class actions;
- showing the private receiving identifier when relevant;
- fee and “recipient gets” summaries.

Change:

- replace the large protocol dropdown with an outcome-led route card;
- avoid presenting one “Private Account” number when funds are actually split
  across incompatible protocols, assets, and readiness states;
- use compact mobile lists rather than desktop tables inside the extension;
- move hygiene guidance to the decision it affects;
- replace long warning prose with short actionable guidance and a Learn more
  sheet;
- do not make “click to reveal private account” a decorative dashboard trick;
  viewing/recovery data is a deliberate security action.

## Proposed architecture

### Module boundaries

```text
ShieldView / privacy UI (extension-only)
        |
privacy message handlers (validate sender, account, chain, intent)
        |
PrivacyCoordinator
  ├── PrivacyVault (root wrappers, derivation, master-only export)
  ├── PrivacyState (pending operations, idempotency, recovery)
  ├── PrivacyIndexer (IndexedDB, rescan, verified checkpoints)
  ├── PrivacyProver bridge (offscreen document + dedicated workers)
  └── adapters
      ├── PrivacyPoolsAdapter
      ├── RailgunAdapter
      └── VeilAdapter
```

`background.ts` remains a router. Business logic belongs in focused modules.
Every privacy UI message must be extension-only. Dapps and content scripts do
not get balance, recipient, proof, note, recovery, or route APIs in phase one.

### Adapter contract

Each adapter should expose capabilities rather than force a common feature set:

```ts
type PrivacyCapabilities = {
  shield: boolean;
  privateSend: boolean;
  withdraw: boolean;
  emergencyExit: boolean;
  privateDefi: boolean;
};

interface PrivacyAdapter {
  getSupport(chainId: number, asset: Asset): Promise<SupportResult>;
  sync(context: PrivacyContext): Promise<SyncResult>;
  quoteShield(input: ShieldInput): Promise<BoundQuote>;
  prepareShield(input: ApprovedShieldInput): Promise<PublicOperation>;
  quotePrivateSend?(input: PrivateSendInput): Promise<BoundQuote>;
  preparePrivateSend?(input: ApprovedPrivateSendInput): Promise<PrivateOperation>;
  quoteWithdraw(input: WithdrawInput): Promise<BoundQuote>;
  prepareWithdraw(input: ApprovedWithdrawInput): Promise<PrivateOperation>;
  prepareEmergencyExit(input: EmergencyExitInput): Promise<PublicOperation>;
}
```

Quotes carry an expiry, deployment/version fingerprint, exact recipient, exact
amount, fee cap, and route identity. Preparing an operation revalidates all of
them. Never accept opaque adapter calldata as trusted merely because it came
from an SDK; decode and compare the resulting call to the approved intent.

### Public transaction submission and all wallet types

Shield deposits and direct emergency exits are public EVM transactions. Route
them through WalletChan's existing pending transaction and confirmation system
so all three wallet types retain their normal signing path:

- Bankr API / impersonator;
- imported private key;
- seed phrase / derived local account.

The adapter prepares intent-bound calls. The existing transaction handler
chooses Bankr versus local signing. No adapter receives a plaintext EVM private
key or mnemonic.

Private operations use the privacy root inside the trusted background/prover
boundary and submit through a protocol relayer/broadcaster. They still require
a WalletChan confirmation screen and persistent pending record even if no EVM
wallet signature occurs at submission time.

### Proving in Manifest V3

ZK proving and event sync cannot depend on the popup staying open. Use a
bundled offscreen extension document with the `WORKERS` reason and dedicated
workers, coordinated by the service worker. The UI observes progress through
runtime messages and can close/reopen without canceling or duplicating an
operation.

Manifest V3 requires executable JavaScript, WebAssembly, and CSS to be bundled
with the extension. WebAssembly requires the `wasm-unsafe-eval` CSP directive.
Do not fetch executable circuits or prover code from a CDN. If large proving
artifacts must be downloaded as non-executable data, pin their cryptographic
hashes and verify before use; confirm Chrome Web Store policy before adopting
that design. Prefer reviewed, versioned artifacts packaged with the release.

Chrome references:

- [MV3 security and bundled Wasm](https://developer.chrome.com/docs/extensions/develop/migrate/improve-security)
- [Extension CSP and `wasm-unsafe-eval`](https://developer.chrome.com/docs/extensions/reference/manifest/content-security-policy)
- [Offscreen documents and worker reason](https://developer.chrome.com/docs/extensions/reference/api/offscreen)
- [IndexedDB and extension-origin storage](https://developer.chrome.com/docs/extensions/develop/concepts/storage-and-cookies)

### RPC and metadata privacy

Adding shielded balances while leaking every viewed private address and token
to one RPC/indexer is incomplete privacy. For each adapter, document:

- RPC endpoints contacted;
- event index/quick-sync endpoints;
- ASP/list/PPOI endpoints;
- relayers/broadcasters queried;
- whether requests include a private address, public address, commitment, or
  only global pool data;
- IP address and timing exposure;
- direct-RPC/self-hosted fallback and integrity verification.

Batch global scans where possible instead of making address-specific queries.
Never call these services before the user enters the privacy feature or opts
into background private-balance refresh.

## Security requirements

### Non-negotiable controls

- Extension-only message types and sender validation for every privacy action.
- Background-enforced master-only guards for recovery setup/reveal/export,
  viewing-key export, root deletion, and protocol identity replacement.
- No secrets or witnesses in UI messages, logs, errors, analytics, or support
  bundles.
- CSPRNG-generated root and protocol randomness.
- Domain-separated, versioned derivation with published recovery vectors.
- Exact deployment allowlist with proxy implementation monitoring.
- Local decode of prepared calldata and relayer payloads.
- Recipient/amount/token/chain/fee-cap binding inside proof context or signed
  request; fail closed if the protocol cannot provide it.
- Quote expiry and re-confirmation on material changes.
- Idempotency keys and nullifier-aware retry handling.
- Root/ASP/Merkle verification before proving and again before submission.
- No automatic fallback from a private relay to a privacy-degrading direct
  broadcast without explicit confirmation.
- Emergency exit continuously tested, not merely documented.
- Dependency pinning, reproducible artifact hashes, and SBOM review.
- Clear audit-to-deployment mapping for contracts, circuits, SDK, and adapter.
- Per-protocol kill switch that disables new deposits without hiding existing
  balances or recovery actions.

### Relayer threat model

A relayer can lie about fees, substitute or encode a recipient, withhold a
transaction, correlate IP/timing, selectively censor, or return stale roots.
WalletChan must:

- query more than one relayer where the protocol permits;
- locally decode and compare every returned payload;
- cap fees in both UI approval and proof context;
- use HTTPS and pin protocol/deployment configuration;
- treat timeout as unknown, then check nullifier/onchain state before retry;
- avoid sending unrelated public account metadata;
- allow a user-selected/self-hosted endpoint in advanced settings where viable;
- explain when a centralized hosted relay is the only normal path.

### ASP/list/operator threat model

An ASP or list provider can omit a deposit, remove it later, delay updates, or
apply opaque policy. An operator can delay queue finalization. This is not loss
of custody if the exit path works, but it is an availability and UX risk.

WalletChan must show eligibility as a state, never as a generic failure. It must
retain the exact depositor and commitment needed for recovery, verify published
roots against onchain state, and keep emergency recovery available when new
deposits are disabled, review remains pending, or the ASP endpoint/root is
unavailable. A confirmed pending deposit may be returned immediately to its
exact original depositor through the public recovery path. Pending or
unavailable status must never be treated as approval for a private withdrawal.

### Key compromise and viewing-key threat model

- Privacy root compromise exposes every derived protocol identity.
- Railgun spending key compromise loses funds; viewing key compromise exposes
  history without spend authority.
- Veil private key compromise loses Veil funds.
- Privacy Pools secret compromise can spend eligible notes; original depositor
  control is separately important for ragequit.
- A malicious renderer must not be able to request raw key export.
- Agent password compromise already permits routine signing under WalletChan's
  model; allowing private spend adds the private balance to that blast radius
  and must be an explicit product decision.

## Testing matrix

Any implementation touches transactions, authentication, and new secrets, so
it is incomplete until all three wallet types pass.

| Scenario | Bankr API | Private key | Seed phrase |
| --- | ---: | ---: | ---: |
| Create privacy recovery root with master session | Required | Required | Required |
| Block setup/export under agent password | Required | Required | Required |
| Restore root after service-worker restart | Required | Required | Required |
| Public Sepolia shield confirmation and signing | Rejected before prompt | Required | Required |
| Production mainnet native ETH shield | Required | Required | Required |
| Resume after popup closes | Required | Required | Required |
| Private Sepolia withdrawal confirmation | Rejected | Required | Required |
| Relayer quote substitution rejected | Required | Required | Required |
| Full rescan from privacy phrase | Required | Required | Required |
| Emergency exit/ragequit on Sepolia | Rejected | Required | Required |
| Production mainnet original-depositor ragequit | Required | Required | Required |
| Password change preserves identity | Required | Required | Required |
| Passkey unlock preserves identity | Required | Required | Required |
| Reset/account removal warns on funds | Required | Required | Required |

Protocol tests must include:

- unsupported chain and asset;
- below-minimum and insufficient-gas amounts;
- approval race and fee-on-transfer/rebasing token rejection where relevant;
- proxy upgrade/config mismatch;
- stale ASP/PPOI/Merkle root;
- screening approved, delayed, rejected, and refunded;
- standby return to original address;
- full and partial withdrawal/change;
- exact-amount and fast-withdraw privacy warnings;
- relayer timeout before and after submission;
- nullifier already spent and idempotent retry;
- real pinned-artifact vectors for every public signal, including distinct
  precommitment and spent-nullifier hashes;
- corrupted IndexedDB cache and full rebuild;
- proving worker crash, browser restart, extension update, and lock during proof;
- compromised/tampered proving artifact;
- clear-signing decode for every prepared public call;
- CSP, offline startup, and Chrome Web Store packaged-build behavior.

## Rollout plan and gates

### Phase 0: read-only prototype

- Build the private portfolio and pending-state UI against fixtures.
- Benchmark packaged MV3 proving and full rescan on low/mid/high-end devices.
- Record bundle size, first sync time, proving time, peak memory, and retry
  behavior.
- No value-bearing mainnet transactions during this historical prototype phase.

### Phase 1: testnet Privacy Pools spike

- Implement the Kohaku-style host boundary.
- Use deterministic privacy root derivation and verify recovery vectors.
- Patch the relayer withdrawal-data validation before any relayed test.
- Exercise shield, partial withdraw, rescan, and ragequit.
- Audit adapter calls and worker boundaries.

### Phase 2: Base Veil beta candidate

- Reuse knowledge from `apps/walletchan-mcp` but do not reuse its separate data
  directory or random key model inside the browser extension.
- Derive/import a WalletChan-controlled Veil key.
- Implement registration, queue, eligibility, ETH/USDC deposit, transfer,
  withdrawal, rejection, and refund states.
- Obtain exact audit/deployment mapping and operator/relay incident behavior.
- Start behind a feature flag with deposit caps.

### Phase 3: Railgun private account

- Decide between the mature community Wallet SDK and Kohaku's newer Rust path
  after packaged benchmarks and audit review.
- Implement one private account per chain from the privacy root.
- Ship shield, balance, private send, withdraw, PPOI readiness, and rescan first.
- Keep private DeFi and shared viewing-key export disabled until separately
  designed and audited.

### Mainnet go/no-go gate

Do not enable a protocol for deposits until all are true:

- exact supported deployments and upgrade policy are pinned;
- contract/circuit/SDK/adapter audit mapping is complete;
- recovery phrase round-trip and full rescan pass;
- emergency exit passes on a production-equivalent environment;
- all three WalletChan wallet types pass the applicable matrix;
- relayer payloads are locally decoded and intent-bound;
- proof artifacts are bundled or integrity-pinned under MV3 policy;
- privacy endpoint inventory and disclosures are complete;
- legal/compliance review covers supported jurisdictions and store distribution;
- incident kill switch and recovery-only mode are tested;
- user-facing copy has been reviewed to avoid overstating privacy.

## Open decisions

1. Is the first product objective **Base-native everyday private payments**
   (favor Veil) or **EF/Kohaku-aligned permissioned withdrawal privacy** (favor
   Privacy Pools v1)?
2. Should an agent-password session be allowed to spend private balances, as it
   can spend public balances today, or should private spend require a master or
   passkey session?
3. Is one WalletChan private account across public accounts desirable, or
   should the UI expose per-public-account private identities where protocols
   permit both?
4. Will WalletChan bundle proving artifacts, accept a larger extension, or use
   integrity-pinned artifact downloads subject to Chrome Web Store review?
5. Which remote dependencies will WalletChan operate itself versus use from
   protocol providers?
6. Is Privacy Pools ragequit from a Bankr impersonator account supportable and
   recoverable enough to enable?
7. What initial deposit caps and supported token allowlists are appropriate?

## Bottom line

The best WalletChan experience is not Kohaku's protocol selector reproduced in
a smaller viewport. It is a calm, native private portfolio with one recovery
contract, honest route-specific review, persistent waiting/recovery states,
and privacy hygiene at the moment it changes a decision.

Kohaku is the right architectural influence, especially for host-owned keys,
storage, providers, and plugins. It is not yet a drop-in production dependency.
Veil is the closest fit for a Base-first product beta, Privacy Pools v1 is the
cleanest Kohaku-aligned engineering spike, and Railgun is the strongest
long-term private wallet once WalletChan is ready to own the larger proving,
indexing, and key-management surface.
