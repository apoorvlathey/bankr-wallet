# ERC-7715 / ERC-7710 audit domain

This directory owns delegated execution permissions. The two supported import
entry points remain at the parent level:

- `../erc7715PermissionHandlers.ts` — provider/domain operations.
- `../pendingErc7715PermissionStorage.ts` — persistence compatibility API.

## Review order

1. `types.ts`, `address.ts`, `permissionTypes.ts` — accepted data contracts and
   the fixed permission vocabulary.
2. `validationPrimitives.ts`, `ruleValidation.ts`, `permissionValidation.ts` —
   bounded amount/time validation, expiry rules, and permission schemas.
   `registry.ts` is the stable local facade for these pure modules.
3. `caveatDefinitions.ts`, `caveatEncoding.ts`, `caveatBuilder.ts` — canonical
   DeleGator addresses, fixed-width term encoding, and permission-to-caveat
   selection. `caveats.ts` is the stable local facade.
4. `preflightNormalization.ts`, `preflightRpc.ts`,
   `preflightEligibility.ts`, `pendingPermissionRequest.ts` — pure request
   normalization, bounded RPC checks, account/delegate eligibility, and prompt
   construction. `preflight.ts` is the stable local facade.
5. `delegationSigning.ts` — authority encoded into an ERC-7710 delegation.
6. `methods.ts`, `requestHandler.ts` — ingress and prompt scope.
7. `requestLock.ts`, `resolution.ts` — first-action rules and the durable
   request lock. Permission prompts have no age-based expiry.
8. `confirmation.ts`, `grantBoundary.ts`, `grantStorage.ts` — master-only signing
   and the atomic capability-issuance commit.
9. `onchainStatus.ts`, `queries.ts`, `revocation.ts` — live status and removal.
10. `pendingRequestStorage.ts`, `resultStorage.ts`, `permissionBadge.ts` — prompt
   persistence and injected/WalletConnect delivery.

## Dependency direction

```text
types/address/permissionTypes
        ↓
validation primitives → rule validation → permission validation
        ↓
caveat definitions → term encoding → caveat builder
        ↓
normalization + RPC checks → eligibility → pending prompt
        ↓
request / confirmation / revocation operations
        ↓
parent compatibility facades and background transport
```

Pure validation and encoding modules must not import Chrome APIs, session state,
account storage, RPC clients, or signing services. Only `confirmation.ts` may
resolve a local key and sign a reusable delegation. `grantStorage.ts` is the
master-epoch-checked linearization point that commits the grant, removes the
prompt, and writes the success result in one storage operation.

Persisted keys and record shapes are documented in `_docs/STORAGE.md`; moving
files in this directory must never change those schemas.

`registry.ts`, `caveats.ts`, and `preflight.ts` intentionally contain no
implementation logic. They preserve historical local imports and exact export
identities while keeping each security implementation independently auditable
and below the repository's 400-line ceiling.
