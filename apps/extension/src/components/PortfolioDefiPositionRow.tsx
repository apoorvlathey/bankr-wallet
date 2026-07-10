import {
  Flex,
  HStack,
  IconButton,
  Image,
  Text,
  VStack,
} from "@chakra-ui/react";
import { ExternalLinkIcon } from "@chakra-ui/icons";
import type { DefiPosition } from "@/chrome/portfolioApi";
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

interface PositionAssetLineProps {
  asset: DefiPosition["assets"][number];
  hideValue: boolean;
  formatUsd: (value: number) => string;
  resolveLogo: (url: string | undefined) => string | undefined;
}

function PositionAssetLine({
  asset,
  hideValue,
  formatUsd,
  resolveLogo,
}: PositionAssetLineProps) {
  return (
    <HStack w="full" minH="28px" spacing={2} justify="space-between">
      <HStack minW={0} spacing={2}>
        <Flex
          boxSize="20px"
          flexShrink={0}
          align="center"
          justify="center"
          overflow="hidden"
          bg="surface.sunken"
          borderRadius="full"
        >
          {asset.logoUrl ? (
            <Image
              src={resolveLogo(asset.logoUrl)}
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
        <Text
          minW={0}
          color="fg.secondary"
          fontSize="xs"
          fontWeight={500}
          noOfLines={1}
          sx={{ fontVariantNumeric: "tabular-nums" }}
        >
          {hideValue ? "••••" : asset.balanceFormatted} {asset.symbol}
        </Text>
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
  const chainConfig = getChainConfig(position.chainId);
  const positionLabel =
    position.type === position.name
      ? position.type
      : `${position.type} · ${position.name}`;

  return (
    <ListItem align="stretch" px={4} py={3}>
      <VStack w="full" align="stretch" spacing={3}>
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
              {position.protocolLogo ? (
                <Image
                  src={resolveLogo(position.protocolLogo)}
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
              right="-4px"
              bottom="-2px"
              boxSize="16px"
              align="center"
              justify="center"
              bg="surface.raised"
              borderRadius="full"
            >
              <ChainIcon
                chainId={position.chainId}
                chainName={chainConfig.name}
                size="14px"
                withChip
              />
            </Flex>
          </ListItemMedia>
          <ListItemContent>
            <HStack spacing={1.5} minW={0}>
              <ListItemTitle noOfLines={1}>{position.protocol}</ListItemTitle>
              {position.siteUrl && (
                <IconButton
                  as="a"
                  href={position.siteUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Open ${position.protocol}`}
                  icon={<ExternalLinkIcon />}
                  size="xs"
                  variant="ghost"
                  color="fg.secondary"
                />
              )}
            </HStack>
            <ListItemDescription noOfLines={1}>
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
          <VStack align="stretch" spacing={1} pl={12}>
            {position.assets.map((asset, index) => (
              <PositionAssetLine
                key={`asset-${asset.chainId}-${asset.contractAddress}-${index}`}
                asset={asset}
                hideValue={hideValue}
                formatUsd={formatUsd}
                resolveLogo={resolveLogo}
              />
            ))}
            {position.rewardAssets.length > 0 && (
              <Text
                pt={1}
                color="fg.muted"
                fontSize="xs"
                fontWeight={500}
              >
                Rewards
              </Text>
            )}
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
    </ListItem>
  );
}
