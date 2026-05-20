import { useEffect, useMemo, useState } from "react";
import {
  Box,
  HStack,
  VStack,
  Text,
  Button,
  Checkbox,
  Image,
  IconButton,
  Spacer,
  Spinner,
} from "@chakra-ui/react";
import { ArrowBackIcon } from "@chakra-ui/icons";
import { blo } from "blo";

import type { Account } from "@/chrome/types";
import type { CompletedTransaction } from "@/chrome/txHistoryStorage";
import { truncateAddress } from "@/lib/addressUtils";
import { useThemedToast } from "@/hooks/useThemedToast";

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
    <VStack spacing={4} align="stretch" flex="1">
      <HStack>
        <IconButton
          aria-label="Back"
          icon={<ArrowBackIcon />}
          variant="ghost"
          size="sm"
          onClick={onBack}
          isDisabled={submitting}
        />
        <Text
          fontSize="lg"
          fontWeight="900"
          color="text.primary"
          textTransform="uppercase"
          letterSpacing="tight"
        >
          Clear Transaction History
        </Text>
        <Spacer />
      </HStack>

      <Text fontSize="sm" color="text.secondary" fontWeight="500">
        Select the accounts whose transaction history you want to delete. This
        action cannot be undone.
      </Text>

      {loading ? (
        <HStack justify="center" py={6}>
          <Spinner size="md" color="accent.primary" />
        </HStack>
      ) : accounts.length === 0 ? (
        <Text fontSize="sm" color="text.tertiary" fontWeight="500" py={4}>
          No accounts found.
        </Text>
      ) : (
        <VStack spacing={2} align="stretch">
          <HStack
            bg="surface.sunken"
            border="2px solid"
            borderColor={allSelected ? "accent.primary" : "border.default"}
            borderRadius="md"
            px={3}
            py={2}
            spacing={3}
            cursor="pointer"
            onClick={toggleAll}
          >
            <Checkbox
              isChecked={allSelected}
              isIndeterminate={someSelected}
              onChange={toggleAll}
              pointerEvents="none"
            />
            <Text
              fontSize="sm"
              fontWeight="800"
              color="text.primary"
              textTransform="uppercase"
              letterSpacing="wide"
              flex={1}
            >
              Select all
            </Text>
            <Text fontSize="xs" color="text.tertiary" fontWeight="700">
              {selectedIds.size}/{accounts.length} selected
            </Text>
          </HStack>

          {accounts.map((account) => {
            const checked = selectedIds.has(account.id);
            const count = txCounts.get(account.address.toLowerCase()) ?? 0;
            const primary =
              account.displayName || truncateAddress(account.address);
            const showAddrLine = !!account.displayName;
            const blockieSrc = blo(account.address as `0x${string}`);
            return (
              <HStack
                key={account.id}
                bg="surface.raised"
                border="2px solid"
                borderColor={checked ? "accent.primary" : "border.default"}
                borderRadius="md"
                p={2.5}
                spacing={3}
                cursor="pointer"
                onClick={() => toggleOne(account.id)}
              >
                <Checkbox
                  isChecked={checked}
                  onChange={() => toggleOne(account.id)}
                  pointerEvents="none"
                />
                <Image
                  src={blockieSrc}
                  alt="Account avatar"
                  w="24px"
                  h="24px"
                  minW="24px"
                  borderRadius="sm"
                  border="2px solid"
                  borderColor="border.default"
                />
                <VStack align="start" spacing={0} flex={1} minW={0}>
                  <Text
                    fontSize="sm"
                    fontWeight="700"
                    color="text.primary"
                    fontFamily={account.displayName ? undefined : "mono"}
                    noOfLines={1}
                    title={`${primary} · ${account.address}`}
                  >
                    {primary}
                  </Text>
                  <HStack spacing={1.5} align="center">
                    <Text
                      fontSize="10px"
                      color="text.tertiary"
                      fontWeight="700"
                      textTransform="uppercase"
                      letterSpacing="wide"
                    >
                      {accountTypeLabel(account)}
                    </Text>
                    {showAddrLine && (
                      <Text
                        fontSize="10px"
                        color="text.tertiary"
                        fontFamily="mono"
                        fontWeight="600"
                      >
                        {truncateAddress(account.address)}
                      </Text>
                    )}
                  </HStack>
                </VStack>
                <HStack
                  spacing={1}
                  align="baseline"
                  bg={count > 0 ? "accent.secondary" : "surface.sunken"}
                  color={count > 0 ? "accentFg.secondary" : "text.tertiary"}
                  border="2px solid"
                  borderColor="border.default"
                  borderRadius="md"
                  px={2}
                  py={0.5}
                  flexShrink={0}
                >
                  <Text fontSize="md" fontWeight="900" lineHeight={1}>
                    {count}
                  </Text>
                  <Text
                    fontSize="9px"
                    fontWeight="800"
                    textTransform="uppercase"
                    letterSpacing="wide"
                    lineHeight={1}
                  >
                    txs
                  </Text>
                </HStack>
              </HStack>
            );
          })}
        </VStack>
      )}

      <Box
        mt="auto"
        position="sticky"
        bottom={0}
        bg="surface.base"
        pt={3}
        pb={2}
      >
        <Button
          variant="danger"
          w="full"
          onClick={handleDelete}
          isDisabled={selectedIds.size === 0 || loading}
          isLoading={submitting}
          loadingText="Deleting..."
        >
          {selectedIds.size > 0
            ? `Clear History for ${selectedIds.size} Account${selectedIds.size === 1 ? "" : "s"}`
            : "Clear History"}
        </Button>
      </Box>
    </VStack>
  );
}

export default ClearTxHistoryScreen;
