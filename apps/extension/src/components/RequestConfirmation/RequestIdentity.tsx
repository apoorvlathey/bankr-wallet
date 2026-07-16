import { ExternalLinkIcon } from "@chakra-ui/icons";
import { Box, HStack, Image, Text, VStack } from "@chakra-ui/react";
import SafeImage from "@/components/SafeImage";
import { googleFaviconUrl } from "@/constants/externalUrls";

interface RequestIdentityProps {
  origin: string;
  originHostname: string | null;
  favicon?: string | null;
  iconChipBg: string;
  isInternalWalletChan?: boolean;
  originInitials?: string;
  onOpenOrigin?: () => void;
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
}: RequestIdentityProps) {
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
        bg={isInternalWalletChan ? "transparent" : iconChipBg}
        borderWidth={isInternalWalletChan ? 0 : "1px"}
        borderStyle="solid"
        borderColor="border.subtle"
        display="flex"
        alignItems="center"
        justifyContent="center"
        overflow="hidden"
      >
        {isInternalWalletChan ? (
          <Image src="/walletchan-icon.png" alt="WalletChan" boxSize="28px" />
        ) : favicon || originHostname ? (
          <SafeImage
            src={favicon || undefined}
            fallbackSrc={
              originHostname ? googleFaviconUrl(originHostname) : undefined
            }
            alt=""
            boxSize="22px"
            fallback={
              <Text fontSize="xs" fontWeight="700" color="text.secondary">
                {originInitials}
              </Text>
            }
          />
        ) : (
          <Text fontSize="xs" fontWeight="700" color="text.secondary">
            {originInitials}
          </Text>
        )}
      </Box>

      {onOpenOrigin ? (
        <HStack
          as="button"
          type="button"
          role="group"
          aria-label={`Open ${originHostname || origin}`}
          spacing={1.5}
          minH="24px"
          minW={0}
          maxW="full"
          color="fg.primary"
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
            {originHostname || origin}
          </Text>
          <ExternalLinkIcon
            boxSize="10px"
            flexShrink={0}
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
          {originHostname || origin}
        </Text>
      )}
    </VStack>
  );
}
