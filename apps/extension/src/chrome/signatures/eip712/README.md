# EIP-712 signature policy audit domain

- `validator.ts` owns bounded parsing, required envelope fields, type/field
  count caps, raw ERC-7710 rejection, and validation ordering.
- `delegationPolicy.ts` identifies raw ERC-7710 `Delegation` typed data that
  must use WalletChan's reviewed execution-permission flow instead.
- `schemaValidation.ts` owns prototype-safe identifiers, type references,
  circular references, schema depth, and iterative object depth checks.
- `sanitization.ts` projects domain/message values onto declared schema fields
  before display and signing.
- `types.ts` owns the shared validation result contract.

All modules are pure and must remain independent from Chrome, sessions,
accounts, credentials, signing, transport, and storage. The root
`eip712Validator.ts` file is only a stable policy-free re-export facade.
