import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Box,
  Button,
  Checkbox,
  HStack,
  IconButton,
  Spinner,
  Text,
  VStack,
} from "@chakra-ui/react";
import {
  ArrowBackIcon,
  ChevronRightIcon,
  RepeatIcon,
  ViewOffIcon,
} from "@chakra-ui/icons";

import { fetchOnchainBalances } from "@/chrome/onchainBalances";
import type { PortfolioToken } from "@/chrome/portfolioApi";
import { recordSnapshot } from "@/chrome/portfolioSnapshotStorage";
import { loadPortfolioTokenCatalog } from "@/chrome/portfolioTokens";
import {
  getHiddenPortfolioTokens,
  getPortfolioTokenKey,
  hidePortfolioTokens,
} from "@/chrome/hiddenPortfolioTokens";
import { FromAccountDisplay } from "@/components/FromAccountDisplay";
import PortfolioTokenManageRow from "@/components/PortfolioTokenManageRow";
import { useNetworks } from "@/contexts/NetworksContext";
import { formatUsd } from "@/lib/currencyFormatUtils";
import { useCachedAvatarMap } from "@/hooks/useCachedAvatarSrc";
import { ThemedCard, useStripTokens, useTheme } from "@/theme";

const ERC20_ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

interface HideTokensViewProps {
  address: string;
  onBack: () => void;
  onOpenHidden: () => void;
  onHiddenTokensChanged?: () => void;
}

function isHideableToken(token: PortfolioToken): boolean {
  return (
    ERC20_ADDRESS_REGEX.test(token.contractAddress) &&
    token.contractAddress.toLowerCase() !== ZERO_ADDRESS &&
    parseFloat(token.balance || "0") > 0
  );
}

async function loadHideTokenData(address: string) {
  const [catalog, hiddenTokens] = await Promise.all([
    loadPortfolioTokenCatalog(address),
    getHiddenPortfolioTokens(),
  ]);

  let displayTokens = catalog.tokens.filter((token) => {
    return parseFloat(token.balance || "0") > 0;
  });
  let totalValueUsd = catalog.totalValueUsd;

  try {
    const onchain = await fetchOnchainBalances(address, catalog.tokens);
    const defiTotal = (catalog.defiPositions || []).reduce(
      (sum, position) => sum + position.valueUsd,
      0,
    );
    displayTokens = onchain.tokens;
    totalValueUsd = onchain.totalValueUsd + defiTotal;
  } catch {
    displayTokens.sort((a, b) => b.valueUsd - a.valueUsd);
  }

  return {
    tokens: displayTokens.filter(isHideableToken),
    hiddenCount: hiddenTokens.length,
    totalValueUsd,
  };
}

