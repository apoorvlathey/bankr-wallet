import { type FormEvent, useEffect, useRef, useState } from "react";
import {
  Box,
  Button,
  FormControl,
  FormErrorMessage,
  HStack,
  IconButton,
  Input,
  InputGroup,
  InputRightElement,
  Text,
  VStack,
} from "@chakra-ui/react";
import { ViewIcon, ViewOffIcon, WarningIcon } from "@chakra-ui/icons";
import { ScreenSection } from "@/components/ui";
import { useThemedToast } from "@/hooks/useThemedToast";
import { SettingsScreenFrame } from "./SettingsScreenFrame";

interface ChangePasswordProps {
  onComplete: () => void;
  onCancel: () => void;
}

type Step = "verify" | "replace";

function ChangePassword({ onComplete, onCancel }: ChangePasswordProps) {
  const [step, setStep] = useState<Step>("verify");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [agentEnabled, setAgentEnabled] = useState(false);
  const [passkeyEnabled, setPasskeyEnabled] = useState(false);
  const [currentPasswordError, setCurrentPasswordError] = useState("");
  const [errors, setErrors] = useState<{
    newPassword?: string;
    confirmPassword?: string;
  }>({});
  const currentPasswordInputRef = useRef<HTMLInputElement>(null);
  const newPasswordInputRef = useRef<HTMLInputElement>(null);
  const toast = useThemedToast();

  useEffect(() => {
    Promise.all([
      new Promise<{ enabled: boolean }>((resolve) => {
        chrome.runtime.sendMessage({ type: "isAgentPasswordEnabled" }, resolve);
      }),
      new Promise<{ configured: boolean }>((resolve) => {
        chrome.runtime.sendMessage({ type: "getPasskeyUnlockStatus" }, resolve);
      }),
    ]).then(([agentStatus, passkeyStatus]) => {
      setAgentEnabled(!!agentStatus?.enabled);
      setPasskeyEnabled(!!passkeyStatus?.configured);
    });
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (step === "verify") currentPasswordInputRef.current?.focus();
      else newPasswordInputRef.current?.focus();
    }, 100);
    return () => window.clearTimeout(timer);
  }, [step]);

  const verifyCurrentPassword = async () => {
    if (!currentPassword) {
      setCurrentPasswordError("Master password is required");
      return;
    }

    setIsSubmitting(true);
    setCurrentPasswordError("");
    try {
      const response = await new Promise<{ success: boolean; error?: string }>((resolve) => {
        chrome.runtime.sendMessage(
          { type: "verifyMasterPassword", masterPassword: currentPassword },
          resolve,
        );
      });

      if (!response.success) {
        setCurrentPasswordError(response.error || "Invalid master password");
        return;
      }

      setStep("replace");
    } finally {
      setIsSubmitting(false);
    }
  };

  const validateNewPassword = (): boolean => {
    const nextErrors: typeof errors = {};
    if (!newPassword) {
      nextErrors.newPassword = "New password is required";
    } else if (newPassword.length < 6) {
      nextErrors.newPassword = "Password must be at least 6 characters";
    } else if (newPassword === currentPassword) {
      nextErrors.newPassword = "Choose a password different from your current one";
    }
    if (newPassword !== confirmPassword) {
      nextErrors.confirmPassword = "Passwords do not match";
    }
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const changePassword = async () => {
    if (!validateNewPassword()) return;

    setIsSubmitting(true);
    try {
      const response = await new Promise<{ success: boolean; error?: string }>((resolve) => {
        chrome.runtime.sendMessage(
          { type: "changePassword", currentPassword, newPassword },
          resolve,
        );
      });

      if (!response.success) {
        if (response.error === "Invalid master password") {
          setCurrentPasswordError(response.error);
          setStep("verify");
          return;
        }
        toast({
          title: "Error changing password",
          description: response.error || "Unknown error",
          status: "error",
          duration: 5000,
          isClosable: true,
        });
        return;
      }

      toast({
        title: "Password changed",
        description: "Unlock again with your new password.",
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

  const goBack = () => {
    if (step === "replace") {
      setStep("verify");
      setNewPassword("");
      setConfirmPassword("");
      setErrors({});
      return;
    }
    onCancel();
  };

  return (
    <SettingsScreenFrame
      title="Change password"
      onBack={goBack}
      primaryAction={
        <Button
          variant="brand"
          type="submit"
          form={step === "verify" ? "verify-master-password-form" : "change-password-form"}
          isLoading={isSubmitting}
        >
          {step === "verify" ? "Continue" : "Change password"}
        </Button>
      }
      secondaryAction={
        <Button variant="secondary" onClick={goBack}>
          {step === "verify" ? "Cancel" : "Back"}
        </Button>
      }
    >
      {step === "verify" ? (
        <VStack spacing={6} align="stretch">
          <ScreenSection
            title="Verify password"
            description="Enter your current password to continue."
          >
            <Box
              as="form"
              id="verify-master-password-form"
              onSubmit={(event: FormEvent<HTMLDivElement>) => {
                event.preventDefault();
                void verifyCurrentPassword();
              }}
            >
              <FormControl isInvalid={!!currentPasswordError}>
                <InputGroup>
                  <Input
                    ref={currentPasswordInputRef}
                    aria-label="Password"
                    type={showCurrentPassword ? "text" : "password"}
                    placeholder="Password"
                    value={currentPassword}
                    onChange={(event) => {
                      setCurrentPassword(event.target.value);
                      setCurrentPasswordError("");
                    }}
                    pr="3rem"
                    autoComplete="current-password"
                  />
                  <InputRightElement w="44px" h="44px">
                    <IconButton
                      aria-label={showCurrentPassword ? "Hide password" : "Show password"}
                      icon={showCurrentPassword ? <ViewOffIcon /> : <ViewIcon />}
                      minW="40px"
                      h="40px"
                      variant="ghost"
                      onClick={() => setShowCurrentPassword((visible) => !visible)}
                      color="fg.secondary"
                    />
                  </InputRightElement>
                </InputGroup>
                <FormErrorMessage>{currentPasswordError}</FormErrorMessage>
              </FormControl>
            </Box>
          </ScreenSection>

        </VStack>
      ) : (
        <VStack spacing={6} align="stretch">
          <ScreenSection
            title="Choose new password"
          >
            <VStack
              as="form"
              id="change-password-form"
              spacing={4}
              align="stretch"
              onSubmit={(event) => {
                event.preventDefault();
                void changePassword();
              }}
            >
              <FormControl isInvalid={!!errors.newPassword}>
                <InputGroup>
                  <Input
                    ref={newPasswordInputRef}
                    aria-label="New password"
                    type={showNewPassword ? "text" : "password"}
                    placeholder="New password (6+ characters)"
                    value={newPassword}
                    onChange={(event) => {
                      setNewPassword(event.target.value);
                      setErrors((current) => ({ ...current, newPassword: undefined }));
                    }}
                    pr="3rem"
                    autoComplete="new-password"
                  />
                  <InputRightElement w="44px" h="44px">
                    <IconButton
                      aria-label={showNewPassword ? "Hide password" : "Show password"}
                      icon={showNewPassword ? <ViewOffIcon /> : <ViewIcon />}
                      tabIndex={-1}
                      minW="40px"
                      h="40px"
                      variant="ghost"
                      onClick={() => setShowNewPassword((visible) => !visible)}
                      color="fg.secondary"
                    />
                  </InputRightElement>
                </InputGroup>
                <FormErrorMessage>{errors.newPassword}</FormErrorMessage>
              </FormControl>

              <FormControl isInvalid={!!errors.confirmPassword}>
                <Input
                  aria-label="Confirm new password"
                  type={showNewPassword ? "text" : "password"}
                  placeholder="Confirm password"
                  value={confirmPassword}
                  onChange={(event) => {
                    setConfirmPassword(event.target.value);
                    setErrors((current) => ({ ...current, confirmPassword: undefined }));
                  }}
                  autoComplete="new-password"
                />
                <FormErrorMessage>{errors.confirmPassword}</FormErrorMessage>
              </FormControl>
            </VStack>
          </ScreenSection>

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
              {agentEnabled && passkeyEnabled
                ? "Agent password and biometric will need to be set again."
                : agentEnabled
                  ? "Agent password will need to be set again."
                  : passkeyEnabled
                    ? "Biometric will need to be set again."
                    : ""}
              {(agentEnabled || passkeyEnabled) && <br />}
              Your wallet will lock. Use your new password to unlock it.
            </Text>
          </HStack>
        </VStack>
      )}
    </SettingsScreenFrame>
  );
}

export default ChangePassword;
