# Privacy Pools Sepolia rehearsal

This is the manual gate for the unpacked WalletChan extension. Use only test
wallets and Sepolia ETH. Ethereum mainnet is not enabled.

For architecture, recent defect history, and the next-session starting point,
read [`PRIVACY_POOLS_HANDOFF.md`](./PRIVACY_POOLS_HANDOFF.md) first.

## Recorded progress (2026-07-20)

| Rehearsal area | Status |
| --- | --- |
| Public/private home and private-only Shielded ETH portfolio | Implemented; browser sign-off pending |
| Swap-style Shield/Unshield layout | Implemented; browser sign-off pending |
| Biometric/passkey first access | Observed working |
| Free-tier RPC compatibility and quotes | Observed working; WalletChan batches at most three calls |
| No arbitrary 1 ETH cap | Observed working |
| Deposit -> confirmed balance -> ASP-pending display | Observed on a real Sepolia deposit |
| Withdraw publicly | One real transaction succeeded after the signal-binding fix |
| User-rejected public withdrawal hidden from Activity | Implemented and automated; browser recheck pending |
| Complete private-key and seed-phrase matrix | Pending written sign-off |
| ASP-approved partial/full private Unshield | Pending |
| Reveal/clean restore/full rescan | Pending |
| Account-removal/reset safeguards | Pending |
| Current automated implementation set | Passed after dual-mode work on 2026-07-20: 175/175 privacy tests, 222/222 UI tests, 6/6 architecture guards, all three typechecks, targeted changed-file lint, 12/12 private-home preview states, extension build/budgets, packaged prover restart QA, and unpacked-Sepolia distribution policy |

Do not mark this rehearsal complete or begin mainnet work until every pending
row and step below has been exercised and recorded.

## Build and load

1. Run `pnpm build:extension` from the workspace root.
2. In `chrome://extensions`, reload the unpacked extension from
   `apps/extension/build`.
3. Keep the extension service-worker console open and clear old errors.
4. A free-tier Sepolia RPC that rejects batches above three requests is a useful
   compatibility check; WalletChan must never send a larger batch.

Expected: the extension starts normally, the Shield page stays responsive, and
opening it causes no transaction prompt.

## Core flow: private-key account

1. Unlock with the main password or a fresh biometric assertion.
2. Switch the home to Private, press Shield ETH, then select a funded
   private-key Sepolia source account inside Shield.
3. Confirm Shield opens directly without mode tabs and shows fixed Sepolia ETH → Shielded ETH
   cards, with no setup/explainer page, phrase, asset picker, or network picker.
4. Enter at least `0.001 ETH`, try the percentage slider/Max, and verify no
   “Checking Shield” proof wait blocks amount entry.
5. Verify the form shows source balance, 1% protocol fee, expected Shielded ETH
   credit, and a gas-aware maximum. There must be no arbitrary 1 ETH maximum.
6. Press Review shield. Verify the one normal WalletChan transaction request is
   the only review and crisply shows the public ETH debit, Shielded ETH credit,
   protocol fee, network fee, Sepolia route, and Entrypoint destination.
7. Reject once and confirm no transaction is broadcast. Repeat and approve.
8. Close and reopen the UI while it is pending. Main Activity must resume rather
   than create a duplicate. Verify its four-stage progress bar advances through
   wallet confirmation, Sepolia confirmation, deposit indexing, and eligibility
   review without displaying a made-up countdown. Wait for the public receipt,
   pool event, ASP state, and Shield balance update.
9. Keep Shield open through confirmation and verify the compact balance updates
   without closing/reopening. Then return to Private Activity and verify the same
   public stage is current and opens normal transaction details.
10. Once confirmed/indexed but awaiting ASP, verify the Private Assets row and
    private USD chart include it, distinguish available from awaiting-check ETH,
    and do not alter any Public account balance/chart/activity.
11. Open the row action sheet and verify Shield ETH, Unshield ETH, Send privately, and View
    activity route correctly. View activity must filter the existing timeline,
    not open a second activity screen.

## Core flow: seed-phrase account

Repeat the private-key flow with a derived seed-phrase account. The transaction
must use the selected derived address and local signing path. Switching accounts
during review/confirmation must fail closed rather than silently signing from a
different account.

## Negative wallet paths

