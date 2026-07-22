import { Box, Button, HStack, Text } from "@chakra-ui/react";
import { Fragment, memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  CompletedTransaction,
  TxHistoryCursor,
  TxHistoryPage,
} from "@/chrome/txHistoryStorage";
import type { Account } from "@/chrome/types";
import TxDetailModal from "@/components/TxDetailModal";
import {
  EmptyState,
  EmptyStateActions,
  EmptyStateDescription,
  EmptyStateHeader,
  EmptyStateTitle,
  ListSurface,
  SkeletonRow,
} from "@/components/ui";
import { useCachedAvatarMap } from "@/hooks/useCachedAvatarSrc";
import { useAddressContacts } from "@/hooks/useAddressContacts";
import { useDappOriginFormatter } from "@/hooks/useDappOriginDisplay";
import ActivityItem from "./ActivityItem";
import { ActivityDateHeader } from "./ActivityDateHeader";
import { buildActivityAddressLabels } from "./activityIdentityModel";
import { groupActivityByDate } from "./activityModel";
import { isTransactionVisibleInActivityScope } from "./activityScopeModel";
import type { UnshieldOperation } from "@/components/Shield/model/unshield";
import UnshieldActivityItem from "./UnshieldActivityItem";
import { SHIELDED_ETH_CHAIN_ID } from "@/components/Shield/model/shieldedAsset";

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
  /** Activity remains mounted behind other portfolio tabs. */
  isActive?: boolean;
  /** Opens the same full-screen detail route used by ordinary transactions. */
  onSelectUnshield?: (operation: UnshieldOperation) => void;
  scope?: "public" | "private";
  unshieldOperations?: readonly UnshieldOperation[];
}

const PAGE_SIZE = 30;

function sendMessage<T>(message: unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response: T) => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve(response);
    });
  });
}

function mergeHistory(
  current: CompletedTransaction[],
  incoming: CompletedTransaction[],
): CompletedTransaction[] {
  const map = new Map(current.map((transaction) => [transaction.id, transaction]));
  for (const transaction of incoming) map.set(transaction.id, transaction);
  return [...map.values()].sort(
    (left, right) => right.createdAt - left.createdAt || right.id.localeCompare(left.id),
  );
}

type ActivityEntry =
  | { kind: "transaction"; createdAt: number; tx: CompletedTransaction }
  | { kind: "unshield"; createdAt: number; operation: UnshieldOperation };

