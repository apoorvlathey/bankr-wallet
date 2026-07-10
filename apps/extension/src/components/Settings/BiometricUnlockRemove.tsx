import { useEffect, useRef, useState } from "react";
import {
  Button,
  FormControl,
  FormErrorMessage,
  FormLabel,
  IconButton,
  Input,
  InputGroup,
  InputRightElement,
  Text,
  VStack,
} from "@chakra-ui/react";
import { ViewIcon, ViewOffIcon, WarningIcon } from "@chakra-ui/icons";
import { useThemedToast } from "@/hooks/useThemedToast";
import { SettingsScreenFrame } from "./SettingsScreenFrame";

interface BiometricUnlockRemoveProps {
  onBack: () => void;
  onComplete: () => void;
}

export function BiometricUnlockRemove({
  onBack,
  onComplete,
}: BiometricUnlockRemoveProps) {
  const [masterPassword, setMasterPassword] = useState("");
  const [showMasterPassword, setShowMasterPassword] = useState(false);
  const [removeError, setRemoveError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const masterPasswordInputRef = useRef<HTMLInputElement>(null);
  const toast = useThemedToast();

  useEffect(() => {
    const focusTimer = setTimeout(
      () => masterPasswordInputRef.current?.focus(),
      100,
    );
    return () => clearTimeout(focusTimer);
  }, []);

  const handleRemove = async () => {
    if (!masterPassword) {
      setRemoveError("Master password is required");
      return;
    }

    setIsSubmitting(true);
    setRemoveError("");
    try {
      const response = await new Promise<{ success: boolean; error?: string }>(
        (resolve) => {
          chrome.runtime.sendMessage(
            { type: "removePasskeyUnlock", masterPassword },
            resolve,
          );
        },
      );

      if (!response.success) {
        setRemoveError(response.error || "Failed to remove biometric unlock");
        return;
      }

      toast({
        title: "Biometric unlock removed",
        status: "success",
        duration: 2500,
        isClosable: true,
      });
      onComplete();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SettingsScreenFrame
      title="Remove biometric unlock"
      onBack={onBack}
      primaryAction={
        <Button
          variant="danger"
          onClick={handleRemove}
          isLoading={isSubmitting}
        >
          Remove biometric unlock
        </Button>
      }
      secondaryAction={
        <Button variant="secondary" onClick={onBack}>
          Cancel
        </Button>
      }
    >
      <VStack spacing={6} align="stretch">
        <VStack align="stretch" spacing={1}>
          <Text fontSize="lg" fontWeight="600">
            Confirm with your master password
          </Text>
          <Text fontSize="sm" color="fg.secondary" lineHeight="1.5">
            This removes the biometric credential from this browser. Your
            wallet and accounts are not deleted.
          </Text>
        </VStack>

        <FormControl isInvalid={!!removeError}>
          <FormLabel>Master password</FormLabel>
          <InputGroup>
            <Input
              ref={masterPasswordInputRef}
              type={showMasterPassword ? "text" : "password"}
              placeholder="Enter master password"
              value={masterPassword}
              onChange={(event) => {
                setMasterPassword(event.target.value);
                setRemoveError("");
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") void handleRemove();
              }}
              pr="3rem"
              autoComplete="current-password"
            />
            <InputRightElement w="44px" h="44px">
              <IconButton
                aria-label={showMasterPassword ? "Hide password" : "Show password"}
                icon={showMasterPassword ? <ViewOffIcon /> : <ViewIcon />}
                minW="40px"
                h="40px"
                variant="ghost"
                onClick={() => setShowMasterPassword((visible) => !visible)}
                color="fg.secondary"
              />
            </InputRightElement>
          </InputGroup>
          <FormErrorMessage>{removeError}</FormErrorMessage>
        </FormControl>

        <VStack
          align="stretch"
          spacing={1}
          bg="status.warning.tint"
          color="status.warning.fg"
          border="1px solid"
          borderColor="status.warning.border"
          borderRadius="md"
          p={3}
        >
          <Text fontSize="sm" fontWeight="600">
            <WarningIcon mr={2} />Password unlock remains available
          </Text>
          <Text fontSize="sm" lineHeight="1.5">
            After removal, this device returns to password-only unlock.
          </Text>
        </VStack>
      </VStack>
    </SettingsScreenFrame>
  );
}
