import { useEffect, useMemo, useState } from "react";
import {
  HStack,
  VStack,
  Text,
  Button,
  Checkbox,
  Image,
} from "@chakra-ui/react";
import { TimeIcon } from "@chakra-ui/icons";
import { blo } from "blo";

import type { Account } from "@/chrome/types";
import type { CompletedTransaction } from "@/chrome/txHistoryStorage";
import { truncateAddress } from "@/lib/addressUtils";
import { useThemedToast } from "@/hooks/useThemedToast";
import {
  EmptyState,
  EmptyStateDescription,
  EmptyStateHeader,
  EmptyStateMedia,
  EmptyStateTitle,
  ListItem,
  ListItemContent,
  ListItemDescription,
  ListItemMedia,
  ListItemMeta,
  ListItemTitle,
  ListSurface,
  SkeletonRow,
} from "@/components/ui";
import { SettingsScreenFrame } from "./SettingsScreenFrame";

interface Props {
  onBack: () => void;
}

function accountTypeLabel(account: Account): string {
  switch (account.type) {
    case "bankr":
      return "Bankr";
    case "privateKey":
      return "Private Key";
    case "seedPhrase":
      return `Seed · #${account.derivationIndex}`;
    case "impersonator":
      return "View-Only";
  }
}

function ClearTxHistoryScreen({ onBack }: Props) {
  const toast = useThemedToast();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [txCounts, setTxCounts] = useState<Map<string, number>>(new Map());
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      new Promise<Account[]>((resolve) => {
        chrome.runtime.sendMessage({ type: "getAccounts" }, (resp) => {
          resolve(Array.isArray(resp) ? (resp as Account[]) : []);
        });
      }),
      new Promise<CompletedTransaction[]>((resolve) => {
        chrome.runtime.sendMessage({ type: "getTxHistory" }, (resp) => {
          resolve(Array.isArray(resp) ? (resp as CompletedTransaction[]) : []);
        });
      }),
    ]).then(([accs, history]) => {
      if (cancelled) return;
      const counts = new Map<string, number>();
      for (const tx of history) {
        const addr = tx.tx.from.toLowerCase();
        counts.set(addr, (counts.get(addr) ?? 0) + 1);
      }
      setAccounts(accs);
      setTxCounts(counts);
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const allIds = useMemo(() => accounts.map((a) => a.id), [accounts]);
  const allSelected =
    accounts.length > 0 && selectedIds.size === accounts.length;
  const someSelected = selectedIds.size > 0 && !allSelected;

  const toggleOne = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (allSelected) setSelectedIds(new Set());
    else setSelectedIds(new Set(allIds));
  };

  const handleDelete = () => {
    if (selectedIds.size === 0) return;
    setSubmitting(true);

    const selectedAccounts = accounts.filter((a) => selectedIds.has(a.id));
    const totalCleared = selectedAccounts.reduce(
      (sum, a) => sum + (txCounts.get(a.address.toLowerCase()) ?? 0),
      0,
    );

    // When every account is selected, fall back to the full-wipe path so
    // orphaned history (txs whose sender no longer maps to any account) is
    // also removed. Otherwise filter by the chosen sender addresses.
    const message = allSelected
      ? { type: "clearTxHistory" }
      : {
          type: "clearTxHistoryForAddresses",
          addresses: selectedAccounts.map((a) => a.address),
        };

    chrome.runtime.sendMessage(message, () => {
      setSubmitting(false);
      toast({
        title:
          totalCleared > 0
            ? `Cleared ${totalCleared} transaction${totalCleared === 1 ? "" : "s"}`
            : "Transaction history cleared",
        status: "success",
        duration: 2000,
        isClosable: true,
      });
      onBack();
    });
  };

  return (
    <SettingsScreenFrame
      title="Clear transaction history"
      onBack={() => {
        if (!submitting) onBack();
      }}
      primaryAction={
        <Button
          variant="danger"
          onClick={handleDelete}
          isDisabled={selectedIds.size === 0 || loading}
          isLoading={submitting}
          loadingText="Deleting..."
        >
          {selectedIds.size > 0
            ? `Clear history for ${selectedIds.size} account${selectedIds.size === 1 ? "" : "s"}`
            : "Clear history"}
        </Button>
      }
    >
      <VStack spacing={5} align="stretch">
        <Text fontSize="sm" color="fg.secondary" lineHeight="1.5">
          Select the accounts whose local activity you want to delete. This
          does not affect transactions onchain and cannot be undone.
        </Text>

        {loading ? (
          <ListSurface aria-label="Loading accounts">
            <SkeletonRow />
            <SkeletonRow />
            <SkeletonRow />
          </ListSurface>
        ) : accounts.length === 0 ? (
          <EmptyState>
            <EmptyStateMedia>
              <TimeIcon boxSize={6} />
            </EmptyStateMedia>
            <EmptyStateHeader>
              <EmptyStateTitle>No accounts found</EmptyStateTitle>
              <EmptyStateDescription>
                Add an account before managing its transaction history.
              </EmptyStateDescription>
            </EmptyStateHeader>
          </EmptyState>
        ) : (
          <ListSurface aria-label="Accounts with transaction history">
            <ListItem density="compact" bg="surface.sunken">
              <Checkbox
                isChecked={allSelected}
                isIndeterminate={someSelected}
                onChange={toggleAll}
                flex="1"
              >
                <HStack w="full" justify="space-between" spacing={3}>
                  <Text fontSize="sm" fontWeight="600">
                    Select all accounts
                  </Text>
                  <Text fontSize="xs" color="fg.muted" sx={{ fontVariantNumeric: "tabular-nums" }}>
                    {selectedIds.size}/{accounts.length}
                  </Text>
                </HStack>
              </Checkbox>
            </ListItem>

            {accounts.map((account) => {
              const checked = selectedIds.has(account.id);
              const count = txCounts.get(account.address.toLowerCase()) ?? 0;
              const primary = account.displayName || truncateAddress(account.address);
              const showAddrLine = !!account.displayName;
              const blockieSrc = blo(account.address as `0x${string}`);

              return (
                <ListItem key={account.id} isSelected={checked}>
                  <Checkbox
                    aria-label={`Select ${primary}`}
                    isChecked={checked}
                    onChange={() => toggleOne(account.id)}
                  />
                  <ListItemMedia>
                    <Image
                      src={blockieSrc}
                      alt=""
                      w="32px"
                      h="32px"
                      minW="32px"
                      borderRadius="md"
                    />
                  </ListItemMedia>
                  <ListItemContent>
                    <ListItemTitle
                      fontFamily={account.displayName ? undefined : "mono"}
                      noOfLines={1}
                      title={`${primary} · ${account.address}`}
                    >
                      {primary}
                    </ListItemTitle>
                    <ListItemDescription noOfLines={1}>
                      {accountTypeLabel(account)}
                      {showAddrLine ? ` · ${truncateAddress(account.address)}` : ""}
                    </ListItemDescription>
                  </ListItemContent>
                  <ListItemMeta whiteSpace="nowrap">
                    {count} tx
                  </ListItemMeta>
                </ListItem>
              );
            })}
          </ListSurface>
        )}
      </VStack>
    </SettingsScreenFrame>
  );
}

export default ClearTxHistoryScreen;