export default function HideTokensView({
  address,
  onBack,
  onOpenHidden,
  onHiddenTokensChanged,
}: HideTokensViewProps) {
  const { networksInfo } = useNetworks();
  const strip = useStripTokens();
  const { themeId } = useTheme();
  const isDarkTheme = themeId === "midnight";
  const [tokens, setTokens] = useState<PortfolioToken[]>([]);
  const [hiddenCount, setHiddenCount] = useState(0);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(
    async (options: { showLoading?: boolean; forceSnapshot?: boolean } = {}) => {
      if (!address) return;
      const { showLoading = true, forceSnapshot = false } = options;
      if (showLoading) setLoading(true);
      setError(null);

      try {
        const data = await loadHideTokenData(address);
        setTokens(data.tokens);
        setHiddenCount(data.hiddenCount);
        setSelectedKeys((prev) => {
          const available = new Set(
            data.tokens.map((token) =>
              getPortfolioTokenKey(token.chainId, token.contractAddress),
            ),
          );
          return new Set([...prev].filter((key) => available.has(key)));
        });

        if (forceSnapshot) {
          try {
            await recordSnapshot(address, data.totalValueUsd, { force: true });
          } catch {
            // Snapshot failures should not block token management.
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load tokens");
      } finally {
        setLoading(false);
      }
    },
    [address],
  );

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const tokenKeys = useMemo(
    () =>
      tokens.map((token) =>
        getPortfolioTokenKey(token.chainId, token.contractAddress),
      ),
    [tokens],
  );
  const selectedTokens = useMemo(
    () =>
      tokens.filter((token) =>
        selectedKeys.has(
          getPortfolioTokenKey(token.chainId, token.contractAddress),
        ),
      ),
    [selectedKeys, tokens],
  );
  const allSelected = tokens.length > 0 && selectedKeys.size === tokens.length;
  const someSelected = selectedKeys.size > 0 && !allSelected;

  const logoMap = useCachedAvatarMap(tokens.map((token) => token.logoUrl));

  const toggleToken = (key: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleAll = () => {
    setSelectedKeys(allSelected ? new Set() : new Set(tokenKeys));
  };

  const handleHideSelected = async () => {
    if (selectedTokens.length === 0) return;
    setSubmitting(true);
    setError(null);

    try {
      await hidePortfolioTokens(selectedTokens);
      setSelectedKeys(new Set());
      await loadData({ showLoading: false, forceSnapshot: true });
      onHiddenTokensChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to hide tokens");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Box
      p={4}
      h="100%"
      minH={0}
      overflow="hidden"
      bg="surface.base"
      display="flex"
      flexDirection="column"
    >
      <VStack spacing={4} align="stretch" h="100%" minH={0}>
        <HStack spacing={2} justify="space-between">
          <HStack spacing={2} minW={0} flex={1}>
            <IconButton
              aria-label="Back"
              icon={<ArrowBackIcon />}
              variant="ghost"
              size="sm"
              onClick={onBack}
              isDisabled={submitting}
            />
            <Text
              fontSize="lg"
              fontWeight="900"
              color="text.primary"
              textTransform="uppercase"
              noOfLines={1}
            >
              Hide Tokens
            </Text>
          </HStack>
          {address && <FromAccountDisplay address={address} />}
        </HStack>

        <ThemedCard
          as="button"
          type="button"
          weight="thin"
          interactive
          w="100%"
          textAlign="left"
          onClick={onOpenHidden}
        >
          <HStack spacing={3} minW={0}>
            <Box
              bg="surface.sunken"
              color="text.secondary"
              borderRadius={isDarkTheme ? "md" : undefined}
              p={2}
              flexShrink={0}
            >
              <ViewOffIcon boxSize={5} />
            </Box>
            <Box minW={0} flex={1}>
              <Text
                color="text.primary"
                fontWeight="800"
                fontSize="sm"
                lineHeight="1.1"
                noOfLines={1}
              >
                Currently Hidden
              </Text>
              <Text
                color="text.secondary"
                fontSize="xs"
                fontWeight="600"
                noOfLines={1}
              >
                {hiddenCount} hidden across accounts
              </Text>
            </Box>
            <Box
              bg={isDarkTheme ? "transparent" : strip.bg}
              color={isDarkTheme ? "text.secondary" : strip.fg}
              borderRadius={isDarkTheme ? "md" : undefined}
              p={isDarkTheme ? 0 : 1}
              flexShrink={0}
            >
              <ChevronRightIcon boxSize={4} />
            </Box>
          </HStack>
        </ThemedCard>

        <VStack
          align="stretch"
          spacing={2}
          flex={1}
          minH={0}
          overflowY="auto"
          overflowX="hidden"
          pr={1}
          mr={-1}
        >
          <HStack justify="space-between">
            <Box minW={0}>
              <Text
                fontSize="sm"
                fontWeight="900"
                color="text.primary"
                textTransform="uppercase"
              >
                Portfolio Tokens
              </Text>
              <Text fontSize="xs" color="text.secondary" fontWeight="600">
                Hidden tokens apply to every wallet.
              </Text>
            </Box>
            <IconButton
              aria-label="Refresh tokens"
              icon={<RepeatIcon />}
              size="sm"
              variant="ghost"
              color="text.secondary"
              onClick={() => loadData()}
              isDisabled={loading || submitting}
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
              No hideable tokens in this portfolio.
            </Text>
          ) : (
            <VStack spacing={2} align="stretch">
              <HStack
                bg="surface.sunken"
                border="2px solid"
                borderColor={allSelected ? "accent.secondary" : "border.default"}
                borderRadius="md"
                px={3}
                py={2}
                spacing={3}
                cursor="pointer"
                onClick={toggleAll}
              >
                <Checkbox
                  isChecked={allSelected}
                  isIndeterminate={someSelected}
                  onChange={toggleAll}
                  pointerEvents="none"
                />
                <Text
                  fontSize="sm"
                  fontWeight="800"
                  color="text.primary"
                  textTransform="uppercase"
                  flex={1}
                >
                  Select all
                </Text>
                <Text fontSize="xs" color="text.tertiary" fontWeight="700">
                  {selectedKeys.size}/{tokens.length} selected
                </Text>
              </HStack>

              {tokens.map((token) => {
                const key = getPortfolioTokenKey(
                  token.chainId,
                  token.contractAddress,
                );
                const logoSrc =
                  (token.logoUrl && logoMap.get(token.logoUrl)) ||
                  token.logoUrl;
                return (
                  <PortfolioTokenManageRow
                    key={key}
                    token={token}
                    networksInfo={networksInfo}
                    logoSrc={logoSrc}
                    subtitle={`${token.balanceFormatted} ${token.symbol}`}
                    valueLabel={formatUsd(token.valueUsd)}
                    isSelected={selectedKeys.has(key)}
                    onToggle={() => toggleToken(key)}
                  />
                );
              })}
            </VStack>
          )}
        </VStack>

        <Box flexShrink={0}>
          <Button
            w="full"
            bg="accent.secondary"
            color="accentFg.secondary"
            border="2px solid"
            borderColor="border.default"
            onClick={handleHideSelected}
            isDisabled={selectedTokens.length === 0 || loading}
            isLoading={submitting}
            loadingText="Hiding..."
            _hover={{ bg: "accent.secondary", opacity: 0.9 }}
          >
            {selectedTokens.length > 0
              ? `Hide ${selectedTokens.length} Token${
                  selectedTokens.length === 1 ? "" : "s"
                }`
              : "Hide Selected Tokens"}
          </Button>
        </Box>
      </VStack>
    </Box>
  );
}
