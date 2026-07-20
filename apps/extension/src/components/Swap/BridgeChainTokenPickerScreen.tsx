import type { RefObject } from "react";
import {
  Box,
  Button,
  HStack,
  Text,
  VStack,
} from "@chakra-ui/react";
import { CheckIcon } from "@chakra-ui/icons";
import type { PortfolioToken } from "@/chrome/portfolio/api";
import type { EnrichedBridgeChain } from "@/chrome/bridgeChainsResolver";
import ChainIcon from "@/components/ChainIcon";
import SafeImage from "@/components/SafeImage";
import { NetworkSelectorScreen } from "@/components/shared/NetworkSelector";
import {
  FullScreenPicker,
  FullScreenPickerEmpty,
  FullScreenPickerGroup,
  FullScreenPickerScopes,
  FullScreenPickerSearch,
  ListItem,
  ListItemActions,
  ListItemContent,
  ListItemDescription,
  ListItemMedia,
  ListItemMeta,
  ListItemTitle,
  SkeletonRow,
} from "@/components/ui";
import { truncateAddress } from "@/lib/addressUtils";
import { formatTokenBalance } from "@/lib/tokenFormatUtils";
import { TokenSymbolFallback } from "./TokenSymbolFallback";

interface BridgeChainTokenPickerScreenProps {
  mode: "sell" | "buy";
  panel: "chains" | "tokens";
  onBack: () => void;
  tokenSearch: string;
  onTokenSearchChange: (value: string) => void;
  tokenSearchRef: RefObject<HTMLInputElement>;
  chains: readonly EnrichedBridgeChain[];
  chainsLoading: boolean;
  currentChainId: number;
  currentChain?: EnrichedBridgeChain;
  currentChainName: string;
  chainTotals: ReadonlyMap<number, number>;
  fundedChainIds: ReadonlySet<number>;
  onSelectChain: (chainId: number) => void;
  popularTokens: readonly PortfolioToken[];
  customToken?: PortfolioToken;
  customLoading: boolean;
  customError?: string;
  isAddressSearch: boolean;
  visibleHoldings: readonly PortfolioToken[];
  remainingTokens: readonly PortfolioToken[];
  remainingTokenCount: number;
  onShowMore: () => void;
  tokensLoading: boolean;
  tokensStale: boolean;
  isSelectedToken: (token: PortfolioToken) => boolean;
  resolveLogo: (url: string | undefined) => string | undefined;
  onSelectToken: (token: PortfolioToken) => void;
}

function formatUsdCompact(value: number): string {
  if (value >= 1000) {
    return `$${(value / 1000).toFixed(value >= 10_000 ? 1 : 2)}K`;
  }
  if (value >= 1) return `$${value.toFixed(2)}`;
  return "<$1";
}

function TokenLogo({
  token,
  currentChainName,
  resolveLogo,
  size = "32px",
}: {
  token: PortfolioToken;
  currentChainName: string;
  resolveLogo: (url: string | undefined) => string | undefined;
  size?: string;
}) {
  const fallback = (
    <TokenSymbolFallback
      symbol={token.symbol}
      size={size}
      nativeChainId={token.contractAddress === "native" ? token.chainId : undefined}
      nativeChainName={currentChainName}
    />
  );

  if (!token.logoUrl) return fallback;
  return (
    <SafeImage
      src={resolveLogo(token.logoUrl)}
      alt=""
      boxSize={size}
      borderRadius="full"
      fallback={fallback}
    />
  );
}

