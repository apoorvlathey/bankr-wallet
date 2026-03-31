import { useState, useMemo, memo } from "react";
import {
  Box,
  VStack,
  HStack,
  Text,
  Button,
  Badge,
  Spinner,
  IconButton,
  Flex,
  Spacer,
  Image,
  Icon,
  Collapse,
} from "@chakra-ui/react";
import { keyframes } from "@emotion/react";
import {
  ArrowBackIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  ExternalLinkIcon,
} from "@chakra-ui/icons";
import type { PendingBatchTxRequest, ERC5792Call } from "@/chrome/erc5792Types";
import type { PendingTxRequest } from "@/chrome/pendingTxStorage";
import { getChainConfig } from "@/constants/chainConfig";
import CalldataDecoder from "@/components/CalldataDecoder";
import AssetChangesDisplay from "@/components/AssetChangesDisplay";
import { FromAccountDisplay } from "@/components/FromAccountDisplay";
import { CopyButton } from "@/components/CopyButton";
import MultiTxGasEstimateDisplay from "@/components/MultiTxGasEstimateDisplay";
import { encodeBatchCalls } from "@/chrome/batchTxHandlers";
import { googleFaviconUrl } from "@/constants/externalUrls";

const scaleIn = keyframes`
  0% { transform: scale(0) rotate(-10deg); opacity: 0; }
  50% { transform: scale(1.1) rotate(5deg); }
  100% { transform: scale(1) rotate(0deg); opacity: 1; }
`;

const checkmarkDraw = keyframes`
  0% { stroke-dashoffset: 50; }
  100% { stroke-dashoffset: 0; }
`;

// Bauhaus accent colors for call cards
const CALL_ACCENTS = ["bauhaus.red", "bauhaus.blue", "bauhaus.yellow"];

interface BatchTransactionConfirmationProps {
  batchRequest: PendingBatchTxRequest;
  currentIndex: number;
  totalCount: number;
  isInSidePanel: boolean;
  accountType?: "bankr" | "privateKey" | "seedPhrase" | "impersonator";
  accountAddress: string;
  onBack: () => void;
  onConfirmed: () => void;
  onRejected: () => void;
  onRejectAll: () => void;
  onNavigate: (direction: "prev" | "next") => void;
}

type ConfirmationState = "ready" | "submitting" | "sent" | "error";

