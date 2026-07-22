# Privacy Pools Integration PRD

> **Status:** Dual-profile implementation complete; mainnet value-bearing and
> distribution gates remain
> **Owner:** WalletChan extension
> **Last updated:** 2026-07-20
> **Source research:** [`PRIVACY.md`](./PRIVACY.md)
> **Implementation checklist:** [`PRIVACY_POOLS_TASKS.md`](./PRIVACY_POOLS_TASKS.md)
> **Session handoff:** [`PRIVACY_POOLS_HANDOFF.md`](./PRIVACY_POOLS_HANDOFF.md)

This document is the product and engineering source of truth for integrating
0xbow Privacy Pools into WalletChan's existing **Shield** destination. It turns
the broader privacy exploration into a bounded first product: an Ethereum ETH
private balance with public shielding, ASP-gated relayed withdrawals, partial
withdrawals, deterministic recovery, and public ragequit.

The first deliverable was a packaged Manifest V3 testnet spike. The extension
now compiles Sepolia for `dev:extension` and Ethereum mainnet for normal/
production builds. Compiled mainnet support does not approve store distribution
or a value-bearing rollout; those remain subject to the go/no requirements.

---

## 1. Product summary

WalletChan users can move ETH from a public WalletChan account into a private
balance and later withdraw it to another Ethereum address without creating a
direct onchain link between the deposit and withdrawal addresses.

Privacy Pools is presented as a route behind WalletChan's native balance model,
not as a separate wallet or protocol dashboard:

```text
Public ETH
   |
   | Shield (public transaction)
   v
Privacy Pools commitment
   |
   | ASP inclusion + relayed ZK withdrawal
   v
Recipient ETH (public withdrawal)
```

WalletChan owns the privacy recovery phrase, encrypted storage, authorization,
RPC access, indexing, transaction signing, relayer validation, retry policy,
and recovery UX. The official SDK is used only for pinned protocol-compatible
cryptographic primitives and proof construction.

## 2. Privacy promise

WalletChan may say:

> Shielding hides the direct onchain link between this deposit and a later
> private withdrawal. The deposit and withdrawal are still public, and timing,
> matching amounts, or reused addresses can weaken privacy.

WalletChan must not describe a transaction as anonymous, untraceable, or
guaranteed private.

The public deposit reveals the source account, amount, time, chain, and pool.
The public withdrawal reveals the recipient, amount, time, chain, and pool.
The privacy benefit is breaking the direct protocol-level link between them.

## 3. Goals and non-goals

### Goals

- Turn the existing Shield placeholder into a native private-balance
  destination.
- Support Ethereum ETH shielding, balance recovery, partial/full relayed
  withdrawals, and ragequit.
- Give Bankr, private-key, and seed-phrase users one consistent privacy
  recovery model.
- Keep every privacy secret out of React, content scripts, dapps, logs,
  analytics, support bundles, and synchronized storage.
- Persist operation state so closing the popup or restarting the service worker
  never loses progress or duplicates an operation.
- Reuse the official protocol cryptography without giving the SDK control of
  WalletChan signing keys, storage, RPC configuration, or submission policy.
- Make normal recovery possible from the privacy phrase plus onchain history.
- Keep public emergency recovery available even when new deposits or relayers
  are disabled.

### Non-goals for v1

- Private transfers between private balances.
- Private DeFi or arbitrary private contract calls.
- Railgun, Veil, or automatic multi-protocol routing.
- ERC-20 Privacy Pools, even if the contracts or SDK are technically generic.
- Base, Polygon, Unichain, MegaETH, or an undocumented deployment.
- Dapp-facing privacy RPC methods.
- Automatic shielding, scheduled withdrawals, or agent automation.
- Remote proof generation or sending witnesses/secrets to a proving service.
- Direct normal withdrawals as an automatic relayer fallback.
- Importing arbitrary Privacy Pools notes or another wallet's undocumented
  derivation format.
- Viewing-key sharing or analytics derived from private activity.

## 4. V1 decisions

| Decision | V1 requirement |
| --- | --- |
| Product surface | Native private balance under **Shield** |
| Production network | Ethereum mainnet only |
| Test network | Sepolia, after exact deployment verification |
| Production asset | ETH from the officially documented pool only |
| Privacy identity | One wallet-wide dedicated privacy recovery phrase |
| SDK policy | Reuse pinned crypto/proof primitives; do not use SDK custody or signing helpers |
| Normal exit | Relayed withdrawal only |
| Emergency exit | Public ragequit by the original depositor |
| Private authorization | Live master or biometric-master capability |
| Agent password | Cannot set up, shield, withdraw, rescan from phrase, export, delete, or ragequit in v1 |
| Impersonator | Read-only overview only; never an operation source or submitter |
| Mainnet Bankr deposits | Implemented through the pinned Bankr confirmation/effect boundary; live value-bearing ragequit rehearsal required before rollout approval |
| Proof generation | Local, packaged extension artifacts only |
| Browser rollout | Chrome first; Firefox remains disabled until its prover host passes equivalent QA |
| Deposit bounds | No arbitrary application cap; enforce the contract minimum, valid `uint256` input, source balance after gas, and any separately approved future release limit |

These are shipping defaults, not claims that the protocol cannot support a
larger surface. Changing one requires updating this PRD before implementation.

## 5. Users and primary stories

### New privacy user

As a WalletChan user, I can switch to Private and immediately see a private
balance with Shield and Unshield actions. WalletChan creates and protects the separate
privacy identity in the background without showing protocol setup.

### Returning user

As a returning user, I can see ready, pending, and attention-required private
balances without reopening the account that made the original deposit.

### Private withdrawal user

As a user with an ASP-approved commitment, I can withdraw part or all of it to
an Ethereum address through an intent-bound relayer quote.

### Recovery user

As a user reinstalling WalletChan, I can restore the privacy phrase, rescan
onchain history, recover balances, and see which original public account is
required for ragequit.

### Restricted user

As an agent-password or impersonator user, I get a clear explanation instead
of reaching a code path that releases privacy secrets or submits an operation.

## 6. Information architecture

```text
Shield
├── Confirmed Shield balance + USD value
│   └── Waiting-for-ASP subset when non-zero
├── Shield ETH
├── Unshield to an explicit address
├── Withdraw publicly when eligible
└── Activity

Settings -> Shield recovery
├── Reveal/backup with main password
├── Restore phrase
└── Scan Sepolia
```

Protocol naming is secondary. The first release has one route, but each asset
and operation still records and displays **Privacy Pools** under Route details
so the user understands where funds are held.

## 7. User experience

### 7.1 Private dashboard

Private mode is one balance-first home:

1. private ETH balance;
2. separate **Shield** and **Unshield** actions;
3. recent private activity;
4. network, recovery, or operation status only when user action is required.

Each action opens its own single-purpose screen with no nested mode tabs. There
is no protocol introduction, seed-phrase setup wizard, recovery
verification challenge, or multi-page explanation before the dashboard.
Privacy Pools naming stays inside route/operation details.

### 7.2 Automatic privacy identity

On first eligible entry into Private mode, the renderer sends a non-blocking,
non-secret initialization request. The Shield screen repeats it so a bounded
failure can offer Retry. If no privacy identity exists:

