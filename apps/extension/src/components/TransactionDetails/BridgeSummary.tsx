import {
  Box,
  Flex,
  HStack,
  IconButton,
  Text,
  VStack,
} from "@chakra-ui/react";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ExternalLinkIcon,
} from "@chakra-ui/icons";
import type {
  AssetChangeRecord,
  CompletedTransaction,
} from "@/chrome/txHistoryStorage";
import ChainIcon from "@/components/ChainIcon";
import LoadingDots from "@/components/LoadingDots";
import TokenLogo from "@/components/TokenLogo";
import { getChainConfig } from "@/constants/chainConfig";
import { appendTokenSymbol } from "@/lib/tokenAmountFormat";
import {
  getResolvedChainById,
  type ResolvedChain,
} from "@/lib/chains";
import type { NetworksInfo } from "@/types";
import { pickAssetChangeAmount } from "./formatting";

type FormatUsd = (
  amountWei: string,
  decimals: number,
  chainId: number,
  addressOrNative: string | "native",
) => string | null;

type BridgeAmount = ReturnType<typeof pickAssetChangeAmount>;
type BridgeDirection = "source" | "destination";

const BRIDGE_STATUS_LABELS = [
  "Pending",
  "Assigned",
  "Extracted",
  "Fulfilled",
  "Settled",
  "Expired",
  "Cancelled",
  "Refunded",
] as const;

function explorerTxUrl(explorer: string | undefined, hash: string | undefined) {
  if (!explorer || !hash) return null;
  const normalizedHash = hash.match(/0x[a-fA-F0-9]{64}/)?.[0];
  return normalizedHash ? `${explorer}/tx/${normalizedHash}` : null;
}

function ExplorerAction({ label, url }: { label: string; url: string }) {
  return (
    <IconButton
      aria-label={label}
      icon={<ExternalLinkIcon boxSize={3} />}
      size="xs"
      variant="ghost"
      h="28px"
      minW="28px"
      color="text.tertiary"
      onClick={(event) => {
        event.stopPropagation();
        chrome.tabs.create({ url });
      }}
      _hover={{ bg: "bg.muted", color: "text.primary" }}
    />
  );
}

function DirectionLabel({ direction }: { direction: BridgeDirection }) {
  const isSource = direction === "source";
  const color = isSource ? "chart.negative" : "chart.positive";
  const ArrowIcon = isSource ? ArrowUpIcon : ArrowDownIcon;
  return (
    <HStack spacing={1.5}>
      <Flex
        boxSize="18px"
        flexShrink={0}
        align="center"
        justify="center"
        borderRadius="full"
        bg={color}
        color="surface.base"
      >
        <ArrowIcon boxSize="10px" transform="rotate(45deg)" aria-hidden />
      </Flex>
      <Text color={color} fontSize="xs" fontWeight="700" textTransform="uppercase">
        {direction}
      </Text>
    </HStack>
  );
}

function BridgeLeg({
  direction,
  chainId,
  chainName,
  tokenSymbol,
  tokenLogo,
  amount,
  usd,
  explorerUrl,
  statusLabel,
  statusBg,
  statusFg,
  loading,
}: {
  direction: BridgeDirection;
  chainId: number;
  chainName: string;
  tokenSymbol?: string;
  tokenLogo?: string | null;
  amount: BridgeAmount;
  usd: string | null;
  explorerUrl: string | null;
  statusLabel?: string | null;
  statusBg?: string;
  statusFg?: string;
  loading?: boolean;
}) {
  const isSource = direction === "source";
  const sign = isSource ? "−" : "+";
  const amountColor = isSource ? "chart.negative" : "chart.positive";

  return (
    <Box py={2.5}>
      <HStack justify="space-between" spacing={3} mb={2} minW={0}>
        <DirectionLabel direction={direction} />
        <HStack spacing={1.5} flexShrink={0}>
          {statusLabel && statusBg && statusFg && (
            <Box
              bg={statusBg}
              color={statusFg}
              px={2}
              py={0.5}
              borderRadius="full"
              fontSize="2xs"
              fontWeight="700"
              lineHeight="short"
            >
              {statusLabel}
            </Box>
          )}
          {explorerUrl ? (
            <ExplorerAction
              label={`View ${direction} transaction on explorer`}
              url={explorerUrl}
            />
          ) : loading ? (
            <LoadingDots />
          ) : null}
        </HStack>
      </HStack>

      <HStack justify="space-between" align="center" spacing={3} minW={0}>
        <HStack spacing={2.5} minW={0} flex="1">
          <Box position="relative" boxSize="28px" flexShrink={0}>
            <TokenLogo
              logoUrl={tokenLogo}
              symbol={tokenSymbol}
              alt={tokenSymbol || "Bridge token"}
              size="28px"
              fontSize="8px"
            />
            <Flex
              position="absolute"
              right="-4px"
              bottom="-2px"
              boxSize="12px"
              align="center"
              justify="center"
              overflow="hidden"
              bg="surface.raised"
              border="1px solid"
              borderColor="surface.raised"
              borderRadius="full"
            >
              <ChainIcon
                chainId={chainId}
                chainName={chainName}
                size="10px"
                withChip
              />
            </Flex>
          </Box>
          <VStack spacing={0} align="stretch" minW={0}>
            <Text
              fontSize="sm"
              fontWeight="700"
              color="text.primary"
              noOfLines={1}
            >
              {tokenSymbol || chainName}
            </Text>
            {tokenSymbol && (
              <Text fontSize="2xs" fontWeight="600" color="text.tertiary">
                on {chainName}
              </Text>
            )}
          </VStack>
        </HStack>

        <VStack spacing={0} align="flex-end" minW={0} maxW="58%">
          {amount && (
            <Text
              fontSize="sm"
              fontWeight="700"
              color={amountColor}
              fontFamily="mono"
              textAlign="right"
              overflowWrap="anywhere"
            >
              {sign}{appendTokenSymbol(amount.amountLabel, tokenSymbol ?? "")}
            </Text>
          )}
          {usd && (
            <Text fontSize="2xs" color="text.tertiary" fontWeight="600">
              {usd}
            </Text>
          )}
        </VStack>
      </HStack>
    </Box>
  );
}

