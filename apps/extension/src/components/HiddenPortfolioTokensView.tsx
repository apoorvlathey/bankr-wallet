import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Box,
  Button,
  HStack,
  IconButton,
} from "@chakra-ui/react";
import { RepeatIcon, ViewIcon } from "@chakra-ui/icons";

import {
  getHiddenPortfolioTokens,
  getPortfolioTokenKey,
  type HiddenPortfolioToken,
  unhidePortfolioToken,
} from "@/chrome/portfolio/hiddenTokens";
import { recordCurrentPortfolioSnapshot } from "@/chrome/portfolio/snapshotRefresh";
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
  ListSurface,
  ScreenBody,
  ScreenSection,
  SkeletonRow,
} from "@/components/ui";
import { useNetworks } from "@/contexts/NetworksContext";
import { useCachedAvatarMap } from "@/hooks/useCachedAvatarSrc";
import { TOKEN_PICKER_PAGE_SIZE } from "@/chrome/portfolio/consumerPolicy";

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
  const [visibleCount, setVisibleCount] = useState(TOKEN_PICKER_PAGE_SIZE);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const hidden = await getHiddenPortfolioTokens();
      setTokens([...hidden].sort((a, b) => b.hiddenAt - a.hiddenAt));
      setVisibleCount(TOKEN_PICKER_PAGE_SIZE);
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

  const visibleTokens = useMemo(
    () => tokens.slice(0, visibleCount),
    [tokens, visibleCount],
  );
  const logoMap = useCachedAvatarMap(visibleTokens.map((token) => token.logoUrl));
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
    <AppScreen>
      <AppHeader
        title="Hidden tokens"
        onBack={onBack}
        trailing={address ? <FromAccountDisplay address={address} /> : undefined}
      />

      <ScreenBody pt={4}>
        <ScreenSection
          title={tokenCountLabel}
          description="Restoring a token makes it visible in every wallet portfolio."
          headingProps={{ fontSize: "lg" }}
        >
          <HStack justify="flex-end" mb={2}>
          <IconButton
            aria-label="Refresh hidden tokens"
            icon={<RepeatIcon />}
            size="sm"
            variant="ghost"
            color="fg.secondary"
            onClick={loadData}
            isDisabled={loading || !!updatingKey}
          />
          </HStack>

        {loading ? (
          <ListSurface aria-label="Loading hidden tokens">
            {Array.from({ length: 4 }, (_, index) => (
              <SkeletonRow key={index} />
            ))}
          </ListSurface>
        ) : error ? (
          <EmptyState>
            <EmptyStateHeader>
              <EmptyStateTitle>Hidden tokens could not be loaded</EmptyStateTitle>
              <EmptyStateDescription>{error}</EmptyStateDescription>
            </EmptyStateHeader>
            <EmptyStateActions>
              <Button variant="secondary" onClick={loadData}>
                Try again
              </Button>
            </EmptyStateActions>
          </EmptyState>
        ) : tokens.length === 0 ? (
          <EmptyState>
            <EmptyStateMedia>
              <ViewIcon boxSize={6} />
            </EmptyStateMedia>
            <EmptyStateHeader>
              <EmptyStateTitle>Every token is visible</EmptyStateTitle>
              <EmptyStateDescription>
                Tokens hidden from any portfolio will appear here.
              </EmptyStateDescription>
            </EmptyStateHeader>
          </EmptyState>
        ) : (
          <ListSurface>
            {visibleTokens.map((token) => {
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
                  networksInfo={networksInfo ?? {}}
                  logoSrc={logoSrc}
                  subtitle={token.name}
                  rightSlot={
                    <Button
                      size="xs"
                      variant="secondary"
                      isLoading={updatingKey === key}
                      loadingText="Unhiding..."
                      isDisabled={!!updatingKey && updatingKey !== key}
                      onClick={() => handleUnhideToken(token)}
                    >
                      Restore
                    </Button>
                  }
                />
              );
            })}
            {visibleTokens.length < tokens.length && (
              <Box as="li" listStyleType="none" py={2} textAlign="center">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    setVisibleCount((count) => count + TOKEN_PICKER_PAGE_SIZE)
                  }
                >
                  Show more tokens
                </Button>
              </Box>
            )}
          </ListSurface>
        )}
        </ScreenSection>
      </ScreenBody>
    </AppScreen>
  );
}
