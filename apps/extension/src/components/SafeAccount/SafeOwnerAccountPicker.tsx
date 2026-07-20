import { ChevronRightIcon, ExternalLinkIcon } from "@chakra-ui/icons";
import { Flex, IconButton, Text } from "@chakra-ui/react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Account } from "@/chrome/types";
import { AccountAvatar } from "@/components/AccountIdentity";
import { AccountPickerRow } from "@/components/AccountPickerRow";
import { getDefaultAccountExplorerUrl } from "@/components/accountExplorerUtils";
import { getWalletTypeLabel } from "@/components/accountIdentityLabels";
import { CopyButton } from "@/components/CopyButton";
import { FullScreenPickerLayer } from "@/components/FullScreenPickerLayer";
import {
  FullScreenPicker,
  FullScreenPickerGroup,
  ListItem,
  ListItemContent,
  ListItemDescription,
  ListItemMedia,
  ListItemTitle,
  ListSurface,
} from "@/components/ui";
import { useAccountIdentityLabels } from "@/hooks/useAccountIdentityLabels";
import { useSeedGroupMap } from "@/hooks/useSeedGroupMap";

export function SafeOwnerAccountPicker({
  accounts,
  selectedAccountId,
  onSelect,
}: {
  accounts: Account[];
  selectedAccountId: string | null;
  onSelect: (accountId: string) => void;
}) {
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);
  const seedGroupMap = useSeedGroupMap(accounts);
  const {
    getDisplayName,
    getEnsAvatar,
    getSecondaryIdentity,
  } = useAccountIdentityLabels(accounts);
  const selectedAccount = accounts.find(
    (account) => account.id === selectedAccountId,
  );

  const closePicker = useCallback((restoreFocus = true) => {
    setIsPickerOpen(false);
    if (restoreFocus) {
      requestAnimationFrame(() => triggerRef.current?.focus());
    }
  }, []);

  useEffect(() => {
    if (!isPickerOpen) return;

    const focusFrame = requestAnimationFrame(() => {
      pickerRef.current
        ?.querySelector<HTMLElement>("[data-screen-heading]")
        ?.focus();
    });
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closePicker();
      }
    };
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [closePicker, isPickerOpen]);

  const selectAccount = (accountId: string) => {
    onSelect(accountId);
    closePicker();
  };

  return (
    <>
      <ListSurface>
        <ListItem px={0} py={0} gap={0}>
          <Flex
            ref={triggerRef}
            as="button"
            type="button"
            aria-haspopup="listbox"
            aria-expanded={isPickerOpen}
            aria-label={
              selectedAccount ? "Change owner account" : "Choose owner account"
            }
            minW={0}
            flex={1}
            minH="72px"
            px={3}
            py={2.5}
            gap={3}
            align="center"
            textAlign="start"
            _hover={{ bg: "surface.raisedHover" }}
            _active={{ bg: "surface.sunken" }}
            _focus={{ outline: "none" }}
            _focusVisible={{
              boxShadow: "inset 0 0 0 2px var(--chakra-colors-border-focus)",
            }}
            onClick={() => setIsPickerOpen(true)}
          >
            {selectedAccount ? (
              <>
                <ListItemMedia>
                  <AccountAvatar
                    account={selectedAccount}
                    ensAvatar={getEnsAvatar(selectedAccount)}
                    size={36}
                  />
                </ListItemMedia>
                <ListItemContent>
                  <ListItemTitle noOfLines={1}>
                    {getDisplayName(selectedAccount)}
                  </ListItemTitle>
                  <ListItemDescription fontFamily="mono" noOfLines={1}>
                    {getSecondaryIdentity(selectedAccount)}
                  </ListItemDescription>
                  <Text as="span" color="fg.muted" fontSize="xs" lineHeight="1.4">
                    {getWalletTypeLabel(selectedAccount, seedGroupMap)}
                  </Text>
                </ListItemContent>
              </>
            ) : (
              <ListItemContent>
                <ListItemTitle>Choose owner account</ListItemTitle>
              </ListItemContent>
            )}
            <ChevronRightIcon boxSize={5} color="fg.muted" flexShrink={0} />
          </Flex>
        </ListItem>
      </ListSurface>

      {isPickerOpen && (
        <FullScreenPickerLayer>
          <FullScreenPicker
            ref={pickerRef}
            title="Choose owner account"
            onBack={() => closePicker()}
            backLabel="Back to Add Safe"
          >
            <FullScreenPickerGroup
              label="Your accounts"
              description="Sent directly to Safe for this search"
            >
              {accounts.map((account) => (
                <AccountPickerRow
                  key={account.id}
                  account={account}
                  displayName={getDisplayName(account)}
                  ensAvatar={getEnsAvatar(account)}
                  secondaryIdentity={getSecondaryIdentity(account)}
                  walletTypeLabel={getWalletTypeLabel(account, seedGroupMap)}
                  isSelected={account.id === selectedAccountId}
                  onSelect={() => selectAccount(account.id)}
                  actions={
                    <>
                      <CopyButton value={account.address} />
                      <IconButton
                        as="a"
                        href={getDefaultAccountExplorerUrl(account.address)}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label="View address on Etherscan"
                        icon={<ExternalLinkIcon />}
                        size="xs"
                        variant="ghost"
                      />
                    </>
                  }
                />
              ))}
            </FullScreenPickerGroup>
          </FullScreenPicker>
        </FullScreenPickerLayer>
      )}
    </>
  );
}
