# Force inclusion and recovery tests

- `broadcastRecovery.test.ts` freezes the uncertainty policy shared by
  multi-deposit sequencing and receipt polling.
- `architecture.test.ts` keeps implementation ownership in
  `chrome/forceInclusion/`, prevents legacy root-module clutter, freezes
  direct composition-root wiring, and keeps public entrypoints as facades.
- `effectOrder.test.ts` freezes local account/request reauthorization before
  broadcast, deterministic-hash durability before effect-lease release,
  sequential nonce-tail halting, ambiguous-send retention, and recoverable L1
  receipt timeouts.

Local signing's sign-once/broadcast mechanics remain in `../localSigning/`;
batch authorization and transaction execution remain in their own domains.
