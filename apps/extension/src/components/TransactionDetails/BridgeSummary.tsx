import {
  Box,
  HStack,
  IconButton,
  Image,
  Text,
  VStack,
} from "@chakra-ui/react";
import { ExternalLinkIcon } from "@chakra-ui/icons";
import type {
  AssetChangeRecord,
  CompletedTransaction,
} from "@/chrome/txHistoryStorage";
import type { NetworksInfo } from "@/types";
import ChainIcon from "@/components/ChainIcon";
import LoadingDots from "@/components/LoadingDots";
import { getChainConfig } from "@/constants/chainConfig";
import {
  getResolvedChainById,
  type ResolvedChain,
} from "@/lib/chains";
import { pickAssetChangeAmount } from "./formatting";

type FormatUsd = (
  amountWei: string,
  decimals: number,
  chainId: number,
  addressOrNative: string | "native",
) => string | null;

export default function BridgeSummary({
  tx,
  resolvedChain,
  networksInfo,
  resolveLogo,
  sourceAssetChanges,
  destinationAssetChanges,
  nativeSym,
  explorerBase,
  formatUsd,
}: {
  tx: CompletedTransaction;
  resolvedChain: ResolvedChain | undefined;
  networksInfo: NetworksInfo | undefined;
  resolveLogo: (url: string | null | undefined) => string | undefined;
  sourceAssetChanges: AssetChangeRecord | undefined;
  destinationAssetChanges: AssetChangeRecord | undefined;
  nativeSym: string;
  explorerBase: string;
  formatUsd: FormatUsd;
}) {
  return (
    <>
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
        const sellLogo = resolveLogo(tx.swapMeta.sellTokenLogo);
        const sellSymbol = tx.swapMeta.sellTokenSymbol;
        const srcChainName = resolvedChain?.name ?? tx.chainName;
        // Match the actual on-chain outflow to the swap's sell token
        // so the row reads "1.234 USDC" once assetChanges lands. Native
        // sells fall back to abs(nativeDelta).
        const sellAmount = pickAssetChangeAmount(
          sourceAssetChanges,
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
                        const usd = formatUsd(
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
        const destChain =
          getResolvedChainById(tx.bridge.destinationChainId, networksInfo);
        const destExplorer =
          destChain?.explorer ||
          getChainConfig(tx.bridge.destinationChainId).explorer;
        const destLink =
          tx.bridge.destinationTxHash && destExplorer
            ? `${destExplorer}/tx/${tx.bridge.destinationTxHash}`
            : null;
        const buyLogo = resolveLogo(tx.swapMeta?.buyTokenLogo);
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
                  destChain?.nativeCurrency.symbol ?? "ETH";
                const buyAmount = pickAssetChangeAmount(
                  destinationAssetChanges,
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
                          const usd = formatUsd(
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

    </>
  );
}
