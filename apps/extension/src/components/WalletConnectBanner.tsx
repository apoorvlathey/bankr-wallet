import { memo } from "react";
import { Box, HStack, Text } from "@chakra-ui/react";
import { ChevronRightIcon, LinkIcon } from "@chakra-ui/icons";
import { useTheme } from "@/theme";

interface WalletConnectBannerProps {
  sessionCount: number;
  onClick: () => void;
}

function WalletConnectBanner({
  sessionCount,
  onClick,
}: WalletConnectBannerProps) {
  const { tokens, themeId } = useTheme();
  const isDarkTheme = themeId === "midnight";
  const linkIconBg = isDarkTheme ? "accentFg.secondary" : "border.default";
  const linkIconColor = isDarkTheme ? "accent.secondary" : "accentFg.secondary";
  const arrowIconColor = "accentFg.secondary";
  if (sessionCount === 0) return null;

  return (
    <Box
      bg="accent.secondary"
      border={tokens.borders.thin}
      borderColor="border.default"
      borderRadius={tokens.radii.badge}
      boxShadow="card"
      px={3}
      py={1.5}
      cursor="pointer"
      onClick={onClick}
      _hover={{
        transform: tokens.motion.hover.transform,
        boxShadow: tokens.motion.hover.shadowOverride ?? tokens.shadows.cardHover,
      }}
      _active={{
        transform: tokens.motion.press.transform,
        boxShadow: tokens.motion.press.shadowOverride ?? tokens.shadows.card,
      }}
      transition={tokens.motion.transitionBase}
    >
      <HStack spacing={2}>
        <Box
          p={1}
          bg={linkIconBg}
          borderRadius={tokens.radii.badge}
          display="flex"
          alignItems="center"
          justifyContent="center"
          flexShrink={0}
        >
          <LinkIcon boxSize={3} color={linkIconColor} />
        </Box>
        <Text
          flex="1"
          textAlign="center"
          fontSize="xs"
          fontWeight="700"
          color="accentFg.secondary"
          textTransform="uppercase"
          letterSpacing="wider"
        >
          {sessionCount} WalletConnect Dapp{sessionCount > 1 ? "s" : ""} Connected
        </Text>
        {isDarkTheme ? (
          <ChevronRightIcon boxSize={5} color={arrowIconColor} flexShrink={0} />
        ) : (
          <Box
            bg="border.default"
            p={0.5}
            borderRadius={tokens.radii.badge}
            display="flex"
            alignItems="center"
            justifyContent="center"
            flexShrink={0}
          >
            <ChevronRightIcon boxSize={3.5} color={arrowIconColor} />
          </Box>
        )}
      </HStack>
    </Box>
  );
}

export default memo(WalletConnectBanner);
