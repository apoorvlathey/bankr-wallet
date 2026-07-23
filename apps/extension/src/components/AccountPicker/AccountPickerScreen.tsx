import { useEffect, useMemo, useRef, useState } from "react";
import { AddIcon, ExternalLinkIcon, SettingsIcon } from "@chakra-ui/icons";
import { Flex, IconButton, Text } from "@chakra-ui/react";

import type { Account } from "@/chrome/types";
import { AccountPickerRow } from "@/components/AccountPickerRow";
import { CopyButton } from "@/components/CopyButton";
import SortableAccountPickerRows, {
  type SortableRenderState,
} from "@/components/SortableAccountPickerRows";
import { getDefaultAccountExplorerUrl } from "@/components/accountExplorerUtils";
import { getWalletTypeLabel } from "@/components/accountIdentityLabels";
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

export interface AccountPickerScreenProps {
  accounts: Account[];
  activeAccount: Account | null;
  title: string;
  onBack: () => void;
  onAccountSelect?: (account: Account) => void;
  onAccountSettings: (account: Account) => void;
  onAddAccount: () => void;
  onAccountsReordered?: (accounts: Account[]) => void;
  mode?: "select" | "manage";
}

/** Shared account browser. Select mode changes accounts; manage mode opens account settings. */
export default function AccountPickerScreen({
  accounts,
  activeAccount,
  title,
  onBack,
  onAccountSelect,
  onAccountSettings,
  onAddAccount,
  onAccountsReordered,
  mode = "select",
}: AccountPickerScreenProps) {
  const [query, setQuery] = useState("");
  const [reorderError, setReorderError] = useState<string | null>(null);
  const pickerRef = useRef<HTMLDivElement>(null);
  const activeAccountRowRef = useRef<HTMLElement | null>(null);
  const seedGroupMap = useSeedGroupMap(accounts);
  const {
    identities,
    getContactLabel,
    getDisplayName,
    getEnsAvatar,
    getSecondaryIdentity,
  } = useAccountIdentityLabels(accounts);

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

  useEffect(() => {
    const focusFrame = requestAnimationFrame(() => {
      pickerRef.current
        ?.querySelector<HTMLElement>("[data-screen-heading]")
        ?.focus();
      activeAccountRowRef.current?.scrollIntoView({
        block: "start",
        inline: "nearest",
      });
    });

    return () => {
      cancelAnimationFrame(focusFrame);
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onBack();
      }
    };
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onBack]);

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

  const openAccount = (account: Account) => {
    if (mode === "manage") onAccountSettings(account);
    else onAccountSelect?.(account);
  };

  const renderAccountRow = (
    account: Account,
    sortableState?: SortableRenderState,
  ) => {
    const isActive = account.id === activeAccount?.id;
    const explorerHref = getDefaultAccountExplorerUrl(account.address);

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
        secondaryIdentity={getSecondaryIdentity(account)}
        walletTypeLabel={getWalletTypeLabel(account, seedGroupMap)}
        isSelected={isActive}
        isDragging={sortableState?.isDragging}
        style={sortableState?.style}
        leadingAction={sortableState?.dragHandle}
        onSelect={() => openAccount(account)}
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
            {mode === "select" && (
              <IconButton
                aria-label={`Settings for ${getDisplayName(account)}`}
                icon={<SettingsIcon />}
                size="xs"
                variant="ghost"
                onClick={() => onAccountSettings(account)}
              />
            )}
          </>
        }
      />
    );
  };

  return (
    <FullScreenPicker
      ref={pickerRef}
      title={title}
      onBack={onBack}
      trailing={
        <IconButton
          aria-label="Add account"
          icon={<AddIcon boxSize={4} />}
          variant="ghost"
          minW="44px"
          w="44px"
          h="44px"
          color="fg.secondary"
          onClick={onAddAccount}
          _hover={{ color: "accent.highlight", bg: "surface.raisedHover" }}
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
        <ListItem interactive onClick={onAddAccount}>
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
        </ListItem>
      </FullScreenPickerGroup>
    </FullScreenPicker>
  );
}
