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
import ChainIcon from "@/components/ChainIcon";
import { useStripTokens } from "@/theme";

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
  // Header bar + Add Token CTA both want a strong "dark" surface that doesn't
  // compete with the modal-style luminous shadows in Midnight. Shared with the
  // tx/sig confirmation count badges and chat header — see useStripTokens.
  const { bg: stripBg, fg: stripFg } = useStripTokens();
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
      borderColor="border.default"
      fallback={
        <Box
          boxSize="48px"
          borderRadius="full"
          border="2px solid"
          borderColor="border.default"
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
      borderColor="border.default"
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
      {/* Header — strong dark strip */}
      <Box
        bg={stripBg}
        px={4}
        py={3}
        borderBottom="3px solid"
        borderColor="border.default"
      >
        <Text
          fontSize="md"
          fontWeight="900"
          color={stripFg}
          textTransform="uppercase"
          letterSpacing="wider"
        >
          Add Token
        </Text>
        <Text fontSize="xs" color={stripFg} opacity={0.7} mt={0.5} noOfLines={1}>
          {origin}
        </Text>
      </Box>

      {/* Token card — centered */}
      <VStack flex={1} justify="center" px={4} py={6} spacing={0}>
        <Box
          bg="surface.raised"
          border="2px solid"
          borderColor="border.default"
          boxShadow="card"
          w="full"
          p={5}
        >
          <VStack spacing={4}>
            {/* Token icon + name */}
            <VStack spacing={1}>
              <Box position="relative">
                {tokenIcon}
                <Box
                  position="absolute"
                  bottom="-2px"
                  right="-4px"
                  border="2px solid"
                  borderColor="surface.raised"
                  borderRadius="full"
                  bg="surface.raised"
                >
                  <ChainIcon chainId={request.chainId} chainName={chainConfig.name} size="20px" />
                </Box>
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
              borderColor="border.subtle"
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
          fontWeight="800"
          fontSize="xs"
          h="44px"
          flex={1}
        >
          Reject
        </Button>
        <Button
          onClick={handleConfirm}
          isLoading={confirming}
          isDisabled={rejecting}
          bg={stripBg}
          color={stripFg}
          fontWeight="800"
          fontSize="xs"
          border="2px solid"
          borderColor="border.default"
          h="44px"
          _hover={{ bg: stripBg, opacity: 0.9 }}
          flex={1}
        >
          Add Token
        </Button>
      </HStack>
    </Box>
  );
}
