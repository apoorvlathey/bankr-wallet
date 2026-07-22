import { ChevronRightIcon } from "@chakra-ui/icons";
import { Box, Button, HStack, Text, VStack } from "@chakra-ui/react";
import type { PortfolioToken } from "@/chrome/portfolio/api";
import type { TokenListEntry } from "@/chrome/swapApi";
import ChainIcon from "@/components/ChainIcon";
import TokenSelector from "@/components/Swap/TokenSelector";
import type { NetworkSelectorOption } from "@/components/shared/NetworkSelector";
import { useTheme } from "@/theme";
import { AdaptiveBalance } from "./AdaptiveBalance";

interface TokenSelectionSectionProps {
  selectedChainId: number;
  chainName: string;
  triggerChainLabel: string;
  chainEnvironmentLabel: "TESTNET" | undefined;
  token: PortfolioToken | null;
  holdings: PortfolioToken[];
  tokenList: TokenListEntry[];
  holdingsLoading: boolean;
  resolvedCustomToken: PortfolioToken | null;
  customTokenLoading: boolean;
  customTokenError: string | null;
  networkOptions: readonly NetworkSelectorOption[];
  onOpenNetworkPicker: () => void;
  onSelectChain: (chainId: number) => void;
  onSelectToken: (token: PortfolioToken) => void;
  onResolveCustomAddress: (address: string) => Promise<void>;
  onSelectCustomToken: (token: PortfolioToken) => void;
  onTokenSelectorOpenChange: (isOpen: boolean) => void;
}

export function TokenSelectionSection({
  selectedChainId,
  chainName,
  triggerChainLabel,
  chainEnvironmentLabel,
  token,
  holdings,
  tokenList,
  holdingsLoading,
  resolvedCustomToken,
  customTokenLoading,
  customTokenError,
  networkOptions,
  onOpenNetworkPicker,
  onSelectChain,
  onSelectToken,
  onResolveCustomAddress,
  onSelectCustomToken,
  onTokenSelectorOpenChange,
}: TokenSelectionSectionProps) {
  const { tokens } = useTheme();
  return (
    <Box
      bg="surface.raised"
      border={tokens.borders.thin}
      borderColor="border.subtle"
      borderRadius="lg"
      p={3}
    >
      <HStack spacing={2} align="center" minW={0}>
        <VStack align="flex-start" spacing={1} flex="1 1 0" minW={0}>
          <Button
            variant="ghost"
            minH="44px"
            h="auto"
            px={1}
            w="full"
            minW={0}
            justifyContent="flex-start"
            rightIcon={<ChevronRightIcon color="fg.muted" />}
            onClick={onOpenNetworkPicker}
          >
            <HStack spacing={2} minW={0}>
              <ChainIcon
                chainId={selectedChainId}
                chainName={chainName}
                size="24px"
                withChip
              />
              <VStack align="flex-start" spacing={0} minW={0}>
                <Text fontSize="xs" fontWeight="500" color="fg.secondary">
                  Network
                </Text>
                <Text
                  fontSize="sm"
                  fontWeight="600"
                  color="fg.primary"
                  noOfLines={1}
                  maxW="clamp(92px, 30vw, 140px)"
                >
                  {triggerChainLabel}
                </Text>
              </VStack>
            </HStack>
          </Button>
          {chainEnvironmentLabel && (
            <Text
              alignSelf="center"
              fontSize="8px"
              fontWeight="700"
              letterSpacing="0.08em"
              px={1.5}
              py={0.5}
              bg="accent.highlight"
              color="accentFg.highlight"
              border="1px solid"
              borderColor="border.default"
              borderRadius={tokens.radii.badge}
              lineHeight="1"
              flexShrink={0}
            >
              {chainEnvironmentLabel}
            </Text>
          )}
        </VStack>
        <Box
          ml="auto"
          flex="0 1 auto"
          minW={0}
          maxW="144px"
          sx={{ "> button": { maxWidth: "144px" } }}
        >
          <TokenSelector
            holdings={holdings}
            tokenList={tokenList}
            chainId={selectedChainId}
            selectedToken={token}
            onSelect={onSelectToken}
            onCustomAddress={onResolveCustomAddress}
            onSelectCustomToken={onSelectCustomToken}
            resolvedCustomToken={resolvedCustomToken}
            customTokenLoading={customTokenLoading}
            customTokenError={customTokenError}
            chainName={chainName}
            triggerContentAlign="right"
            dropdownAlign="right"
            isLoadingHoldings={holdingsLoading}
            onOpenChange={onTokenSelectorOpenChange}
            networkOptions={networkOptions}
            onSelectChain={onSelectChain}
          />
        </Box>
      </HStack>
      {token && (
        <Box
          mt={2.5}
          pt={2.5}
          borderTop={tokens.borders.thin}
          borderColor="border.subtle"
        >
          <AdaptiveBalance
            balanceStr={token.balance}
            balanceFormatted={token.balanceFormatted}
            priceUsd={token.priceUsd > 0 ? token.priceUsd : null}
          />
        </Box>
      )}
    </Box>
  );
}
