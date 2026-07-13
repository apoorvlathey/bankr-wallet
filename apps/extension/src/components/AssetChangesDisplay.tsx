import { useState, useEffect, memo } from "react";
import {
  Box,
  VStack,
  HStack,
  Text,
  Collapse,
  Button,
  IconButton,
  Tooltip,
  Image,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalBody,
  ModalCloseButton,
  useDisclosure,
  usePrefersReducedMotion,
} from "@chakra-ui/react";
import {
  ChevronDownIcon,
  CopyIcon,
  CheckIcon,
  ExternalLinkIcon,
  InfoOutlineIcon,
  WarningTwoIcon,
} from "@chakra-ui/icons";
import { PendingTxRequest } from "@/chrome/pendingTxStorage";
import { useCachedAvatarSrc } from "@/hooks/useCachedAvatarSrc";
import type {
  SimulationResult,
  AssetChange,
  TokenMetadataResult,
  NftStandard,
} from "@/chrome/txSimulation";
import { useNetworks } from "@/contexts/NetworksContext";
import { getResolvedChainById } from "@/lib/chains";
import { ShapesLoader } from "@/components/Chat/ShapesLoader";
import { useTheme } from "@/theme";
import { formatUsd } from "@/lib/currencyFormatUtils";
import { useScreenEntered } from "@/components/ScreenTransition";
import SafeImage from "@/components/SafeImage";

interface AssetChangesDisplayProps {
  txRequest: PendingTxRequest;
  /** For batch transactions: simulate each call individually instead of the encoded batch */
  batchCalls?: { to?: string; data?: string; value?: string }[];
  /** Use eth_simulateV1-based non-atomic simulation (for PK/SP EOA accounts) */
  isNonAtomic?: boolean;
  /**
   * Fired whenever the simulated `txSuccess` flag flips. Parents use this to
   * surface a standalone "simulated transaction reverted" banner at the very
   * top of the confirmation surface, above the clear-signing card. The
   * inline banner that used to live inside this component is intentionally
   * suppressed so the warning lands in front of the user immediately.
   */
  onRevertedChange?: (reverted: boolean) => void;
  /**
   * Fired whenever asset-change simulation itself fails or becomes unavailable.
   * Parents use this to surface an informational top-of-screen banner instead
   * of silently hiding the asset-change section.
   */
  onSimulationUnavailableChange?: (unavailable: boolean) => void;
}

/**
 * Standalone simulated-revert banner. Lives at the top of every tx
 * confirmation surface so users see "this is likely to fail" before reading
 * the rest of the screen. Parents drive it via `AssetChangesDisplay`'s
 * `onRevertedChange` callback.
 */
export function SimulationRevertedBanner({
  borders,
}: {
  borders: { medium: string };
}) {
  return (
    <Box
      border={borders.medium}
      borderColor="status.error.border"
      borderRadius="lg"
      bg="status.error.bg"
      boxShadow="card"
      px={3}
      py={2.5}
    >
      <HStack spacing={2} align="flex-start">
        <WarningTwoIcon
          boxSize="14px"
          color="status.error.fg"
          mt="2px"
          flexShrink={0}
        />
        <Text fontSize="xs" fontWeight="700" color="status.error.fg" lineHeight="short">
          Simulated transaction reverted. Signing this is likely to fail onchain.
        </Text>
      </HStack>
    </Box>
  );
}

export function SimulationUnavailableBanner({
  borders,
}: {
  borders: { medium: string };
}) {
  return (
    <Box
      border={borders.medium}
      borderColor="status.info.border"
      borderRadius="lg"
      bg="status.info.bg"
      boxShadow="card"
      px={3}
      py={2.5}
    >
      <HStack spacing={2} align="flex-start">
        <InfoOutlineIcon
          boxSize="14px"
          color="status.info.fg"
          mt="2px"
          flexShrink={0}
        />
        <Text fontSize="xs" fontWeight="700" color="status.info.fg" lineHeight="short">
          Asset change simulation unavailable. Onchain transfers may still occur.
        </Text>
      </HStack>
    </Box>
  );
}

function makeSimulationFailureResult(error: string): SimulationResult {
  return {
    txSuccess: true,
    nativeChange: null,
    tokenChanges: [],
    simulationFailed: true,
    simulationError: error,
    metadataComplete: true,
  };
}