1. require a live master or biometric-master capability in the background;
2. generate one BIP-39 privacy recovery phrase with a CSPRNG;
3. encrypt it immediately behind the dedicated privacy-vault key;
4. return only ready/loading/error status to the renderer;
5. render the normal dashboard as soon as initialization commits.

For a biometric factor created before Shield existed, its next fresh assertion
may first create an empty passkey-only privacy-vault scaffold. This stores no
phrase yet; it only lets the first eligible Private-mode entry generate and encrypt the phrase
without requesting the main password. New biometric setup normally stores both
master and passkey wrappers.

The phrase never enters ordinary Shield React state and is never displayed as
part of first use. Optional backup/export lives under a separate master-only
Shield Recovery action in Settings. Reveal requires an explicit current main
password, upgrades a passkey-only compatibility identity with a main wrapper,
and auto-hides after one minute. Restore accepts only one valid 12-word Shield
phrase, refuses to replace a different existing identity, and immediately
starts a bounded active-profile rescan. The only plaintext release is the explicit
Settings reveal response; ordinary Shield routes remain status-only.

Agent-password and impersonator sessions cannot initialize, export, replace,
or restore the identity. If an identity already exists, they may see the
non-secret aggregate dashboard subject to the existing view-only rules.

### 7.3 Private portfolio

The overview shows:

- total ready private ETH;
- pending ETH grouped by lifecycle state;
- commitments needing ASP attention or public recovery;
- recovery status only when action is required;
- last successful sync and a manual refresh action.

Balances from distinct commitments may be summarized, but operation details
must preserve the exact commitment, depositor, pool, and recovery path.

### 7.4 Shield flow

1. **Choose source**
   - eligible WalletChan account;
   - Ethereum network;
   - ETH asset.
2. **Enter amount**
   - public balance;
   - Max reserves estimated gas;
   - onchain minimum;
   - no silent amount rounding.
3. **Route review**
   - Privacy Pools;
   - estimated protocol and network fees;
   - current deployment fingerprint;
   - expected ASP wait behavior;
   - public information and recovery dependency.
4. **Confirm**
   - require live master or biometric-master capability;
   - create a durable operation before submission;
   - route the public transaction through WalletChan's existing confirmation
     and signer path.
5. **Track**
   - public submission and receipt;
   - event discovery;
   - ASP status;
   - private-ready balance.

The final review shows:

- public account and account type;
- amount shielded;
- private balance expected after fee;
- network and protocol fee estimates;
- pool and Entrypoint under Route details;
- what is public;
- original-depositor ragequit dependency;
- verified recovery status.

The current Sepolia implementation keeps step 2 as a compact inline quote. It
accepts exact ETH decimals at or above `0.001`, reads the pinned
source account's public Sepolia balance, applies the onchain `100` bps vetting
fee, simulates the exact native Entrypoint deposit call for gas, and reserves a
20% gas-limit buffer at the standard fee tier. Max is the balance after that
reserve. The official website's app-only `1 ETH` preference is not a contract
rule and is not adopted by WalletChan. Input remains bounded to an exact
`uint256`. Continue prepares and independently decodes a non-submittable review;
Confirm details then reserves a distinct encrypted index and queues the normal
WalletChan confirmation. Private-key and seed-phrase accounts can submit on
Sepolia. Bankr fails before a prompt because its raw transaction API does not
support Sepolia; impersonator and agent paths fail closed.

### 7.5 Withdrawal flow

Private home exposes one relayed withdrawal screen: **Unshield**. Privacy Pools
v1 has no in-pool transfer, so Private mode does not expose a separate Send
action or duplicate the withdrawal form under Send wording. Unshield starts
with an empty recipient so the user must enter or choose the intended fresh
destination. It contains no Shield mode tab or public source-account selector.

1. On the entry screen, enter an amount that fits within one ready commitment.
   The current Privacy Pools withdrawal proof consumes one commitment at a
   time and does not combine balances from separate deposits.
2. Enter or choose and checksum-normalize the Ethereum recipient in the boxed
   `Receive at` destination. The chooser label is `Address`, not a second
   instruction to choose one.
3. Press `Review unshield`; the fresh review screen fetches a bounded, expiring
   relayer quote. If every otherwise verified quote
   exceeds the Entrypoint's onchain relay-fee cap, retain only the cheapest
   quote's public relay name and fee as a non-submittable diagnostic.
4. On review, show the private debit and receiver amount once in the outcome
   card. Request details starts with the quoted relay fee as percentage plus
   ETH/USD value, followed by network, route, relay identity, quote expiry, and
   privacy hygiene warnings. Warn when the recipient is the original depositor.
5. Require live master or biometric-master authorization.
6. Generate and locally verify the proof.
7. Revalidate the quote, roots, deployment, and approved intent.
8. Submit through the selected relayer and track the onchain nullifier and
    replacement commitment.

The confirmation is invalidated if recipient, amount, fee, relayer, chain,
pool, deployment fingerprint, ASP root, or quote expiry changes.

An over-cap quote is not presented as a relay outage and never creates a
withdrawal operation. The review screen keeps the estimated receive amount in
the outcome card and turns the first Request details row amber, showing the
exact quoted percentage, ETH/USD fee, and active chain's contract limit. The
explicit public-exit alternative appears in the sticky decision bar immediately
above Back and `Check relay again`; it is not another content card. The entry
screen stays free of quote-dependent state. A verified signed quote remains a
fee-cap diagnostic even when its gas-derived fee is 100% or more, with receiver
amount floored at zero for display. A true all-relay outage still retains
network/route context and public exit rather than leaving an empty review.
There is no override:
`Entrypoint.relay` reverts above `assetConfig.maxRelayFeeBPS`. When Unshield can
bind the ready commitment to its original depositor, it reveals the explicit
**Withdraw publicly** recovery route.

The private home may aggregate several ready commitments into one Shielded ETH
balance. Unshield separately exposes the total ready balance and the largest
currently spendable commitment as the maximum for one withdrawal. When the
maximum is lower than the total, the UI explains that the remaining balance can
be withdrawn in subsequent operations. A partial withdrawal creates a verified
replacement commitment for the unspent remainder.

### 7.6 Withdrawal hygiene

Inline warnings appear when:

- the amount exactly matches a recent shield;
- withdrawal begins soon after the balance becomes ready;
- the recipient equals the original source;
- several withdrawals combine to a distinctive recent deposit total.

WalletChan may explain that waiting, splitting, or rounding can reduce simple
correlation. It must never automatically change the amount, recipient, or
submission time.

### 7.7 Ragequit

Ragequit is incorporated into the Unshield amount interface but remains
explicitly presented as **Withdraw publicly**, never as a private withdrawal.
The entry action first opens a read-only review grouped by original depositor.
Each checkbox represents one exact current whole commitment. Ragequit cannot accept an
arbitrary partial amount because the commitment value is a public proof signal.
Opening this review must not generate a proof, persist a recovery intent, claim
the commitment, or create a transaction request. An unchecked commitment
control identifies recovery to the original address as a public transaction;
only the acknowledged final action may prepare and queue the transaction. One
selection uses a normal transaction; two through eight selections from the same
account use one immutable atomic EIP-7702/ERC-7821 or Bankr batch. Selecting a
commitment disables other account groups until the current group is cleared.
It is the always-available
custody exit for an indexed commitment owned by the original depositor,
including while ASP review is pending. The product should not force the user to
wait for ASP approval if they accept the public link.

