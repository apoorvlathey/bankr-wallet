import { Box, Image, Text } from "@chakra-ui/react";
import { resolveChainIconMeta } from "@/lib/chainIcons";

/**
 * Renders a shipped chain icon when known, reuses mainnet icons for common
 * testnets with a small overlay label, and falls back to deterministic initials
 * for custom chains we do not recognize yet.
 */
export default function ChainIcon({
  chainId,
  chainName,
  size = "18px",
}: {
  chainId: number;
  chainName?: string;
  size?: string;
}) {
  const meta = resolveChainIconMeta(chainId, chainName);
  const altText = chainName || `Chain ${chainId}`;
  return (
    <Box position="relative" boxSize={size} flexShrink={0}>
      {meta.iconSrc ? (
        <Image src={meta.iconSrc} alt={altText} boxSize={size} />
      ) : (
        <Box
          bg={meta.bg}
          color={meta.text}
          boxSize={size}
          display="flex"
          alignItems="center"
          justifyContent="center"
          fontSize="7px"
          fontWeight="900"
          letterSpacing="-0.5px"
          border="1px solid"
          borderColor={meta.border}
          borderRadius="full"
        >
          {meta.fallbackText}
        </Box>
      )}
      {meta.overlayLabel && (
        <Box
          position="absolute"
          right="-3px"
          bottom="-3px"
          px="2px"
          minW="10px"
          h="10px"
          borderRadius="999px"
          bg="black"
          color="white"
          border="1px solid"
          borderColor="white"
          display="flex"
          alignItems="center"
          justifyContent="center"
        >
          <Text fontSize="5px" fontWeight="900" lineHeight="1">
            {meta.overlayLabel}
          </Text>
        </Box>
      )}
    </Box>
  );
}
