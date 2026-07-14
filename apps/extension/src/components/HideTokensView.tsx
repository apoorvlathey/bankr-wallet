import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Box,
  Button,
  Checkbox,
  IconButton,
} from "@chakra-ui/react";
import {
  ChevronRightIcon,
  RepeatIcon,
  ViewOffIcon,
} from "@chakra-ui/icons";

import { fetchOnchainBalances } from "@/chrome/portfolio/onchainBalances";
import type { PortfolioToken } from "@/chrome/portfolio/api";
import { recordSnapshot } from "@/chrome/portfolio/snapshotStorage";
import { loadPortfolioTokenCatalog } from "@/chrome/portfolio/tokenCatalog";
import {
  getHiddenPortfolioTokens,
  getPortfolioTokenKey,
  hidePortfolioTokens,
} from "@/chrome/portfolio/hiddenTokens";
import { FromAccountDisplay } from "@/components/FromAccountDisplay";
import PortfolioTokenManageRow from "@/components/PortfolioTokenManageRow";
import {
  AppHeader,
  AppScreen,
  EmptyState,
  EmptyStateActions,
  EmptyStateDescription,
  EmptyStateHeader,
  EmptyStateMedia,
  EmptyStateTitle,
  ListItem,
  ListItemActions,
  ListItemContent,
  ListItemDescription,
  ListItemMedia,
  ListItemMeta,
  ListItemTitle,
  ListSurface,
  ScreenBody,
  ScreenSection,
  SkeletonRow,
  StickyActionBar,
} from "@/components/ui";
import { useNetworks } from "@/contexts/NetworksContext";
import { formatUsd } from "@/lib/currencyFormatUtils";
import { useCachedAvatarMap } from "@/hooks/useCachedAvatarSrc";

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
    <AppScreen stickyActionClearance={4}>
      <AppHeader
        title="Hide tokens"
        onBack={onBack}
        trailing={address ? <FromAccountDisplay address={address} /> : undefined}
      />

      <ScreenBody pt={4}>
        <ListSurface>
          <ListItem interactive onClick={onOpenHidden}>
            <ListItemMedia>
              <ViewOffIcon boxSize={5} />
            </ListItemMedia>
            <ListItemContent>
              <ListItemTitle>Hidden tokens</ListItemTitle>
              <ListItemDescription>
                {hiddenCount} hidden across accounts
              </ListItemDescription>
            </ListItemContent>
            <ListItemActions>
              <ChevronRightIcon boxSize={5} />
            </ListItemActions>
          </ListItem>
        </ListSurface>

        <ScreenSection
          mt={8}
          title="Portfolio tokens"
          headerAction={
            <IconButton
              aria-label="Refresh tokens"
              icon={<RepeatIcon />}
              size="xs"
              variant="ghost"
              color="fg.secondary"
              onClick={() => loadData()}
              isDisabled={loading || submitting}
            />
          }
          description="Choose which tokens to hide from every wallet portfolio."
          headingProps={{ fontSize: "lg" }}
          descriptionProps={{ mt: -1 }}
        >
          {loading ? (
            <ListSurface aria-label="Loading portfolio tokens">
              {Array.from({ length: 5 }, (_, index) => (
                <SkeletonRow key={index} />
              ))}
            </ListSurface>
          ) : error ? (
            <EmptyState>
              <EmptyStateHeader>
                <EmptyStateTitle>Tokens could not be loaded</EmptyStateTitle>
                <EmptyStateDescription>{error}</EmptyStateDescription>
              </EmptyStateHeader>
              <EmptyStateActions>
                <Button variant="secondary" onClick={() => loadData()}>
                  Try again
                </Button>
              </EmptyStateActions>
            </EmptyState>
          ) : tokens.length === 0 ? (
            <EmptyState>
              <EmptyStateMedia>
                <ViewOffIcon boxSize={6} />
              </EmptyStateMedia>
              <EmptyStateHeader>
                <EmptyStateTitle>No tokens to hide</EmptyStateTitle>
                <EmptyStateDescription>
                  Tokens with a positive balance will appear here.
                </EmptyStateDescription>
              </EmptyStateHeader>
            </EmptyState>
          ) : (
            <ListSurface>
              <ListItem
                isSelected={allSelected}
                density="compact"
                px={3}
                py={2}
                gap={2}
              >
                <Box
                  w="28px"
                  minW="28px"
                  minH="44px"
                  display="flex"
                  alignItems="center"
                  justifyContent="center"
                  ml={-1}
                >
                  <Checkbox
                    aria-label="Select all portfolio tokens"
                    isChecked={allSelected}
                    isIndeterminate={someSelected}
                    onChange={toggleAll}
                  />
                </Box>
                <ListItemContent>
                  <ListItemTitle fontSize="sm">Select all</ListItemTitle>
                  <ListItemDescription>
                    Select every visible token
                  </ListItemDescription>
                </ListItemContent>
                <ListItemMeta whiteSpace="nowrap">
                  {selectedKeys.size}/{tokens.length}
                </ListItemMeta>
              </ListItem>

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
                    networksInfo={networksInfo ?? {}}
                    logoSrc={logoSrc}
                    subtitle={`${token.balanceFormatted} ${token.symbol}`}
                    valueLabel={formatUsd(token.valueUsd)}
                    isSelected={selectedKeys.has(key)}
                    onToggle={() => toggleToken(key)}
                  />
                );
              })}
            </ListSurface>
          )}
        </ScreenSection>
      </ScreenBody>

      <StickyActionBar
        primaryAction={
          <Button
            variant="primary"
            onClick={handleHideSelected}
            isDisabled={selectedTokens.length === 0 || loading}
            isLoading={submitting}
            loadingText="Hiding..."
          >
            {selectedTokens.length > 0
              ? `Hide ${selectedTokens.length} token${
                  selectedTokens.length === 1 ? "" : "s"
                }`
              : "Hide selected tokens"}
          </Button>
        }
      />
    </AppScreen>
  );
}