function BatchTransactionConfirmation({
  batchRequest,
  currentIndex,
  totalCount,
  isInSidePanel,
  accountType,
  accountAddress,
  onBack,
  onConfirmed,
  onRejected,
  onRejectAll,
  onNavigate,
}: BatchTransactionConfirmationProps) {
  const [state, setState] = useState<ConfirmationState>("ready");
  const [error, setError] = useState<string>("");
  const [expandedCalls, setExpandedCalls] = useState<Set<number>>(new Set());
  const [decodedFunctionNames, setDecodedFunctionNames] = useState<
    Record<number, string>
  >({});

  const { params, origin, chainName, favicon, chainId } = batchRequest;
  const calls = params.calls;

  const originHostname = (() => {
    try {
      return new URL(origin).hostname;
    } catch {
      return null;
    }
  })();

  const fromAddress = params.from || accountAddress;

  // Encode batch calls for simulation and Tenderly
  const encodedBatch = useMemo(
    () => encodeBatchCalls(calls, fromAddress),
    [calls, fromAddress],
  );

  // Synthetic PendingTxRequest for AssetChangesDisplay
  const syntheticTxRequest: PendingTxRequest = useMemo(
    () => ({
      id: batchRequest.id,
      tx: {
        from: fromAddress,
        to: encodedBatch.to,
        data: encodedBatch.data,
        value: encodedBatch.value,
        chainId,
      },
      origin: batchRequest.origin,
      favicon: batchRequest.favicon,
      chainName: batchRequest.chainName,
      timestamp: batchRequest.timestamp,
    }),
    [batchRequest, encodedBatch, fromAddress, chainId],
  );

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

  const handleConfirm = async () => {
    setState("submitting");
    setError("");

    const functionNames = calls.map(
      (_, i) => decodedFunctionNames[i] || undefined,
    ).filter(Boolean) as string[];

    chrome.runtime.sendMessage(
      {
        type: "confirmBatchTransactionAsync",
        bundleId: batchRequest.id,
        password: "",
        functionNames: functionNames.length > 0 ? functionNames : undefined,
      },
      (result: { success: boolean; error?: string }) => {
        if (result.success) {
          if (isInSidePanel) {
            onConfirmed();
          } else {
            setState("sent");
            setTimeout(() => {
              window.close();
            }, 1000);
          }
        } else {
          setError(result.error || "Failed to submit batch transaction");
          setState("error");
        }
      },
    );
  };

  const handleReject = () => {
    chrome.runtime.sendMessage(
      { type: "rejectBatchTransaction", bundleId: batchRequest.id },
      () => {
        onRejected();
      },
    );
  };

  // Success animation
  if (state === "sent") {
    return (
      <Box
        h="100vh"
        bg="bg.base"
        display="flex"
        flexDirection="column"
        alignItems="center"
        justifyContent="center"
        p={8}
        position="relative"
      >
        <Box
          position="absolute"
          top={6}
          left={6}
          w="16px"
          h="16px"
          bg="bauhaus.red"
          border="2px solid"
          borderColor="bauhaus.black"
        />
        <Box
          position="absolute"
          top={6}
          right={6}
          w="16px"
          h="16px"
          bg="bauhaus.blue"
          borderRadius="full"
          border="2px solid"
          borderColor="bauhaus.black"
        />
        <Box
          w="100px"
          h="100px"
          bg="bauhaus.yellow"
          border="4px solid"
          borderColor="bauhaus.black"
          boxShadow="8px 8px 0px 0px #121212"
          display="flex"
          alignItems="center"
          justifyContent="center"
          animation={`${scaleIn} 0.4s ease-out`}
          mb={6}
        >
          <Icon viewBox="0 0 24 24" w="50px" h="50px" color="bauhaus.black">
            <path
              fill="none"
              stroke="currentColor"
              strokeWidth="4"
              strokeLinecap="square"
              strokeLinejoin="miter"
              d="M5 13l4 4L19 7"
              style={{
                strokeDasharray: 50,
                strokeDashoffset: 0,
                animation: `${checkmarkDraw} 0.4s ease-out 0.2s backwards`,
              }}
            />
          </Icon>
        </Box>
        <Text
          fontSize="2xl"
          fontWeight="900"
          color="text.primary"
          mb={2}
          textTransform="uppercase"
          letterSpacing="tight"
        >
          Batch Sent
        </Text>
        <Text fontSize="sm" color="text.secondary" textAlign="center" fontWeight="500">
          Your batch transaction has been submitted
        </Text>
      </Box>
    );
  }

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
        {/* Top row */}
        <Flex align="center" position="relative" minH="32px">
          <IconButton
            aria-label="Back"
            icon={<ArrowBackIcon />}
            variant="ghost"
            size="sm"
            onClick={onBack}
            minW="auto"
          />
          {totalCount > 1 && (
            <HStack
              spacing={0}
              position="absolute"
              left="50%"
              transform="translateX(-50%)"
            >
              <IconButton
                aria-label="Previous"
                icon={<ChevronLeftIcon />}
                variant="ghost"
                size="xs"
                isDisabled={currentIndex === 0}
                onClick={() => onNavigate("prev")}
                color="text.secondary"
                _hover={{ color: "text.primary", bg: "bg.muted" }}
                minW="auto"
                p={1}
              />
              <Badge
                bg="bauhaus.black"
                color="bauhaus.white"
                fontSize="xs"
                px={3}
                py={1}
                fontWeight="700"
              >
                {currentIndex + 1}/{totalCount}
              </Badge>
              <IconButton
                aria-label="Next"
                icon={<ChevronRightIcon />}
                variant="ghost"
                size="xs"
                isDisabled={currentIndex + 1 === totalCount}
                onClick={() => onNavigate("next")}
                color="text.secondary"
                _hover={{ color: "text.primary", bg: "bg.muted" }}
                minW="auto"
                p={1}
              />
            </HStack>
          )}
          <Spacer />
          <HStack spacing={1}>
            {totalCount > 1 && (
              <Button
                size="xs"
                variant="ghost"
                color="bauhaus.red"
                fontWeight="700"
                _hover={{ bg: "bauhaus.red", color: "white" }}
                onClick={onRejectAll}
                px={2}
              >
                Reject All
              </Button>
            )}
          </HStack>
        </Flex>

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
          <Text
            fontWeight="900"
            fontSize="sm"
            color="white"
            textAlign="center"
            textTransform="uppercase"
            letterSpacing="wider"
          >
            Batch Transaction ({calls.length} calls)
          </Text>
        </Box>

        {/* Info Card */}
        <Box
          bg="bauhaus.white"
          border="2px solid"
          borderColor="bauhaus.black"
          boxShadow="2px 2px 0px 0px #121212"
        >
          <VStack spacing={0} divider={<Box h="1px" bg="gray.300" w="full" />}>
            {/* Origin */}
            <HStack w="full" py={1.5} px={3} justify="space-between">
              <Text
                fontSize="xs"
                color="text.secondary"
                fontWeight="700"
                textTransform="uppercase"
              >
                Origin
              </Text>
              <HStack spacing={1.5}>
                <Box
                  bg="bauhaus.black"
                  border="1.5px solid"
                  borderColor="bauhaus.black"
                  p={0.5}
                  display="flex"
                  alignItems="center"
                  justifyContent="center"
                >
                  <Image
                    src={
                      favicon ||
                      (originHostname
                        ? googleFaviconUrl(originHostname)
                        : undefined)
                    }
                    alt="favicon"
                    boxSize="14px"
                    fallback={<Box boxSize="14px" bg="bauhaus.black" />}
                  />
                </Box>
                <Text fontSize="xs" fontWeight="700" color="text.primary">
                  {originHostname || origin}
                </Text>
              </HStack>
            </HStack>

            {/* From */}
            <HStack w="full" py={1.5} px={3} justify="space-between">
              <Text
                fontSize="xs"
                color="text.secondary"
                fontWeight="700"
                textTransform="uppercase"
              >
                From
              </Text>
              <FromAccountDisplay address={fromAddress} />
            </HStack>

            {/* Network */}
            <HStack w="full" py={1.5} px={3} justify="space-between">
              <Text
                fontSize="xs"
                color="text.secondary"
                fontWeight="700"
                textTransform="uppercase"
              >
                Network
              </Text>
              {(() => {
                const config = getChainConfig(chainId);
                return (
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
                );
              })()}
            </HStack>
          </VStack>
        </Box>

        {/* Calls List */}
        <VStack spacing={1.5} align="stretch">
          <Text
            fontSize="xs"
            fontWeight="700"
            color="text.secondary"
            textTransform="uppercase"
            px={1}
          >
            Calls
          </Text>
          {calls.map((call, index) => (
            <CallCard
              key={index}
              call={call}
              index={index}
              chainId={chainId}
              isExpanded={expandedCalls.has(index)}
              onToggle={() => toggleCall(index)}
              onFunctionName={(name) => handleFunctionName(index, name)}
              decodedName={decodedFunctionNames[index]}
            />
          ))}
        </VStack>

        {/* Asset Changes (simulate each call individually to avoid self-call issue) */}
        <AssetChangesDisplay
          txRequest={syntheticTxRequest}
          batchCalls={calls.map((c) => ({ to: c.to, data: c.data, value: c.value }))}
        />

        {/* Gas Estimate */}
        <MultiTxGasEstimateDisplay
          transactions={calls.map((c, i) => ({
            tx: {
              from: fromAddress,
              to: c.to || "0x0000000000000000000000000000000000000000",
              data: c.data || "0x",
              value: c.value || "0x0",
              chainId,
            },
            label: decodedFunctionNames[i] || `Call ${i + 1}`,
          }))}
          accountType={accountType || "bankr"}
          batchedTx={{
            tx: {
              from: fromAddress,
              to: encodedBatch.to,
              data: encodedBatch.data,
              value: encodedBatch.value,
              chainId,
            },
            label: `Batch Transaction (${calls.length} calls)`,
          }}
        />

        {/* Tenderly link */}
        {(() => {
          const tenderlyUrl = (() => {
            const tenderlyParams = new URLSearchParams({
              from: fromAddress,
              value: encodedBatch.value || "0",
              rawFunctionInput: encodedBatch.data || "0x",
              network: String(chainId),
              contractAddress: encodedBatch.to,
            });
            return `https://dashboard.tenderly.co/simulator/new?${tenderlyParams}`;
          })();
          return (
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
              <VStack spacing={2} align="stretch">
                <HStack
                  spacing={2}
                  w="full"
                  border="2px solid"
                  borderColor="bauhaus.black"
                  px={3}
                  py={1.5}
                  justify="center"
                  _hover={{ bg: "bg.muted" }}
                  transition="background 0.15s"
                >
                  <CopyButton value={tenderlyUrl} />
                  <HStack
                    spacing={2}
                    cursor="pointer"
                    onClick={() => chrome.tabs.create({ url: tenderlyUrl })}
                  >
                    <Image
                      src={googleFaviconUrl("tenderly.co")}
                      boxSize="14px"
                    />
                    <Text
                      fontWeight="700"
                      fontSize="xs"
                      textTransform="uppercase"
                      letterSpacing="wide"
                    >
                      Simulate on Tenderly
                    </Text>
                    <ExternalLinkIcon boxSize={3} />
                  </HStack>
                </HStack>

                {/* Error Display */}
                {error && state === "error" && (
                  <Box
                    bg="bauhaus.red"
                    border="3px solid"
                    borderColor="bauhaus.black"
                    boxShadow="4px 4px 0px 0px #121212"
                    p={3}
                  >
                    <Text color="white" fontSize="sm" fontWeight="700">
                      {error}
                    </Text>
                  </Box>
                )}

                {/* Submitting */}
                {state === "submitting" && (
                  <HStack
                    justify="center"
                    py={3}
                    bg="bauhaus.blue"
                    border="3px solid"
                    borderColor="bauhaus.black"
                  >
                    <Spinner size="sm" color="white" />
                    <Text
                      fontSize="sm"
                      color="white"
                      fontWeight="700"
                      textTransform="uppercase"
                    >
                      Submitting batch...
                    </Text>
                  </HStack>
                )}

                {/* Action Buttons */}
                {state !== "submitting" && (
                  <HStack spacing={3} pb={1}>
                    <Button variant="secondary" flex={1} onClick={handleReject}>
                      Reject
                    </Button>
                    {accountType !== "impersonator" && (
                      <Button
                        variant="yellow"
                        flex={1}
                        onClick={handleConfirm}
                        isDisabled={state === "error"}
                      >
                        Confirm
                      </Button>
                    )}
                  </HStack>
                )}
              </VStack>
            </Box>
          );
        })()}
      </VStack>
    </Box>
  );
}

