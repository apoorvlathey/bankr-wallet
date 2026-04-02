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
import { getChainConfig } from "@/constants/chainConfig";
import { googleFaviconUrl } from "@/constants/externalUrls";
import { getCombinedRequests, CombinedRequest } from "@/App";
import ChainIcon from "@/components/ChainIcon";

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
  onBack: () => void;
  onSelectTx: (txRequest: PendingTxRequest) => void;
  onSelectSignature: (sigRequest: PendingSignatureRequest) => void;
  onSelectBatch?: (batchRequest: PendingBatchTxRequest) => void;
  onRejectAll: () => void;
}

function PendingTxList({ txRequests, signatureRequests, batchRequests = [], onBack, onSelectTx, onSelectSignature, onSelectBatch, onRejectAll }: PendingTxListProps) {
  const combinedRequests = getCombinedRequests(txRequests, signatureRequests, batchRequests);
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
    <Box p={4} minH="100%" bg="bg.base">
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
            bg="bauhaus.yellow"
            color="bauhaus.black"
            border="2px solid"
            borderColor="bauhaus.black"
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
            if (item.type === "tx") {
              const request = item.request;
              const config = getChainConfig(request.tx.chainId);
              return (
                <Box
                  key={request.id}
                  bg="bauhaus.white"
                  border="3px solid"
                  borderColor="bauhaus.black"
                  boxShadow="4px 4px 0px 0px #121212"
                  p={3}
                  cursor="pointer"
                  onClick={() => onSelectTx(request)}
                  _hover={{
                    transform: "translateY(-2px)",
                    boxShadow: "6px 6px 0px 0px #121212",
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
                    bg="bauhaus.blue"
                    color="white"
                    border="2px solid"
                    borderColor="bauhaus.black"
                    px={1.5}
                    zIndex={1}
                  >
                    TX
                  </Badge>

                  <HStack justify="space-between">
                    <HStack spacing={3} flex={1}>
                      <Badge
                        bg="bauhaus.black"
                        color="bauhaus.white"
                        fontSize="xs"
                        minW="28px"
                        textAlign="center"
                        fontWeight="700"
                      >
                        #{index + 1}
                      </Badge>
                      <Box
                        bg="bauhaus.white"
                        border="2px solid"
                        borderColor="bauhaus.black"
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
                            borderColor="bauhaus.black"
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
                    <Box bg="bauhaus.black" p={1}>
                      <ChevronRightIcon color="bauhaus.white" />
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
                  bg="bauhaus.white"
                  border="3px solid"
                  borderColor="bauhaus.black"
                  boxShadow="4px 4px 0px 0px #121212"
                  p={3}
                  cursor="pointer"
                  onClick={() => onSelectBatch?.(request)}
                  _hover={{
                    transform: "translateY(-2px)",
                    boxShadow: "6px 6px 0px 0px #121212",
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
                    bg="bauhaus.yellow"
                    color="bauhaus.black"
                    border="2px solid"
                    borderColor="bauhaus.black"
                    px={1.5}
                    zIndex={1}
                  >
                    BATCH
                  </Badge>
                  <HStack justify="space-between">
                    <HStack spacing={3} flex={1}>
                      <Badge
                        bg="bauhaus.black"
                        color="bauhaus.white"
                        fontSize="xs"
                        minW="28px"
                        textAlign="center"
                        fontWeight="700"
                      >
                        #{index + 1}
                      </Badge>
                      <Box
                        bg="bauhaus.white"
                        border="2px solid"
                        borderColor="bauhaus.black"
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
                            borderColor="bauhaus.black"
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
                            />
                            {request.chainName}
                          </Badge>
                          <Text fontSize="xs" color="text.tertiary" fontWeight="500">
                            {request.params.calls.length} calls
                          </Text>
                        </HStack>
                      </Box>
                    </HStack>
                    <Box bg="bauhaus.black" p={1}>
                      <ChevronRightIcon color="bauhaus.white" />
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
                  bg="bauhaus.white"
                  border="3px solid"
                  borderColor="bauhaus.black"
                  boxShadow="4px 4px 0px 0px #121212"
                  p={3}
                  cursor="pointer"
                  onClick={() => onSelectSignature(request)}
                  _hover={{
                    transform: "translateY(-2px)",
                    boxShadow: "6px 6px 0px 0px #121212",
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
                    bg="bauhaus.red"
                    color="white"
                    border="2px solid"
                    borderColor="bauhaus.black"
                    px={1.5}
                    zIndex={1}
                  >
                    SIG
                  </Badge>

                  <HStack justify="space-between">
                    <HStack spacing={3} flex={1}>
                      <Badge
                        bg="bauhaus.black"
                        color="bauhaus.white"
                        fontSize="xs"
                        minW="28px"
                        textAlign="center"
                        fontWeight="700"
                      >
                        #{index + 1}
                      </Badge>
                      <Box
                        bg="bauhaus.white"
                        border="2px solid"
                        borderColor="bauhaus.black"
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
                            borderColor="bauhaus.black"
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
                            />
                            {request.chainName}
                          </Badge>
                          <Text fontSize="xs" color="text.tertiary" fontFamily="mono" fontWeight="500">
                            {getMethodDisplayName(request.signature.method)}
                          </Text>
                        </HStack>
                      </Box>
                    </HStack>
                    <Box bg="bauhaus.black" p={1}>
                      <ChevronRightIcon color="bauhaus.white" />
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
            bg="bauhaus.white"
            border="3px solid"
            borderColor="bauhaus.black"
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
