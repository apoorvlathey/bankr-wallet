import { Box, Text } from "@chakra-ui/react";

interface TokenSymbolFallbackProps {
  symbol: string;
  /** Total size of the rounded square (e.g. "20px", "32px") */
  size: string;
  /** Override font size; defaults scale with the box */
  fontSize?: string;
}

/**
 * Symbol-initials placeholder used when a token has no logo URL or the remote
 * image fails to load. Renders the first three chars of the symbol inside a
 * sunken circle so the dropdown row still has a stable visual anchor.
 *
 * Mirrors the fallback pattern used by AssetChangesDisplay and
 * WatchAssetConfirmation — kept as its own component so the swap dropdowns,
 * the swap-confirmation surface, and any future swap-related UI all share the
 * same look.
 */
export function TokenSymbolFallback({
  symbol,
  size,
  fontSize,
}: TokenSymbolFallbackProps) {
  const initials = (symbol || "?").slice(0, 3).toUpperCase();
  // Reasonable default font size for the common dropdown sizes (16/20/32px).
  const defaultFont =
    parseInt(size, 10) >= 28
      ? "9px"
      : parseInt(size, 10) >= 18
        ? "7px"
        : "6px";
  return (
    <Box
      boxSize={size}
      minW={size}
      borderRadius="full"
      bg="surface.sunken"
      flexShrink={0}
      display="flex"
      alignItems="center"
      justifyContent="center"
      overflow="hidden"
    >
      <Text
        fontSize={fontSize || defaultFont}
        fontWeight="800"
        color="text.secondary"
        lineHeight="1"
      >
        {initials}
      </Text>
    </Box>
  );
}
