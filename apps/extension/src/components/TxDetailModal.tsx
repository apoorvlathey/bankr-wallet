import { memo, useState, useEffect } from "react";
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
} from "@chakra-ui/icons";
import { CompletedTransaction, GasData, type ForceInclusionMeta } from "@/chrome/txHistoryStorage";
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
  const [gasExpanded, setGasExpanded] = useState(false);

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

                {/* Value card */}
                <Box
                  bg="surface.sunken"
                  border="1px solid"
                  borderColor="border.subtle"
                  borderRadius="md"
                  p={3}
                >
                  <Text fontSize="xs" color="text.secondary" fontWeight="700" textTransform="uppercase" mb={1}>
                    Value
                  </Text>
                  <Text fontSize="sm" fontWeight="700" color="text.primary">
                    {formatValue(tx.tx.value, nativeSym)}
                  </Text>
                </Box>
              </>
            )}

            {/* Gas — collapsible */}
            {gasData && txFee && (
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
                      Transaction Fee
                    </Text>
                  </HStack>
                  <HStack spacing={1}>
                    <Text fontSize="xs" fontWeight="700" color="text.primary" fontFamily="mono">
                      {formatEth(txFee, nativeSym)}
                    </Text>
                    {gasExpanded
                      ? <ChevronUpIcon boxSize={4} color="text.tertiary" />
                      : <ChevronDownIcon boxSize={4} color="text.tertiary" />
                    }
                  </HStack>
                </HStack>

                <Collapse in={gasExpanded} animateOpacity>
                  <VStack align="stretch" spacing={1.5} px={3} pb={3} pt={1}>
                    <Box h="1px" bg="border.subtle" />

                    <GasRow
                      label="Gas Price"
                      value={formatGwei(gasData.effectiveGasPrice)}
                    />

                    <GasRow
                      label="Gas Limit & Usage"
                      value={`${formatNumber(gasData.gasLimit)} | ${formatNumber(gasData.gasUsed)} (${gasUsagePercent}%)`}
                    />

                    {isL2 && (
                      <>
                        <Box h="1px" bg="border.subtle" mt={0.5} mb={0.5} />
                        <GasRow
                          label="L2 Fees Paid"
                          value={formatEth((BigInt(gasData.gasUsed) * BigInt(gasData.effectiveGasPrice)).toString(), nativeSym)}
                        />
                        {gasData.l1Fee && (
                          <GasRow label="L1 Fees Paid" value={formatEth(gasData.l1Fee, nativeSym)} />
                        )}
                        {gasData.l1GasPrice && (
                          <GasRow label="L1 Gas Price" value={formatGwei(gasData.l1GasPrice)} />
                        )}
                        {gasData.l1GasUsed && (
                          <GasRow label="L1 Gas Used" value={formatNumber(gasData.l1GasUsed)} />
                        )}
                      </>
                    )}
                  </VStack>
                </Collapse>
              </Box>
            )}

            {/* Calldata */}
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

            {/* Error for failed txs */}
            {tx.status === "failed" && tx.error && (
              <Box
                p={3}
                bg="status.error.bg"
                border="2px solid"
                borderColor="border.default"
              >
                <Text fontSize="xs" color="status.error.fg" fontWeight="700" mb={0.5} textTransform="uppercase">
                  Error
                </Text>
                <Text fontSize="xs" color="status.error.fg" fontWeight="500">
                  {tx.error}
                </Text>
              </Box>
            )}

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
