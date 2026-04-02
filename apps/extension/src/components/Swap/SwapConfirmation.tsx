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
import { formatUnits } from "viem";
import type { PortfolioToken } from "@/chrome/portfolioApi";
import type { TokenInfo } from "@/chrome/swapApi";
import type { SwapTxEntry } from "@/chrome/txHandlers";
import { getChainConfig } from "@/constants/chainConfig";
import CalldataDecoder from "@/components/CalldataDecoder";
import { CalldataDigestDisplay } from "@/components/DigestDisplay";
import { CopyButton } from "@/components/CopyButton";
import MultiTxGasEstimateDisplay from "@/components/MultiTxGasEstimateDisplay";

// Bauhaus accent colors for call cards (matches BatchTransactionConfirmation)
const CALL_ACCENTS = ["bauhaus.red", "bauhaus.blue", "bauhaus.yellow"];

interface SwapConfirmationProps {
  transactions: SwapTxEntry[];
  sellToken: PortfolioToken;
  sellAmount: string;
  sellUsd: number;
  buyTokenInfo: TokenInfo;
  buyAmount: string;
  buyTokenDecimals: number;
  buyTokenLogoURI?: string;
  buyUsd: number;
  chainId: number;
  chainName: string;
  fromAddress: string;
  accountType: "bankr" | "privateKey" | "seedPhrase" | "impersonator";
  isBatched: boolean;
  batchedTx?: { to: string; data: string; value: string };
  onConfirm: () => void;
  onCancel: () => void;
  isSubmitting: boolean;
}

function formatTokenDisplay(amount: string): string {
  const num = parseFloat(amount);
  if (isNaN(num) || num === 0) return "0";
  if (num < 0.000001) return "< 0.000001";
  return Number(num.toPrecision(6)).toLocaleString("en-US", { maximumFractionDigits: 6 });
}

function formatOutputAmount(amount: string, decimals: number): string {
  const formatted = formatUnits(BigInt(amount), decimals);
  return formatTokenDisplay(formatted);
}

