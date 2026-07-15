# Shared wallet presentation audit map

This folder contains reusable wallet-aware presentation used across more than
one feature, including account-type iconography, private-key entry UI, and the
label-first address disclosure shared by transaction and approval surfaces.

`LabeledAddressPopover.tsx` owns the compact identity pill plus hover/focus
address, clipboard, and explorer disclosure across transaction and EIP-712
review. Unlabeled callers use its exported `AddressActions` row directly rather
than inventing a generic contract label.

Feature-specific state and one-off child components stay in their owning
domain. Domain-free screen/list primitives belong in `components/ui/` instead.
