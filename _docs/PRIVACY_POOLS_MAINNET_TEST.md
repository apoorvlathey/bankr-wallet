# Privacy Pools Ethereum mainnet verification

This is the production-profile verification and manual rollout record for
WalletChan Shield. Normal dev and production extension builds select Ethereum
mainnet; dedicated Sepolia commands select Sepolia. Maintainer-confirmed
controlled mainnet QA was completed on 2026-07-23. Chrome Web Store submission
review remains a separate release-process step.

## Verified production pins (2026-07-20)

WalletChan cross-checked the [official deployment page](https://docs.privacypools.com/deployments)
and the [official app configuration at pinned commit `461867a`](https://github.com/0xbow-io/privacy-pools-website/blob/461867adb439f25f1cc809ee0187357916b90ef6/src/config/chainData.ts).
The public deployment page's implementation address was stale at observation
time, so the release pin follows the implementation stored in the live proxy's
EIP-1967 slot.

| Item | Pinned value |
| --- | --- |
| Chain | Ethereum, `1` |
| Deployment block | `22,153,707` |
| Observation block | `25,573,384` |
| Observation block hash | `0x0533bd1be8dfa610a1497bd174b640164b3aad03f9e86ad8a245505bc900de1c` |
| Entrypoint proxy | `0x6818809EefCe719E480a7526D76bD3e561526b46` |
| Active implementation | `0x15e355024de1CDc74ADdea7EBDf98418Ba5B1a2c` |
| ETH pool | `0xF241d57C6DebAe225c0F2e6eA1529373C9A9C9fB` |
| Withdrawal verifier | `0x022891F938Ae7fDC8Ab9Ead0FBf50aBA8C897D6d` |
| Ragequit verifier | `0xa45ACa8604a73D80C551fAad6355A5c3A5565eC6` |
| Scope | `4916574638117198869413701114161172350986437430914933850166949084132905299523` |
| Native asset | `0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE` |
| Minimum | `0.01 ETH` |
| Vetting fee | `50` bps / `0.5%` |
| Maximum relay fee | `1,000` bps / `10%` |
| ASP | `https://api.0xbow.io` |

The bounded live RPC snapshot verified chain ID, proxy slot, all five runtime
bytecode length/hash identities, pool-to-Entrypoint relationship, scope,
native asset, verifier relationships, and all three fee parameters. The ASP
returned chain-1 roots. Fast Relay's quote signature recovered its declared fee
recipient. Cloaked Relay's quote signature recovered the pinned signer
`0x3A27cfd1BB78Ff6Fd356Eaa59c2f6232FfC6554a`.

## Build-profile contract

| Build | Privacy deployment | Bankr mutation | State namespace |
| --- | --- | --- | --- |
| `pnpm dev:extension` / `pnpm build:extension` | Ethereum mainnet only | Enabled through Bankr's pinned confirmation/effect boundary | `walletchan-privacy-*-mainnet-v1` names |
| `pnpm dev-sepolia:extension` / `pnpm build-sepolia:extension` | Sepolia only | Blocked before prompt | Existing `walletchan-privacy-*-v1` names |

Private-key and seed-phrase accounts retain the local signing path in both
profiles. Impersonators remain view-only/reject-only and never reach signing or
submission. Agent-password sessions remain blocked from Shield, Unshield,
phrase rescan/export, and public recovery mutations.

The mainnet bundle probe must find the mainnet Entrypoint, production ASP,
and `mainnet-production`, while finding none of the Sepolia Entrypoint,
Sepolia ASP, or `sepolia-local-beta`. The explicit Sepolia probe enforces the inverse.
There is no runtime, stored, query-string, or remote switch between deployments:
the dedicated scripts resolve the profile at compile time.

## Automated evidence

The implementation is covered by:

- exact development and production Vite profile probes;
- exact mainnet and Sepolia manifest/deployment validation;
- live mainnet read-only deployment validation;
- Bankr/private-key/seed-phrase production policy coverage plus impersonator
  rejection;
- Sepolia Bankr rejection and both local signer paths;
- source-order guards requiring Bankr privacy authorization before pending
  removal, privacy effect claim before remote submission, then tx-hash record
  and receipt polling;
- profile-isolated database selection and cross-profile secret deletion on
  reset/recovery replacement;
- UI labels, explorer links, minimums, protocol fees, maximum relay fees, and
  account choices derived from the active manifest.

Latest run on 2026-07-20: `193/193` privacy tests, `233/233` UI tests, `6/6`
architecture guards, all three typechecks, changed-file lint, and `14/14`
Shield preview states passed. The full production extension build and frozen
bundle budgets passed. The final bounded live RPC assertion returned chain `1`,
active implementation
`0x15e355024de1CDc74ADdea7EBDf98418Ba5B1a2c`, the pinned pool/scope, `0.01 ETH`
minimum, `50` bps vetting fee, and `1,000` bps maximum relay fee.

Run from the workspace root:

```bash
pnpm --filter @walletchan/extension test:privacy
pnpm --filter @walletchan/extension test:ui
pnpm --filter @walletchan/extension test:ui-architecture
pnpm --filter @walletchan/extension typecheck
pnpm --filter @walletchan/extension typecheck:ui
pnpm --filter @walletchan/extension typecheck:qa
PREVIEW_QA_ROUTE=shield pnpm --filter @walletchan/extension qa:preview
pnpm build:extension
pnpm --filter @walletchan/extension qa:extension:privacy-prover
```

Store/release packaging remains governed by
`privacy-prover.distribution.json`. The GPL-specific decision is complete:
WalletChan extension v4 and later are GPL-3.0-only, with the full license,
`snarkjs@0.7.5` attribution, and exact-version source directions included in
every build. GitHub release, Chrome Web Store, and Firefox artifacts require
`apps/extension/package.json` to be at least 4.0.0. The completed manual record
below does not replace the final store-artifact review.

## Completed manual production QA

On 2026-07-23 the maintainer confirmed completion of this controlled matrix
with disposable, explicitly funded accounts and pre-agreed spend/fee caps:

1. Inspect the normal production UI: Ethereum labels, Etherscan links,
   `0.01 ETH` minimum shielded amount, `0.5%` fee added on top, ETH/USD amount
   switching, full-width form errors below the route metadata, and no Sepolia
   selection or copy. Enter exactly `0.01 ETH`; review must show exactly
   `0.01 ETH` to shield, a `0.000050251256281407 ETH` protocol fee, and a
   `0.010050251256281407 ETH` pre-gas wallet debit.
   Press Max and drag the slider to 100%; in both cases the displayed shielded
   amount plus the added protocol fee and quoted network reserve must equal the
   full ETH balance.
2. Exercise quote/review without submitting for Bankr, private-key, and seed
   accounts. Confirm impersonator, agent, below-minimum, insufficient-funds,
   deployment-drift, ASP/root, expired-quote, and relayer-substitution failures.
   From each Shield transaction review, immediately use Back and then tap
   Shield again before the storage-change event could normally settle; confirm
   the exact existing request reopens without a second operation,
   `operation-unavailable`, or hidden-focused-descendant ARIA warning. Explicit
   Reject must still terminalize that request and allow a later Shield attempt
   to create a fresh operation. Confirm the rejected encrypted operation is
   deleted after its pending request while `nextDepositIndex` remains advanced.
3. For each of Bankr, private-key, and seed accounts, complete a capped Shield
   and observe confirmation, pool indexing, ASP classification, and Private
   Activity/balance transitions across UI and service-worker restarts.
4. Complete partial and full private Unshield to explicitly entered fresh
   addresses with expiry/restart/ambiguous-result handling and confirm the
   exact replacement/nullifier lineage.
5. Reveal/verify the separate Shield recovery phrase, clear rebuildable state,
   restore/rescan from a clean extension profile, and reproduce the balance.
6. Complete public recovery from the exact original depositor for every
   supported wallet type. Confirm prompt rejection creates no Activity row and
   a successful Ragequit terminalizes only after the exact event.
7. Exercise account removal, full reset, recovery-only/incident response, and
   confirm both Sepolia and mainnet encrypted databases are deleted.

Record public transaction hashes in an access-controlled test log only when
needed. Never record the Privacy Pools phrase, commitments, nullifiers, proofs,
private withdrawal recipient mapping, or raw relayer payloads in shared logs.
No transaction hashes or privacy-sensitive evidence are stored in this
repository.
