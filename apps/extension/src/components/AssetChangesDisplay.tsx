import { useState, useEffect, memo } from "react";
import {
  Box,
  VStack,
  HStack,
  Text,
  Collapse,
  IconButton,
  Tooltip,
  Image,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalBody,
  ModalCloseButton,
  useDisclosure,
} from "@chakra-ui/react";
import {
  ChevronDownIcon,
  ChevronUpIcon,
  CopyIcon,
  CheckIcon,
  ExternalLinkIcon,
  InfoOutlineIcon,
  WarningTwoIcon,
} from "@chakra-ui/icons";
import { PendingTxRequest } from "@/chrome/pendingTxStorage";
import type {
  SimulationResult,
  AssetChange,
  TokenMetadataResult,
  NftStandard,
} from "@/chrome/txSimulation";
import { getChainConfig } from "@/constants/chainConfig";
import { ShapesLoader } from "@/components/Chat/ShapesLoader";
import { useTheme } from "@/theme";

interface AssetChangesDisplayProps {
  txRequest: PendingTxRequest;
  /** For batch transactions: simulate each call individually instead of the encoded batch */
  batchCalls?: { to?: string; data?: string; value?: string }[];
  /** Use eth_simulateV1-based non-atomic simulation (for PK/SP EOA accounts) */
  isNonAtomic?: boolean;
}

