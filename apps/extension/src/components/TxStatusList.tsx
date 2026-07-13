import { useState, useEffect, useMemo, useRef, memo } from "react";
import {
  Box,
  VStack,
  HStack,
  Text,
  Spinner,
  Image,
  Button,
  IconButton,
  Tooltip,
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
import SafeImage from "@/components/SafeImage";
import { isDarkThemeId, useIconChipBg, useTheme } from "@/theme";
import { useCachedAvatarMap } from "@/hooks/useCachedAvatarSrc";
import {
  EmptyState,
  EmptyStateDescription,
  EmptyStateHeader,
  EmptyStateTitle,
  ListSurface,
} from "@/components/ui";

interface TxStatusListProps {
  maxItems?: number;
  address?: string;
  hideHeader?: boolean;
  hideCard?: boolean;
  filterChainId?: number | null;
  /** When provided, the parent owns screen-level transaction detail navigation. */
  onSelectTx?: (tx: CompletedTransaction) => void;
}

/** Group transactions by date label */
function groupByDate(
  txs: CompletedTransaction[],
): { label: string; txs: CompletedTransaction[] }[] {
  const groups: Map<string, CompletedTransaction[]> = new Map();

  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const fmt = (d: Date) =>
    d.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  const toDateKey = (d: Date) =>
    `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

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
  onSelectTx,
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

  // Keep the detail-modal's tx prop in sync with the latest history entry —
  // otherwise opening the modal during a bridge "pending dest" state would
  // freeze on that snapshot and miss the destination tx hash + asset changes
  // landing later. We diff by reference so an unchanged entry doesn't churn
  // the modal.
  useEffect(() => {
    setSelectedTx((current) => {
      if (!current) return current;
      const fresh = allHistory.find((tx) => tx.id === current.id);
      if (!fresh || fresh === current) return current;
      return fresh;
    });
  }, [allHistory]);

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
                <TxStatusItem
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

/** Build the plain-language intent captured with a clear-signed transaction. */
function getClearSignedIntent(meta: ClearSignedMeta): string {
  if (meta.kind === "approve") {
    if (meta.isRevoke) {
      return ["Revoke", meta.tokenSymbol, "approval"]
        .filter(Boolean)
        .join(" ");
    }
    return ["Approve", meta.tokenSymbol].filter(Boolean).join(" ");
  }

  if (meta.kind === "transfer" || meta.kind === "nativeSend") {
    return ["Send", meta.tokenSymbol].filter(Boolean).join(" ");
  }

  // ERC-7730 intent strings are already human-readable verbs.
  return meta.intent || meta.contractName || "Contract interaction";
}

function getActivityValue(tx: CompletedTransaction): string | null {
  if (tx.transferMeta) {
    return `−${formatActivityAmount(tx.transferMeta.amount)} ${tx.transferMeta.symbol}`;
  }

  const meta = tx.clearSignedMeta;
  if (!meta || !meta.tokenSymbol) return null;
  if (meta.kind === "erc7730" || meta.isRevoke) return null;
  if (meta.isInfinite) return `Unlimited ${meta.tokenSymbol}`;
  if (!meta.amount) return null;

  const prefix =
    meta.kind === "transfer" || meta.kind === "nativeSend" ? "−" : "";
  return `${prefix}${formatActivityAmount(meta.amount)} ${meta.tokenSymbol}`;
}

function getClearSignedContext(meta: ClearSignedMeta): string | null {
  const counterparty = getCounterpartyDisplay(meta);
  if (!counterparty) return null;
  if (meta.kind === "approve") {
    return meta.isRevoke
      ? `Approval from ${counterparty}`
      : `Spending limit for ${counterparty}`;
  }
  if (meta.kind === "transfer" || meta.kind === "nativeSend") {
    return `To ${counterparty}`;
  }
  return meta.contractName && meta.contractName !== meta.intent
    ? meta.contractName
    : counterparty;
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
  const internalSendSymbol = getInternalSendSymbol(tx);
  const fallbackLabel = (internalSendSymbol || tx.origin || "?")
    .slice(0, 3)
    .toUpperCase();
  const imageSrc =
    tx.origin === "WalletChan" ||
    tx.origin === "BankrWallet" ||
    tx.origin === "Cross-Dapp Batch"
      ? "/walletchan-icon.png"
      : tx.favicon ||
        (originHostname ? googleFaviconUrl(originHostname) : undefined);

  if (!imageSrc) {
    return (
      <Text fontSize="2xs" fontWeight="800" color="text.secondary">
        {fallbackLabel}
      </Text>
    );
  }

  return (
    <SafeImage
      src={imageSrc}
      fallbackSrc={
        originHostname && !tx.origin.startsWith("Send ")
          ? googleFaviconUrl(originHostname)
          : undefined
      }
      alt={internalSendSymbol || "favicon"}
      boxSize="22px"
      fallback={
        <Text fontSize="2xs" fontWeight="800" color="text.secondary">
          {fallbackLabel}
        </Text>
      }
    />
  );
}

function TxStatusItem({
  tx,
  onClick,
  resolveLogo,
  flush,
}: {
  tx: CompletedTransaction;
  onClick: () => void;
  resolveLogo: (url: string | undefined) => string | undefined;
  flush: boolean | undefined;
}) {
  const { networksInfo } = useNetworks();
  const iconChipBg = useIconChipBg();
  const { themeId } = useTheme();
  const isDarkTheme = isDarkThemeId(themeId);
  const config = getChainConfig(tx.chainId);
  const explorerBase =
    getResolvedChainById(tx.chainId, networksInfo)?.explorer ||
    config.explorer ||
    "";
  const originHostname = getOriginHostname(tx.origin);

  const isForceInclusion = !!tx.forceInclusionMeta;
  const isForcePendingL2 =
    tx.status === "pending" &&
    isForceInclusion &&
    !tx.forceInclusionMeta!.l2Confirmed;
  const isForcePendingL1 =
    tx.status === "processing" && isForceInclusion;

  // Cross-chain bridge: source tx confirmed but destination leg still polling.
  // We piggyback on the existing "L1 Confirmed / L2 Pending" visual language —
  // users already understand "source done, destination in flight" from force
  // inclusion. Bungee terminal codes: 3 FULFILLED, 4 SETTLED, 5 EXPIRED,
  // 6 CANCELLED, 7 REFUNDED.
  const isBridge = !!tx.bridge;
  const bridgeCode = tx.bridge?.bungeeStatusCode;
  const bridgeFulfilled = bridgeCode === 3 || bridgeCode === 4;
  const bridgeRefunded = bridgeCode === 7;
  const bridgeFailedTerminal = bridgeCode === 5 || bridgeCode === 6;
  const isBridgePendingDest =
    isBridge &&
    tx.status === "success" &&
    !bridgeFulfilled &&
    !bridgeRefunded &&
    !bridgeFailedTerminal;

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

  // Bridge destination link. Use the same runtime chain resolver as source
  // links so user-added destination chains (e.g. Avalanche) can surface their
  // stored explorer even when they are not built into CHAIN_REGISTRY.
  const destExplorerBase =
    isBridge && tx.bridge?.destinationChainId
      ? getResolvedChainById(tx.bridge.destinationChainId, networksInfo)
          ?.explorer ||
        getChainConfig(tx.bridge.destinationChainId).explorer ||
        ""
      : "";
  const hasBridgeDestLink = !!(
    isBridge && tx.bridge?.destinationTxHash && destExplorerBase
  );
  const handleViewBridgeDest = (e: React.MouseEvent) => {
    e.stopPropagation();
    const hash = tx.bridge?.destinationTxHash;
    if (!hash || !destExplorerBase) return;
    const clean = hash.match(/0x[a-fA-F0-9]{64}/)?.[0];
    if (clean) {
      chrome.tabs.create({ url: `${destExplorerBase}/tx/${clean}` });
    }
  };

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
    // Cross-chain bridge: source confirmed, destination polling. Mirrors
    // the "L1 Confirmed / L2 Pending" layout we use for force-inclusion.
    if (isBridgePendingDest) {
      return (
        <VStack spacing={0} align="flex-end">
          <Text fontSize="2xs" color="chart.positive" fontWeight="600">
            Source confirmed
          </Text>
          <HStack spacing={1}>
            <Spinner size="xs" color="accent.secondary" boxSize="10px" />
            <Text fontSize="2xs" color="accent.secondary" fontWeight="600">
              Bridging to {tx.bridge!.destinationChainName}
            </Text>
          </HStack>
        </VStack>
      );
    }
    if (isBridge && bridgeFulfilled) {
      return (
        <Text fontSize="2xs" color="chart.positive" fontWeight="600">
          Bridge complete
        </Text>
      );
    }
    if (isBridge && bridgeRefunded) {
      return (
        <HStack spacing={1}>
          <WarningIcon boxSize={2.5} color="chart.negative" />
          <Text fontSize="2xs" color="chart.negative" fontWeight="600">
            Refunded
          </Text>
        </HStack>
      );
    }
    if (isBridge && bridgeFailedTerminal) {
      return (
        <HStack spacing={1}>
          <WarningIcon boxSize={2.5} color="chart.negative" />
          <Text fontSize="2xs" color="chart.negative" fontWeight="600">
            {bridgeCode === 5 ? "Bridge expired" : "Bridge cancelled"}
          </Text>
        </HStack>
      );
    }

    // Force inclusion: L1 still processing/pending
    if (isForcePendingL1) {
      return (
        <HStack spacing={1}>
          <Spinner size="xs" color="accent.secondary" boxSize="10px" />
          <Text fontSize="2xs" color="accent.secondary" fontWeight="600">
            L1 pending
          </Text>
        </HStack>
      );
    }

    // Force inclusion: L1 confirmed, awaiting L2 sequencer
    if (isForcePendingL2) {
      return (
        <VStack spacing={0} align="flex-end">
          <Text fontSize="2xs" color="chart.positive" fontWeight="600">
            L1 confirmed
          </Text>
          <HStack spacing={1}>
            <Spinner size="xs" color="accent.secondary" boxSize="10px" />
            <Text fontSize="2xs" color="accent.secondary" fontWeight="600">
              L2 pending
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
              Pending
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

  // Bridge origins ship as `Bridge USDC → Arbitrum`, which truncates to
  // "Bridge USDC →..." in the narrow Activity row. Split on the arrow and
  // stack the destination on its own line so both the bridged token and
  // the destination chain stay readable.
  //
  // Fallback path: batched bridges may carry an origin without " → " (e.g.
  // a legacy "Swap: Approve USDC for bridge" entry, or a Bankr "Batch: …"
  // prefix). Reconstruct the two-line title from bridge + swap meta so the
  // activity row matches sequential bridges regardless of how the batch
  // path assembled its display string.
  const bridgeOriginParts = (() => {
    if (!isBridge) return null;
    const ARROW = " → ";
    const idx = tx.origin.indexOf(ARROW);
    if (idx !== -1) {
      return {
        head: tx.origin.slice(0, idx),
        tail: `→ ${tx.origin.slice(idx + ARROW.length)}`,
      };
    }
    const sellSymbol = tx.swapMeta?.sellTokenSymbol;
    const destChain = tx.bridge?.destinationChainName;
    if (sellSymbol && destChain) {
      return {
        head: `Bridge ${sellSymbol.toUpperCase()}`,
        tail: `→ ${destChain}`,
      };
    }
    if (destChain) {
      return {
        head: "Bridge",
        tail: `→ ${destChain}`,
      };
    }
    return null;
  })();
  const intent = tx.clearSignedMeta
    ? getClearSignedIntent(tx.clearSignedMeta)
    : tx.transferMeta
      ? `Send ${tx.transferMeta.symbol}`
      : bridgeOriginParts
        ? `${bridgeOriginParts.head} ${bridgeOriginParts.tail}`
        : tx.swapMeta
          ? `Swap ${tx.swapMeta.sellTokenSymbol} → ${tx.swapMeta.buyTokenSymbol}`
          : originHostname && tx.functionName
            ? tx.functionName
            : tx.origin;

  const contextParts: string[] = [];
  const clearSignedContext = tx.clearSignedMeta
    ? getClearSignedContext(tx.clearSignedMeta)
    : null;
  if (clearSignedContext) contextParts.push(clearSignedContext);
  if (originHostname) contextParts.push(originHostname);
  if (!originHostname && tx.functionName && tx.functionName !== intent) {
    contextParts.push(tx.functionName);
  }
  if (contextParts.length === 0 && tx.chainName) {
    contextParts.push(tx.chainName);
  }
  const context = contextParts.join(" · ");
  const value = getActivityValue(tx);

  const sourceExplorerLabel =
    isBridge && hasBridgeDestLink
      ? `View on ${tx.chainName || "source chain"} explorer`
      : "View on explorer";

  const sourceExplorerIcon = isBridge && hasBridgeDestLink ? (
    <HStack spacing="2px" aria-hidden="true">
      <ChainIcon chainId={tx.chainId} chainName={tx.chainName} size="11px" />
      <ExternalLinkIcon boxSize={3} />
    </HStack>
  ) : (
    <ExternalLinkIcon boxSize={3.5} />
  );

  return (
    <Box
      as="li"
      w="full"
      m={0}
      p={0}
      listStyleType="none"
      borderBottomWidth="1px"
      borderBottomStyle="solid"
      borderBottomColor="border.subtle"
      _last={{ borderBottomWidth: 0 }}
    >
      <HStack spacing={0} align="stretch">
        <HStack
          as="button"
          type="button"
          flex="1 1 auto"
          minW={0}
          minH="72px"
          spacing={3}
          align="center"
          py={3}
          pl={flush ? 1 : 3}
          pr={hasViewableTx || hasBridgeDestLink ? 2 : flush ? 1 : 3}
          textAlign="start"
          color="fg.primary"
          bg="transparent"
          borderWidth={0}
          cursor="pointer"
          aria-label={`Open transaction details for ${intent}`}
          onClick={onClick}
          transitionProperty="background-color, box-shadow"
          transitionDuration="fast"
          _hover={{ bg: "surface.raisedHover" }}
          _active={{ bg: "surface.sunken" }}
          _focus={{ outline: "none" }}
          _focusVisible={{
            zIndex: 1,
            boxShadow:
              "inset 0 0 0 2px var(--chakra-colors-border-focus)",
          }}
        >
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
                  <Image
                    src={resolveLogo(tx.swapMeta.sellTokenLogo)}
                    alt={tx.swapMeta.sellTokenSymbol}
                    boxSize="20px"
                  />
                ) : (
                  <Text fontSize="2xs" fontWeight="700">
                    {tx.swapMeta.sellTokenSymbol.slice(0, 2)}
                  </Text>
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
                  <Image
                    src={resolveLogo(tx.swapMeta.buyTokenLogo)}
                    alt={tx.swapMeta.buyTokenSymbol}
                    boxSize="20px"
                  />
                ) : (
                  <Text fontSize="2xs" fontWeight="700">
                    {tx.swapMeta.buyTokenSymbol.slice(0, 2)}
                  </Text>
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
                <ChainIcon
                  chainId={tx.chainId}
                  chainName={tx.chainName}
                  size="11px"
                />
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
                <ChainIcon
                  chainId={tx.chainId}
                  chainName={tx.chainName}
                  size="11px"
                />
              </Box>
            </Box>
          )}

          <Box flex="1 1 auto" minW={0}>
            <HStack spacing={1.5} minW={0}>
              {tx.clearSignedMeta?.tokenLogo && (
                <Image
                  src={resolveLogo(tx.clearSignedMeta.tokenLogo)}
                  alt=""
                  boxSize="16px"
                  borderRadius="full"
                  flexShrink={0}
                />
              )}
              <Text
                fontSize="sm"
                fontWeight="600"
                color="fg.primary"
                lineHeight="1.35"
                noOfLines={1}
              >
                {intent}
              </Text>
            </HStack>
            {context && (
              <Text
                mt={0.5}
                fontSize="xs"
                color="fg.secondary"
                lineHeight="1.35"
                noOfLines={1}
              >
                {context}
              </Text>
            )}
            {tx.status === "failed" && tx.error && (
              <Text
                mt={0.5}
                fontSize="xs"
                color="chart.negative"
                lineHeight="1.35"
                noOfLines={1}
              >
                {tx.error}
              </Text>
            )}
          </Box>

          <VStack
            spacing={0.5}
            flex="0 1 auto"
            minW={0}
            maxW="46%"
            align="flex-end"
          >
            {value && (
              <Text
                fontSize="sm"
                fontWeight="600"
                color="fg.primary"
                lineHeight="1.35"
                textAlign="end"
                sx={{ fontVariantNumeric: "tabular-nums" }}
                noOfLines={1}
              >
                {value}
              </Text>
            )}
            {statusElement}
            <Text
              fontSize="2xs"
              color="fg.muted"
              fontWeight="500"
              lineHeight="1.3"
              sx={{ fontVariantNumeric: "tabular-nums" }}
              flexShrink={0}
            >
              {formatTimeAgo(tx.createdAt)}
            </Text>
          </VStack>
        </HStack>

        {(hasViewableTx || hasBridgeDestLink) && (
          <VStack
            flex="0 0 auto"
            spacing={0}
            justify="center"
            px={1}
            borderLeftWidth="1px"
            borderLeftStyle="solid"
            borderLeftColor="border.subtle"
          >
            {hasViewableTx && (
              <Tooltip
                label={sourceExplorerLabel}
                fontSize="2xs"
                openDelay={300}
                hasArrow
              >
                <IconButton
                  aria-label={sourceExplorerLabel}
                  icon={sourceExplorerIcon}
                  size="sm"
                  variant="ghost"
                  color="fg.secondary"
                  onClick={handleViewTx}
                />
              </Tooltip>
            )}
            {hasBridgeDestLink && (
              <Tooltip
                label={`View on ${tx.bridge!.destinationChainName} explorer`}
                fontSize="2xs"
                openDelay={300}
                hasArrow
              >
                <IconButton
                  aria-label={`View on ${tx.bridge!.destinationChainName} explorer`}
                  icon={
                    <HStack spacing="2px" aria-hidden="true">
                      <ChainIcon
                        chainId={tx.bridge!.destinationChainId}
                        chainName={tx.bridge!.destinationChainName}
                        size="11px"
                      />
                      <ExternalLinkIcon boxSize={3} />
                    </HStack>
                  }
                  size="sm"
                  variant="ghost"
                  color="fg.secondary"
                  onClick={handleViewBridgeDest}
                />
              </Tooltip>
            )}
          </VStack>
        )}
      </HStack>
    </Box>
  );
}

export default memo(TxStatusList);
