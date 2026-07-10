import { useState } from "react";
import {
  Box,
  Button,
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
} from "@chakra-ui/react";
import { CheckIcon, CopyIcon, ExternalLinkIcon } from "@chakra-ui/icons";
import type { PortfolioToken } from "@/chrome/portfolioApi";
import ChainIcon from "@/components/ChainIcon";
import TokenLogo from "@/components/TokenLogo";
import {
  ListItem,
  ListItemActions,
  ListItemContent,
  ListItemDescription,
  ListItemMedia,
  ListItemTitle,
  ListSurface,
} from "@/components/ui";
import { useNetworks } from "@/contexts/NetworksContext";
import { getResolvedChainById } from "@/lib/chains";

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
        <ModalHeader as="h2" fontSize="lg" pr={14}>
          Hide {symbol}?
        </ModalHeader>
        <ModalCloseButton />
        <ModalBody py={4} px={4}>
          {token && (
            <>
              <ListSurface mb={4}>
                <ListItem>
                  <ListItemMedia position="relative">
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
                  </ListItemMedia>
                  <ListItemContent>
                    <ListItemTitle>{symbol}</ListItemTitle>
                    <ListItemDescription>
                    {chain?.name ?? `Chain ${token.chainId}`}
                    </ListItemDescription>
                    <Text
                      fontFamily="mono"
                      color="fg.muted"
                      fontSize="xs"
                      noOfLines={1}
                    >
                      {token.contractAddress}
                    </Text>
                  </ListItemContent>
                  <ListItemActions>
                    {canCopyAddress && (
                      <Tooltip label="Copy contract" hasArrow>
                        <IconButton
                          aria-label={`Copy ${symbol} contract`}
                          icon={copied ? <CheckIcon /> : <CopyIcon />}
                          size="xs"
                          variant="ghost"
                          color={copied ? "accent.highlight" : "fg.secondary"}
                          onClick={handleCopyAddress}
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
                          size="xs"
                          variant="ghost"
                          color="fg.secondary"
                        />
                      </Tooltip>
                    )}
                  </ListItemActions>
                </ListItem>
              </ListSurface>

              <Text fontSize="sm" color="fg.secondary" lineHeight="1.5">
                This hides the token from every wallet portfolio. You can restore
                it at any time from Hidden tokens.
              </Text>
            </>
          )}
        </ModalBody>
        <ModalFooter gap={2} pt={0}>
          <Button variant="secondary" onClick={onClose} isDisabled={isLoading}>
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={onConfirm}
            isLoading={isLoading}
          >
            Hide token
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
