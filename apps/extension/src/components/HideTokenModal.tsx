import { useState } from "react";
import {
  Box,
  Button,
  HStack,
  IconButton,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Text,
  Tooltip,
  VStack,
} from "@chakra-ui/react";
import { CheckIcon, CopyIcon, ExternalLinkIcon } from "@chakra-ui/icons";
import type { PortfolioToken } from "@/chrome/portfolioApi";
import ChainIcon from "@/components/ChainIcon";
import TokenLogo from "@/components/TokenLogo";
import { useNetworks } from "@/contexts/NetworksContext";
import { getResolvedChainById } from "@/lib/chains";
import { useStripTokens, useTheme } from "@/theme";

interface HideTokenModalProps {
  isOpen: boolean;
  token: PortfolioToken | null;
  isLoading?: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export default function HideTokenModal({
  isOpen,
  token,
  isLoading = false,
  onClose,
  onConfirm,
}: HideTokenModalProps) {
  const { networksInfo } = useNetworks();
  const headerStrip = useStripTokens();
  const { tokens } = useTheme();
  const [copied, setCopied] = useState(false);

  const chain = token
    ? getResolvedChainById(token.chainId, networksInfo)
    : null;
  const symbol = token?.symbol?.toUpperCase() || "TOKEN";
  const explorerUrl =
    token && chain?.explorer
      ? `${chain.explorer.replace(/\/+$/, "")}/address/${token.contractAddress}`
      : null;
  const canCopyAddress = !!token?.contractAddress;

  const handleCopyAddress = () => {
    if (!token?.contractAddress) return;
    navigator.clipboard.writeText(token.contractAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={isLoading ? () => {} : onClose}
      isCentered
      size="sm"
    >
      <ModalOverlay bg="surface.overlay" />
      <ModalContent mx={4} overflow="hidden">
        <ModalHeader
          bg={headerStrip.bg}
          color={headerStrip.fg}
          fontWeight="900"
          fontSize="md"
          py={2}
          borderBottomWidth="1px"
          borderColor="border.subtle"
        >
          Hide Token
        </ModalHeader>
        <ModalCloseButton color={headerStrip.fg} top={1} />
        <ModalBody py={4} px={4}>
          {token && (
            <VStack spacing={4} align="stretch">
              <HStack
                spacing={3}
                p={3}
                border={tokens.borders.thin}
                borderColor="border.default"
                borderRadius={tokens.radii.card}
                bg="surface.sunken"
              >
                <Box position="relative">
                  <TokenLogo
                    symbol={token.symbol}
                    logoUrl={token.logoUrl}
                    alt={token.symbol}
                    size="36px"
                    fontSize="11px"
                  />
                  {chain && (
                    <Box
                      position="absolute"
                      bottom="-3px"
                      right="-5px"
                      border="1.5px solid"
                      borderColor="surface.base"
                      borderRadius="full"
                      bg="surface.base"
                      overflow="hidden"
                      boxSize="16px"
                      display="flex"
                      alignItems="center"
                      justifyContent="center"
                    >
                      <ChainIcon
                        chainId={token.chainId}
                        chainName={chain.name}
                        size="16px"
                        withChip
                      />
                    </Box>
                  )}
                </Box>
                <Box minW={0} flex={1}>
                  <Text
                    fontSize="md"
                    fontWeight="900"
                    color="text.primary"
                    textTransform="uppercase"
                    noOfLines={1}
                  >
                    {symbol}
                  </Text>
                  <Text
                    fontSize="xs"
                    fontWeight="600"
                    color="text.secondary"
                    noOfLines={1}
                  >
                    {chain?.name ?? `Chain ${token.chainId}`}
                  </Text>
                </Box>
                {canCopyAddress && (
                  <Tooltip label="Copy contract" hasArrow>
                    <IconButton
                      aria-label={`Copy ${symbol} contract`}
                      icon={copied ? <CheckIcon /> : <CopyIcon />}
                      size="sm"
                      variant="ghost"
                      color={copied ? "accent.highlight" : "text.secondary"}
                      onClick={handleCopyAddress}
                      _hover={{
                        color: copied ? "accent.highlight" : "accent.secondary",
                        bg: "surface.raisedHover",
                      }}
                    />
                  </Tooltip>
                )}
                {explorerUrl && (
                  <Tooltip label="View contract" hasArrow>
                    <IconButton
                      as="a"
                      href={explorerUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`View ${symbol} contract`}
                      icon={<ExternalLinkIcon />}
                      size="sm"
                      variant="ghost"
                      color="text.secondary"
                      _hover={{
                        color: "accent.secondary",
                        bg: "surface.raisedHover",
                      }}
                    />
                  </Tooltip>
                )}
              </HStack>

              <VStack spacing={2} align="stretch">
                <Text fontSize="sm" color="text.primary" fontWeight="700">
                  Hide {symbol} from all portfolios?
                </Text>
                <Text fontSize="xs" color="text.secondary" fontWeight="600">
                  This applies to every wallet address. You can add it back
                  anytime from Add Token.
                </Text>
              </VStack>
            </VStack>
          )}
        </ModalBody>
        <ModalFooter gap={2} pt={0}>
          <Button variant="ghost" onClick={onClose} isDisabled={isLoading}>
            Cancel
          </Button>
          <Button
            bg="accent.secondary"
            color="accentFg.secondary"
            _hover={{ bg: "accent.secondary", opacity: 0.9 }}
            onClick={onConfirm}
            isLoading={isLoading}
          >
            Hide Token
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
