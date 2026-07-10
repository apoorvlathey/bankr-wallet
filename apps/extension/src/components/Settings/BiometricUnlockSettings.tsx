import { useEffect, useState } from "react";
import {
  Badge,
  Button,
  HStack,
  Text,
  VStack,
} from "@chakra-ui/react";
import {
  CheckIcon,
  WarningIcon,
} from "@chakra-ui/icons";
import { useThemedToast } from "@/hooks/useThemedToast";
import {
  createPasskeyUnlockCredential,
  getPasskeyErrorMessage,
  isPasskeyPromptCancelled,
  isPasskeyUnlockSupported,
} from "@/lib/passkeyWebAuthn";
import { FingerprintIcon } from "./icons";
import { BiometricUnlockRemove } from "./BiometricUnlockRemove";
import {
  ListItem,
  ListItemContent,
  ListItemDescription,
  ListItemMedia,
  ListItemTitle,
  ListSurface,
  SkeletonRow,
} from "@/components/ui";
import { SettingsScreenFrame } from "./SettingsScreenFrame";

interface BiometricUnlockSettingsProps {
  onComplete: () => void;
  onCancel: () => void;
  onSessionExpired?: () => void;
}

type ViewMode = "status" | "remove";

interface PasskeyUnlockStatus {
  configured: boolean;
}

function BiometricUnlockSettings({
  onComplete,
  onCancel,
  onSessionExpired,
}: BiometricUnlockSettingsProps) {
  const [viewMode, setViewMode] = useState<ViewMode>("status");
  const [isConfigured, setIsConfigured] = useState(false);
  const [isSupported, setIsSupported] = useState(false);
  const [passwordType, setPasswordType] = useState<"master" | "agent" | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const toast = useThemedToast();

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

  const handleEnable = async () => {
    setIsSubmitting(true);
    try {
      const preflight = await new Promise<{
        success: boolean;
        error?: string;
        authCeremonyEpoch?: string;
      }>((resolve) => {
        chrome.runtime.sendMessage({ type: "canSetupPasskeyUnlock" }, resolve);
      });

      if (!preflight.success) {
        if (preflight.error?.includes("required")) {
          onSessionExpired?.();
          return;
        }
        toast({
          title: "Biometric setup failed",
          description: preflight.error || "Unlock with master password first",
          status: "error",
          duration: 5000,
          isClosable: true,
        });
        return;
      }
      if (!preflight.authCeremonyEpoch) {
        throw new Error("Failed to start biometric setup securely");
      }

      const passkeyPayload = await createPasskeyUnlockCredential();
      const response = await new Promise<{ success: boolean; error?: string }>((resolve) => {
        chrome.runtime.sendMessage(
          {
            type: "setupPasskeyUnlock",
            ...passkeyPayload,
            authCeremonyEpoch: preflight.authCeremonyEpoch,
          },
          resolve,
        );
      });

      if (!response.success) {
        if (response.error?.includes("Master password")) {
          onSessionExpired?.();
          return;
        }
        toast({
          title: "Biometric setup failed",
          description: response.error || "Unknown error",
          status: "error",
          duration: 5000,
          isClosable: true,
        });
        return;
      }

      toast({
        title: "Biometric unlock enabled",
        status: "success",
        duration: 2500,
        isClosable: true,
      });
      onComplete();
    } catch (error) {
      if (isPasskeyPromptCancelled(error)) {
        return;
      }
      toast({
        title: "Biometric setup failed",
        description: getPasskeyErrorMessage(error),
        status: "error",
        duration: 5000,
        isClosable: true,
      });
    } finally {
      setIsSubmitting(false);
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
            variant={isConfigured ? "danger" : "primary"}
            onClick={() => {
              if (isConfigured) setViewMode("remove");
              else handleEnable();
            }}
            isLoading={isSubmitting}
            loadingText={isConfigured ? "Removing..." : "Setting up..."}
          >
            {isConfigured ? "Remove biometric unlock" : "Enable biometric unlock"}
          </Button>
        ) : undefined
      }
    >
      <VStack spacing={5} align="stretch">
        <Text fontSize="sm" color="fg.secondary" lineHeight="1.5">
          Unlock WalletChan on this device with your fingerprint, face, or
          system passkey prompt.
        </Text>

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

        <ListSurface aria-label="Biometric unlock details">
          <ListItem>
            <ListItemMedia>
              <FingerprintIcon boxSize={5} />
            </ListItemMedia>
            <ListItemContent>
              <ListItemTitle>
                {isConfigured ? "Ready on this device" : "Not configured"}
              </ListItemTitle>
              <ListItemDescription>
                {isConfigured
                  ? "The system prompt can open a full master session."
                  : "Set it up while unlocked with the master password."}
              </ListItemDescription>
            </ListItemContent>
          </ListItem>
          <ListItem density="compact">
            <ListItemMedia>
              <CheckIcon boxSize={4} color="status.success.fg" />
            </ListItemMedia>
            <ListItemContent>
              <ListItemTitle fontSize="sm">Master-session access</ListItemTitle>
              <ListItemDescription>
                Biometric unlock has the same access as your master password.
              </ListItemDescription>
            </ListItemContent>
          </ListItem>
          <ListItem density="compact">
            <ListItemMedia>
              <WarningIcon boxSize={4} />
            </ListItemMedia>
            <ListItemContent>
              <ListItemTitle fontSize="sm">Stored for this device</ListItemTitle>
              <ListItemDescription>
                Other browsers and devices need their own setup.
              </ListItemDescription>
            </ListItemContent>
          </ListItem>
        </ListSurface>
      </VStack>
    </SettingsScreenFrame>
  );
}

export default BiometricUnlockSettings;
