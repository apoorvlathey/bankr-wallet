import type { ReactElement } from "react";
import {
  Box,
  HStack,
  Image,
  Popover,
  PopoverBody,
  PopoverContent,
  type PopoverProps,
  PopoverTrigger,
  Portal,
  Text,
  VStack,
} from "@chakra-ui/react";

export const PRIVACY_POOLS_LOGO_URL = "/privacy-pools-logo.svg";

export function PrivacyPoolsLogo({
  size = "28px",
}: {
  size?: string;
}) {
  return (
    <Box
      boxSize={size}
      flexShrink={0}
      display="flex"
      alignItems="center"
      justifyContent="center"
      bg="white"
      borderRadius="full"
      p="2px"
    >
      <Image
        src={PRIVACY_POOLS_LOGO_URL}
        alt=""
        boxSize="full"
        objectFit="contain"
      />
    </Box>
  );
}

export default function ShieldComplianceInfoPopover({
  children,
  placement = "top",
}: {
  children: ReactElement;
  placement?: PopoverProps["placement"];
}) {
  return (
    <Popover
      trigger="hover"
      placement={placement}
      openDelay={120}
      closeDelay={220}
      gutter={6}
      isLazy
    >
      <PopoverTrigger>{children}</PopoverTrigger>
      <Portal>
        <PopoverContent
          w="264px"
          maxW="calc(100vw - 24px)"
          bg="surface.raised"
          borderColor="border.default"
          borderRadius="md"
          boxShadow="overlay"
          _focus={{ outline: "none" }}
        >
          <PopoverBody p={3}>
            <HStack align="flex-start" spacing={2.5}>
              <PrivacyPoolsLogo size="24px" />
              <VStack align="start" spacing={0.5} minW={0}>
                <Text fontSize="xs" fontWeight="700" color="fg.primary">
                  Privacy Pools
                </Text>
                <Text fontSize="xs" color="fg.secondary" lineHeight="1.45">
                  Checks usually finish within 1 hour, but some can take longer.
                  You can exit anytime.
                </Text>
              </VStack>
            </HStack>
          </PopoverBody>
        </PopoverContent>
      </Portal>
    </Popover>
  );
}
