import { CheckIcon } from "@chakra-ui/icons";
import { Image } from "@chakra-ui/react";
import type { AddressContact } from "@/chrome/contactBook/repository";
import type { Account } from "@/chrome/types";
import {
  FullScreenPicker,
  FullScreenPickerGroup,
  FullScreenPickerSearch,
  ListItem,
  ListItemContent,
  ListItemDescription,
  ListItemMedia,
  ListItemMeta,
  ListItemTitle,
} from "@/components/ui";
import { truncateAddress } from "@/lib/addressUtils";
import { AddressContactList } from "@/components/shared/AddressContactList";
import type { AddressContactIdentity } from "@/hooks/useAddressContactIdentities";
import { getAccountTypeLabel } from "./formatting";

interface RecipientPickerProps {
  accounts: Account[];
  contacts: AddressContactIdentity[];
  allContacts: AddressContact[];
  recipient: string;
  search: string;
  onSearchChange: (value: string) => void;
  getAccountDisplayName: (account: Account) => string;
  getAccountAvatar: (account: Account) => string;
  onSelect: (account: Account) => void;
  onSelectAddress: (address: string) => void;
  onRemoveContact: (address: string) => Promise<AddressContact[]>;
  onReorderContacts: (addresses: string[]) => Promise<AddressContact[]>;
  onBack: () => void;
}

export function RecipientPicker({
  accounts,
  contacts,
  allContacts,
  recipient,
  search,
  onSearchChange,
  getAccountDisplayName,
  getAccountAvatar,
  onSelect,
  onSelectAddress,
  onRemoveContact,
  onReorderContacts,
  onBack,
}: RecipientPickerProps) {
  return (
    <FullScreenPicker
      title="My contacts"
      onBack={onBack}
      controls={(
        <FullScreenPickerSearch
          label="Search wallets and contacts"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Name or address"
        />
      )}
    >
      {accounts.length > 0 && (
        <FullScreenPickerGroup
          label="My wallets"
          description="Choose another WalletChan account as the recipient."
        >
          {accounts.map((account) => {
            const avatar = getAccountAvatar(account);
            const isSelected =
              recipient.toLowerCase() === account.address.toLowerCase();
            return (
              <ListItem
                key={account.id}
                interactive
                isSelected={isSelected}
                onClick={() => onSelect(account)}
              >
                <ListItemMedia>
                  <Image
                    src={avatar}
                    alt=""
                    boxSize="32px"
                    borderRadius={avatar === "/bankr-icon.png" ? "sm" : "full"}
                  />
                </ListItemMedia>
                <ListItemContent>
                  <ListItemTitle>{getAccountDisplayName(account)}</ListItemTitle>
                  <ListItemDescription fontFamily="mono">
                    {truncateAddress(account.address)}
                  </ListItemDescription>
                </ListItemContent>
                <ListItemMeta
                  color={isSelected ? "accent.secondary" : "fg.secondary"}
                >
                  {isSelected ? (
                    <CheckIcon aria-label="Selected" />
                  ) : (
                    getAccountTypeLabel(account)
                  )}
                </ListItemMeta>
              </ListItem>
            );
          })}
        </FullScreenPickerGroup>
      )}
      <AddressContactList
        contacts={contacts}
        allContacts={allContacts}
        description={search.trim() ? `${contacts.length} matching contacts` : "Select, edit, delete, or drag to reorder."}
        canAddContact
        emptyTitle={search.trim() ? "No matching contacts" : "No saved contacts"}
        emptyDescription={search.trim() ? `No contact matches “${search.trim()}”.` : "Add a frequently used EVM address."}
        isFiltering={Boolean(search.trim())}
        selectedAddress={recipient}
        onSelectAddress={onSelectAddress}
        onRemoveContact={onRemoveContact}
        onReorderContacts={onReorderContacts}
      />
    </FullScreenPicker>
  );
}
