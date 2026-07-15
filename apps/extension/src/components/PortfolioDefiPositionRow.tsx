import {
  Flex,
  HStack,
  Image,
  Text,
  Tooltip,
  VStack,
} from "@chakra-ui/react";
import { ExternalLinkIcon } from "@chakra-ui/icons";
import type { DefiPosition } from "@/chrome/portfolio/api";
import ChainIcon from "@/components/ChainIcon";
import {
  ListItem,
  ListItemContent,
  ListItemDescription,
  ListItemMedia,
  ListItemMeta,
  ListItemTitle,
} from "@/components/ui";
import { getChainConfig } from "@/constants/chainConfig";
import { INERT_IMAGE_SRC } from "@/hooks/useCachedAvatarSrc";
import { sanitizeExternalNavigationUrl } from "@/lib/externalNavigation";

interface PositionAssetLineProps {
  asset: DefiPosition["assets"][number];
  hideValue: boolean;
  formatUsd: (value: number) => string;
  resolveLogo: (url: string | undefined) => string | undefined;
}

const COMPACT_BALANCE_THRESHOLD = 1_000_000;
const compactBalanceFormatter = new Intl.NumberFormat("en-US", {
  notation: "compact",
  compactDisplay: "short",
  maximumFractionDigits: 2,
});

