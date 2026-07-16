import { AddIcon } from "@chakra-ui/icons";
import { Button, Flex, IconButton } from "@chakra-ui/react";
import { useMemo, useState } from "react";
import { AddressContactList } from "@/components/shared/AddressContactList";
import { AddressContactEditorModal } from "@/components/shared/AddressContactEditorModal";
import {
  AppHeader,
  AppScreen,
  FullScreenPickerEmpty,
  FullScreenPickerSearch,
  ScreenBody,
} from "@/components/ui";
import { useAddressContacts } from "@/hooks/useAddressContacts";
import { useAddressContactIdentities } from "@/hooks/useAddressContactIdentities";

export default function AddressBookScreen({ onBack }: { onBack: () => void }) {
  const { contacts, isLoading, reorderContacts, removeContact } = useAddressContacts();
  const { contactIdentities } = useAddressContactIdentities(contacts);
  const [query, setQuery] = useState("");
  const [isAdding, setIsAdding] = useState(false);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return contactIdentities;
    return contactIdentities.filter(({ contact, publicName }) => {
      return contact.label.toLowerCase().includes(normalized)
        || contact.address.toLowerCase().includes(normalized)
        || Boolean(publicName?.toLowerCase().includes(normalized));
    });
  }, [contactIdentities, query]);

  return (
    <AppScreen>
      <AppHeader
        title="Address book"
        onBack={onBack}
        trailing={<IconButton aria-label="Add contact" icon={<AddIcon />} variant="ghost" minW="44px" h="44px" onClick={() => setIsAdding(true)} />}
      />
      <Flex px={4} pt={3} pb={2} bg="surface.base">
        <FullScreenPickerSearch label="Search contacts" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Label, name, or address" />
      </Flex>
      <ScreenBody pt={1} pb={4}>
        {!isLoading && contacts.length === 0 ? (
          <FullScreenPickerEmpty
            title="No contacts yet"
            description="Save frequently used EVM addresses so they are recognizable everywhere in WalletChan."
            action={<Button onClick={() => setIsAdding(true)}>Add contact</Button>}
          />
        ) : filtered.length === 0 ? (
          <FullScreenPickerEmpty title="No contacts found" description={`No contact matches “${query.trim()}”.`} />
        ) : (
          <AddressContactList
            contacts={filtered}
            allContacts={contacts}
            description={query.trim() ? `${filtered.length} matching contacts` : "Drag the handle to reorder"}
            isFiltering={Boolean(query.trim())}
            onRemoveContact={removeContact}
            onReorderContacts={reorderContacts}
          />
        )}
      </ScreenBody>

      <AddressContactEditorModal isOpen={isAdding} onClose={() => setIsAdding(false)} />
    </AppScreen>
  );
}
