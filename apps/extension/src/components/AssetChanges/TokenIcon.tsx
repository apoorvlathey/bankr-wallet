import { Box, Image, Text } from "@chakra-ui/react";
import type { AssetChange } from "@/chrome/txSimulation";
import { useCachedAvatarSrc } from "@/hooks/useCachedAvatarSrc";

function TokenFallback({ symbol }: { symbol: string }) {
  return (
    <Box
      boxSize="28px"
      bg="surface.raisedHover"
      border="1px solid"
      borderColor="border.default"
      borderRadius="full"
      display="flex"
      alignItems="center"
      justifyContent="center"
    >
      <Text fontSize="8px" fontWeight="800" color="accent.highlight">
        {symbol.slice(0, 3)}
      </Text>
    </Box>
  );
}

export function TokenIcon({ change }: { change: AssetChange }) {
  // The shared avatar cache exposes only background-sanitized raster data URLs.
  const cachedLogo = useCachedAvatarSrc(change.logoUrl);
  const src = cachedLogo || change.logoUrl;

  return (
    <Box
      borderRadius="full"
      w="28px"
      h="28px"
      minW="28px"
      display="flex"
      alignItems="center"
      justifyContent="center"
      overflow="hidden"
    >
      {src ? (
        <Image
          src={src}
          alt={change.symbol}
          boxSize="28px"
          borderRadius="full"
          fallback={<TokenFallback symbol={change.symbol} />}
        />
      ) : (
        <TokenFallback symbol={change.symbol} />
      )}
    </Box>
  );
}