function TokenRow({
  token,
  kind,
  currentChainName,
  isSelected,
  resolveLogo,
  onSelect,
}: {
  token: PortfolioToken;
  kind: "popular" | "holding" | "catalog" | "custom";
  currentChainName: string;
  isSelected: boolean;
  resolveLogo: (url: string | undefined) => string | undefined;
  onSelect: () => void;
}) {
  const address =
    token.contractAddress === "native"
      ? token.name
      : truncateAddress(token.contractAddress);
  const description = kind === "catalog" ? token.name : address;

  return (
    <ListItem
      interactive
      isSelected={isSelected}
      aria-pressed={isSelected}
      onClick={onSelect}
    >
      <ListItemMedia>
        <TokenLogo
          token={token}
          currentChainName={currentChainName}
          resolveLogo={resolveLogo}
        />
      </ListItemMedia>
      <ListItemContent>
        <ListItemTitle>{token.symbol || "Unknown token"}</ListItemTitle>
        <ListItemDescription>{description || "Token details unavailable"}</ListItemDescription>
      </ListItemContent>
      {kind === "holding" || kind === "custom" ? (
        <ListItemMeta>
          <Text as="span" display="block" color="fg.primary">
            {formatTokenBalance(token.balance)}
          </Text>
          {token.valueUsd > 0 && (
            <Text as="span" display="block" fontSize="xs">
              ${token.valueUsd.toFixed(2)}
            </Text>
          )}
        </ListItemMeta>
      ) : token.valueUsd > 0 ? (
        <ListItemMeta>{formatUsdCompact(token.valueUsd)}</ListItemMeta>
      ) : null}
      {isSelected && (
        <ListItemActions aria-label="Selected">
          <CheckIcon aria-hidden="true" color="accent.secondary" boxSize={4} />
        </ListItemActions>
      )}
    </ListItem>
  );
}

