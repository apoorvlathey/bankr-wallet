import { useState } from "react";
import {
  Box,
  VStack,
  HStack,
  Text,
  Button,
  Image,
  Spacer,
} from "@chakra-ui/react";
import { getChainConfig } from "@/constants/chainConfig";
import type { PendingWatchAssetRequest } from "@/chrome/pendingWatchAssetStorage";

interface WatchAssetConfirmationProps {
  request: PendingWatchAssetRequest;
  onConfirmed: () => void;
  onRejected: () => void;
}

export default function WatchAssetConfirmation({
  request,
  onConfirmed,
  onRejected,
}: WatchAssetConfirmationProps) {
  const [confirming, setConfirming] = useState(false);
  const [rejecting, setRejecting] = useState(false);

  const chainConfig = getChainConfig(request.chainId);
  const { asset, origin } = request;

  const handleConfirm = async () => {
    setConfirming(true);
    try {
      await new Promise<void>((resolve) => {
        chrome.runtime.sendMessage(
          { type: "confirmWatchAsset", watchAssetId: request.id },
          () => resolve()
        );
      });
      onConfirmed();
    } finally {
      setConfirming(false);
    }
  };

  const handleReject = async () => {
    setRejecting(true);
    try {
      await new Promise<void>((resolve) => {
        chrome.runtime.sendMessage(
          { type: "rejectWatchAsset", watchAssetId: request.id },
          () => resolve()
        );
      });
      onRejected();
    } finally {
      setRejecting(false);
    }
  };

  const tokenIcon = asset.image ? (
    <Image
      src={asset.image}
      alt={asset.symbol}
      boxSize="48px"
      borderRadius="full"
      border="2px solid"
      borderColor="bauhaus.black"
      fallback={
        <Box
          boxSize="48px"
          borderRadius="full"
          border="2px solid"
          borderColor="bauhaus.black"
          bg="bg.muted"
          display="flex"
          alignItems="center"
          justifyContent="center"
        >
          <Text fontSize="sm" fontWeight="800" color="text.secondary">
            {asset.symbol.slice(0, 3)}
          </Text>
        </Box>
      }
    />
  ) : (
    <Box
      boxSize="48px"
      borderRadius="full"
      border="2px solid"
      borderColor="bauhaus.black"
      bg="bg.muted"
      display="flex"
      alignItems="center"
      justifyContent="center"
    >
      <Text fontSize="sm" fontWeight="800" color="text.secondary">
        {asset.symbol.slice(0, 3)}
      </Text>
    </Box>
  );

  return (
    <Box display="flex" flexDirection="column" h="100%">
      {/* Header */}
      <Box
        bg="bauhaus.black"
        px={4}
        py={3}
        borderBottom="3px solid"
        borderColor="bauhaus.black"
      >
        <Text
          fontSize="md"
          fontWeight="900"
          color="bauhaus.white"
          textTransform="uppercase"
          letterSpacing="wider"
        >
          Add Token
        </Text>
        <Text fontSize="xs" color="whiteAlpha.700" mt={0.5} noOfLines={1}>
          {origin}
        </Text>
      </Box>

      {/* Token card — centered */}
      <VStack flex={1} justify="center" px={4} py={6} spacing={0}>
        <Box
          border="2px solid"
          borderColor="bauhaus.black"
          boxShadow="4px 4px 0px 0px #121212"
          w="full"
          p={5}
        >
          <VStack spacing={4}>
            {/* Token icon + name */}
            <VStack spacing={1}>
              <Box position="relative">
                {tokenIcon}
                {chainConfig.icon && (
                  <Image
                    src={chainConfig.icon}
                    alt=""
                    boxSize="20px"
                    position="absolute"
                    bottom="-2px"
                    right="-4px"
                    border="2px solid"
                    borderColor="white"
                    borderRadius="full"
                    bg="white"
                  />
                )}
              </Box>
              <Text fontSize="lg" fontWeight="900" mt={1}>
                {asset.symbol}
              </Text>
              <HStack spacing={1.5}>
                <Text fontSize="xs" color="text.tertiary" fontWeight="600">
                  {chainConfig.name}
                </Text>
                <Text fontSize="xs" color="text.tertiary">·</Text>
                <Text fontSize="xs" color="text.tertiary" fontWeight="600">
                  {asset.decimals} decimals
                </Text>
              </HStack>
            </VStack>

            {/* Contract address */}
            <Text
              fontFamily="mono"
              fontSize="10px"
              color="text.tertiary"
              bg="bg.muted"
              px={2.5}
              py={1.5}
              border="1px solid"
              borderColor="gray.200"
              w="full"
              textAlign="center"
              noOfLines={1}
            >
              {asset.address}
            </Text>
          </VStack>
        </Box>

        <Text fontSize="xs" color="text.tertiary" mt={3} textAlign="center">
          This site wants to add this token to your wallet
        </Text>
      </VStack>

      {/* Sticky bottom buttons */}
      <HStack spacing={3} px={4} pb={4} pt={2}>
        <Button
          onClick={handleReject}
          isLoading={rejecting}
          isDisabled={confirming}
          variant="outline"
          borderColor="bauhaus.black"
          borderWidth="2px"
          fontWeight="800"
          textTransform="uppercase"
          letterSpacing="wider"
          fontSize="xs"
          borderRadius={0}
          h="44px"
          _hover={{ bg: "bg.muted" }}
          flex={1}
        >
          Reject
        </Button>
        <Button
          onClick={handleConfirm}
          isLoading={confirming}
          isDisabled={rejecting}
          bg="bauhaus.black"
          color="bauhaus.white"
          fontWeight="800"
          textTransform="uppercase"
          letterSpacing="wider"
          fontSize="xs"
          borderRadius={0}
          border="2px solid"
          borderColor="bauhaus.black"
          h="44px"
          _hover={{ bg: "gray.800" }}
          flex={1}
        >
          Add Token
        </Button>
      </HStack>
    </Box>
  );
}
