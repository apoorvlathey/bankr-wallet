import { useMemo, useState, memo } from "react";
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
  usePrefersReducedMotion,
} from "@chakra-ui/react";
import {
  ChevronDownIcon,
  ExternalLinkIcon,
} from "@chakra-ui/icons";
import { getChainConfig } from "@/constants/chainConfig";
import CalldataDecoder from "@/components/CalldataDecoder";
import { CalldataDigestDisplay } from "@/components/DigestDisplay";
import { CopyButton } from "@/components/CopyButton";
import SmartAccountSetupBanner from "@/components/SmartAccountSetupBanner";
import { omitOuterValueForEip7702 } from "@/chrome/batchTxHandlers";
import { formatUsd as formatUsdShared } from "@/lib/currencyFormatUtils";
import { formatTokenAmount, formatTokenAmountFromBase } from "@/lib/tokenFormatUtils";
import { TokenSymbolFallback } from "@/components/Swap/TokenSymbolFallback";
import { RequestChainContext } from "@/components/RequestConfirmation/EstimatedChangesHeading";
import { useCachedAvatarSrc } from "@/hooks/useCachedAvatarSrc";
import { isDarkThemeId, useTheme } from "@/theme";
import { useNetworks } from "@/contexts/NetworksContext";
import { getNativeAssetMeta } from "@/lib/chains";
// Theme-aware accent stripes shared with the batch confirmation surfaces, so a
// multi-step swap reads as the same kind of "stack of independent calls" in
// either palette (Bauhaus red/blue/yellow, Midnight indigo/cyan/amber).
import { CALL_ACCENTS, CALL_ACCENT_FGS } from "@/components/BatchCallsList";
import { AppHeader, StickyActionBar } from "@/components/ui";
import type { FeePaymentQuoteSummary } from "@/components/FeePaymentSelector";
import { SwapDecisionSummary } from "./SwapDecisionSummary";
import type { SwapConfirmationProps } from "./swapViewTypes";

