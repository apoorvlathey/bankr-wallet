import { Box, HStack, Spinner, Text } from "@chakra-ui/react";
import { ScreenSection } from "@/components/ui";
import { LedgerLogo } from "./LedgerLogo";

interface LedgerDevicePanelProps {
  device: {
    deviceLabel: string;
  } | null;
  busy: boolean;
  status: string;
}

export function LedgerDevicePanel({
  device,
  busy,
  status,
}: LedgerDevicePanelProps) {
  return (
    <ScreenSection
      title="Hardware wallet"
      description={
        device
          ? "The Ethereum app is ready."
          : "WalletChan stores public addresses and paths only. Your keys stay on the device."
      }
    >
      <Box
        p={4}
        bg="surface.raised"
        border="1px solid"
        borderColor="border.subtle"
        borderRadius="lg"
      >
        <HStack justify="space-between" align="center" spacing={4}>
          <LedgerLogo w="108px" />
          <HStack spacing={2} flexShrink={0}>
            {busy && <Spinner size="xs" color="accent.highlight" />}
            {device && (
              <HStack
                spacing={1.5}
                px={2.5}
                py={1}
                bg="status.success.bg"
                border="1px solid"
                borderColor="status.success.border"
                borderRadius="full"
              >
                <Box boxSize="6px" borderRadius="full" bg="status.success.fg" />
                <Text
                  color="status.success.fg"
                  fontSize="xs"
                  fontWeight="600"
                >
                  Connected
                </Text>
              </HStack>
            )}
          </HStack>
        </HStack>

        <Box mt={4} pt={4} borderTop="1px solid" borderColor="border.subtle">
          <Text color="fg.primary" fontSize="lg" fontWeight="700">
            {device?.deviceLabel || status}
          </Text>
          <Text mt={1} color="fg.secondary" fontSize="sm">
            {device
              ? busy
                ? status
                : "Ethereum app ready"
              : "Chrome will ask for USB access."}
          </Text>
        </Box>
      </Box>
    </ScreenSection>
  );
}