// ---------------------------------------------------------------------------
// CallCard — individual call in the batch (collapsible)
// ---------------------------------------------------------------------------

function CallCard({
  call,
  index,
  chainId,
  isExpanded,
  onToggle,
  onFunctionName,
  decodedName,
}: {
  call: ERC5792Call;
  index: number;
  chainId: number;
  isExpanded: boolean;
  onToggle: () => void;
  onFunctionName: (name: string) => void;
  decodedName?: string;
}) {
  const accent = CALL_ACCENTS[index % CALL_ACCENTS.length];
  const config = getChainConfig(chainId);
  const hasCalldata = call.data && call.data !== "0x";
  const hasValue =
    call.value && call.value !== "0x0" && call.value !== "0x";

  const formatValue = (value: string): string => {
    const wei = BigInt(value);
    const eth = Number(wei) / 1e18;
    return `${eth.toFixed(6)} ETH`;
  };

  // Display name: decoded function name, or "Native Transfer" for value-only, or "Call"
  const displayName = decodedName
    ? decodedName
    : !hasCalldata && hasValue
      ? "Native Transfer"
      : hasCalldata
        ? "Contract Call"
        : "Call";

  return (
    <Box
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
        onClick={onToggle}
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
          {index + 1}
        </Badge>
        <Text fontSize="xs" fontWeight="700" color="text.primary" flex={1} isTruncated>
          {displayName}
        </Text>
        {call.to && (
          <Text fontSize="2xs" fontFamily="mono" color="text.tertiary">
            {call.to.slice(0, 6)}...{call.to.slice(-4)}
          </Text>
        )}
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
          {call.to && (
            <HStack w="full" py={1.5} px={3} justify="space-between">
              <Text
                fontSize="xs"
                color="text.secondary"
                fontWeight="700"
                textTransform="uppercase"
              >
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
                <Text
                  fontSize="xs"
                  color="text.primary"
                  fontFamily="mono"
                  fontWeight="700"
                >
                  {call.to.slice(0, 6)}...{call.to.slice(-4)}
                </Text>
                <CopyButton value={call.to} />
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
                      window.open(
                        `${config.explorer}/address/${call.to}`,
                        "_blank",
                      )
                    }
                    _hover={{ color: "bauhaus.blue", bg: "bg.muted" }}
                  />
                )}
              </HStack>
            </HStack>
          )}

          {/* Value */}
          {hasValue && (
            <HStack w="full" py={1.5} px={3} justify="space-between">
              <Text
                fontSize="xs"
                color="text.secondary"
                fontWeight="700"
                textTransform="uppercase"
              >
                Value
              </Text>
              <Text fontSize="xs" fontWeight="700" color="text.primary">
                {formatValue(call.value!)}
              </Text>
            </HStack>
          )}

          {/* Calldata */}
          {hasCalldata && call.to && (
            <Box w="full" px={2} py={1.5}>
              <CalldataDecoder
                calldata={call.data!}
                to={call.to}
                chainId={chainId}
                onFunctionName={onFunctionName}
              />
            </Box>
          )}
        </VStack>
      </Collapse>
    </Box>
  );
}

export default memo(BatchTransactionConfirmation);
