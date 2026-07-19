import { useEffect, useState } from "react";
import { Box, Image, Text } from "@chakra-ui/react";
import { isDarkThemeId, useTheme } from "@/theme";
import {
  INERT_IMAGE_SRC,
  useCachedAvatarSrc,
} from "@/hooks/useCachedAvatarSrc";

interface DappSiteIconProps {
  src?: string | null;
  fallbackSrc?: string | null;
  label: string;
  size?: string;
  imageSize?: string;
}

/**
 * Shared dapp favicon treatment. Midnight supplies a light canvas behind
 * image-backed icons so transparent dark artwork remains visible.
 */
export default function DappSiteIcon({
  src,
  fallbackSrc,
  label,
  size = "38px",
  imageSize = "24px",
}: DappSiteIconProps) {
  const [failed, setFailed] = useState(false);
  const safeSrc = useCachedAvatarSrc(src);
  const safeFallbackSrc = useCachedAvatarSrc(fallbackSrc);
  const { themeId } = useTheme();
  const isDarkTheme = isDarkThemeId(themeId);
  const resolvedSrc =
    safeSrc && safeSrc !== INERT_IMAGE_SRC
      ? safeSrc
      : safeFallbackSrc && safeFallbackSrc !== INERT_IMAGE_SRC
        ? safeFallbackSrc
        : null;
  const showImage = !!resolvedSrc && !failed;

  useEffect(() => setFailed(false), [resolvedSrc]);

  return (
    <Box
      boxSize={size}
      display="flex"
      alignItems="center"
      justifyContent="center"
      bg={showImage && isDarkTheme ? "whiteAlpha.900" : "surface.sunken"}
      border="1px solid"
      borderColor="border.subtle"
      borderRadius="md"
      overflow="hidden"
      flexShrink={0}
    >
      {showImage ? (
        <Image
          src={resolvedSrc || undefined}
          alt=""
          boxSize={imageSize}
          objectFit="contain"
          onError={() => setFailed(true)}
        />
      ) : (
        <Text color="fg.primary" fontSize="sm" fontWeight="700">
          {label.slice(0, 1).toUpperCase() || "@"}
        </Text>
      )}
    </Box>
  );
}
