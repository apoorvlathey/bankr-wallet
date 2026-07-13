# Batch tests

`architecture.test.ts` freezes the extracted ERC-5792 module boundaries,
facade identities, encoding bytes, origin scoping, durable queue compensation,
credential authorization, and sequential ambiguity policy. Atomic delegate
reauthorization coverage is colocated here as well. Broader shared
transport/lifecycle tests remain at `tests/` until their owning production
domains move.

The security runner discovers this directory recursively.
