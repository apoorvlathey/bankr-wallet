# Privacy Pools Sepolia rehearsal

This is the manual gate for the unpacked WalletChan extension. Use only test
wallets and Sepolia ETH. Ethereum mainnet is not enabled.

For architecture, recent defect history, and the next-session starting point,
read [`PRIVACY_POOLS_HANDOFF.md`](./PRIVACY_POOLS_HANDOFF.md) first.

## Recorded progress (2026-07-20)

| Rehearsal area | Status |
| --- | --- |
| Simplified Shield layout | Observed and accepted |
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
| Full automated release command set | Re-run at final Sepolia sign-off |

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
2. Select a private-key test account funded with Sepolia ETH and open Shield.
3. Confirm the page immediately shows Shield balance, Shield, Unshield, and
   Activity, with no setup/explainer page or phrase.
4. Press Shield and verify the amount form opens immediately with no
   “Checking Shield” proof wait. Enter at least `0.001 ETH`, and try Max.
5. Verify the quote shows source balance, 1% protocol fee, expected private
   credit, gas reserve, and total. There must be no arbitrary 1 ETH maximum.
6. Continue to review. Verify the source, amount, fee, expected credit, and
   Entrypoint destination; nothing has been sent yet.
7. Press Confirm details. Verify one normal WalletChan transaction confirmation
   opens for the same account and exact Sepolia deposit.
8. Reject once and confirm no transaction is broadcast. Repeat and approve.
9. Close and reopen the UI while it is pending. Activity must resume rather
   than create a duplicate. Verify its four-stage progress bar advances through
   wallet confirmation, Sepolia confirmation, deposit indexing, and eligibility
   review without displaying a made-up countdown. Wait for the public receipt,
   pool event, ASP state, and Shield balance update.
10. Keep Shield open through confirmation and verify the progress advances
    without closing/reopening. Then return to the main wallet Activity and
    verify the same public stage is current and opens the normal transaction
    details.
11. Once the deposit is confirmed/indexed but still awaiting ASP, verify its
    amount is already included in the headline ETH and USD balance. The exact
    pending subset should appear in amber as `waiting ASP check`; no ETA should
    be shown.

## Core flow: seed-phrase account

Repeat the private-key flow with a derived seed-phrase account. The transaction
must use the selected derived address and local signing path. Switching accounts
during review/confirmation must fail closed rather than silently signing from a
different account.

## Negative wallet paths

- Bankr: quote and review may load, but Confirm details must fail before a
  transaction prompt because Bankr cannot submit Sepolia raw transactions.
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

1. With a ready Shield balance, choose Unshield and enter a fresh recipient.
2. Review a partial amount. Verify amount, relayer fee, and recipient, then
   submit. Close/reopen during proving or relayer submission and confirm only
   one withdrawal remains in Activity.
3. After confirmation, verify the recipient receives the public amount and the
   remaining private balance becomes a new ready commitment.
4. Repeat with Max/full balance. Verify the nullifier is consumed and no stale
   private balance remains.
5. Let a quote expire before submission and confirm WalletChan requires a new
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
