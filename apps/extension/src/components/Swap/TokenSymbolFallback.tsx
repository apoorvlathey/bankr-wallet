import { Box, Text } from "@chakra-ui/react";
import ChainIcon from "@/components/ChainIcon";

interface TokenSymbolFallbackProps {
  symbol: string;
  /** Total size of the rounded square (e.g. "20px", "32px") */
  size: string;
  /** Override font size; defaults scale with the box */
  fontSize?: string;
  /**
   * When set, the placeholder upgrades to the chain's logo via `<ChainIcon>`.
   * Pass this for native-token rows where the upstream portfolio API didn't
   * supply a `logoUrl` (e.g. MON on Monad) so users see "this is the chain's
   * native asset" instead of an empty initials circle.
   */
  nativeChainId?: number;
  /** Chain name used by `<ChainIcon>` for alt text + custom-chain initials. */
  nativeChainName?: string;
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
  nativeChainId,
  nativeChainName,
}: TokenSymbolFallbackProps) {
  if (nativeChainId !== undefined) {
    return (
      <Box boxSize={size} minW={size} flexShrink={0}>
        <ChainIcon
          chainId={nativeChainId}
          chainName={nativeChainName}
          size={size}
          withChip
        />
      </Box>
    );
  }
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
