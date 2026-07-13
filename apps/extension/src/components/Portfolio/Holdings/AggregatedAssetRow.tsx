import { useState } from "react";
import { Box, Collapse, Flex, HStack, Image, Text } from "@chakra-ui/react";
import { ChevronDownIcon } from "@chakra-ui/icons";
import type { PortfolioToken } from "@/chrome/portfolio/api";
import {
  ListItemContent,
  ListItemDescription,
  ListItemMedia,
  ListItemMeta,
  ListItemTitle,
} from "@/components/ui";
import { playInteractionSound } from "@/sounds/soundManager";
import { getPortfolioTokenBalance } from "./transforms";
import type { AssetRowPresentationProps } from "./types";
import { TokenRow } from "./TokenRow";

interface AggregatedAssetRowProps extends AssetRowPresentationProps {
  symbol: "ETH" | "USDC" | "USDT";
  tokens: PortfolioToken[];
}

export function AggregatedAssetRow({
  symbol,
  tokens,
  customTokenKeys,
  networksInfo,
  onTokenClick,
  onSwapClick,
  onEditToken,
  onHideToken,
  resolveLogo,
  hideValue,
  formatUsd,
}: AggregatedAssetRowProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const totalBalance = tokens.reduce(
    (sum, token) => sum + getPortfolioTokenBalance(token),
    0,
  );
  const totalValueUsd = tokens.reduce((sum, token) => sum + token.valueUsd, 0);
  const logoUrl = tokens.find((token) => token.logoUrl)?.logoUrl;
  const sortedTokens = [...tokens].sort((a, b) => b.valueUsd - a.valueUsd);

  return (
    <Box
      as="li"
      listStyleType="none"
      borderBottomWidth="1px"
      borderBottomColor="border.subtle"
    >
      <Flex
        as="button"
        type="button"
        role="group"
        aria-expanded={isExpanded}
        aria-label={`${isExpanded ? "Collapse" : "Expand"} ${symbol} balances across chains`}
        w="full"
        minH="56px"
        px={4}
        py={3}
        gap={3}
        align="center"
        textAlign="start"
        color="fg.primary"
        bg="transparent"
        border={0}
        cursor="pointer"
        transitionProperty="background-color, box-shadow"
        transitionDuration="fast"
        _hover={{ bg: "surface.raisedHover" }}
        _active={{ bg: "surface.sunken" }}
        _focus={{ outline: "none" }}
        _focusVisible={{
          boxShadow: "inset 0 0 0 2px var(--chakra-colors-border-focus)",
        }}
        onMouseEnter={() => void playInteractionSound("portfolioTokenHover")}
        onClick={() => setIsExpanded((expanded) => !expanded)}
      >
        <ListItemMedia>
          <Flex
            boxSize="28px"
            align="center"
            justify="center"
            overflow="hidden"
            bg="surface.sunken"
            borderRadius="full"
          >
            {logoUrl ? (
              <Image
                src={resolveLogo(logoUrl)}
                alt=""
                boxSize="28px"
                borderRadius="full"
              />
            ) : (
              <Text fontSize="2xs" fontWeight={700} color="fg.secondary">
                {symbol}
              </Text>
            )}
          </Flex>
        </ListItemMedia>
        <ListItemContent>
          <HStack spacing={1.5}>
            <ListItemTitle fontSize="sm">{symbol}</ListItemTitle>
            <Text as="span" fontSize="2xs" color="fg.muted" whiteSpace="nowrap">
              {tokens.length} networks
            </Text>
            <Flex boxSize="18px" flexShrink={0} align="center" justify="center">
              <ChevronDownIcon
                boxSize="18px"
                color="fg.secondary"
                opacity={isExpanded ? 1 : 0}
                transform={isExpanded ? "rotate(180deg)" : "rotate(0deg)"}
                transitionProperty="opacity, transform"
                transitionDuration="fast"
                _groupHover={{ opacity: 1 }}
                _groupFocusVisible={{ opacity: 1 }}
              />
            </Flex>
          </HStack>
          <ListItemDescription fontSize="xs" noOfLines={1}>
            {hideValue
              ? "••••"
              : totalBalance.toLocaleString("en-US", {
                  maximumFractionDigits: 8,
                })}
          </ListItemDescription>
        </ListItemContent>
        <ListItemMeta flex="0 0 auto" minW="76px">
          <Text
            as="span"
            display="block"
            color="fg.primary"
            fontSize="sm"
            fontWeight={600}
            sx={{ fontVariantNumeric: "tabular-nums" }}
            noOfLines={1}
          >
            {formatUsd(totalValueUsd)}
          </Text>
        </ListItemMeta>
      </Flex>
      <Collapse in={isExpanded} animateOpacity>
        {isExpanded && (
          <Box
            as="ul"
            role="list"
            w="full"
            m={0}
            p={0}
            overflow="hidden"
            listStyleType="none"
            bg="surface.raisedHover"
            borderRadius={0}
            sx={{
              "& > li:first-of-type > *": { borderTopRadius: 0 },
              "& > li:last-of-type > *": { borderBottomRadius: 0 },
            }}
          >
            {sortedTokens.map((token) => (
              <TokenRow
                key={`${symbol.toLowerCase()}-chain-${token.chainId}`}
                token={token}
                customTokenKeys={customTokenKeys}
                networksInfo={networksInfo}
                onTokenClick={onTokenClick}
                onSwapClick={onSwapClick}
                onEditToken={onEditToken}
                onHideToken={onHideToken}
                resolveLogo={resolveLogo}
                hideValue={hideValue}
                formatUsd={formatUsd}
                displayMode="chainBreakdown"
              />
            ))}
          </Box>
        )}
      </Collapse>
    </Box>
  );
}
