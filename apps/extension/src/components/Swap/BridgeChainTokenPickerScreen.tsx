import type { RefObject } from "react";
import {
  Box,
  Button,
  HStack,
  Image,
  Spinner,
  Text,
  VStack,
} from "@chakra-ui/react";
import {
  CheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
} from "@chakra-ui/icons";
import type { PortfolioToken } from "@/chrome/portfolio/api";
import type { EnrichedBridgeChain } from "@/chrome/bridgeChainsResolver";
import ChainIcon from "@/components/ChainIcon";
import SafeImage from "@/components/SafeImage";
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
  onBack: () => void;
  tokenSearch: string;
  onTokenSearchChange: (value: string) => void;
  tokenSearchRef: RefObject<HTMLInputElement>;
  chainSearch: string;
  onChainSearchChange: (value: string) => void;
  chains: readonly EnrichedBridgeChain[];
  chainsLoading: boolean;
  currentChainId: number;
  currentChain?: EnrichedBridgeChain;
  currentChainName: string;
  selectedChainRef: RefObject<HTMLButtonElement>;
  chainTotals: ReadonlyMap<number, number>;
  onSelectChain: (chainId: number) => void;
  popularTokens: readonly PortfolioToken[];
  customToken?: PortfolioToken;
  customLoading: boolean;
  customError?: string;
  isAddressSearch: boolean;
  fundedHoldings: readonly PortfolioToken[];
  lowValueHoldings: readonly PortfolioToken[];
  showLowValue: boolean;
  onToggleLowValue: () => void;
  remainingTokens: readonly PortfolioToken[];
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

function ChainLogo({
  chain,
  size = "20px",
}: {
  chain: EnrichedBridgeChain;
  size?: string;
}) {
  const iconUrl = chain.icon ?? chain.logoURI;
  if (!iconUrl) {
    return (
      <ChainIcon
        chainId={chain.chainId}
        chainName={chain.name}
        size={size}
        withChip
      />
    );
  }

  return (
    <Box
      boxSize={size}
      borderRadius="full"
      bg={chain.bgColor}
      flexShrink={0}
      overflow="hidden"
    >
      <SafeImage
        src={iconUrl}
        alt=""
        boxSize={size}
        borderRadius="full"
        fallback={
          <ChainIcon
            chainId={chain.chainId}
            chainName={chain.name}
            size={size}
            withChip
          />
        }
      />
    </Box>
  );
}

