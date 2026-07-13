import { Box, Image, Text } from "@chakra-ui/react";
import type { AssetChange } from "@/chrome/txSimulation";
import { useCachedAvatarSrc } from "@/hooks/useCachedAvatarSrc";

export function TokenIcon({ change }: { change: AssetChange }) {
  // The shared avatar cache exposes only background-sanitized raster data URLs.
  const cachedLogo = useCachedAvatarSrc(change.logoUrl);
  const src = cachedLogo || change.logoUrl;

  return (
    <Box
      bg="bg.muted"
      borderRadius="full"
      w="24px"
      h="24px"
      minW="24px"
      display="flex"
      alignItems="center"
      justifyContent="center"
      overflow="hidden"
    >
      {src ? (
        <Image
          src={src}
          alt={change.symbol}
          boxSize="24px"
          borderRadius="full"
          fallback={
            <Text fontSize="8px" fontWeight="800" color="text.secondary">
              {change.symbol.slice(0, 3)}
            </Text>
          }
        />
      ) : (
        <Text fontSize="8px" fontWeight="800" color="text.secondary">
          {change.symbol.slice(0, 3)}
        </Text>
      )}
    </Box>
  );
}