export function BridgeChainTokenPickerScreen({
  mode,
  panel,
  onBack,
  tokenSearch,
  onTokenSearchChange,
  tokenSearchRef,
  chains,
  chainsLoading,
  currentChainId,
  currentChain,
  currentChainName,
  chainTotals,
  fundedChainIds,
  onSelectChain,
  popularTokens,
  customToken,
  customLoading,
  customError,
  isAddressSearch,
  visibleHoldings,
  remainingTokens,
  remainingTokenCount,
  onShowMore,
  tokensLoading,
  tokensStale,
  isSelectedToken,
  resolveLogo,
  onSelectToken,
}: BridgeChainTokenPickerScreenProps) {
  if (panel === "chains") {
    return (
      <NetworkSelectorScreen
        title={mode === "sell" ? "Pay network" : "Receive network"}
        networks={chains.map((chain) => ({
          chainId: chain.chainId,
          name: chain.name,
          nativeSymbol: chain.currency?.symbol,
          balanceUsd: chainTotals.get(chain.chainId) ?? 0,
          isFunded: fundedChainIds.has(chain.chainId),
          iconUrl: chain.icon ?? chain.logoURI,
          iconBg: chain.bgColor,
        }))}
        selectedChainId={currentChainId}
        onSelect={(chainId) => {
          if (chainId !== null) onSelectChain(chainId);
        }}
        onBack={onBack}
        search={tokenSearch}
        onSearchChange={onTokenSearchChange}
        searchInputRef={tokenSearchRef}
        isLoading={chainsLoading}
      />
    );
  }

  const hasTokenResults =
    popularTokens.length > 0 ||
    !!customToken ||
    visibleHoldings.length > 0 ||
    remainingTokens.length > 0;

  const controls = (
    <VStack align="stretch" spacing={2.5}>
      <FullScreenPickerSearch
        ref={tokenSearchRef}
        label="Search tokens"
        labelTrailing={
          <HStack
            as="span"
            maxW="220px"
            minW={0}
            minH="24px"
            px={2}
            spacing={1}
            border="1px solid"
            borderColor="border.default"
            borderRadius="full"
            bg="surface.raised"
          >
            <Text as="span" flexShrink={0} fontSize="2xs" color="fg.muted">
              on
            </Text>
            <ChainIcon
              chainId={currentChainId}
              chainName={currentChainName}
              size="14px"
              withChip
            />
            <Text
              as="span"
              minW={0}
              fontSize="xs"
              fontWeight="600"
              color="fg.secondary"
              noOfLines={1}
            >
              {currentChainName}
            </Text>
          </HStack>
        }
        placeholder="Search by name, symbol, or paste address"
        value={tokenSearch}
        onChange={(event) => onTokenSearchChange(event.target.value)}
      />
      {popularTokens.length > 0 && (
        <FullScreenPickerScopes mt={0} aria-label={`Popular tokens on ${currentChainName}`}>
          {popularTokens.map((token) => {
            const isSelected = isSelectedToken(token);
            return (
              <Button
                key={`popular-${token.chainId}-${token.contractAddress}`}
                type="button"
                variant="outline"
                h="32px"
                flexShrink={0}
                px={2}
                fontSize="xs"
                borderWidth="1px"
                borderColor={isSelected ? "border.focus" : "border.default"}
                bg={isSelected ? "surface.accentTint" : "surface.raised"}
                color={isSelected ? "accent.secondary" : "fg.primary"}
                leftIcon={
                  <TokenLogo
                    token={token}
                    currentChainName={currentChainName}
                    resolveLogo={resolveLogo}
                    size="16px"
                  />
                }
                onClick={() => onSelectToken(token)}
              >
                {token.symbol}
              </Button>
            );
          })}
        </FullScreenPickerScopes>
      )}
    </VStack>
  );

  return (
    <FullScreenPicker
      title={mode === "sell" ? "Select asset to sell" : "Select asset to receive"}
      onBack={onBack}
      backLabel="Back to Swap / Bridge"
      controls={controls}
    >
      {isAddressSearch && (customLoading || customError || customToken) && (
        <FullScreenPickerGroup label="Token address">
          {customLoading ? (
            <SkeletonRow />
          ) : customToken ? (
            <TokenRow
              token={customToken}
              kind="custom"
              currentChainName={currentChainName}
              isSelected={isSelectedToken(customToken)}
              resolveLogo={resolveLogo}
              onSelect={() => onSelectToken(customToken)}
            />
          ) : (
            <Box as="li" role="alert" px={4} py={3} color="status.error.fg">
              <Text fontSize="sm">{customError}</Text>
            </Box>
          )}
        </FullScreenPickerGroup>
      )}

      {visibleHoldings.length > 0 && (
        <FullScreenPickerGroup label={`Your tokens on ${currentChainName}`}>
          {visibleHoldings.map((token) => (
            <TokenRow
              key={`held-${token.chainId}-${token.contractAddress}`}
              token={token}
              kind="holding"
              currentChainName={currentChainName}
              isSelected={isSelectedToken(token)}
              resolveLogo={resolveLogo}
              onSelect={() => onSelectToken(token)}
            />
          ))}
        </FullScreenPickerGroup>
      )}

      {(remainingTokens.length > 0 || tokensStale || tokensLoading) && (
        <FullScreenPickerGroup
          label={`Tokens on ${currentChainName}`}
          _notFirst={{ mt: 3 }}
        >
          {tokensStale || (tokensLoading && remainingTokens.length === 0)
            ? Array.from({ length: 6 }, (_, index) => (
                <SkeletonRow key={`token-loading-${index}`} />
              ))
            : remainingTokens.map((token) => (
                <TokenRow
                  key={`token-${token.chainId}-${token.contractAddress}`}
                  token={token}
                  kind="catalog"
                  currentChainName={currentChainName}
                  isSelected={isSelectedToken(token)}
                  resolveLogo={resolveLogo}
                  onSelect={() => onSelectToken(token)}
                />
              ))}
        </FullScreenPickerGroup>
      )}

      {remainingTokenCount > 0 && !tokensLoading && !tokensStale && (
        <Box py={3} textAlign="center">
          <Button type="button" variant="ghost" size="sm" onClick={onShowMore}>
            Show more tokens
          </Button>
        </Box>
      )}

      {!chainsLoading &&
        chains.length > 0 &&
        !tokensLoading &&
        !tokensStale &&
        !customLoading &&
        !hasTokenResults &&
        !customError && (
        <FullScreenPickerEmpty
          title={tokenSearch.trim() ? "No matching tokens" : "No tokens available"}
          description={
            tokenSearch.trim()
              ? `Try another name, symbol, address, or network.`
              : `No selectable tokens were found on ${currentChainName}.`
          }
        />
      )}

      {!currentChain && !chainsLoading && chains.length === 0 && (
        <FullScreenPickerEmpty
          title="No networks available"
          description="No supported bridge networks are available for this account."
        />
      )}
    </FullScreenPicker>
  );
}