function TokenLogo({
  token,
  currentChainName,
  resolveLogo,
}: {
  token: PortfolioToken;
  currentChainName: string;
  resolveLogo: (url: string | undefined) => string | undefined;
}) {
  const fallback = (
    <TokenSymbolFallback
      symbol={token.symbol}
      size="32px"
      nativeChainId={token.contractAddress === "native" ? token.chainId : undefined}
      nativeChainName={currentChainName}
    />
  );

  if (!token.logoUrl) return fallback;
  return (
    <Image
      src={resolveLogo(token.logoUrl)}
      alt=""
      boxSize="32px"
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
  onBack,
  tokenSearch,
  onTokenSearchChange,
  tokenSearchRef,
  chainSearch,
  onChainSearchChange,
  chains,
  chainsLoading,
  currentChainId,
  currentChain,
  currentChainName,
  selectedChainRef,
  chainTotals,
  onSelectChain,
  popularTokens,
  customToken,
  customLoading,
  customError,
  isAddressSearch,
  fundedHoldings,
  lowValueHoldings,
  showLowValue,
  onToggleLowValue,
  remainingTokens,
  tokensLoading,
  tokensStale,
  isSelectedToken,
  resolveLogo,
  onSelectToken,
}: BridgeChainTokenPickerScreenProps) {
  const hasTokenResults =
    popularTokens.length > 0 ||
    !!customToken ||
    fundedHoldings.length > 0 ||
    lowValueHoldings.length > 0 ||
    remainingTokens.length > 0;

  const controls = (
    <VStack align="stretch" spacing={3}>
      <FullScreenPickerSearch
        ref={tokenSearchRef}
        label="Search tokens"
        placeholder="Search by name, symbol, or paste address"
        value={tokenSearch}
        onChange={(event) => onTokenSearchChange(event.target.value)}
      />
      <FullScreenPickerSearch
        label="Filter networks"
        placeholder="Search networks"
        value={chainSearch}
        onChange={(event) => onChainSearchChange(event.target.value)}
      />
      {chainsLoading ? (
        <HStack role="status" minH="44px" color="fg.secondary" spacing={2}>
          <Spinner size="sm" />
          <Text fontSize="sm">Loading networks…</Text>
        </HStack>
      ) : chains.length > 0 ? (
        <FullScreenPickerScopes mt={0} aria-label="Network choices">
          {chains.map((chain) => {
            const isSelected = chain.chainId === currentChainId;
            const total = chainTotals.get(chain.chainId) ?? 0;
            return (
              <Button
                key={chain.chainId}
                ref={isSelected ? selectedChainRef : undefined}
                type="button"
                variant="ghost"
                minH="44px"
                flexShrink={0}
                px={3}
                bg={isSelected ? "surface.accentTint" : "surface.raised"}
                color={isSelected ? "accent.secondary" : "fg.primary"}
                border="1px solid"
                borderColor={isSelected ? "border.focus" : "border.default"}
                aria-pressed={isSelected}
                onClick={() => onSelectChain(chain.chainId)}
                _hover={{ bg: "surface.raisedHover" }}
              >
                <HStack spacing={2}>
                  <ChainLogo chain={chain} />
                  <Text as="span" fontSize="sm" noOfLines={1} maxW="132px">
                    {chain.name}
                  </Text>
                  {total > 0 && (
                    <Text as="span" fontSize="xs" color="fg.secondary">
                      {formatUsdCompact(total)}
                    </Text>
                  )}
                </HStack>
              </Button>
            );
          })}
        </FullScreenPickerScopes>
      ) : (
        <Text role="status" minH="44px" py={2} color="fg.secondary" fontSize="sm">
          No networks match “{chainSearch}”.
        </Text>
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
      {popularTokens.length > 0 && (
        <FullScreenPickerGroup label={`Popular on ${currentChainName}`}>
          {popularTokens.map((token) => (
            <TokenRow
              key={`popular-${token.chainId}-${token.contractAddress}`}
              token={token}
              kind="popular"
              currentChainName={currentChainName}
              isSelected={isSelectedToken(token)}
              resolveLogo={resolveLogo}
              onSelect={() => onSelectToken(token)}
            />
          ))}
        </FullScreenPickerGroup>
      )}

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

      {fundedHoldings.length + lowValueHoldings.length > 0 && (
        <FullScreenPickerGroup label={`Your tokens on ${currentChainName}`}>
          {fundedHoldings.map((token) => (
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
          {lowValueHoldings.length > 0 && (
            <ListItem
              interactive
              aria-expanded={showLowValue}
              onClick={onToggleLowValue}
            >
              <ListItemContent>
                <ListItemTitle>Low-value tokens</ListItemTitle>
                <ListItemDescription>
                  {lowValueHoldings.length} token{lowValueHoldings.length === 1 ? "" : "s"} under $0.10
                </ListItemDescription>
              </ListItemContent>
              <ListItemActions>
                {showLowValue ? (
                  <ChevronDownIcon aria-hidden="true" />
                ) : (
                  <ChevronRightIcon aria-hidden="true" />
                )}
              </ListItemActions>
            </ListItem>
          )}
          {showLowValue &&
            lowValueHoldings.map((token) => (
              <TokenRow
                key={`low-${token.chainId}-${token.contractAddress}`}
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
        <FullScreenPickerGroup label={`Tokens on ${currentChainName}`}>
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
