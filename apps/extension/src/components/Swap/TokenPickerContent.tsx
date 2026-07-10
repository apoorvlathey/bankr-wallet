import type { RefObject } from "react";
import {
  Box,
  Button,
  Flex,
  HStack,
  Image,
  Spinner,
  Text,
  VStack,
} from "@chakra-ui/react";
import { CheckIcon } from "@chakra-ui/icons";
import type { PortfolioToken } from "@/chrome/portfolioApi";
import type { TokenListEntry } from "@/chrome/swapApi";
import { TokenSymbolFallback } from "@/components/Swap/TokenSymbolFallback";
import {
  FullScreenPicker,
  FullScreenPickerEmpty,
  FullScreenPickerGroup,
  FullScreenPickerScopes,
  FullScreenPickerSearch,
  ListItem,
  ListItemContent,
  ListItemDescription,
  ListItemMedia,
  ListItemMeta,
  ListItemTitle,
} from "@/components/ui";
import { truncateAddress } from "@/lib/addressUtils";
import { formatUsd } from "@/lib/currencyFormatUtils";
import { formatTokenBalance } from "@/lib/tokenFormatUtils";

interface TokenPickerContentProps {
  inputRef: RefObject<HTMLInputElement>;
  search: string;
  onSearchChange: (value: string) => void;
  onBack: () => void;
  popularTokens: PortfolioToken[];
  filteredHoldings: PortfolioToken[];
  visibleRest: TokenListEntry[];
  remainingRestCount: number;
  onShowMore: () => void;
  onSelectHolding: (token: PortfolioToken) => void;
  onSelectListEntry: (token: TokenListEntry) => void;
  onSelectPortfolio: (token: PortfolioToken) => void;
  isSelectedAddress: (address: string) => boolean;
  resolveLogo: (url: string | undefined) => string | undefined;
  customTokenLoading?: boolean;
  customTokenError?: string | null;
  resolvedCustomToken?: PortfolioToken | null;
  onSelectResolvedCustomToken?: () => void;
  isAddressSearch: boolean;
  isLoadingHoldings: boolean;
  hasResults: boolean;
  chainName?: string;
}

const NATIVE_TOKEN_ADDRESS = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";

function TokenAvatar({
  symbol,
  logoUrl,
  resolveLogo,
  size = "32px",
}: {
  symbol: string;
  logoUrl?: string;
  resolveLogo: (url: string | undefined) => string | undefined;
  size?: string;
}) {
  return logoUrl ? (
    <Image
      src={resolveLogo(logoUrl)}
      alt=""
      boxSize={size}
      borderRadius="full"
      fallback={<TokenSymbolFallback symbol={symbol} size={size} />}
    />
  ) : (
    <TokenSymbolFallback symbol={symbol} size={size} />
  );
}

function PortfolioRow({
  token,
  isSelected,
  onSelect,
  resolveLogo,
}: {
  token: PortfolioToken;
  isSelected: boolean;
  onSelect: () => void;
  resolveLogo: (url: string | undefined) => string | undefined;
}) {
  return (
    <ListItem interactive isSelected={isSelected} onClick={onSelect}>
      <ListItemMedia>
        <TokenAvatar
          symbol={token.symbol}
          logoUrl={token.logoUrl}
          resolveLogo={resolveLogo}
        />
      </ListItemMedia>
      <ListItemContent>
        <ListItemTitle>{token.symbol}</ListItemTitle>
        <ListItemDescription fontFamily={token.contractAddress === "native" ? undefined : "mono"}>
          {token.contractAddress === "native"
            ? token.name
            : truncateAddress(token.contractAddress)}
        </ListItemDescription>
      </ListItemContent>
      <VStack flexShrink={0} spacing={0} align="end">
        <ListItemMeta color="fg.primary">
          {formatTokenBalance(token.balance)}
        </ListItemMeta>
        {token.valueUsd > 0 && (
          <ListItemMeta fontSize="xs">{formatUsd(token.valueUsd)}</ListItemMeta>
        )}
      </VStack>
      {isSelected && <CheckIcon boxSize={4} color="accent.secondary" />}
    </ListItem>
  );
}