It is offered when:

- the confirmed commitment is awaiting ASP approval, was declined or removed,
  or normal withdrawal is unavailable because every verified relay quote is
  above the Entrypoint's hard fee cap;
- WalletChan can prove the active account controls the original depositor;
- a commitment proof can be generated and verified.

The review states that ragequit publicly links the recovery to the original
depositor. The public transaction uses WalletChan's existing signer path.

## 8. Operation state machines

### 8.1 Shield operation

```text
draft
-> awaiting_authorization
-> awaiting_wallet_confirmation
-> submitted
-> public_confirmed
-> awaiting_event
-> awaiting_asp
-> asp_approved
-> private_ready

terminal/attention states:
cancelled
wallet_rejected
submission_failed
submission_unknown
public_reverted
asp_declined
asp_removed
asp_unavailable
ragequit_available
failed_recoverable
failed_needs_support
```

### 8.2 Withdrawal operation

```text
draft
-> quoting
-> awaiting_authorization
-> proof_preparing
-> proof_verified
-> submitting_to_relayer
-> submission_unknown | submitted
-> public_confirmed
-> private_balance_updated

terminal/attention states:
cancelled
quote_expired
proof_failed
relayer_rejected
public_reverted
nullifier_already_spent
failed_recoverable
failed_needs_support
```

### 8.3 Ragequit operation

```text
draft
-> awaiting_authorization
-> proof_preparing
-> proof_verified
-> awaiting_wallet_confirmation
-> submitted
-> public_confirmed
-> recovered
```

Every state transition is persisted before its external effect. Retry logic
must inspect onchain state and the nullifier before repeating an ambiguous
submission.

## 9. Wallet and authentication behavior

### 9.1 Bankr accounts

- Sepolia shielding and ragequit are disabled before a confirmation request is
  created because the Bankr raw-transaction API does not support Sepolia.
- Quote and read-only portfolio behavior still exercise exact Bankr account
  pinning without creating a signing or submission path.
- Mainnet shielding remains disabled until the team verifies that the exact
  original depositor remains recoverable and can sign a future ragequit.
- A surviving privacy phrase does not replace control of the Bankr depositor
  for public emergency recovery.

### 9.2 Private-key accounts

- Public shield and ragequit use local private-key transaction confirmation.
- The Privacy Pools adapter never receives the private key.

### 9.3 Seed-phrase accounts

- Public shield and ragequit use the derived local signer.
- The ordinary seed phrase is not the Privacy Pools recovery phrase.
- The Privacy Pools adapter never receives the ordinary mnemonic.

### 9.4 Impersonator accounts

- May view the wallet-wide privacy overview after normal wallet unlock.
- Cannot be selected as a deposit source.
- Cannot confirm private withdrawal, relayer submission, or ragequit.
- If active, operation CTAs require switching to a custody-capable account.
- Reject-only pending transaction/signature behavior remains unchanged.

### 9.5 Agent-password sessions

V1 blocks all privacy mutations. Agent sessions and an automatically expired
auth session may view only the bounded aggregate balance/chart snapshot already
released during the current browser session. They cannot:

- create, verify, reveal, replace, export, or delete the privacy phrase;
- shield funds;
- generate or submit a private withdrawal;
- generate or submit ragequit;
- restore from a phrase or perform a full rescan that releases derived secret
  state.

This deliberately keeps private commitments, proofs, recovery material, and
spending authority outside the agent-password and expired-session blast radius.
The aggregate display snapshot is not an authorization capability.

## 10. SDK integration policy

### Approved SDK surface

WalletChan may reuse pinned implementations of:

- `generateMasterKeys`;
- `generateDepositSecrets`;
- `generateWithdrawalSecrets`;
- Poseidon commitment/precommitment functions;
- LeanIMT Merkle utilities;
- withdrawal context calculation;
- commitment and withdrawal proof generation;
- local proof verification;
- protocol types and audited ABIs where verified against deployments.

### Prohibited SDK surface

WalletChan must not use:

- `createContractInstance` or any helper requiring an EVM private key;
- SDK-owned wallet clients or transaction submission;
- SDK RPC clients in place of WalletChan's bounded network layer;
- default console logging in a secret-bearing context;
- opaque SDK calldata without WalletChan decoding and intent comparison;
- remote artifact URLs that are not release-pinned and locally verified.

### Dependency policy

- Pin the exact SDK version and package integrity; no caret or range.
- Record the upstream commit, npm integrity, dependency tree, circuit hashes,
  and local patch list in the repository.
- Treat an SDK upgrade as a custody/crypto migration review, not a routine
  dependency bump.
- Run fixed recovery vectors and proof fixtures before accepting an upgrade.
- Independently patch or avoid known upstream correctness issues involving
  state-root selection, nullifier hashes, or fee-commitment validation.
- Obtain legal review of the SDK's transitive `snarkjs` GPL-3.0 dependency
  before store distribution.

Current packaged-spike pin (2026-07-19):

- npm package `@0xbow/privacy-pools-core-sdk@1.2.0` with exact npm SHA-512
  integrity and tarball SHA-256 recorded in
  `apps/extension/privacy-pools.protocol.json`;
- npm `gitHead` / reviewed upstream commit
  `434fbb8dc6783b98e100630f3debad1920d385e8`;
- no WalletChan patches;
- exact `poseidon-lite@0.3.0` service-worker adapter for the SDK's only used
  hash input widths `[1, 2, 3]`, pinned in the same manifest and checked against
  official SDK vectors;
- six commitment/withdrawal artifacts from that same commit, totaling about
  23 MB, pinned by exact byte length and SHA-256;
- the upstream GitHub `v1.2.1` tag is not treated as the npm package because
  npm still publishes `1.2.0` as `latest`; any move requires a fresh provenance
  and vector review;
- `snarkjs@0.7.5` is an exact direct pin for the packaged fixed-proof worker and
  reports GPL-3.0. Fixed and real commitment/withdrawal proving run locally in
  the packaged one-shot worker. `privacy-prover.distribution.json` permits only
  unpacked Sepolia testing and blocks release/store zip commands until legal
  review changes the checked-in policy.

The official SDK proof service does not expose `snarkjs` prover options and its
pinned `ffjavascript` dependency defaults to a Blob-created nested worker,
which MV3 extension CSP rejects. WalletChan therefore keeps the SDK for its
reviewed primitives and calls the exact pinned `snarkjs` proof surface from one
packaged worker with `singleThread: true`. Verification reuses a separately
constructed single-thread BN128 curve through the pinned library's global
cache behavior. No package source is patched, no remote worker is created, and
upgrades must re-review this adapter. The background likewise avoids the SDK's
eager all-width Poseidon initialization: its pure SDK source remains the
derivation owner, while an exact three-width lightweight hash adapter produces
the same fixed outputs without allocating unused parameter sets at startup.

## 11. Architecture

