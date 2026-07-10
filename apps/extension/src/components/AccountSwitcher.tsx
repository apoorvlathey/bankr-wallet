import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Button,
  Flex,
  HStack,
  IconButton,
  Text,
  VStack,
} from "@chakra-ui/react";
import {
  AddIcon,
  CheckIcon,
  ChevronRightIcon,
  ExternalLinkIcon,
  SettingsIcon,
} from "@chakra-ui/icons";
import type { Account, SeedGroup } from "@/chrome/types";
import { AccountAvatar } from "@/components/AccountIdentity";
import { getWalletTypeLabel } from "@/components/accountIdentityLabels";
import { CopyButton } from "@/components/CopyButton";
import { FullScreenPickerLayer } from "@/components/FullScreenPickerLayer";
import {
  FullScreenPicker,
  FullScreenPickerEmpty,
  FullScreenPickerGroup,
  FullScreenPickerSearch,
  ListItem,
  ListItemActions,
  ListItemContent,
  ListItemDescription,
  ListItemMedia,
  ListItemTitle,
} from "@/components/ui";
import { useEnsIdentities } from "@/hooks/useEnsIdentities";
import { truncateAddress } from "@/lib/addressUtils";

interface AccountSwitcherProps {
  accounts: Account[];
  activeAccount: Account | null;
  explorerUrl?: string;
  onAccountSelect: (account: Account) => void;
  onAddAccount: () => void;
  onAccountSettings: (account: Account) => void;
}

