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
  Badge,
} from "@chakra-ui/react";
import { useThemedToast } from "@/hooks/useThemedToast";
import { ViewIcon, ViewOffIcon, ArrowBackIcon, WarningIcon, LockIcon, CheckIcon, CloseIcon } from "@chakra-ui/icons";
import { isDarkThemeId, ThemedCard, useTheme } from "@/theme";

// Simple permission badge component
function PermissionBadge({ label, allowed }: { label: string; allowed: boolean }) {
  return (
    <HStack
      spacing={1}
      bg={allowed ? "status.success.bg" : "status.error.bg"}
      border="2px solid"
      borderColor={allowed ? "status.success.border" : "status.error.border"}
      borderRadius="md"
      px={2}
      py={1}
    >
      {allowed ? (
        <CheckIcon boxSize={3} color="status.success.fg" />
      ) : (
        <CloseIcon boxSize={2.5} color="status.error.fg" />
      )}
      <Text
        fontSize="xs"
        fontWeight="700"
        color={allowed ? "status.success.fg" : "status.error.fg"}
      >
        {label}
      </Text>
    </HStack>
  );
}

interface AgentPasswordSettingsProps {
  onComplete: () => void;
  onCancel: () => void;
  onSessionExpired?: () => void;
}

type ViewMode = "status" | "set" | "remove";

