import { HStack, IconButton, Text, VStack } from "@chakra-ui/react";
import { ExternalLinkIcon } from "@chakra-ui/icons";

import TokenLogo from "@/components/TokenLogo";
import type { Erc7715PermissionAsset } from "@/components/useErc7715PermissionAsset";
import { CopyButton } from "@/components/CopyButton";
import { shortAddress } from "@/lib/erc7715PermissionDisplay";

export function Erc7715PermissionTokenCard({
  asset,
  chainId,
  isNative,
}: {
  asset: Erc7715PermissionAsset;
  chainId: number;
  isNative: boolean;
}) {
  return (
    <HStack
      as="section"
      aria-label="Permission asset"
      justify="space-between"
      align="center"
      spacing={3}
      py={3}
      borderBottomWidth="1px"
      borderBottomStyle="solid"
      borderBottomColor="border.subtle"
    >
      <HStack spacing={3} minW={0}>
        <TokenLogo
          symbol={asset.symbol}
          logoUrl={asset.logoUrl}
          nativeChainId={isNative ? chainId : undefined}
          size="36px"
        />
        <VStack align="start" spacing={0.5} minW={0}>
          <HStack spacing={1} minW={0}>
            <Text
              fontSize="md"
              fontWeight="600"
              color="fg.primary"
              noOfLines={1}
            >
              {asset.symbol}
            </Text>
            {asset.tokenExplorerUrl && (
              <IconButton
                aria-label="View token on explorer"
                icon={<ExternalLinkIcon boxSize={3} />}
                size="xs"
                variant="ghost"
                color="fg.secondary"
                onClick={() => window.open(asset.tokenExplorerUrl!, "_blank")}
              />
            )}
          </HStack>
          <Text fontSize="sm" color="fg.secondary" noOfLines={1}>
            {asset.name}
          </Text>
          {!isNative && asset.tokenAddress && (
            <HStack spacing={1}>
              <Text fontSize="xs" color="fg.muted" fontFamily="mono">
                {shortAddress(asset.tokenAddress)}
              </Text>
              <CopyButton value={asset.tokenAddress} />
            </HStack>
          )}
        </VStack>
      </HStack>

      <VStack align="end" spacing={0.5} flexShrink={0}>
        <Text
          fontSize="sm"
          color="fg.primary"
          fontWeight="600"
          sx={{ fontVariantNumeric: "tabular-nums" }}
          noOfLines={1}
        >
          {asset.balanceLabel}
        </Text>
        {asset.balanceUsdLabel && (
          <Text
            fontSize="xs"
            color="fg.secondary"
            sx={{ fontVariantNumeric: "tabular-nums" }}
          >
            {asset.balanceUsdLabel}
          </Text>
        )}
      </VStack>
    </HStack>
  );
}
