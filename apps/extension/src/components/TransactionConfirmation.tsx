import { useState, useEffect, useMemo, memo } from "react";
import {
  Box,
  VStack,
  HStack,
  Text,
  Button,
  Badge,
  Spinner,
  IconButton,
  Code,
  Flex,
  Spacer,
  Image,
  Icon,
  Tooltip,
} from "@chakra-ui/react";

import { keyframes } from "@emotion/react";
import {
  ArrowBackIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CopyIcon,
  CheckIcon,
  ExternalLinkIcon,
} from "@chakra-ui/icons";
import { PendingTxRequest } from "@/chrome/pendingTxStorage";
import { GasOverrides } from "@/chrome/txHandlers";
import { getChainConfig } from "@/constants/chainConfig";
import { resolveAddressToName } from "@/lib/ensUtils";
import CalldataDecoder from "@/components/CalldataDecoder";
import GasEstimateDisplay from "@/components/GasEstimateDisplay";
import AssetChangesDisplay from "@/components/AssetChangesDisplay";
import ERC20ApproveDisplay from "@/components/ERC20ApproveDisplay";
import { FromAccountDisplay } from "@/components/FromAccountDisplay";
import { isErc20Approve, parseApproveCalldata } from "@/lib/erc20Approve";
import { ethShLabelsUrl, googleFaviconUrl } from "@/constants/externalUrls";

// Success animation keyframes
const scaleIn = keyframes`
  0% { transform: scale(0) rotate(-10deg); opacity: 0; }
  50% { transform: scale(1.1) rotate(5deg); }
  100% { transform: scale(1) rotate(0deg); opacity: 1; }
`;

const checkmarkDraw = keyframes`
  0% { stroke-dashoffset: 50; }
  100% { stroke-dashoffset: 0; }
`;

interface TransactionConfirmationProps {
  txRequest: PendingTxRequest;
  currentIndex: number;
  totalCount: number;
  isInSidePanel: boolean;
  accountType?: "bankr" | "privateKey" | "seedPhrase" | "impersonator";
  onBack: () => void;
  onConfirmed: () => void;
  onRejected: () => void;
  onRejectAll: () => void;
  onNavigate: (direction: "prev" | "next") => void;
}

type ConfirmationState = "ready" | "submitting" | "sent" | "error";

