import {
  Badge,
  Box,
  Collapse,
  HStack,
  IconButton,
  Image,
  Switch,
  Text,
  Tooltip,
  VStack,
} from "@chakra-ui/react";
import { SettingsIcon } from "@chakra-ui/icons";
import ChainIcon from "@/components/ChainIcon";
import { FromAccountDisplay } from "@/components/FromAccountDisplay";
import NativeValueAmount from "@/components/NativeValueAmount";
import SafeImage from "@/components/SafeImage";
import { googleFaviconUrl } from "@/constants/externalUrls";
import { nativeAmountToNumber } from "@/lib/nativeValueFormat";
import type { ChainBadgeStyle, ThemeTokens } from "@/theme";
import type { ForceInclusionInfo } from "./types";

interface RequestMetadataCardProps {
  borders: ThemeTokens["borders"];
  origin: string;
  originHostname: string | null;
  favicon: string | null;
  isInternalWalletChan: boolean;
  iconChipBg: string;
  fromAddress: string;
  chainId: number;
  chainName: string;
  chainBadgeStyle: ChainBadgeStyle;
  forceInclusionInfo: ForceInclusionInfo | null;
  forceInclusion: boolean;
  setForceInclusion: (value: boolean) => void;
  showAdvanced: boolean;
  setShowAdvanced: (value: boolean) => void;
  totalValueWei: bigint;
  nativePriceUsd: number | null;
  nativeSymbol: string;
  nativeDecimals: number;
}

