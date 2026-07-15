# Shared wallet presentation audit map

This folder contains reusable wallet-aware presentation used across more than
one feature, including account-type iconography, private-key entry UI, and the
label-first address disclosure shared by transaction and approval surfaces.

`LabeledAddressPopover.tsx` owns the compact identity pill plus hover/focus
address, clipboard, and explorer disclosure across transaction and EIP-712
review. It resolves the shared cached ENS/Basename/WNS/GNS/Mega identity and
gives a matching wallet account's display name first priority. Resolved avatars
render through the privileged raster cache; only matching wallet accounts may
fall back to their Bankr or blockie avatar. `addressIdentityPresentation.ts`
keeps that label/avatar priority pure and directly testable. Unlabeled callers
use its exported `AddressActions` row directly rather than inventing a generic
contract label.

`TokenContractPopover.tsx` keeps ERC-20 contract copy and explorer tools behind
the visible token symbol across transaction and permission-review surfaces.

Feature-specific state and one-off child components stay in their owning
domain. Domain-free screen/list primitives belong in `components/ui/` instead.
