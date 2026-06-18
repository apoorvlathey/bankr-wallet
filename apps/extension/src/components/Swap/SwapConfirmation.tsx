import { useState, memo } from "react";
import {
  Box,
  VStack,
  HStack,
  Text,
  Button,
  Badge,
  IconButton,
  Spinner,
  Image,
  Icon,
  Collapse,
} from "@chakra-ui/react";
import {
  ArrowBackIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  ExternalLinkIcon,
} from "@chakra-ui/icons";
import type { PortfolioToken } from "@/chrome/portfolioApi";
import type { TokenInfo } from "@/chrome/swapApi";
import type { SwapTxEntry } from "@/chrome/txHandlers";
import { getChainConfig } from "@/constants/chainConfig";
import CalldataDecoder from "@/components/CalldataDecoder";
import { CalldataDigestDisplay } from "@/components/DigestDisplay";
import { CopyButton } from "@/components/CopyButton";
import ChainIcon from "@/components/ChainIcon";
import MultiTxGasEstimateDisplay from "@/components/MultiTxGasEstimateDisplay";
import SmartAccountSetupBanner from "@/components/SmartAccountSetupBanner";
import { omitOuterValueForEip7702 } from "@/chrome/batchTxHandlers";
import { formatUsd as formatUsdShared } from "@/lib/currencyFormatUtils";
import { formatTokenAmount, formatTokenAmountFromBase } from "@/lib/tokenFormatUtils";
import { TokenSymbolFallback } from "@/components/Swap/TokenSymbolFallback";
import { useCachedAvatarSrc } from "@/hooks/useCachedAvatarSrc";
import { isDarkThemeId, useTheme } from "@/theme";
import { useNetworks } from "@/contexts/NetworksContext";
import { getNativeAssetMeta } from "@/lib/chains";
// Theme-aware accent stripes shared with the batch confirmation surfaces, so a
// multi-step swap reads as the same kind of "stack of independent calls" in
// either palette (Bauhaus red/blue/yellow, Midnight indigo/cyan/amber).
import { CALL_ACCENTS, CALL_ACCENT_FGS } from "@/components/BatchCallsList";

interface SwapConfirmationProps {
  transactions: SwapTxEntry[];
  sellToken: PortfolioToken;
  sellAmount: string;
  sellUsd: number;
  buyTokenInfo: TokenInfo;
  buyAmount: string;
  buyTokenDecimals: number;
  buyTokenLogoURI?: string;
  /**
   * True when the buy token is the destination chain's native asset. Lets
   * the receive-row icon fall back through the native-asset logo resolver when
   * no per-token logo is available. ETH-native chains still render ETH, not
   * the chain badge.
   */
  isBuyNative?: boolean;
  buyUsd: number;
  chainId: number;
  chainName: string;
  fromAddress: string;
  accountType: "bankr" | "privateKey" | "seedPhrase" | "impersonator";
  isBatched: boolean;
  batchedTx?: { to: string; data: string; value: string };
  /**
   * For PK/Seed atomic-7702 swaps: the delegate the EOA will authorize this
   * batch under, but ONLY when the EOA isn't already onchain-delegated to it
   * (i.e., `batchPlan.needsAuthorization === true`). Forwarded to
   * `MultiTxGasEstimateDisplay` so the gas estimator can apply the same
   * `stateOverride` trick used by `BatchTransactionConfirmation`. Leave
   * undefined for Bankr atomic (server-side gas) and for PK/SP atomic where
   * the EOA is already delegated — plain `estimateGas` is more RPC-robust
   * there.
   */
  eip7702Delegate?: `0x${string}`;
  /**
   * When the EOA is already delegated to a non-7821 contract on this chain
   * (e.g. another wallet's delegate), the resolver returns the WalletChan
   * default for `eip7702Delegate` AND populates this field with the current
   * onchain delegation so the banner can render the "Replacing existing
   * delegation" variant. Undefined / null = fresh setup.
   */
  eip7702OnchainDelegate?: `0x${string}` | null;
  onConfirm: () => void;
  onCancel: () => void;
  isSubmitting: boolean;
  /**
   * Per-call gas estimates picked from the tier picker. Fired by
   * MultiTxGasEstimateDisplay whenever the user picks a tier or edits the
   * Custom inputs. Parent uses these as the gas params for each non-atomic
   * swap tx (approve / swap). Bankr atomic swaps ignore this — Bankr API
   * computes gas server-side.
   */
  onGasEstimates?: (estimates: import("@/chrome/gasEstimation").GasEstimate[]) => void;
  /** Bubbles invalid Custom-tier state up so the parent disables Confirm. */
  onValidityChange?: (valid: boolean) => void;
  /** Disables Confirm Swap when the gas editor is in an inconsistent state. */
  isConfirmDisabled?: boolean;
  /**
   * Bridge-mode metadata. When set, this screen renders the cross-chain
   * variant: title flips to "Confirm Bridge", buy row shows the destination
   * chain badge alongside the buy token, and the receipt includes the
   * Socket route name + estimated time. Gas plumbing is unchanged — the
   * underlying source tx still uses MultiTxGasEstimateDisplay's tier picker.
   */
  bridgeMeta?: {
    destinationChainId: number;
    destinationChainName: string;
    routeName?: string;
    estimatedTime?: number;
    /** Source chain native USD price — when provided, the Bridge Fee row
     *  appends a dollar equivalent so users can size the protocol cost. */
    sourceNativePriceUsd?: number;
  };
}

