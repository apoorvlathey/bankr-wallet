# Decoded calldata parameter audit map

This folder contains recursive, type-directed presentation for decoded ABI
values. Each module owns one value family such as addresses, arrays, bytes,
numbers, strings, tuples, or unknown values.

Modules receive already-decoded values and rendering context. ABI discovery,
network requests, and transaction authorization do not belong here.

`ParamTabButton.tsx` is the shared theme-aware tab treatment for decoded bytes
and rich string values. Midnight uses quiet sentence-case labels with an amber
active rule; Bauhaus retains its compact boxed tabs.
