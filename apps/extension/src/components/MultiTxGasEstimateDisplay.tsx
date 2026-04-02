import { useState, useEffect, memo } from "react";
import {
  Box,
  VStack,
  HStack,
  Text,
  Spinner,
  Collapse,
} from "@chakra-ui/react";
import { ChevronDownIcon, ChevronUpIcon, WarningIcon } from "@chakra-ui/icons";
import { GasEstimate } from "@/chrome/gasEstimation";
import { formatEth } from "@/lib/gasFormatUtils";

interface TxGasInput {
  tx: { from: string; to: string; data: string; value: string; chainId: number };
  label: string;
}

interface MultiTxGasEstimateDisplayProps {
  transactions: TxGasInput[];
  accountType: "bankr" | "privateKey" | "seedPhrase" | "impersonator";
  /** If provided, estimate gas for this single batch tx instead of individual txs */
  batchedTx?: TxGasInput;
  onInsufficientBalance?: (insufficient: boolean) => void;
}

/** Format USD from wei + price */
function formatUsd(weiStr: string, priceUsd: number | null): string | null {
  if (priceUsd === null) return null;
  const eth = Number(BigInt(weiStr)) / 1e18;
  const usd = eth * priceUsd;
  if (usd < 0.01 && usd > 0) return "<$0.01";
  return `~$${usd.toFixed(2)}`;
}

