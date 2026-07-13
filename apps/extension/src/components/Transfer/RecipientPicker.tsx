import { CheckIcon } from "@chakra-ui/icons";
import { Image } from "@chakra-ui/react";
import type { Account } from "@/chrome/types";
import {
  FullScreenPicker,
  FullScreenPickerEmpty,
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
import { getAccountTypeLabel } from "./formatting";

interface RecipientPickerProps {
  accounts: Account[];
  recipient: string;
  search: string;
  onSearchChange: (value: string) => void;
  getAccountDisplayName: (account: Account) => string;
  getAccountAvatar: (account: Account) => string;
  onSelect: (account: Account) => void;
  onBack: () => void;
}

export function RecipientPicker({
  accounts,
  recipient,
  search,
  onSearchChange,
  getAccountDisplayName,
  getAccountAvatar,
  onSelect,
  onBack,
}: RecipientPickerProps) {
  return (
    <FullScreenPicker
      title="Choose a wallet"
      onBack={onBack}
      controls={(
        <FullScreenPickerSearch
          label="Search your wallets"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Name or address"
        />
      )}
    >
      {accounts.length > 0 ? (
        <FullScreenPickerGroup
          label="Your wallets"
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
      ) : (
        <FullScreenPickerEmpty
          title="No wallets found"
          description={`No wallet matches “${search.trim()}”.`}
        />
      )}
    </FullScreenPicker>
  );
}