function TokenIcon({ change }: { change: AssetChange }) {
  // Pipe the logo URL through the OffscreenCanvas-re-encoded data-URL cache
  // shared with ENS avatars (`ensAvatarImageCache`). After first paint
  // anywhere in the UI, subsequent opens render the icon synchronously
  // from chrome.storage — no network roundtrip, no flash of fallback text.
  // Same mechanism the batch inline summary uses for token logos.
  const cachedLogo = useCachedAvatarSrc(change.logoUrl);
  const src = cachedLogo || change.logoUrl;
  return (
    <Box
      bg="bg.muted"
      borderRadius="full"
      w="24px"
      h="24px"
      minW="24px"
      display="flex"
      alignItems="center"
      justifyContent="center"
      overflow="hidden"
    >
      {src ? (
        <Image
          src={src}
          alt={change.symbol}
          boxSize="24px"
          borderRadius="full"
          fallback={
            <Text fontSize="8px" fontWeight="800" color="text.secondary">
              {change.symbol.slice(0, 3)}
            </Text>
          }
        />
      ) : (
        <Text fontSize="8px" fontWeight="800" color="text.secondary">
          {change.symbol.slice(0, 3)}
        </Text>
      )}
    </Box>
  );
}

/** Coloured "ERC-721 NFT" / "ERC-1155 NFT" pill. */
function NftStandardTag({ standard }: { standard: NftStandard }) {
  const label = standard === "erc721" ? "ERC-721 NFT" : "ERC-1155 NFT";
  return (
    <Box
      px={1}
      py="1px"
      border="1.5px solid"
      borderColor="border.default"
      bg="accent.highlight"
      flexShrink={0}
    >
      <Text
        fontSize="8px"
        fontWeight="800"
        color="accentFg.highlight"
        letterSpacing="0.02em"
        lineHeight="1.1"
      >
        {label}
      </Text>
    </Box>
  );
}

/**
 * Render NFT metadata only after the background has decoded and re-encoded a
 * bounded raster. Raw SVG/data markup and metadata-controlled network URLs
 * never enter the privileged renderer.
 */
function NftMediaSandbox({
  src,
  alt,
  width = "64px",
  height = "64px",
  showBorder = true,
}: {
  src: string;
  alt: string;
  width?: string;
  height?: string;
  showBorder?: boolean;
}) {
  return (
    <Box
      width={width}
      height={height}
      border={showBorder ? "2px solid" : "none"}
      borderColor="border.default"
      bg="white"
      display="flex"
      alignItems="center"
      justifyContent="center"
      overflow="hidden"
    >
      <SafeImage
        src={src}
        alt={alt}
        maxW="100%"
        maxH="100%"
        objectFit="contain"
        fallback={
          <Text fontSize="9px" fontWeight="800" color="text.tertiary" textAlign="center">
            NFT
          </Text>
        }
      />
    </Box>
  );
}

/**
 * Fullscreen modal that displays the NFT image at a comfortable size so the
 * user can verify what they're about to receive before confirming the tx.
 * The image still renders inside a sandboxed iframe — same security guarantees
 * as the inline preview.
 */
function NftFullscreenModal({
  isOpen,
  onClose,
  src,
  alt,
  title,
  subtitle,
}: {
  isOpen: boolean;
  onClose: () => void;
  src: string;
  alt: string;
  title: string;
  subtitle?: string;
}) {
  const { tokens } = useTheme();
  return (
    <Modal isOpen={isOpen} onClose={onClose} isCentered size="md">
      <ModalOverlay bg="surface.overlay" />
      <ModalContent mx={4}>
        <ModalCloseButton
          color="text.primary"
          _hover={{ bg: "accent.highlight", color: "accentFg.highlight" }}
        />
        <ModalBody p={4}>
          <VStack spacing={3} align="stretch">
            <Box pr={6}>
              <Text fontSize="sm" fontWeight="600" color="text.primary" noOfLines={2}>
                {title}
              </Text>
              {subtitle && (
                <Text fontSize="xs" color="text.tertiary" noOfLines={2}>
                  {subtitle}
                </Text>
              )}
            </Box>
            <Box
              border={tokens.borders.thin}
              borderColor="border.default"
              borderRadius="md"
              // Literal white tile so the NFT image always sits on a neutral
              // surface — Midnight should not paint dark behind transparent NFTs.
              bg="white"
              display="flex"
              alignItems="center"
              justifyContent="center"
              w="full"
              h="320px"
            >
              <NftMediaSandbox
                src={src}
                alt={alt}
                width="100%"
                height="100%"
                showBorder={false}
              />
            </Box>
          </VStack>
        </ModalBody>
      </ModalContent>
    </Modal>
  );
}

