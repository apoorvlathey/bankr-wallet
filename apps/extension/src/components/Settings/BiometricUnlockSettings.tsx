import { useEffect, useState } from "react";
import {
  Badge,
  Box,
  Button,
  Divider,
  HStack,
  Text,
  VStack,
} from "@chakra-ui/react";
import { WarningIcon } from "@chakra-ui/icons";
import { IconBox } from "@/theme";
import { isPasskeyUnlockSupported } from "@/lib/passkeyWebAuthn";
import BiometricUnlockSetup from "@/components/BiometricUnlockSetup";
import { FingerprintIcon } from "./icons";
import { BiometricUnlockRemove } from "./BiometricUnlockRemove";
import { ListSurface, SkeletonRow } from "@/components/ui";
import { SettingsScreenFrame } from "./SettingsScreenFrame";

interface BiometricUnlockSettingsProps {
  onComplete: () => void;
  onCancel: () => void;
}

type ViewMode = "status" | "setup" | "remove";

interface PasskeyUnlockStatus {
  configured: boolean;
}

function BiometricUnlockSettings({
  onComplete,
  onCancel,
}: BiometricUnlockSettingsProps) {
  const [viewMode, setViewMode] = useState<ViewMode>("status");
  const [isConfigured, setIsConfigured] = useState(false);
  const [isSupported, setIsSupported] = useState(false);
  const [passwordType, setPasswordType] = useState<"master" | "agent" | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadStatus();
  }, []);

  const loadStatus = async () => {
    setIsLoading(true);
    try {
      const [statusResponse, supported, typeResponse] = await Promise.all([
        new Promise<PasskeyUnlockStatus>((resolve) => {
          chrome.runtime.sendMessage({ type: "getPasskeyUnlockStatus" }, resolve);
        }),
        isPasskeyUnlockSupported(),
        new Promise<{ passwordType: "master" | "agent" | null }>((resolve) => {
          chrome.runtime.sendMessage({ type: "getPasswordType" }, resolve);
        }),
      ]);

      setIsConfigured(!!statusResponse?.configured);
      setIsSupported(supported);
      setPasswordType(typeResponse.passwordType);
    } finally {
      setIsLoading(false);
    }
  };

  const isAgentSession = passwordType === "agent";

  if (isLoading) {
    return (
      <SettingsScreenFrame title="Biometric unlock" onBack={onCancel}>
        <ListSurface aria-label="Loading biometric unlock status">
          <SkeletonRow />
        </ListSurface>
      </SettingsScreenFrame>
    );
  }

  if (viewMode === "remove") {
    return (
      <BiometricUnlockRemove
        onBack={() => setViewMode("status")}
        onComplete={onComplete}
      />
    );
  }

  if (viewMode === "setup") {
    return (
      <BiometricUnlockSetup
        onCancel={() => setViewMode("status")}
        onComplete={onComplete}
      />
    );
  }

  return (
    <SettingsScreenFrame
      title="Biometric unlock"
      onBack={onCancel}
      trailing={
        <Badge
          colorScheme={isConfigured ? "green" : undefined}
          bg={isConfigured ? "status.success.bg" : "surface.sunken"}
          color={isConfigured ? "status.success.fg" : "fg.muted"}
          border="1px solid"
          borderColor={isConfigured ? "status.success.border" : "border.default"}
          borderRadius="full"
          fontSize="xs"
          fontWeight="600"
          px={2.5}
          py={1}
        >
          {isConfigured ? "Enabled" : "Off"}
        </Badge>
      }
      primaryAction={
        !isAgentSession && isSupported ? (
          <Button
            variant={isConfigured ? "danger" : "brand"}
            onClick={() => {
              if (isConfigured) setViewMode("remove");
              else setViewMode("setup");
            }}
          >
            {isConfigured ? "Remove biometric unlock" : "Enable biometric unlock"}
          </Button>
        ) : undefined
      }
    >
      <VStack spacing={6} align="stretch">
        {isAgentSession && (
          <HStack
            align="start"
            spacing={3}
            bg="status.warning.tint"
            color="status.warning.fg"
            border="1px solid"
            borderColor="status.warning.border"
            borderRadius="md"
            p={3}
          >
            <WarningIcon mt={0.5} flexShrink={0} />
            <Text fontSize="sm" lineHeight="1.5">
              Unlock with the master password to manage biometric unlock.
            </Text>
          </HStack>
        )}

        {!isSupported && (
          <HStack
            align="start"
            spacing={3}
            bg="status.warning.tint"
            color="status.warning.fg"
            border="1px solid"
            borderColor="status.warning.border"
            borderRadius="md"
            p={3}
          >
            <WarningIcon mt={0.5} flexShrink={0} />
            <Text fontSize="sm" lineHeight="1.5">
              Biometric unlock is not available in this browser.
            </Text>
          </HStack>
        )}

        <HStack align="flex-start" spacing={4}>
          <IconBox
            size="48px"
            noShadow
            bg={isConfigured ? "status.success.bg" : "surface.sunken"}
            color={isConfigured ? "status.success.fg" : "fg.secondary"}
            aria-hidden="true"
          >
            <FingerprintIcon boxSize={6} />
          </IconBox>
          <VStack align="flex-start" spacing={1} pt={0.5} minW={0}>
            <Text fontSize="lg" fontWeight="600" lineHeight="1.3">
              {isConfigured ? "Ready to unlock" : "Set up biometric unlock"}
            </Text>
            <Text fontSize="sm" color="fg.secondary" lineHeight="1.5">
              Use your fingerprint, face, or device passkey prompt to unlock
              WalletChan.
            </Text>
          </VStack>
        </HStack>

        <Divider />

        <Box>
          <Text fontSize="xs" fontWeight="600" color="fg.muted" mb={1}>
            Access level
          </Text>
          <Text fontSize="md" fontWeight="600" mb={1}>
            Full master session
          </Text>
          <Text fontSize="sm" color="fg.secondary" lineHeight="1.5">
            Same access as unlocking with your master password.
          </Text>
        </Box>
      </VStack>
    </SettingsScreenFrame>
  );
}

export default BiometricUnlockSettings;
