import { CheckIcon } from "@chakra-ui/icons";
import type { AddressContact } from "@/chrome/contactBook/repository";
import type { Account } from "@/chrome/types";
import { AccountAvatar } from "@/components/AccountIdentity";
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
  title?: string;
  accounts: Account[];
  contacts: AddressContactIdentity[];
  allContacts: AddressContact[];
  recipient: string;
  search: string;
  onSearchChange: (value: string) => void;
  getAccountDisplayName: (account: Account) => string;
  getAccountEnsAvatar: (account: Account) => string | null;
  onSelect: (account: Account) => void;
  onSelectAddress: (address: string) => void;
  onRemoveContact: (address: string) => Promise<AddressContact[]>;
  onReorderContacts: (addresses: string[]) => Promise<AddressContact[]>;
  onBack: () => void;
}

export function RecipientPicker({
  title = "My contacts",
  accounts,
  contacts,
  allContacts,
  recipient,
  search,
  onSearchChange,
  getAccountDisplayName,
  getAccountEnsAvatar,
  onSelect,
  onSelectAddress,
  onRemoveContact,
  onReorderContacts,
  onBack,
}: RecipientPickerProps) {
  return (
    <FullScreenPicker
      title={title}
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
            const ensAvatar = getAccountEnsAvatar(account);
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
                  <AccountAvatar
                    account={account}
                    ensAvatar={account.type === "safe" ? null : ensAvatar}
                    size={32}
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
