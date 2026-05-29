import { useEffect, useState } from "react";
import {
  Badge,
  Box,
  HStack,
  IconButton,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalHeader,
  ModalOverlay,
  Text,
  VStack,
} from "@chakra-ui/react";
import { ExternalLinkIcon } from "@chakra-ui/icons";

import CalldataDecoder from "@/components/CalldataDecoder";
import { ClearSigningView } from "@/components/ClearSigning/ClearSigningView";
import { CopyButton } from "@/components/CopyButton";
import { getChainConfig } from "@/constants/chainConfig";
import { useNetworks } from "@/contexts/NetworksContext";
import { getResolvedChainById } from "@/lib/chains";

interface NativeCalldataDecodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  calldata: string;
  from: string;
  to: string;
  chainId: number;
}

export function NativeCalldataDecodeModal({
  isOpen,
  onClose,
  calldata,
  from,
  to,
  chainId,
}: NativeCalldataDecodeModalProps) {
  const { networksInfo } = useNetworks();
  const resolvedChain = getResolvedChainById(chainId, networksInfo);
  const explorer = resolvedChain?.explorer || getChainConfig(chainId).explorer;
  const [clearSigningStatus, setClearSigningStatus] = useState<
    "loading" | "matched" | "absent"
  >("loading");

  useEffect(() => {
    if (isOpen) setClearSigningStatus("loading");
  }, [isOpen, calldata, to, chainId]);

  const clearSigningMatched = clearSigningStatus === "matched";

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      isCentered
      scrollBehavior="inside"
      size="md"
    >
      <ModalOverlay bg="surface.overlay" />
      <ModalContent mx={4} overflow="hidden" maxH="calc(100vh - 2rem)">
        <ModalHeader
          color="text.primary"
          fontSize="md"
          fontWeight="900"
          pb={2}
          textTransform="uppercase"
          letterSpacing="wider"
          borderBottom="3px solid"
          borderColor="border.default"
        >
          Decode Calldata
        </ModalHeader>
        <ModalCloseButton top={2} />
        <ModalBody px={4} py={3}>
          <VStack spacing={3} align="stretch">
            <Box
              bg="surface.raised"
              border="1px solid"
              borderColor="border.default"
              borderRadius="md"
              px={3}
              py={2}
            >
              <HStack spacing={2} justify="space-between" minW={0}>
                <Text
                  fontSize="2xs"
                  color="text.secondary"
                  fontWeight="800"
                  textTransform="uppercase"
                  letterSpacing="wide"
                  flexShrink={0}
                >
                  Recipient
                </Text>
                <HStack spacing={1} minW={0}>
                  <Badge
                    bg="surface.base"
                    color="text.primary"
                    border="1px solid"
                    borderColor="border.default"
                    fontFamily="mono"
                    fontSize="2xs"
                    px={1.5}
                    py={0.5}
                    maxW="190px"
                    isTruncated
                  >
                    {to.slice(0, 6)}...{to.slice(-4)}
                  </Badge>
                  <CopyButton value={to} />
                  {explorer && (
                    <IconButton
                      aria-label="View recipient on explorer"
                      icon={<ExternalLinkIcon boxSize="10px" />}
                      size="xs"
                      variant="ghost"
                      minW="18px"
                      h="18px"
                      color="text.tertiary"
                      onClick={() => window.open(`${explorer}/address/${to}`, "_blank")}
                      _hover={{ color: "accent.secondary", bg: "bg.muted" }}
                    />
                  )}
                </HStack>
              </HStack>
            </Box>

            <ClearSigningView
              kind="calldata"
              chainId={chainId}
              from={from}
              to={to}
              calldata={calldata}
              onResolved={(matched) =>
                setClearSigningStatus(matched ? "matched" : "absent")
              }
            />

            {clearSigningStatus !== "loading" && (
              <CalldataDecoder
                calldata={calldata}
                to={to}
                chainId={chainId}
                defaultCollapsed={clearSigningMatched}
              />
            )}
          </VStack>
        </ModalBody>
      </ModalContent>
    </Modal>
  );
}