export function TokenPickerContent({
  inputRef,
  search,
  onSearchChange,
  onBack,
  popularTokens,
  filteredHoldings,
  visibleRest,
  remainingRestCount,
  onShowMore,
  onSelectHolding,
  onSelectListEntry,
  onSelectPortfolio,
  isSelectedAddress,
  resolveLogo,
  customTokenLoading,
  customTokenError,
  resolvedCustomToken,
  onSelectResolvedCustomToken,
  isAddressSearch,
  isLoadingHoldings,
  hasResults,
  chainName,
}: TokenPickerContentProps) {
  const searchTerm = search.trim();

  return (
    <FullScreenPicker
      title="Choose token"
      onBack={onBack}
      controls={
        <>
          <FullScreenPickerSearch
            ref={inputRef}
            label="Search tokens"
            placeholder="Name, symbol, or token address"
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                onBack();
                return;
              }
              event.stopPropagation();
            }}
          />
          {popularTokens.length > 0 && (
            <FullScreenPickerScopes aria-label="Popular tokens">
              {popularTokens.map((token) => {
                const address =
                  token.contractAddress === "native"
                    ? NATIVE_TOKEN_ADDRESS
                    : token.contractAddress;
                const isSelected = isSelectedAddress(address);
                return (
                  <Button
                    key={address}
                    type="button"
                    size="sm"
                    variant="outline"
                    h="36px"
                    flexShrink={0}
                    px={2.5}
                    borderWidth="1px"
                    borderColor={isSelected ? "accent.secondary" : "border.default"}
                    bg={isSelected ? "surface.raisedHover" : "surface.raised"}
                    leftIcon={
                      <TokenAvatar
                        symbol={token.symbol}
                        logoUrl={token.logoUrl}
                        resolveLogo={resolveLogo}
                        size="20px"
                      />
                    }
                    onClick={() => onSelectPortfolio(token)}
                  >
                    <HStack spacing={1.5}>
                      <Text as="span" fontSize="sm" fontWeight="600">
                        {token.symbol}
                      </Text>
                      {token.valueUsd > 0 && (
                        <Text as="span" fontSize="xs" fontWeight="400" color="fg.secondary">
                          {formatUsd(token.valueUsd)}
                        </Text>
                      )}
                    </HStack>
                  </Button>
                );
              })}
            </FullScreenPickerScopes>
          )}
        </>
      }
    >
      {customTokenLoading && isAddressSearch && (
        <FullScreenPickerGroup label="Token address">
          <ListItem>
            <ListItemMedia><Spinner size="sm" color="accent.secondary" /></ListItemMedia>
            <ListItemContent>
              <ListItemTitle>Finding token</ListItemTitle>
              <ListItemDescription>Reading token details on this network</ListItemDescription>
            </ListItemContent>
          </ListItem>
        </FullScreenPickerGroup>
      )}

      {customTokenError && !customTokenLoading && isAddressSearch && (
        <FullScreenPickerGroup label="Token address">
          <ListItem>
            <ListItemContent>
              <ListItemTitle color="chart.negative">Token not found</ListItemTitle>
              <ListItemDescription>{customTokenError}</ListItemDescription>
            </ListItemContent>
          </ListItem>
        </FullScreenPickerGroup>
      )}

      {resolvedCustomToken &&
        !customTokenLoading &&
        onSelectResolvedCustomToken &&
        isAddressSearch && (
          <FullScreenPickerGroup label="Token found">
            <PortfolioRow
              token={resolvedCustomToken}
              isSelected={isSelectedAddress(resolvedCustomToken.contractAddress)}
              onSelect={onSelectResolvedCustomToken}
              resolveLogo={resolveLogo}
            />
          </FullScreenPickerGroup>
        )}

      {filteredHoldings.length > 0 && (
        <FullScreenPickerGroup
          label="Your tokens"
          description={`${filteredHoldings.length} in this wallet`}
        >
          {filteredHoldings.map((token) => {
            const address =
              token.contractAddress === "native"
                ? NATIVE_TOKEN_ADDRESS
                : token.contractAddress;
            return (
              <PortfolioRow
                key={`held-${token.contractAddress}`}
                token={token}
                isSelected={isSelectedAddress(address)}
                onSelect={() => onSelectHolding(token)}
                resolveLogo={resolveLogo}
              />
            );
          })}
        </FullScreenPickerGroup>
      )}

      {visibleRest.length > 0 && (
        <FullScreenPickerGroup label="All tokens">
          {visibleRest.map((token) => {
            const isSelected = isSelectedAddress(token.address);
            return (
              <ListItem
                key={token.address}
                interactive
                isSelected={isSelected}
                onClick={() => onSelectListEntry(token)}
              >
                <ListItemMedia>
                  <TokenAvatar
                    symbol={token.symbol}
                    logoUrl={token.logoURI}
                    resolveLogo={resolveLogo}
                  />
                </ListItemMedia>
                <ListItemContent>
                  <ListItemTitle>{token.symbol}</ListItemTitle>
                  <ListItemDescription>{token.name}</ListItemDescription>
                </ListItemContent>
                <ListItemMeta fontFamily="mono">
                  {truncateAddress(token.address)}
                </ListItemMeta>
                {isSelected && <CheckIcon boxSize={4} color="accent.secondary" />}
              </ListItem>
            );
          })}
        </FullScreenPickerGroup>
      )}

      {remainingRestCount > 0 && (
        <Flex mt={3} justify="center">
          <Button type="button" variant="ghost" size="sm" onClick={onShowMore}>
            Show {Math.min(60, remainingRestCount)} more tokens
          </Button>
        </Flex>
      )}

      {!hasResults && isLoadingHoldings && !searchTerm && (
        <Box py={8} role="status">
          <VStack spacing={3}>
            <Spinner size="sm" color="accent.secondary" />
            <Text color="fg.secondary" fontSize="sm">Loading balances…</Text>
          </VStack>
        </Box>
      )}

      {!hasResults &&
        !isLoadingHoldings &&
        !customTokenLoading &&
        !resolvedCustomToken &&
        !customTokenError && (
          <FullScreenPickerEmpty
            mt={6}
            title={searchTerm ? "No tokens found" : "No tokens yet"}
            description={
              searchTerm
                ? `No token matches “${searchTerm}”. Try a symbol or paste a contract address.`
                : `No tokens${chainName ? ` were found on ${chainName}` : " were found on this network"}.`
            }
          />
        )}
    </FullScreenPicker>
  );
}
