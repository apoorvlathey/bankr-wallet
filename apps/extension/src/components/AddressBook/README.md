# Address Book UI audit map

- `AddressBookScreen.tsx` owns the Warm Midnight screen shell, add action, local search, and empty states.
- Shared `AddressContactList.tsx` owns contact identity rows, edit/delete controls, deletion confirmation, and pointer/touch/keyboard sorting for both this screen and Send's My contacts picker.
- `useAddressContacts` owns trusted runtime reads/mutations and update subscriptions.
- Shared `useAddressContactIdentities` owns the public-name/avatar/raw fallback projection used here and by Send; `lib/ensBatchIdentity.ts` batches reverse-name and avatar-record reads per chain. The shared list's pure subset-order merge keeps contacts hidden from Send in their saved slots while still providing the exact full permutation required by storage.
- Contact validation, persistence, exact-permutation reordering, and reset ownership stay in `chrome/contactBook/` and the background router.
- The feature never signs, broadcasts, resolves provider authority, or reads wallet secrets.
