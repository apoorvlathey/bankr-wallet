import { Box, Image, Text } from "@chakra-ui/react";
import { resolveChainIconMeta } from "@/lib/chainIcons";
import { useBungeeChainsVersion } from "@/lib/useBungeeChainsVersion";
import { isDarkThemeId, useTheme } from "@/theme";

/**
 * Renders a shipped chain icon when known, reuses mainnet icons for common
 * testnets with a small overlay label, and falls back to deterministic initials
 * for custom chains we do not recognize yet.
 *
 * `withChip`: opt-in light circular fill painted behind image icons. Several
 * chain SVGs (MegaETH, Mantle, HyperEVM, Linea, Ink, ApeChain, Monad) ship as a
 * dark glyph on a transparent canvas — they vanish on Midnight's dark surfaces.
 * Pass `withChip` from chain dropdowns / selected-chain badges so the glyph
 * stays legible in dark themes. Initials fallbacks get their own readable
 * Midnight fill automatically because they may render anywhere a custom chain
 * appears, including compact selected-chain buttons.
 */
export default function ChainIcon({
  chainId,
  chainName,
  size = "18px",
  withChip = false,
}: {
  chainId: number;
  chainName?: string;
  size?: string;
  withChip?: boolean;
}) {
  // Subscribe to the Bungee-chains cache version so chains resolved via
  // that fallback path (Abstract, Plume, Sonic, Tempo, …) re-render when
  // the cache populates on cold boot.
  useBungeeChainsVersion();
  const meta = resolveChainIconMeta(chainId, chainName);
  const altText = chainName || `Chain ${chainId}`;
  const { themeId } = useTheme();
  const isDarkTheme = isDarkThemeId(themeId);
  const showChip = withChip && isDarkTheme && Boolean(meta.iconSrc);
  const fallbackBg = isDarkTheme ? "whiteAlpha.900" : meta.bg;
  const fallbackText = isDarkTheme ? "fg.inverse" : meta.text;
  const fallbackBorder = isDarkTheme ? "border.default" : meta.border;
  return (
    <Box position="relative" boxSize={size} flexShrink={0}>
      {showChip && (
        <Box
          position="absolute"
          inset={0}
          bg="whiteAlpha.900"
          borderRadius="full"
        />
      )}
      {meta.iconSrc ? (
        <Image
          src={meta.iconSrc}
          alt={altText}
          boxSize={size}
          position="relative"
          borderRadius={withChip ? "full" : undefined}
          objectFit="contain"
        />
      ) : (
        <Box
          bg={fallbackBg}
          color={fallbackText}
          boxSize={size}
          display="flex"
          alignItems="center"
          justifyContent="center"
          fontSize="7px"
          fontWeight="900"
          letterSpacing="-0.5px"
          border="1px solid"
          borderColor={fallbackBorder}
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
