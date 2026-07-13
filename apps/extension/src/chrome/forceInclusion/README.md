# Force inclusion and transaction recovery audit domain

- `single.ts` builds, submits, tracks, and recovers OP Stack L1 deposits for a
  single Bankr, private-key, or seed-phrase transaction.
- `batch.ts` owns atomic Bankr and sequential local multi-deposit force
  inclusion plus aggregate L1/L2 completion tracking.
- `nonceManager.ts` assigns short-lived per-account/chain pending nonces and
  exposes explicit reset boundaries after definite failures or account reset.
- `receiptPoller.ts` owns receipt polling, terminal history application,
  dropped/ambiguous broadcast classification, and restart resumption.
- `splitBatchSequencer.ts` persists and advances explicit user-requested
  split-batch execution one transaction at a time.

Dependency direction is deposit construction/submission -> receipt and split
recovery. The domain consumes already-authorized pending requests and explicit
effect leases; it does not classify Chrome message senders or own wallet
credentials.

The four root files `forceInclusion.ts`, `splitBatchSequencer.ts`,
`nonceManager.ts`, and `txReceiptPoller.ts` are temporary policy-free facades
used only by the active `background.ts` composition root. Remove them after
that router's imports move into this directory. `batchForceInclusion.ts` has no
root facade.
