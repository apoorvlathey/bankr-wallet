import { ChevronDownIcon, ChevronUpIcon } from "@chakra-ui/icons";
import { Box, Button, HStack, Text } from "@chakra-ui/react";
import { Fragment, memo, useEffect, useMemo, useRef, useState } from "react";
import type { CompletedTransaction } from "@/chrome/txHistoryStorage";
import type { Account } from "@/chrome/types";
import TxDetailModal from "@/components/TxDetailModal";
import {
  EmptyState,
  EmptyStateActions,
  EmptyStateDescription,
  EmptyStateHeader,
  EmptyStateTitle,
  ListSurface,
} from "@/components/ui";
import { useCachedAvatarMap } from "@/hooks/useCachedAvatarSrc";
import { useAddressContacts } from "@/hooks/useAddressContacts";
import { useDappOriginFormatter } from "@/hooks/useDappOriginDisplay";
import ActivityItem from "./ActivityItem";
import { ActivityDateHeader } from "./ActivityDateHeader";
import { buildActivityAddressLabels } from "./activityIdentityModel";
import { groupActivityByDate } from "./activityModel";

interface ActivityListProps {
  maxItems?: number;
  address?: string;
  accounts?: Account[];
  hideHeader?: boolean;
  hideCard?: boolean;
  filterChainId?: number | null;
  onShowAllNetworks?: () => void;
  hideEmptyState?: boolean;
  /** When provided, the parent owns screen-level transaction detail navigation. */
  onSelectTx?: (tx: CompletedTransaction) => void;
}

function TxStatusList({
  maxItems = 5,
  address,
  accounts = [],
  hideHeader,
  hideCard,
  filterChainId,
  onShowAllNetworks,
  hideEmptyState = false,
  onSelectTx,
}: ActivityListProps) {
  const [allHistory, setAllHistory] = useState<CompletedTransaction[]>([]);
  const [isExpanded, setIsExpanded] = useState(false);
  const [selectedTx, setSelectedTx] = useState<CompletedTransaction | null>(
    null,
  );
  const { contacts } = useAddressContacts();
  const formatOrigin = useDappOriginFormatter();
  const addressLabels = useMemo(
    () => buildActivityAddressLabels(accounts, contacts),
    [accounts, contacts],
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
  const displayItems = hideHeader || isExpanded
    ? history
    : history.slice(0, maxItems);
  const hasMore = !hideHeader && history.length > maxItems;
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
    url ? cachedLogoMap.get(url) : undefined;

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
    if (hideEmptyState) return <>{modal}</>;
    return (
      <Box pt={hideCard ? 0 : 4}>
        <EmptyState minH="152px">
          <EmptyStateHeader>
            <EmptyStateTitle>No activity yet</EmptyStateTitle>
            <EmptyStateDescription>
              Transactions from this account will appear here.
            </EmptyStateDescription>
          </EmptyStateHeader>
          {filterChainId != null && onShowAllNetworks && (
            <EmptyStateActions>
              <Button variant="secondary" onClick={onShowAllNetworks}>
                View all networks
              </Button>
            </EmptyStateActions>
          )}
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

      <ListSurface aria-label="Transaction activity">
        {dateGroups.map((group) => (
          <Fragment key={group.label}>
            <ActivityDateHeader label={group.label} />
            {group.txs.map((tx) => (
              <ActivityItem
                key={tx.id}
                tx={tx}
                originDisplay={formatOrigin(tx.origin)}
                addressLabels={addressLabels}
                onClick={() => {
                  if (onSelectTx) onSelectTx(tx);
                  else setSelectedTx(tx);
                }}
                resolveLogo={resolveLogo}
              />
            ))}
          </Fragment>
        ))}
      </ListSurface>

      {modal}
    </Box>
  );
}

export default memo(TxStatusList);