```text
Shield UI (untrusted for secrets)
        |
        | extension-only typed messages
        v
PrivacyRouter
        |
        v
PrivacyCoordinator
  ├── PrivacyVault
  │     ├── root generation
  │     ├── master/passkey wrappers
  │     └── operation-scoped derivation
  ├── PrivacyOperationRepository
  │     ├── durable state transitions
  │     ├── idempotency keys
  │     └── ambiguity recovery
  ├── PrivacyIndexer
  │     ├── bounded global event sync
  │     ├── local commitment matching
  │     ├── encrypted checkpoints
  │     └── full rescan
  ├── PrivacyProverBridge
  │     ├── offscreen document
  │     ├── packaged worker
  │     └── pinned circuits
  ├── PrivacyPoolsAdapter
  │     ├── deployment policy
  │     ├── intent/calldata validation
  │     └── proof input preparation
  ├── AspClient
  │     ├── bounded transport
  │     └── onchain root verification
  └── RelayerClient
        ├── quote verification
        ├── payload decoding
        └── submission/status
```

`background.ts` remains a bootstrap/router. No privacy business logic or
secret transformation belongs in the root service-worker file.

### Suggested extension modules

```text
apps/extension/src/
├── components/Shield/
│   ├── ShieldScreen.tsx
│   ├── ShieldDashboard.tsx
│   ├── Portfolio/
│   ├── Deposit/
│   ├── Withdraw/
│   ├── Recovery/
│   ├── hooks/
│   └── model/
└── chrome/privacy/
    ├── identity.ts
    ├── record.ts
    ├── repository.ts
    ├── crypto.ts
    ├── vault.ts
    ├── operations/
    ├── indexer/
    ├── prover/
    ├── privacyPools/
    ├── asp/
    └── relayer/
```

The UI follows `_docs/EXTENSION_UI_ARCHITECTURE.md`: screen components consume
hooks/facades and pure presentation models rather than calling Chrome APIs or
performing protocol calculations inline.

## 12. Message boundary

All v1 privacy messages are classified `wallet-ui` in
`background/messageAccessPolicy.ts` and accepted only from trusted top-level
extension documents. No message is forwarded through `inject.ts` or exposed by
the inpage provider.

Implemented message families:

| Message | Purpose | Secret response allowed? |
| --- | --- | ---: |
| `privacyEnsureInitialized` | Atomically create the encrypted identity when absent | No |
| `privacyRunShieldReadinessCheck` | Trusted diagnostic for the pinned deployment and packaged proofs | No |
| `privacyRunProverSelfTest` | Trusted packaged-prover QA timings only | No |
| `privacyQuoteShield` | Validated deposit summary | No |
| `privacyPrepareShieldReview` | Create a disposable non-persisted public review | No |
| `privacyPrepareShield` | Create durable public deposit request | No |
| `privacyListShieldOperations` | Current bounded Shield activity list | No |
| `privacySyncShield` | Bounded event, commitment, receipt, and ASP refresh | No |
| `privacyPrepareUnshieldQuote` | Bound relayer quote and public review | No |
| `privacyExecuteUnshield` | Authorize proof generation and relayer submission | No |
| `privacyPreviewRagequit` | Read-only list of all current ragequittable commitments with bounded opaque ID/timestamp/amount and original account/source binding | No |
| `privacyPrepareRagequit` | Prepare and queue public original-depositor recovery | No |
| `privacyPrepareRagequitBatch` | Prepare 2–8 distinct whole commitments from one original account and queue one immutable atomic public recovery | No |
| `privacyGetRecoveryStatus` | Non-secret backup/recovery status | No |
| `privacyRevealRecovery` | Master-only reveal | Dedicated reveal page only |
| `privacyRestoreRecovery` | Master-only phrase replacement and immediate rescan | No plaintext response |
| `privacyRescanRecovery` | Master-only rebuild from the active phrase | No |

Every mutation includes a bounded request ID and, where applicable, pinned
account ID, address, account type, chain, asset, deployment fingerprint, and
expected operation revision.

## 13. Privacy root and derivation

Generate one independent BIP-39 privacy recovery phrase. It must not reuse an
ordinary WalletChan mnemonic or derive from a password, Bankr credential,
passkey, installation ID, account name, or active account key.

The v1 derivation specification is pinned to the selected official SDK's safe
bigint derivation:

```text
Privacy recovery phrase
-> official SDK master nullifier key
-> official SDK master secret key
-> deposit secrets(scope, depositIndex)
-> withdrawal/change secrets(label, withdrawalIndex)
```

Persist versioned metadata sufficient for an independent recovery tool:

```ts
type PrivacyDerivationMetadataV1 = {
  schema: "walletchan-privacy-root-v1";
  protocol: "privacy-pools-v1";
  phraseStandard: "bip39-english-128";
  phraseWords: 12;
  derivationVariant: "safe-bigint-v1";
};
```

The stored record keeps the stable derivation variant rather than a mutable
package release. The exact SDK package, version, npm integrity, reviewed
upstream commit, patch list, and circuit hashes are pinned separately in
`apps/extension/privacy-pools.protocol.json`; the `safe-bigint-v1` recovery
specification maps to that reviewed manifest and its fixed vectors.

Changing the phrase or derivation metadata creates a different private
identity. Password rotation and passkey changes must only rewrap existing key
material.

## 14. Storage

The exact migration and stored schemas must be added to `_docs/STORAGE.md`
before implementation lands.

### `chrome.storage.local`

Allowed:

- non-secret feature configuration;
- derivation version metadata;
- optional recovery-backup acknowledgement;
- deployment/config fingerprints;
- sanitized durable operation summaries;
- prover/indexer health and schema versions.

Not allowed in plaintext:

- recovery phrase or seed;
- master nullifier/secret keys;
- deposit or withdrawal secrets;
- witnesses or proof private inputs;
- private recipient history;
- decrypted notes or private activity detail.

### Encrypted vault record

The privacy root uses a dedicated random encryption key. The record requires at
least one master or biometric-master wrapper; normal setup stores both. A
pre-Shield biometric compatibility scaffold may temporarily be passkey-only.
The key is not encrypted directly with a mutable password and is not placed in
`chrome.storage.sync`.

### IndexedDB

The Sepolia implementation creates extension-origin database
`walletchan-privacy-v1` version 1 with:

- an `operations` store for at most 100 exact pending Shield records;
- a `metadata` store whose `nextDepositIndex` counter commits atomically with
  the matching operation;
- a sanitized plaintext summary containing only public account, amount, fee,
  route, timestamp, and state;
- AES-GCM-encrypted deposit index, precommitment, and calldata under the
  dedicated privacy key, with a fresh IV and AAD binding the entire summary;
- a unique request-ID idempotency index plus a non-unique account/amount
  correlation index that never blocks a fresh request UUID;
- a newest-20 public Activity projection.

It also owns separate bounded IndexedDB databases for encrypted current
commitments, encrypted Unshield intents, encrypted public-recovery intents, and
rebuildable public Deposited/Withdrawn/Ragequit events plus a canonical
checkpoint. Each encrypted record binds its complete public header, key ID, and
revision through AES-GCM AAD. Only aggregate balances and bounded public
activity leave the background.