function MultiTxGasEstimateDisplay({
  transactions,
  accountType,
  batchedTx,
  onInsufficientBalance,
}: MultiTxGasEstimateDisplayProps) {
  const [estimates, setEstimates] = useState<(GasEstimate | null)[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  // Determine what to estimate
  const toEstimate: TxGasInput[] = batchedTx ? [batchedTx] : transactions;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setEstimates([]);

    const promises = toEstimate.map(
      (item) =>
        new Promise<GasEstimate | null>((resolve) => {
          chrome.runtime.sendMessage(
            {
              type: "estimateGas",
              tx: item.tx,
              accountAddress: item.tx.from,
            },
            (result: GasEstimate) => {
              if (chrome.runtime.lastError) {
                resolve(null);
                return;
              }
              resolve(result);
            },
          );
        }),
    );

    Promise.all(promises).then((results) => {
      if (cancelled) return;
      setEstimates(results);
      setLoading(false);

      const hasEstimates = results.some((r) => r !== null);
      if (!hasEstimates) {
        setError("Gas estimate unavailable");
      }

      // Check insufficient balance from the first valid estimate
      if (onInsufficientBalance) {
        const anyInsufficient = results.some((r) => r?.insufficientBalance);
        onInsufficientBalance(!!anyInsufficient);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [toEstimate.length, toEstimate.map((t) => t.tx.to + t.tx.data).join(",")]);

  // Compute totals
  const validEstimates = estimates.filter((e): e is GasEstimate => e !== null);
  const totalCostWei = validEstimates.reduce(
    (sum, e) => sum + BigInt(e.estimatedCostWei),
    0n,
  ).toString();
  const nativePriceUsd = validEstimates[0]?.nativePriceUsd ?? null;
  const sym = validEstimates[0]?.nativeCurrencySymbol || "ETH";
  const anyFailed = validEstimates.some((e) => e.estimationFailed);
  const anyInsufficient = validEstimates.some((e) => e.insufficientBalance);

  // Loading state
  if (loading) {
    return (
      <Box
        border="3px solid"
        borderColor="bauhaus.black"
        bg="bauhaus.white"
        boxShadow="4px 4px 0px 0px #121212"
      >
        <HStack px={3} py={3} justify="center">
          <Spinner size="xs" color="bauhaus.blue" />
          <Text fontSize="xs" color="text.secondary" fontWeight="700" textTransform="uppercase">
            Estimating gas...
          </Text>
        </HStack>
      </Box>
    );
  }

  // Error state
  if (error && validEstimates.length === 0) {
    return (
      <Box
        border="3px solid"
        borderColor="bauhaus.black"
        bg="bauhaus.white"
        boxShadow="4px 4px 0px 0px #121212"
        px={3}
        py={2}
      >
        <Text fontSize="xs" color="text.tertiary" fontWeight="600">
          Gas estimate unavailable
        </Text>
      </Box>
    );
  }

  if (validEstimates.length === 0) return null;

  const usdDisplay = formatUsd(totalCostWei, nativePriceUsd);

  return (
    <VStack spacing={2} align="stretch">
      {/* Revert warning */}
      {anyFailed && (
        <HStack
          bg="bauhaus.red"
          border="3px solid"
          borderColor="bauhaus.black"
          boxShadow="3px 3px 0px 0px #121212"
          px={3}
          py={2}
          spacing={2}
        >
          <WarningIcon color="white" boxSize={3.5} flexShrink={0} />
          <Text fontSize="xs" color="white" fontWeight="700" textTransform="uppercase">
            One or more transactions may revert
          </Text>
        </HStack>
      )}

      {/* Insufficient balance warning */}
      {anyInsufficient && !anyFailed && (
        <HStack
          bg="bauhaus.yellow"
          border="3px solid"
          borderColor="bauhaus.black"
          boxShadow="3px 3px 0px 0px #121212"
          px={3}
          py={2}
          spacing={2}
        >
          <WarningIcon color="bauhaus.black" boxSize={3.5} />
          <Text fontSize="xs" color="bauhaus.black" fontWeight="700" textTransform="uppercase">
            Insufficient balance for gas
          </Text>
        </HStack>
      )}

      {/* Gas estimate box */}
      <Box
        border="3px solid"
        borderColor="bauhaus.black"
        bg="bauhaus.white"
        boxShadow="4px 4px 0px 0px #121212"
        position="relative"
      >
        {/* Collapsed header */}
        <HStack
          px={3}
          py={2.5}
          cursor="pointer"
          onClick={() => setExpanded(!expanded)}
          _hover={{ bg: "bg.muted" }}
          justify="space-between"
        >
          <Text fontSize="xs" color="text.secondary" fontWeight="700" textTransform="uppercase" flexShrink={0}>
            Gas Fee
          </Text>
          <HStack spacing={1} minW={0}>
            <Text fontSize="xs" fontWeight="700" color="text.primary" fontFamily="mono" noOfLines={1}>
              {formatEth(totalCostWei, sym)}
            </Text>
            {usdDisplay && (
              <Text fontSize="xs" color="text.tertiary" fontWeight="600">
                ({usdDisplay})
              </Text>
            )}
            {expanded
              ? <ChevronUpIcon boxSize={4} color="text.tertiary" />
              : <ChevronDownIcon boxSize={4} color="text.tertiary" />}
          </HStack>
        </HStack>

        {/* Expanded details */}
        <Collapse in={expanded} animateOpacity>
          <VStack align="stretch" spacing={1.5} px={3} pb={3} pt={1}>
            <Box h="1px" bg="gray.200" />

            {/* Per-transaction breakdown */}
            {toEstimate.map((item, i) => {
              const est = estimates[i];
              if (!est) return null;

              const costUsd = formatUsd(est.estimatedCostWei, est.nativePriceUsd);

              return (
                <HStack key={i} justify="space-between" w="full">
                  <Text fontSize="xs" color="text.tertiary" fontWeight="600" noOfLines={1} maxW="55%">
                    {item.label}
                  </Text>
                  <HStack spacing={1}>
                    <Text fontSize="xs" fontWeight="700" color="text.primary" fontFamily="mono" textAlign="right">
                      {formatEth(est.estimatedCostWei, sym)}
                    </Text>
                    {costUsd && (
                      <Text fontSize="xs" color="text.tertiary" fontWeight="600">
                        ({costUsd})
                      </Text>
                    )}
                  </HStack>
                </HStack>
              );
            })}

            {/* Total row (only when multiple estimates) */}
            {validEstimates.length > 1 && (
              <>
                <Box h="1px" bg="gray.200" mt={0.5} />
                <HStack justify="space-between" w="full">
                  <Text fontSize="xs" color="text.secondary" fontWeight="700" textTransform="uppercase">
                    Total
                  </Text>
                  <HStack spacing={1}>
                    <Text fontSize="xs" fontWeight="700" color="text.primary" fontFamily="mono" textAlign="right">
                      {formatEth(totalCostWei, sym)}
                    </Text>
                    {usdDisplay && (
                      <Text fontSize="xs" color="text.tertiary" fontWeight="600">
                        ({usdDisplay})
                      </Text>
                    )}
                  </HStack>
                </HStack>
              </>
            )}

            {accountType === "bankr" && (
              <Text fontSize="2xs" color="text.tertiary" fontWeight="600" fontStyle="italic">
                Gas managed by Bankr API
              </Text>
            )}
          </VStack>
        </Collapse>
      </Box>
    </VStack>
  );
}

export default memo(MultiTxGasEstimateDisplay);
