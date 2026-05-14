import { useState, useEffect } from "react";
import {
  Box,
  VStack,
  HStack,
  Heading,
  Text,
  Input,
  Button,
  FormControl,
  FormLabel,
  FormErrorMessage,
  InputGroup,
  InputRightElement,
  IconButton,
  Alert,
  AlertIcon,
  Spacer,
} from "@chakra-ui/react";
import { useThemedToast } from "@/hooks/useThemedToast";
import { ViewIcon, ViewOffIcon, ArrowBackIcon } from "@chakra-ui/icons";
import { saveEncryptedApiKey } from "@/chrome/crypto";
import { resolveNameToAddress, isResolvableName } from "@/lib/ensUtils";
import { isAddress } from "@ethersproject/address";

interface ApiKeySetupProps {
  onComplete: () => void;
  onCancel: () => void;
  isChangingKey?: boolean;
}

function ApiKeySetup({
  onComplete,
  onCancel,
  isChangingKey = false,
}: ApiKeySetupProps) {
  const [apiKey, setApiKey] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [walletAddress, setWalletAddress] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResolvingAddress, setIsResolvingAddress] = useState(false);
  const [hasCachedPassword, setHasCachedPassword] = useState(false);
  const [errors, setErrors] = useState<{
    apiKey?: string;
    walletAddress?: string;
    password?: string;
    confirmPassword?: string;
  }>({});

  const toast = useThemedToast();

  // Check if password is cached and load existing data when changing key
  useEffect(() => {
    if (isChangingKey) {
      // Check if password is cached
      chrome.runtime.sendMessage({ type: "getCachedPassword" }, (response) => {
        setHasCachedPassword(response?.hasCachedPassword || false);
      });

      // Load existing API key if cached
      chrome.runtime.sendMessage({ type: "getCachedApiKey" }, (response) => {
        if (response?.apiKey) {
          setApiKey(response.apiKey);
        }
      });

      // Load existing WalletChan address
      // Always use the resolved address, not displayAddress which could be a PK account's display name
      chrome.storage.sync.get(["address"]).then((data) => {
        if (data.address) {
          setWalletAddress(data.address);
        }
      });
    }
  }, [isChangingKey]);

  // Determine if we need to show password fields
  // Show password fields for initial setup OR when changing key but cache expired
  const needsPassword = !isChangingKey || !hasCachedPassword;

  const resolveAddress = async (input: string): Promise<string | null> => {
    if (isAddress(input)) {
      return input;
    }
    if (isResolvableName(input)) {
      try {
        return await resolveNameToAddress(input);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (/429|too many/i.test(msg)) {
          throw new Error("RPC rate limited (429). Try switching your RPC URL in Settings.");
        }
        throw new Error("Failed to resolve name. Check your RPC URL in Settings.");
      }
    }
    return null;
  };

  const validate = async (): Promise<boolean> => {
    const newErrors: typeof errors = {};

    if (!apiKey.trim()) {
      newErrors.apiKey = "API key is required";
    }

    if (!walletAddress.trim()) {
      newErrors.walletAddress = "Wallet address is required";
    } else {
      setIsResolvingAddress(true);
      try {
        const resolved = await resolveAddress(walletAddress.trim());
        if (!resolved) {
          newErrors.walletAddress = "Invalid address or name";
        }
      } catch (err) {
        newErrors.walletAddress = err instanceof Error ? err.message : "Failed to resolve name";
      } finally {
        setIsResolvingAddress(false);
      }
    }

    // Validate password when needed (initial setup or cache expired)
    if (needsPassword) {
      if (!password) {
        newErrors.password = "Password is required";
      } else if (!isChangingKey && password.length < 6) {
        // Only enforce min length for initial setup
        newErrors.password = "Password must be at least 6 characters";
      }

      if (!isChangingKey && password !== confirmPassword) {
        // Only require confirmation for initial setup
        newErrors.confirmPassword = "Passwords do not match";
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    const isValid = await validate();
    if (!isValid) return;

    setIsSubmitting(true);

    try {
      // Resolve address (in case it's ENS/Basename/WNS)
      const resolvedAddress = await resolveAddress(walletAddress.trim());
      if (!resolvedAddress) {
        setErrors({ walletAddress: "Invalid address or name" });
        setIsSubmitting(false);
        return;
      }

      if (isChangingKey && hasCachedPassword) {
        // Use cached password to save new API key
        const result = await new Promise<{ success: boolean; error?: string }>(
          (resolve) => {
            chrome.runtime.sendMessage(
              { type: "saveApiKeyWithCachedPassword", apiKey: apiKey.trim() },
              resolve,
            );
          },
        );

        if (!result.success) {
          toast({
            title: "Error saving API key",
            description: result.error || "Failed to save API key",
            status: "error",
            duration: 5000,
            isClosable: true,
          });
          setIsSubmitting(false);
          return;
        }
      } else {
        // Initial setup OR changing key with expired cache - save with provided password
        await saveEncryptedApiKey(apiKey.trim(), password);
        // Update the cache with the new credentials
        await chrome.runtime.sendMessage({ type: "unlockWallet", password });
      }

      // Save wallet address
      await chrome.storage.sync.set({
        address: resolvedAddress,
        displayAddress: walletAddress.trim(),
      });

      toast({
        title: "Configuration saved",
        description: "Your API key and wallet address have been saved.",
        status: "success",
        duration: 3000,
        isClosable: true,
      });

      onComplete();
    } catch (error) {
      toast({
        title: "Error saving configuration",
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
        <Heading size="sm" color="text.primary">
          {isChangingKey ? "Change API Key & Address" : "Configure Wallet"}
        </Heading>
        <Spacer />
      </HStack>

      <Text fontSize="sm" color="text.secondary">
        {isChangingKey
          ? "Update your API key and wallet address."
          : "Your API key and wallet address are linked. Both will be used when signing transactions."}
      </Text>

      {/* Inputs intentionally use the Input baseStyle from createTheme.ts —
          surface tokens, focus ring, and invalid state are handled there. */}
      <FormControl isInvalid={!!errors.apiKey}>
        <FormLabel color="text.secondary">Bankr API Key</FormLabel>
        <InputGroup>
          <Input
            type={showApiKey ? "text" : "password"}
            placeholder="Enter your API key"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            pr="3rem"
          />
          <InputRightElement>
            <IconButton
              aria-label={showApiKey ? "Hide API key" : "Show API key"}
              icon={showApiKey ? <ViewOffIcon /> : <ViewIcon />}
              size="sm"
              variant="ghost"
              onClick={() => setShowApiKey(!showApiKey)}
              color="text.secondary"
            />
          </InputRightElement>
        </InputGroup>
        <FormErrorMessage color="chart.negative">{errors.apiKey}</FormErrorMessage>
      </FormControl>

      <FormControl isInvalid={!!errors.walletAddress}>
        <FormLabel color="text.secondary">Wallet Address</FormLabel>
        <Input
          placeholder="0x... or name (e.g., vitalik.eth, name.mega)"
          value={walletAddress}
          onChange={(e) => setWalletAddress(e.target.value)}
        />
        <FormErrorMessage color="chart.negative">
          {errors.walletAddress}
        </FormErrorMessage>
      </FormControl>

      {/* Show password fields when needed */}
      {needsPassword && (
        <>
          <FormControl isInvalid={!!errors.password}>
            <FormLabel color="text.secondary">
              {isChangingKey ? "Current Password" : "Password"}
            </FormLabel>
            <InputGroup>
              <Input
                type={showPassword ? "text" : "password"}
                placeholder={
                  isChangingKey ? "Enter your password" : "Create a password"
                }
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                pr="3rem"
              />
              <InputRightElement>
                <IconButton
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  icon={showPassword ? <ViewOffIcon /> : <ViewIcon />}
                  size="sm"
                  variant="ghost"
                  onClick={() => setShowPassword(!showPassword)}
                  color="text.secondary"
                />
              </InputRightElement>
            </InputGroup>
            <FormErrorMessage color="chart.negative">
              {errors.password}
            </FormErrorMessage>
          </FormControl>

          {/* Only show confirm password for initial setup */}
          {!isChangingKey && (
            <FormControl isInvalid={!!errors.confirmPassword}>
              <FormLabel color="text.secondary">Confirm Password</FormLabel>
              <Input
                type={showPassword ? "text" : "password"}
                placeholder="Confirm your password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
              <FormErrorMessage color="chart.negative">
                {errors.confirmPassword}
              </FormErrorMessage>
            </FormControl>
          )}

          <Alert
            status="warning"
            borderRadius="md"
            fontSize="sm"
            bg="status.warning.bg"
            borderWidth="1px"
            borderColor="status.warning.border"
          >
            <AlertIcon color="status.warning.fg" />
            <Text color="status.warning.fg">
              {isChangingKey
                ? "Enter your password to save changes. Session expired."
                : "Keep your password safe. If you forget it, you will need to reconfigure your API key."}
            </Text>
          </Alert>
        </>
      )}

      <Box display="flex" gap={2} pt={2}>
        <Button variant="outline" flex={1} onClick={onCancel}>
          Cancel
        </Button>
        <Button
          variant="primary"
          flex={1}
          onClick={handleSubmit}
          isLoading={isSubmitting || isResolvingAddress}
          loadingText={isResolvingAddress ? "Resolving..." : "Saving..."}
        >
          Save
        </Button>
      </Box>
    </VStack>
  );
}

export default ApiKeySetup;