All IndexedDB state is disposable from a custody perspective. A full rescan
from the privacy phrase and verified deployments must restore spendable state.

## 15. Deployment policy

Production support is an exact allowlist, not a chain/token capability claim.
For each release, pin:

- chain ID;
- Entrypoint proxy;
- expected implementation address and bytecode hash;
- ETH pool address, scope, and deployment block;
- withdrawal and ragequit verifier addresses;
- circuit and proving-key hashes;
- approved ASP endpoints and postman/root contract behavior;
- approved relayers and quote public keys or validation rules;
- protocol fee bounds and input/affordability policy. WalletChan must not copy
  an arbitrary website amount preference unless a future PRD explicitly
  justifies a separate release limit.

An unexpected proxy implementation or verifier/config mismatch disables new
deposits and new normal withdrawals. Existing balances remain visible and
recovery-only actions remain available after a specific safety assessment.

### Current deployment and quote pins

#### Sepolia development profile

The public deployments page currently documents Ethereum mainnet only. For
Sepolia, WalletChan pins the official Privacy Pools app configuration at commit
`461867adb439f25f1cc809ee0187357916b90ef6`, then independently checks its
values onchain. The 2026-07-19 observation was made at Sepolia block
`11305183` (`0x6d736a66b56e3aa4deb0ea0304e72d97cb2354562c31858c4fb1ca20ad48b735`).

| Item | Pinned value | Runtime bytecode Keccak-256 |
| --- | --- | --- |
| Entrypoint proxy | `0x34A2068192b1297f2a7f85D7D8CdE66F8F0921cB` | `0xf15a07c54ab3420101c38795fc919a27ffb05f1a0049070ba3b8f10bae32af97` |
| Entrypoint implementation | `0x457f219308fd4f06ffb39dc7b532a51b1580f58b` | `0x912bb4cd8b30434861eb5b3dfed3a38fe4cfc6004f2321994073ec0288d29efe` |
| ETH pool | `0x644d5A2554d36e27509254F32ccfeBe8cd58861f` | `0xd01724d2a831dc90c77eb5f9efacdf4d1642e8fb2722bf580ca0872c8c12e6d7` |
| Withdrawal verifier | `0x822f33Ed5Ac1d33ceed4EEC60A99b06e5053A00a` | `0x54515096fff858166d381897047ecf92c8b6a595c01416cafa7b9b608670ab67` |
| Ragequit/commitment verifier | `0xb4b9cE9aEbD6A2C82A7ba5B64E33Cc7Fb6eC1b60` | `0x1045f87f241bb626b24e0156a478cc0a1d018ad7850c728fd93f10c4b03b27cd` |

The native-asset sentinel is
`0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE`, pool deployment block is
`8587019`, and scope is
`13541713702858359530363969798588891965037210808099002426745892519913535247342`.
The checked Entrypoint asset configuration is a `0.001 ETH` minimum deposit,
`100` bps vetting fee, and `100` bps maximum relay fee. These values remain
fail-closed pins. The official app config at the same pinned commit
publishes a `1 ETH` Sepolia app preference, but the Entrypoint does not enforce
it and WalletChan deliberately excludes it from its policy. The current release
mode is `sepolia-local-beta`: exact-manifest Sepolia Shield, relayed Unshield,
and original-depositor public recovery are enabled, while Bankr Sepolia
submission is blocked.

#### Ethereum mainnet production profile

WalletChan pins the official deployments page and the same official app commit,
then independently verifies the proxy's live EIP-1967 implementation and every
runtime identity. The 2026-07-20 observation was made at mainnet block
`25573384` (`0x0533bd1be8dfa610a1497bd174b640164b3aad03f9e86ad8a245505bc900de1c`).
The public deployments page's listed implementation was stale at verification
time; the table below records the active proxy implementation.

| Item | Pinned value | Runtime bytecode Keccak-256 |
| --- | --- | --- |
| Entrypoint proxy | `0x6818809EefCe719E480a7526D76bD3e561526b46` | `0xf15a07c54ab3420101c38795fc919a27ffb05f1a0049070ba3b8f10bae32af97` |
| Active Entrypoint implementation | `0x15e355024de1CDc74ADdea7EBDf98418Ba5B1a2c` | `0xfb5c2ac0d0556e489bce13315892302150e6f682e6cab57e317ab1a4945af5e6` |
| ETH pool | `0xF241d57C6DebAe225c0F2e6eA1529373C9A9C9fB` | `0xd7f3f10491a60c3295019ec7f7bfc4e70290d2bbc5278245b12dda8e93b066de` |
| Withdrawal verifier | `0x022891F938Ae7fDC8Ab9Ead0FBf50aBA8C897D6d` | `0x54515096fff858166d381897047ecf92c8b6a595c01416cafa7b9b608670ab67` |
| Ragequit/commitment verifier | `0xa45ACa8604a73D80C551fAad6355A5c3A5565eC6` | `0x1045f87f241bb626b24e0156a478cc0a1d018ad7850c728fd93f10c4b03b27cd` |

The native-asset sentinel is unchanged, pool deployment block is `22153707`,
and scope is
`4916574638117198869413701114161172350986437430914933850166949084132905299523`.
The exact asset configuration is a `0.01 ETH` minimum deposit, `50` bps vetting
fee, and `1,000` bps maximum relay fee. The production ASP is
`https://api.0xbow.io`. Fast Relay uses a fee-recipient signer policy; Cloaked
Relay uses the pinned quote signer
`0x3A27cfd1BB78Ff6Fd356Eaa59c2f6232FfC6554a`.

Normal dev and production commands select `mainnet-production`; dedicated
Sepolia commands select `sepolia-local-beta`. There is no runtime/remote override, and bundle probes
require each emitted profile to exclude the other profile's contract and ASP
pins. Encrypted/rebuildable IndexedDB state is profile-isolated. Production
Bankr/private-key/seed-phrase mutations are enabled, impersonators remain
reject-only, and agent-password mutations remain blocked.

The trusted diagnostic readiness route sends the selected profile's fixed
chain/contract/scope/asset reads to a user-configured active-chain RPC, or
WalletChan's immutable known-chain default.
Every JSON-RPC batch is capped at three requests so reviewed free-tier providers
remain compatible. It sends no WalletChan address, phrase, commitment, label,
amount, recipient, or transaction. This diagnostic is not invoked by the
normal Shield UI; final durable preparation independently repeats the pinned
deployment checks before persisting or queuing an operation.

Pressing Shield opens amount entry immediately. The entered value is the exact
amount the user wants to become Shielded ETH; the fee is grossed up and added
on top. `privacyQuoteShield` sends the selected public account address,
grossed-up public deposit amount, fixed Entrypoint address, and a fresh
throwaway public precommitment only to that same bounded active-chain RPC for
`eth_getBalance`, fee reads, and `eth_estimateGas`. The throwaway value is never
returned, persisted, or reused as a deposit note. The quote response contains
only serialized public gross, fee, shielded, gas, maximum, and affordability
state. The RPC can observe
the address, candidate amount, IP, and timing; the quote path has no vault,
signer, operation-storage, or submission dependency.

