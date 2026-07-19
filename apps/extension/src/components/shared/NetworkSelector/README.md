# Shared network selector audit map

- `NetworkSelectorScreen.tsx` owns the searchable full-screen presentation,
  local search/focus/Escape behavior, optional All-networks choice, and selected
  row treatment. It receives render-ready network metadata and callbacks only.
- `model.ts` owns deterministic funded-first ordering. Funded networks sort by
  USD value, followed by Ethereum and then all remaining unfunded networks
  alphabetically.
- `index.ts` is the stable cross-feature export used by Swap, Send, the
  homepage portfolio filter, and the dapp dock's chain drawer.

This shared component performs no storage, RPC, signing, or transaction work.
Feature adapters remain responsible for supplying balances, native symbols,
icons, and selection effects.