// Copy button component
function CopyButton({
  value,
  light,
  label,
}: {
  value: string;
  light?: boolean;
  label?: string;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  const button = (
    <IconButton
      aria-label={label || "Copy"}
      icon={copied ? <CheckIcon /> : <CopyIcon />}
      size="xs"
      variant="ghost"
      color={
        copied
          ? "bauhaus.yellow"
          : light
            ? "whiteAlpha.800"
            : "text.secondary"
      }
      onClick={handleCopy}
      _hover={{
        color: light ? "white" : "bauhaus.blue",
        bg: light ? "whiteAlpha.200" : "bg.muted",
      }}
    />
  );

  if (!label) return button;

  return (
    <Tooltip label={label} fontSize="xs" hasArrow>
      {button}
    </Tooltip>
  );
}

function TransactionConfirmation({
  txRequest,
  currentIndex,
  totalCount,
  isInSidePanel,
  accountType,
  onBack,
  onConfirmed,
  onRejected,
  onRejectAll,
  onNavigate,
}: TransactionConfirmationProps) {
  const [state, setState] = useState<ConfirmationState>("ready");
  const [error, setError] = useState<string>("");
  const [toLabels, setToLabels] = useState<string[]>([]);
  const [resolvedToName, setResolvedToName] = useState<string | null>(null);
  const [decodedFunctionName, setDecodedFunctionName] = useState<
    string | undefined
  >();
  const [gasOverrides, setGasOverrides] = useState<GasOverrides | null>(null);

  const { tx, origin, chainName, favicon } = txRequest;

  // Parse origin safely — it may not be a valid URL (e.g. "WalletChan" for internal transfers)
  const originHostname = (() => {
    try {
      return new URL(origin).hostname;
    } catch {
      return null;
    }
  })();

  // Fetch labels for the "to" address
  useEffect(() => {
    if (!tx.to) return;

    const fetchLabels = async () => {
      try {
        const response = await fetch(
          ethShLabelsUrl(tx.to, tx.chainId),
        );
        if (response.ok) {
          const labels = await response.json();
          if (Array.isArray(labels) && labels.length > 0) {
            setToLabels(labels);
          }
        }
      } catch (err) {
        // Silently fail - labels are optional
        console.error("Failed to fetch labels:", err);
      }
    };

    fetchLabels();
  }, [tx.to, tx.chainId]);

  // Reverse resolve the "to" address to get ENS/Basename/WNS name
  useEffect(() => {
    if (!tx.to) return;
    resolveAddressToName(tx.to)
      .then((name) => {
        if (name) setResolvedToName(name);
      })
      .catch(() => {});
  }, [tx.to]);

  const handleConfirm = async () => {
    setState("submitting");
    setError("");

    const messageType =
      accountType === "privateKey" || accountType === "seedPhrase"
        ? "confirmTransactionAsyncPK"
        : "confirmTransactionAsync";

    // Determine function name: use decoded name, or "Contract Deployment" for deploys
    const functionName = !tx.to
      ? "Contract Deployment"
      : decodedFunctionName || undefined;

    chrome.runtime.sendMessage(
      {
        type: messageType,
        txId: txRequest.id,
        password: "",
        functionName,
        ...(gasOverrides ? { gasOverrides } : {}),
      },
      (result: { success: boolean; error?: string }) => {
        if (result.success) {
          // Transaction submitted
          if (isInSidePanel) {
            // In sidepanel, navigate away immediately
            onConfirmed();
          } else {
            // In popup, show success animation then close
            setState("sent");
            setTimeout(() => {
              window.close();
            }, 1000);
          }
        } else {
          setError(result.error || "Failed to submit transaction");
          setState("error");
        }
      },
    );
  };

  const handleReject = () => {
    chrome.runtime.sendMessage(
      { type: "rejectTransaction", txId: txRequest.id },
      () => {
        onRejected();
      },
    );
  };

  // Detect ERC20 approve calls
  const parsedApproval = useMemo(
    () => (tx.to && tx.data ? parseApproveCalldata(tx.data) : null),
    [tx.to, tx.data],
  );

  const formatValue = (value: string | undefined): string => {
    if (!value || value === "0" || value === "0x0") {
      return "0 ETH";
    }
    // Convert hex to decimal and format as ETH
    const wei = BigInt(value);
    const eth = Number(wei) / 1e18;
    return `${eth.toFixed(6)} ETH`;
  };

  // Success animation screen (popup mode only)
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
        {/* Geometric decorations */}
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
          position="absolute"
          bottom={6}
          left={6}
          w="0"
          h="0"
          borderLeft="8px solid transparent"
          borderRight="8px solid transparent"
          borderBottom="16px solid"
          borderBottomColor="bauhaus.yellow"
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
          Transaction Sent
        </Text>
        <Text
          fontSize="sm"
          color="text.secondary"
          textAlign="center"
          fontWeight="500"
        >
          Your transaction has been submitted
        </Text>
      </Box>
    );
  }

  return (
    <Box p={3} h="100%" overflowY="auto" bg="bg.base" css={{
      "&::-webkit-scrollbar": { width: "4px" },
      "&::-webkit-scrollbar-track": { background: "transparent" },
      "&::-webkit-scrollbar-thumb": { background: "#ccc", borderRadius: "2px" },
    }}>
      <VStack spacing={2} align="stretch">
        {/* Top row - Back button, navigation, Reject All */}
        <Flex align="center" position="relative" minH="32px">
          {/* Left - Back button */}
          <IconButton
            aria-label="Back"
            icon={<ArrowBackIcon />}
            variant="ghost"
            size="sm"
            onClick={onBack}
            minW="auto"
          />

          {/* Center - Navigation (absolutely positioned for true centering) */}
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

          {/* Right - Copy tx JSON + Reject All */}
          <Spacer />
          <HStack spacing={1}>
            <CopyButton
              label="Copy tx JSON"
              value={JSON.stringify(
                {
                  to: tx.to || null,
                  value:
                    tx.value && tx.value !== "0" && tx.value !== "0x0"
                      ? BigInt(tx.value).toString()
                      : "0",
                  data: tx.data || "0x",
                },
                null,
                2,
              )}
            />
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

        {/* Title row */}
        <Box
          bg={parsedApproval ? "bauhaus.yellow" : "bauhaus.blue"}
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
            bg={parsedApproval ? "bauhaus.blue" : "bauhaus.yellow"}
            border="2px solid"
            borderColor="bauhaus.black"
          />
          <Text
            fontWeight="900"
            fontSize="sm"
            color={parsedApproval ? "bauhaus.black" : "white"}
            textAlign="center"
            textTransform="uppercase"
            letterSpacing="wider"
          >
            {parsedApproval ? "Token Approval Request" : "Transaction Request"}
          </Text>
        </Box>

        {/* ERC20 Approve detection — shown above tx info when present */}
        {tx.to && parsedApproval && (
          <ERC20ApproveDisplay
            tokenAddress={tx.to}
            approval={parsedApproval}
            chainId={tx.chainId}
            txId={txRequest.id}
          />
        )}

        {/* Transaction Info Card */}
        <Box
          bg="bauhaus.white"
          border="2px solid"
          borderColor="bauhaus.black"
          boxShadow="2px 2px 0px 0px #121212"
          position="relative"
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
                  bg={origin === "WalletChan" ? "transparent" : "bauhaus.black"}
                  border={origin === "WalletChan" ? "none" : "1.5px solid"}
                  borderColor="bauhaus.black"
                  p={origin === "WalletChan" ? 0 : 0.5}
                  display="flex"
                  alignItems="center"
                  justifyContent="center"
                >
                  <Image
                    src={
                      origin === "WalletChan"
                        ? "/walletchan-icon.png"
                        : favicon ||
                          (originHostname
                            ? googleFaviconUrl(originHostname)
                            : undefined)
                    }
                    alt="favicon"
                    boxSize={origin === "WalletChan" ? "20px" : "14px"}
                    onError={(e) => {
                      if (originHostname) {
                        const target = e.target as HTMLImageElement;
                        const googleFallback = googleFaviconUrl(originHostname);
                        if (target.src !== googleFallback) {
                          target.src = googleFallback;
                        }
                      }
                    }}
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
              <FromAccountDisplay address={tx.from} />
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
                const config = getChainConfig(tx.chainId);
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

            {/* To Address / Contract Deployment */}
            <Box w="full" py={1.5} px={3}>
              <HStack
                justify="space-between"
                mb={toLabels.length > 0 || resolvedToName ? 1 : 0}
              >
                <Text
                  fontSize="xs"
                  color="text.secondary"
                  fontWeight="700"
                  textTransform="uppercase"
                >
                  {tx.to ? "To" : "Type"}
                </Text>
                {tx.to ? (
                  <VStack spacing={1} align="flex-end">
                    {resolvedToName && (
                      <Badge
                        fontSize="2xs"
                        bg="bauhaus.yellow"
                        color="bauhaus.black"
                        border="1.5px solid"
                        borderColor="bauhaus.black"
                        px={1.5}
                        py={0}
                        fontWeight="700"
                        maxW="200px"
                        isTruncated
                      >
                        {resolvedToName}
                      </Badge>
                    )}
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
                        {tx.to.slice(0, 6)}...{tx.to.slice(-4)}
                      </Text>
                      <CopyButton value={tx.to} />
                      {(() => {
                        const cfg = getChainConfig(tx.chainId);
                        return cfg.explorer ? (
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
                                `${cfg.explorer}/address/${tx.to}`,
                                "_blank"
                              )
                            }
                            _hover={{ color: "bauhaus.blue", bg: "bg.muted" }}
                          />
                        ) : null;
                      })()}
                    </HStack>
                  </VStack>
                ) : (
                  <Badge
                    fontSize="xs"
                    bg="bauhaus.yellow"
                    color="bauhaus.black"
                    border="1.5px solid"
                    borderColor="bauhaus.black"
                    fontWeight="700"
                    px={2}
                    py={0.5}
                  >
                    Contract Deployment
                  </Badge>
                )}
              </HStack>
              {toLabels.length > 0 && (
                <Flex justify="flex-end">
                  <Badge
                    fontSize="2xs"
                    bg="bauhaus.blue"
                    color="white"
                    border="1.5px solid"
                    borderColor="bauhaus.black"
                    px={1.5}
                    py={0}
                    fontWeight="700"
                    maxW="200px"
                    isTruncated
                  >
                    {toLabels[0]}
                  </Badge>
                </Flex>
              )}
            </Box>

            {/* Value */}
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
                {formatValue(tx.value)}
              </Text>
            </HStack>
          </VStack>
        </Box>

        {/* Asset Changes (simulation) */}
        {tx.to && <AssetChangesDisplay txRequest={txRequest} />}

        {/* Gas Estimate */}
        <GasEstimateDisplay
          txRequest={txRequest}
          accountType={accountType}
          onGasOverrides={setGasOverrides}
        />

        {/* Calldata (Decoded + Raw) */}
        {tx.data && tx.data !== "0x" && tx.to && (
          <CalldataDecoder
            calldata={tx.data}
            to={tx.to}
            chainId={tx.chainId}
            onFunctionName={setDecodedFunctionName}
          />
        )}
        {/* Raw-only fallback for contract deployments */}
        {tx.data && tx.data !== "0x" && !tx.to && (
          <Box
            bg="bauhaus.white"
            p={3}
            border="3px solid"
            borderColor="bauhaus.black"
            boxShadow="4px 4px 0px 0px #121212"
          >
            <HStack mb={2} alignItems="center">
              <Text
                fontSize="sm"
                color="text.secondary"
                fontWeight="700"
                textTransform="uppercase"
              >
                Deploy Data
              </Text>
              <Spacer />
              <CopyButton value={tx.data} />
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
              <Text
                fontSize="xs"
                fontFamily="mono"
                color="text.tertiary"
                wordBreak="break-all"
                whiteSpace="pre-wrap"
              >
                {tx.data}
              </Text>
            </Box>
          </Box>
        )}

        {/* Pinned bottom section — sticky so buttons are always reachable */}
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
        {/* Simulate on Tenderly */}
        {(() => {
          const tenderlyUrl = (() => {
            const params = new URLSearchParams({
              from: tx.from,
              value: tx.value || "0",
              rawFunctionInput: tx.data || "0x",
              network: String(tx.chainId),
              ...(tx.to ? { contractAddress: tx.to } : {}),
            });
            return `https://dashboard.tenderly.co/simulator/new?${params}`;
          })();
          return (
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
              <CopyButton value={tenderlyUrl} label="Copy Tenderly URL" />
              <HStack
                spacing={2}
                cursor="pointer"
                onClick={() => {
                  chrome.tabs.create({ url: tenderlyUrl });
                }}
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
          );
        })()}

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

        {/* Status Messages */}
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
              Submitting transaction...
            </Text>
          </HStack>
        )}

        {/* Impersonator Info Box */}
        {accountType === "impersonator" && (
          <Box
            bg="bauhaus.yellow"
            border="3px solid"
            borderColor="bauhaus.black"
            boxShadow="3px 3px 0px 0px #121212"
            p={3}
          >
            <Text fontSize="sm" color="bauhaus.black" fontWeight="700">
              Connected via Impersonated account — signing is disabled.
            </Text>
          </Box>
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
      </VStack>
    </Box>
  );
}

export default memo(TransactionConfirmation);