function AccountSwitcher({
  accounts,
  activeAccount,
  explorerUrl,
  onAccountSelect,
  onAddAccount,
  onAccountSettings,
}: AccountSwitcherProps) {
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [seedGroupMap, setSeedGroupMap] = useState<Map<string, string>>(new Map());
  const triggerRef = useRef<HTMLButtonElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);

  const accountAddresses = useMemo(
    () => accounts.map((account) => account.address),
    [accounts],
  );
  const { identities } = useEnsIdentities(accountAddresses);

  useEffect(() => {
    if (!accounts.some((account) => account.type === "seedPhrase")) return;

    chrome.runtime.sendMessage(
      { type: "getSeedGroups" },
      (groups: SeedGroup[] | null) => {
        if (groups) {
          setSeedGroupMap(new Map(groups.map((group) => [group.id, group.name])));
        }
      },
    );
  }, [accounts]);

  const getEnsName = useCallback(
    (account: Account) =>
      identities.get(account.address.toLowerCase())?.name ?? null,
    [identities],
  );

  const getEnsAvatar = useCallback(
    (account: Account) =>
      identities.get(account.address.toLowerCase())?.avatar ?? null,
    [identities],
  );

  const getDisplayName = useCallback(
    (account: Account) =>
      account.displayName || getEnsName(account) || truncateAddress(account.address),
    [getEnsName],
  );

  const normalizedQuery = query.trim().toLowerCase();
  const filteredAccounts = useMemo(() => {
    if (!normalizedQuery) return accounts;

    return accounts.filter((account) => {
      const identity = identities.get(account.address.toLowerCase());
      return [
        account.displayName,
        identity?.name,
        account.address,
        getWalletTypeLabel(account, seedGroupMap),
      ].some((value) => value?.toLowerCase().includes(normalizedQuery));
    });
  }, [accounts, identities, normalizedQuery, seedGroupMap]);

  const closePicker = useCallback((restoreFocus = true) => {
    setIsPickerOpen(false);
    setQuery("");
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

  const openExplorer = (account: Account) =>
    explorerUrl ? `${explorerUrl}/address/${account.address}` : null;

  const selectAccount = (account: Account) => {
    onAccountSelect(account);
    closePicker();
  };

  const openAccountSettings = (account: Account) => {
    onAccountSettings(account);
    closePicker(false);
  };

  const addAccount = () => {
    onAddAccount();
    closePicker(false);
  };

  return (
    <>
      <Button
        ref={triggerRef}
        aria-haspopup="listbox"
        aria-expanded={isPickerOpen}
        aria-label="Choose account"
        variant="ghost"
        w="full"
        minH="64px"
        h="auto"
        px={3}
        py={2.5}
        justifyContent="flex-start"
        borderRadius={0}
        textAlign="start"
        _hover={{ bg: "surface.raisedHover" }}
        _active={{ bg: "surface.sunken" }}
        onClick={() => setIsPickerOpen(true)}
      >
        {activeAccount ? (
          <HStack w="full" spacing={3} minW={0}>
            <AccountAvatar
              account={activeAccount}
              ensAvatar={getEnsAvatar(activeAccount)}
              size={36}
            />
            <VStack align="stretch" spacing={0.5} minW={0} flex={1}>
              <Text
                color="fg.primary"
                fontSize="md"
                fontWeight="600"
                lineHeight="1.3"
                noOfLines={1}
              >
                {getDisplayName(activeAccount)}
              </Text>
              <Text color="fg.secondary" fontSize="sm" fontWeight="400" noOfLines={1}>
                {getWalletTypeLabel(activeAccount, seedGroupMap)}
              </Text>
            </VStack>
            <ChevronRightIcon boxSize={5} color="fg.muted" flexShrink={0} />
          </HStack>
        ) : (
          <HStack w="full" justify="space-between">
            <Text color="fg.secondary" fontWeight="600">Choose account</Text>
            <ChevronRightIcon boxSize={5} color="fg.muted" />
          </HStack>
        )}
      </Button>

      {isPickerOpen && (
        <FullScreenPickerLayer>
          <FullScreenPicker
            ref={pickerRef}
            title="Choose account"
            onBack={() => closePicker()}
            controls={
              <FullScreenPickerSearch
                label="Search accounts"
                placeholder="Name, address, or wallet type"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            }
          >
            {filteredAccounts.length > 0 ? (
              <FullScreenPickerGroup
                label="Accounts"
                description={`${accounts.length} ${accounts.length === 1 ? "account" : "accounts"}`}
              >
                {filteredAccounts.map((account) => {
                  const ensName = getEnsName(account);
                  const explorerHref = openExplorer(account);
                  const secondaryIdentity =
                    account.displayName && ensName
                      ? `${ensName} · ${truncateAddress(account.address)}`
                      : truncateAddress(account.address);

                  return (
                    <ListItem
                      key={account.id}
                      px={0}
                      py={0}
                      gap={0}
                      isSelected={account.id === activeAccount?.id}
                    >
                      <Flex
                        as="button"
                        type="button"
                        minW={0}
                        flex={1}
                        minH="64px"
                        px={3}
                        py={2.5}
                        gap={3}
                        align="center"
                        textAlign="start"
                        _hover={{ bg: "surface.raisedHover" }}
                        _focus={{ outline: "none" }}
                        _focusVisible={{ boxShadow: "inset 0 0 0 2px var(--chakra-colors-border-focus)" }}
                        onClick={() => selectAccount(account)}
                      >
                        <ListItemMedia>
                          <AccountAvatar
                            account={account}
                            ensAvatar={getEnsAvatar(account)}
                            size={36}
                          />
                        </ListItemMedia>
                        <ListItemContent>
                          <HStack spacing={1.5} minW={0}>
                            <ListItemTitle noOfLines={1}>
                              {getDisplayName(account)}
                            </ListItemTitle>
                            {account.id === activeAccount?.id && (
                              <CheckIcon boxSize={3} color="accent.secondary" flexShrink={0} />
                            )}
                          </HStack>
                          <ListItemDescription fontFamily="mono" noOfLines={1}>
                            {secondaryIdentity}
                          </ListItemDescription>
                          <Text as="span" color="fg.muted" fontSize="xs" lineHeight="1.4">
                            {getWalletTypeLabel(account, seedGroupMap)}
                          </Text>
                        </ListItemContent>
                      </Flex>
                      <ListItemActions pr={2}>
                        <CopyButton value={account.address} />
                        {explorerHref && (
                          <IconButton
                            as="a"
                            href={explorerHref}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label="View address on explorer"
                            icon={<ExternalLinkIcon />}
                            size="xs"
                            variant="ghost"
                          />
                        )}
                        <IconButton
                          aria-label={`Settings for ${getDisplayName(account)}`}
                          icon={<SettingsIcon />}
                          size="xs"
                          variant="ghost"
                          onClick={() => openAccountSettings(account)}
                        />
                      </ListItemActions>
                    </ListItem>
                  );
                })}
              </FullScreenPickerGroup>
            ) : (
              <FullScreenPickerEmpty
                title="No accounts found"
                description={`No account matches “${query.trim()}”. Try a name, address, or wallet type.`}
              />
            )}

            <FullScreenPickerGroup label="Manage">
              <ListItem interactive onClick={addAccount}>
                <ListItemMedia>
                  <Flex
                    boxSize="32px"
                    align="center"
                    justify="center"
                    bg="surface.sunken"
                    borderRadius="md"
                    color="accent.secondary"
                  >
                    <AddIcon boxSize={3.5} />
                  </Flex>
                </ListItemMedia>
                <ListItemContent>
                  <ListItemTitle>Add account</ListItemTitle>
                  <ListItemDescription>
                    Import a wallet or add a view-only address
                  </ListItemDescription>
                </ListItemContent>
                <ChevronRightIcon boxSize={5} color="fg.muted" />
              </ListItem>
            </FullScreenPickerGroup>
          </FullScreenPicker>
        </FullScreenPickerLayer>
      )}
    </>
  );
}

export default memo(AccountSwitcher);
