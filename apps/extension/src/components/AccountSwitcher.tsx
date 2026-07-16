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
  Icon,
  IconButton,
  Text,
  VStack,
} from "@chakra-ui/react";
import {
  AddIcon,
  ChevronRightIcon,
  ExternalLinkIcon,
  SettingsIcon,
} from "@chakra-ui/icons";
import type { Account } from "@/chrome/types";
import { AccountAvatar } from "@/components/AccountIdentity";
import { AccountPickerRow } from "@/components/AccountPickerRow";
import AccountExplorerMenu from "@/components/AccountExplorerMenu";
import SortableAccountPickerRows, {
  type SortableRenderState,
} from "@/components/SortableAccountPickerRows";
import { getDefaultAccountExplorerUrl } from "@/components/accountExplorerUtils";
import { getWalletTypeLabel } from "@/components/accountIdentityLabels";
import { CopyButton } from "@/components/CopyButton";
import { FullScreenPickerLayer } from "@/components/FullScreenPickerLayer";
import MiddleTruncatedAddress from "@/components/MiddleTruncatedAddress";
import {
  FullScreenPicker,
  FullScreenPickerEmpty,
  FullScreenPickerGroup,
  FullScreenPickerSearch,
  ListItem,
  ListItemContent,
  ListItemDescription,
  ListItemMedia,
  ListItemTitle,
} from "@/components/ui";
import { useAccountIdentityLabels } from "@/hooks/useAccountIdentityLabels";
import { useSeedGroupMap } from "@/hooks/useSeedGroupMap";
import type { ResolvedChain } from "@/lib/chains";
interface AccountSwitcherProps {
  accounts: Account[];
  activeAccount: Account | null;
  explorerChains: ResolvedChain[];
  onAccountSelect: (account: Account) => void;
  onAddAccount: () => void;
  onAccountSettings: (account: Account) => void;
  onShowQr?: () => void;
  isPickerOpen?: boolean;
  onPickerOpenChange?: (isOpen: boolean) => void;
  onAccountsReordered?: (accounts: Account[]) => void;
}
const QrCodeIcon = () => (
  <Icon viewBox="0 0 24 24" boxSize="14px" aria-hidden="true">
    <path
      d="M3 3h6v6H3V3Zm12 0h6v6h-6V3ZM3 15h6v6H3v-6Zm12 0h2v2h-2v-2Zm4 0h2v2h-2v-2Zm-4 4h2v2h-2v-2Zm4 0h2v2h-2v-2Z"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinejoin="round"
    />
  </Icon>
);

