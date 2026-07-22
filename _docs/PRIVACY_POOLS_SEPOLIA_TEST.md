# Privacy Pools Sepolia rehearsal

This is the manual gate for the unpacked WalletChan `dev:extension` profile.
Use only test wallets and Sepolia ETH. Normal/production builds now select
Ethereum mainnet; their separate evidence and manual gates live in
[`PRIVACY_POOLS_MAINNET_TEST.md`](./PRIVACY_POOLS_MAINNET_TEST.md).

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
| Current automated implementation set | Passed after dual-profile work on 2026-07-20: 181/181 privacy tests, 222/222 UI tests, 6/6 architecture guards, all three typechecks, targeted changed-file lint, 12/12 private-home preview states, extension build/budgets, production-profile isolation, live read-only mainnet validation, and packaged prover restart QA |

Do not mark this Sepolia rehearsal complete until every pending row and step
below has been exercised and recorded. Mainnet implementation has begun by
explicit product-owner direction, but this unfinished rehearsal remains a
release-risk input and must not be represented as completed evidence.

## Build and load

1. Run `pnpm dev:extension` from the workspace root and wait for the initial
   development targets to finish. The final prover process stays in watch mode.
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
   than create a duplicate. After the Sepolia receipt and deposit indexing,
   verify Activity shows `Compliance check pending` with the seamless one-hour
   estimate capped at 90%, not numbered steps or a completion guarantee. Wait
   for the ASP state and Shield balance update.
9. Keep Shield open through confirmation and verify the compact balance updates
   without closing/reopening. Then return to Private Activity and verify the same
   public stage is current and opens normal transaction details.
10. Once confirmed/indexed but awaiting ASP, verify the Private Assets row and
    private USD chart include it, distinguish available from awaiting-check ETH,
    and do not alter any Public account balance/chart/activity.
11. Open the row action sheet and verify Shield ETH, Unshield ETH, and View
    activity route correctly. No Send action should appear. View activity must filter the existing timeline,
    not open a second activity screen.
12. For a fresh pending deposit, close every WalletChan popup/sidepanel and lock
    the wallet while leaving the browser running. After Privacy Pools approves
    it, verify one generic native `Shielding approved` notification arrives and
    Activity later shows the compliance check complete. The notification must
    not contain an amount, account, chain, label, commitment, or address.
13. Open Shield and Unshield while the privacy capability is cold. Each
    must show `Unlock WalletChan to continue`, not a red operation error. Test
    both password and passkey unlock; success must return to the same screen,
    and transaction-details public-exit navigation must retain its exact amount.

## Measure ASP approval time for a deposit

Use this immediately after a new Sepolia deposit becomes ready. The ASP public
deposit response exposes the original deposit timestamp and current review
status, but **does not expose the internal approval timestamp**. Record two
durations instead:

1. **ASP root-production latency**: deposit block time -> ASP `mt-roots.createdAt`.
2. **Wallet-verifiable latency**: deposit block time -> first Sepolia block where
   Entrypoint `latestRoot()` equals that ASP `mtRoot`. This is the primary
   end-to-end number because WalletChan refuses to accept `approved` until the
   ASP label proof matches the onchain association root.

Pinned Sepolia values live in
`apps/extension/src/chrome/privacy/deployment/sepoliaManifest.ts`:

```text
Entrypoint: 0x34A2068192b1297f2a7f85D7D8CdE66F8F0921cB
ETH pool:   0x644d5A2554d36e27509254F32ccfeBe8cd58861f
ASP:        https://dw.0xbow.io
Chain ID:   11155111
Pool scope: 13541713702858359530363969798588891965037210808099002426745892519913535247342
```

Procedure:

1. Open the deposit transaction on Sepolia Etherscan. Confirm success, record
   its block number and timestamp, and find the ETH-pool `Deposited` log. Copy
   `_label` as a decimal value; also verify `_value`, `_precommitmentHash`, pool
   address, and transaction hash so the wrong deposit cannot be measured.
2. Query only that label from the ASP:

   ```bash
   PRIVACY_LABEL='<decimal _label from Deposited>'
   PRIVACY_SCOPE='13541713702858359530363969798588891965037210808099002426745892519913535247342'

   curl -sS 'https://dw.0xbow.io/11155111/public/deposits-by-label' \
     -H 'Accept: application/json' \
     -H "X-Pool-Scope: $PRIVACY_SCOPE" \
     -H "X-Labels: $PRIVACY_LABEL" | jq
   ```

   Require an exact transaction/label/value/precommitment match and
   `reviewStatus: "approved"`. The returned `timestamp` is the deposit time in
   milliseconds, **not** the approval time.
