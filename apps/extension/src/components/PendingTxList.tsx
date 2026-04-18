import { memo } from "react";
import {
  Box,
  VStack,
  HStack,
  Text,
  IconButton,
  Badge,
  Image,
  Spacer,
  Button,
} from "@chakra-ui/react";
import { ArrowBackIcon, ChevronRightIcon } from "@chakra-ui/icons";
import { PendingTxRequest } from "@/chrome/pendingTxStorage";
import { PendingSignatureRequest } from "@/chrome/pendingSignatureStorage";
import type { PendingBatchTxRequest } from "@/chrome/erc5792Types";
import type { CrossDappBatch } from "@/chrome/crossDappBatchStorage";
import { getChainConfig } from "@/constants/chainConfig";
import { googleFaviconUrl } from "@/constants/externalUrls";
import { getCombinedRequests, CombinedRequest } from "@/App";
import ChainIcon from "@/components/ChainIcon";
import { useStripTokens } from "@/theme";

function getOriginHostname(origin: string): string | null {
  try {
    return new URL(origin).hostname;
  } catch {
    return null;
  }
}

function getOriginDisplay(origin: string): string {
  return getOriginHostname(origin) || origin;
}

function getFaviconUrl(origin: string, favicon: string | null): string | undefined {
  if (favicon) return favicon;
  const hostname = getOriginHostname(origin);
  return hostname ? googleFaviconUrl(hostname) : undefined;
}

interface PendingTxListProps {
  txRequests: PendingTxRequest[];
  signatureRequests: PendingSignatureRequest[];
  batchRequests?: PendingBatchTxRequest[];
  crossDappBatch?: CrossDappBatch | null;
  onBack: () => void;
  onSelectTx: (txRequest: PendingTxRequest) => void;
  onSelectSignature: (sigRequest: PendingSignatureRequest) => void;
  onSelectBatch?: (batchRequest: PendingBatchTxRequest) => void;
  onSelectCrossDappBatch?: () => void;
  onRejectAll: () => void;
}