/** Compact NFT preview card shown in the SEND/RECEIVE rows. */
function NftPreview({ change }: { change: AssetChange }) {
  const { isOpen, onOpen, onClose } = useDisclosure();
  if (!change.nft) return null;
  const meta = change.nft.metadata;
  const loading = !!change.nft.metadataLoading;
  const showImage = meta?.image;
  const isClickable = !!showImage;

  const altText = meta?.name || change.symbol;
  const tokenId = change.nft.tokenId;
  const modalTitle = meta?.name || change.symbol;
  const modalSubtitle = tokenId ? `#${tokenId}` : undefined;

  return (
    <>
      <Box
        as={isClickable ? "button" : "div"}
        w="64px"
        h="64px"
        minW="64px"
        border="1px solid"
        borderColor="border.default"
        borderRadius="md"
        // Literal white tile (physical sticker) — same rationale as the
        // NftFullscreenModal preview Box.
        bg="white"
        display="flex"
        alignItems="center"
        justifyContent="center"
        overflow="hidden"
        flexShrink={0}
        cursor={isClickable ? "pointer" : "default"}
        onClick={
          isClickable
            ? (e: React.MouseEvent<HTMLElement>) => {
                e.stopPropagation();
                onOpen();
              }
            : undefined
        }
        aria-label={isClickable ? `View ${altText}` : undefined}
        _hover={isClickable ? { borderColor: "accent.secondary" } : undefined}
        _focusVisible={isClickable ? { boxShadow: "focus" } : undefined}
        transition="border-color 0.1s"
      >
        {showImage ? (
          <NftMediaSandbox src={meta!.image!} alt={altText} />
        ) : loading ? (
          <ShapesLoader size="6px" />
        ) : (
          <Text fontSize="9px" fontWeight="800" color="text.tertiary" textAlign="center">
            NFT
          </Text>
        )}
      </Box>
      {showImage && (
        <NftFullscreenModal
          isOpen={isOpen}
          onClose={onClose}
          src={meta!.image!}
          alt={altText}
          title={modalTitle}
          subtitle={modalSubtitle}
        />
      )}
    </>
  );
}