const formatOutputAmount = (amount: string, decimals: number): string =>
  formatTokenAmountFromBase(amount, decimals, { thousandsSeparator: true });

const formatUsd = (value: number): string =>
  formatUsdShared(value, { zeroAsEmpty: true });

function formatValue(value: string, nativeSymbol: string): string {
  const wei = BigInt(value);
  const eth = Number(wei) / 1e18;
  return `${eth.toFixed(6)} ${nativeSymbol}`;
}

// Vertical down arrow icon
const ArrowDownIcon = (props: React.ComponentProps<typeof Icon>) => (
  <Icon viewBox="0 0 24 24" {...props}>
    <path fill="currentColor" d="M20 12l-1.41-1.41L13 16.17V4h-2v12.17l-5.58-5.59L4 12l8 8 8-8z" />
  </Icon>
);

function SwapConfirmation({
  transactions,
  sellToken,
  sellAmount,
  sellUsd,
  buyTokenInfo,
  buyAmount,
  buyTokenDecimals,
  buyTokenLogoURI,
  isBuyNative = false,
  buyUsd,
  chainId,
  chainName,
  fromAddress,
  accountType,
  isBatched,
  batchedTx,
  eip7702Delegate,
  eip7702OnchainDelegate,
  onConfirm,
  onCancel,
  isSubmitting,
  onGasEstimates,
  onValidityChange,
  isConfirmDisabled,
  bridgeMeta,
}: SwapConfirmationProps) {
  const config = getChainConfig(chainId);
  const isBridge = !!bridgeMeta;
  const destChainConfig = bridgeMeta
    ? getChainConfig(bridgeMeta.destinationChainId)
    : null;
  const isSellNative =
    sellToken.contractAddress === "native" ||
    sellToken.contractAddress === "0x0000000000000000000000000000000000000000";
  const buyChainId = bridgeMeta?.destinationChainId ?? chainId;
  const titleLabel = isBridge ? "Confirm Bridge" : "Confirm Swap";

  // Shared data-URL cache used by ENS avatars + batch summary + portfolio.
  // Paints sell/buy icons synchronously from chrome.storage on reopen.
  const cachedSellLogo = useCachedAvatarSrc(sellToken.logoUrl);
  const cachedBuyLogo = useCachedAvatarSrc(buyTokenLogoURI);
  const sellLogoSrc = cachedSellLogo || sellToken.logoUrl;
  const buyLogoSrc = cachedBuyLogo || buyTokenLogoURI;
  const { themeId } = useTheme();
  const { networksInfo } = useNetworks();
  const isDarkTheme = isDarkThemeId(themeId);
  const [expandedCalls, setExpandedCalls] = useState<Set<number>>(new Set());
  const [decodedFunctionNames, setDecodedFunctionNames] = useState<Record<number, string>>({});
  const sourceNativeSymbol =
    getNativeAssetMeta(chainId, networksInfo)?.symbol ??
    config.nativeCurrency?.symbol ??
    "ETH";

  const toggleCall = (index: number) => {
    setExpandedCalls((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const handleFunctionName = (index: number, name: string) => {
    setDecodedFunctionNames((prev) => {
      if (prev[index] === name) return prev;
      return { ...prev, [index]: name };
    });
  };

  // Build gas estimation inputs
  const gasTransactions = transactions.map((entry) => ({
    tx: { ...entry.tx, from: fromAddress },
    label: entry.origin,
  }));
  const isEip7702Batched =
    isBatched &&
    (accountType === "privateKey" || accountType === "seedPhrase");
  const outerBatchedTx =
    batchedTx && isEip7702Batched
      ? omitOuterValueForEip7702(batchedTx)
      : batchedTx;

  const gasBatchedTx = outerBatchedTx
    ? {
        tx: {
          from: fromAddress,
          to: outerBatchedTx.to,
          data: outerBatchedTx.data,
          value: outerBatchedTx.value,
          chainId,
        },
        label: `Batched (${transactions.length} calls)`,
      }
    : undefined;

  // Bridge fee = msg.value attached to the source tx(s). For LayerZero /
  // Stargate routes this funds destination-chain message delivery and is
  // paid in the source chain's native token (Socket returns it inside
  // `txData.value`). When the user is bridging native ETH itself, the
  // value also includes the input amount — subtract it to isolate the
  // protocol fee so the row reflects only the cost of bridging.
  const bridgeFeeDisplay = (() => {
    if (!isBridge) return null;
    let totalValueWei = 0n;
    for (const entry of transactions) {
      const raw = entry.tx.value;
      if (!raw) continue;
      try {
        totalValueWei += BigInt(raw);
      } catch {
        // skip malformed hex
      }
    }
    if (totalValueWei === 0n) return null;

    let feeWei = totalValueWei;
    if (sellToken.contractAddress === "native") {
      try {
        const decimals = 18;
        const [whole, frac = ""] = sellAmount.split(".");
        const fracPadded = (frac + "0".repeat(decimals)).slice(0, decimals);
        const sellWei = BigInt(whole || "0") * 10n ** BigInt(decimals) + BigInt(fracPadded || "0");
        feeWei = totalValueWei > sellWei ? totalValueWei - sellWei : 0n;
      } catch {
        // fall back to raw total
      }
    }
    if (feeWei === 0n) return null;

    const nativeAmount = Number(feeWei) / 1e18;
    const trimmed = nativeAmount.toFixed(6).replace(/\.?0+$/, "");
    const amountLabel = `${trimmed} ${sourceNativeSymbol}`;
    const usdPrice = bridgeMeta?.sourceNativePriceUsd;
    let usdLabel: string | null = null;
    if (usdPrice && usdPrice > 0) {
      const usd = nativeAmount * usdPrice;
      if (usd > 0) usdLabel = usd < 0.01 ? "<$0.01" : `$${usd.toFixed(2)}`;
    }
    return { amountLabel, usdLabel };
  })();

  return (
    <Box
      p={3}
      h="100%"
      overflowY="auto"
      bg="surface.base"
      css={{
        "&::-webkit-scrollbar": { width: "4px" },
        "&::-webkit-scrollbar-track": { background: "transparent" },
        "&::-webkit-scrollbar-thumb": {
          background: "var(--chakra-colors-border-strong)",
          borderRadius: "2px",
        },
      }}
    >
      <VStack spacing={2} align="stretch">
        {/* Header */}
        <HStack spacing={2}>
          <IconButton
            aria-label="Back"
            icon={<ArrowBackIcon />}
            variant="ghost"
            size="sm"
            onClick={onCancel}
            isDisabled={isSubmitting}
            minW="auto"
          />
        </HStack>

        {/* Title banner — cool secondary accent (Bauhaus blue / Midnight cyan)
            with a Bauhaus-only warm corner ornament. Mirrors the title-banner
            pattern used by BatchTransactionConfirmation. */}
        <Box
          bg="accent.secondary"
          border="2px solid"
          borderColor="border.default"
          borderRadius="lg"
          boxShadow="card"
          py={1.5}
          px={3}
          position="relative"
        >
          {!isDarkTheme && (
            <Box
              position="absolute"
              top="-3px"
              right="-3px"
              w="8px"
              h="8px"
              bg="accent.highlight"
              border="2px solid"
              borderColor="border.default"
            />
          )}
          <HStack justify="center" spacing={2}>
            <Text
              fontWeight="900"
              fontSize="sm"
              color="accentFg.secondary"
              textTransform="uppercase"
              letterSpacing="wider"
            >
              {titleLabel}
            </Text>
            {isBatched && (
              <Badge
                bg="accent.highlight"
                color="accentFg.highlight"
                border="1.5px solid"
                borderColor="border.default"
                fontSize="2xs"
                fontWeight="900"
                px={1.5}
              >
                ATOMIC
              </Badge>
            )}
          </HStack>
        </Box>

        {/* Swap summary card */}
        <Box
          bg="surface.raised"
          border="2px solid"
          borderColor="border.default"
          borderRadius="lg"
          boxShadow="card"
          overflow="hidden"
        >
          {/* Sell row */}
          <HStack px={3} py={2.5} spacing={3}>
            {sellLogoSrc ? (
              <Image
                src={sellLogoSrc}
                alt={sellToken.symbol}
                boxSize="32px"
                borderRadius="full"
                flexShrink={0}
                fallback={
                  <TokenSymbolFallback
                    symbol={sellToken.symbol}
                    size="32px"
                    nativeChainId={isSellNative ? sellToken.chainId : undefined}
                    nativeChainName={isSellNative ? chainName : undefined}
                  />
                }
              />
            ) : (
              <TokenSymbolFallback
                symbol={sellToken.symbol}
                size="32px"
                nativeChainId={isSellNative ? sellToken.chainId : undefined}
                nativeChainName={isSellNative ? chainName : undefined}
              />
            )}
            <VStack spacing={0} align="flex-start" flex={1} minW={0}>
              <Text fontSize="xs" color="text.tertiary" fontWeight="700" textTransform="uppercase">
                You sell
              </Text>
              <Text fontSize="md" fontWeight="900" color="text.primary" noOfLines={1}>
                {formatTokenAmount(sellAmount, { thousandsSeparator: true })} {sellToken.symbol.toUpperCase()}
              </Text>
            </VStack>
            {sellUsd > 0 && (
              <Text fontSize="sm" color="text.secondary" fontWeight="700" flexShrink={0}>
                {formatUsd(sellUsd)}
              </Text>
            )}
          </HStack>

          {/* Arrow divider with centered line */}
          <Box position="relative" h="28px" my="6px">
            {/* Horizontal line through center */}
            <Box
              position="absolute"
              top="50%"
              left={0}
              right={0}
              h="1px"
              bg="border.subtle"
            />
            {/* Arrow circle — cool secondary accent in either palette */}
            <Box
              position="absolute"
              top="50%"
              left="50%"
              transform="translate(-50%, -50%)"
              bg="accent.secondary"
              borderRadius="full"
              w="28px"
              h="28px"
              display="flex"
              alignItems="center"
              justifyContent="center"
              border="2px solid"
              borderColor="border.default"
              zIndex={1}
            >
              <ArrowDownIcon boxSize={4} color="accentFg.secondary" />
            </Box>
          </Box>

          {/* Buy row */}
          <HStack px={3} py={2.5} spacing={3}>
            {buyLogoSrc ? (
              <Image
                src={buyLogoSrc}
                alt={buyTokenInfo.symbol}
                boxSize="32px"
                borderRadius="full"
                flexShrink={0}
                fallback={
                  <TokenSymbolFallback
                    symbol={buyTokenInfo.symbol}
                    size="32px"
                    nativeChainId={isBuyNative ? buyChainId : undefined}
                    nativeChainName={
                      isBuyNative
                        ? bridgeMeta?.destinationChainName ?? chainName
                        : undefined
                    }
                  />
                }
              />
            ) : (
              <TokenSymbolFallback
                symbol={buyTokenInfo.symbol}
                size="32px"
                nativeChainId={isBuyNative ? buyChainId : undefined}
                nativeChainName={
                  isBuyNative
                    ? bridgeMeta?.destinationChainName ?? chainName
                    : undefined
                }
              />
            )}
            <VStack spacing={0} align="flex-start" flex={1} minW={0}>
              <Text fontSize="xs" color="text.tertiary" fontWeight="700" textTransform="uppercase">
                You receive (est.)
              </Text>
              <Text fontSize="md" fontWeight="900" color="text.primary" noOfLines={1}>
                {formatOutputAmount(buyAmount, buyTokenDecimals)} {buyTokenInfo.symbol.toUpperCase()}
              </Text>
            </VStack>
            {buyUsd > 0 && (
              <Text fontSize="sm" color="text.secondary" fontWeight="700" flexShrink={0}>
                {formatUsd(buyUsd)}
              </Text>
            )}
          </HStack>

          {/* Network — for bridge we render source → destination so the user
              clearly sees both chains involved. */}
          <HStack
            px={3}
            py={2}
            justify="space-between"
            borderTop="1px solid"
            borderColor="border.subtle"
          >
            <Text fontSize="xs" color="text.secondary" fontWeight="700" textTransform="uppercase">
              {isBridge ? "Route" : "Network"}
            </Text>
            <HStack spacing={1.5}>
              <Badge
                fontSize="xs"
                bg="whiteAlpha.900"
                color="accent.secondary"
                border="1.5px solid"
                borderColor="accent.secondary"
                fontWeight="700"
                px={2}
                py={0.5}
                display="flex"
                alignItems="center"
                gap={1}
              >
                <ChainIcon chainId={chainId} chainName={chainName} size="12px" withChip />
                {chainName}
              </Badge>
              {isBridge && destChainConfig && (
                <>
                  <Text fontSize="xs" fontWeight="900" color="text.secondary">
                    →
                  </Text>
                  <Badge
                    fontSize="xs"
                    bg="whiteAlpha.900"
                    color="accent.secondary"
                    border="1.5px solid"
                    borderColor="accent.secondary"
                    fontWeight="700"
                    px={2}
                    py={0.5}
                    display="flex"
                    alignItems="center"
                    gap={1}
                  >
                    <ChainIcon
                      chainId={bridgeMeta!.destinationChainId}
                      chainName={bridgeMeta!.destinationChainName}
                      size="12px"
                      withChip
                    />
                    {bridgeMeta!.destinationChainName}
                  </Badge>
                </>
              )}
            </HStack>
          </HStack>

          {/* Bridge route / est. time row (only in bridge mode) */}
          {isBridge && (bridgeMeta!.routeName || bridgeMeta!.estimatedTime) && (
            <HStack
              px={3}
              py={2}
              justify="space-between"
              borderTop="1px solid"
              borderColor="border.subtle"
            >
              <Text
                fontSize="xs"
                color="text.secondary"
                fontWeight="700"
                textTransform="uppercase"
              >
                Bridge
              </Text>
              <HStack spacing={2}>
                {bridgeMeta!.routeName && (
                  <Text fontSize="xs" fontWeight="700" color="text.primary">
                    {bridgeMeta!.routeName}
                  </Text>
                )}
                {bridgeMeta!.estimatedTime !== undefined && (
                  <Text fontSize="xs" fontWeight="700" color="text.secondary">
                    ~{Math.max(1, Math.round(bridgeMeta!.estimatedTime / 60))}m
                  </Text>
                )}
              </HStack>
            </HStack>
          )}

          {/* Bridge fee row — surfaces the msg.value the source tx attaches
              (LayerZero / Stargate destination-chain delivery cost). Shown
              outside the expandable per-call section so users see the cost
              before confirming. */}
          {isBridge && bridgeFeeDisplay && (
            <HStack
              px={3}
              py={2}
              justify="space-between"
              borderTop="1px solid"
              borderColor="border.subtle"
            >
              <Text
                fontSize="xs"
                color="text.secondary"
                fontWeight="700"
                textTransform="uppercase"
              >
                Bridge Fee
              </Text>
              <VStack spacing={0} align="flex-end">
                <Text fontSize="xs" fontWeight="700" color="text.primary">
                  {bridgeFeeDisplay.amountLabel}
                </Text>
                {bridgeFeeDisplay.usdLabel && (
                  <Text fontSize="2xs" color="text.tertiary" fontWeight="600">
                    {bridgeFeeDisplay.usdLabel}
                  </Text>
                )}
              </VStack>
            </HStack>
          )}
        </Box>

        {/* EIP-7702 smart-account setup / replacement banner — shown only when
            the swap will bundle an authorization tuple (PK/SP atomic-7702 path
            where the EOA isn't already correctly delegated). Same component
            as BatchTransactionConfirmation so the UX is consistent. */}
        {eip7702Delegate && (
          <SmartAccountSetupBanner
            delegate={eip7702Delegate}
            onchainDelegate={eip7702OnchainDelegate ?? null}
            explorerUrl={config.explorer}
          />
        )}

        {/* Transaction list — expandable cards with calldata */}
        <VStack spacing={1.5} align="stretch">
          <Text fontSize="xs" fontWeight="700" color="text.secondary" textTransform="uppercase" px={1}>
            Transactions{isBatched ? " (batched)" : ""}
          </Text>

          {transactions.map((entry, i) => {
            const accent = CALL_ACCENTS[i % CALL_ACCENTS.length];
            const accentFg = CALL_ACCENT_FGS[i % CALL_ACCENT_FGS.length];
            const isExpanded = expandedCalls.has(i);
            const hasCalldata = entry.tx.data && entry.tx.data !== "0x";
            const hasValue = entry.tx.value && entry.tx.value !== "0x0" && entry.tx.value !== "0x";
            const displayName =
              entry.origin || decodedFunctionNames[i] || entry.functionName || "Transaction";

            return (
              <Box
                key={i}
                border="2px solid"
                borderColor="border.default"
                borderLeftWidth="4px"
                borderLeftColor={accent}
                // Left edge is square so the colored accent stripe runs flush
                // top-to-bottom; only the right side rounds. Mirrors the
                // pattern in BatchTransactionConfirmation.
                borderTopLeftRadius="0"
                borderBottomLeftRadius="0"
                borderTopRightRadius="lg"
                borderBottomRightRadius="lg"
                bg="surface.raised"
                overflow="hidden"
              >
                {/* Collapsed header */}
                <HStack
                  px={3}
                  py={2}
                  cursor="pointer"
                  onClick={() => toggleCall(i)}
                  _hover={{ bg: "surface.raisedHover" }}
                  transition="background 0.1s"
                >
                  <Badge
                    bg={accent}
                    color={accentFg}
                    fontSize="2xs"
                    fontWeight="800"
                    px={1.5}
                    py={0}
                    border="1px solid"
                    borderColor="border.default"
                    minW="20px"
                    textAlign="center"
                  >
                    {i + 1}
                  </Badge>
                  <Text fontSize="xs" fontWeight="700" color="text.primary" flex={1} isTruncated>
                    {displayName}
                  </Text>
                  <Text fontSize="2xs" fontFamily="mono" color="text.tertiary">
                    {entry.tx.to.slice(0, 6)}...{entry.tx.to.slice(-4)}
                  </Text>
                  <Icon
                    as={isExpanded ? ChevronUpIcon : ChevronDownIcon}
                    boxSize={4}
                    color="text.secondary"
                  />
                </HStack>

                {/* Expanded content — explicit borderTop per row so dividers
                    don't inherit currentColor via Chakra's `divider` prop. */}
                <Collapse in={isExpanded} animateOpacity>
                  <VStack
                    spacing={0}
                    align="stretch"
                    borderTop="1px solid"
                    borderColor="border.subtle"
                  >
                    {/* To */}
                    <HStack w="full" py={1.5} px={3} justify="space-between">
                      <Text fontSize="xs" color="text.secondary" fontWeight="700" textTransform="uppercase">
                        To
                      </Text>
                      <HStack
                        spacing={0.5}
                        px={1.5}
                        py={0.5}
                        bg="surface.raised"
                        border="1.5px solid"
                        borderColor="border.default"
                        borderRadius="md"
                      >
                        <Text fontSize="xs" color="text.primary" fontFamily="mono" fontWeight="700">
                          {entry.tx.to.slice(0, 6)}...{entry.tx.to.slice(-4)}
                        </Text>
                        <CopyButton value={entry.tx.to} />
                        {config.explorer && (
                          <IconButton
                            aria-label="View on explorer"
                            icon={<ExternalLinkIcon boxSize="10px" />}
                            size="xs"
                            variant="ghost"
                            minW="18px"
                            h="18px"
                            color="text.tertiary"
                            onClick={() =>
                              window.open(`${config.explorer}/address/${entry.tx.to}`, "_blank")
                            }
                            _hover={{ color: "accent.secondary", bg: "surface.sunken" }}
                          />
                        )}
                      </HStack>
                    </HStack>

                    {/* Value */}
                    {hasValue && (
                      <HStack
                        w="full"
                        py={1.5}
                        px={3}
                        justify="space-between"
                        borderTop="1px solid"
                        borderColor="border.subtle"
                      >
                        <Text fontSize="xs" color="text.secondary" fontWeight="700" textTransform="uppercase">
                          Value
                        </Text>
                        <Text fontSize="xs" fontWeight="700" color="text.primary">
                          {formatValue(entry.tx.value, sourceNativeSymbol)}
                        </Text>
                      </HStack>
                    )}

                    {/* Calldata */}
                    {hasCalldata && (
                      <Box
                        w="full"
                        px={2}
                        py={1.5}
                        borderTop="1px solid"
                        borderColor="border.subtle"
                      >
                        <CalldataDecoder
                          calldata={entry.tx.data}
                          to={entry.tx.to}
                          chainId={chainId}
                          onFunctionName={(name) => handleFunctionName(i, name)}
                        />
                      </Box>
                    )}

                    {/* ERC-8213 Calldata Digest */}
                    {hasCalldata && (
                      <Box w="full" px={2} py={1.5}>
                        <CalldataDigestDisplay calldata={entry.tx.data} />
                      </Box>
                    )}
                  </VStack>
                </Collapse>
              </Box>
            );
          })}
        </VStack>

        {/* Gas estimate */}
        <MultiTxGasEstimateDisplay
          transactions={gasTransactions}
          accountType={accountType}
          batchedTx={gasBatchedTx}
          // Mirror BatchTransactionConfirmation: when this is a non-atomic
          // swap (PK / Seed signing each tx separately), use sequential
          // estimation so the picker has tier data to render. Atomic Bankr
          // swaps keep server-managed gas (the picker stays hidden inside
          // MultiTxGasEstimateDisplay because batchedTx is set). For atomic
          // PK/SP via 7702, the picker IS used (gas comes from local
          // estimation), so plumb onGasEstimates + onValidityChange through.
          isNonAtomic={!isBatched}
          eip7702Delegate={eip7702Delegate}
          onGasEstimates={
            !isBatched || eip7702Delegate || accountType === "privateKey" || accountType === "seedPhrase"
              ? onGasEstimates
              : undefined
          }
          onValidityChange={
            !isBatched || eip7702Delegate || accountType === "privateKey" || accountType === "seedPhrase"
              ? onValidityChange
              : undefined
          }
        />

        {/* Action buttons */}
        <Box
          position="sticky"
          bottom={-3}
          bg="surface.base"
          pt={1}
          pb={1}
          mx={-3}
          px={3}
          zIndex={1}
        >
          {isSubmitting ? (
            <HStack
              justify="center"
              py={3}
              bg="accent.secondary"
              border="2px solid"
              borderColor="border.default"
              borderRadius="lg"
            >
              <Spinner size="sm" color="accentFg.secondary" />
              <Text fontSize="sm" color="accentFg.secondary" fontWeight="700" textTransform="uppercase">
                {isBridge ? "Bridging..." : "Submitting swap..."}
              </Text>
            </HStack>
          ) : (
            <HStack spacing={3} pb={1}>
              <Button variant="secondary" flex={1} onClick={onCancel}>
                Cancel
              </Button>
              <Button
                variant="highlight"
                flex={1}
                onClick={onConfirm}
                isDisabled={isConfirmDisabled}
              >
                {titleLabel}
              </Button>
            </HStack>
          )}
        </Box>
      </VStack>
    </Box>
  );
}

export default memo(SwapConfirmation);
