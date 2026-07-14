import { Box, Image, Text, VStack } from "@chakra-ui/react";
import SafeImage from "@/components/SafeImage";
import { googleFaviconUrl } from "@/constants/externalUrls";

interface RequestIdentityProps {
  origin: string;
  originHostname: string | null;
  favicon?: string | null;
  iconChipBg: string;
  isInternalWalletChan?: boolean;
  originInitials?: string;
}

/** Shared requesting-app identity used by transaction and batch decisions. */
export function RequestIdentity({
  origin,
  originHostname,
  favicon,
  iconChipBg,
  isInternalWalletChan = false,
  originInitials = "?",
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
    </VStack>
  );
}