/** Format USD value for display */
function formatUsd(value: number): string {
  if (value < 0.01 && value > 0) return "<$0.01";
  return `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function TokenIcon({ change }: { change: AssetChange }) {
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
      {change.logoUrl ? (
        <Image
          src={change.logoUrl}
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

/** HTML-escape every metacharacter so attacker bytes can't break attributes. */
function htmlEscape(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Allowlist of safe URL schemes for NFT image rendering. */
function isSafeImageUrl(src: string): boolean {
  return (
    src.startsWith("https://") ||
    src.startsWith("http://") ||
    src.startsWith("data:image/")
  );
}

/**
 * Render an NFT image inside a sandboxed iframe so any embedded SVG scripts,
 * remote stylesheets, or external resources can't reach the extension's
 * privileged context. The iframe gets a unique opaque origin (`sandbox=""`),
 * which means:
 *   - JavaScript inside an SVG cannot run.
 *   - It cannot read window.parent, cookies, or chrome.* APIs.
 *   - It cannot navigate the top frame.
 * The image still loads (img-src is CSP-allowed in MV3 by default) and the
 * referrer is suppressed via `<meta name="referrer">`.
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
  if (!isSafeImageUrl(src)) {
    return (
      <Text fontSize="9px" fontWeight="800" color="text.tertiary" textAlign="center">
        NFT
      </Text>
    );
  }

  // Build srcDoc with rigorous escaping. Both attributes use double quotes;
  // htmlEscape() turns every quote/angle bracket/ampersand into an entity, so
  // the rendered HTML is structurally identical regardless of contract bytes.
  const safeSrc = htmlEscape(src);
  const safeAlt = htmlEscape(alt);
  const srcDoc =
    `<!DOCTYPE html><html><head>` +
    `<meta name="referrer" content="no-referrer">` +
    `<style>` +
    `html,body{margin:0;padding:0;width:100%;height:100%;background:#fff;` +
    `display:flex;align-items:center;justify-content:center;overflow:hidden}` +
    `img{max-width:100%;max-height:100%;object-fit:contain;display:block}` +
    `</style></head><body>` +
    `<img src="${safeSrc}" alt="${safeAlt}" loading="lazy" decoding="async" />` +
    `</body></html>`;

  return (
    <Box
      as="iframe"
      // @ts-expect-error -- Chakra forwards unknown props to the DOM
      sandbox=""
      srcDoc={srcDoc}
      title={alt}
      referrerPolicy="no-referrer"
      width={width}
      height={height}
      border={showBorder ? "2px solid" : "none"}
      borderColor="border.default"
      // Sandbox iframe always renders white internally; matching the wrapper
      // to a literal white avoids a stark dark border in Midnight at the seams.
      bg="white"
      pointerEvents="none"
    />
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
              <Text fontSize="sm" fontWeight="800" color="text.primary" noOfLines={2}>
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
  const { tokens } = useTheme();
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
        w="64px"
        h="64px"
        minW="64px"
        border={tokens.borders.thin}
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
            ? (e) => {
                e.stopPropagation();
                onOpen();
              }
            : undefined
        }
        role={isClickable ? "button" : undefined}
        aria-label={isClickable ? `View ${altText}` : undefined}
        _hover={isClickable ? { borderColor: "accent.secondary" } : undefined}
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

function AssetRow({ change, chainId }: { change: AssetChange; chainId: number }) {
  const [copied, setCopied] = useState(false);
  const isNative = change.address === "native";
  const isNft = !!change.nft;

  const handleCopy = async () => {
    if (isNative) return;
    try {
      await navigator.clipboard.writeText(change.address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
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
      py={1.5}
      pl={2.5}
      borderLeft="3px solid"
      borderLeftColor={dirColor}
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
                    minW="16px"
                    h="16px"
                    color={copied ? "accent.highlight" : "text.tertiary"}
                    onClick={handleCopy}
                    _hover={{ color: "accent.secondary", bg: "transparent" }}
                  />
                </Tooltip>
                {(() => {
                  const cfg = getChainConfig(chainId);
                  return cfg.explorer ? (
                    <Tooltip label="View on explorer" fontSize="xs" hasArrow>
                      <IconButton
                        aria-label="View on explorer"
                        icon={<ExternalLinkIcon boxSize="9px" />}
                        size="xs"
                        variant="ghost"
                        minW="16px"
                        h="16px"
                        color="text.tertiary"
                        onClick={() =>
                          window.open(`${cfg.explorer}/address/${change.address}`, "_blank")
                        }
                        _hover={{ color: "accent.secondary", bg: "transparent" }}
                      />
                    </Tooltip>
                  ) : null;
                })()}
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

function AssetChangesDisplay({ txRequest, batchCalls, isNonAtomic }: AssetChangesDisplayProps) {
  const { tokens } = useTheme();
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(true);

  // Initial simulation fetch
  useEffect(() => {
    let cancelled = false;

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
  }, [txRequest.id]);

  // Retry metadata fetch if initial attempt was incomplete
  useEffect(() => {
    if (!result || result.simulationFailed || result.metadataComplete) return;
    if (result.tokenChanges.length === 0) return;

    let cancelled = false;
    let attempt = 0;

    function scheduleRetry() {
      if (cancelled || attempt >= MAX_RETRIES) return;
      attempt++;

      setTimeout(() => {
        if (cancelled) return;

        chrome.runtime.sendMessage(
          {
            type: "retryTokenMetadata",
            chainId: txRequest.tx.chainId,
            tokenChanges: result.tokenChanges,
            accountAddress: txRequest.tx.from,
          },
          (response: TokenMetadataResult) => {
            if (cancelled || chrome.runtime.lastError) return;

            // Check if metadata is now complete
            const stillIncomplete = response.tokenChanges.some(
              (c) => c.symbol.includes("...") || c.valueUsd === null,
            );

            setResult((prev) =>
              prev
                ? {
                    ...prev,
                    tokenChanges: response.tokenChanges,
                    metadataComplete: !stillIncomplete,
                  }
                : prev,
            );

            // Keep retrying if still incomplete
            if (stillIncomplete) scheduleRetry();
          },
        );
      }, RETRY_DELAY);
    }

    scheduleRetry();

    return () => {
      cancelled = true;
    };
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
            textTransform="uppercase"
          >
            Simulating...
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

  const revertedBanner = !result.txSuccess ? (
    <Box
      border={tokens.borders.medium}
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
          Simulated transaction reverted — signing this is likely to fail onchain.
        </Text>
      </HStack>
    </Box>
  ) : null;

  if (allChanges.length === 0) return revertedBanner;

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
      {revertedBanner}
      <Box
      border={tokens.borders.medium}
      borderColor="border.default"
      borderRadius="lg"
      bg="surface.raised"
      boxShadow="card"
      position="relative"
      overflow="hidden"
    >
      {/* Header */}
      <HStack
        px={3}
        py={2.5}
        cursor="pointer"
        onClick={() => setExpanded(!expanded)}
        _hover={{ bg: "bg.muted" }}
        justify="space-between"
      >
        <HStack spacing={1} flexShrink={0}>
          <Text
            fontSize="xs"
            color="text.secondary"
            fontWeight="700"
            textTransform="uppercase"
          >
            Asset Changes
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
          {expanded ? (
            <ChevronUpIcon boxSize={4} color="text.tertiary" />
          ) : (
            <ChevronDownIcon boxSize={4} color="text.tertiary" />
          )}
        </HStack>
      </HStack>

      {/* Expanded details */}
      <Collapse in={expanded} animateOpacity>
        <VStack align="stretch" spacing={0} px={3} pb={3} pt={1}>
          <Box h="1px" bg="border.subtle" />

          {/* Outgoing */}
          {outChanges.length > 0 && (
            <>
              <Text
                fontSize="2xs"
                fontWeight="700"
                color="chart.negative"
                textTransform="uppercase"
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
                    chainId={txRequest.tx.chainId}
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
                textTransform="uppercase"
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
                    chainId={txRequest.tx.chainId}
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
