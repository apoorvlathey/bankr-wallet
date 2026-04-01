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
} from "@chakra-ui/react";
import {
  CheckCircleIcon,
  WarningIcon,
  ExternalLinkIcon,
  CloseIcon,
  ChevronDownIcon,
  ChevronUpIcon,
} from "@chakra-ui/icons";
import { CompletedTransaction, GasData } from "@/chrome/txHistoryStorage";
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

function TxDetailModal({ isOpen, onClose, tx }: TxDetailModalProps) {
  const { networksInfo } = useNetworks();
  const resolvedChain = getResolvedChainById(tx.chainId, networksInfo);
  const config = getChainConfig(tx.chainId);
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
      <ModalOverlay bg="blackAlpha.700" />
      <ModalContent
        bg="bauhaus.white"
        border="4px solid"
        borderColor="bauhaus.black"
        borderRadius="0"
        boxShadow="8px 8px 0px 0px #121212"
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
          borderColor="bauhaus.black"
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
              {(() => {
                const badgeChain = resolvedChain ?? {
                  name: tx.chainName,
                  bg: config.bg,
                  text: config.text,
                  icon: config.icon,
                  isCustom: false,
                };
                return (
              <Badge
                fontSize="xs"
                bg={badgeChain.isCustom ? "bauhaus.white" : badgeChain.bg}
                color={badgeChain.isCustom ? "bauhaus.black" : badgeChain.text}
                border="2px solid"
                borderColor="bauhaus.black"
                px={2}
                py={0.5}
                display="flex"
                alignItems="center"
                gap={1}
              >
                <ChainIcon chainId={tx.chainId} chainName={badgeChain.name} size="10px" />
                {badgeChain.name}
              </Badge>
                );
              })()}
              {tx.status === "pending" && (
                <Badge
                  bg="bauhaus.blue"
                  color="white"
                  border="2px solid"
                  borderColor="bauhaus.black"
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
                  bg="bauhaus.yellow"
                  color="bauhaus.black"
                  border="2px solid"
                  borderColor="bauhaus.black"
                  px={2}
                  py={0.5}
                  fontSize="xs"
                  display="flex"
                  alignItems="center"
                  gap={1}
                >
                  <CheckCircleIcon boxSize={3} />
                  Confirmed
                </Badge>
              )}
              {tx.status === "failed" && (
                <Badge
                  bg="bauhaus.red"
                  color="white"
                  border="2px solid"
                  borderColor="bauhaus.black"
                  px={2}
                  py={0.5}
                  fontSize="xs"
                  display="flex"
                  alignItems="center"
                  gap={1}
                >
                  <WarningIcon boxSize={3} />
                  Failed
                </Badge>
              )}
            </HStack>

            <HStack justify="space-between" align="center" spacing={3}>
              {tx.txHash && explorerBase ? (
                <Button
                  size="xs"
                  variant="ghost"
                  fontWeight="700"
                  fontSize="2xs"
                  textTransform="uppercase"
                  letterSpacing="wide"
                  border="2px solid"
                  borderColor="bauhaus.black"
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
                  bg="bauhaus.blue"
                  color="white"
                  fontFamily="mono"
                  border="2px solid"
                  borderColor="bauhaus.black"
                  fontWeight="700"
                >
                  {tx.functionName}
                </Code>
              </Box>
            )}

            {/* Transfer meta (sponsored transfers) */}
            {tx.transferMeta ? (
              <>
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
              </>
            ) : (
              <>
                {/* From → To row */}
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
                        bg="bauhaus.yellow"
                        color="bauhaus.black"
                        border="2px solid"
                        borderColor="bauhaus.black"
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

                {/* Value */}
                <Box>
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
                border="2px solid"
                borderColor="gray.200"
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
                    <Box h="1px" bg="gray.200" />

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
                        <Box h="1px" bg="gray.200" mt={0.5} mb={0.5} />
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
                  borderColor="bauhaus.black"
                  maxH="100px"
                  overflowY="auto"
                  css={{
                    "&::-webkit-scrollbar": { width: "6px" },
                    "&::-webkit-scrollbar-track": { background: "#E0E0E0" },
                    "&::-webkit-scrollbar-thumb": { background: "#121212" },
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
                bg="bauhaus.red"
                border="2px solid"
                borderColor="bauhaus.black"
              >
                <Text fontSize="xs" color="white" fontWeight="700" mb={0.5} textTransform="uppercase">
                  Error
                </Text>
                <Text fontSize="xs" color="white" fontWeight="500">
                  {tx.error}
                </Text>
              </Box>
            )}

          </VStack>
        </ModalBody>

        <ModalFooter borderTop="3px solid" borderColor="bauhaus.black" pt={3} pb={4}>
          <Button variant="secondary" size="sm" onClick={onClose} w="full">
            Close
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}

export default memo(TxDetailModal);
