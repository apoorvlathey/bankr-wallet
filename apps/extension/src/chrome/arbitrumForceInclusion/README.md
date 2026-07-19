# Arbitrum delayed inclusion

This domain owns Arbitrum's signed delayed-inbox path. It signs the reviewed
child transaction, submits `0x04 || signedTransaction` through the parent Inbox,
records the Bridge delivery preimage, exposes deadline/consumption status, and
submits the optional `SequencerInbox.forceInclusion` transaction.

The ordinary confirmation, progress, Activity, and L1/L2 receipt UI remain
shared with OP Stack. Protocol-specific recovery is intentionally kept here.
