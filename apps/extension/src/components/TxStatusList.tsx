import { useState, useEffect, useMemo, useRef, memo } from "react";
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
import {
  CompletedTransaction,
  type ClearSignedMeta,
} from "@/chrome/txHistoryStorage";
import { getChainConfig } from "@/constants/chainConfig";
import { useNetworks } from "@/contexts/NetworksContext";
import { getResolvedChainById } from "@/lib/chains";
import TxDetailModal from "@/components/TxDetailModal";
import { googleFaviconUrl } from "@/constants/externalUrls";
import ChainIcon from "@/components/ChainIcon";
import { useIconChipBg, useTheme } from "@/theme";
import { useCachedAvatarMap } from "@/hooks/useCachedAvatarSrc";

interface TxStatusListProps {
  maxItems?: number;
  address?: string;
  hideHeader?: boolean;
  hideCard?: boolean;
  filterChainId?: number | null;
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
  filterChainId,
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

  const addressFiltered = address
    ? allHistory.filter(
        (tx) => tx.tx.from.toLowerCase() === address.toLowerCase(),
      )
    : allHistory;

  const history = filterChainId != null
    ? addressFiltered.filter((tx) => tx.chainId === filterChainId)
    : addressFiltered;

  const displayItems = isExpanded ? history : history.slice(0, maxItems);
  const hasMore = history.length > maxItems;
  const dateGroups = groupByDate(displayItems);

