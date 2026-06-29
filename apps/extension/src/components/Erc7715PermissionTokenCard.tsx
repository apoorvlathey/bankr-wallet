import { Box, HStack, IconButton, Text, VStack } from "@chakra-ui/react";
import { ExternalLinkIcon } from "@chakra-ui/icons";

import TokenLogo from "@/components/TokenLogo";
import type { Erc7715PermissionAsset } from "@/components/useErc7715PermissionAsset";
import { CopyButton } from "@/components/CopyButton";
import { shortAddress } from "@/lib/erc7715PermissionDisplay";
import { useTheme } from "@/theme";

export function Erc7715PermissionTokenCard({
  asset,
  chainId,
  isNative,
}: {
  asset: Erc7715PermissionAsset;
  chainId: number;
  isNative: boolean;
}) {
  const { tokens } = useTheme();
  const isDarkTheme = tokens.colorMode === "dark";
  const balanceColor = isDarkTheme ? "fg.muted" : "text.primary";
  const balanceSecondaryColor = isDarkTheme ? "fg.muted" : "text.secondary";
  const balanceFontWeight = isDarkTheme ? "700" : "900";

  return (
    <Box
      bg="surface.raised"
      border={tokens.borders.thin}
      borderColor="border.default"
      borderRadius={tokens.radii.input}
      p={3}
    >
      <HStack justify="space-between" spacing={3}>
        <HStack spacing={2} minW={0}>
          <TokenLogo
            symbol={asset.symbol}
            logoUrl={asset.logoUrl}
            nativeChainId={isNative ? chainId : undefined}
            size="30px"
          />
          <VStack align="start" spacing={0} minW={0}>
            <HStack spacing={1} minW={0}>
              <Text fontSize="sm" fontWeight="900" color="text.primary" noOfLines={1}>
                {asset.symbol}
              </Text>
              {asset.tokenExplorerUrl && (
                <IconButton
                  aria-label="View token on explorer"
                  icon={<ExternalLinkIcon boxSize="11px" />}
                  size="xs"
                  variant="ghost"
                  color="text.secondary"
                  onClick={() => window.open(asset.tokenExplorerUrl!, "_blank")}
                  _hover={{ color: "accent.secondary", bg: "bg.muted" }}
                />
              )}
            </HStack>
            <Text fontSize="xs" color="text.secondary" fontWeight="700" noOfLines={1}>
              {asset.name}
            </Text>
            {!isNative && asset.tokenAddress && (
              <HStack spacing={1}>
                <Text fontSize="2xs" color="text.tertiary" fontFamily="mono">
                  {shortAddress(asset.tokenAddress)}
                </Text>
                <CopyButton value={asset.tokenAddress} />
              </HStack>
            )}
          </VStack>
        </HStack>
        <VStack align="end" spacing={0} flexShrink={0} opacity={isDarkTheme ? 0.78 : 1}>
          <Text
            fontSize="xs"
            color={balanceColor}
            fontWeight={balanceFontWeight}
            noOfLines={1}
          >
            {asset.balanceLabel}
          </Text>
          {asset.balanceUsdLabel && (
            <Text fontSize="xs" color={balanceSecondaryColor} fontWeight="700">
              {asset.balanceUsdLabel}
            </Text>
          )}
        </VStack>
      </HStack>
    </Box>
  );
}
