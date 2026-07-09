import { useRef, useState } from "react";
import {
  Box,
  Button,
  HStack,
  IconButton,
  Input,
  InputGroup,
  InputRightElement,
  Text,
  VStack,
} from "@chakra-ui/react";
import {
  CloseIcon,
  ViewIcon,
  ViewOffIcon,
  WarningTwoIcon,
} from "@chakra-ui/icons";
import { Decorator, useTheme } from "@/theme";
import { useThemedToast } from "@/hooks/useThemedToast";
import {
  createPasskeyUnlockCredential,
  getPasskeyErrorMessage,
  isPasskeyPromptCancelled,
} from "@/lib/passkeyWebAuthn";
import { FingerprintIcon } from "@/components/Settings/icons";

interface BiometricUnlockSetupProps {
  onCancel: () => void;
  onComplete: () => void;
}

function BiometricUnlockSetup({
  onCancel,
  onComplete,
}: BiometricUnlockSetupProps) {
  const { tokens } = useTheme();
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
    <Box
      h="100%"
      bg="surface.base"
      display="flex"
      alignItems="center"
      justifyContent="center"
      py={10}
      px={6}
      position="relative"
    >
      <IconButton
        aria-label="Close biometric setup"
        icon={<CloseIcon />}
        variant="ghost"
        size="sm"
        onClick={onCancel}
        position="absolute"
        top={4}
        right={4}
      />

      <VStack spacing={5} w="full" maxW="300px" mx="auto">
        <HStack spacing={3} w="full" justify="center" align="center">
          <Box
            p={2}
            bg="accent.secondary"
            border="2px solid"
            borderColor="border.default"
            borderRadius={tokens.radii.badge}
            display="flex"
            alignItems="center"
            justifyContent="center"
            flexShrink={0}
          >
            <FingerprintIcon boxSize={5} color="accentFg.secondary" />
          </Box>
          <Text
            fontSize="lg"
            fontWeight="900"
            color="text.primary"
            textTransform="uppercase"
            letterSpacing="tight"
            lineHeight="1.1"
          >
            Set up Biometric Unlock
          </Text>
        </HStack>

        <Box
          w="full"
          p={4}
          bg="surface.raised"
          border="4px solid"
          borderColor="border.default"
          borderRadius="lg"
          boxShadow="cardHover"
          position="relative"
        >
          <Decorator corner="top-right" accent="secondary" />

          <VStack spacing={3} align="stretch">
            <Text fontSize="sm" color="text.secondary" fontWeight="600">
              Enter your master password to add biometric unlock on this device.
            </Text>

            <InputGroup>
              <Input
                ref={inputRef}
                type={showPassword ? "text" : "password"}
                placeholder="Master password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (error) setError("");
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSubmit();
                }}
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
              <Box
                w="full"
                bg="accent.primary"
                border="2px solid"
                borderColor="border.default"
                borderRadius={tokens.radii.card}
                p={2}
              >
                <HStack>
                  <WarningTwoIcon color="accentFg.primary" boxSize={4} />
                  <Text color="accentFg.primary" fontSize="sm" fontWeight="700">
                    {error}
                  </Text>
                </HStack>
              </Box>
            )}

            <Button
              variant="primary"
              onClick={handleSubmit}
              isLoading={isSubmitting}
              loadingText="Setting up..."
            >
              Continue
            </Button>
          </VStack>
        </Box>
      </VStack>
    </Box>
  );
}

export default BiometricUnlockSetup;