const UNSHIELD_ACTIVITY_STATES = new Set<UnshieldOperation["state"]>([
  "awaiting_wallet_confirmation",
  "proof_preparing",
  "proof_verified",
  "submitting_to_relayer",
  "submission_unknown",
  "submitted",
  "public_confirmed",
  "private_balance_updated",
  "proof_failed",
  "relayer_rejected",
  "public_reverted",
  "nullifier_already_spent",
  "failed_recoverable",
  "failed_needs_support",
]);

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
  isActive = true,
  onSelectUnshield,
  scope = "public",
  unshieldOperations = [],
}: ActivityListProps) {
  const [history, setHistory] = useState<CompletedTransaction[]>([]);
  const [cursor, setCursor] = useState<TxHistoryCursor | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedTx, setSelectedTx] = useState<CompletedTransaction | null>(null);
  const sentinelRef = useRef<HTMLLIElement | null>(null);
  const requestGeneration = useRef(0);
  const { contacts } = useAddressContacts();
  const formatOrigin = useDappOriginFormatter();
  const addressLabels = useMemo(
    () => buildActivityAddressLabels(accounts, contacts),
    [accounts, contacts],
  );

  const requestPage = useCallback(
    async (nextCursor: TxHistoryCursor | null, append: boolean) => {
      const generation = requestGeneration.current;
      append ? setLoadingMore(true) : setLoading(true);
      setError(null);
      try {
        const page = await sendMessage<TxHistoryPage>({
          type: "getTxHistoryPage",
          ownerAddress: scope === "public" ? address : undefined,
          chainId: scope === "public" ? filterChainId : undefined,
          cursor: nextCursor,
          limit: hideHeader || scope === "private" ? PAGE_SIZE : maxItems,
        });
        if (generation !== requestGeneration.current) return;
        setHistory((current) => append ? mergeHistory(current, page.items) : page.items);
        setCursor(page.nextCursor);
        setHasMore(hideHeader ? page.hasMore : false);
      } catch (cause) {
        if (generation !== requestGeneration.current) return;
        setError(cause instanceof Error ? cause.message : "Could not load activity");
      } finally {
        if (generation === requestGeneration.current) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [address, filterChainId, hideHeader, maxItems, scope],
  );

  useEffect(() => {
    requestGeneration.current += 1;
    setHistory([]);
    setCursor(null);
    setHasMore(false);
    void requestPage(null, false);
  }, [requestPage]);

  useEffect(() => {
    const handleMessage = (message: {
      type?: string;
      txId?: string;
      ownerAddress?: string;
      chainId?: number;
    }) => {
      if (message.type !== "txHistoryUpdated") return;
      if (scope === "public" && address && message.ownerAddress && message.ownerAddress !== address.toLowerCase()) return;
      if (scope === "public" && filterChainId != null && message.chainId != null && message.chainId !== filterChainId) return;
      if (!message.txId) {
        void requestPage(null, false);
        return;
      }
      void sendMessage<CompletedTransaction | null>({
        type: "getTxHistoryItem",
        txId: message.txId,
      }).then((fresh) => {
        if (!fresh) return;
        setHistory((current) => mergeHistory(current, [fresh]));
        setSelectedTx((selected) => selected?.id === fresh.id ? fresh : selected);
      });
    };
    chrome.runtime.onMessage.addListener(handleMessage);
    return () => chrome.runtime.onMessage.removeListener(handleMessage);
  }, [address, filterChainId, requestPage, scope]);

  useEffect(() => {
    if (!isActive || !hideHeader || !hasMore || loadingMore || !sentinelRef.current) return;
    const sentinel = sentinelRef.current;
    const scrollOwner = sentinel.closest("[data-screen-scroll-owner]");
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting) && cursor) {
          void requestPage(cursor, true);
        }
      },
      { root: scrollOwner instanceof Element ? scrollOwner : null, rootMargin: "160px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [cursor, hasMore, hideHeader, isActive, loadingMore, requestPage]);

  const historyRef = useRef(history);
  historyRef.current = history;
  const hasPending = history.some((tx) => tx.status === "pending");
  useEffect(() => {
    if (!isActive || !hasPending) return;
    const check = () => {
      for (const tx of historyRef.current) {
        if (tx.status !== "pending" || !tx.txHash) continue;
        chrome.runtime.sendMessage({
          type: "checkPendingTxReceipt",
          txId: tx.id,
          txHash: tx.txHash,
          chainId: tx.chainId,
        });
      }
    };
    check();
    const interval = setInterval(check, 5_000);
    return () => clearInterval(interval);
  }, [hasPending, isActive]);

  const transactionEntries: ActivityEntry[] = history
    .filter((tx) => isTransactionVisibleInActivityScope(tx, scope))
    .map((tx) => ({ kind: "transaction", createdAt: tx.createdAt, tx }));
  const unshieldEntries: ActivityEntry[] = (
    scope !== "private" || (filterChainId != null && filterChainId !== SHIELDED_ETH_CHAIN_ID)
      ? []
      : unshieldOperations.filter((operation) =>
          UNSHIELD_ACTIVITY_STATES.has(operation.state),
        )
  ).map((operation) => ({
    kind: "unshield",
    createdAt: operation.createdAt,
    operation,
  }));
  const entries = [...transactionEntries, ...unshieldEntries]
    .sort((left, right) => right.createdAt - left.createdAt);
  const displayItems = hideHeader ? entries : entries.slice(0, maxItems);
  const dateGroups = groupActivityByDate(displayItems, new Date());
  const cachedLogoMap = useCachedAvatarMap(
    useMemo(() => {
      const urls: Array<string | null | undefined> = [];
      for (const entry of displayItems) {
        if (entry.kind !== "transaction") continue;
        const tx = entry.tx;
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
  const openTransaction = (transaction: CompletedTransaction) => {
    void sendMessage<CompletedTransaction | null>({
      type: "getTxHistoryItem",
      txId: transaction.id,
    })
      .then((hydrated) => {
        const selected = hydrated ?? transaction;
        if (onSelectTx) onSelectTx(selected);
        else setSelectedTx(selected);
      })
      .catch(() => {
        if (onSelectTx) onSelectTx(transaction);
        else setSelectedTx(transaction);
      });
  };

  const modal = !onSelectTx && selectedTx && (
    <TxDetailModal isOpen onClose={() => setSelectedTx(null)} tx={selectedTx} />
  );

  if (loading && entries.length === 0) {
    return (
      <Box pt={hideCard ? 0 : 4}>
        <ListSurface aria-label="Loading transaction activity">
          <SkeletonRow /><SkeletonRow /><SkeletonRow />
        </ListSurface>
      </Box>
    );
  }

  if (entries.length === 0) {
    if (hideEmptyState) return <>{modal}</>;
    return (
      <Box pt={hideCard ? 0 : 4}>
        <EmptyState minH="152px">
          <EmptyStateHeader>
            <EmptyStateTitle>{error ? "Activity unavailable" : "No activity yet"}</EmptyStateTitle>
            <EmptyStateDescription>
              {error || (scope === "private"
                ? "Shield and Unshield activity will appear here."
                : "Transactions from this account will appear here.")}
            </EmptyStateDescription>
          </EmptyStateHeader>
          <EmptyStateActions>
            {error && <Button variant="secondary" onClick={() => void requestPage(null, false)}>Retry</Button>}
            {!error && scope === "public" && filterChainId != null && onShowAllNetworks && (
              <Button variant="secondary" onClick={onShowAllNetworks}>View all networks</Button>
            )}
          </EmptyStateActions>
        </EmptyState>
        {modal}
      </Box>
    );
  }

  return (
    <Box pt={hideCard ? 0 : 4}>
      {!hideHeader && (
        <HStack justify="space-between" mb={2}>
          <Text fontSize="sm" fontWeight="600" color="fg.primary">Activity</Text>
        </HStack>
      )}
      <ListSurface aria-label="Transaction activity">
        {dateGroups.map((group) => (
          <Fragment key={group.label}>
            <ActivityDateHeader label={group.label} />
            {group.txs.map((entry) => entry.kind === "transaction" ? (
                <ActivityItem
                  key={`tx-${entry.tx.id}`}
                  tx={entry.tx}
                  originDisplay={formatOrigin(entry.tx.origin)}
                  addressLabels={addressLabels}
                  onClick={() => openTransaction(entry.tx)}
                  resolveLogo={resolveLogo}
                />
              ) : (
                <UnshieldActivityItem
                  key={`private-${entry.operation.id}`}
                  operation={entry.operation}
                  addressLabels={addressLabels}
                  onClick={() => onSelectUnshield?.(entry.operation)}
                />
            ))}
          </Fragment>
        ))}
        {loadingMore && <><SkeletonRow /><SkeletonRow /></>}
        {error && (
          <Box as="li" listStyleType="none" p={3} textAlign="center">
            <Button size="sm" variant="secondary" onClick={() => cursor && void requestPage(cursor, true)}>
              Retry loading activity
            </Button>
          </Box>
        )}
        {hasMore && !error && <Box ref={sentinelRef} as="li" h="1px" listStyleType="none" aria-hidden />}
      </ListSurface>
      {modal}
    </Box>
  );
}

export default memo(TxStatusList);
