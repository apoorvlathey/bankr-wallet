import { memo, useState, useEffect, useCallback } from "react";
import {
  Box,
  VStack,
  HStack,
  Text,
  Badge,
  Button,
  Code,
  IconButton,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Image,
  Spacer,
  Collapse,
  Spinner,
} from "@chakra-ui/react";
import {
  CheckCircleIcon,
  WarningIcon,
  ExternalLinkIcon,
  CloseIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  RepeatIcon,
} from "@chakra-ui/icons";
import {
  CompletedTransaction,
  GasData,
  type AssetChangeRecord,
  type ForceInclusionMeta,
} from "@/chrome/txHistoryStorage";
import { getChainConfig } from "@/constants/chainConfig";
import { OP_STACK_CHAIN_IDS } from "@/constants/networks";
import { useNetworks } from "@/contexts/NetworksContext";
import { AddressParam } from "@/components/decodedParams/AddressParam";
import { CopyButton } from "@/components/CopyButton";
import CalldataDecoder from "@/components/CalldataDecoder";
import { formatEth, formatGwei, formatNumber } from "@/lib/gasFormatUtils";
import { FromAccountDisplay } from "@/components/FromAccountDisplay";
import ChainIcon from "@/components/ChainIcon";
import {
  getResolvedChainById,
  getStoredNativeCurrencySymbol,
  getStoredRpcUrl,
} from "@/lib/chains";
import { useTheme, useChainBadgeStyle } from "@/theme";
import { useThemedToast } from "@/hooks/useThemedToast";
import ClearSignedSummaryCard from "@/components/ClearSignedSummaryCard";
import LoadingDots from "@/components/LoadingDots";

interface TxDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  tx: CompletedTransaction;
}

function formatValue(value: string | undefined, symbol = "ETH"): string {
  if (!value || value === "0" || value === "0x0") {
    return `0 ${symbol}`;
  }
  const wei = BigInt(value);
  const eth = Number(wei) / 1e18;
  return `${eth.toFixed(6)} ${symbol}`;
}

/**
 * Format a positive wei amount to a token-friendly decimal string.
 * `decimals` defaults to 18 (native). Returns null when the amount rounds
 * to zero at our display precision — callers use this to hide rows whose
 * display would otherwise read "0".
 */
function formatTokenAmountWei(amountWei: string, decimals: number): string | null {
  let bi: bigint;
  try {
    bi = BigInt(amountWei);
  } catch {
    return null;
  }
  if (bi < 0n) bi = -bi;
  if (bi === 0n) return null;
  const divisor = 10n ** BigInt(decimals);
  const whole = bi / divisor;
  const frac = bi % divisor;
  let fracStr = frac.toString().padStart(decimals, "0").slice(0, 6);
  fracStr = fracStr.replace(/0+$/, "");
  const numStr = fracStr.length > 0 ? `${whole}.${fracStr}` : `${whole}`;
  // Anything that rounded to a literal "0" string at our precision is
  // sub-display dust — suppress the row entirely.
  if (numStr === "0") return null;
  return numStr;
}

/**
 * Sign-prefixed display ("+1.23" / "−1.23"). Returns null when the rounded
 * magnitude would display as zero.
 */
function formatSignedTokenAmount(amountWei: string, decimals: number, isNegative: boolean): string | null {
  const mag = formatTokenAmountWei(amountWei, decimals);
  if (mag === null) return null;
  return `${isNegative ? "−" : "+"}${mag}`;
}

/**
 * Pick the swap-relevant transfer for a wallet-initiated swap/bridge: prefer
 * an ERC-20 row whose symbol matches `symbolHint` (case-insensitive); fall
 * back to the first transfer in the given direction; finally fall back to
 * the native delta if `nativeFallbackIsNative` is true (sell/buy is native).
 */
function pickSwapAmount(
  record: AssetChangeRecord | undefined,
  direction: "in" | "out",
  symbolHint: string | undefined,
  nativeFallbackIsNative: boolean,
  nativeDecimals: number,
): {
  amountLabel: string;
  amountWei: string;
  decimals: number;
  /** Token contract address (lowercase) or "native". */
  source: string | "native";
} | null {
  if (!record) return null;
  const hint = symbolHint?.toLowerCase();
  const directionMatch = record.erc20Transfers.filter((t) => t.direction === direction);
  const symMatch = hint
    ? directionMatch.find((t) => t.symbol?.toLowerCase() === hint)
    : undefined;
  const picked = symMatch ?? directionMatch[0];
  if (picked) {
    const decimals = picked.decimals ?? 18;
    const label = formatTokenAmountWei(picked.amountWei, decimals);
    if (label !== null)
      return {
        amountLabel: label,
        amountWei: picked.amountWei,
        decimals,
        source: picked.token,
      };
  }
  if (nativeFallbackIsNative && record.nativeDelta) {
    const label = formatTokenAmountWei(record.nativeDelta, nativeDecimals);
    if (label !== null)
      return {
        amountLabel: label,
        amountWei: record.nativeDelta,
        decimals: nativeDecimals,
        source: "native",
      };
  }
  return null;
}

function formatLocalTimestamp(timestamp: number): string {
  return new Date(timestamp).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });
}

function GasRow({ label, value }: { label: string; value: string }) {
  return (
    <HStack justify="space-between" w="full">
      <Text fontSize="xs" color="text.tertiary" fontWeight="600">
        {label}
      </Text>
      <Text fontSize="xs" fontWeight="700" color="text.primary" fontFamily="mono" textAlign="right">
        {value}
      </Text>
    </HStack>
  );
}

/**
 * Token logo that falls back to a tinted placeholder showing the first letter
 * of the symbol — so an unknown / not-yet-cached logo still reads visually
 * instead of an empty circle. Symbol-less tokens render a plain circle.
 */
function TokenLogoOrPlaceholder({
  logoUrl,
  symbol,
  alt,
  size = "16px",
}: {
  logoUrl?: string | null;
  symbol?: string;
  alt: string;
  size?: string;
}) {
  const initial = symbol ? symbol.trim().charAt(0).toUpperCase() : "";
  const placeholder = (
    <Box
      boxSize={size}
      borderRadius="full"
      bg="surface.raised"
      border="1px solid"
      borderColor="border.default"
      display="flex"
      alignItems="center"
      justifyContent="center"
      flexShrink={0}
    >
      {initial && (
        <Text
          fontSize="9px"
          fontWeight="800"
          color="text.secondary"
          lineHeight="1"
        >
          {initial}
        </Text>
      )}
    </Box>
  );
  if (!logoUrl) return placeholder;
  return (
    <Image
      src={logoUrl}
      alt={alt}
      boxSize={size}
      borderRadius="full"
      fallback={placeholder}
    />
  );
}

/**
 * Renders the "Token Changes" card for one leg of a tx (source-chain by
 * default; bridges also render a second card for the destination leg with
 * `label="On <destChain>"`). Native-row hidden when the extractor couldn't
 * resolve `balance(N-1)`; per-token rows render even without symbol/decimals
 * (the placeholder paints with a short address).
 */
