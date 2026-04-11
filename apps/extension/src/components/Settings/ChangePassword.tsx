import { useState, useEffect, useRef } from "react";
import {
  Box,
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
  Spacer,
} from "@chakra-ui/react";
import { useThemedToast } from "@/hooks/useThemedToast";
import { ViewIcon, ViewOffIcon, ArrowBackIcon, InfoIcon } from "@chakra-ui/icons";
import { ThemedCard } from "@/theme";

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
  const [errors, setErrors] = useState<{
    newPassword?: string;
    confirmPassword?: string;
  }>({});

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
    <VStack spacing={4} align="stretch">
      {/* Header */}
      <HStack>
        <IconButton
          aria-label="Back"
          icon={<ArrowBackIcon />}
          variant="ghost"
          size="sm"
          onClick={onCancel}
        />
        <Text fontSize="lg" fontWeight="900" color="text.primary" textTransform="uppercase" letterSpacing="tight">
          Change Password
        </Text>
        <Spacer />
      </HStack>

      <Text fontSize="sm" color="text.secondary" fontWeight="500">
        Choose a new password to secure your wallet.
      </Text>

      <FormControl isInvalid={!!errors.newPassword}>
        <FormLabel color="text.secondary" fontWeight="700" textTransform="uppercase" fontSize="xs">
          New Password
        </FormLabel>
        <InputGroup>
          <Input
            type={showNewPassword ? "text" : "password"}
            placeholder="Enter new password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            pr="3rem"
            autoFocus
          />
          <InputRightElement>
            <IconButton
              aria-label={showNewPassword ? "Hide" : "Show"}
              icon={showNewPassword ? <ViewOffIcon /> : <ViewIcon />}
              size="sm"
              variant="ghost"
              onClick={() => setShowNewPassword(!showNewPassword)}
              color="text.secondary"
              tabIndex={-1}
            />
          </InputRightElement>
        </InputGroup>
        <FormErrorMessage color="accent.primary" fontWeight="700">
          {errors.newPassword}
        </FormErrorMessage>
      </FormControl>

      <FormControl isInvalid={!!errors.confirmPassword}>
        <FormLabel color="text.secondary" fontWeight="700" textTransform="uppercase" fontSize="xs">
          Confirm New Password
        </FormLabel>
        <Input
          type={showNewPassword ? "text" : "password"}
          placeholder="Confirm new password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
        />
        <FormErrorMessage color="accent.primary" fontWeight="700">
          {errors.confirmPassword}
        </FormErrorMessage>
      </FormControl>

      <ThemedCard
        weight="medium"
        p={3}
        bg="accent.secondary"
        borderColor="border.default"
      >
        <HStack spacing={2}>
          <Box p={1} bg="border.default">
            <InfoIcon color="surface.raised" boxSize={4} />
          </Box>
          <Text color="accentFg.secondary" fontSize="sm" fontWeight="700">
            You will need to unlock again after changing your password.
          </Text>
        </HStack>
      </ThemedCard>

      <Box display="flex" gap={2} pt={2}>
        <Button variant="secondary" onClick={onCancel} minW="100px">
          Cancel
        </Button>
        <Button
          variant="primary"
          flex={1}
          onClick={handleSubmit}
          isLoading={isSubmitting}
        >
          Change Password
        </Button>
      </Box>
    </VStack>
  );
}

export default ChangePassword;
