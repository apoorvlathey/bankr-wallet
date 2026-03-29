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
} from "@chakra-ui/react";
import {
  ChevronDownIcon,
  ChevronUpIcon,
  CopyIcon,
  CheckIcon,
  ExternalLinkIcon,
  InfoOutlineIcon,
} from "@chakra-ui/icons";
import { PendingTxRequest } from "@/chrome/pendingTxStorage";
import type { SimulationResult, AssetChange, TokenMetadataResult } from "@/chrome/txSimulation";
import { getChainConfig } from "@/constants/chainConfig";
import { ShapesLoader } from "@/components/Chat/ShapesLoader";

interface AssetChangesDisplayProps {
  txRequest: PendingTxRequest;
  /** For batch transactions: simulate each call individually instead of the encoded batch */
  batchCalls?: { to?: string; data?: string; value?: string }[];
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

function AssetRow({ change, chainId }: { change: AssetChange; chainId: number }) {
  const [copied, setCopied] = useState(false);
  const isNative = change.address === "native";

  const handleCopy = async () => {
    if (isNative) return;
    try {
      await navigator.clipboard.writeText(change.address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  const dirColor = change.direction === "out" ? "bauhaus.red" : "bauhaus.blue";
  const showName = change.name && change.name !== change.symbol;

  return (
    <Box
      w="full"
      py={1.5}
      pl={2.5}
      borderLeft="3px solid"
      borderLeftColor={dirColor}
    >
      <HStack spacing={2.5} align="center">
        <TokenIcon change={change} />

        <VStack spacing={0} flex="1" minW={0}>
          {/* Line 1: Symbol ... Amount */}
          <HStack w="full" justify="space-between" spacing={2}>
            <Text fontSize="sm" fontWeight="700" color="text.primary" noOfLines={1}>
              {change.symbol}
            </Text>
            <Text
              fontSize="sm"
              fontWeight="700"
              fontFamily="mono"
              color={dirColor}
              flexShrink={0}
            >
              {change.direction === "out" ? "\u2212" : "+"}
              {change.formattedAmount}
            </Text>
          </HStack>

          {/* Line 2: Name + copy/explorer ... USD */}
          <HStack w="full" justify="space-between" spacing={2}>
            <HStack spacing={0.5} minW={0}>
              {showName && (
                <Text fontSize="2xs" color="text.tertiary" noOfLines={1}>
                  {change.name}
                </Text>
              )}
              {!isNative && (
                <>
                  <Tooltip label="Copy address" fontSize="xs" hasArrow>
                    <IconButton
                      aria-label="Copy"
                      icon={copied ? <CheckIcon /> : <CopyIcon />}
                      size="xs"
                      variant="ghost"
                      minW="16px"
                      h="16px"
                      color={copied ? "bauhaus.yellow" : "text.tertiary"}
                      onClick={handleCopy}
                      _hover={{ color: "bauhaus.blue", bg: "transparent" }}
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
                          _hover={{ color: "bauhaus.blue", bg: "transparent" }}
                        />
                      </Tooltip>
                    ) : null;
                  })()}
                </>
              )}
            </HStack>
            {change.valueUsd !== null && (
              <Text fontSize="2xs" fontWeight="600" color="text.secondary" flexShrink={0}>
                {formatUsd(change.valueUsd)}
              </Text>
            )}
          </HStack>
        </VStack>
      </HStack>
    </Box>
  );
}

/** Max number of metadata retry attempts */
const MAX_RETRIES = 3;
/** Delay before each retry (ms) */
const RETRY_DELAY = 2_500;

function AssetChangesDisplay({ txRequest, batchCalls }: AssetChangesDisplayProps) {
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(true);

  // Initial simulation fetch
  useEffect(() => {
    let cancelled = false;

    // Batch transactions: simulate each call individually to avoid self-call issue
    const message = batchCalls
      ? {
          type: "simulateBatchAssetChanges",
          calls: batchCalls,
          fromAddress: txRequest.tx.from,
          chainId: txRequest.tx.chainId,
        }
      : {
          type: "simulateAssetChanges",
          tx: txRequest.tx,
          accountAddress: txRequest.tx.from,
        };

    chrome.runtime.sendMessage(message, (response: SimulationResult) => {
      if (cancelled) return;
      if (chrome.runtime.lastError) {
        setLoading(false);
        return;
      }
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
        border="3px solid"
        borderColor="bauhaus.black"
        bg="bauhaus.white"
        boxShadow="4px 4px 0px 0px #121212"
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

  // Hide entirely if simulation failed or no changes
  if (!result || result.simulationFailed) return null;

  const allChanges: AssetChange[] = [];
  if (result.nativeChange) allChanges.push(result.nativeChange);
  allChanges.push(...result.tokenChanges);

  if (allChanges.length === 0) return null;

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
    <Box
      border="3px solid"
      borderColor="bauhaus.black"
      bg="bauhaus.white"
      boxShadow="4px 4px 0px 0px #121212"
      position="relative"
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
          <Box h="1px" bg="gray.200" />

          {/* Outgoing */}
          {outChanges.length > 0 && (
            <>
              <Text
                fontSize="2xs"
                fontWeight="700"
                color="bauhaus.red"
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
                color="bauhaus.blue"
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

          {!result.txSuccess && (
            <>
              <Box h="1px" bg="gray.200" mt={1.5} />
              <Text fontSize="2xs" color="bauhaus.red" fontWeight="700" pt={1}>
                Note: simulated tx reverted — actual changes may differ
              </Text>
            </>
          )}
        </VStack>
      </Collapse>
    </Box>
  );
}

export default memo(AssetChangesDisplay);