  // Batched logo cache for swap-history rows. Pre-warms the shared
  // ENS/token-logo data-URL cache so every row's pair of icons paints
  // synchronously from chrome.storage on reopen.
  const cachedLogoMap = useCachedAvatarMap(
    useMemo(() => {
      const urls: Array<string | null | undefined> = [];
      for (const tx of displayItems) {
        if (tx.swapMeta?.sellTokenLogo) urls.push(tx.swapMeta.sellTokenLogo);
        if (tx.swapMeta?.buyTokenLogo) urls.push(tx.swapMeta.buyTokenLogo);
        if (tx.clearSignedMeta?.tokenLogo) urls.push(tx.clearSignedMeta.tokenLogo);
      }
      return urls;
    }, [displayItems]),
  );
  const resolveLogo = (url: string | undefined): string | undefined =>
    (url && cachedLogoMap.get(url)) || url;

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
                resolveLogo={resolveLogo}
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

/**
 * Format a decimal amount string for the compact activity row.
 *
 * Mirrors the rules from `ERC20ApproveDisplay.formatApprovalAmount` so the
 * Activity row reads the same way the confirmation card did — but collapsed
 * to a single string (no separate suffix span needed at this density).
 *
 *   ≤ 9 integer digits  → commas + up to 6 dp ("1,234.56")
 *   10–12 digits        → "1.23B"
 *   > 12 digits         → scientific ("1.23e20")
 *
 * BigInt math keeps us accurate against arbitrary uint256 amounts; Number()
 * would silently lose precision past 2^53.
 */
function formatActivityAmount(value: string): string {
  const [integer = "0", decimal = ""] = value.split(".");
  const digits = integer.length;
  if (digits <= 9) {
    const formatted = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    const trimmed = decimal.replace(/0+$/, "").slice(0, 6);
    return trimmed ? `${formatted}.${trimmed}` : formatted;
  }
  if (digits <= 12) {
    const intBig = BigInt(integer);
    const scaled = (intBig * 100n) / 1_000_000_000n;
    const whole = scaled / 100n;
    const frac = scaled % 100n;
    return `${whole}.${frac.toString().padStart(2, "0")}B`;
  }
  const first = integer[0];
  const next = integer.slice(1, 3).padEnd(2, "0");
  return `${first}.${next}e${digits - 1}`;
}

/**
 * Resolve the best human-readable name for the counterparty (spender /
 * recipient / contract). Priority: eth.sh label > ENS > short address.
 */
function getCounterpartyDisplay(meta: ClearSignedMeta): string {
  if (meta.counterpartyLabel) return meta.counterpartyLabel;
  if (meta.counterpartyEns) return meta.counterpartyEns;
  const addr = meta.counterparty;
  if (!addr) return "";
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

/**
 * Render the Activity row's clear-signed summary line. Reads only from the
 * snapshot taken at submission time — no RPC, eth.sh, or ENS calls happen
 * here. When fields are missing the row gracefully degrades (no token logo,
 * shortened address as counterparty, etc.).
 */
function ClearSignedSummary({
  meta,
  resolveLogo,
}: {
  meta: ClearSignedMeta;
  resolveLogo: (url: string | undefined) => string | undefined;
}) {
  const counterparty = getCounterpartyDisplay(meta);
  const logoSrc = meta.tokenLogo ? resolveLogo(meta.tokenLogo) : undefined;

  // Compose the verb+amount+symbol fragment per kind. Approve with isInfinite
  // collapses the amount slot to the "Unlimited" word so the row reads
  // "Approve Unlimited USDC → ..." rather than the raw 2^256-1.
  let action: string;
  if (meta.kind === "approve") {
    const amountWord = meta.isInfinite
      ? "Unlimited"
      : meta.amount
        ? formatActivityAmount(meta.amount)
        : "";
    action = ["Approve", amountWord, meta.tokenSymbol]
      .filter(Boolean)
      .join(" ");
  } else if (meta.kind === "transfer" || meta.kind === "nativeSend") {
    const amountWord = meta.amount ? formatActivityAmount(meta.amount) : "";
    action = ["Send", amountWord, meta.tokenSymbol].filter(Boolean).join(" ");
  } else {
    // erc7730 — the descriptor's intent string already reads as a verb.
    action = meta.intent || meta.contractName || "";
  }

  return (
    <HStack spacing={1.5} minW={0} align="center">
      {logoSrc && (
        <Image
          src={logoSrc}
          alt={meta.tokenSymbol || ""}
          boxSize="14px"
          borderRadius="full"
          flexShrink={0}
        />
      )}
      <Text
        fontSize="xs"
        color="text.secondary"
        fontWeight="600"
        noOfLines={1}
        minW={0}
      >
        {action}
        {counterparty && (
          <>
            <Text as="span" color="text.tertiary" fontWeight="500">
              {" → "}
            </Text>
            {counterparty}
          </>
        )}
      </Text>
    </HStack>
  );
}

function getInternalSendSymbol(tx: CompletedTransaction): string | null {
  if (tx.transferMeta?.symbol) return tx.transferMeta.symbol;
  if (!tx.origin.startsWith("Send ")) return null;
  const symbol = tx.origin.slice(5).trim();
  return symbol || null;
}

function ActivityIcon({
  tx,
  originHostname,
}: {
  tx: CompletedTransaction;
  originHostname: string | null;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const internalSendSymbol = getInternalSendSymbol(tx);
  const fallbackLabel = (internalSendSymbol || tx.origin || "?").slice(0, 3).toUpperCase();
  const imageSrc =
    tx.origin === "WalletChan" ||
    tx.origin === "BankrWallet" ||
    tx.origin === "Cross-Dapp Batch"
      ? "/walletchan-icon.png"
      : tx.favicon || (originHostname ? googleFaviconUrl(originHostname) : undefined);

  if (!imageSrc || imageFailed) {
    return (
      <Text fontSize="2xs" fontWeight="800" color="text.secondary">
        {fallbackLabel}
      </Text>
    );
  }

  return (
    <Image
      src={imageSrc}
      alt={internalSendSymbol || "favicon"}
      boxSize="22px"
      onError={(e) => {
        if (!originHostname || tx.origin.startsWith("Send ")) {
          setImageFailed(true);
          return;
        }

        const target = e.target as HTMLImageElement;
        const googleFallback = googleFaviconUrl(originHostname);
        if (target.src === googleFallback) {
          setImageFailed(true);
          return;
        }
        target.src = googleFallback;
      }}
    />
  );
}

function TxStatusItem({
  tx,
  onClick,
  resolveLogo,
}: {
  tx: CompletedTransaction;
  onClick: () => void;
  resolveLogo: (url: string | undefined) => string | undefined;
}) {
  const { networksInfo } = useNetworks();
  const iconChipBg = useIconChipBg();
  const { themeId } = useTheme();
  const isDarkTheme = themeId === "midnight";
  const config = getChainConfig(tx.chainId);
  const explorerBase =
    getResolvedChainById(tx.chainId, networksInfo)?.explorer ||
    config.explorer ||
    "";
  const originHostname = getOriginHostname(tx.origin);

  // Whether Row 2 will render. Both functionName and clearSignedMeta drive the
  // detail row; when either is present we hide the inline status on Row 1 so
  // status only renders once.
  const hasDetailRow = !!tx.functionName || !!tx.clearSignedMeta;

  const isForceInclusion = !!tx.forceInclusionMeta;
  const isForcePendingL2 = tx.status === "pending" && isForceInclusion && !tx.forceInclusionMeta!.l2Confirmed;
  const isForcePendingL1 = tx.status === "processing" && isForceInclusion;

  // For force inclusion: link to L1 explorer until the L2 sequencer has
  // actually included the tx. L2 explorers don't index force-inclusion txs
  // until they appear onchain — linking to L2 in the "L1 Confirmed / L2
  // Pending" window leads to a "tx not found" page, which is confusing.
  const l1ExplorerBase = isForceInclusion
    ? getChainConfig(tx.forceInclusionMeta!.l1ChainId).explorer || ""
    : "";
  const hasViewableTx = isForceInclusion
    ? !!(tx.forceInclusionMeta!.l1TxHash || tx.txHash)
    : !!(tx.txHash && explorerBase);

  const handleViewTx = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isForceInclusion) {
      const l1Hash = tx.forceInclusionMeta!.l1TxHash;
      const txHashIsL2 = tx.txHash && tx.txHash !== l1Hash;
      // Link to L2 once the L2 tx has actually resolved onchain. That means
      // either status === "success" (the L2 receipt poller confirmed) or
      // status === "failed" with a distinct L2 hash (the L2 tx executed and
      // reverted — the explorer DOES know about it). The only case where the
      // L2 explorer wouldn't have the tx is during the L1-Confirmed/L2-Pending
      // window (status === "pending"), where we still link to L1.
      // The txHashIsL2 guard also covers the extractL2Hash-failed fallback
      // where tx.txHash === l1Hash — no real L2 hash to link to.
      const l2Resolved = tx.status === "success" || tx.status === "failed";
      if (l2Resolved && txHashIsL2 && explorerBase) {
        const hash = tx.txHash!.match(/0x[a-fA-F0-9]{64}/)?.[0];
        if (hash) {
          chrome.tabs.create({ url: `${explorerBase}/tx/${hash}` });
          return;
        }
      }
      // Otherwise link to L1 — covers L1 Pending, L1 Confirmed/L2 Pending,
      // L1 reverted, and the L2-hash-extraction-failed fallback.
      if (l1Hash && l1ExplorerBase) {
        chrome.tabs.create({ url: `${l1ExplorerBase}/tx/${l1Hash}` });
        return;
      }
    }
    if (tx.txHash && explorerBase) {
      const hash = tx.txHash.match(/0x[a-fA-F0-9]{64}/)?.[0];
      if (hash) {
        chrome.tabs.create({ url: `${explorerBase}/tx/${hash}` });
      }
    }
  };

  const statusElement = (() => {
    // Force inclusion: L1 still processing/pending
    if (isForcePendingL1) {
      return (
        <HStack spacing={1}>
          <Spinner size="xs" color="accent.secondary" boxSize="10px" />
          <Text fontSize="2xs" color="accent.secondary" fontWeight="600">
            L1 Pending
          </Text>
        </HStack>
      );
    }

    // Force inclusion: L1 confirmed, awaiting L2 sequencer
    if (isForcePendingL2) {
      return (
        <VStack spacing={0} align="flex-end">
          <Text fontSize="2xs" color="chart.positive" fontWeight="600">
            L1 Confirmed
          </Text>
          <HStack spacing={1}>
            <Spinner size="xs" color="accent.secondary" boxSize="10px" />
            <Text fontSize="2xs" color="accent.secondary" fontWeight="600">
              L2 Pending
            </Text>
          </HStack>
        </VStack>
      );
    }

    switch (tx.status) {
      case "processing":
        return (
          <HStack spacing={1}>
            <Spinner size="xs" color="accent.secondary" />
            <Text fontSize="xs" color="accent.secondary" fontWeight="600">
              Processing
            </Text>
          </HStack>
        );
      case "pending":
        return (
          <HStack spacing={1}>
            <Spinner size="xs" color="accent.secondary" />
            <Text fontSize="xs" color="accent.secondary" fontWeight="600">
              Pending...
            </Text>
          </HStack>
        );
      case "success":
        return (
          <Text fontSize="2xs" color="chart.positive" fontWeight="600">
            {tx.forceInclusionMeta ? "L1 + L2 Confirmed" : "Confirmed"}
          </Text>
        );
      case "failed": {
        // For force inclusion, distinguish L1 vs L2 failure. The L2 receipt
        // poller preserves tx.txHash (set when L1 was confirmed) when it marks
        // the tx as failed, so a distinct L2 hash means L1 succeeded but L2
        // reverted. Same discriminator the modal uses.
        let label = "Failed";
        if (isForceInclusion) {
          const l1Hash = tx.forceInclusionMeta!.l1TxHash;
          const hasDistinctL2Hash = !!(tx.txHash && tx.txHash !== l1Hash);
          label = hasDistinctL2Hash ? "L2 Failed" : "L1 Failed";
        }
        return (
          <HStack spacing={1}>
            <WarningIcon boxSize={2.5} color="chart.negative" />
            <Text fontSize="xs" color="chart.negative" fontWeight="600">
              {label}
            </Text>
          </HStack>
        );
      }
    }
  })();

  return (
    <Box
      py={2.5}
      px={1}
      cursor="pointer"
      onClick={onClick}
      _hover={{ bg: "bg.muted" }}
      borderBottom="1px solid"
      borderColor="border.subtle"
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
              bg="bg.muted"
              borderRadius="full"
              w="28px"
              h="28px"
              display="flex"
              alignItems="center"
              justifyContent="center"
              overflow="hidden"
              border="2px solid"
              borderColor="surface.raised"
              zIndex={1}
            >
              {tx.swapMeta.sellTokenLogo ? (
                <Image src={resolveLogo(tx.swapMeta.sellTokenLogo)} alt={tx.swapMeta.sellTokenSymbol} boxSize="20px" />
              ) : (
                <Text fontSize="2xs" fontWeight="700">{tx.swapMeta.sellTokenSymbol.slice(0, 2)}</Text>
              )}
            </Box>
            {/* Buy token (front, overlapping) */}
            <Box
              position="absolute"
              left="14px"
              top={0}
              bg="bg.muted"
              borderRadius="full"
              w="28px"
              h="28px"
              display="flex"
              alignItems="center"
              justifyContent="center"
              overflow="hidden"
              border="2px solid"
              borderColor="surface.raised"
              zIndex={2}
            >
              {tx.swapMeta.buyTokenLogo ? (
                <Image src={resolveLogo(tx.swapMeta.buyTokenLogo)} alt={tx.swapMeta.buyTokenSymbol} boxSize="20px" />
              ) : (
                <Text fontSize="2xs" fontWeight="700">{tx.swapMeta.buyTokenSymbol.slice(0, 2)}</Text>
              )}
            </Box>
            <Box
              position="absolute"
              bottom="-2px"
              right="-2px"
              w="16px"
              h="16px"
              borderRadius="full"
              bg={iconChipBg}
              border="1.5px solid"
              borderColor="border.subtle"
              display="flex"
              alignItems="center"
              justifyContent="center"
              zIndex={3}
            >
              <ChainIcon chainId={tx.chainId} chainName={tx.chainName} size="11px" />
            </Box>
          </Box>
        ) : (
          /* Standard: single favicon with chain icon overlay */
          <Box position="relative" flexShrink={0} w="36px" h="36px">
            <Box
              bg={isDarkTheme ? "whiteAlpha.800" : iconChipBg}
              borderRadius="full"
              w="36px"
              h="36px"
              display="flex"
              alignItems="center"
              justifyContent="center"
              overflow="hidden"
              border={isDarkTheme ? "1px solid" : undefined}
              borderColor={isDarkTheme ? "border.default" : undefined}
            >
              <ActivityIcon tx={tx} originHostname={originHostname} />
            </Box>
            <Box
              position="absolute"
              bottom="-2px"
              right="-2px"
              w="16px"
              h="16px"
              borderRadius="full"
              bg={iconChipBg}
              border="1.5px solid"
              borderColor="border.subtle"
              display="flex"
              alignItems="center"
              justifyContent="center"
            >
              <ChainIcon chainId={tx.chainId} chainName={tx.chainName} size="11px" />
            </Box>
          </Box>
        )}