function formatUsd(value: number): string {
  if (value <= 0) return "";
  if (value < 0.01) return "<$0.01";
  return `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatValue(value: string): string {
  const wei = BigInt(value);
  const eth = Number(wei) / 1e18;
  return `${eth.toFixed(6)} ETH`;
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
  buyUsd,
  chainId,
  chainName,
  fromAddress,
  accountType,
  isBatched,
  batchedTx,
  onConfirm,
  onCancel,
  isSubmitting,
}: SwapConfirmationProps) {
  const config = getChainConfig(chainId);
  const [expandedCalls, setExpandedCalls] = useState<Set<number>>(new Set());
  const [decodedFunctionNames, setDecodedFunctionNames] = useState<Record<number, string>>({});

  const toggleCall = (index: number) => {
    setExpandedCalls((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const handleFunctionName = (index: number, name: string) => {
    setDecodedFunctionNames((prev) => ({ ...prev, [index]: name }));
  };

  // Build gas estimation inputs
  const gasTransactions = transactions.map((entry) => ({
    tx: { ...entry.tx, from: fromAddress },
    label: entry.origin,
  }));

  const gasBatchedTx = batchedTx
    ? {
        tx: {
          from: fromAddress,
          to: batchedTx.to,
          data: batchedTx.data,
          value: batchedTx.value,
          chainId,
        },
        label: `Batched (${transactions.length} calls)`,
      }
    : undefined;

  return (
    <Box
      p={3}
      h="100%"
      overflowY="auto"
      bg="bg.base"
      css={{
        "&::-webkit-scrollbar": { width: "4px" },
        "&::-webkit-scrollbar-track": { background: "transparent" },
        "&::-webkit-scrollbar-thumb": { background: "#ccc", borderRadius: "2px" },
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

        {/* Title banner */}
        <Box
          bg="bauhaus.blue"
          border="3px solid"
          borderColor="bauhaus.black"
          boxShadow="3px 3px 0px 0px #121212"
          py={1.5}
          px={3}
          position="relative"
        >
          <Box
            position="absolute"
            top="-3px"
            right="-3px"
            w="8px"
            h="8px"
            bg="bauhaus.yellow"
            border="2px solid"
            borderColor="bauhaus.black"
          />
          <HStack justify="center" spacing={2}>
            <Text
              fontWeight="900"
              fontSize="sm"
              color="white"
              textTransform="uppercase"
              letterSpacing="wider"
            >
              Confirm Swap
            </Text>
            {isBatched && (
              <Badge
                bg="bauhaus.yellow"
                color="bauhaus.black"
                border="1.5px solid"
                borderColor="bauhaus.black"
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
          bg="bauhaus.white"
          border="2px solid"
          borderColor="bauhaus.black"
          boxShadow="2px 2px 0px 0px #121212"
          overflow="hidden"
        >
          {/* Sell row */}
          <HStack px={3} py={2.5} spacing={3}>
            {sellToken.logoUrl ? (
              <Image src={sellToken.logoUrl} boxSize="32px" borderRadius="full" flexShrink={0} />
            ) : (
              <Box boxSize="32px" borderRadius="full" bg="gray.200" flexShrink={0} />
            )}
            <VStack spacing={0} align="flex-start" flex={1} minW={0}>
              <Text fontSize="xs" color="text.tertiary" fontWeight="700" textTransform="uppercase">
                You sell
              </Text>
              <Text fontSize="md" fontWeight="900" color="text.primary" noOfLines={1}>
                {formatTokenDisplay(sellAmount)} {sellToken.symbol.toUpperCase()}
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
              bg="gray.200"
            />
            {/* Arrow circle */}
            <Box
              position="absolute"
              top="50%"
              left="50%"
              transform="translate(-50%, -50%)"
              bg="bauhaus.blue"
              borderRadius="full"
              w="28px"
              h="28px"
              display="flex"
              alignItems="center"
              justifyContent="center"
              border="2px solid"
              borderColor="bauhaus.black"
              zIndex={1}
            >
              <ArrowDownIcon boxSize={4} color="white" />
            </Box>
          </Box>

          {/* Buy row */}
          <HStack px={3} py={2.5} spacing={3}>
            {buyTokenLogoURI ? (
              <Image src={buyTokenLogoURI} boxSize="32px" borderRadius="full" flexShrink={0} />
            ) : (
              <Box boxSize="32px" borderRadius="full" bg="gray.200" flexShrink={0} />
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

          {/* Network */}
          <HStack
            px={3}
            py={2}
            justify="space-between"
            borderTop="1px solid"
            borderColor="gray.200"
          >
            <Text fontSize="xs" color="text.secondary" fontWeight="700" textTransform="uppercase">
              Network
            </Text>
            <Badge
              fontSize="xs"
              bg={config.bg}
              color={config.text}
              border="1.5px solid"
              borderColor="bauhaus.black"
              fontWeight="700"
              px={2}
              py={0.5}
              display="flex"
              alignItems="center"
              gap={1}
            >
              {config.icon && (
                <Image src={config.icon} alt={chainName} boxSize="12px" />
              )}
              {chainName}
            </Badge>
          </HStack>
        </Box>

        {/* Transaction list — expandable cards with calldata */}
        <VStack spacing={1.5} align="stretch">
          <Text fontSize="xs" fontWeight="700" color="text.secondary" textTransform="uppercase" px={1}>
            Transactions{isBatched ? " (batched)" : ""}
          </Text>

          {transactions.map((entry, i) => {
            const accent = CALL_ACCENTS[i % CALL_ACCENTS.length];
            const isExpanded = expandedCalls.has(i);
            const hasCalldata = entry.tx.data && entry.tx.data !== "0x";
            const hasValue = entry.tx.value && entry.tx.value !== "0x0" && entry.tx.value !== "0x";
            const displayName = decodedFunctionNames[i] || entry.origin;

            return (
              <Box
                key={i}
                border="2px solid"
                borderColor="bauhaus.black"
                borderLeftWidth="4px"
                borderLeftColor={accent}
                bg="bauhaus.white"
                overflow="hidden"
              >
                {/* Collapsed header */}
                <HStack
                  px={3}
                  py={2}
                  cursor="pointer"
                  onClick={() => toggleCall(i)}
                  _hover={{ bg: "bg.muted" }}
                  transition="background 0.1s"
                >
                  <Badge
                    bg={accent}
                    color={accent === "bauhaus.yellow" ? "bauhaus.black" : "white"}
                    fontSize="2xs"
                    fontWeight="800"
                    px={1.5}
                    py={0}
                    border="1px solid"
                    borderColor="bauhaus.black"
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

                {/* Expanded content */}
                <Collapse in={isExpanded} animateOpacity>
                  <VStack
                    spacing={0}
                    divider={<Box h="1px" bg="gray.200" w="full" />}
                    borderTop="1px solid"
                    borderColor="gray.200"
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
                        bg="bauhaus.white"
                        border="1.5px solid"
                        borderColor="bauhaus.black"
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
                            _hover={{ color: "bauhaus.blue", bg: "bg.muted" }}
                          />
                        )}
                      </HStack>
                    </HStack>

                    {/* Value */}
                    {hasValue && (
                      <HStack w="full" py={1.5} px={3} justify="space-between">
                        <Text fontSize="xs" color="text.secondary" fontWeight="700" textTransform="uppercase">
                          Value
                        </Text>
                        <Text fontSize="xs" fontWeight="700" color="text.primary">
                          {formatValue(entry.tx.value)}
                        </Text>
                      </HStack>
                    )}

                    {/* Calldata */}
                    {hasCalldata && (
                      <Box w="full" px={2} py={1.5}>
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
        />

        {/* Action buttons */}
        <Box
          position="sticky"
          bottom={-3}
          bg="bg.base"
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
              bg="bauhaus.blue"
              border="3px solid"
              borderColor="bauhaus.black"
            >
              <Spinner size="sm" color="white" />
              <Text fontSize="sm" color="white" fontWeight="700" textTransform="uppercase">
                Submitting swap...
              </Text>
            </HStack>
          ) : (
            <HStack spacing={3} pb={1}>
              <Button variant="secondary" flex={1} onClick={onCancel}>
                Cancel
              </Button>
              <Button variant="yellow" flex={1} onClick={onConfirm}>
                Confirm Swap
              </Button>
            </HStack>
          )}
        </Box>
      </VStack>
    </Box>
  );
}

export default memo(SwapConfirmation);