function AccountSwitcher({
  accounts,
  activeAccount,
  explorerChains,
  onAccountSelect,
  onAddAccount,
  onAccountSettings,
  onShowQr,
  isPickerOpen: controlledPickerOpen,
  onPickerOpenChange,
  onAccountsReordered,
}: AccountSwitcherProps) {
  const [uncontrolledPickerOpen, setUncontrolledPickerOpen] = useState(false);
  const isPickerOpen = controlledPickerOpen ?? uncontrolledPickerOpen;
  const [query, setQuery] = useState("");
  const [reorderError, setReorderError] = useState<string | null>(null);
  const seedGroupMap = useSeedGroupMap(accounts);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);
  const activeAccountRowRef = useRef<HTMLElement | null>(null);
  const { identities, getContactLabel, getDisplayName, getEnsAvatar, getSecondaryIdentity } = useAccountIdentityLabels(accounts);

  const setPickerOpen = useCallback(
    (isOpen: boolean) => {
      if (controlledPickerOpen === undefined) {
        setUncontrolledPickerOpen(isOpen);
      }
      onPickerOpenChange?.(isOpen);
    },
    [controlledPickerOpen, onPickerOpenChange],
  );

  const normalizedQuery = query.trim().toLowerCase();
  const filteredAccounts = useMemo(() => {
    if (!normalizedQuery) return accounts;

    return accounts.filter((account) => {
      const identity = identities.get(account.address.toLowerCase());
      return [
        account.displayName,
        getContactLabel(account),
        identity?.name,
        account.address,
        getWalletTypeLabel(account, seedGroupMap),
      ].some((value) => value?.toLowerCase().includes(normalizedQuery));
    });
  }, [accounts, getContactLabel, identities, normalizedQuery, seedGroupMap]);

  const closePicker = useCallback((restoreFocus = true) => {
    setPickerOpen(false);
    setQuery("");
    if (restoreFocus) {
      requestAnimationFrame(() => triggerRef.current?.focus());
    }
  }, [setPickerOpen]);

  useEffect(() => {
    if (!isPickerOpen) return;

    const focusFrame = requestAnimationFrame(() => {
      pickerRef.current
        ?.querySelector<HTMLElement>("[data-screen-heading]")
        ?.focus();
      activeAccountRowRef.current?.scrollIntoView({
        block: "start",
        inline: "nearest",
      });
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
    getDefaultAccountExplorerUrl(account.address);

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

  const persistAccountOrder = async (accountIds: string[]) => {
    const response = await chrome.runtime.sendMessage({
      type: "reorderAccounts",
      accountIds,
    });
    if (!response?.success) {
      throw new Error(response?.error || "Failed to reorder accounts");
    }
    if (Array.isArray(response.accounts)) onAccountsReordered?.(response.accounts);
  };

  const renderAccountRow = (
    account: Account,
    sortableState?: SortableRenderState,
  ) => {
    const isActive = account.id === activeAccount?.id;
    const explorerHref = openExplorer(account);
    const secondaryIdentity = getSecondaryIdentity(account);

    return (
      <AccountPickerRow
        key={account.id}
        ref={(node) => {
          sortableState?.setNodeRef(node);
          if (isActive) activeAccountRowRef.current = node;
        }}
        account={account}
        displayName={getDisplayName(account)}
        ensAvatar={getEnsAvatar(account)}
        secondaryIdentity={secondaryIdentity}
        walletTypeLabel={getWalletTypeLabel(account, seedGroupMap)}
        isSelected={isActive}
        isDragging={sortableState?.isDragging}
        style={sortableState?.style}
        leadingAction={sortableState?.dragHandle}
        onSelect={() => selectAccount(account)}
        actions={
          <>
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
          </>
        }
      />
    );
  };

  return (
    <>
      <Flex
        w="full"
        minH="64px"
        position="relative"
        align="center"
        isolation="isolate"
      >
        <Button
          ref={triggerRef}
          aria-haspopup="listbox"
          aria-expanded={isPickerOpen}
          aria-label="Choose account"
          variant="ghost"
          position="absolute"
          inset={0}
          zIndex={0}
          w="full"
          h="full"
          p={0}
          borderRadius={0}
          _hover={{ bg: "surface.raisedHover" }}
          _active={{ bg: "surface.sunken" }}
          onClick={() => setPickerOpen(true)}
        />

        {activeAccount ? (
          <HStack
            position="relative"
            zIndex={1}
            w="full"
            minW={0}
            spacing={3}
            px={3}
            py={2.5}
            pointerEvents="none"
          >
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
              <HStack minW={0} spacing={0} pe={6} color="fg.secondary">
                <Flex
                  minW={0}
                  flex={1}
                >
                  <MiddleTruncatedAddress address={activeAccount.address} />
                </Flex>
                {onShowQr && (
                  <IconButton
                    aria-label="Show active address QR code"
                    icon={<QrCodeIcon />}
                    size="xs"
                    minW="24px"
                    w="24px"
                    h="24px"
                    variant="ghost"
                    pointerEvents="auto"
                    color="fg.secondary"
                    onClick={onShowQr}
                    _hover={{
                      color: "accent.highlight",
                      bg: "surface.raisedHover",
                    }}
                  />
                )}
                <Flex pointerEvents="auto" flexShrink={0}>
                  <CopyButton
                    value={activeAccount.address}
                    label="Copy active address"
                  />
                </Flex>
                <AccountExplorerMenu
                  address={activeAccount.address}
                  chains={explorerChains}
                />
              </HStack>
            </VStack>
            <ChevronRightIcon boxSize={5} color="fg.muted" flexShrink={0} />
          </HStack>
        ) : (
          <HStack
            position="relative"
            zIndex={1}
            w="full"
            justify="space-between"
            px={3}
            pointerEvents="none"
          >
            <Text color="fg.secondary" fontWeight="600">Choose account</Text>
            <ChevronRightIcon boxSize={5} color="fg.muted" />
          </HStack>
        )}
      </Flex>

      {isPickerOpen && (
        <FullScreenPickerLayer>
          <FullScreenPicker
            ref={pickerRef}
            title="Choose account"
            onBack={() => closePicker()}
            trailing={
              <IconButton
                aria-label="Add account"
                icon={<AddIcon boxSize={4} />}
                variant="ghost"
                minW="44px"
                w="44px"
                h="44px"
                color="fg.secondary"
                onClick={addAccount}
                _hover={{
                  color: "accent.highlight",
                  bg: "surface.raisedHover",
                }}
              />
            }
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
              <>
                {!normalizedQuery && accounts.length > 1 ? (
                  <SortableAccountPickerRows
                    accounts={accounts}
                    label="Accounts"
                    description={`${accounts.length} accounts · Drag the handle to reorder`}
                    getDisplayName={getDisplayName}
                    onReorder={persistAccountOrder}
                    onReorderError={setReorderError}
                    renderAccount={renderAccountRow}
                  />
                ) : (
                  <FullScreenPickerGroup
                    label="Accounts"
                    description={
                      normalizedQuery
                        ? `${filteredAccounts.length} of ${accounts.length} accounts`
                        : "1 account"
                    }
                  >
                    {filteredAccounts.map((account) => renderAccountRow(account))}
                  </FullScreenPickerGroup>
                )}
                {reorderError && (
                  <Text role="alert" mt={2} px={1} color="chart.negative" fontSize="sm">
                    {reorderError}
                  </Text>
                )}
              </>
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
