# Batch tests

`architecture.test.ts` freezes the extracted ERC-5792 module boundaries,
facade identities, encoding bytes, origin scoping, durable queue compensation,
credential authorization, and sequential ambiguity policy. Atomic delegate
reauthorization and non-expiring private-key/seed/Bankr confirmation coverage
are colocated here as well. Broader shared
transport/lifecycle tests remain at `tests/` until their owning production
domains move.

The security runner discovers this directory recursively.
