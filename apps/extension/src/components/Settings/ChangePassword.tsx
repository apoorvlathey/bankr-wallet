import { useState, useEffect, useRef } from "react";
import {
  VStack,
  HStack,
  Text,
  Input,
  Button,
  FormControl,
  FormLabel,
  FormErrorMessage,
  InputGroup,
  InputRightElement,
  IconButton,
} from "@chakra-ui/react";
import { useThemedToast } from "@/hooks/useThemedToast";
import { ViewIcon, ViewOffIcon, InfoIcon, WarningIcon } from "@chakra-ui/icons";
import { ScreenSection } from "@/components/ui";
import { SettingsScreenFrame } from "./SettingsScreenFrame";

interface ChangePasswordProps {
  onComplete: () => void;
  onCancel: () => void;
  onSessionExpired?: () => void;
}

function ChangePassword({ onComplete, onCancel, onSessionExpired }: ChangePasswordProps) {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [agentEnabled, setAgentEnabled] = useState(false);
  const [errors, setErrors] = useState<{
    newPassword?: string;
    confirmPassword?: string;
  }>({});

  // Check if agent password is enabled (informational banner)
  useEffect(() => {
    chrome.runtime.sendMessage(
      { type: "isAgentPasswordEnabled" },
      (response: { enabled: boolean }) => {
        if (chrome.runtime.lastError) return;
        setAgentEnabled(!!response?.enabled);
      },
    );
  }, []);

  const toast = useThemedToast();
  const intervalRef = useRef<number | null>(null);

  // Check session on mount and periodically
  useEffect(() => {
    const checkSession = () => {
      chrome.runtime.sendMessage({ type: "getCachedPassword" }, (response) => {
        if (!response?.hasCachedPassword) {
          setSessionExpired(true);
        }
      });
    };

    // Check immediately on mount
    checkSession();

    // Check every 30 seconds
    intervalRef.current = window.setInterval(checkSession, 30000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  // Handle session expiry
  useEffect(() => {
    if (sessionExpired) {
      if (onSessionExpired) {
        onSessionExpired();
      } else {
        onCancel();
      }
    }
  }, [sessionExpired, onSessionExpired, onCancel]);

  const validate = (): boolean => {
    const newErrors: typeof errors = {};

    if (!newPassword) {
      newErrors.newPassword = "New password is required";
    } else if (newPassword.length < 6) {
      newErrors.newPassword = "Password must be at least 6 characters";
    }

    if (newPassword !== confirmPassword) {
      newErrors.confirmPassword = "Passwords do not match";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;

    setIsSubmitting(true);

    try {
      const response = await new Promise<{ success: boolean; error?: string }>((resolve) => {
        chrome.runtime.sendMessage(
          { type: "changePasswordWithCachedPassword", newPassword },
          resolve
        );
      });

      if (!response.success) {
        if (response.error?.includes("Session expired")) {
          setSessionExpired(true);
          return;
        }
        toast({
          title: "Error changing password",
          description: response.error || "Unknown error",
          status: "error",
          duration: 5000,
          isClosable: true,
        });
        setIsSubmitting(false);
        return;
      }

      toast({
        title: "Password changed",
        description: "Your password has been updated successfully.",
        status: "success",
        duration: 3000,
        isClosable: true,
      });

      onComplete();
    } catch (error) {
      toast({
        title: "Error changing password",
        description: error instanceof Error ? error.message : "Unknown error",
        status: "error",
        duration: 5000,
        isClosable: true,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SettingsScreenFrame
      title="Change password"
      onBack={onCancel}
      primaryAction={
        <Button
          variant="primary"
          onClick={handleSubmit}
          isLoading={isSubmitting}
        >
          Change password
        </Button>
      }
      secondaryAction={
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
      }
    >
      <VStack spacing={6} align="stretch">
        <ScreenSection
          title="Choose a new password"
          description="Use a password you do not reuse elsewhere. It protects the wallet data stored in this browser."
        >
          <VStack spacing={4} align="stretch">
            <FormControl isInvalid={!!errors.newPassword}>
              <FormLabel>New password</FormLabel>
              <InputGroup>
                <Input
                  type={showNewPassword ? "text" : "password"}
                  placeholder="At least 6 characters"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                  pr="3rem"
                  autoComplete="new-password"
                  autoFocus
                />
                <InputRightElement w="44px" h="44px">
                  <IconButton
                    aria-label={showNewPassword ? "Hide password" : "Show password"}
                    icon={showNewPassword ? <ViewOffIcon /> : <ViewIcon />}
                    minW="40px"
                    h="40px"
                    variant="ghost"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    color="fg.secondary"
                  />
                </InputRightElement>
              </InputGroup>
              <FormErrorMessage>{errors.newPassword}</FormErrorMessage>
            </FormControl>

            <FormControl isInvalid={!!errors.confirmPassword}>
              <FormLabel>Confirm new password</FormLabel>
              <Input
                type={showNewPassword ? "text" : "password"}
                placeholder="Enter it again"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                autoComplete="new-password"
              />
              <FormErrorMessage>{errors.confirmPassword}</FormErrorMessage>
            </FormControl>
          </VStack>
        </ScreenSection>

        <VStack align="stretch" spacing={3}>
          {agentEnabled && (
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
                Changing your password also clears the agent password. You can
                create another one from Security afterward.
              </Text>
            </HStack>
          )}

          <HStack align="start" spacing={3} color="fg.secondary">
            <InfoIcon mt={0.5} flexShrink={0} />
            <Text fontSize="sm" lineHeight="1.5">
              The wallet will lock after this change. Unlock it again with your
              new password.
            </Text>
          </HStack>
        </VStack>
      </VStack>
    </SettingsScreenFrame>
  );
}

export default ChangePassword;
