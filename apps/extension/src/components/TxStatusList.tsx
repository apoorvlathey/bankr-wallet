import { useState, useEffect, useRef, memo } from "react";
import {
  Box,
  VStack,
  HStack,
  Text,
  Spinner,
  Image,
  IconButton,
} from "@chakra-ui/react";
import {
  WarningIcon,
  ExternalLinkIcon,
  ChevronDownIcon,
  ChevronUpIcon,
} from "@chakra-ui/icons";
import { CompletedTransaction } from "@/chrome/txHistoryStorage";
import { getChainConfig } from "@/constants/chainConfig";
import TxDetailModal from "@/components/TxDetailModal";
import { googleFaviconUrl } from "@/constants/externalUrls";

interface TxStatusListProps {
  maxItems?: number;
  address?: string;
  hideHeader?: boolean;
  hideCard?: boolean;
}

/** Group transactions by date label */
function groupByDate(
  txs: CompletedTransaction[],
): { label: string; txs: CompletedTransaction[] }[] {
  const groups: Map<string, CompletedTransaction[]> = new Map();

  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const fmt = (d: Date) => d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  const toDateKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

  const todayKey = toDateKey(today);
  const yesterdayKey = toDateKey(yesterday);

  for (const tx of txs) {
    const d = new Date(tx.createdAt);
    const key = toDateKey(d);
    let label: string;
    if (key === todayKey) label = "Today";
    else if (key === yesterdayKey) label = "Yesterday";
    else label = fmt(d);

    if (!groups.has(label)) groups.set(label, []);
    groups.get(label)!.push(tx);
  }

  return Array.from(groups.entries()).map(([label, txs]) => ({ label, txs }));
}

function TxStatusList({
  maxItems = 5,
  address,
  hideHeader,
  hideCard,
}: TxStatusListProps) {
  const [allHistory, setAllHistory] = useState<CompletedTransaction[]>([]);
  const [isExpanded, setIsExpanded] = useState(false);
  const [selectedTx, setSelectedTx] = useState<CompletedTransaction | null>(
    null,
  );

  // Load and listen for updates
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

  // Poll for pending tx receipts while UI is open
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

  const history = address
    ? allHistory.filter(
        (tx) => tx.tx.from.toLowerCase() === address.toLowerCase(),
      )
    : allHistory;

  const displayItems = isExpanded ? history : history.slice(0, maxItems);
  const hasMore = history.length > maxItems;
  const dateGroups = groupByDate(displayItems);

  const modal = selectedTx && (
    <TxDetailModal
      isOpen={!!selectedTx}
      onClose={() => setSelectedTx(null)}
      tx={selectedTx}
    />
  );

  const expandButton = hasMore && (
    <IconButton
      aria-label={isExpanded ? "Show less" : "Show more"}
      icon={isExpanded ? <ChevronUpIcon /> : <ChevronDownIcon />}
      size="xs"
      variant="ghost"
      onClick={() => setIsExpanded(!isExpanded)}
    />
  );

  if (history.length === 0) {
    return (
      <Box pt={hideCard ? 0 : 4}>
        <Box p={4} textAlign="center">
          <Text fontSize="sm" color="text.tertiary" fontWeight="500">
            No recent transactions
          </Text>
        </Box>
        {modal}
      </Box>
    );
  }

  return (
    <Box pt={hideCard ? 0 : 4}>
      {!hideHeader && (
        <HStack justify="space-between" mb={2}>
          <Text
            fontSize="sm"
            fontWeight="900"
            color="text.primary"
            textTransform="uppercase"
            letterSpacing="wider"
          >
            Activity
          </Text>
          {expandButton}
        </HStack>
      )}

      <VStack spacing={0} align="stretch">
        {dateGroups.map((group) => (
          <Box key={group.label}>
            <Text
              fontSize="2xs"
              fontWeight="700"
              color="text.tertiary"
              textTransform="uppercase"
              letterSpacing="wider"
              px={1}
              pt={2}
              pb={1}
            >
              {group.label}
            </Text>
            {group.txs.map((tx) => (
              <TxStatusItem
                key={tx.id}
                tx={tx}
                onClick={() => setSelectedTx(tx)}
              />
            ))}
          </Box>
        ))}
      </VStack>

      {modal}
    </Box>
  );
}

function getOriginHostname(origin: string): string | null {
  try {
    return new URL(origin).hostname;
  } catch {
    return null;
  }
}