function AssetRow({
  change,
  explorerUrl,
}: {
  change: AssetChange;
  explorerUrl: string;
}) {
  const [copied, setCopied] = useState(false);
  const isNative = change.address === "native";
  const isNft = !!change.nft;

  const handleCopy = async () => {
    if (isNative) return;
    try {
      await navigator.clipboard.writeText(change.address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard writes can fail when the extension view is not focused.
    }
  };

  // Out = negative chart color (red), in = positive chart color (green) so the
  // semantic mapping reads consistently across themes. Bauhaus historically
  // used blue for "in" but the PRD calls for chart.positive/negative here so
  // dark mode gets a clear positive→green visual.
  const dirColor =
    change.direction === "out" ? "chart.negative" : "chart.positive";
  const showName = change.name && change.name !== change.symbol;

  // For NFTs we display "+1" (ERC-721) or "+N" (ERC-1155). The tokenId moves
  // to its own line so it remains scannable even for very long ids.
  const amountLabel = isNft
    ? `${change.direction === "out" ? "\u2212" : "+"}${change.nft!.amount ?? change.formattedAmount}`
    : `${change.direction === "out" ? "\u2212" : "+"}${change.formattedAmount}`;

  const nftDisplayName =
    change.nft?.metadata?.name ||
    (showName ? change.name : null) ||
    `${change.address.slice(0, 6)}...${change.address.slice(-4)}`;

  return (
    <Box
      w="full"
      py={2}
    >
      <HStack spacing={2.5} align={isNft ? "flex-start" : "center"}>
        {isNft ? <NftPreview change={change} /> : <TokenIcon change={change} />}

        <VStack spacing={0} flex="1" minW={0} align="stretch">
          {/* Line 1: Symbol (+ NFT tag) ... Amount */}
          <HStack w="full" justify="space-between" spacing={2} align="center">
            <HStack spacing={1.5} minW={0}>
              <Text fontSize="sm" fontWeight="700" color="text.primary" noOfLines={1}>
                {change.symbol}
              </Text>
              {isNft && <NftStandardTag standard={change.nft!.standard} />}
            </HStack>
            <VStack spacing={0} align="flex-end" flexShrink={0}>
              <Text
                fontSize="sm"
                fontWeight="700"
                fontFamily="mono"
                color={dirColor}
              >
                {amountLabel}
              </Text>
              {isNative && change.valueUsd !== null && (
                <Text fontSize="2xs" fontWeight="600" color="text.secondary">
                  {formatUsd(change.valueUsd)}
                </Text>
              )}
            </VStack>
          </HStack>

          {/* Line 2: Name + copy/explorer ... USD (tokens only, not native) */}
          {!isNative && (
            <HStack w="full" justify="space-between" spacing={2}>
              <HStack spacing={0.5} minW={0}>
                <Text fontSize="2xs" color="text.tertiary" noOfLines={1}>
                  {isNft
                    ? nftDisplayName
                    : showName
                    ? change.name
                    : `${change.address.slice(0, 6)}...${change.address.slice(-4)}`}
                </Text>
                <Tooltip label="Copy address" fontSize="xs" hasArrow>
                  <IconButton
                    aria-label="Copy"
                    icon={copied ? <CheckIcon /> : <CopyIcon />}
                    size="xs"
                    variant="ghost"
                    minW="24px"
                    w="24px"
                    h="24px"
                    color={copied ? "accent.highlight" : "text.tertiary"}
                    onClick={handleCopy}
                    _hover={{ color: "accent.secondary", bg: "transparent" }}
                  />
                </Tooltip>
                {explorerUrl && (
                  <Tooltip label="View on explorer" fontSize="xs" hasArrow>
                    <IconButton
                      aria-label="View on explorer"
                      icon={<ExternalLinkIcon boxSize="9px" />}
                      size="xs"
                      variant="ghost"
                      minW="24px"
                      w="24px"
                      h="24px"
                      color="text.tertiary"
                      onClick={() =>
                        window.open(`${explorerUrl}/address/${change.address}`, "_blank", "noopener,noreferrer")
                      }
                      _hover={{ color: "accent.secondary", bg: "transparent" }}
                    />
                  </Tooltip>
                )}
              </HStack>
              {!isNft && change.valueUsd !== null && (
                <Text fontSize="2xs" fontWeight="600" color="text.secondary" flexShrink={0}>
                  {formatUsd(change.valueUsd)}
                </Text>
              )}
            </HStack>
          )}

          {/* Line 3: tokenId (NFTs only) */}
          {isNft && change.nft!.tokenId !== null && (
            <Text
              fontSize="2xs"
              fontFamily="mono"
              fontWeight="700"
              color="text.secondary"
              noOfLines={1}
              mt={0.5}
            >
              #{change.nft!.tokenId}
            </Text>
          )}
        </VStack>
      </HStack>
    </Box>
  );
}

/** Max number of metadata retry attempts */
const MAX_RETRIES = 3;
/** Delay before each retry (ms) */
const RETRY_DELAY = 2_500;

function AssetChangesDisplay({
  txRequest,
  batchCalls,
  isNonAtomic,
  onRevertedChange,
  onSimulationUnavailableChange,
}: AssetChangesDisplayProps) {
  const { tokens } = useTheme();
  const { networksInfo } = useNetworks();
  const explorerUrl =
    getResolvedChainById(txRequest.tx.chainId, networksInfo)?.explorer ?? "";
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(true);
  const prefersReducedMotion = usePrefersReducedMotion();

  // Stable signature of the calls list — re-fires simulation when the user
  // edits the bundle (e.g. removes a call from a dapp-initiated batch).
  const batchCallsKey = batchCalls
    ? batchCalls
        .map((c) => `${c.to ?? ""}|${c.data ?? ""}|${c.value ?? ""}`)
        .join(";")
    : null;

  // Defer simulation until the screen's entry animation has settled.
  // Simulation is heavy (eth_simulateV1 / batch injection + token metadata
  // parsing → setState → full re-render) and running it concurrently with
  // the slide-in causes the animation to jitter. The screen renders its
  // loading state during the slide; the actual fetch fires the frame after.
  const screenEntered = useScreenEntered();

  // Initial simulation fetch
  useEffect(() => {
    if (!screenEntered) return;
    let cancelled = false;
    // Reset to a fresh loading state so re-simulations (e.g. after a call
    // is removed from the batch) show the spinner instead of stale results.
    setLoading(true);
    setResult(null);

    // Batch transactions: simulate each call individually
    // Non-atomic (PK/SP EOA): use eth_simulateV1 with fallback
    // Atomic (Bankr): use bytecode-injection batch simulation
    const message = batchCalls
      ? {
          type: isNonAtomic
            ? "simulateBatchAssetChangesNonAtomic"
            : "simulateBatchAssetChanges",
          calls: batchCalls,
          fromAddress: txRequest.tx.from,
          chainId: txRequest.tx.chainId,
        }
      : {
          type: "simulateAssetChanges",
          tx: txRequest.tx,
          accountAddress: txRequest.tx.from,
        };

    console.log("[AssetChangesUI] Sending simulation message:", message.type, message);
    chrome.runtime.sendMessage(message, (response: SimulationResult) => {
      if (cancelled) return;
      if (chrome.runtime.lastError) {
        console.error("[AssetChangesUI] chrome.runtime.lastError:", chrome.runtime.lastError);
        setResult(
          makeSimulationFailureResult(
            chrome.runtime.lastError.message || "Asset change simulation unavailable",
          ),
        );
        setLoading(false);
        return;
      }
      if (!response) {
        console.error("[AssetChangesUI] Empty simulation response");
        setResult(makeSimulationFailureResult("Asset change simulation unavailable"));
        setLoading(false);
        return;
      }
      console.log("[AssetChangesUI] Simulation response:", response);
      setResult(response);
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
    // Simulate from the stable request id plus batch-call signature, not array identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [txRequest.id, batchCallsKey, screenEntered]);

  // Surface the simulated-revert flag to the parent so it can render the
  // banner at the very top of the confirmation surface. Fires on each
  // result change so transitions (loading → reverted, loading → success)
  // propagate. We pass `false` when there is no result or simulation
  // itself failed (latter is a different failure mode — not a revert).
  useEffect(() => {
    if (!onRevertedChange) return;
    if (!result || result.simulationFailed) {
      onRevertedChange(false);
      return;
    }
    onRevertedChange(!result.txSuccess);
  }, [result, onRevertedChange]);

  useEffect(() => {
    if (!onSimulationUnavailableChange) return;
    onSimulationUnavailableChange(!!result?.simulationFailed);
  }, [result?.simulationFailed, onSimulationUnavailableChange]);

  // Retry metadata fetch if initial attempt was incomplete
  useEffect(() => {
    if (!result || result.simulationFailed || result.metadataComplete) return;
    if (
      result.tokenChanges.length === 0 &&
      (!result.nativeChange || result.nativeChange.valueUsd !== null)
    ) return;

    let cancelled = false;
    let attempt = 0;
    let tokenChanges = result.tokenChanges;
    let nativeChange = result.nativeChange;

    function scheduleRetry() {
      if (cancelled || attempt >= MAX_RETRIES) return;
      attempt++;

      setTimeout(() => {
        if (cancelled) return;

        chrome.runtime.sendMessage(
          {
            type: "retryTokenMetadata",
            chainId: txRequest.tx.chainId,
            tokenChanges,
            accountAddress: txRequest.tx.from,
            nativeChange,
          },
          (response: TokenMetadataResult) => {
            if (cancelled || chrome.runtime.lastError) return;

            // Check if metadata is now complete
            tokenChanges = response.tokenChanges;
            nativeChange = response.nativeChange ?? nativeChange;
            const stillIncomplete =
              tokenChanges.some(
                (c) => c.symbol.includes("...") || c.valueUsd === null,
              ) || !!(nativeChange && nativeChange.valueUsd === null);

            setResult((prev) =>
              prev
                ? {
                    ...prev,
                    tokenChanges,
                    nativeChange,
                    metadataComplete: !stillIncomplete,
                  }
                : prev,
            );

            // Keep retrying if still incomplete
            if (stillIncomplete) scheduleRetry();
          },
        );
      }, attempt === 1 ? 0 : RETRY_DELAY);
    }

    scheduleRetry();

    return () => {
      cancelled = true;
    };
    // Retry scheduling is keyed to result status and request id to avoid duplicate timers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result?.metadataComplete, result?.simulationFailed, txRequest.id]);

  // Loading state
  if (loading) {
    return (
      <Box
        border={tokens.borders.medium}
        borderColor="border.default"
        borderRadius="lg"
        bg="surface.raised"
        boxShadow="card"
      >
        <HStack px={3} py={2.5} justify="center" spacing={3}>
          <ShapesLoader size="6px" />
          <Text
            fontSize="xs"
            color="text.secondary"
            fontWeight="700"
          >
            Simulating…
          </Text>
        </HStack>
      </Box>
    );
  }

  // Hide entirely if simulation failed
  if (!result || result.simulationFailed) return null;

  const allChanges: AssetChange[] = [];
  if (result.nativeChange) allChanges.push(result.nativeChange);
  allChanges.push(...result.tokenChanges);

  // The "simulated transaction reverted" banner used to live here, but is now
  // hoisted to the top of the confirmation surface via `onRevertedChange` so
  // it lands in the user's field of view before they read anything else.
  if (allChanges.length === 0) {
    return (
      <Text color="fg.secondary" fontSize="sm" lineHeight="1.45">
        No additional asset changes were detected.
      </Text>
    );
  }

  const outChanges = allChanges.filter((c) => c.direction === "out");
  const inChanges = allChanges.filter((c) => c.direction === "in");

  // Build compact summary for collapsed header
  const summaryParts: string[] = [];
  for (const c of outChanges.slice(0, 2)) {
    summaryParts.push(`-${c.formattedAmount} ${c.symbol}`);
  }
  for (const c of inChanges.slice(0, 2)) {
    summaryParts.push(`+${c.formattedAmount} ${c.symbol}`);
  }
  const moreCount = allChanges.length - summaryParts.length;
  if (moreCount > 0) summaryParts.push(`+${moreCount} more`);

  return (
    <VStack align="stretch" spacing={2}>
      <Box
        borderTop="1px solid"
        borderBottom="1px solid"
        borderColor="border.subtle"
        borderRadius="lg"
        bg="transparent"
        boxShadow="none"
        position="relative"
        overflow="hidden"
      >
      {/* Header */}
      <Button
        type="button"
        variant="unstyled"
        display="flex"
        w="full"
        minH="44px"
        h="auto"
        px={3}
        py={2.5}
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
        aria-controls="asset-changes-details"
        borderRadius={0}
        fontWeight="inherit"
        textTransform="none"
        _hover={{ bg: "surface.raisedHover" }}
        justifyContent="space-between"
      >
        <HStack spacing={1} flexShrink={0}>
          <Text
            fontSize="xs"
            color="text.secondary"
            fontWeight="700"
          >
            Estimated changes
          </Text>
          <Tooltip
            label="This is an estimation. Actual onchain transfers may differ based on updated contract state."
            fontSize="xs"
            hasArrow
            placement="top"
          >
            <InfoOutlineIcon boxSize="11px" color="text.tertiary" />
          </Tooltip>
        </HStack>
        <HStack spacing={1} minW={0}>
          {!expanded && (
            <Text
              fontSize="xs"
              fontWeight="700"
              color="text.primary"
              fontFamily="mono"
              noOfLines={1}
            >
              {summaryParts.join(", ")}
            </Text>
          )}
          <ChevronDownIcon
            boxSize={4}
            color="text.tertiary"
            transform={expanded ? "rotate(180deg)" : "rotate(0deg)"}
            transition={prefersReducedMotion ? "none" : "transform 150ms cubic-bezier(0.23, 1, 0.32, 1)"}
            aria-hidden
          />
        </HStack>
      </Button>

      {/* Expanded details */}
      <Collapse id="asset-changes-details" in={expanded} animateOpacity={!prefersReducedMotion}>
        <VStack align="stretch" spacing={0} px={3} pb={3} pt={1}>
          <Box h="1px" bg="border.subtle" />

          {/* Outgoing */}
          {outChanges.length > 0 && (
            <>
              <Text
                fontSize="2xs"
                fontWeight="700"
                color="chart.negative"
                pt={2}
                pb={1}
              >
                Send
              </Text>
              <VStack spacing={1.5} align="stretch">
                {outChanges.map((c, i) => (
                  <AssetRow
                    key={`out-${c.address}-${i}`}
                    change={c}
                    explorerUrl={explorerUrl}
                  />
                ))}
              </VStack>
            </>
          )}

          {/* Incoming */}
          {inChanges.length > 0 && (
            <>
              <Text
                fontSize="2xs"
                fontWeight="700"
                color="chart.positive"
                pt={outChanges.length > 0 ? 2.5 : 2}
                pb={1}
              >
                Receive
              </Text>
              <VStack spacing={1.5} align="stretch">
                {inChanges.map((c, i) => (
                  <AssetRow
                    key={`in-${c.address}-${i}`}
                    change={c}
                    explorerUrl={explorerUrl}
                  />
                ))}
              </VStack>
            </>
          )}

        </VStack>
      </Collapse>
    </Box>
    </VStack>
  );
}

export default memo(AssetChangesDisplay);