3. Fetch the current ASP roots and leaves, then require the label to be in
   `aspLeaves`:

   ```bash
   curl -sS 'https://dw.0xbow.io/11155111/public/mt-roots' \
     -H "X-Pool-Scope: $PRIVACY_SCOPE" | jq

   curl -sS 'https://dw.0xbow.io/11155111/public/mt-leaves' \
     -H "X-Pool-Scope: $PRIVACY_SCOPE" \
     | jq --arg label "$PRIVACY_LABEL" \
       '{aspLeafCount: (.aspLeaves | length), labelIncluded: (.aspLeaves | index($label) != null)}'
   ```

   Subtract the deposit block timestamp from `mt-roots.createdAt` for the ASP
   root-production latency.
4. Copy `mtRoot` into `PRIVACY_ASP_ROOT`. Starting at the deposit block, inspect
   historical `latestRoot()` values until the first exact match:

   ```bash
   PRIVACY_RPC_URL='https://ethereum-sepolia-rpc.publicnode.com'
   PRIVACY_DEPOSIT_BLOCK='<decimal deposit block>'
   PRIVACY_ASP_ROOT='<decimal mtRoot>'
   PRIVACY_ENTRYPOINT='0x34A2068192b1297f2a7f85D7D8CdE66F8F0921cB'
   privacy_tip="$(cast block-number --rpc-url "$PRIVACY_RPC_URL")"

   for ((privacy_block=PRIVACY_DEPOSIT_BLOCK; privacy_block<=privacy_tip; privacy_block++)); do
     privacy_root="$(cast call "$PRIVACY_ENTRYPOINT" 'latestRoot()(uint256)' \
       --rpc-url "$PRIVACY_RPC_URL" --block "$privacy_block" --json | jq -r '.[0]')"
     if [[ "$privacy_root" == "$PRIVACY_ASP_ROOT" ]]; then
       echo "first matching block: $privacy_block"
       cast block "$privacy_block" --rpc-url "$PRIVACY_RPC_URL" --json \
         | jq '{number, timestamp}'
       break
     fi
   done
   ```

   Convert the two hex block timestamps with `cast to-dec` and subtract them.
   That result is the wallet-verifiable latency. The root-publisher transaction
   in the matching block is useful supporting evidence.
5. Record WalletChan's observed UI/notification time separately. The two-minute
   ASP polling/alarm cadence can add up to roughly one more polling interval;
   it is not part of the Privacy Pools approval duration.

Run the measurement promptly. `mt-roots` returns the latest root, so if newer
root publications have already replaced the first root containing this label,
the historical-root calculation is only an upper bound unless an earlier root
snapshot was saved.

Known example (2026-07-21): deposit
`0x7161daffb4d955f21f4fed89556edb1ec850137c37676e6e1bc498cfdb2a9058`
confirmed in block `11315692` at `2026-07-20T22:39:48Z`. The approving ASP root
was created at `2026-07-20T22:47:28.583Z` (7m 40.583s), then became the
Entrypoint `latestRoot()` in block `11315730` at `2026-07-20T22:48:00Z` via
root-publisher transaction
`0xab046d84c586631e4a9781e8ac1ce54d5e41ca3bfe4de81180cf2c70dde8a843`.
The wallet-verifiable approval time was therefore **8m 12s**.

## Core flow: seed-phrase account

Repeat the private-key flow with a derived seed-phrase account. The transaction
must use the selected derived address and local signing path. Switching accounts
during review/confirmation must fail closed rather than silently signing from a
different account.

## Negative wallet paths

- Bankr: quote/review preparation may load, but Review shield must fail before
  a transaction prompt, and Unshield must fail before proving or relay
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

1. With a ready Shield balance, switch to Private and open Unshield. Verify
   Private has no Send action, Unshield has no token selector, and its empty
   recipient requires an explicit address or contact choice.
2. Enter a partial amount and a fresh recipient through the shared Send
   contact/ENS controls. Verify contract-recipient acknowledgement still gates
   review.
3. Press Review unshield. Verify amount, relayer fee, net recipient amount,
   recipient, route, and quote expiry. The disclosure must say the relay breaks
   the direct onchain deposit link without claiming the transfer is untraceable.
4. Press Unshield normally; no hold, extra password, or biometric prompt
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

The unpacked Sepolia build remains the only approved distribution target. Chrome Web
Store, GitHub release, and Firefox zip commands intentionally fail until the
`snarkjs` GPL-3.0 distribution decision is approved. Production compilation
does not override that gate. Do not send a value-bearing mainnet test until the
explicit gates in `PRIVACY_POOLS_MAINNET_TEST.md` have passed.

Latest automated run (2026-07-20): all code, UI, architecture, typecheck,
preview, build/budget, production-profile isolation, live read-only mainnet,
and packaged-prover checks passed. The production build was 46,239,514 bytes,
with 23,690,342 bytes of circuit artifacts, a 336,397-byte prover worker, and a
3,525,783-byte background bundle. Packaged Chromium proved successfully before
and after reopening in 9.205/8.988 seconds, with a peak process-tree RSS delta
of 261,128,192 bytes. The unpacked-Sepolia distribution policy had already
passed in the immediately preceding checkpoint; it was not changed by this port.