Pressing `Continue` starts a separate master-authorized background-only review
step, carrying the accepted public gross quote as an exact fee-rounding pin.
Under the wallet-secret lock it re-pins the stored source account,
decrypts the Privacy Pools phrase, derives a disposable deposit
precommitment, ABI-encodes the exact native Entrypoint call, and then manually
decodes and checks the selector, single argument, destination, value, chain,
and fee math. Its internal type is explicitly `submittable: false`; the
renderer receives only the public account/gross/fee/shielded/destination tuple and a ready
status. This step writes nothing and cannot sign or submit.

Pressing `Confirm details` sends `privacyPrepareShield` with a stable request
UUID and the same public gross quote pin. The background repeats deployment,
quote, master-epoch, and exact account
validation; requires the authenticated dedicated privacy capability from a
password or fresh matching biometric master session; derives a distinct
durable deposit index; and independently decodes the real intent again. A
passkey-only compatibility identity does not need a main-password wrapper for
Shield operations; only plaintext recovery reveal requires explicit main
password verification. It atomically advances the index and stores the pending
operation in `walletchan-privacy-v1`, encrypting calldata, precommitment, and
index with the dedicated privacy key. Only a sanitized public pending summary
returns to the renderer and appears in Activity after UI/service-worker
restart. Renderer data remains `submittable: false`; only the background can
convert the exact encrypted intent into a trusted account-pinned confirmation,
and it revalidates the intent at the local raw-RPC boundary.

## 16. Public transaction preparation

The adapter prepares an intent, never a private key or signed transaction.

For deposits, WalletChan independently verifies:

- exact Entrypoint and pool configuration;
- chain ID and native ETH asset;
- amount and fee math;
- deposit precommitment;
- calldata function selector and arguments;
- transaction value;
- pinned account and depositor;
- gas estimate and source balance after gas.

For ragequit, WalletChan verifies:

- original depositor control;
- pool and commitment identity;
- locally verified commitment proof;
- calldata and public recovery destination;
- current unspent status immediately before signing.

Prepared public operations enter the existing pending transaction system.
Signer selection remains owned by WalletChan's transaction coordinator.

Both build profiles keep review and execution separate. Review uses a
disposable reserved derivation and cannot be submitted. Confirming the review
repeats every deployment, account, quote, and authorization check; reserves a
distinct durable derivation; encrypts the exact operation; and creates a normal
account-pinned WalletChan confirmation. Only private-key and seed-phrase
accounts can reach raw-RPC publication on Sepolia. Production also permits
Bankr through its separate confirmation/submission path after the exact privacy
authorization and effect claim run at the final irreversible boundary. Receipt and pool-event
reconciliation recover the exact commitment after restart or cache loss.

## 17. ASP sync and verification

ASP eligibility is a first-class state, not a generic error.

The ASP client must:

- use bounded HTTPS transport and response schemas;
- fetch only the minimum global pool/list data required;
- avoid sending WalletChan account inventories;
- verify the returned ASP root against `Entrypoint.latestRoot()` exactly;
- accept a returned state root only when it is the pool's current root or one
  of the other 63 roots retained in its 64-slot circular history;
- reconstruct or verify the membership proof locally;
- permit public operation/deposit binding plus both onchain-root-pinned tree
  memberships to advance to `asp_approved` while the privacy key is cold;
- require authenticated secret-derived note lineage before advancing from
  `asp_approved` to spendable `private_ready`;
- distinguish pending, approved, Proof-of-Association-required, declined,
  removed, and locally unavailable states;
- revalidate the exact latest ASP root and still-known state root before proof
  generation and submission;
- preserve a previously verified private-ready commitment through transient
  ASP transport failure;
- preserve public withdrawal while approval/Proof of Association is pending or
  the ASP is unavailable.

The UI discloses the ASP endpoint and IP/timing exposure under Route details.

## 18. Relayer policy

Relayer responses are untrusted inputs.

WalletChan must:

- query at least two relayers when compatible production relayers exist;
- bound deadlines, redirects, bytes, JSON depth, and field lengths;
- validate quote signatures/commitments where provided;
- enforce quote expiry and the active Entrypoint's onchain fee cap;
- decode withdrawal `FeeData` locally;
- compare recipient, fee recipient, fee BPS, processooor, scope, amount, asset,
  chain, and replacement commitment with the approved intent;
- include the exact withdrawal in the proof context;
- locally verify the finished proof;
- check roots and nullifier state immediately before submission;
- treat timeout as `submission_unknown`;
- query onchain nullifier/receipt state before retry;
- never fall back to a direct withdrawal without a new explicit confirmation.

The relay-fee cap is a hard protocol constraint, not a WalletChan preference.
WalletChan must never offer a user override for an over-cap quote because the
Entrypoint will revert it. A quote that passes every binding, signature,
expiry, and economics check except this cap may be reduced to a bounded UI
diagnostic containing only the pinned relay name, quoted BPS, and onchain
maximum. It must not be persisted as a withdrawal or submitted to the relay.

Relayer requests contain only the proof and public operation data required by
the protocol. They do not include WalletChan account lists, recovery metadata,
password/session data, or unrelated transaction history.

## 19. Manifest V3 proving

Proof generation cannot depend on the popup or sidepanel remaining open.

### Chrome

- Add a bundled static offscreen document.
- Declare the `offscreen` permission.
- Use the `WORKERS` reason and any other strictly required reason.
- Communicate only through a typed `chrome.runtime` bridge.
- Package the prover worker and all executable JavaScript/Wasm.
- Add the minimum extension CSP required for WebAssembly:
  `script-src 'self' 'wasm-unsafe-eval'; object-src 'self';`.
- Resolve or patch `snarkjs` Blob-worker behavior; no remote or dynamically
  generated executable worker is accepted without packaged-build validation.

### Artifacts

- Bundle the official commitment/withdrawal Wasm, zkeys, and vkeys for v1.
- Verify SHA-256 before every first use after install/update.
- Persist only verified artifact metadata, not alternate mutable URLs.
- Do not download executable circuits or prover code from a CDN.
- A hash mismatch disables proving and surfaces a recovery-safe error.

### Firefox

The coordinator exposes a browser-neutral prover interface. Firefox remains
feature-disabled until a Firefox-compatible persistent worker host passes the
same proof, restart, CSP, memory, and packaged-store tests.

## 20. Security requirements

- Extension-only sender validation for every message.
- Master/biometric-master enforcement in the background, never UI-only.
- No secrets, witnesses, or decrypted notes in ordinary Shield responses. The
  sole exception is the exact master-password-gated Settings recovery reveal.
- No secret-bearing console logs or SDK default debug logging.
- CSPRNG phrase and operation randomness.
- A passkey-only compatibility vault may Shield only while its exact fresh,
  purpose-separated biometric capability and current master authorization are
  live. Phrase reveal/restore and creation of a missing main wrapper remain
  explicit main-password operations.
- Fixed derivation vectors checked in CI.
- Exact deployment and artifact allowlists.
- Decode and compare all contract and relayer payloads.
- Proof context binds the approved recipient, fee path, and scope.
- Quote expiry and material-change reconfirmation.
- Nullifier-aware, idempotent retry.
- Verify state and ASP roots before proving and before submission.
- Remove-before-result or equivalent first-action claims prevent duplicate
  confirmation/submission.