function humanizePositionLabel(value: string): string {
  const normalized = value.trim().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
  if (!normalized) return "Position";
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function formatCompactBalance(balance: string): string {
  const numericBalance = Number(balance.replace(/,/g, "").trim());
  if (
    !Number.isFinite(numericBalance) ||
    Math.abs(numericBalance) < COMPACT_BALANCE_THRESHOLD
  ) {
    return balance;
  }

  return compactBalanceFormatter.format(numericBalance);
}

function PositionAssetLine({
  asset,
  hideValue,
  formatUsd,
  resolveLogo,
}: PositionAssetLineProps) {
  const logoSrc = resolveLogo(asset.logoUrl);
  const exactBalance = `${asset.balanceFormatted} ${asset.symbol}`;
  const balanceLabel = hideValue
    ? "••••"
    : formatCompactBalance(asset.balanceFormatted);

  return (
    <HStack w="full" minH="28px" spacing={3} justify="space-between">
      <HStack minW={0} flex="1 1 auto" spacing={2}>
        <Flex
          boxSize="20px"
          flexShrink={0}
          align="center"
          justify="center"
          overflow="hidden"
          bg="surface.sunken"
          borderRadius="full"
        >
          {logoSrc && logoSrc !== INERT_IMAGE_SRC ? (
            <Image
              src={logoSrc}
              alt=""
              boxSize="18px"
              fallback={
                <Text fontSize="8px" fontWeight={700} color="fg.muted">
                  {asset.symbol.slice(0, 2)}
                </Text>
              }
            />
          ) : (
            <Text fontSize="8px" fontWeight={700} color="fg.muted">
              {asset.symbol.slice(0, 2)}
            </Text>
          )}
        </Flex>
        <Tooltip
          label={hideValue ? undefined : exactBalance}
          fontSize="xs"
          openDelay={400}
          isDisabled={hideValue || balanceLabel === asset.balanceFormatted}
        >
          <HStack
            as="span"
            minW={0}
            spacing={1}
            color="fg.secondary"
            fontSize="xs"
            fontWeight={500}
            title={hideValue ? undefined : exactBalance}
            sx={{ fontVariantNumeric: "tabular-nums" }}
          >
            <Text as="span" minW={0} noOfLines={1}>
              {balanceLabel}
            </Text>
            <Text as="span" flexShrink={0}>
              {asset.symbol}
            </Text>
          </HStack>
        </Tooltip>
      </HStack>
      <Text
        flexShrink={0}
        color="fg.secondary"
        fontSize="xs"
        sx={{ fontVariantNumeric: "tabular-nums" }}
      >
        {formatUsd(asset.valueUsd)}
      </Text>
    </HStack>
  );
}

export interface DefiPositionRowProps {
  position: DefiPosition;
  hideValue: boolean;
  formatUsd: (value: number) => string;
  resolveLogo: (url: string | undefined) => string | undefined;
}

export function DefiPositionRow({
  position,
  hideValue,
  formatUsd,
  resolveLogo,
}: DefiPositionRowProps) {
  const protocolLogoSrc = resolveLogo(position.protocolLogo);
  const chainConfig = getChainConfig(position.chainId);
  const typeLabel = humanizePositionLabel(position.type);
  const nameLabel = humanizePositionLabel(position.name);
  const positionLabel =
    typeLabel.toLocaleLowerCase() === nameLabel.toLocaleLowerCase()
      ? typeLabel
      : `${typeLabel} · ${nameLabel}`;
  const safeSiteUrl = sanitizeExternalNavigationUrl(position.siteUrl);

  return (
    <ListItem align="stretch" px={4} py={3}>
      <VStack w="full" align="stretch" spacing={2}>
        <HStack spacing={3} align="center">
          <ListItemMedia position="relative">
            <Flex
              boxSize="36px"
              align="center"
              justify="center"
              overflow="hidden"
              bg="surface.sunken"
              borderRadius="md"
            >
              {protocolLogoSrc && protocolLogoSrc !== INERT_IMAGE_SRC ? (
                <Image
                  src={protocolLogoSrc}
                  alt=""
                  boxSize="36px"
                  borderRadius="md"
                  fallback={
                    <Text fontSize="2xs" fontWeight={700} color="fg.secondary">
                      {position.protocol.slice(0, 3)}
                    </Text>
                  }
                />
              ) : (
                <Text fontSize="2xs" fontWeight={700} color="fg.secondary">
                  {position.protocol.slice(0, 3)}
                </Text>
              )}
            </Flex>
            <Flex
              position="absolute"
              right="-2px"
              bottom="-2px"
              boxSize="14px"
              align="center"
              justify="center"
              bg="surface.raised"
              borderRadius="full"
            >
              <ChainIcon
                chainId={position.chainId}
                chainName={chainConfig.name}
                size="12px"
                withChip
              />
            </Flex>
          </ListItemMedia>
          <ListItemContent>
            {safeSiteUrl ? (
              <Flex
                as="a"
                minW={0}
                maxW="full"
                w="fit-content"
                minH="32px"
                mx={-1}
                px={1}
                align="center"
                gap={1.5}
                color="fg.primary"
                borderRadius="sm"
                textDecoration="none"
                aria-label={`Open ${position.protocol} website`}
                _hover={{ color: "accent.secondary" }}
                _focus={{ outline: "none" }}
                _focusVisible={{
                  boxShadow:
                    "0 0 0 2px var(--chakra-colors-border-focus)",
                }}
                href={safeSiteUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                <ListItemTitle noOfLines={1}>{position.protocol}</ListItemTitle>
                <ExternalLinkIcon
                  flexShrink={0}
                  boxSize="14px"
                  aria-hidden="true"
                />
              </Flex>
            ) : (
              <ListItemTitle
                minH="32px"
                display="flex"
                alignItems="center"
                noOfLines={1}
              >
                {position.protocol}
              </ListItemTitle>
            )}
            <ListItemDescription noOfLines={1} title={positionLabel}>
              {positionLabel}
            </ListItemDescription>
          </ListItemContent>
          <ListItemMeta
            flex="0 0 auto"
            color="fg.primary"
            fontWeight={600}
            noOfLines={1}
          >
            {formatUsd(position.valueUsd)}
          </ListItemMeta>
        </HStack>

        {(position.assets.length > 0 || position.rewardAssets.length > 0) && (
          <VStack align="stretch" spacing={0.5} pl={4}>
            <VStack align="stretch" spacing={0.5}>
              {position.assets.map((asset, index) => (
                <PositionAssetLine
                  key={`asset-${asset.chainId}-${asset.contractAddress}-${index}`}
                  asset={asset}
                  hideValue={hideValue}
                  formatUsd={formatUsd}
                  resolveLogo={resolveLogo}
                />
              ))}
            </VStack>
            {position.rewardAssets.length > 0 && (
              <VStack
                align="stretch"
                spacing={0.5}
                mt={1}
                pt={2}
                borderTopWidth="1px"
                borderTopColor="border.subtle"
              >
                <Text color="fg.muted" fontSize="2xs" fontWeight={600}>
                  Rewards
                </Text>
                {position.rewardAssets.map((asset, index) => (
                  <PositionAssetLine
                    key={`reward-${asset.chainId}-${asset.contractAddress}-${index}`}
                    asset={asset}
                    hideValue={hideValue}
                    formatUsd={formatUsd}
                    resolveLogo={resolveLogo}
                  />
                ))}
              </VStack>
            )}
          </VStack>
        )}
      </VStack>
    </ListItem>
  );
}