export type { PreparedSwapTxEntry } from "./swapViewTypes";

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
  requestId,
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
  accountId,
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
  isNativeGasValid = true,
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
  const overviewLabel = isBridge ? "Bridge Overview" : "Swap Overview";

  // Shared data-URL cache used by ENS avatars + batch summary + portfolio.
  // Paints sell/buy icons synchronously from chrome.storage on reopen.
  const cachedSellLogo = useCachedAvatarSrc(sellToken.logoUrl);
  const cachedBuyLogo = useCachedAvatarSrc(buyTokenLogoURI);
  const sellLogoSrc = cachedSellLogo || sellToken.logoUrl;
  const buyLogoSrc = cachedBuyLogo || buyTokenLogoURI;
  const { themeId } = useTheme();
  const prefersReducedMotion = usePrefersReducedMotion();
  const { networksInfo } = useNetworks();
  const isDarkTheme = isDarkThemeId(themeId);
  const [expandedCalls, setExpandedCalls] = useState<Set<number>>(new Set());
  const [transactionsExpanded, setTransactionsExpanded] = useState(false);
  const [decodedFunctionNames, setDecodedFunctionNames] = useState<Record<number, string>>({});
  const [feePaymentToken, setFeePaymentToken] = useState<"native" | `0x${string}`>("native");
  const [feePaymentQuote, setFeePaymentQuote] = useState<FeePaymentQuoteSummary | null>(null);
  const sourceNativeSymbol =
    getNativeAssetMeta(chainId, networksInfo)?.symbol ?? "ETH";

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
  const gasTransactions = useMemo(() => transactions.map((entry) => ({
    tx: { ...entry.tx, from: fromAddress },
    label: entry.origin,
  })), [fromAddress, transactions]);
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
    <Box h="100%" display="flex" flexDirection="column" bg="surface.base">
    <AppHeader
      title={titleLabel}
      onBack={onCancel}
      isBackDisabled={isSubmitting}
    />
    <Box
      px={3}
      pt="clamp(24px, min(12vh, 24vw), 96px)"
      pb={3}
      flex="1"
      minH={0}
      overflowY="auto"
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
        <Text
          as="h2"
          px={1}
          fontSize="sm"
          fontWeight="700"
          color="text.secondary"
        >
          {overviewLabel}
        </Text>

        {/* Swap summary card */}
        <Box
          bg="surface.raised"
          border="1px solid"
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
              <Text fontSize="xs" color="text.tertiary" fontWeight="600">
                You sell
              </Text>
              <Text fontSize="md" fontWeight="700" color="text.primary" noOfLines={1}>
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
            {/* Amber keeps the confirmation path visually continuous. */}
            <Box
              position="absolute"
              top="50%"
              left="50%"
              transform="translate(-50%, -50%)"
              bg="accent.highlight"
              borderRadius="full"
              w="28px"
              h="28px"
              display="flex"
              alignItems="center"
              justifyContent="center"
              border="1px solid"
              borderColor="border.default"
              zIndex={1}
            >
              <ArrowDownIcon boxSize={4} color="accentFg.highlight" />
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
              <Text fontSize="xs" color="text.tertiary" fontWeight="600">
                You get (est.)
              </Text>
              <Text fontSize="md" fontWeight="700" color="text.primary" noOfLines={1}>
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
            <Text fontSize="xs" color="text.secondary" fontWeight="600">
              {isBridge ? "Route" : "Network"}
            </Text>
            <HStack spacing={1.5}>
              <RequestChainContext chainId={chainId} chainName={chainName} showPreposition={false} />
              {isBridge && destChainConfig && (
                <>
                  <Text fontSize="xs" fontWeight="900" color="text.secondary">
                    →
                  </Text>
                  <RequestChainContext
                    chainId={bridgeMeta!.destinationChainId}
                    chainName={bridgeMeta!.destinationChainName} showPreposition={false}
                  />
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
          <Button
            type="button"
            variant="unstyled"
            display="flex"
            w="full"
            minH="44px"
            px={1}
            gap={2}
            onClick={() => setTransactionsExpanded((expanded) => !expanded)}
            aria-expanded={transactionsExpanded}
            aria-controls="swap-transactions"
            borderRadius="md"
            fontWeight="inherit"
            textTransform="none"
            textAlign="left"
            _hover={{ bg: "surface.raisedHover" }}
          >
            <Text fontSize="xs" fontWeight="600" color="text.secondary" flex={1}>
              Transactions{isBatched ? " (batched)" : ""}
            </Text>
            <ChevronDownIcon
              boxSize={4}
              color="text.secondary"
              transform={transactionsExpanded ? "rotate(180deg)" : "rotate(0deg)"}
              transition={prefersReducedMotion ? "none" : "transform 150ms cubic-bezier(0.23, 1, 0.32, 1)"}
              aria-hidden
            />
          </Button>

          <Collapse
            id="swap-transactions"
            in={transactionsExpanded}
            animateOpacity={!prefersReducedMotion}
          >
          <VStack spacing={1.5} align="stretch">
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
                border="1px solid"
                borderColor="border.default"
                borderRadius="lg"
                bg="surface.raised"
                overflow="hidden"
              >
                {/* Collapsed header */}
                <Button
                  type="button"
                  variant="unstyled"
                  display="flex"
                  w="full"
                  minH="44px"
                  h="auto"
                  px={3}
                  py={2}
                  gap={2}
                  onClick={() => toggleCall(i)}
                  aria-expanded={isExpanded}
                  aria-controls={`swap-call-${i}-details`}
                  borderRadius={0}
                  fontWeight="inherit"
                  textTransform="none"
                  textAlign="left"
                  _hover={{ bg: "surface.raisedHover" }}
                >
                  <Badge
                    bg={isDarkTheme ? "surface.raisedHover" : accent}
                    color={isDarkTheme ? "accent.highlight" : accentFg}
                    fontSize="2xs"
                    fontWeight="700"
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
                  <ChevronDownIcon
                    boxSize={4}
                    color="text.secondary"
                    transform={isExpanded ? "rotate(180deg)" : "rotate(0deg)"}
                    transition={prefersReducedMotion ? "none" : "transform 150ms cubic-bezier(0.23, 1, 0.32, 1)"}
                    aria-hidden
                  />
                </Button>

                {/* Expanded content — explicit borderTop per row so dividers
                    don't inherit currentColor via Chakra's `divider` prop. */}
                <Collapse id={`swap-call-${i}-details`} in={isExpanded} animateOpacity={!prefersReducedMotion}>
                  <VStack
                    spacing={0}
                    align="stretch"
                    borderTop="1px solid"
                    borderColor="border.subtle"
                  >
                    {/* To */}
                    <HStack w="full" py={1.5} px={3} justify="space-between">
                      <Text fontSize="xs" color="text.secondary" fontWeight="600">
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
                            minW="24px"
                            w="24px"
                            h="24px"
                            color="text.tertiary"
                            onClick={() =>
                              window.open(`${config.explorer}/address/${entry.tx.to}`, "_blank", "noopener,noreferrer")
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
                        <Text fontSize="xs" color="text.secondary" fontWeight="600">
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
          </Collapse>
        </VStack>

      </VStack>
    </Box>

    <StickyActionBar
      summary={<SwapDecisionSummary
        requestId={requestId}
        transactions={gasTransactions}
        fromAddress={fromAddress}
        accountId={accountId}
        accountType={accountType}
        chainId={chainId}
        isBatched={isBatched}
        batchedTx={gasBatchedTx?.tx}
        eip7702Delegate={eip7702Delegate}
        feePaymentToken={feePaymentToken}
        feePaymentQuote={feePaymentQuote}
        onFeePaymentTokenChange={setFeePaymentToken}
        onFeePaymentQuoteChange={setFeePaymentQuote}
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
      />}
      primaryAction={isSubmitting ? (
        <HStack
              justify="center"
              py={3}
              bg="accent.highlight"
              border="1px solid"
              borderColor="border.default"
              borderRadius="lg"
            >
              <Spinner size="sm" color="accentFg.highlight" />
              <Text fontSize="sm" color="accentFg.highlight" fontWeight="600">
                {isBridge ? "Bridging..." : "Submitting swap..."}
              </Text>
        </HStack>
      ) : (
        <Button
          variant="brand"
          onClick={() => onConfirm(feePaymentToken, feePaymentQuote?.quoteId ?? null)}
          isDisabled={
            isConfirmDisabled ||
            (feePaymentToken === "native" && !isNativeGasValid) ||
            (feePaymentToken !== "native" && !feePaymentQuote?.quoteId)
          }
        >
          {titleLabel}
        </Button>
      )}
      secondaryAction={isSubmitting ? undefined : (
        <Button variant="secondary" onClick={onCancel}>Cancel</Button>
      )}
    />
  </Box>
  );
}

export default memo(SwapConfirmation);