function PendingTxList({
  txRequests,
  signatureRequests,
  batchRequests = [],
  crossDappBatch,
  onBack,
  onSelectTx,
  onSelectSignature,
  onSelectBatch,
  onSelectCrossDappBatch,
  onRejectAll,
}: PendingTxListProps) {
  // Theme-aware count badge — same pattern used in batch / signature confirmation.
  const { bg: stripBg, fg: stripFg } = useStripTokens();
  const combinedRequests = getCombinedRequests(
    txRequests,
    signatureRequests,
    batchRequests,
    crossDappBatch,
  );
  const totalCount = combinedRequests.length;

  const formatTimestamp = (timestamp: number): string => {
    const now = Date.now();
    const diff = now - timestamp;
    const minutes = Math.floor(diff / 60000);

    if (minutes < 1) return "Just now";
    if (minutes === 1) return "1 min ago";
    if (minutes < 60) return `${minutes} mins ago`;

    const hours = Math.floor(minutes / 60);
    if (hours === 1) return "1 hour ago";
    return `${hours} hours ago`;
  };

  const getMethodDisplayName = (method: string): string => {
    switch (method) {
      case "personal_sign":
        return "Personal Sign";
      case "eth_sign":
        return "Eth Sign";
      case "eth_signTypedData":
      case "eth_signTypedData_v3":
      case "eth_signTypedData_v4":
        return "Typed Data";
      default:
        return method;
    }
  };

  return (
    <Box p={4} minH="100%" bg="surface.base">
      <VStack spacing={4} align="stretch">
        {/* Header */}
        <HStack>
          <IconButton
            aria-label="Back"
            icon={<ArrowBackIcon />}
            variant="ghost"
            size="sm"
            onClick={onBack}
          />
          <Text fontSize="lg" fontWeight="900" color="text.primary" textTransform="uppercase" letterSpacing="tight">
            Pending Requests
          </Text>
          <Spacer />
          <Badge
            bg="accent.highlight"
            color="accentFg.highlight"
            border="2px solid"
            borderColor="border.default"
            px={3}
            py={1}
            fontWeight="700"
          >
            {totalCount}
          </Badge>
        </HStack>

        <VStack spacing={3} align="stretch">
          {/* Combined Requests sorted by timestamp */}
          {combinedRequests.map((item, index) => {
            if (item.type === "crossDappBatch") {
              const batch = item.request;
              const config = getChainConfig(batch.chainId);
              return (
                <Box
                  key="cross-dapp-batch"
                  bg="surface.raised"
                  border="3px solid"
                  borderColor="border.default"
                  boxShadow="card"
                  p={3}
                  cursor="pointer"
                  onClick={() => onSelectCrossDappBatch?.()}
                  _hover={{
                    transform: "translateY(-2px)",
                    boxShadow: "cardHover",
                  }}
                  _active={{
                    transform: "translate(2px, 2px)",
                    boxShadow: "none",
                  }}
                  transition="all 0.2s ease-out"
                  position="relative"
                >
                  <Badge
                    position="absolute"
                    top="-10px"
                    left="-3px"
                    fontSize="xs"
                    bg="accent.highlight"
                    color="accentFg.highlight"
                    border="2px solid"
                    borderColor="border.default"
                    px={1.5}
                    zIndex={1}
                  >
                    YOUR BATCH
                  </Badge>
                  <HStack justify="space-between">
                    <HStack spacing={3} flex={1}>
                      <Badge
                        bg={stripBg}
                        color={stripFg}
                        fontSize="xs"
                        minW="28px"
                        textAlign="center"
                        fontWeight="700"
                      >
                        #{index + 1}
                      </Badge>
                      <Box flex={1}>
                        <HStack justify="space-between">
                          <Text
                            fontSize="sm"
                            fontWeight="700"
                            color="text.primary"
                            noOfLines={1}
                          >
                            Cross-Dapp Batch
                          </Text>
                          <Text fontSize="xs" color="text.tertiary" fontWeight="500">
                            {formatTimestamp(batch.createdAt)}
                          </Text>
                        </HStack>
                        <HStack spacing={2} mt={1}>
                          <Badge
                            fontSize="xs"
                            bg={config.bg}
                            color={config.text}
                            border="2px solid"
                            borderColor="border.default"
                            px={2}
                            py={0.5}
                            display="flex"
                            alignItems="center"
                            gap={1}
                          >
                            <ChainIcon
                              chainId={batch.chainId}
                              chainName={batch.chainName}
                              size="10px"
                              withChip
                            />
                            {batch.chainName}
                          </Badge>
                          <Text fontSize="xs" color="text.tertiary" fontWeight="500">
                            {batch.entries.length} call{batch.entries.length === 1 ? "" : "s"}
                          </Text>
                        </HStack>
                      </Box>
                    </HStack>
                    <Box bg={stripBg} p={1}>
                      <ChevronRightIcon color={stripFg} />
                    </Box>
                  </HStack>
                </Box>
              );
            }
            if (item.type === "tx") {
              const request = item.request;
              const config = getChainConfig(request.tx.chainId);
              return (
                <Box
                  key={request.id}
                  bg="surface.raised"
                  border="3px solid"
                  borderColor="border.default"
                  boxShadow="card"
                  p={3}
                  cursor="pointer"
                  onClick={() => onSelectTx(request)}
                  _hover={{
                    transform: "translateY(-2px)",
                    boxShadow: "cardHover",
                  }}
                  _active={{
                    transform: "translate(2px, 2px)",
                    boxShadow: "none",
                  }}
                  transition="all 0.2s ease-out"
                  position="relative"
                >
                  {/* TX badge at top left */}
                  <Badge
                    position="absolute"
                    top="-10px"
                    left="-3px"
                    fontSize="xs"
                    bg="accent.secondary"
                    color="accentFg.secondary"
                    border="2px solid"
                    borderColor="border.default"
                    px={1.5}
                    zIndex={1}
                  >
                    TX
                  </Badge>

                  <HStack justify="space-between">
                    <HStack spacing={3} flex={1}>
                      <Badge
                        bg={stripBg}
                        color={stripFg}
                        fontSize="xs"
                        minW="28px"
                        textAlign="center"
                        fontWeight="700"
                      >
                        #{index + 1}
                      </Badge>
                      <Box
                        bg="surface.raised"
                        border="2px solid"
                        borderColor="border.default"
                        p={1}
                      >
                        <Image
                          src={
                            getFaviconUrl(request.origin, request.favicon)
                          }
                          alt="favicon"
                          boxSize="24px"
                          onError={(e) => {
                            const target = e.target as HTMLImageElement;
                            const fallback = getFaviconUrl(request.origin, null);
                            if (fallback) target.src = fallback;
                          }}
                        />
                      </Box>
                      <Box flex={1}>
                        <HStack justify="space-between">
                          <Text
                            fontSize="sm"
                            fontWeight="700"
                            color="text.primary"
                            noOfLines={1}
                          >
                            {getOriginDisplay(request.origin)}
                          </Text>
                          <Text fontSize="xs" color="text.tertiary" fontWeight="500">
                            {formatTimestamp(request.timestamp)}
                          </Text>
                        </HStack>
                        <HStack spacing={2} mt={1}>
                          <Badge
                            fontSize="xs"
                            bg={config.bg}
                            color={config.text}
                            border="2px solid"
                            borderColor="border.default"
                            px={2}
                            py={0.5}
                            display="flex"
                            alignItems="center"
                            gap={1}
                          >
                            <ChainIcon
                              chainId={request.tx.chainId}
                              chainName={request.chainName}
                              size="10px"
                              withChip
                            />
                            {request.chainName}
                          </Badge>
                          <Text fontSize="xs" color="text.tertiary" fontFamily="mono" fontWeight="500">
                            {request.tx.to
                              ? `${request.tx.to.slice(0, 6)}...${request.tx.to.slice(-4)}`
                              : "Contract Deployment"}
                          </Text>
                        </HStack>
                      </Box>
                    </HStack>
                    <Box bg={stripBg} p={1}>
                      <ChevronRightIcon color={stripFg} />
                    </Box>
                  </HStack>
                </Box>
              );
            } else if (item.type === "batch") {
              const request = item.request;
              const config = getChainConfig(request.chainId);
              return (
                <Box
                  key={request.id}
                  bg="surface.raised"
                  border="3px solid"
                  borderColor="border.default"
                  boxShadow="card"
                  p={3}
                  cursor="pointer"
                  onClick={() => onSelectBatch?.(request)}
                  _hover={{
                    transform: "translateY(-2px)",
                    boxShadow: "cardHover",
                  }}
                  _active={{
                    transform: "translate(2px, 2px)",
                    boxShadow: "none",
                  }}
                  transition="all 0.2s ease-out"
                  position="relative"
                >
                  <Badge
                    position="absolute"
                    top="-10px"
                    left="-3px"
                    fontSize="xs"
                    bg="accent.highlight"
                    color="accentFg.highlight"
                    border="2px solid"
                    borderColor="border.default"
                    px={1.5}
                    zIndex={1}
                  >
                    BATCH
                  </Badge>
                  <HStack justify="space-between">
                    <HStack spacing={3} flex={1}>
                      <Badge
                        bg={stripBg}
                        color={stripFg}
                        fontSize="xs"
                        minW="28px"
                        textAlign="center"
                        fontWeight="700"
                      >
                        #{index + 1}
                      </Badge>
                      <Box
                        bg="surface.raised"
                        border="2px solid"
                        borderColor="border.default"
                        p={1}
                      >
                        <Image
                          src={getFaviconUrl(request.origin, request.favicon)}
                          alt="favicon"
                          boxSize="24px"
                          onError={(e) => {
                            const target = e.target as HTMLImageElement;
                            const fallback = getFaviconUrl(request.origin, null);
                            if (fallback) target.src = fallback;
                          }}
                        />
                      </Box>
                      <Box flex={1}>
                        <HStack justify="space-between">
                          <Text fontSize="sm" fontWeight="700" color="text.primary" noOfLines={1}>
                            {getOriginDisplay(request.origin)}
                          </Text>
                          <Text fontSize="xs" color="text.tertiary" fontWeight="500">
                            {formatTimestamp(request.timestamp)}
                          </Text>
                        </HStack>
                        <HStack spacing={2} mt={1}>
                          <Badge
                            fontSize="xs"
                            bg={config.bg}
                            color={config.text}
                            border="2px solid"
                            borderColor="border.default"
                            px={2}
                            py={0.5}
                            display="flex"
                            alignItems="center"
                            gap={1}
                          >
                            <ChainIcon
                              chainId={request.chainId}
                              chainName={request.chainName}
                              size="10px"
                              withChip
                            />
                            {request.chainName}
                          </Badge>
                          <Text fontSize="xs" color="text.tertiary" fontWeight="500">
                            {request.params.calls.length} calls
                          </Text>
                        </HStack>
                      </Box>
                    </HStack>
                    <Box bg={stripBg} p={1}>
                      <ChevronRightIcon color={stripFg} />
                    </Box>
                  </HStack>
                </Box>
              );
            } else {
              const request = item.request as PendingSignatureRequest;
              const config = getChainConfig(request.signature.chainId);
              return (
                <Box
                  key={request.id}
                  bg="surface.raised"
                  border="3px solid"
                  borderColor="border.default"
                  boxShadow="card"
                  p={3}
                  cursor="pointer"
                  onClick={() => onSelectSignature(request)}
                  _hover={{
                    transform: "translateY(-2px)",
                    boxShadow: "cardHover",
                  }}
                  _active={{
                    transform: "translate(2px, 2px)",
                    boxShadow: "none",
                  }}
                  transition="all 0.2s ease-out"
                  position="relative"
                >
                  {/* SIG badge at top left */}
                  <Badge
                    position="absolute"
                    top="-10px"
                    left="-3px"
                    fontSize="xs"
                    bg="accent.primary"
                    color="accentFg.primary"
                    border="2px solid"
                    borderColor="border.default"
                    px={1.5}
                    zIndex={1}
                  >
                    SIG
                  </Badge>

                  <HStack justify="space-between">
                    <HStack spacing={3} flex={1}>
                      <Badge
                        bg={stripBg}
                        color={stripFg}
                        fontSize="xs"
                        minW="28px"
                        textAlign="center"
                        fontWeight="700"
                      >
                        #{index + 1}
                      </Badge>
                      <Box
                        bg="surface.raised"
                        border="2px solid"
                        borderColor="border.default"
                        p={1}
                      >
                        <Image
                          src={
                            getFaviconUrl(request.origin, request.favicon)
                          }
                          alt="favicon"
                          boxSize="24px"
                          onError={(e) => {
                            const target = e.target as HTMLImageElement;
                            const fallback = getFaviconUrl(request.origin, null);
                            if (fallback) target.src = fallback;
                          }}
                        />
                      </Box>
                      <Box flex={1}>
                        <HStack justify="space-between">
                          <Text
                            fontSize="sm"
                            fontWeight="700"
                            color="text.primary"
                            noOfLines={1}
                          >
                            {getOriginDisplay(request.origin)}
                          </Text>
                          <Text fontSize="xs" color="text.tertiary" fontWeight="500">
                            {formatTimestamp(request.timestamp)}
                          </Text>
                        </HStack>
                        <HStack spacing={2} mt={1}>
                          <Badge
                            fontSize="xs"
                            bg={config.bg}
                            color={config.text}
                            border="2px solid"
                            borderColor="border.default"
                            px={2}
                            py={0.5}
                            display="flex"
                            alignItems="center"
                            gap={1}
                          >
                            <ChainIcon
                              chainId={request.signature.chainId}
                              chainName={request.chainName}
                              size="10px"
                              withChip
                            />
                            {request.chainName}
                          </Badge>
                          <Text fontSize="xs" color="text.tertiary" fontFamily="mono" fontWeight="500">
                            {getMethodDisplayName(request.signature.method)}
                          </Text>
                        </HStack>
                      </Box>
                    </HStack>
                    <Box bg={stripBg} p={1}>
                      <ChevronRightIcon color={stripFg} />
                    </Box>
                  </HStack>
                </Box>
              );
            }
          })}
        </VStack>

        {totalCount === 0 && (
          <Box
            textAlign="center"
            py={8}
            bg="surface.raised"
            border="3px solid"
            borderColor="border.default"
          >
            <Text color="text.secondary" fontWeight="500">No pending requests</Text>
          </Box>
        )}

        {totalCount > 0 && (
          <Button
            variant="danger"
            w="full"
            onClick={onRejectAll}
          >
            Reject All ({totalCount})
          </Button>
        )}
      </VStack>
    </Box>
  );
}

export default memo(PendingTxList);