- Reset epoch and lock state cancel unreleased secret capabilities.
- Locking during proof prevents final submission until reauthorized.
- A malicious renderer cannot request raw root/master/operation secrets.
- A compromised relayer cannot substitute recipient or increase fees.
- A compromised RPC cannot silently replace a root without onchain/config
  consistency checks.
- A checked-in release-policy state disables new deposits without hiding
  balances or emergency recovery. The current policy has no environment or
  remote override.

## 21. Reset, removal, and credential lifecycle

### Account removal

Before removing an account, check whether it is the original depositor for any
unspent or pending commitment. If so, block removal until the user:

- completes or cancels the pending deposit where safe;
- ragequits/reassigns funds where supported; or
- explicitly acknowledges an independently verified recovery path that retains
  control of the depositor.

WalletChan currently takes the conservative first option: it blocks removal
for ambiguous/pending Shield work, an in-flight public recovery, or any unspent
commitment. The check runs once before dapp revocation and again inside the
final wallet-secret account-removal lock.

### Reset

Reset preflight reveals only whether Shield data exists and whether its phrase
was previously revealed/restored; it does not leak a private balance on the
locked screen. When Shield data exists, Reset requires an explicit checkbox
acknowledging that the separate phrase was saved or that Shield funds may be
lost. The background repeats this gate after master-session restoration and
before any destructive effect.

### Password rotation

Rewrap the privacy vault key atomically. Never derive a new root or identity.

### Passkey removal

Remove only the passkey wrapper. Preserve the privacy vault and master-password
recovery path. If a compatibility record is passkey-only, require its matching
live biometric capability plus the explicitly verified main password and add
the master wrapper before removing the passkey wrapper.

### Manual lock

Invalidate operation-scoped secret leases and prover authorizations. An
already-submitted public/relayer operation continues to be monitored without
releasing new secrets.

## 22. Network privacy

No Privacy Pools RPC, ASP, relayer, or artifact request occurs before the user
enters Shield, explicitly enables private-balance background refresh, or has a
pending operation requiring monitoring.

Prefer global pool event queries over address-specific lookups. Document for
each endpoint:

- fields sent;
- whether a public account, commitment, label, or recipient is included;
- IP and request-timing exposure;
- retention policy where known;
- direct/self-hosted alternative;
- integrity verification.

There is no privacy telemetry in v1. Product analytics may record only coarse
feature availability and local error categories after a separate review; it
must never include addresses, amounts, labels, commitments, nullifiers,
recipients, tx hashes, or timing precise enough to correlate operations.

## 23. Functional acceptance criteria

### Automatic recovery initialization

- First eligible Private-mode entry under a master/biometric-master session atomically
  creates the encrypted privacy identity when absent.
- An existing biometric factor that predates Shield can initialize without the
  main password after its next fresh assertion.
- Returning Shield access reuses the same identity without regeneration.
- Agent and impersonator initialization is rejected by background policy.
- The phrase never appears in ordinary popup state or runtime responses.
- Optional master-only export and restore reproduce the same identity.
- Restart, lock, password rotation, and passkey removal preserve identity.
- Fixed recovery vectors reproduce the same master and deposit secrets.

### Shield

- Only allowlisted Ethereum ETH is offered.
- Unsupported accounts, chain, asset, amount, deployment, or recovery state
  fail before a pending transaction is created.
- Deposit calldata is decoded and matched to the approved intent.
- Private-key and seed testnet paths reach their correct local signer; Bankr
  fails before a prompt because Sepolia raw submission is unsupported.
- Impersonator never reaches a signer or submission path.
- Popup closure does not cancel or duplicate the deposit.
- Receipt/event/ASP state resumes after service-worker restart.
- A locked browser with no WalletChan renderer open can verify public ASP
  approval and deliver one metadata-free native notification. An already-open
  trusted renderer may keep showing its session-scoped aggregate balance/chart
  snapshot after automatic auth expiry, but no locked surface can decrypt
  commitments, generate proofs, sign, or spend private balance.

### Withdrawal

- Full and partial withdrawal proofs verify locally.
- Replacement commitments restore after a full rescan.
- Recipient/fee/relayer substitution is rejected.
- Expired or materially changed quotes require reconfirmation.
- Stale state or ASP roots fail closed and safely refresh.
- Relayer timeout checks nullifier and receipt state before retry.
- Exact-amount, fast-withdrawal, and source-address warnings trigger.
- Agent and impersonator sessions cannot generate or submit proofs.

### Ragequit

- Only the exact original depositor can confirm the public transaction.
- The review explains the public link.
- Commitment proof and calldata verify locally.
- Private-key and seed recovery work after reinstall/rescan.
- Bankr testnet recovery is explicitly exercised before mainnet support.

## 24. Test matrix

| Scenario | Bankr | Private key | Seed phrase | Impersonator |
| --- | ---: | ---: | ---: | ---: |
| Create root with master session | Required | Required | Required | Rejected |
| Create root with existing biometric factor | Required | Required | Required | Rejected |
| Block root setup/export under agent | Required | Required | Required | Rejected |
| Restore after service-worker restart | Required | Required | Required | Read-only |
| Public shield confirmation | Rejected on Sepolia; required on mainnet | Required | Required | Rejected |
| Resume after popup closes | Required | Required | Required | N/A |
| Private withdrawal authorization | Wallet-wide identity; required path coverage | Required | Required | Rejected |
| Relayer substitution rejection | Required | Required | Required | N/A |
| Full rescan from phrase | Required | Required | Required | Rejected |
| Ragequit | Rejected on Sepolia; original depositor on mainnet | Required | Required | Rejected |
| Password rotation preserves identity | Required | Required | Required | N/A |
| Passkey lifecycle preserves identity | Required | Required | Required | N/A |
| Reset/account removal warnings | Required | Required | Required | Required |

Additional protocol tests:

- below-minimum, zero, `uint256` overflow, and insufficient-gas deposits;
- duplicate deposit intent and stale confirmation;
- unexpected Entrypoint implementation or verifier;
- ASP pending, approved, declined, removed, stale, and unavailable;
- full and partial withdrawal with multiple child commitments;
- corrupt public cache and corrupt encrypted private state;
- nullifier already spent;
- relayer timeout before and after onchain broadcast;
- proof worker crash, browser restart, update, lock, and low-memory failure;
- tampered Wasm, zkey, vkey, or SDK bundle;
- offline startup and recovery-only mode;
- Chrome unpacked build and an explicit Chrome Web Store distribution gate;
- Firefox feature detection and disabled-state behavior.

## 25. Performance and packaging gates

Measure on representative low-, mid-, and high-end machines:

- extension package growth;
- artifact integrity-check time;
- first and incremental event sync;
- account recovery/full rescan;
- commitment/ragequit proof time;
- withdrawal proof time;
- peak memory and worker concurrency;
- offscreen startup and teardown;
- restart/retry latency.

Before mainnet, define numeric budgets from the testnet spike. At minimum:

