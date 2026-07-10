import { useRef, useState } from "react";
import {
  Box,
  Button,
  FormControl,
  FormErrorMessage,
  FormLabel,
  HStack,
  IconButton,
  Input,
  InputGroup,
  InputRightElement,
  Text,
  VStack,
} from "@chakra-ui/react";
import {
  ViewIcon,
  ViewOffIcon,
  WarningTwoIcon,
} from "@chakra-ui/icons";
import { useThemedToast } from "@/hooks/useThemedToast";
import {
  createPasskeyUnlockCredential,
  getPasskeyErrorMessage,
  isPasskeyPromptCancelled,
} from "@/lib/passkeyWebAuthn";
import { FingerprintIcon } from "@/components/Settings/icons";
import {
  AppHeader,
  AppScreen,
  ScreenBody,
  StickyActionBar,
} from "@/components/ui";

interface BiometricUnlockSetupProps {
  onCancel: () => void;
  onComplete: () => void;
}

function BiometricUnlockSetup({
  onCancel,
  onComplete,
}: BiometricUnlockSetupProps) {
  const toast = useThemedToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!password) {
      setError("Master password is required");
      inputRef.current?.focus();
      return;
    }

    setIsSubmitting(true);
    setError("");

    try {
      const verify = await new Promise<{
        success: boolean;
        error?: string;
        authCeremonyEpoch?: string;
      }>((resolve) => {
        chrome.runtime.sendMessage(
          { type: "verifyPasskeySetupPassword", masterPassword: password },
          resolve,
        );
      });

      if (!verify.success) {
        setError(verify.error || "Invalid master password");
        inputRef.current?.focus();
        return;
      }
      if (!verify.authCeremonyEpoch) {
        setError("Failed to start biometric setup securely");
        return;
      }

      const passkeyPayload = await createPasskeyUnlockCredential();
      const response = await new Promise<{ success: boolean; error?: string }>((resolve) => {
        chrome.runtime.sendMessage(
          {
            type: "setupPasskeyUnlockWithPassword",
            masterPassword: password,
            ...passkeyPayload,
            authCeremonyEpoch: verify.authCeremonyEpoch,
          },
          resolve,
        );
      });

      if (!response.success) {
        setError(response.error || "Failed to set up biometric unlock");
        inputRef.current?.focus();
        return;
      }

      toast({
        title: "Biometric unlock enabled",
        status: "success",
        duration: 2500,
        isClosable: true,
      });
      onComplete();
    } catch (setupError) {
      if (isPasskeyPromptCancelled(setupError)) {
        setError("");
        return;
      }
      setError(getPasskeyErrorMessage(setupError));
      inputRef.current?.focus();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AppScreen>
      <AppHeader title="Set up biometric unlock" onBack={onCancel} />
      <ScreenBody pt={5} pb={6}>
        <VStack spacing={5} w="full" align="stretch">
          <HStack spacing={3} align="center">
          <Box
            p={2}
            bg="status.info.bg"
            borderWidth="1px"
            borderColor="status.info.border"
            borderRadius="lg"
            display="flex"
            alignItems="center"
            justifyContent="center"
            flexShrink={0}
          >
            <FingerprintIcon boxSize={5} color="status.info.fg" />
          </Box>
          <Box>
            <Text fontSize="md" fontWeight="600" color="fg.primary">
              Unlock securely on this device
            </Text>
            <Text mt={0.5} fontSize="sm" color="fg.secondary">
              Your master password verifies the one-time setup.
            </Text>
          </Box>
          </HStack>

        <Box
          w="full"
          p={4}
          bg="surface.raised"
          borderWidth="1px"
          borderColor="border.default"
          borderRadius="lg"
        >
          <VStack spacing={3} align="stretch">
            <FormControl isInvalid={!!error}>
              <FormLabel>Master password</FormLabel>
              <InputGroup>
              <Input
                ref={inputRef}
                type={showPassword ? "text" : "password"}
                name="masterPassword"
                autoComplete="current-password"
                placeholder="Enter master password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (error) setError("");
                }}
                onKeyDown={(e) => e.key === "Enter" && void handleSubmit()}
                isDisabled={isSubmitting}
                isInvalid={!!error}
                autoFocus
              />
              <InputRightElement>
                <IconButton
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  icon={showPassword ? <ViewOffIcon /> : <ViewIcon />}
                  size="sm"
                  variant="ghost"
                  onClick={() => setShowPassword(!showPassword)}
                  color="text.secondary"
                  tabIndex={-1}
                />
              </InputRightElement>
              </InputGroup>
              {error && (
                <FormErrorMessage alignItems="flex-start">
                  <WarningTwoIcon mt={0.5} mr={2} />
                  {error}
                </FormErrorMessage>
              )}
            </FormControl>
          </VStack>
        </Box>
        </VStack>
      </ScreenBody>
      <StickyActionBar
        primaryAction={
          <Button
            variant="primary"
            onClick={() => void handleSubmit()}
            isLoading={isSubmitting}
            loadingText="Setting up…"
          >
            Continue
          </Button>
        }
      />
    </AppScreen>
  );
}

export default BiometricUnlockSetup;
