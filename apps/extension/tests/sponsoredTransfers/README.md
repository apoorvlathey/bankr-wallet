# Sponsored transfer tests

- `architecture.test.ts` enforces the single source folder, 400-line ceiling,
  encrypted V1 storage schema, prepare → persist → submit ordering, sole POST,
  ambiguity retention, finalized dual-RPC agreement, trusted ACK ordering, and
  direct background composition.
These tests cover sponsored intent persistence, response validation, onchain
reconciliation, and the background/UI wiring that must fail closed on
ambiguous authorization state.

`../background/sponsoredTransferRouter.test.ts` freezes the reset barrier,
exact submission/status/ACK inputs, unresolved-status failure, and async channel
contract independently from the relayer domain.