        {/* Content */}
        <Box flex={1} minW={0}>
          {/* Row 1: hostname + time (+ status when there's no detail row) */}
          <HStack justify="space-between" spacing={2} minH={hasDetailRow ? undefined : "36px"} align="center">
            <Text
              fontSize="sm"
              fontWeight="600"
              color="text.primary"
              noOfLines={1}
            >
              {originHostname || tx.origin}
            </Text>
            <HStack spacing={1} flexShrink={0}>
              <Text
                fontSize="2xs"
                color="text.tertiary"
                fontWeight="500"
                flexShrink={0}
              >
                {formatTimeAgo(tx.createdAt)}
              </Text>
              {!hasDetailRow && (
                <>
                  <Text fontSize="2xs" color="text.tertiary" fontWeight="500">|</Text>
                  {statusElement}
                  {hasViewableTx && (
                    <ExternalLinkIcon
                      boxSize={2.5}
                      color="text.tertiary"
                      cursor="pointer"
                      onClick={handleViewTx}
                      _hover={{ color: "accent.secondary" }}
                    />
                  )}
                </>
              )}
            </HStack>
          </HStack>

          {/* Row 2: prefer the clear-signed summary; fall back to raw functionName. */}
          {hasDetailRow && (
            <HStack justify="space-between" spacing={2} mt={0.5}>
              <Box flex={1} minW={0}>
                {tx.clearSignedMeta ? (
                  <ClearSignedSummary
                    meta={tx.clearSignedMeta}
                    resolveLogo={resolveLogo}
                  />
                ) : (
                  <Text
                    fontSize="xs"
                    color="text.tertiary"
                    fontFamily="mono"
                    noOfLines={1}
                  >
                    {tx.functionName}
                  </Text>
                )}
              </Box>
              <HStack spacing={1} flexShrink={0}>
                {statusElement}
                {hasViewableTx && (
                    <ExternalLinkIcon
                      boxSize={2.5}
                      color="text.tertiary"
                      cursor="pointer"
                      onClick={handleViewTx}
                      _hover={{ color: "accent.secondary" }}
                    />
                  )}
              </HStack>
            </HStack>
          )}
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
