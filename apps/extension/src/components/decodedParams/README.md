# Decoded calldata parameter audit map

This folder contains recursive, type-directed presentation for decoded ABI
values. Each module owns one value family such as addresses, arrays, bytes,
numbers, strings, tuples, or unknown values.

Modules receive already-decoded values and rendering context. ABI discovery,
network requests, and transaction authorization do not belong here.
