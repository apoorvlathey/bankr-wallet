import { useEffect, useMemo, useState } from "react";
import { Box, Image, Text } from "@chakra-ui/react";
import { googleFaviconUrl } from "@/constants/externalUrls";
import {
  INERT_IMAGE_SRC,
  useCachedAvatarSrc,
} from "@/hooks/useCachedAvatarSrc";
import { getRpcProviderDomain } from "./rpcEndpointModel";

export function RpcEndpointFavicon({
  rpcUrl,
  size = "24px",
}: {
  rpcUrl: string;
  size?: string;
}) {
  const domain = useMemo(() => getRpcProviderDomain(rpcUrl), [rpcUrl]);
  const faviconUrl = useMemo(
    () => (domain ? googleFaviconUrl(domain, 64) : null),
    [domain],
  );
  const faviconSrc = useCachedAvatarSrc(faviconUrl);
  const [failed, setFailed] = useState(false);
  const hasFavicon =
    !!faviconSrc && faviconSrc !== INERT_IMAGE_SRC && !failed;
  const fallbackLabel = domain?.charAt(0).toUpperCase() || "R";

  useEffect(() => setFailed(false), [faviconSrc]);

  return (
    <Box
      boxSize={size}
      display="flex"
      alignItems="center"
      justifyContent="center"
      flexShrink={0}
      bg={hasFavicon ? "whiteAlpha.900" : "surface.raisedHover"}
      borderWidth="1px"
      borderColor={hasFavicon ? "transparent" : "border.default"}
      borderRadius="sm"
      overflow="hidden"
      aria-hidden="true"
    >
      {hasFavicon ? (
        <Image
          src={faviconSrc}
          alt=""
          boxSize="72%"
          objectFit="contain"
          onError={() => setFailed(true)}
        />
      ) : (
        <Text
          color="fg.secondary"
          fontSize="xs"
          fontWeight="700"
          lineHeight="1"
        >
          {fallbackLabel}
        </Text>
      )}
    </Box>
  );
}