export default function BridgeSummary({
  tx,
  resolvedChain,
  networksInfo,
  sourceAssetChanges,
  destinationAssetChanges,
  nativeSym,
  explorerBase,
  formatUsd,
}: {
  tx: CompletedTransaction;
  resolvedChain: ResolvedChain | undefined;
  networksInfo: NetworksInfo | undefined;
  sourceAssetChanges: AssetChangeRecord | undefined;
  destinationAssetChanges: AssetChangeRecord | undefined;
  nativeSym: string;
  explorerBase: string;
  formatUsd: FormatUsd;
}) {
  if (!tx.bridge) return null;

  const bridge = tx.bridge;
  const sourceChainName = resolvedChain?.name ?? tx.chainName;
  const destinationChain = getResolvedChainById(
    bridge.destinationChainId,
    networksInfo,
  );
  const destinationExplorer =
    destinationChain?.explorer ||
    getChainConfig(bridge.destinationChainId).explorer;
  const sellSymbol = tx.swapMeta?.sellTokenSymbol;
  const buySymbol = tx.swapMeta?.buyTokenSymbol;
  const sellAmount = pickAssetChangeAmount(
    sourceAssetChanges,
    "out",
    sellSymbol,
    sellSymbol?.toLowerCase() === nativeSym.toLowerCase(),
    18,
  );
  const destinationNativeSymbol =
    destinationChain?.nativeCurrency.symbol ?? "ETH";
  const buyAmount = pickAssetChangeAmount(
    destinationAssetChanges,
    "in",
    buySymbol,
    buySymbol?.toLowerCase() === destinationNativeSymbol.toLowerCase(),
    18,
  );
  const sellUsd = sellAmount
    ? formatUsd(
        sellAmount.amountWei,
        sellAmount.decimals,
        tx.chainId,
        sellAmount.source,
      )
    : null;
  const buyUsd = buyAmount
    ? formatUsd(
        buyAmount.amountWei,
        buyAmount.decimals,
        bridge.destinationChainId,
        buyAmount.source,
      )
    : null;

  const statusCode = bridge.bungeeStatusCode;
  const statusLabel =
    statusCode !== undefined
      ? BRIDGE_STATUS_LABELS[statusCode] ?? `Code ${statusCode}`
      : null;
  const statusTone =
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
  const sourceExplorerUrl = explorerTxUrl(
    explorerBase,
    bridge.sourceTxHash ?? tx.txHash,
  );
  const destinationExplorerUrl = explorerTxUrl(
    destinationExplorer,
    bridge.destinationTxHash,
  );
  const refundExplorerUrl = explorerTxUrl(explorerBase, bridge.refundTxHash);

  return (
    <Box
      bg="surface.raised"
      border="1px solid"
      borderColor="border.default"
      borderRadius="lg"
      px={3}
      pb={2}
      overflow="hidden"
    >
      <BridgeLeg
        direction="source"
        chainId={tx.chainId}
        chainName={sourceChainName}
        tokenSymbol={sellSymbol}
        tokenLogo={tx.swapMeta?.sellTokenLogo}
        amount={sellAmount}
        usd={sellUsd}
        explorerUrl={sourceExplorerUrl}
      />

      <Box borderTop="1px solid" borderColor="border.subtle">
        <BridgeLeg
          direction="destination"
          chainId={bridge.destinationChainId}
          chainName={bridge.destinationChainName}
          tokenSymbol={buySymbol}
          tokenLogo={tx.swapMeta?.buyTokenLogo}
          amount={buyAmount}
          usd={buyUsd}
          explorerUrl={destinationExplorerUrl}
          statusLabel={statusLabel}
          statusBg={statusBg}
          statusFg={statusFg}
          loading={!bridge.destinationTxHash && statusTone === "pending"}
        />
      </Box>

      {(bridge.routeName || bridge.refundTxHash) && (
        <VStack
          spacing={0}
          align="stretch"
          borderTop="1px solid"
          borderColor="border.subtle"
          pt={1}
        >
          {bridge.routeName && (
            <HStack justify="space-between" spacing={3} minH="36px">
              <Text fontSize="xs" fontWeight="600" color="fg.secondary">
                Route
              </Text>
              <Text fontSize="xs" fontWeight="700" color="fg.primary">
                {bridge.routeName}
              </Text>
            </HStack>
          )}
          {bridge.refundTxHash && (
            <HStack justify="space-between" spacing={3} minH="36px">
              <Text fontSize="xs" fontWeight="600" color="fg.secondary">
                Refund
              </Text>
              <HStack spacing={1}>
                <Text fontFamily="mono" fontSize="2xs" color="chart.negative">
                  {`${bridge.refundTxHash.slice(0, 8)}…${bridge.refundTxHash.slice(-4)}`}
                </Text>
                {refundExplorerUrl && (
                  <ExplorerAction
                    label="View refund transaction on explorer"
                    url={refundExplorerUrl}
                  />
                )}
              </HStack>
            </HStack>
          )}
        </VStack>
      )}
    </Box>
  );
}
