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
  /** When provided, the parent owns screen-level transaction detail navigation. */
  onSelectTx?: (tx: CompletedTransaction) => void;
  /** Opens the same full-screen detail route used by ordinary transactions. */
  onSelectUnshield?: (operation: UnshieldOperation) => void;
  scope?: "public" | "private";
  unshieldOperations?: readonly UnshieldOperation[];
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
  onSelectTx,
  onSelectUnshield,
  scope = "public",
  unshieldOperations = [],
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

  const addressFiltered = scope === "private" || !address
    ? allHistory
    : allHistory.filter(
        (tx) => tx.tx.from.toLowerCase() === address.toLowerCase(),
      );
  const history =
    scope === "public" && filterChainId != null
      ? addressFiltered.filter((tx) => tx.chainId === filterChainId)
      : addressFiltered;
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
  const displayItems = hideHeader || isExpanded
    ? entries
    : entries.slice(0, maxItems);
  const hasMore = !hideHeader && entries.length > maxItems;
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
      {isExpanded ? "Show less" : `Show all ${entries.length}`}
    </Button>
  );

  if (entries.length === 0) {
    return (
      <Box pt={hideCard ? 0 : 4}>
        <EmptyState minH="152px">
          <EmptyStateHeader>
            <EmptyStateTitle>No activity yet</EmptyStateTitle>
            <EmptyStateDescription>
              {scope === "private"
                ? "Shield and Unshield activity will appear here."
                : "Transactions from this account will appear here."}
            </EmptyStateDescription>
          </EmptyStateHeader>
          {scope === "public" && filterChainId != null && onShowAllNetworks ? (
            <EmptyStateActions>
              <Button variant="secondary" onClick={onShowAllNetworks}>
                View all networks
              </Button>
            </EmptyStateActions>
          ) : null}
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
            <Box
              as="li"
              role="presentation"
              minH="36px"
              px={3}
              py={2}
              listStyleType="none"
              bg="surface.sunken"
              borderTopWidth="1px"
              borderTopStyle="solid"
              borderTopColor="border.subtle"
              borderBottomWidth="1px"
              borderBottomStyle="solid"
              borderBottomColor="border.subtle"
              _first={{ borderTopWidth: 0 }}
            >
              <Text
                fontSize="xs"
                fontWeight="600"
                color="fg.secondary"
                lineHeight="1.4"
              >
                {group.label}
              </Text>
            </Box>
              {group.txs.map((entry) => entry.kind === "transaction" ? (
                <ActivityItem
                  key={`tx-${entry.tx.id}`}
                  tx={entry.tx}
                  originDisplay={formatOrigin(entry.tx.origin)}
                  addressLabels={addressLabels}
                  onClick={() => {
                    if (onSelectTx) onSelectTx(entry.tx);
                    else setSelectedTx(entry.tx);
                  }}
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
      </ListSurface>

      {modal}
    </Box>
  );
}

export default memo(TxStatusList);