function AgentPasswordSettings({
  onComplete,
  onCancel,
  onSessionExpired,
}: AgentPasswordSettingsProps) {
  const [viewMode, setViewMode] = useState<ViewMode>("status");
  const [isAgentEnabled, setIsAgentEnabled] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [passwordType, setPasswordType] = useState<"master" | "agent" | null>(null);

  // Form states for setting agent password
  const [agentPassword, setAgentPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<{
    agentPassword?: string;
    confirmPassword?: string;
  }>({});

  // Form states for removing agent password
  const [masterPassword, setMasterPassword] = useState("");
  const [showMasterPassword, setShowMasterPassword] = useState(false);
  const [removeError, setRemoveError] = useState("");

  const toast = useThemedToast();
  const { themeId } = useTheme();
  const isDarkTheme = isDarkThemeId(themeId);
  const passwordInputRef = useRef<HTMLInputElement>(null);
  const masterPasswordInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadStatus();
  }, []);

  // Auto-focus password input when entering set or remove mode
  useEffect(() => {
    if (viewMode === "set") {
      setTimeout(() => passwordInputRef.current?.focus(), 100);
    } else if (viewMode === "remove") {
      setTimeout(() => masterPasswordInputRef.current?.focus(), 100);
    }
  }, [viewMode]);

  const loadStatus = async () => {
    setIsLoading(true);
    try {
      // Check if agent password is enabled
      const enabledResponse = await new Promise<{ enabled: boolean }>((resolve) => {
        chrome.runtime.sendMessage({ type: "isAgentPasswordEnabled" }, resolve);
      });
      setIsAgentEnabled(enabledResponse.enabled);

      // Get current password type
      const typeResponse = await new Promise<{ passwordType: "master" | "agent" | null }>((resolve) => {
        chrome.runtime.sendMessage({ type: "getPasswordType" }, resolve);
      });
      setPasswordType(typeResponse.passwordType);
    } finally {
      setIsLoading(false);
    }
  };

  const validateSetPassword = (): boolean => {
    const newErrors: typeof errors = {};

    if (!agentPassword) {
      newErrors.agentPassword = "Agent password is required";
    } else if (agentPassword.length < 6) {
      newErrors.agentPassword = "Password must be at least 6 characters";
    }

    if (agentPassword !== confirmPassword) {
      newErrors.confirmPassword = "Passwords do not match";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSetAgentPassword = async () => {
    if (!validateSetPassword()) return;

    setIsSubmitting(true);
    try {
      const response = await new Promise<{ success: boolean; error?: string }>((resolve) => {
        chrome.runtime.sendMessage(
          { type: "setAgentPassword", agentPassword },
          resolve
        );
      });

      if (!response.success) {
        if (response.error?.includes("Must be unlocked with master password")) {
          if (onSessionExpired) {
            onSessionExpired();
            return;
          }
          toast({
            title: "Master password required",
            description: "You must be unlocked with master password to set agent password",
            status: "error",
            duration: 5000,
            isClosable: true,
          });
          return;
        }
        toast({
          title: "Error setting agent password",
          description: response.error || "Unknown error",
          status: "error",
          duration: 5000,
          isClosable: true,
        });
        return;
      }

      toast({
        title: "Agent password set",
        description: "AI agents can now unlock your wallet with the agent password",
        status: "success",
        duration: 3000,
        isClosable: true,
      });

      // Reset form and go back to settings (onComplete refreshes parent state)
      setAgentPassword("");
      setConfirmPassword("");
      onComplete();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRemoveAgentPassword = async () => {
    if (!masterPassword) {
      setRemoveError("Master password is required");
      return;
    }

    setIsSubmitting(true);
    setRemoveError("");
    try {
      const response = await new Promise<{ success: boolean; error?: string }>((resolve) => {
        chrome.runtime.sendMessage(
          { type: "removeAgentPassword", masterPassword },
          resolve
        );
      });

      if (!response.success) {
        setRemoveError(response.error || "Failed to remove agent password");
        return;
      }

      toast({
        title: "Agent password removed",
        description: "Only master password can now unlock the wallet",
        status: "success",
        duration: 3000,
        isClosable: true,
      });

      // Reset form and go back to settings (onComplete refreshes parent state)
      setMasterPassword("");
      onComplete();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBack = () => {
    if (viewMode === "status") {
      onCancel();
    } else {
      // Reset form states
      setAgentPassword("");
      setConfirmPassword("");
      setMasterPassword("");
      setErrors({});
      setRemoveError("");
      setViewMode("status");
    }
  };

  // Check if unlocked with agent password (can't manage agent password)
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
            Agent Password
          </Text>
          <Spacer />
        </HStack>
        <Text color="text.secondary" fontWeight="500">Loading...</Text>
      </VStack>
    );
  }

  // Status view
  if (viewMode === "status") {
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
            Agent Password
          </Text>
          <Spacer />
          <Badge
            bg={isAgentEnabled ? "accent.secondary" : "surface.sunken"}
            color={isAgentEnabled ? "accentFg.secondary" : "fg.muted"}
            border="2px solid"
            borderColor="border.default"
            fontSize="xs"
            fontWeight="700"
            px={2}
          >
            {isAgentEnabled ? "ON" : "OFF"}
          </Badge>
        </HStack>

        {/* Warning for agent session - simplified */}
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

        {/* Main status card - more visual */}
        <ThemedCard weight="medium" p={0} position="relative" overflow="hidden">
          {/* Geometric accent */}
          <Box
            position="absolute"
            top={0}
            right={0}
            w="60px"
            h="60px"
            bg={isAgentEnabled ? "accent.secondary" : "surface.sunken"}
            clipPath="polygon(100% 0, 0 0, 100% 100%)"
          />

          <VStack spacing={4} align="stretch" p={4}>
            {/* Status row */}
            <HStack spacing={3}>
              <Box
                p={3}
                bg={isAgentEnabled ? "accent.secondary" : "surface.sunken"}
                border="2px solid"
                borderColor="border.default"
                borderRadius="md"
              >
                <LockIcon
                  boxSize={5}
                  color={isAgentEnabled ? "accentFg.secondary" : "fg.muted"}
                />
              </Box>
              <Box flex={1}>
                <Text fontWeight="800" color="text.primary" textTransform="uppercase" fontSize="sm">
                  {isAgentEnabled ? "Configured" : "Not Set"}
                </Text>
                <Text fontSize="xs" color="text.secondary" fontWeight="500">
                  {isAgentEnabled
                    ? "AI agents can unlock wallet"
                    : "Only master password works"}
                </Text>
              </Box>
            </HStack>

            {/* Permissions visual */}
            <Box borderTop="2px solid" borderColor="border.subtle" pt={3}>
              <Text fontSize="xs" fontWeight="700" color="text.secondary" textTransform="uppercase" mb={2}>
                Agent Can
              </Text>
              <HStack spacing={2} flexWrap="wrap">
                <PermissionBadge label="Sign Txns" allowed />
                <PermissionBadge label="Sign Messages" allowed />
                <PermissionBadge label="Reveal Keys" allowed={false} />
              </HStack>
            </Box>

            {/* Action button */}
            {!isAgentSession && (
              <Button
                variant={isAgentEnabled ? "danger" : "primary"}
                size="sm"
                w="full"
                onClick={() => setViewMode(isAgentEnabled ? "remove" : "set")}
              >
                {isAgentEnabled ? "Remove" : "Enable"}
              </Button>
            )}
          </VStack>
        </ThemedCard>
      </VStack>
    );
  }

  // Set agent password view
  if (viewMode === "set") {
    return (
      <VStack spacing={4} align="stretch">
        <HStack>
          <IconButton
            aria-label="Back"
            icon={<ArrowBackIcon />}
            variant="ghost"
            size="sm"
            onClick={handleBack}
          />
          <Text fontSize="lg" fontWeight="900" color="text.primary" textTransform="uppercase" letterSpacing="tight">
            Set Agent Password
          </Text>
          <Spacer />
        </HStack>

        <FormControl isInvalid={!!errors.agentPassword}>
          <FormLabel color="text.secondary" fontWeight="700" textTransform="uppercase" fontSize="xs">
            New Password
          </FormLabel>
          <InputGroup>
            <Input
              ref={passwordInputRef}
              type={showPassword ? "text" : "password"}
              placeholder="Min 6 characters"
              value={agentPassword}
              onChange={(e) => {
                setAgentPassword(e.target.value);
                setErrors({});
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSetAgentPassword();
              }}
              pr="3rem"
            />
            <InputRightElement>
              <IconButton
                aria-label={showPassword ? "Hide" : "Show"}
                icon={showPassword ? <ViewOffIcon /> : <ViewIcon />}
                size="sm"
                variant="ghost"
                onClick={() => setShowPassword(!showPassword)}
                color="text.secondary"
                tabIndex={-1}
              />
            </InputRightElement>
          </InputGroup>
          <FormErrorMessage color="accent.primary" fontWeight="700">
            {errors.agentPassword}
          </FormErrorMessage>
        </FormControl>

        <FormControl isInvalid={!!errors.confirmPassword}>
          <FormLabel color="text.secondary" fontWeight="700" textTransform="uppercase" fontSize="xs">
            Confirm
          </FormLabel>
          <Input
            type={showPassword ? "text" : "password"}
            placeholder="Re-enter password"
            value={confirmPassword}
            onChange={(e) => {
              setConfirmPassword(e.target.value);
              setErrors({});
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSetAgentPassword();
            }}
          />
          <FormErrorMessage color="accent.primary" fontWeight="700">
            {errors.confirmPassword}
          </FormErrorMessage>
        </FormControl>

        <Box
          bg="accent.highlight"
          border="2px solid"
          borderColor="border.default"
          borderRadius={isDarkTheme ? "md" : undefined}
          p={2}
        >
          <Text color="accentFg.highlight" fontSize="xs" fontWeight="700">
            Store securely — needed to unlock wallet
          </Text>
        </Box>

        <HStack spacing={2} pt={1}>
          <Button variant="secondary" onClick={handleBack} size="sm">
            Cancel
          </Button>
          <Button
            variant="primary"
            flex={1}
            size="sm"
            onClick={handleSetAgentPassword}
            isLoading={isSubmitting}
          >
            Enable
          </Button>
        </HStack>
      </VStack>
    );
  }

  // Remove agent password view
  if (viewMode === "remove") {
    return (
      <VStack spacing={4} align="stretch">
        <HStack>
          <IconButton
            aria-label="Back"
            icon={<ArrowBackIcon />}
            variant="ghost"
            size="sm"
            onClick={handleBack}
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
              onChange={(e) => {
                setMasterPassword(e.target.value);
                setRemoveError("");
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleRemoveAgentPassword();
              }}
              pr="3rem"
            />
            <InputRightElement>
              <IconButton
                aria-label={showMasterPassword ? "Hide" : "Show"}
                icon={showMasterPassword ? <ViewOffIcon /> : <ViewIcon />}
                size="sm"
                variant="ghost"
                onClick={() => setShowMasterPassword(!showMasterPassword)}
                color="text.secondary"
                tabIndex={-1}
              />
            </InputRightElement>
          </InputGroup>
          {removeError && (
            <Text color="accent.primary" fontSize="sm" fontWeight="700" mt={2}>
              {removeError}
            </Text>
          )}
        </FormControl>

        <Box
          bg="accent.primary"
          border="2px solid"
          borderColor="border.default"
          p={2}
        >
          <Text color="accentFg.primary" fontSize="xs" fontWeight="700">
            Only master password will work after removal
          </Text>
        </Box>

        <HStack spacing={2} pt={1}>
          <Button variant="secondary" onClick={handleBack} size="sm">
            Cancel
          </Button>
          <Button
            variant="danger"
            flex={1}
            size="sm"
            onClick={handleRemoveAgentPassword}
            isLoading={isSubmitting}
          >
            Remove
          </Button>
        </HStack>
      </VStack>
    );
  }

  return null;
}

export default AgentPasswordSettings;
