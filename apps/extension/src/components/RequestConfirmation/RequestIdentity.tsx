import { ExternalLinkIcon } from "@chakra-ui/icons";
import { Box, HStack, Image, Text, VStack } from "@chakra-ui/react";
import type { ReactNode } from "react";
import SafeImage from "@/components/SafeImage";
import { googleFaviconUrl } from "@/constants/externalUrls";
import { useDappOriginFormatter } from "@/hooks/useDappOriginDisplay";

interface RequestIdentityProps {
  origin: string;
  originHostname: string | null;
  favicon?: string | null;
  iconChipBg: string;
  isInternalWalletChan?: boolean;
  originInitials?: string;
  onOpenOrigin?: () => void;
  labelOverride?: string;
  identityIcon?: ReactNode;
}

/** Shared requesting-app identity used by transaction and batch decisions. */
export function RequestIdentity({
  origin,
  originHostname,
  favicon,
  iconChipBg,
  isInternalWalletChan = false,
  originInitials = "?",
  onOpenOrigin,
  labelOverride,
  identityIcon,
}: RequestIdentityProps) {
  const formatOrigin = useDappOriginFormatter();
  const displayOrigin = formatOrigin(origin);
  const displayLabel = labelOverride ?? displayOrigin.label;
  const displayFavicon = displayOrigin.faviconSrc || favicon;
  const displayFaviconFallback =
    displayOrigin.faviconFallbackSrc ||
    (originHostname ? googleFaviconUrl(originHostname) : undefined);
  const displayInitials = displayOrigin.resolvedName
    ? displayLabel
        .split(/[.\s-]+/u)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0])
        .join("")
        .toUpperCase() || originInitials
    : originInitials;

  return (
    <VStack
      as="section"
      aria-label="Requesting application"
      w="full"
      minW={0}
      spacing={2}
      py={2}
    >
      <Box
        boxSize="36px"
        borderRadius="md"
        bg={isInternalWalletChan && !identityIcon ? "transparent" : iconChipBg}
        borderWidth={isInternalWalletChan && !identityIcon ? 0 : "1px"}
        borderStyle="solid"
        borderColor="border.subtle"
        display="flex"
        alignItems="center"
        justifyContent="center"
        overflow="hidden"
      >
        {identityIcon ? (
          identityIcon
        ) : isInternalWalletChan ? (
          <Image src="/walletchan-icon.png" alt="WalletChan" boxSize="28px" />
        ) : displayFavicon || displayFaviconFallback ? (
          <SafeImage
            src={displayFavicon || undefined}
            fallbackSrc={displayFaviconFallback}
            alt=""
            boxSize="22px"
            fallback={
              <Text fontSize="xs" fontWeight="700" color="text.secondary">
                {displayInitials}
              </Text>
            }
          />
        ) : (
          <Text fontSize="xs" fontWeight="700" color="text.secondary">
            {displayInitials}
          </Text>
        )}
      </Box>

      {onOpenOrigin ? (
        <HStack
          as="button"
          type="button"
          role="group"
          aria-label={`Open ${displayLabel}`}
          spacing={0}
          minH="24px"
          minW={0}
          maxW="calc(100% - 18px)"
          color="fg.primary"
          position="relative"
          onClick={onOpenOrigin}
          borderRadius="sm"
          _focusVisible={{ boxShadow: "outline" }}
        >
          <Text
            fontSize="sm"
            fontWeight="700"
            textAlign="center"
            minW={0}
            noOfLines={1}
          >
            {displayLabel}
          </Text>
          <ExternalLinkIcon
            boxSize="10px"
            position="absolute"
            left="100%"
            top="50%"
            ml={1.5}
            transform="translateY(-50%)"
            color="fg.muted"
            opacity={0}
            transition="opacity 150ms ease-out"
            _groupHover={{ opacity: 0.75 }}
            _groupFocus={{ opacity: 0.75 }}
            aria-hidden
          />
        </HStack>
      ) : (
        <Text
          color="fg.primary"
          fontSize="sm"
          fontWeight="700"
          textAlign="center"
          maxW="full"
          noOfLines={1}
        >
          {displayLabel}
        </Text>
      )}
    </VStack>
  );
}
