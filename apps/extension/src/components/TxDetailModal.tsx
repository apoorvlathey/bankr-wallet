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
import { DEFAULT_NETWORKS, OP_STACK_CHAIN_IDS } from "@/constants/networks";
import { AddressParam } from "@/components/decodedParams/AddressParam";
import { CopyButton } from "@/components/CopyButton";
import CalldataDecoder from "@/components/CalldataDecoder";
import { formatEth, formatGwei, formatNumber } from "@/lib/gasFormatUtils";
import { FromAccountDisplay } from "@/components/FromAccountDisplay";

interface TxDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  tx: CompletedTransaction;
}

function formatValue(value: string | undefined): string {
  if (!value || value === "0" || value === "0x0") {
    return "0 ETH";
  }
  const wei = BigInt(value);
  const eth = Number(wei) / 1e18;
  return `${eth.toFixed(6)} ETH`;
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
  const config = getChainConfig(tx.chainId);
  const hasCalldata = tx.tx.data && tx.tx.data !== "0x";
  const isContractDeploy = !tx.tx.to;
  const isL2 = OP_STACK_CHAIN_IDS.has(tx.chainId);
  const [gasExpanded, setGasExpanded] = useState(false);

  // On-demand gas data fetching for txs that don't have it yet
  const [gasData, setGasData] = useState<GasData | undefined>(tx.gasData);

  useEffect(() => {
    setGasData(tx.gasData);
    setGasExpanded(false);

    if (tx.gasData || !tx.txHash || tx.status !== "success" || !isOpen) return;

    let cancelled = false;

    (async () => {
      // Resolve RPC URL
      let rpcUrl: string | undefined;
      try {
        const { networksInfo } = await chrome.storage.sync.get("networksInfo");
        if (networksInfo) {
          for (const name of Object.keys(networksInfo)) {
            if (networksInfo[name].chainId === tx.chainId) {
              rpcUrl = networksInfo[name].rpcUrl;
              break;
            }
          }
        }
      } catch { /* ignore */ }
      if (!rpcUrl) {
        for (const net of Object.values(DEFAULT_NETWORKS)) {
          if (net.chainId === tx.chainId) { rpcUrl = net.rpcUrl; break; }
        }
      }
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

  const handleViewOnExplorer = () => {
    if (tx.txHash && config.explorer) {
      const hash = tx.txHash.match(/0x[a-fA-F0-9]{64}/)?.[0];
      if (hash) {
        chrome.tabs.create({ url: `${config.explorer}/tx/${hash}` });
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
            {/* Status + Chain + Explorer row */}
            <HStack spacing={2} flexWrap="wrap">
              <Badge
                fontSize="xs"
                bg={config.bg}
                color={config.text}
                border="2px solid"
                borderColor="bauhaus.black"
                px={2}
                py={0.5}
                display="flex"
                alignItems="center"
                gap={1}
              >
                {config.icon && (
                  <Image src={config.icon} alt={tx.chainName} boxSize="10px" />
                )}
                {tx.chainName}
              </Badge>
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
              {(tx.status === "success" || tx.status === "pending") && tx.txHash && config.explorer && (
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
              )}
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
                {formatValue(tx.tx.value)}
              </Text>
            </Box>

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
                      {formatEth(txFee)}
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
                          value={formatEth((BigInt(gasData.gasUsed) * BigInt(gasData.effectiveGasPrice)).toString())}
                        />
                        {gasData.l1Fee && (
                          <GasRow label="L1 Fees Paid" value={formatEth(gasData.l1Fee)} />
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
