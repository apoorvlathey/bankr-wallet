# Mnemonic / seed-account audit domain

`../mnemonicStorage.ts` is the stable public facade for the persisted recovery
phrase vault. Review in dependency order:

1. `record.ts` — released/current V1/V2 record codec and bounds.
2. `crypto.ts` — explicit password/key/AAD/key-check transformations.
3. `repository.ts` — locked `mnemonicVault` storage ownership.
4. `operations.ts` — store/read/remove coordination and commit assertions.
5. `recovery.ts` — V2 preparation, integrity verification, and password rotation.
6. `derivation.ts` — pure BIP-39 validation/generation and bounded BIP-44 key
   derivation.
7. `masterAccess.ts` — non-serializable, master-only call-stack capability for
   mnemonic reads and writes.
8. `integrity.ts` — master-wrapper recovery proof against every stored seed
   account.
9. `addressPreview.ts` — secret-free public-address preview.
10. `accountPersistence.ts` — derived signer collision, conversion,
    compensation, and cache refresh boundary.
11. `accountHandlers.ts` — add-group and derive-account orchestration under the
    wallet-secret lock.

## Dependency direction

```text
record → crypto
   ↓       ↓
repository → operations / recovery

repository + recovery + master session → master access
derivation + recovery + account metadata → integrity
master access + operations + derivation → address preview
master access + derivation + account/vault storage → account persistence
operations + master access + account persistence → account handlers
account handlers → background router
```

Crypto is storage/session independent; the repository does not choose
authorization; orchestration revalidates the master epoch at persistent
effects. Historical record schemas remain frozen by upgrade fixtures.

No implementation in this directory imports `../mnemonicStorage.ts`; that
root module is an export-only cross-domain compatibility facade. The
`mnemonicVault`, seed-group, account, and private-key-vault keys and record
shapes are unchanged by file moves.