function AssetChangesCard({
  record,
  chainId,
  chainName,
  nativeSym,
  label,
  formatUsd,
}: {
  record: AssetChangeRecord;
  chainId: number;
  chainName: string;
  nativeSym: string;
  label: string;
  /** Resolves a (chainId, address-or-"native") amount to its USD subtitle. */
  formatUsd: (amountWei: string, decimals: number, chainId: number, addressOrNative: string | "native") => string | null;
}) {
  const explorer = getChainConfig(chainId).explorer;
  const nativeRow = (() => {
    if (!record.nativeDelta) return null;
    let bi: bigint;
    try {
      bi = BigInt(record.nativeDelta);
    } catch {
      return null;
    }
    if (bi === 0n) return null;
    const isNegative = bi < 0n;
    const formatted = formatSignedTokenAmount(record.nativeDelta, 18, isNegative);
    if (formatted === null) return null; // rounds to zero — sub-display dust
    const usd = formatUsd(record.nativeDelta, 18, chainId, "native");
    return (
      <HStack justify="space-between" align="flex-start">
        <HStack spacing={2}>
          <ChainIcon chainId={chainId} chainName={chainName} size="14px" withChip />
          <Text fontSize="xs" fontWeight="700" color="text.secondary">
            {nativeSym}
          </Text>
        </HStack>
        <VStack spacing={0} align="flex-end">
          <Text
            fontSize="xs"
            fontWeight="800"
            color={isNegative ? "chart.negative" : "chart.positive"}
            fontFamily="mono"
          >
            {formatted} {nativeSym}
          </Text>
          {usd && (
            <Text fontSize="2xs" color="text.tertiary" fontWeight="600">
              {usd}
            </Text>
          )}
        </VStack>
      </HStack>
    );
  })();

  const renderableErc20Transfers = record.erc20Transfers
    .map((t) => {
      const formatted = formatSignedTokenAmount(
        t.amountWei,
        t.decimals ?? 18,
        t.direction === "out",
      );
      return formatted ? { t, formatted } : null;
    })
    .filter((x): x is { t: typeof record.erc20Transfers[number]; formatted: string } => x !== null);

  if (!nativeRow && renderableErc20Transfers.length === 0) return null;

  return (
    <Box
      bg="surface.sunken"
      border="2px solid"
      borderColor="border.default"
      borderRadius="lg"
      p={2.5}
    >
      <Text
        fontSize="2xs"
        fontWeight="800"
        textTransform="uppercase"
        color="text.tertiary"
        letterSpacing="wide"
        mb={2}
      >
        {label}
      </Text>
      <VStack spacing={1.5} align="stretch">
        {nativeRow}
        {renderableErc20Transfers.map(({ t, formatted }, i) => {
          const isNegative = t.direction === "out";
          const sym = t.symbol || `${t.token.slice(0, 6)}…${t.token.slice(-4)}`;
          const cpShort = `${t.counterparty.slice(0, 6)}…${t.counterparty.slice(-4)}`;
          const cpLink = explorer ? `${explorer}/address/${t.counterparty}` : null;
          return (
            <HStack
              key={`${t.token}-${i}`}
              justify="space-between"
              align="flex-start"
              spacing={2}
            >
              <HStack spacing={2} minW={0} flex="1">
                <TokenLogoOrPlaceholder logoUrl={t.logoUrl} symbol={t.symbol} alt={sym} />
                <VStack spacing={0} align="flex-start" minW={0}>
                  <Text
                    fontSize="xs"
                    fontWeight="800"
                    color="text.primary"
                    isTruncated
                    maxW="120px"
                  >
                    {sym}
                  </Text>
                  {cpLink ? (
                    <Button
                      size="xs"
                      variant="ghost"
                      fontWeight="600"
                      fontSize="2xs"
                      fontFamily="mono"
                      color="text.tertiary"
                      onClick={() => chrome.tabs.create({ url: cpLink })}
                      rightIcon={<ExternalLinkIcon boxSize={2.5} />}
                      _hover={{ bg: "bg.muted", color: "text.secondary" }}
                      px={1}
                      h="14px"
                      minH="14px"
                    >
                      {isNegative ? "to" : "from"} {cpShort}
                    </Button>
                  ) : (
                    <Text fontSize="2xs" fontFamily="mono" color="text.tertiary">
                      {isNegative ? "to" : "from"} {cpShort}
                    </Text>
                  )}
                </VStack>
              </HStack>
              <VStack spacing={0} align="flex-end">
                <Text
                  fontSize="xs"
                  fontWeight="800"
                  color={isNegative ? "chart.negative" : "chart.positive"}
                  fontFamily="mono"
                >
                  {formatted} {t.symbol ?? ""}
                </Text>
                {(() => {
                  const usd = formatUsd(t.amountWei, t.decimals ?? 18, chainId, t.token);
                  return usd ? (
                    <Text fontSize="2xs" color="text.tertiary" fontWeight="600">
                      {usd}
                    </Text>
                  ) : null;
                })()}
              </VStack>
            </HStack>
          );
        })}
      </VStack>
    </Box>
  );
}

/**
 * Compute the force-inclusion 2-step progress states from a tx record.
 *
 * The discriminator is `hasDistinctL2Hash`: when the L2 receipt poller
 * updates a tx to status="failed" because the L2 tx reverted, it preserves
 * the L2 hash that was set when L1 was originally confirmed. So:
 *   - tx.txHash !== meta.l1TxHash → L1 succeeded, L2 hash was extracted
 *   - tx.txHash === meta.l1TxHash (or absent) → L1 never produced an L2 hash
 *     (either L1 reverted, or extractL2Hash fell back to the L1 hash)
 *
 * This lets us distinguish "L1 failed" from "L2 failed" purely from the
 * stored state, without parsing error strings.
 */
function getForceInclusionState(
  meta: ForceInclusionMeta,
  status: string,
  txHash: string | undefined,
) {
  const hasDistinctL2Hash = !!(txHash && txHash !== meta.l1TxHash);
  const l1Confirmed =
    status === "pending" ||
    status === "success" ||
    (status === "failed" && hasDistinctL2Hash);
  const l1Reverted = status === "failed" && !hasDistinctL2Hash;
  const l2Confirmed = meta.l2Confirmed || status === "success";
  const l2Reverted = status === "failed" && hasDistinctL2Hash;
  return { hasDistinctL2Hash, l1Confirmed, l1Reverted, l2Confirmed, l2Reverted };
}

function ForceInclusionSteps({
  meta,
  status,
  txHash,
}: {
  meta: ForceInclusionMeta;
  status: string;
  txHash: string | undefined;
}) {
  const { themeId } = useTheme();
  const isDarkTheme = themeId === "midnight";
  // The step circles are vivid filled discs (red/green/blue) with a small icon
  // inside. White contrasts well against the vivid Bauhaus palette but vanishes
  // against Midnight's lighter chart tints — flip to a near-black icon there.
  const stepIconColor = isDarkTheme ? "fg.inverse" : "white";
  const l1Config = getChainConfig(meta.l1ChainId);
  const l2Config = getChainConfig(meta.l2ChainId);
  const l1HasHash = !!meta.l1TxHash;
  const { l1Confirmed, l1Reverted, l2Confirmed, l2Reverted } =
    getForceInclusionState(meta, status, txHash);

  return (
    <Box
      border="2px solid"
      borderColor="border.default"
      bg="bg.muted"
      p={3}
    >
      <Text fontSize="2xs" fontWeight="700" textTransform="uppercase" color="text.secondary" mb={2}>
        Force Inclusion Progress
      </Text>
      <VStack spacing={2} align="stretch">
        {/* Step 1: L1 */}
        <HStack spacing={2}>
          <Box
            w="18px" h="18px" flexShrink={0}
            border="2px solid" borderColor="border.default"
            bg={l1Reverted ? "chart.negative" : l1Confirmed ? "chart.positive" : "accent.secondary"}
            display="flex" alignItems="center" justifyContent="center"
          >
            {l1Reverted ? (
              <WarningIcon boxSize={2.5} color={stepIconColor} />
            ) : l1Confirmed ? (
              <CheckCircleIcon boxSize={2.5} color={stepIconColor} />
            ) : (
              <Spinner size="xs" color={stepIconColor} boxSize="10px" />
            )}
          </Box>
          <Text fontSize="xs" fontWeight="700" color="text.primary">
            L1 Deposit ({l1Config.name || "Ethereum"})
          </Text>
          {l1Reverted ? (
            <Text fontSize="2xs" color="chart.negative" fontWeight="600">Failed</Text>
          ) : l1Confirmed ? (
            <Text fontSize="2xs" color="chart.positive" fontWeight="600">Confirmed</Text>
          ) : l1HasHash ? (
            <Text fontSize="2xs" color="accent.secondary" fontWeight="600">Pending...</Text>
          ) : null}
        </HStack>
        {/* Step 2: L2 */}
        <HStack spacing={2}>
          <Box
            w="18px" h="18px" flexShrink={0}
            border="2px solid" borderColor="border.default"
            bg={
              l2Reverted
                ? "chart.negative"
                : l2Confirmed
                  ? "chart.positive"
                  : l1Confirmed
                    ? "accent.secondary"
                    : "border.subtle"
            }
            display="flex" alignItems="center" justifyContent="center"
          >
            {l2Reverted ? (
              <WarningIcon boxSize={2.5} color={stepIconColor} />
            ) : l2Confirmed ? (
              <CheckCircleIcon boxSize={2.5} color={stepIconColor} />
            ) : l1Confirmed ? (
              <Spinner size="xs" color={stepIconColor} boxSize="10px" />
            ) : (
              <Text fontSize="2xs" fontWeight="800" color="text.tertiary">2</Text>
            )}
          </Box>
          <Text fontSize="xs" fontWeight="700" color={l1Confirmed ? "text.primary" : "text.tertiary"}>
            L2 Sequencer ({l2Config.name || "L2"})
          </Text>
          {l2Reverted ? (
            <Text fontSize="2xs" color="chart.negative" fontWeight="600">Reverted</Text>
          ) : l2Confirmed ? (
            <Text fontSize="2xs" color="chart.positive" fontWeight="600">Confirmed</Text>
          ) : l1Confirmed ? (
            <Text fontSize="2xs" color="accent.secondary" fontWeight="600">Awaiting inclusion...</Text>
          ) : null}
        </HStack>
      </VStack>
    </Box>
  );
}

