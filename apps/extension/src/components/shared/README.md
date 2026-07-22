# Shared wallet presentation audit map

This folder contains reusable wallet-aware presentation used across more than
one feature, including account-type iconography, private-key entry UI, and the
label-first address disclosure shared by transaction and approval surfaces.

`LabeledAddressPopover.tsx` owns the compact identity pill plus hover/focus
address, clipboard, and explorer disclosure across transaction and EIP-712
review. It resolves the shared cached ENS/Basename/WNS/GNS/Mega identity and
gives a local address-book label first priority, followed by a matching wallet
account's display name before any public name or API label. Resolved avatars
render through the privileged raster cache; only matching wallet accounts may
fall back to their Bankr or blockie avatar by default. Owner/address-directory
surfaces may opt into the shared deterministic blockie fallback for external
addresses, and callers that already hold trusted account state can supply the
matching account directly. `addressIdentityPresentation.ts`
keeps that label/avatar priority pure and directly testable. Unlabeled callers
use its exported `AddressActions` row directly rather than inventing a generic
contract label.

`AddressContactEditorModal.tsx` is the shared trusted-UI add/edit form used by
the address popover and the Address Book screen. It delegates persistence to
the contact hook and never owns storage or wallet effects directly.

`AddressContactAvatar.tsx` owns the safe onchain-avatar → deterministic-blockie
fallback used by Address Book and Send. `useAddressContactIdentities` is their
single enrichment projection for public names, secondary text, avatar records,
and raw-address fallback; feature screens must not recreate that logic.

`AddressContactList.tsx` is the single editable contact-list presentation used
by More → Address book and Send → My contacts. It owns edit/delete dialogs and
pointer, touch, and keyboard sorting. `addressContactListModel.ts` merges a
reordered visible subset into the full stored permutation, preserving contacts
excluded from Send because they duplicate wallet accounts.
Send enables the list's optional group-header Add action, so the same shared
name-service-aware editor remains available even when the saved list is empty.

`TokenContractPopover.tsx` keeps ERC-20 contract copy and explorer tools behind
the visible token symbol across transaction and permission-review surfaces.

Feature-specific state and one-off child components stay in their owning
domain. Domain-free screen/list primitives belong in `components/ui/` instead.

`BackupConfirmationCheckbox.tsx` is the shared amber commitment control used
when a private key or recovery phrase must be acknowledged before continuing.

`ViewOnlySigningNotice.tsx` is the shared action-bar warning used by
transaction, batch, signature, and ERC-7715 prompts pinned to a view-only
account. It remains immediately above the reject-only action rather than in
the scrollable request content.
