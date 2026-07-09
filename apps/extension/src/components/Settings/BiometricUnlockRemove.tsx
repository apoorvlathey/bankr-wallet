import { useEffect, useRef, useState } from "react";
import {
  Box,
  Button,
  FormControl,
  FormLabel,
  HStack,
  IconButton,
  Input,
  InputGroup,
  InputRightElement,
  Spacer,
  Text,
  VStack,
} from "@chakra-ui/react";
import { ArrowBackIcon, ViewIcon, ViewOffIcon } from "@chakra-ui/icons";
import { useThemedToast } from "@/hooks/useThemedToast";
import { isDarkThemeId, useTheme } from "@/theme";

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
  const { themeId } = useTheme();
  const isDarkTheme = isDarkThemeId(themeId);

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
    <VStack spacing={4} align="stretch">
      <HStack>
        <IconButton
          aria-label="Back"
          icon={<ArrowBackIcon />}
          variant="ghost"
          size="sm"
          onClick={onBack}
        />
        <Text fontSize="lg" fontWeight="900" color="text.primary" textTransform="uppercase" letterSpacing="tight">
          Remove
        </Text>
        <Spacer />
      </HStack>

      <FormControl isInvalid={!!removeError}>
        <FormLabel color="text.secondary" fontWeight="700" textTransform="uppercase" fontSize="xs">
          Master Password
        </FormLabel>
        <InputGroup>
          <Input
            ref={masterPasswordInputRef}
            type={showMasterPassword ? "text" : "password"}
            placeholder="Verify to remove"
            value={masterPassword}
            onChange={(event) => {
              setMasterPassword(event.target.value);
              setRemoveError("");
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") void handleRemove();
            }}
            pr="3rem"
          />
          <InputRightElement>
            <IconButton
              aria-label={showMasterPassword ? "Hide" : "Show"}
              icon={showMasterPassword ? <ViewOffIcon /> : <ViewIcon />}
              size="sm"
              variant="ghost"
              onClick={() => setShowMasterPassword((visible) => !visible)}
              color="text.secondary"
              tabIndex={-1}
            />
          </InputRightElement>
        </InputGroup>
        {removeError && (
          <Text color="chart.negative" fontSize="sm" fontWeight="700" mt={2}>
            {removeError}
          </Text>
        )}
      </FormControl>

      <Box
        bg="accent.primary"
        border="2px solid"
        borderColor="border.default"
        borderRadius={isDarkTheme ? "md" : undefined}
        p={2}
      >
        <Text color="accentFg.primary" fontSize="xs" fontWeight="700">
          This device will go back to password unlock only.
        </Text>
      </Box>

      <HStack spacing={2} pt={1}>
        <Button variant="secondary" onClick={onBack} size="sm">
          Cancel
        </Button>
        <Button
          variant="danger"
          flex={1}
          size="sm"
          onClick={handleRemove}
          isLoading={isSubmitting}
        >
          Remove
        </Button>
      </HStack>
    </VStack>
  );
}