- proving must not freeze the popup or sidepanel;
- closing the UI must not abort or duplicate proving;
- low-memory failure must preserve recoverability;
- artifact size must remain within Chrome and Firefox store limits;
- the extension must start normally when artifacts cannot initialize;
- non-privacy users must not pay proving startup or network costs.

Frozen Sepolia budgets live in `apps/extension/privacy-prover.budgets.json`:
55 MiB unpacked build, 24 MiB raw artifacts, 512 KiB prover worker, 4 MiB
background bundle, 60 seconds per first/restart fixed-proof run, 512 MiB peak
Chromium process-tree RSS delta, and one concurrent proof. The latest
2026-07-20 packaged run measured 9.027/9.981 seconds and a
352,976,896-byte peak RSS delta. The corresponding build measured 46,233,929
bytes, including 23,690,342 artifact bytes, a 336,397-byte prover worker, and a
3,522,011-byte background bundle.

## 26. Rollout

Current status is summarized below. A completed implementation phase does not
replace its matching manual gate in `PRIVACY_POOLS_SEPOLIA_TEST.md`.

### Phase 0: fixture UI

**Implementation:** Complete. **Manual status:** Accepted during UI iteration.

- Build one balance-first Shield dashboard plus compact operation review and
  pending states against fixtures. Do not add recovery onboarding pages.
- Add pure presentation/state models and accessibility coverage.
- No root generation, proving, RPC, or transaction submission.

### Phase 1: privacy recovery lifecycle

**Implementation:** Complete. **Manual status:** First-use password/passkey
behavior observed; full reveal/restore/rescan rehearsal remains pending.

- Generate and encrypt the independent privacy phrase only on first eligible Private-mode
  access, with status-only UI messaging.
- Integrate the privacy key with master-password and passkey lifecycle changes.
- Keep export and explicit restore as separate master-only actions.
- Verify idempotency, malformed-storage failure, reset, and every wallet type.

### Phase 2: packaged prover spike

**Implementation:** Complete except the GPL distribution decision. Packaged
Chromium proof/restart/budget QA passes; store packaging remains blocked.

- Pin the official SDK and artifacts.
- Implement the offscreen/prover bridge.
- Prove and verify fixed commitment and withdrawal fixtures.
- Benchmark packaged Chrome builds under the final CSP.
- Decide the exact patch/fork strategy and resolve GPL distribution review.

### Phase 3: Sepolia end to end

**Implementation:** Complete. **Manual status:** Quote, deposit, confirmed
balance, ASP-pending presentation, and one public withdrawal were observed.
Both local wallet types, private partial/full Unshield, clean recovery, every
negative path, and destructive safeguards still need the written rehearsal.

- Implement vault, deterministic recovery, event sync, ASP client, and relayer
  validation.
- Exercise shield, partial/full withdrawal, rescan, and ragequit.
- Pass all three signing wallet types and impersonator rejection.
- Test restart, lock, update, ambiguity, and corrupt-cache scenarios.

### Phase 4: mainnet recovery-only rehearsal

- **Implementation/read-only verification:** Complete on 2026-07-20. The exact
  production deployment, active proxy implementation, bytecode, services, and
  build isolation are pinned and live-read verified.
- Restore known test commitments from phrase on production-equivalent data.
- Exercise emergency procedures without enabling public deposits.
- Complete security, legal/compliance, licensing, and store-policy review.

### Phase 5: mainnet implementation and controlled Chrome beta

- **Implementation:** Complete. Normal dev and production builds select the
  immutable mainnet profile; dedicated Sepolia commands select Sepolia. No runtime or remote
  override exists.
- Enable Bankr, private-key, and seed accounts only through the checked-in
  release-policy state. Impersonators and agent-password mutations stay blocked.
- Keep amounts governed by the contract minimum, valid `uint256` input, and
  available balance after gas.
- Require a capped live Shield/Unshield/ragequit and clean-recovery rehearsal
  for each supported wallet type before rollout approval.
- Monitor only privacy-safe operational health.

### Phase 6: broader availability

- Expand Bankr rollout only after its live original-depositor recovery proof.
- Consider Firefox after equivalent prover QA.
- Evaluate ERC-20 pools or other deployments only through a new PRD revision.

## 27. Mainnet go/no-go

The mainnet build profile is implemented. Value-bearing rollout and release
distribution remain unapproved until all are true:

- officially documented deployment and implementation are pinned;
- audit-to-contract, circuit, SDK, artifact, and adapter mapping is complete;
- SDK patch list and recovery derivation are frozen;
- phrase round-trip and full rescan pass from a clean install;
- partial/full withdrawal and ragequit pass on production-equivalent state;
- applicable Bankr, private-key, and seed paths pass;
- impersonator and agent paths fail closed;
- relayer payloads are decoded, intent-bound, and fee-capped;
- ambiguous submission retry is nullifier-aware;
- packaged MV3 proving meets performance and CSP gates;
- privacy endpoint inventory and user disclosure are complete;
- GPL, legal/compliance, Chrome Web Store, and jurisdiction reviews are
  complete;
- contract/input/affordability bounds, kill switch, and recovery-only mode are
  tested;
- security documentation and storage schemas match the implementation;
- user copy has been reviewed to avoid overstating privacy.

## 28. Success metrics

V1 is successful when:

- recovery round-trip succeeds for every test vector and supported wallet
  type;
- no confirmed operation is lost or duplicated across UI/service-worker
  restarts;
- every submitted public or relayed operation matches a locally approved
  intent;
- users can identify what is public, what is private, and how to recover before
  depositing;
- support can diagnose operation state without collecting secrets or private
  transaction details.

Adoption volume is not a security launch criterion.

## 29. Open follow-ups, not v1 blockers

These do not change the V1 defaults:

1. Whether a later agent-password policy may authorize private spends.
2. Whether multiple private identities should be offered instead of one
   wallet-wide root.
3. Whether a reviewed direct-withdrawal advanced flow should be exposed.
4. Whether WalletChan should operate its own ASP mirror or relayer.
5. Whether ERC-20 pools or additional official deployments meet WalletChan's
   audit and liquidity requirements.
6. Whether a future protocol-neutral private balance should route between
   Privacy Pools, Veil, and Railgun.

## 30. References

- [WalletChan native privacy exploration](./PRIVACY.md)
- [WalletChan implementation architecture](./IMPLEMENTATION.md)
- [WalletChan security requirements](./SECURITY.md)
- [WalletChan storage contract](./STORAGE.md)
- [Extension UI architecture](./EXTENSION_UI_ARCHITECTURE.md)
- [Official Privacy Pools documentation](https://docs.privacypools.com/)
- [Official deployments](https://docs.privacypools.com/deployments)
- [Official app Sepolia configuration (pinned commit)](https://github.com/0xbow-io/privacy-pools-website/blob/461867adb439f25f1cc809ee0187357916b90ef6/src/config/chainData.ts#L570-L625)
- [Official withdrawal flow](https://docs.privacypools.com/protocol/withdrawal)
- [Official core repository and SDK](https://github.com/0xbow-io/privacy-pools-core)
- [Chrome extension CSP](https://developer.chrome.com/docs/extensions/reference/manifest/content-security-policy)
- [Chrome offscreen documents](https://developer.chrome.com/docs/extensions/reference/api/offscreen)