- Bankr: quote/review preparation may load, but Review shield must fail before
  a transaction prompt, and Send privately must fail before proving or relay
  submission, because Bankr does not support the Sepolia mutation paths.
- Impersonator: Shield, Unshield, and public recovery must never reach signing.
- Agent password: aggregate balance may be visible, but setup, Shield,
  Unshield, phrase reveal/restore/rescan, and public recovery must be blocked.

## Recovery phrase and rescan

Use Settings -> Shield recovery on a disposable test wallet.

1. Reveal phrase and enter the current main password. Verify it shows exactly
   12 words and hides after one minute or immediately when leaving the screen.
2. Reopen the screen. The status should show that the exact current Shield
   identity was backed up; the phrase itself must not remain visible.
3. Press Scan Sepolia and confirm the same balance/activity is rebuilt without
   creating a transaction.
4. On a clean disposable wallet, restore the saved 12 words with the main
   password. Confirm WalletChan starts a Sepolia scan and recovers the same
   commitment lineage and balance.
5. Enter an invalid or different-length phrase and verify restore changes
   nothing.

## Unshield

1. With a ready Shield balance, switch to Private and open Unshield, then Send.
   Verify each has its own screen title and no token selector; Unshield defaults
   receipt to the active WalletChan account while Send starts recipient-first.
2. Enter a partial amount and a fresh recipient through the shared Send
   contact/ENS controls. Verify contract-recipient acknowledgement still gates
   review.
3. Press Review private send. Verify amount, relayer fee, net recipient amount,
   recipient, route, and quote expiry. The disclosure must say the relay breaks
   the direct onchain deposit link without claiming the transfer is untraceable.
4. Press Send privately normally; no hold, extra password, or biometric prompt
   belongs inside this screen. Close/reopen during proving or relay submission
   and confirm only one withdrawal remains in Private Activity.
5. After confirmation, verify the recipient receives the public amount and the
   remaining private balance becomes a new ready commitment.
6. Repeat with Max/full balance. Verify the nullifier is consumed and no stale
   private balance remains.
7. Let a quote expire before submission and confirm WalletChan requires a new
   quote rather than reusing it.

## Public recovery and destructive safeguards

For a confirmed/indexed commitment that is pending, declined, removed, or
ASP-unavailable:

1. Verify the dashboard offers **Withdraw publicly** and clearly says it
   returns to the original deposit address and creates a public link.
2. From the original private-key or seed account, reject once, then approve.
   The user-rejected attempt must not appear as a failed Activity row. The
   approved attempt must resume across UI/service-worker restart and accept
   only the exact Ragequit event before removing the private balance.
3. Verify another account, Bankr, impersonator, and agent sessions cannot use
   the recovery path.
4. While an account has an unresolved Shield operation, in-flight recovery, or
   unspent commitment, try to remove it. Removal must stop before dapp grants or
   account metadata change.
5. On the unlock-screen reset flow, verify a wallet with Shield data requires
   the explicit phrase-saved/loss-risk checkbox. Cancel once. On a disposable
   wallet, complete reset and verify all Shield data is gone.

## Automated release rehearsal

Run:

```bash
pnpm --filter @walletchan/extension test:privacy
pnpm --filter @walletchan/extension typecheck:ui
pnpm --filter @walletchan/extension typecheck:qa
PREVIEW_QA_ROUTE=shield pnpm --filter @walletchan/extension qa:preview
pnpm build:extension
pnpm --filter @walletchan/extension qa:extension:privacy-prover
node apps/extension/scripts/privacy-prover-distribution.mjs --target=unpacked-sepolia-test
```

The unpacked Sepolia build is the only approved distribution target. Chrome Web
Store, GitHub release, and Firefox zip commands intentionally fail until the
`snarkjs` GPL-3.0 distribution decision is approved. Do not begin a mainnet
test until every Sepolia step above, legal/security review, and the mainnet
go/no-go checklist in `PRIVACY_POOLS_PRD.md` have passed.

Latest automated run (2026-07-20): all commands above passed. The build was
46,233,929 bytes, with 23,690,342 bytes of circuit artifacts, a 336,397-byte
prover worker, and a 3,522,011-byte background bundle. Packaged Chromium proved
successfully before and after reopening in 9.027/9.981 seconds, with a peak
process-tree RSS delta of 352,976,896 bytes.