function TxDetailModal({ isOpen, onClose, tx }: TxDetailModalProps) {
  const { networksInfo } = useNetworks();
  const resolvedChain = getResolvedChainById(tx.chainId, networksInfo);
  const config = getChainConfig(tx.chainId);
  // Chain badge colors — all per-theme branching lives in `useChainBadgeStyle`.
  const chainBadgeStyle = useChainBadgeStyle(
    resolvedChain?.bg ?? config.bg,
    resolvedChain?.text ?? config.text,
    resolvedChain?.isCustom ?? false,
  );
  const hasCalldata = tx.tx.data && tx.tx.data !== "0x";
  const isContractDeploy = !tx.tx.to;
  const isL2 = OP_STACK_CHAIN_IDS.has(tx.chainId);
  // When the modal already has a hero summary that answers "what did this
  // tx do?", the raw From/To/Value/Calldata rows are power-user details so
  // we default them collapsed. Hero sources, in priority order:
  //   - clear-signed snapshot (Approved/Transferred/Native-send/ERC-7730)
  //   - swap meta (sell→buy tokens; rendered by SwapSummaryCard above)
  //   - bridge meta (destination chain block also above)
  // Bridge / swap txs are virtually always wallet-initiated, so this is
  // also the place to honor "collapse for wallet-initiated swap txs".
  const hasHero =
    !!tx.clearSignedMeta || !!tx.swapMeta || !!tx.bridge;
  const [rawDetailsExpanded, setRawDetailsExpanded] = useState(!hasHero);
  const [gasExpanded, setGasExpanded] = useState(false);
  const [errorExpanded, setErrorExpanded] = useState(false);
  const [isRebroadcasting, setIsRebroadcasting] = useState(false);
  // Source-chain native USD price for the Value + Transaction Fee rows.
  // Fetched lazily once the modal opens. Almost every recorded tx has a
  // non-zero gas fee, so we don't bother gating on value/fee here — the
  // single CoinGecko call covers both rows.
  const [nativePriceUsd, setNativePriceUsd] = useState<number | null>(null);
  useEffect(() => {
    if (!isOpen) return;
    chrome.runtime.sendMessage(
      { type: "fetchNativePrice", chainId: tx.chainId },
      (res) => {
        if (res?.success && typeof res.priceUsd === "number" && res.priceUsd > 0) {
          setNativePriceUsd(res.priceUsd);
        }
      },
    );
  }, [isOpen, tx.chainId]);

  // USD prices keyed by `${chainId}-${address-lowercase}` for ERC-20s and
  // `${chainId}-native` for native deltas. Populated lazily from assetChanges
  // + destAssetChanges + bridge dest chain native so the Token Changes rows
  // and Source / Destination cards can show a USD subtitle. Uses the same
  // backend chain as the rest of the wallet — proxy `fetchTokenPrice` (which
  // already short-circuits via portfolio API + CoinGecko fallback) for ERC-20s
  // and `fetchNativePrice` for native; results are cached at the background
  // layer so re-opens are free.
  const [tokenPricesUsd, setTokenPricesUsd] = useState<Record<string, number>>({});
  useEffect(() => {
    if (!isOpen) return;
    const requests: Array<{ key: string; chainId: number; address: string | "native" }> = [];
    const seen = new Set<string>();
    const addReq = (chainId: number, address: string | "native") => {
      const addrLower = address === "native" ? "native" : address.toLowerCase();
      const key = `${chainId}-${addrLower}`;
      if (seen.has(key)) return;
      seen.add(key);
      requests.push({ key, chainId, address: addrLower });
    };
    const collect = (record: AssetChangeRecord | undefined, chainId: number) => {
      if (!record) return;
      if (record.nativeDelta) addReq(chainId, "native");
      for (const t of record.erc20Transfers) addReq(chainId, t.token);
    };
    collect(tx.assetChanges, tx.chainId);
    if (tx.bridge && tx.destAssetChanges) {
      collect(tx.destAssetChanges, tx.bridge.destinationChainId);
    }
    if (requests.length === 0) return;
    let cancelled = false;
    Promise.all(
      requests.map(
        (req) =>
          new Promise<{ key: string; priceUsd: number }>((resolve) => {
            const msg =
              req.address === "native"
                ? { type: "fetchNativePrice", chainId: req.chainId }
                : { type: "fetchTokenPrice", chainId: req.chainId, address: req.address };
            chrome.runtime.sendMessage(msg, (res) => {
              const price = res?.success ? Number(res.priceUsd ?? 0) : 0;
              resolve({ key: req.key, priceUsd: price > 0 ? price : 0 });
            });
          }),
      ),
    ).then((results) => {
      if (cancelled) return;
      setTokenPricesUsd((prev) => {
        const next = { ...prev };
        for (const { key, priceUsd } of results) {
          if (priceUsd > 0) next[key] = priceUsd;
        }
        return next;
      });
    });
    return () => {
      cancelled = true;
    };
  }, [
    isOpen,
    tx.chainId,
    tx.assetChanges,
    tx.destAssetChanges,
    tx.bridge?.destinationChainId,
  ]);

  /**
   * Format a (possibly signed) base-units token amount as `$N.NN` using the
   * price map. Returns null when the price is unknown or the USD result
   * rounds to zero.
   */
  const formatTokenAmountUsd = useCallback(
    (
      amountWei: string,
      decimals: number,
      chainId: number,
      addressOrNative: string | "native",
    ): string | null => {
      const key = `${chainId}-${addressOrNative === "native" ? "native" : addressOrNative.toLowerCase()}`;
      const price = tokenPricesUsd[key];
      if (!price || price <= 0) return null;
      let bi: bigint;
      try {
        bi = BigInt(amountWei);
      } catch {
        return null;
      }
      if (bi < 0n) bi = -bi;
      if (bi === 0n) return null;
      const divisor = 10n ** BigInt(decimals);
      const whole = Number(bi / divisor);
      const frac = Number(bi % divisor) / Number(divisor);
      const usd = (whole + frac) * price;
      if (usd <= 0) return null;
      return usd < 0.01 ? "<$0.01" : `$${usd.toFixed(2)}`;
    },
    [tokenPricesUsd],
  );

  // Format a wei-amount as `$N.NN`, returning null when the price is missing
  // or the wei amount is zero. Used by both the Value and Transaction Fee
  // rows to render the inline USD equivalent.
  const formatWeiUsd = useCallback(
    (raw: string | undefined | null): string | null => {
      if (!raw || !nativePriceUsd || nativePriceUsd <= 0) return null;
      try {
        const wei = BigInt(raw);
        if (wei === 0n) return null;
        const usd = (Number(wei) / 1e18) * nativePriceUsd;
        if (usd <= 0) return null;
        return usd < 0.01 ? "<$0.01" : `$${usd.toFixed(2)}`;
      } catch {
        return null;
      }
    },
    [nativePriceUsd],
  );
  const toast = useThemedToast();
  const { themeId } = useTheme();
  // On midnight, the error.fg coral reads as another "error" cue on top of the
  // already-red container — use a neutral light surface so the CTA feels like
  // an action, not a warning. Bauhaus error.fg is already WHITE, so it's fine.
  const rebroadcastBg = themeId === "midnight" ? "fg.primary" : "status.error.fg";
  const rebroadcastFg = themeId === "midnight" ? "fg.inverse" : "status.error.bg";

  const canRebroadcast =
    tx.status === "failed" &&
    !!tx.error &&
    tx.error.toLowerCase().includes("dropped from the mempool") &&
    !!tx.tx.to;

  const handleRebroadcast = async () => {
    if (!tx.tx.to) return;
    setIsRebroadcasting(true);
    try {
      const result = await new Promise<{ success: boolean; error?: string }>(
        (resolve) => {
          chrome.runtime.sendMessage(
            {
              type: "initiateTransfer",
              tx: {
                from: tx.tx.from,
                to: tx.tx.to,
                data: tx.tx.data,
                value: tx.tx.value,
                chainId: tx.tx.chainId,
              },
              chainName: tx.chainName,
            },
            resolve,
          );
        },
      );
      if (result.success) {
        onClose();
      } else {
        toast({
          title: "Rebroadcast failed",
          description: result.error || "Could not create a new transaction request",
          status: "error",
        });
      }
    } catch (e) {
      toast({
        title: "Rebroadcast failed",
        description: e instanceof Error ? e.message : "Unknown error",
        status: "error",
      });
    } finally {
      setIsRebroadcasting(false);
    }
  };

  // Native currency symbol — fast for hardcoded chains, async for custom
  const [nativeSym, setNativeSym] = useState(
    resolvedChain?.nativeCurrency.symbol ?? "ETH",
  );
  useEffect(() => {
    if (resolvedChain?.nativeCurrency.symbol) {
      setNativeSym(resolvedChain.nativeCurrency.symbol);
      return;
    }
    getStoredNativeCurrencySymbol(tx.chainId).then(setNativeSym).catch(() => {});
  }, [resolvedChain, tx.chainId]);

  // On-demand gas data fetching for txs that don't have it yet
  const [gasData, setGasData] = useState<GasData | undefined>(tx.gasData);

  useEffect(() => {
    setGasData(tx.gasData);
    setGasExpanded(false);

    if (tx.gasData || !tx.txHash || tx.status !== "success" || !isOpen) return;

    let cancelled = false;

    (async () => {
      const rpcUrl = await getStoredRpcUrl(tx.chainId);
      if (!rpcUrl || cancelled) return;

      try {
        const rpcCall = (method: string, params: any[]) =>
          fetch(rpcUrl!, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
          }).then((r) => r.json()).then((r) => r.result);

        const [txData, receipt] = await Promise.all([
          rpcCall("eth_getTransactionByHash", [tx.txHash!]),
          rpcCall("eth_getTransactionReceipt", [tx.txHash!]),
        ]);
        if (!receipt || cancelled) return;

        const data: GasData = {
          gasUsed: BigInt(receipt.gasUsed).toString(),
          gasLimit: txData?.gas ? BigInt(txData.gas).toString() : BigInt(receipt.gasUsed).toString(),
          effectiveGasPrice: BigInt(receipt.effectiveGasPrice).toString(),
        };

        if (OP_STACK_CHAIN_IDS.has(tx.chainId)) {
          if (receipt.l1Fee) data.l1Fee = BigInt(receipt.l1Fee).toString();
          if (receipt.l1GasUsed) data.l1GasUsed = BigInt(receipt.l1GasUsed).toString();
          if (receipt.l1GasPrice) data.l1GasPrice = BigInt(receipt.l1GasPrice).toString();
        }

        if (!cancelled) setGasData(data);
      } catch { /* non-critical */ }
    })();

    return () => { cancelled = true; };
  }, [tx.id, tx.gasData, tx.txHash, tx.status, tx.chainId, isOpen]);

  // Resolve explorer: hardcoded chain config first, then custom chain in networksInfo
  const explorerBase = resolvedChain?.explorer || config.explorer || "";

  const handleViewOnExplorer = () => {
    if (tx.txHash && explorerBase) {
      const hash = tx.txHash.match(/0x[a-fA-F0-9]{64}/)?.[0];
      if (hash) {
        chrome.tabs.create({ url: `${explorerBase}/tx/${hash}` });
      }
    }
  };

  // Compute derived gas values
  const txFee = gasData
    ? (BigInt(gasData.gasUsed) * BigInt(gasData.effectiveGasPrice) + BigInt(gasData.l1Fee || "0")).toString()
    : undefined;
  const gasUsagePercent = gasData
    ? ((Number(gasData.gasUsed) / Number(gasData.gasLimit)) * 100).toFixed(2)
    : undefined;
  const displayTimestamp = tx.completedAt ?? tx.createdAt;

  // Gas params we set / signed with. For PK/Seed paths these reflect the
  // tier-picker / Custom override; for Bankr / dapp-sponsored txs they
  // mirror whatever the dapp suggested. Used as a pre-confirmation fallback
  // so pending txs still show gas info before a receipt arrives.
  const setGas = tx.tx.gas;
  const setMaxFee = tx.tx.maxFeePerGas;
  const setPriority = tx.tx.maxPriorityFeePerGas;
  const setGasPrice = tx.tx.gasPrice;
  const hasSetGasParams = !!(setGas || setMaxFee || setPriority || setGasPrice);
  const estimatedMaxCost = (() => {
    if (!setGas) return undefined;
    const priceStr = setMaxFee || setGasPrice;
    if (!priceStr) return undefined;
    try {
      return (BigInt(setGas) * BigInt(priceStr)).toString();
    } catch {
      return undefined;
    }
  })();

  return (
    <Modal isOpen={isOpen} onClose={onClose} scrollBehavior="inside" isCentered>
      <ModalOverlay bg="surface.overlay" />
      <ModalContent
        mx={3}
        my={3}
        maxH="calc(100vh - 24px)"
      >
        <ModalHeader
          color="text.primary"
          fontSize="md"
          pb={2}
          textTransform="uppercase"
          letterSpacing="wider"
          borderBottom="3px solid"
          borderColor="border.default"
          display="flex"
          alignItems="center"
          justifyContent="space-between"
        >
          Transaction Details
          <IconButton
            aria-label="Close"
            icon={<CloseIcon boxSize="10px" />}
            size="sm"
            variant="ghost"
            onClick={onClose}
            _hover={{ bg: "bg.muted" }}
          />
        </ModalHeader>

        <ModalBody px={4} py={3}>
          <VStack spacing={3} align="stretch">
            {/* Status + Chain row */}
            <HStack spacing={2} flexWrap="wrap">
              <Badge
                fontSize="xs"
                bg={chainBadgeStyle.bg}
                color={chainBadgeStyle.fg}
                border="2px solid"
                borderColor={chainBadgeStyle.border}
                px={2}
                py={0.5}
                display="flex"
                alignItems="center"
                gap={1}
              >
                <ChainIcon
                  chainId={tx.chainId}
                  chainName={resolvedChain?.name ?? tx.chainName}
                  size="10px"
                  withChip
                />
                {resolvedChain?.name ?? tx.chainName}
              </Badge>
              {tx.status === "pending" && !tx.forceInclusionMeta && (
                <Badge
                  bg="status.info.bg"
                  color="status.info.fg"
                  border="2px solid"
                  borderColor="border.default"
                  px={2}
                  py={0.5}
                  fontSize="xs"
                  display="flex"
                  alignItems="center"
                  gap={1}
                >
                  <Text fontSize="xs" lineHeight="1">
                    ⌛
                  </Text>
                  Pending...
                </Badge>
              )}
              {tx.status === "success" && (
                <Badge
                  bg="accent.highlight"
                  color="accentFg.highlight"
                  border="2px solid"
                  borderColor="border.default"
                  px={2}
                  py={0.5}
                  fontSize="xs"
                  display="flex"
                  alignItems="center"
                  gap={1}
                >
                  <CheckCircleIcon boxSize={3} />
                  {tx.forceInclusionMeta ? "L1 + L2 Confirmed" : "Confirmed"}
                </Badge>
              )}
              {tx.status === "failed" && (() => {
                // For force inclusion, distinguish L1 vs L2 failure so the user
                // immediately sees which side broke. The discriminator is
                // hasDistinctL2Hash — see getForceInclusionState above.
                let label = "Failed";
                if (tx.forceInclusionMeta) {
                  const { l1Reverted, l2Reverted } = getForceInclusionState(
                    tx.forceInclusionMeta,
                    tx.status,
                    tx.txHash,
                  );
                  if (l1Reverted) label = "L1 Failed";
                  else if (l2Reverted) label = "L2 Failed";
                }
                return (
                  <Badge
                    bg="status.error.bg"
                    color="status.error.fg"
                    border="2px solid"
                    borderColor="border.default"
                    px={2}
                    py={0.5}
                    fontSize="xs"
                    display="flex"
                    alignItems="center"
                    gap={1}
                  >
                    <WarningIcon boxSize={3} />
                    {label}
                  </Badge>
                );
              })()}
            </HStack>

            {/* Force Inclusion 2-step status */}
            {tx.forceInclusionMeta && (
              <ForceInclusionSteps
                meta={tx.forceInclusionMeta}
                status={tx.status}
                txHash={tx.txHash}
              />
            )}

            {/* Cross-chain destination block. Appears once the user has
                bridged: shows the destination chain + (if known) the
                destination tx hash, route name, and current Bungee status
                code label. Source explorer link is the regular "View on
                explorer" button below; this block adds the destination
                counterpart. */}
            {tx.bridge && tx.swapMeta && (() => {
              // Source block: mirror the destination card's visual hierarchy
              // (chain icon + 2-line label, "You Sent" token row) so the
              // user sees the bridge route at a glance — source chain +
              // sell token at top, destination chain + buy token below.
              const sellLogo = tx.swapMeta.sellTokenLogo;
              const sellSymbol = tx.swapMeta.sellTokenSymbol;
              const srcChainName = resolvedChain?.name ?? tx.chainName;
              // Match the actual on-chain outflow to the swap's sell token
              // so the row reads "1.234 USDC" once assetChanges lands. Native
              // sells fall back to abs(nativeDelta).
              const sellAmount = pickSwapAmount(
                tx.assetChanges,
                "out",
                sellSymbol,
                sellSymbol?.toLowerCase() === nativeSym.toLowerCase(),
                18,
              );
              return (
                <Box
                  bg="surface.sunken"
                  border="2px solid"
                  borderColor="border.default"
                  borderRadius="lg"
                  p={2.5}
                >
                  <HStack justify="space-between" align="center" mb={sellSymbol ? 2.5 : 0}>
                    <HStack spacing={2} flexShrink={0}>
                      <ChainIcon
                        chainId={tx.chainId}
                        chainName={srcChainName}
                        size="16px"
                        withChip
                      />
                      <VStack spacing={0} align="flex-start">
                        <Text
                          fontSize="2xs"
                          fontWeight="800"
                          textTransform="uppercase"
                          color="text.tertiary"
                          letterSpacing="wide"
                          lineHeight="1"
                        >
                          Source
                        </Text>
                        <Text
                          fontSize="sm"
                          fontWeight="800"
                          color="text.primary"
                          lineHeight="1.2"
                        >
                          {srcChainName}
                        </Text>
                      </VStack>
                    </HStack>
                    {tx.txHash && explorerBase && (
                      <IconButton
                        aria-label="View source tx on explorer"
                        icon={<ExternalLinkIcon boxSize={3} />}
                        size="xs"
                        variant="ghost"
                        h="20px"
                        minW="20px"
                        color="text.tertiary"
                        onClick={(e) => {
                          e.stopPropagation();
                          const hash = tx.txHash!.match(/0x[a-fA-F0-9]{64}/)?.[0];
                          if (hash) chrome.tabs.create({ url: `${explorerBase}/tx/${hash}` });
                        }}
                        _hover={{ bg: "bg.muted", color: "text.primary" }}
                      />
                    )}
                  </HStack>
                  {sellSymbol && (
                    <VStack spacing={1.5} align="stretch" fontSize="xs">
                      <HStack justify="space-between" align="flex-start">
                        <Text fontWeight="700" color="text.secondary">
                          You Sent
                        </Text>
                        <VStack spacing={0} align="flex-end">
                          <HStack spacing={1.5}>
                            {sellAmount && (
                              <Text
                                fontWeight="800"
                                color="chart.negative"
                                fontFamily="mono"
                              >
                                −{sellAmount.amountLabel}
                              </Text>
                            )}
                            {sellLogo && (
                              <Image
                                src={sellLogo}
                                alt={sellSymbol}
                                boxSize="16px"
                                borderRadius="full"
                              />
                            )}
                            <Text fontWeight="800">{sellSymbol}</Text>
                          </HStack>
                          {sellAmount &&
                            (() => {
                              const usd = formatTokenAmountUsd(
                                sellAmount.amountWei,
                                sellAmount.decimals,
                                tx.chainId,
                                sellAmount.source,
                              );
                              return usd ? (
                                <Text fontSize="2xs" color="text.tertiary" fontWeight="600">
                                  {usd}
                                </Text>
                              ) : null;
                            })()}
                        </VStack>
                      </HStack>
                    </VStack>
                  )}
                </Box>
              );
            })()}

            {tx.bridge && (() => {
              const statusLabels = [
                "Pending",
                "Assigned",
                "Extracted",
                "Fulfilled",
                "Settled",
                "Expired",
                "Cancelled",
                "Refunded",
              ] as const;
              const statusCode = tx.bridge.bungeeStatusCode;
              const statusLabel =
                statusCode !== undefined
                  ? statusLabels[statusCode] ?? `Code ${statusCode}`
                  : null;
              // Color-code: green for settled-good (3/4), red for bad terminal
              // (5/6/7), accent (in-flight blue) for everything else.
              const statusTone: "good" | "bad" | "pending" =
                statusCode === 3 || statusCode === 4
                  ? "good"
                  : statusCode === 5 || statusCode === 6 || statusCode === 7
                    ? "bad"
                    : "pending";
              const statusBg =
                statusTone === "good"
                  ? "status.success.bg"
                  : statusTone === "bad"
                    ? "status.error.bg"
                    : "status.info.bg";
              const statusFg =
                statusTone === "good"
                  ? "status.success.fg"
                  : statusTone === "bad"
                    ? "status.error.fg"
                    : "status.info.fg";
              const destExplorer = getChainConfig(tx.bridge.destinationChainId).explorer;
              const destLink =
                tx.bridge.destinationTxHash && destExplorer
                  ? `${destExplorer}/tx/${tx.bridge.destinationTxHash}`
                  : null;
              const buyLogo = tx.swapMeta?.buyTokenLogo;
              const buySymbol = tx.swapMeta?.buyTokenSymbol;
              return (
                <Box
                  bg="surface.sunken"
                  border="2px solid"
                  borderColor="border.default"
                  borderRadius="lg"
                  p={2.5}
                >
                  {/* Header: chain logo + destination chain name + status pill */}
                  <HStack justify="space-between" align="center" mb={2.5}>
                    <HStack spacing={2} flexShrink={0}>
                      <ChainIcon
                        chainId={tx.bridge.destinationChainId}
                        chainName={tx.bridge.destinationChainName}
                        size="16px"
                        withChip
                      />
                      <VStack spacing={0} align="flex-start">
                        <Text
                          fontSize="2xs"
                          fontWeight="800"
                          textTransform="uppercase"
                          color="text.tertiary"
                          letterSpacing="wide"
                          lineHeight="1"
                        >
                          Destination
                        </Text>
                        <Text
                          fontSize="sm"
                          fontWeight="800"
                          color="text.primary"
                          lineHeight="1.2"
                        >
                          {tx.bridge.destinationChainName}
                        </Text>
                      </VStack>
                    </HStack>
                    <HStack spacing={1.5} flexShrink={0}>
                      {statusLabel && (
                        <Box
                          bg={statusBg}
                          color={statusFg}
                          px={2}
                          py={0.5}
                          borderRadius="md"
                          fontSize="2xs"
                          fontWeight="800"
                          textTransform="uppercase"
                          letterSpacing="wide"
                        >
                          {statusLabel}
                        </Box>
                      )}
                      {destLink ? (
                        <IconButton
                          aria-label="View destination tx on explorer"
                          icon={<ExternalLinkIcon boxSize={3} />}
                          size="xs"
                          variant="ghost"
                          h="20px"
                          minW="20px"
                          color="text.tertiary"
                          onClick={(e) => {
                            e.stopPropagation();
                            chrome.tabs.create({ url: destLink });
                          }}
                          _hover={{ bg: "bg.muted", color: "text.primary" }}
                        />
                      ) : (
                        // Still waiting on Bungee — show a spinner so the
                        // user knows the dest hash is in-flight.
                        !tx.bridge.destinationTxHash && <LoadingDots />
                      )}
                    </HStack>
                  </HStack>

                  <VStack spacing={1.5} align="stretch" fontSize="xs">
                    {/* You received — token logo + symbol + on-chain amount
                        once destAssetChanges lands. The dest-chain receiver
                        didn't pay gas, so abs(nativeDelta) is a clean fallback
                        when the buy token is the destination chain's native. */}
                    {buySymbol && (() => {
                      const destNativeSym =
                        getChainConfig(tx.bridge!.destinationChainId)
                          .nativeCurrency?.symbol ?? "ETH";
                      const buyAmount = pickSwapAmount(
                        tx.destAssetChanges,
                        "in",
                        buySymbol,
                        buySymbol.toLowerCase() === destNativeSym.toLowerCase(),
                        18,
                      );
                      return (
                        <HStack justify="space-between" align="flex-start">
                          <Text fontWeight="700" color="text.secondary">
                            You Received
                          </Text>
                          <VStack spacing={0} align="flex-end">
                            <HStack spacing={1.5}>
                              {buyAmount && (
                                <Text
                                  fontWeight="800"
                                  color="chart.positive"
                                  fontFamily="mono"
                                >
                                  +{buyAmount.amountLabel}
                                </Text>
                              )}
                              {buyLogo && (
                                <Image
                                  src={buyLogo}
                                  alt={buySymbol}
                                  boxSize="16px"
                                  borderRadius="full"
                                />
                              )}
                              <Text fontWeight="800">{buySymbol}</Text>
                            </HStack>
                            {buyAmount &&
                              (() => {
                                const usd = formatTokenAmountUsd(
                                  buyAmount.amountWei,
                                  buyAmount.decimals,
                                  tx.bridge!.destinationChainId,
                                  buyAmount.source,
                                );
                                return usd ? (
                                  <Text fontSize="2xs" color="text.tertiary" fontWeight="600">
                                    {usd}
                                  </Text>
                                ) : null;
                              })()}
                          </VStack>
                        </HStack>
                      );
                    })()}
                    {tx.bridge.refundTxHash && (
                      <HStack justify="space-between">
                        <Text fontWeight="700" color="text.secondary">Refund</Text>
                        <Text fontFamily="mono" fontSize="2xs" color="chart.negative">
                          {`${tx.bridge.refundTxHash.slice(0, 8)}…${tx.bridge.refundTxHash.slice(-4)}`}
                        </Text>
                      </HStack>
                    )}
                  </VStack>
                </Box>
              );
            })()}

            {/* Post-confirm asset changes — what *actually* flowed in/out of
                the user's wallet on chain (decoded from the receipt's
                Transfer logs + native balance diff). For wallet-initiated
                bridges (`swapMeta + bridge`) the sell/buy rows are already
                shown inline in the Source / Destination blocks above, so we
                suppress these cards to avoid duplication. */}
            {tx.assetChanges && !(tx.bridge && tx.swapMeta) && (
              <AssetChangesCard
                record={tx.assetChanges}
                chainId={tx.chainId}
                chainName={tx.chainName}
                nativeSym={nativeSym}
                label="Token Changes"
                formatUsd={formatTokenAmountUsd}
              />
            )}
            {tx.destAssetChanges && tx.bridge && !tx.swapMeta && (
              <AssetChangesCard
                record={tx.destAssetChanges}
                chainId={tx.bridge.destinationChainId}
                chainName={tx.bridge.destinationChainName}
                nativeSym={
                  getChainConfig(tx.bridge.destinationChainId).nativeCurrency
                    ?.symbol ?? "ETH"
                }
                label={`On ${tx.bridge.destinationChainName}`}
                formatUsd={formatTokenAmountUsd}
              />
            )}

            <HStack justify="space-between" align="center" spacing={3}>
              {tx.forceInclusionMeta ? (
                <HStack spacing={2}>
                  {/* L1 explorer link */}
                  {tx.forceInclusionMeta.l1TxHash && (
                    <Button
                      size="xs"
                      variant="ghost"
                      fontWeight="700"
                      fontSize="2xs"
                      textTransform="uppercase"
                      letterSpacing="wide"
                      border="2px solid"
                      borderColor="border.default"
                      px={2}
                      h="22px"
                      onClick={() => {
                        const l1Explorer = getChainConfig(tx.forceInclusionMeta!.l1ChainId).explorer;
                        if (l1Explorer) chrome.tabs.create({ url: `${l1Explorer}/tx/${tx.forceInclusionMeta!.l1TxHash}` });
                      }}
                      rightIcon={<ExternalLinkIcon boxSize={2.5} />}
                      _hover={{ bg: "bg.muted" }}
                    >
                      L1 Tx
                    </Button>
                  )}
                  {/* L2 explorer link — show whenever we have a distinct L2 hash
                       AND the L2 tx has resolved (success or failed/reverted).
                       During the L1-Confirmed/L2-Pending window (status === "pending")
                       the L2 explorer doesn't have the tx yet, so we still hide it.
                       Also hidden when txHash falls back to the L1 hash
                       (extractL2Hash failed — no real L2 hash to link). */}
                  {(tx.status === "success" || tx.status === "failed") && tx.txHash && tx.txHash !== tx.forceInclusionMeta.l1TxHash && explorerBase && (
                    <Button
                      size="xs"
                      variant="ghost"
                      fontWeight="700"
                      fontSize="2xs"
                      textTransform="uppercase"
                      letterSpacing="wide"
                      border="2px solid"
                      borderColor="border.default"
                      px={2}
                      h="22px"
                      onClick={handleViewOnExplorer}
                      rightIcon={<ExternalLinkIcon boxSize={2.5} />}
                      _hover={{ bg: "bg.muted" }}
                    >
                      L2 Tx
                    </Button>
                  )}
                </HStack>
              ) : tx.txHash && explorerBase ? (
                <Button
                  size="xs"
                  variant="ghost"
                  fontWeight="700"
                  fontSize="2xs"
                  textTransform="uppercase"
                  letterSpacing="wide"
                  border="2px solid"
                  borderColor="border.default"
                  px={2}
                  h="22px"
                  onClick={handleViewOnExplorer}
                  rightIcon={<ExternalLinkIcon boxSize={2.5} />}
                  _hover={{ bg: "bg.muted" }}
                >
                  View on Explorer
                </Button>
              ) : (
                <Box />
              )}
              <Text fontSize="2xs" fontWeight="600" color="text.tertiary" textAlign="right">
                {formatLocalTimestamp(displayTimestamp)}
              </Text>
            </HStack>

            {/* Human-readable clear-signed hero. Snapshot-driven, so it
                paints synchronously on every reopen — no RPC / eth.sh / ENS
                calls. Hidden when no snapshot was captured (older entries,
                contract deploys, opaque calldata). */}
            {tx.clearSignedMeta && (
              <ClearSignedSummaryCard meta={tx.clearSignedMeta} chainId={tx.chainId} />
            )}

            {/* Toggle for the raw tx details. Default collapsed when the
                hero card is showing (the hero already answers "what did this
                do?"); default expanded for everything else so non-clear-
                signed txs render the same shape they did before. */}
            <HStack
              cursor="pointer"
              onClick={() => setRawDetailsExpanded(!rawDetailsExpanded)}
              _hover={{ bg: "bg.muted" }}
              borderRadius="md"
              px={1}
              py={1}
              justify="space-between"
            >
              <Text fontSize="xs" color="text.secondary" fontWeight="700" textTransform="uppercase">
                Transaction Details
              </Text>
              {rawDetailsExpanded
                ? <ChevronUpIcon boxSize={4} color="text.tertiary" />
                : <ChevronDownIcon boxSize={4} color="text.tertiary" />
              }
            </HStack>

            <Collapse in={rawDetailsExpanded} animateOpacity>
              <VStack spacing={3} align="stretch">
            {/* Function name */}
            {tx.functionName && (
              <Box>
                <Text fontSize="xs" color="text.secondary" fontWeight="700" textTransform="uppercase" mb={1}>
                  Function
                </Text>
                <Code
                  px={2}
                  py={1}
                  fontSize="xs"
                  bg="accent.secondary"
                  color="accentFg.secondary"
                  fontFamily="mono"
                  border="2px solid"
                  borderColor="border.default"
                  fontWeight="700"
                >
                  {tx.functionName}
                </Code>
              </Box>
            )}

            {/* Transfer meta (sponsored transfers) */}
            {tx.transferMeta ? (
              <Box
                bg="surface.sunken"
                border="1px solid"
                borderColor="border.subtle"
                borderRadius="md"
                p={3}
              >
                <VStack align="stretch" spacing={3}>
                  {/* Amount + Token */}
                  <Box>
                    <Text fontSize="xs" color="text.secondary" fontWeight="700" textTransform="uppercase" mb={1}>
                      Amount
                    </Text>
                    <HStack spacing={2}>
                      {tx.transferMeta.tokenLogo && (
                        <Image
                          src={tx.transferMeta.tokenLogo}
                          alt={tx.transferMeta.symbol}
                          boxSize="20px"
                          borderRadius="full"
                        />
                      )}
                      <Text fontSize="sm" fontWeight="800" color="text.primary">
                        {tx.transferMeta.amount} {tx.transferMeta.symbol}
                      </Text>
                    </HStack>
                  </Box>

                  {/* From */}
                  <Box>
                    <Text fontSize="xs" color="text.secondary" fontWeight="700" textTransform="uppercase" mb={1}>
                      From
                    </Text>
                    <FromAccountDisplay address={tx.tx.from} />
                  </Box>

                  {/* To (actual recipient) */}
                  <Box>
                    <Text fontSize="xs" color="text.secondary" fontWeight="700" textTransform="uppercase" mb={1}>
                      To
                    </Text>
                    <AddressParam value={tx.transferMeta.recipient} chainId={tx.chainId} />
                  </Box>
                </VStack>
              </Box>
            ) : (
              <>
                {/* From → To card — recessed surface + border gives visual
                    separation from the modal's raised backdrop so each
                    section reads as its own tile. */}
                <Box
                  bg="surface.sunken"
                  border="1px solid"
                  borderColor="border.subtle"
                  borderRadius="md"
                  p={3}
                >
                  <HStack spacing={2} align="start">
                    {/* From (our wallet) */}
                    <VStack align="start" spacing={0} flex={1} minW={0}>
                      <Text fontSize="xs" color="text.secondary" fontWeight="700" textTransform="uppercase" mb={1}>
                        From
                      </Text>
                      <FromAccountDisplay address={tx.tx.from} />
                    </VStack>

                    {/* Arrow */}
                    <Text fontSize="md" fontWeight="800" color="text.tertiary" pt={5}>
                      →
                    </Text>

                    {/* To */}
                    <VStack align="start" spacing={0} flex={1} minW={0}>
                      <Text fontSize="xs" color="text.secondary" fontWeight="700" textTransform="uppercase" mb={1}>
                        {isContractDeploy ? "Type" : "To"}
                      </Text>
                      {isContractDeploy ? (
                        <Badge
                          fontSize="2xs"
                          bg="accent.highlight"
                          color="accentFg.highlight"
                          border="2px solid"
                          borderColor="border.default"
                          fontWeight="700"
                          px={1.5}
                          py={0.5}
                        >
                          Contract Deploy
                        </Badge>
                      ) : (
                        <AddressParam value={tx.tx.to!} chainId={tx.chainId} />
                      )}
                    </VStack>
                  </HStack>
                </Box>

                {/* Value card — single-line layout: label on the left, amount
                    + optional USD on the right so the card stays compact. */}
                <Box
                  bg="surface.sunken"
                  border="1px solid"
                  borderColor="border.subtle"
                  borderRadius="md"
                  px={3}
                  py={2}
                >
                  <HStack justify="space-between" align="center" spacing={2}>
                    <Text
                      fontSize="xs"
                      color="text.secondary"
                      fontWeight="700"
                      textTransform="uppercase"
                    >
                      Value
                    </Text>
                    <HStack spacing={2} align="baseline">
                      <Text fontSize="sm" fontWeight="700" color="text.primary">
                        {formatValue(tx.tx.value, nativeSym)}
                      </Text>
                      {(() => {
                        const usd = formatWeiUsd(tx.tx.value);
                        return usd ? (
                          <Text fontSize="xs" color="text.tertiary" fontWeight="600">
                            {usd}
                          </Text>
                        ) : null;
                      })()}
                    </HStack>
                  </HStack>
                </Box>
              </>
            )}

            {/* Calldata. Lives inside the collapse alongside From/To/Value
                since it answers the same "what is the raw payload?" question.
                The hero card above already provides the human-readable view
                for clear-signed txs. */}
            {hasCalldata && !isContractDeploy && tx.tx.to && (
              <Box>
                <Text fontSize="xs" color="text.secondary" fontWeight="700" textTransform="uppercase" mb={1}>
                  Calldata
                </Text>
                <CalldataDecoder calldata={tx.tx.data!} to={tx.tx.to} chainId={tx.chainId} />
              </Box>
            )}

            {/* Deploy data for contract deployments */}
            {hasCalldata && isContractDeploy && (
              <Box>
                <HStack mb={1}>
                  <Text fontSize="xs" color="text.secondary" fontWeight="700" textTransform="uppercase">
                    Deploy Data
                  </Text>
                  <Spacer />
                  <CopyButton value={tx.tx.data!} />
                </HStack>
                <Box
                  p={3}
                  bg="bg.muted"
                  border="2px solid"
                  borderColor="border.default"
                  maxH="100px"
                  overflowY="auto"
                  css={{
                    "&::-webkit-scrollbar": { width: "6px" },
                    "&::-webkit-scrollbar-track": {
                      background: "var(--chakra-colors-bg-muted)",
                    },
                    "&::-webkit-scrollbar-thumb": {
                      background: "var(--chakra-colors-border-strong)",
                    },
                  }}
                >
                  <Text fontSize="xs" fontFamily="mono" color="text.tertiary" wordBreak="break-all" whiteSpace="pre-wrap">
                    {tx.tx.data}
                  </Text>
                </Box>
              </Box>
            )}
              </VStack>
            </Collapse>

            {/* Gas — collapsible. Shows the receipt-side effective fee once
                gasData lands, and falls back to the gas params we signed
                with (gas limit, max fee, priority fee) so pending txs aren't
                blank. */}
            {(() => {
              const showConfirmedFee = !!(gasData && txFee);
              const showSetParams = !showConfirmedFee && hasSetGasParams;
              if (!showConfirmedFee && !showSetParams) return null;

              const headerLabel = showConfirmedFee ? "Transaction Fee" : "Estimated Max Fee";
              const headerCost = showConfirmedFee
                ? formatEth(txFee!, nativeSym)
                : estimatedMaxCost
                  ? formatEth(estimatedMaxCost, nativeSym)
                  : null;
              const headerCostUsd = formatWeiUsd(
                showConfirmedFee ? txFee : estimatedMaxCost,
              );

              return (
                <Box
                  bg="surface.sunken"
                  border="1px solid"
                  borderColor="border.subtle"
                  borderRadius="md"
                >
                  <HStack
                    px={3}
                    py={2}
                    cursor="pointer"
                    onClick={() => setGasExpanded(!gasExpanded)}
                    _hover={{ bg: "bg.muted" }}
                    justify="space-between"
                  >
                    <HStack spacing={2}>
                      <Text fontSize="xs" color="text.secondary" fontWeight="700" textTransform="uppercase">
                        {headerLabel}
                      </Text>
                    </HStack>
                    <HStack spacing={2}>
                      {headerCost && (
                        <Text fontSize="xs" fontWeight="700" color="text.primary" fontFamily="mono">
                          {headerCost}
                        </Text>
                      )}
                      {headerCostUsd && (
                        <Text fontSize="xs" fontWeight="600" color="text.tertiary">
                          {headerCostUsd}
                        </Text>
                      )}
                      {gasExpanded
                        ? <ChevronUpIcon boxSize={4} color="text.tertiary" />
                        : <ChevronDownIcon boxSize={4} color="text.tertiary" />
                      }
                    </HStack>
                  </HStack>

                  <Collapse in={gasExpanded} animateOpacity>
                    <VStack align="stretch" spacing={1.5} px={3} pb={3} pt={1}>
                      <Box h="1px" bg="border.subtle" />

                      {showConfirmedFee ? (
                        <>
                          <GasRow
                            label="Gas Price"
                            value={formatGwei(gasData!.effectiveGasPrice)}
                          />

                          <GasRow
                            label="Gas Limit & Usage"
                            value={`${formatNumber(gasData!.gasLimit)} | ${formatNumber(gasData!.gasUsed)} (${gasUsagePercent}%)`}
                          />

                          {isL2 && (
                            <>
                              <Box h="1px" bg="border.subtle" mt={0.5} mb={0.5} />
                              <GasRow
                                label="L2 Fees Paid"
                                value={formatEth((BigInt(gasData!.gasUsed) * BigInt(gasData!.effectiveGasPrice)).toString(), nativeSym)}
                              />
                              {gasData!.l1Fee && (
                                <GasRow label="L1 Fees Paid" value={formatEth(gasData!.l1Fee, nativeSym)} />
                              )}
                              {gasData!.l1GasPrice && (
                                <GasRow label="L1 Gas Price" value={formatGwei(gasData!.l1GasPrice)} />
                              )}
                              {gasData!.l1GasUsed && (
                                <GasRow label="L1 Gas Used" value={formatNumber(gasData!.l1GasUsed)} />
                              )}
                            </>
                          )}
                        </>
                      ) : (
                        <>
                          {setGas && (
                            <GasRow
                              label="Gas Limit"
                              value={formatNumber(BigInt(setGas).toString())}
                            />
                          )}
                          {setMaxFee && (
                            <GasRow label="Max Fee" value={formatGwei(setMaxFee)} />
                          )}
                          {setPriority && (
                            <GasRow
                              label="Max Priority Fee"
                              value={formatGwei(setPriority)}
                            />
                          )}
                          {setGasPrice && !setMaxFee && (
                            <GasRow label="Gas Price" value={formatGwei(setGasPrice)} />
                          )}
                        </>
                      )}
                    </VStack>
                  </Collapse>
                </Box>
              );
            })()}

            {/* Error for failed txs. viem errors (e.g. HttpRequestError) render
                as "shortMessage\n\nStatus: …\nURL: …\nRequest body: {giant
                hex…}" — when that lands here verbatim it pushes the modal
                into a wall of unreadable hex. We split on the first newline:
                the line above it is the human-readable summary (viem's
                shortMessage), everything below goes behind a "Show details"
                collapse. Single-line errors render inline as before. */}
            {tx.status === "failed" && tx.error && (() => {
              const errorText = tx.error;
              const newlineIdx = errorText.indexOf("\n");
              const hasDetail = newlineIdx !== -1;
              const errorShort = hasDetail
                ? errorText.slice(0, newlineIdx).trim()
                : errorText;
              const errorDetail = hasDetail
                ? errorText.slice(newlineIdx + 1).trim()
                : "";

              return (
                <Box
                  p={3}
                  bg="status.error.bg"
                  border="2px solid"
                  borderColor="border.default"
                  borderRadius="md"
                >
                  <Text fontSize="xs" color="status.error.fg" fontWeight="700" mb={0.5} textTransform="uppercase">
                    Error
                  </Text>
                  <Text fontSize="xs" color="status.error.fg" fontWeight="500">
                    {errorShort}
                  </Text>

                  {hasDetail && (
                    <>
                      <HStack
                        mt={2}
                        spacing={1}
                        cursor="pointer"
                        onClick={() => setErrorExpanded(!errorExpanded)}
                        w="fit-content"
                        _hover={{ opacity: 0.8 }}
                      >
                        <Text
                          fontSize="2xs"
                          color="status.error.fg"
                          fontWeight="700"
                          textTransform="uppercase"
                          letterSpacing="wider"
                        >
                          {errorExpanded ? "Hide details" : "Show details"}
                        </Text>
                        {errorExpanded
                          ? <ChevronUpIcon boxSize={3} color="status.error.fg" />
                          : <ChevronDownIcon boxSize={3} color="status.error.fg" />
                        }
                      </HStack>
                      <Collapse in={errorExpanded} animateOpacity>
                        <Box
                          mt={2}
                          bg="bg.muted"
                          border="1px solid"
                          borderColor="border.subtle"
                          borderRadius="md"
                          overflow="hidden"
                        >
                          {/* Header strip — "FULL ERROR" label on the left,
                              copy button on the right. Sits OUTSIDE the
                              scrollable area so it stays visible while
                              scrolling through long viem payloads. */}
                          <HStack
                            justify="space-between"
                            align="center"
                            px={2}
                            py={1.5}
                            borderBottom="1px solid"
                            borderColor="border.subtle"
                            bg="surface.sunken"
                          >
                            <Text
                              fontSize="2xs"
                              fontWeight="700"
                              color="text.secondary"
                              textTransform="uppercase"
                              letterSpacing="wider"
                            >
                              Full Error
                            </Text>
                            <CopyButton value={errorText} />
                          </HStack>
                          <Box
                            maxH="200px"
                            overflowY="auto"
                            px={2.5}
                            py={2}
                            css={{
                              "&::-webkit-scrollbar": { width: "6px" },
                              "&::-webkit-scrollbar-track": {
                                background: "var(--chakra-colors-bg-muted)",
                              },
                              "&::-webkit-scrollbar-thumb": {
                                background: "var(--chakra-colors-border-strong)",
                              },
                            }}
                          >
                            <Text
                              fontSize="xs"
                              fontFamily="mono"
                              color="text.secondary"
                              lineHeight="1.55"
                              wordBreak="break-all"
                              whiteSpace="pre-wrap"
                            >
                              {errorDetail}
                            </Text>
                          </Box>
                        </Box>
                      </Collapse>
                    </>
                  )}

                  {canRebroadcast && (
                    <Button
                      size="xs"
                      leftIcon={<RepeatIcon />}
                      onClick={handleRebroadcast}
                      isLoading={isRebroadcasting}
                      mt={2}
                      bg={rebroadcastBg}
                      color={rebroadcastFg}
                      borderColor={rebroadcastBg}
                      _hover={{ bg: rebroadcastBg, opacity: 0.85 }}
                      _active={{ bg: rebroadcastBg, opacity: 0.75 }}
                    >
                      Rebroadcast
                    </Button>
                  )}
                </Box>
              );
            })()}

          </VStack>
        </ModalBody>

        <ModalFooter borderTop="3px solid" borderColor="border.default" pt={3} pb={4}>
          <Button variant="secondary" size="sm" onClick={onClose} w="full">
            Close
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}

export default memo(TxDetailModal);