export function RequestMetadataCard({
  borders,
  origin,
  originHostname,
  favicon,
  isInternalWalletChan,
  iconChipBg,
  fromAddress,
  chainId,
  chainName,
  chainBadgeStyle,
  forceInclusionInfo,
  forceInclusion,
  setForceInclusion,
  showAdvanced,
  setShowAdvanced,
  totalValueWei,
  nativePriceUsd,
  nativeSymbol,
  nativeDecimals,
}: RequestMetadataCardProps) {
  const nativeAmount = nativeAmountToNumber(totalValueWei, nativeDecimals);
  const usdValue = nativePriceUsd && nativePriceUsd > 0
    ? nativeAmount * nativePriceUsd
    : null;
  const usdLabel = usdValue === null
    ? null
    : usdValue < 0.01 && usdValue > 0
      ? "<$0.01"
      : `$${usdValue.toFixed(2)}`;

  return (
    <Box
      bg="surface.raised"
      border={borders.thin}
      borderColor="border.default"
      borderRadius="lg"
      boxShadow="card"
      overflow="hidden"
    >
      <VStack spacing={0} align="stretch">
        <HStack w="full" py={1.5} px={3} justify="space-between">
          <Text fontSize="xs" color="text.secondary" fontWeight="700" textTransform="uppercase">
            Origin
          </Text>
          <HStack spacing={1.5}>
            <Box
              bg={isInternalWalletChan ? "transparent" : iconChipBg}
              border={isInternalWalletChan ? "none" : "1.5px solid"}
              borderColor="border.subtle"
              borderRadius="md"
              p={isInternalWalletChan ? 0 : 0.5}
              display="flex"
              alignItems="center"
              justifyContent="center"
            >
              {isInternalWalletChan ? (
                <Image
                  src="/walletchan-icon.png"
                  alt="WalletChan"
                  boxSize="20px"
                  sx={{ filter: "drop-shadow(0 0 0.5px rgba(0,0,0,0.4)) drop-shadow(0 0 0.5px rgba(255,255,255,0.4))" }}
                />
              ) : (
                <SafeImage
                  src={favicon || undefined}
                  fallbackSrc={originHostname ? googleFaviconUrl(originHostname) : undefined}
                  alt="favicon"
                  boxSize="14px"
                  sx={{ filter: "drop-shadow(0 0 0.5px rgba(0,0,0,0.4)) drop-shadow(0 0 0.5px rgba(255,255,255,0.4))" }}
                  fallback={<Box boxSize="14px" bg="bg.muted" borderRadius="sm" />}
                />
              )}
            </Box>
            <Text fontSize="xs" fontWeight="700" color="text.primary">
              {originHostname || origin}
            </Text>
          </HStack>
        </HStack>

        <HStack
          w="full"
          py={1.5}
          px={3}
          justify="space-between"
          borderTop="1px solid"
          borderColor="border.subtle"
        >
          <Text fontSize="xs" color="text.secondary" fontWeight="700" textTransform="uppercase">
            From
          </Text>
          <FromAccountDisplay address={fromAddress} />
        </HStack>

        <HStack
          w="full"
          py={1.5}
          px={3}
          justify="space-between"
          borderTop="1px solid"
          borderColor="border.subtle"
        >
          <Text fontSize="xs" color="text.secondary" fontWeight="700" textTransform="uppercase">
            Network
          </Text>
          <HStack spacing={1}>
            <Badge
              fontSize="xs"
              bg={chainBadgeStyle.bg}
              color={chainBadgeStyle.fg}
              border="1.5px solid"
              borderColor={chainBadgeStyle.border}
              fontWeight="700"
              px={2}
              py={0.5}
              display="flex"
              alignItems="center"
              gap={1}
            >
              <ChainIcon chainId={chainId} chainName={chainName} size="12px" withChip />
              {chainName}
              {forceInclusion && forceInclusionInfo && (
                <Text as="span" fontSize="2xs" opacity={0.7}>
                  via {forceInclusionInfo.l1ChainName}
                </Text>
              )}
            </Badge>
            {forceInclusionInfo && (
              <Tooltip label="Advanced options" fontSize="xs" hasArrow>
                <IconButton
                  aria-label="Advanced options"
                  icon={<SettingsIcon />}
                  variant="ghost"
                  size="xs"
                  onClick={() => setShowAdvanced(!showAdvanced)}
                  color={showAdvanced ? "accent.secondary" : "text.tertiary"}
                  _hover={{ color: "accent.secondary", bg: "bg.muted" }}
                  minW="auto"
                  h="auto"
                  p={0.5}
                />
              </Tooltip>
            )}
          </HStack>
        </HStack>

        {totalValueWei > 0n && (
          <HStack
            w="full"
            py={1.5}
            px={3}
            justify="space-between"
            borderTop="1px solid"
            borderColor="border.subtle"
          >
            <Text fontSize="xs" color="text.secondary" fontWeight="700" textTransform="uppercase">
              Value
            </Text>
            <VStack spacing={0} align="flex-end">
              <NativeValueAmount
                value={totalValueWei}
                symbol={nativeSymbol}
                decimals={nativeDecimals}
                fontSize="sm"
                fontWeight="700"
                fontFamily="mono"
              />
              {usdLabel && (
                <Text fontSize="2xs" color="text.tertiary" fontWeight="600">
                  {usdLabel}
                </Text>
              )}
            </VStack>
          </HStack>
        )}

        {forceInclusionInfo && (
          <Collapse in={showAdvanced} animateOpacity>
            <Box w="full" py={2} px={3} bg="bg.muted">
              <HStack justify="space-between" mb={1}>
                <Text fontSize="xs" fontWeight="700" color="text.primary">
                  Force Inclusion
                </Text>
                <Switch
                  size="sm"
                  isChecked={forceInclusion}
                  onChange={(event) => setForceInclusion(event.target.checked)}
                  colorScheme="blue"
                />
              </HStack>
              <Text fontSize="2xs" color="text.tertiary" fontWeight="500">
                Submit via L1 deposit ({forceInclusionInfo.l1ChainName}) to guarantee inclusion. Takes ~1-10 min.
              </Text>
            </Box>
          </Collapse>
        )}
      </VStack>
    </Box>
  );
}
