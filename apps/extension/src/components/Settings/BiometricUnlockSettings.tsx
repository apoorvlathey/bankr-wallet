import { useEffect, useState } from "react";
import {
  Badge,
  Box,
  Button,
  HStack,
  IconButton,
  Spacer,
  Text,
  VStack,
} from "@chakra-ui/react";
import {
  ArrowBackIcon,
  CheckIcon,
  WarningIcon,
} from "@chakra-ui/icons";
import { ThemedCard } from "@/theme";
import { useThemedToast } from "@/hooks/useThemedToast";
import {
  createPasskeyUnlockCredential,
  getPasskeyErrorMessage,
  isPasskeyPromptCancelled,
  isPasskeyUnlockSupported,
} from "@/lib/passkeyWebAuthn";
import { FingerprintIcon } from "./icons";
import { BiometricUnlockRemove } from "./BiometricUnlockRemove";

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
      <VStack spacing={4} align="stretch">
        <HStack>
          <IconButton
            aria-label="Back"
            icon={<ArrowBackIcon />}
            variant="ghost"
            size="sm"
            onClick={onCancel}
          />
          <Text fontSize="lg" fontWeight="900" color="text.primary" textTransform="uppercase" letterSpacing="tight">
            Biometric Unlock
          </Text>
          <Spacer />
        </HStack>
        <Text color="text.secondary" fontWeight="500">Loading...</Text>
      </VStack>
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
    <VStack spacing={4} align="stretch">
      <HStack>
        <IconButton
          aria-label="Back"
          icon={<ArrowBackIcon />}
          variant="ghost"
          size="sm"
          onClick={onCancel}
        />
        <Text fontSize="lg" fontWeight="900" color="text.primary" textTransform="uppercase" letterSpacing="tight">
          Biometric Unlock
        </Text>
        <Spacer />
        <Badge
          bg={isConfigured ? "accent.secondary" : "surface.sunken"}
          color={isConfigured ? "accentFg.secondary" : "fg.muted"}
          border="2px solid"
          borderColor="border.default"
          fontSize="xs"
          fontWeight="700"
          px={2}
        >
          {isConfigured ? "ON" : "OFF"}
        </Badge>
      </HStack>

      {isAgentSession && (
        <ThemedCard
          weight="medium"
          p={3}
          bg="accent.highlight"
          borderColor="border.default"
        >
          <HStack spacing={2}>
            <WarningIcon color="accentFg.highlight" boxSize={4} />
            <Text color="accentFg.highlight" fontSize="sm" fontWeight="700">
              Unlock with master password to manage settings
            </Text>
          </HStack>
        </ThemedCard>
      )}

      {!isSupported && (
        <ThemedCard
          weight="medium"
          p={3}
          bg="status.warning.tint"
          borderColor="status.warning.border"
        >
          <Text color="status.warning.fg" fontSize="sm" fontWeight="700">
            Biometric unlock is not available in this browser.
          </Text>
        </ThemedCard>
      )}

      <ThemedCard weight="medium" p={0} position="relative" overflow="hidden">
        <Box
          position="absolute"
          top={0}
          right={0}
          w="60px"
          h="60px"
          bg={isConfigured ? "accent.secondary" : "surface.sunken"}
          clipPath="polygon(100% 0, 0 0, 100% 100%)"
        />

        <VStack spacing={4} align="stretch" p={4}>
          <HStack spacing={3}>
            <Box
              p={3}
              bg={isConfigured ? "accent.secondary" : "surface.sunken"}
              border="2px solid"
              borderColor="border.default"
              borderRadius="md"
            >
              <FingerprintIcon
                boxSize={5}
                color={isConfigured ? "accentFg.secondary" : "fg.muted"}
              />
            </Box>
            <Box flex={1}>
              <Text fontWeight="800" color="text.primary" textTransform="uppercase" fontSize="sm">
                {isConfigured ? "Configured" : "Not Set"}
              </Text>
              <Text fontSize="xs" color="text.secondary" fontWeight="500">
                {isConfigured
                  ? "This device can unlock with biometrics"
                  : "Use master password to add this device"}
              </Text>
            </Box>
          </HStack>

          <Box borderTop="2px solid" borderColor="border.subtle" pt={3}>
            <HStack spacing={2} flexWrap="wrap">
              <HStack
                spacing={1}
                bg="status.success.bg"
                border="2px solid"
                borderColor="status.success.border"
                borderRadius="md"
                px={2}
                py={1}
              >
                <CheckIcon boxSize={3} color="status.success.fg" />
                <Text fontSize="xs" fontWeight="700" color="status.success.fg">
                  Master Session
                </Text>
              </HStack>
              <HStack
                spacing={1}
                bg="surface.sunken"
                border="2px solid"
                borderColor="border.default"
                borderRadius="md"
                px={2}
                py={1}
              >
                <WarningIcon boxSize={3} color="fg.muted" />
                <Text fontSize="xs" fontWeight="700" color="fg.muted">
                  Local Device
                </Text>
              </HStack>
            </HStack>
          </Box>

          {!isAgentSession && isSupported && (
            <Button
              variant={isConfigured ? "danger" : "primary"}
              size="sm"
              w="full"
              onClick={() => {
                if (isConfigured) setViewMode("remove");
                else handleEnable();
              }}
              isLoading={isSubmitting}
              loadingText={isConfigured ? "Removing..." : "Setting up..."}
            >
              {isConfigured ? "Remove" : "Enable"}
            </Button>
          )}
        </VStack>
      </ThemedCard>
    </VStack>
  );
}

export default BiometricUnlockSettings;
