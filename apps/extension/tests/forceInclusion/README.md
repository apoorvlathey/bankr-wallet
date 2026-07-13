# Force inclusion and recovery tests

- `broadcastRecovery.test.ts` freezes the uncertainty policy shared by
  multi-deposit sequencing and receipt polling.
- `architecture.test.ts` keeps implementation ownership in
  `chrome/forceInclusion/` and constrains the temporary background-only root
  facades to policy-free re-exports.

Local signing's sign-once/broadcast mechanics remain in `../localSigning/`;
batch authorization and transaction execution remain in their own domains.
