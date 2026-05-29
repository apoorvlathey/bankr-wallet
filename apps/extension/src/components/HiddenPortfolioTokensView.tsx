import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Box,
  Button,
  HStack,
  IconButton,
  Spinner,
  Text,
  VStack,
} from "@chakra-ui/react";
import { ArrowBackIcon, RepeatIcon } from "@chakra-ui/icons";

import {
  getHiddenPortfolioTokens,
  getPortfolioTokenKey,
  type HiddenPortfolioToken,
  unhidePortfolioToken,
} from "@/chrome/hiddenPortfolioTokens";
import { recordCurrentPortfolioSnapshot } from "@/chrome/portfolioSnapshotRefresh";
import { FromAccountDisplay } from "@/components/FromAccountDisplay";
import PortfolioTokenManageRow from "@/components/PortfolioTokenManageRow";
import { useNetworks } from "@/contexts/NetworksContext";
import { useCachedAvatarMap } from "@/hooks/useCachedAvatarSrc";

interface HiddenPortfolioTokensViewProps {
  address: string;
  onBack: () => void;
  onHiddenTokensChanged?: () => void;
}

export default function HiddenPortfolioTokensView({
  address,
  onBack,
  onHiddenTokensChanged,
}: HiddenPortfolioTokensViewProps) {
  const { networksInfo } = useNetworks();
  const [tokens, setTokens] = useState<HiddenPortfolioToken[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingKey, setUpdatingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const hidden = await getHiddenPortfolioTokens();
      setTokens([...hidden].sort((a, b) => b.hiddenAt - a.hiddenAt));
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load hidden tokens",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const logoMap = useCachedAvatarMap(tokens.map((token) => token.logoUrl));
  const tokenCountLabel = useMemo(() => {
    if (tokens.length === 1) return "1 token hidden across accounts";
    return `${tokens.length} tokens hidden across accounts`;
  }, [tokens.length]);

  const handleUnhideToken = async (token: HiddenPortfolioToken) => {
    const key = getPortfolioTokenKey(token.chainId, token.contractAddress);
    setUpdatingKey(key);
    setError(null);

    try {
      await unhidePortfolioToken(token.chainId, token.contractAddress);
      await loadData();
      if (address) {
        try {
          await recordCurrentPortfolioSnapshot(address);
        } catch {
          // Snapshot failures should not block restoring a token.
        }
      }
      onHiddenTokensChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to unhide token");
    } finally {
      setUpdatingKey(null);
    }
  };

  return (
    <Box
      p={4}
      h="100%"
      minH={0}
      overflowY="auto"
      overflowX="hidden"
      bg="surface.base"
    >
      <VStack spacing={4} align="stretch" minH="100%">
        <HStack spacing={2} justify="space-between">
          <HStack spacing={2} minW={0} flex={1}>
            <IconButton
              aria-label="Back"
              icon={<ArrowBackIcon />}
              variant="ghost"
              size="sm"
              onClick={onBack}
              isDisabled={!!updatingKey}
            />
            <Text
              fontSize="lg"
              fontWeight="900"
              color="text.primary"
              textTransform="uppercase"
              noOfLines={1}
            >
              Currently Hidden
            </Text>
          </HStack>
          {address && <FromAccountDisplay address={address} />}
        </HStack>

        <HStack justify="space-between">
          <Box minW={0}>
            <Text fontSize="sm" color="text.secondary" fontWeight="700">
              {tokenCountLabel}
            </Text>
            <Text fontSize="xs" color="text.tertiary" fontWeight="600">
              Unhiding a token makes it visible in every portfolio again.
            </Text>
          </Box>
          <IconButton
            aria-label="Refresh hidden tokens"
            icon={<RepeatIcon />}
            size="sm"
            variant="ghost"
            color="text.secondary"
            onClick={loadData}
            isDisabled={loading || !!updatingKey}
            _hover={{ color: "accent.secondary" }}
          />
        </HStack>

        {loading ? (
          <HStack justify="center" py={8}>
            <Spinner size="md" color="accent.secondary" />
          </HStack>
        ) : error ? (
          <Text fontSize="sm" color="chart.negative" fontWeight="700" py={4}>
            {error}
          </Text>
        ) : tokens.length === 0 ? (
          <Text fontSize="sm" color="text.tertiary" fontWeight="600" py={4}>
            No hidden tokens.
          </Text>
        ) : (
          <VStack spacing={2} align="stretch">
            {tokens.map((token) => {
              const key = getPortfolioTokenKey(
                token.chainId,
                token.contractAddress,
              );
              const logoSrc =
                (token.logoUrl && logoMap.get(token.logoUrl)) || token.logoUrl;
              return (
                <PortfolioTokenManageRow
                  key={key}
                  token={token}
                  networksInfo={networksInfo}
                  logoSrc={logoSrc}
                  subtitle={token.name}
                  rightSlot={
                    <Button
                      size="xs"
                      bg="accent.secondary"
                      color="accentFg.secondary"
                      border="2px solid"
                      borderColor="border.default"
                      isLoading={updatingKey === key}
                      loadingText="Unhiding..."
                      isDisabled={!!updatingKey && updatingKey !== key}
                      onClick={() => handleUnhideToken(token)}
                      _hover={{ bg: "accent.secondary", opacity: 0.9 }}
                    >
                      Unhide
                    </Button>
                  }
                />
              );
            })}
          </VStack>
        )}
      </VStack>
    </Box>
  );
}
