import { ChevronDownIcon, ChevronUpIcon } from "@chakra-ui/icons";
import { Box, Button, HStack, Text, VStack } from "@chakra-ui/react";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import type { CompletedTransaction } from "@/chrome/txHistoryStorage";
import TxDetailModal from "@/components/TxDetailModal";
import {
  EmptyState,
  EmptyStateDescription,
  EmptyStateHeader,
  EmptyStateTitle,
  ListSurface,
} from "@/components/ui";
import { useCachedAvatarMap } from "@/hooks/useCachedAvatarSrc";
import ActivityItem from "./ActivityItem";
import { groupActivityByDate } from "./activityModel";

interface ActivityListProps {
  maxItems?: number;
  address?: string;
  hideHeader?: boolean;
  hideCard?: boolean;
  filterChainId?: number | null;
  /** When provided, the parent owns screen-level transaction detail navigation. */
  onSelectTx?: (tx: CompletedTransaction) => void;
}

function TxStatusList({
  maxItems = 5,
  address,
  hideHeader,
  hideCard,
  filterChainId,
  onSelectTx,
}: ActivityListProps) {
  const [allHistory, setAllHistory] = useState<CompletedTransaction[]>([]);
  const [isExpanded, setIsExpanded] = useState(false);
  const [selectedTx, setSelectedTx] = useState<CompletedTransaction | null>(
    null,
  );

  useEffect(() => {
    chrome.runtime.sendMessage({ type: "getTxHistory" }, (result) => {
      setAllHistory(result || []);
    });

    const handleMessage = (message: { type: string }) => {
      if (message.type === "txHistoryUpdated") {
        chrome.runtime.sendMessage({ type: "getTxHistory" }, (result) => {
          setAllHistory(result || []);
        });
      }
    };

    chrome.runtime.onMessage.addListener(handleMessage);
    return () => chrome.runtime.onMessage.removeListener(handleMessage);
  }, []);

  useEffect(() => {
    setSelectedTx((current) => {
      if (!current) return current;
      const fresh = allHistory.find((tx) => tx.id === current.id);
      if (!fresh || fresh === current) return current;
      return fresh;
    });
  }, [allHistory]);

  const allHistoryRef = useRef(allHistory);
  allHistoryRef.current = allHistory;
  const hasPending = allHistory.some((tx) => tx.status === "pending");

  useEffect(() => {
    if (!hasPending) return;

    const checkPendingReceipts = () => {
      const pendingTxs = allHistoryRef.current.filter(
        (tx) => tx.status === "pending" && tx.txHash,
      );
      for (const tx of pendingTxs) {
        chrome.runtime.sendMessage({
          type: "checkPendingTxReceipt",
          txId: tx.id,
          txHash: tx.txHash,
          chainId: tx.chainId,
        });
      }
    };

    checkPendingReceipts();
    const interval = setInterval(checkPendingReceipts, 5_000);
    return () => clearInterval(interval);
  }, [hasPending]);

  const addressFiltered = address
    ? allHistory.filter(
        (tx) => tx.tx.from.toLowerCase() === address.toLowerCase(),
      )
    : allHistory;
  const history =
    filterChainId != null
      ? addressFiltered.filter((tx) => tx.chainId === filterChainId)
      : addressFiltered;
  const displayItems = isExpanded ? history : history.slice(0, maxItems);
  const hasMore = history.length > maxItems;
  const dateGroups = groupActivityByDate(displayItems, new Date());

  const cachedLogoMap = useCachedAvatarMap(
    useMemo(() => {
      const urls: Array<string | null | undefined> = [];
      for (const tx of displayItems) {
        if (tx.swapMeta?.sellTokenLogo) urls.push(tx.swapMeta.sellTokenLogo);
        if (tx.swapMeta?.buyTokenLogo) urls.push(tx.swapMeta.buyTokenLogo);
        if (tx.clearSignedMeta?.tokenLogo) {
          urls.push(tx.clearSignedMeta.tokenLogo);
        }
      }
      return urls;
    }, [displayItems]),
  );
  const resolveLogo = (url: string | undefined): string | undefined =>
    (url && cachedLogoMap.get(url)) || url;

  const modal = !onSelectTx && selectedTx && (
    <TxDetailModal
      isOpen={!!selectedTx}
      onClose={() => setSelectedTx(null)}
      tx={selectedTx}
    />
  );
  const expandButton = hasMore && (
    <Button
      size="xs"
      variant="ghost"
      rightIcon={isExpanded ? <ChevronUpIcon /> : <ChevronDownIcon />}
      onClick={() => setIsExpanded(!isExpanded)}
    >
      {isExpanded ? "Show less" : `Show all ${history.length}`}
    </Button>
  );

  if (history.length === 0) {
    return (
      <Box pt={hideCard ? 0 : 4}>
        <EmptyState minH="152px">
          <EmptyStateHeader>
            <EmptyStateTitle>No activity yet</EmptyStateTitle>
            <EmptyStateDescription>
              Transactions from this account will appear here.
            </EmptyStateDescription>
          </EmptyStateHeader>
        </EmptyState>
        {modal}
      </Box>
    );
  }

  return (
    <Box pt={hideCard ? 0 : 4}>
      {!hideHeader && (
        <HStack justify="space-between" mb={2}>
          <Text fontSize="sm" fontWeight="600" color="fg.primary">
            Activity
          </Text>
          {expandButton}
        </HStack>
      )}

      <VStack spacing={4} align="stretch">
        {dateGroups.map((group) => (
          <Box as="section" key={group.label} aria-label={group.label}>
            <Text
              fontSize="xs"
              fontWeight="600"
              color="fg.secondary"
              px={1}
              mb={2}
            >
              {group.label}
            </Text>
            <ListSurface
              bg={hideCard ? "transparent" : "surface.raised"}
              borderWidth={hideCard ? 0 : "1px"}
            >
              {group.txs.map((tx) => (
                <ActivityItem
                  key={tx.id}
                  tx={tx}
                  onClick={() => {
                    if (onSelectTx) onSelectTx(tx);
                    else setSelectedTx(tx);
                  }}
                  resolveLogo={resolveLogo}
                  flush={hideCard}
                />
              ))}
            </ListSurface>
          </Box>
        ))}
      </VStack>

      {modal}
    </Box>
  );
}

export default memo(TxStatusList);
