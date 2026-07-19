import { type FormEvent, useRef, useState } from "react";
import {
  Box,
  Button,
  FormControl,
  FormErrorMessage,
  IconButton,
  Input,
  InputGroup,
  InputRightElement,
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
import {
  AppHeader,
  AppScreen,
  ScreenBody,
  ScreenSection,
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
        <VStack spacing={6} w="full" align="stretch">
          <ScreenSection
            title="Verify password"
            description="Enter your password to continue."
          >
            <Box
              as="form"
              id="biometric-setup-password-form"
              onSubmit={(event: FormEvent<HTMLDivElement>) => {
                event.preventDefault();
                void handleSubmit();
              }}
            >
              <FormControl isInvalid={!!error}>
                <InputGroup>
                  <Input
                    ref={inputRef}
                    aria-label="Password"
                    type={showPassword ? "text" : "password"}
                    name="masterPassword"
                    autoComplete="current-password"
                    placeholder="Password"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      if (error) setError("");
                    }}
                    isDisabled={isSubmitting}
                    isInvalid={!!error}
                    autoFocus
                  />
                  <InputRightElement h="full" w="44px">
                    <IconButton
                      aria-label={showPassword ? "Hide password" : "Show password"}
                      icon={showPassword ? <ViewOffIcon /> : <ViewIcon />}
                      minW="40px"
                      h="40px"
                      variant="ghost"
                      onClick={() => setShowPassword(!showPassword)}
                      color="fg.secondary"
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
            </Box>
          </ScreenSection>
        </VStack>
      </ScreenBody>
      <StickyActionBar
        primaryAction={
          <Button
            variant="brand"
            type="submit"
            form="biometric-setup-password-form"
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
