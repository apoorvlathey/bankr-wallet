import { Box, Text } from "@chakra-ui/react";
import SafeImage from "@/components/SafeImage";
import { useNetworks } from "@/contexts/NetworksContext";
import { getNativeAssetMeta } from "@/lib/chains";

interface TokenLogoProps {
  symbol?: string | null;
  logoUrl?: string | null;
  alt?: string;
  size?: string;
  fontSize?: string;
  nativeChainId?: number;
}

/**
 * Shared token icon renderer. Native-token rows should pass `nativeChainId`
 * so ETH-native chains (Base, Arbitrum, Unichain, etc.) resolve to the ETH
 * asset logo, not the chain badge.
 */
export default function TokenLogo({
  symbol,
  logoUrl,
  alt,
  size = "16px",
  fontSize = "9px",
  nativeChainId,
}: TokenLogoProps) {
  const { networksInfo } = useNetworks();
  const native =
    nativeChainId !== undefined
      ? getNativeAssetMeta(nativeChainId, networksInfo)
      : null;
  const displaySymbol = symbol || native?.symbol || "";
  const resolvedLogoUrl = native?.logoUrl || logoUrl || undefined;
  const initials = displaySymbol.trim().slice(0, 3).toUpperCase();

  const placeholder = (
    <Box
      boxSize={size}
      minW={size}
      borderRadius="full"
      bg="surface.raisedHover"
      border="1px solid"
      borderColor="border.default"
      display="flex"
      alignItems="center"
      justifyContent="center"
      flexShrink={0}
      overflow="hidden"
    >
      {initials && (
        <Text
          fontSize={fontSize}
          fontWeight="800"
          color="accent.highlight"
          lineHeight="1"
        >
          {initials}
        </Text>
      )}
    </Box>
  );

  return (
    <SafeImage
      src={resolvedLogoUrl}
      alt={alt || displaySymbol || "Token"}
      boxSize={size}
      minW={size}
      borderRadius="full"
      flexShrink={0}
      fallback={placeholder}
    />
  );
}
