import { WarningIcon } from "@chakra-ui/icons";
import { Box, Button, HStack, Spinner, Text, VStack } from "@chakra-ui/react";

interface LegacyBiometricUpgradeNoticeProps {
  onOpenBiometricSettings: () => void;
}

export function LegacyBiometricUpgradeNotice({
  onOpenBiometricSettings,
}: LegacyBiometricUpgradeNoticeProps) {
  return (
    <Box
      bg="status.warning.tint"
      border="1px solid"
      borderColor="status.warning.border"
      borderRadius="md"
      p={4}
    >
      <HStack align="start" spacing={3}>
        <WarningIcon color="status.warning.fg" mt={0.5} flexShrink={0} />
        <VStack align="stretch" spacing={3} flex={1} minW={0}>
          <Text color="status.warning.fg" fontSize="sm" lineHeight="1.5">
            Your current biometric setup only supports signing. Before you can
            create, import, or derive local accounts, remove it and set up
            biometric unlock again with your master password.
          </Text>
          <Button
            alignSelf="flex-start"
            size="sm"
            variant="brand"
            onClick={onOpenBiometricSettings}
          >
            Open biometric settings
          </Button>
        </VStack>
      </HStack>
    </Box>
  );
}

interface LocalAccountBiometricGateStatusProps {
  needsUpgrade: boolean | null;
  onOpenBiometricSettings: () => void;
}

export function LocalAccountBiometricGateStatus({
  needsUpgrade,
  onOpenBiometricSettings,
}: LocalAccountBiometricGateStatusProps) {
  if (needsUpgrade === null) {
    return (
      <HStack justify="center" py={8}>
        <Spinner color="accent.primary" />
        <Text color="fg.secondary" fontSize="sm">
          Checking biometric access…
        </Text>
      </HStack>
    );
  }

  return needsUpgrade ? (
    <LegacyBiometricUpgradeNotice
      onOpenBiometricSettings={onOpenBiometricSettings}
    />
  ) : null;
}