function formatTimeAgo(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function TxStatusItem({
  tx,
  onClick,
}: {
  tx: CompletedTransaction;
  onClick: () => void;
}) {
  const config = getChainConfig(tx.chainId);
  const originHostname = getOriginHostname(tx.origin);

  const handleViewTx = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (tx.txHash && config.explorer) {
      const hash = tx.txHash.match(/0x[a-fA-F0-9]{64}/)?.[0];
      if (hash) {
        chrome.tabs.create({ url: `${config.explorer}/tx/${hash}` });
      }
    }
  };

  const statusElement = (() => {
    switch (tx.status) {
      case "processing":
        return (
          <HStack spacing={1}>
            <Spinner size="xs" color="bauhaus.blue" />
            <Text fontSize="xs" color="bauhaus.blue" fontWeight="600">
              Processing
            </Text>
          </HStack>
        );
      case "pending":
        return (
          <HStack spacing={1}>
            <Spinner size="xs" color="bauhaus.blue" />
            <Text fontSize="xs" color="bauhaus.blue" fontWeight="600">
              Pending...
            </Text>
          </HStack>
        );
      case "success":
        return (
          <Text fontSize="2xs" color="green.500" fontWeight="600">
            Confirmed
          </Text>
        );
      case "failed":
        return (
          <HStack spacing={1}>
            <WarningIcon boxSize={2.5} color="bauhaus.red" />
            <Text fontSize="xs" color="bauhaus.red" fontWeight="600">
              Failed
            </Text>
          </HStack>
        );
    }
  })();

  return (
    <Box
      py={2.5}
      px={1}
      cursor="pointer"
      onClick={onClick}
      _hover={{ bg: "blackAlpha.50" }}
      borderBottom="1px solid"
      borderColor="gray.100"
      transition="background 0.15s"
    >
      <HStack spacing={3} align="center">
        {/* Icon area */}
        {tx.swapMeta ? (
          /* Swap: overlapping sell→buy token icons with chain badge */
          <Box position="relative" flexShrink={0} w="42px" h="36px">
            {/* Sell token (back) */}
            <Box
              position="absolute"
              left={0}
              top={0}
              bg="gray.100"
              borderRadius="full"
              w="28px"
              h="28px"
              display="flex"
              alignItems="center"
              justifyContent="center"
              overflow="hidden"
              border="2px solid white"
              zIndex={1}
            >
              {tx.swapMeta.sellTokenLogo ? (
                <Image src={tx.swapMeta.sellTokenLogo} alt={tx.swapMeta.sellTokenSymbol} boxSize="20px" />
              ) : (
                <Text fontSize="2xs" fontWeight="700">{tx.swapMeta.sellTokenSymbol.slice(0, 2)}</Text>
              )}
            </Box>
            {/* Buy token (front, overlapping) */}
            <Box
              position="absolute"
              left="14px"
              top={0}
              bg="gray.100"
              borderRadius="full"
              w="28px"
              h="28px"
              display="flex"
              alignItems="center"
              justifyContent="center"
              overflow="hidden"
              border="2px solid white"
              zIndex={2}
            >
              {tx.swapMeta.buyTokenLogo ? (
                <Image src={tx.swapMeta.buyTokenLogo} alt={tx.swapMeta.buyTokenSymbol} boxSize="20px" />
              ) : (
                <Text fontSize="2xs" fontWeight="700">{tx.swapMeta.buyTokenSymbol.slice(0, 2)}</Text>
              )}
            </Box>
            {/* Chain icon */}
            {config.icon && (
              <Box
                position="absolute"
                bottom="-2px"
                right="-2px"
                w="16px"
                h="16px"
                borderRadius="full"
                bg="white"
                border="1.5px solid"
                borderColor="gray.200"
                display="flex"
                alignItems="center"
                justifyContent="center"
                zIndex={3}
              >
                <Image src={config.icon} alt={tx.chainName} boxSize="11px" />
              </Box>
            )}
          </Box>
        ) : (
          /* Standard: single favicon with chain icon overlay */
          <Box position="relative" flexShrink={0} w="36px" h="36px">
            <Box
              bg="gray.100"
              borderRadius="full"
              w="36px"
              h="36px"
              display="flex"
              alignItems="center"
              justifyContent="center"
              overflow="hidden"
            >
              <Image
                src={
                  tx.origin === "WalletChan" || tx.origin === "BankrWallet"
                    ? "/walletchan-icon.png"
                    : tx.favicon ||
                      (originHostname
                        ? googleFaviconUrl(originHostname)
                        : undefined)
                }
                alt="favicon"
                boxSize="22px"
                onError={(e) => {
                  const target = e.target as HTMLImageElement;
                  if (originHostname) {
                    target.src = googleFaviconUrl(originHostname);
                  }
                }}
              />
            </Box>
            {/* Chain icon overlay */}
            {config.icon && (
              <Box
                position="absolute"
                bottom="-2px"
                right="-2px"
                w="16px"
                h="16px"
                borderRadius="full"
                bg="white"
                border="1.5px solid"
                borderColor="gray.200"
                display="flex"
                alignItems="center"
                justifyContent="center"
              >
                <Image src={config.icon} alt={tx.chainName} boxSize="11px" />
              </Box>
            )}
          </Box>
        )}

        {/* Content */}
        <Box flex={1} minW={0}>
          {/* Row 1: hostname + time */}
          <HStack justify="space-between" spacing={2}>
            <Text
              fontSize="sm"
              fontWeight="600"
              color="text.primary"
              noOfLines={1}
            >
              {originHostname || tx.origin}
            </Text>
            <Text
              fontSize="2xs"
              color="text.tertiary"
              fontWeight="500"
              flexShrink={0}
            >
              {formatTimeAgo(tx.createdAt)}
            </Text>
          </HStack>

          {/* Row 2: function + status + explorer */}
          <HStack justify="space-between" spacing={2} mt={0.5}>
            {tx.functionName ? (
              <Text
                fontSize="xs"
                color="text.tertiary"
                fontFamily="mono"
                noOfLines={1}
              >
                {tx.functionName}
              </Text>
            ) : (
              <Box />
            )}
            <HStack spacing={1} flexShrink={0}>
              {statusElement}
              {tx.txHash &&
                config.explorer && (
                  <ExternalLinkIcon
                    boxSize={2.5}
                    color="text.tertiary"
                    cursor="pointer"
                    onClick={handleViewTx}
                    _hover={{ color: "bauhaus.blue" }}
                  />
                )}
            </HStack>
          </HStack>
        </Box>
      </HStack>

      {/* Error message for failed txs */}
      {tx.status === "failed" && tx.error && (
        <Text
          fontSize="2xs"
          color="text.tertiary"
          noOfLines={1}
          mt={1}
          ml="48px"
        >
          {tx.error}
        </Text>
      )}
    </Box>
  );
}

export default memo(TxStatusList);
