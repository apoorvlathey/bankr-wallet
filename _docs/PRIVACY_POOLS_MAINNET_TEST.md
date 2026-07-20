# Privacy Pools Ethereum mainnet verification

This is the production-profile verification and manual rollout record for
WalletChan Shield. Normal Vite/extension builds select Ethereum mainnet only;
`dev:extension` continues to select Sepolia. Compiled support is not store or
value-bearing rollout approval.

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
| `pnpm dev:extension` / Vite development | Sepolia only | Blocked before prompt | Existing `walletchan-privacy-*-v1` names |
| Normal/production extension build | Ethereum mainnet only | Enabled through Bankr's pinned confirmation/effect boundary | `walletchan-privacy-*-mainnet-v1` names |

Private-key and seed-phrase accounts retain the local signing path in both
profiles. Impersonators remain view-only/reject-only and never reach signing or
submission. Agent-password sessions remain blocked from Shield, Unshield,
phrase rescan/export, and public recovery mutations.

The production bundle probe must find the mainnet Entrypoint, production ASP,
and `mainnet-production`, while finding none of the Sepolia Entrypoint,
Sepolia ASP, or `sepolia-local-beta`. The development probe enforces the inverse.
There is no runtime, stored, query-string, environment-value, or remote switch
between deployments: Vite mode resolves the profile at compile time.

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

Latest run on 2026-07-20: `189/189` privacy tests, `230/230` UI tests, `6/6`
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
`privacy-prover.distribution.json`. The current GPL-3.0/legal decision still
permits only the unpacked Sepolia test target and blocks GitHub release, Chrome
Web Store, and Firefox artifacts. Do not change that file merely because the
normal build now compiles mainnet.

## Manual production gate

No value-bearing mainnet transaction was sent during this port. Before a
controlled rollout, use disposable, explicitly funded accounts and pre-agreed
spend/fee caps:

1. Inspect the normal production UI: Ethereum labels, Etherscan links,
   `0.01 ETH` minimum, `0.5%` fee, ETH/USD amount switching, full-width form
   errors below the route metadata, and no Sepolia selection or copy.
2. Exercise quote/review without submitting for Bankr, private-key, and seed
   accounts. Confirm impersonator, agent, below-minimum, insufficient-funds,
   deployment-drift, ASP/root, expired-quote, and relayer-substitution failures.
   From each Shield transaction review, use Back and then tap Shield again;
   confirm the exact existing request reopens without a second operation or
   `operation-unavailable` error. Explicit Reject must still terminalize that
   request and allow a later Shield attempt to create a fresh operation.
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
