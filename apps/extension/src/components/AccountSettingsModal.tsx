import { useState, useEffect, memo } from "react";
import {
  Box,
  VStack,
  HStack,
  Text,
  Input,
  Button,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  FormControl,
  FormLabel,
  FormErrorMessage,
  InputGroup,
  InputRightElement,
  IconButton,
  Alert,
  AlertIcon,
  Tooltip,
} from "@chakra-ui/react";
import {
  SettingsIcon,
  DeleteIcon,
  ViewIcon,
  WarningTwoIcon,
  EditIcon,
  ViewOffIcon,
  ArrowBackIcon,
  RepeatIcon,
} from "@chakra-ui/icons";
import { useBauhausToast } from "@/hooks/useBauhausToast";
import type { Account, PasswordType, SeedGroup } from "@/chrome/types";
import { resolveNameToAddress, isResolvableName } from "@/lib/ensUtils";
import { isAddress } from "@ethersproject/address";
import { resolveAndCacheIdentity } from "@/lib/ensIdentityCache";

interface AccountSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  account: Account | null;
  onRevealPrivateKey: (account: Account) => void;
  onRevealSeedPhrase: (account: Account) => void;
  onAccountUpdated: () => void;
  totalAccounts: number;
}

type ModalView = "settings" | "confirmDelete" | "changeApiKey";

function AccountSettingsModal({
  isOpen,
  onClose,
  account,
  onRevealPrivateKey,
  onRevealSeedPhrase,
  onAccountUpdated,
  totalAccounts,
}: AccountSettingsModalProps) {
  const toast = useBauhausToast();
  const [view, setView] = useState<ModalView>("settings");
  const [displayName, setDisplayName] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // ENS refresh state
  const [isRefreshingEns, setIsRefreshingEns] = useState(false);

  // Seed group rename states
  const [seedGroupName, setSeedGroupName] = useState("");
  const [originalSeedGroupName, setOriginalSeedGroupName] = useState("");
  const [isSavingSeedGroup, setIsSavingSeedGroup] = useState(false);

  // API Key change states
  const [apiKey, setApiKey] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [walletAddress, setWalletAddress] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmittingApiKey, setIsSubmittingApiKey] = useState(false);
  const [isResolvingAddress, setIsResolvingAddress] = useState(false);
  const [hasCachedPassword, setHasCachedPassword] = useState(false);
  const [passwordType, setPasswordType] = useState<PasswordType | null>(null);
  const [apiKeyErrors, setApiKeyErrors] = useState<{
    apiKey?: string;
    walletAddress?: string;
    password?: string;
  }>({});

  // Reset state when modal opens/account changes
  useEffect(() => {
    if (isOpen && account) {
      setDisplayName(account.displayName || "");
      setView("settings");
      // Reset API key form states
      setApiKey("");
      setShowApiKey(false);
      setWalletAddress("");
      setPassword("");
      setShowPassword(false);
      setApiKeyErrors({});
      // Reset seed group states
      setSeedGroupName("");
      setOriginalSeedGroupName("");

      // Fetch seed group name for seed phrase accounts
      if (account.type === "seedPhrase") {
        chrome.runtime.sendMessage(
          { type: "getSeedGroups" },
          (groups: SeedGroup[] | null) => {
            const group = groups?.find((g) => g.id === account.seedGroupId);
            if (group) {
              setSeedGroupName(group.name);
              setOriginalSeedGroupName(group.name);
            }
          },
        );
      }
    }
  }, [isOpen, account]);

  // Load data when switching to changeApiKey view
  useEffect(() => {
    if (view === "changeApiKey" && account?.type === "bankr") {
      // Check if password is cached
      chrome.runtime.sendMessage({ type: "getCachedPassword" }, (response) => {
        setHasCachedPassword(response?.hasCachedPassword || false);
      });

      // Check password type
      chrome.runtime.sendMessage(
        { type: "getPasswordType" },
        (response: { passwordType: PasswordType | null }) => {
          setPasswordType(response.passwordType);
        },
      );

      // Load existing API key if cached
      chrome.runtime.sendMessage({ type: "getCachedApiKey" }, (response) => {
        if (response?.apiKey) {
          setApiKey(response.apiKey);
        }
      });

      // Load existing WalletChan address from the account object
      setWalletAddress(account.address);
    }
  }, [view, account]);

  const handleClose = () => {
    setView("settings");
    setDisplayName("");
    setIsSaving(false);
    setIsDeleting(false);
    // Reset API key form states
    setApiKey("");
    setShowApiKey(false);
    setWalletAddress("");
    setPassword("");
    setShowPassword(false);
    setApiKeyErrors({});
    setHasCachedPassword(false);
    setPasswordType(null);
    setSeedGroupName("");
    setOriginalSeedGroupName("");
    setIsSavingSeedGroup(false);
    setIsRefreshingEns(false);
    onClose();
  };

  // API Key change helpers
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

  const needsPassword = !hasCachedPassword;

  const validateApiKeyForm = async (): Promise<boolean> => {
    const newErrors: typeof apiKeyErrors = {};

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

    if (needsPassword && !password) {
      newErrors.password = "Password is required";
    }

    setApiKeyErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSaveApiKey = async () => {
    const isValid = await validateApiKeyForm();
    if (!isValid) return;

    setIsSubmittingApiKey(true);

    try {
      const resolvedAddress = await resolveAddress(walletAddress.trim());
      if (!resolvedAddress) {
        setApiKeyErrors({ walletAddress: "Invalid address or name" });
        setIsSubmittingApiKey(false);
        return;
      }

      if (hasCachedPassword) {
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
          setIsSubmittingApiKey(false);
          return;
        }
      } else {
        // Unlock first to establish the session
        const unlockResult = await new Promise<{
          success: boolean;
          error?: string;
        }>((resolve) => {
          chrome.runtime.sendMessage(
            { type: "unlockWallet", password },
            resolve,
          );
        });
        if (!unlockResult.success) {
          toast({
            title: "Invalid password",
            description: unlockResult.error || "Failed to unlock wallet",
            status: "error",
            duration: 5000,
            isClosable: true,
          });
          setIsSubmittingApiKey(false);
          return;
        }
        // Now save API key using the background handler (handles vault key vs legacy)
        const saveResult = await new Promise<{
          success: boolean;
          error?: string;
        }>((resolve) => {
          chrome.runtime.sendMessage(
            { type: "saveApiKeyWithCachedPassword", apiKey: apiKey.trim() },
            resolve,
          );
        });
        if (!saveResult.success) {
          toast({
            title: "Error saving API key",
            description: saveResult.error || "Failed to save API key",
            status: "error",
            duration: 5000,
            isClosable: true,
          });
          setIsSubmittingApiKey(false);
          return;
        }
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

      onAccountUpdated();
      setView("settings");
    } catch (error) {
      toast({
        title: "Error saving configuration",
        description: error instanceof Error ? error.message : "Unknown error",
        status: "error",
        duration: 5000,
        isClosable: true,
      });
    } finally {
      setIsSubmittingApiKey(false);
    }
  };

  const handleSaveDisplayName = async () => {
    if (!account) return;

    const trimmedName = displayName.trim();
    if (trimmedName === (account.displayName || "")) {
      // No change
      return;
    }

    setIsSaving(true);

    chrome.runtime.sendMessage(
      {
        type: "updateAccountDisplayName",
        accountId: account.id,
        displayName: trimmedName || undefined,
      },
      (result: { success: boolean; error?: string }) => {
        setIsSaving(false);
        if (result.success) {
          toast({
            title: "Display name updated",
            status: "success",
            duration: 2000,
          });
          onAccountUpdated();
        } else {
          toast({
            title: "Failed to update",
            description: result.error,
            status: "error",
            duration: 3000,
          });
        }
      },
    );
  };

  const handleSaveSeedGroupName = async () => {
    if (!account || account.type !== "seedPhrase") return;

    const trimmedName = seedGroupName.trim();
    if (!trimmedName || trimmedName === originalSeedGroupName) return;

    setIsSavingSeedGroup(true);

    chrome.runtime.sendMessage(
      {
        type: "renameSeedGroup",
        seedGroupId: account.seedGroupId,
        name: trimmedName,
      },
      (result: { success: boolean; error?: string }) => {
        setIsSavingSeedGroup(false);
        if (result.success) {
          setOriginalSeedGroupName(trimmedName);
          toast({
            title: "Seed group renamed",
            status: "success",
            duration: 2000,
          });
          onAccountUpdated();
        } else {
          toast({
            title: "Failed to rename",
            description: result.error,
            status: "error",
            duration: 3000,
          });
        }
      },
    );
  };

  const handleRefreshEns = async () => {
    if (!account) return;
    setIsRefreshingEns(true);
    try {
      const result = await resolveAndCacheIdentity(account.address);
      if (result.name) {
        toast({
          title: "ENS data refreshed",
          description: result.name,
          status: "success",
          duration: 3000,
        });
      } else {
        toast({
          title: "No ENS name found",
          description: "This address has no ENS or Basename",
          status: "info",
          duration: 3000,
        });
      }
      onAccountUpdated();
    } catch {
      toast({
        title: "Failed to refresh ENS data",
        status: "error",
        duration: 3000,
      });
    } finally {
      setIsRefreshingEns(false);
    }
  };

  const handleRevealKey = () => {
    if (account) {
      handleClose();
      onRevealPrivateKey(account);
    }
  };

  const handleRevealSeedPhrase = () => {
    if (account) {
      handleClose();
      onRevealSeedPhrase(account);
    }
  };

  const handleDeleteAccount = async () => {
    if (!account) return;

    setIsDeleting(true);

    chrome.runtime.sendMessage(
      { type: "removeAccount", accountId: account.id },
      (result: { success: boolean; error?: string }) => {
        setIsDeleting(false);
        if (result.success) {
          toast({
            title: "Account removed",
            status: "success",
            duration: 2000,
          });
          handleClose();
          onAccountUpdated();
        } else {
          toast({
            title: "Failed to remove account",
            description: result.error,
            status: "error",
            duration: 3000,
          });
        }
      },
    );
  };

  if (!account) return null;

  // Change API Key view (for Bankr accounts)
  if (view === "changeApiKey") {
    const isAgentSession = passwordType === "agent";

    return (
      <Modal isOpen={isOpen} onClose={handleClose} isCentered>
        <ModalOverlay bg="blackAlpha.700" />
        <ModalContent
          bg="bauhaus.white"
          border="4px solid"
          borderColor="bauhaus.black"
          borderRadius="0"
          boxShadow="8px 8px 0px 0px #121212"
          mx={4}
        >
          <ModalHeader
            color="text.primary"
            fontSize="md"
            pb={2}
            textTransform="uppercase"
            letterSpacing="wider"
          >
            <HStack>
              <IconButton
                aria-label="Back"
                icon={<ArrowBackIcon />}
                variant="ghost"
                size="sm"
                onClick={() => setView("settings")}
              />
              <Text>Change API Key & Address</Text>
            </HStack>
          </ModalHeader>

          <ModalBody>
            {isAgentSession ? (
              <VStack spacing={3} align="stretch">
                <Box
                  w="full"
                  p={3}
                  bg="bauhaus.yellow"
                  border="2px solid"
                  borderColor="bauhaus.black"
                >
                  <HStack spacing={2}>
                    <WarningTwoIcon color="bauhaus.black" />
                    <Text color="bauhaus.black" fontSize="sm" fontWeight="700">
                      Unlock with master password to access
                    </Text>
                  </HStack>
                </Box>
                <Text color="text.secondary" fontSize="sm" fontWeight="500">
                  API key changes are only available when unlocked with your
                  master password.
                </Text>
              </VStack>
            ) : (
              <VStack spacing={4} align="stretch">
                <Text fontSize="sm" color="text.secondary">
                  Update your API key and wallet address.
                </Text>

                <FormControl isInvalid={!!apiKeyErrors.apiKey}>
                  <FormLabel
                    fontSize="xs"
                    fontWeight="700"
                    color="text.primary"
                    textTransform="uppercase"
                  >
                    Bankr API Key
                  </FormLabel>
                  <InputGroup>
                    <Input
                      type={showApiKey ? "text" : "password"}
                      placeholder="Enter your API key"
                      value={apiKey}
                      onChange={(e) => {
                        setApiKey(e.target.value);
                        setApiKeyErrors({});
                      }}
                      pr="3rem"
                      bg="white"
                      border="3px solid"
                      borderColor={
                        apiKeyErrors.apiKey ? "bauhaus.red" : "bauhaus.black"
                      }
                      borderRadius="0"
                      _focus={{
                        borderColor: apiKeyErrors.apiKey
                          ? "bauhaus.red"
                          : "bauhaus.blue",
                        boxShadow: "none",
                      }}
                    />
                    <InputRightElement>
                      <IconButton
                        aria-label={showApiKey ? "Hide" : "Show"}
                        icon={showApiKey ? <ViewOffIcon /> : <ViewIcon />}
                        size="sm"
                        variant="ghost"
                        onClick={() => setShowApiKey(!showApiKey)}
                        color="text.secondary"
                        tabIndex={-1}
                      />
                    </InputRightElement>
                  </InputGroup>
                  <FormErrorMessage color="bauhaus.red" fontWeight="700">
                    {apiKeyErrors.apiKey}
                  </FormErrorMessage>
                </FormControl>

                <FormControl isInvalid={!!apiKeyErrors.walletAddress}>
                  <FormLabel
                    fontSize="xs"
                    fontWeight="700"
                    color="text.primary"
                    textTransform="uppercase"
                  >
                    Wallet Address
                  </FormLabel>
                  <Input
                    placeholder="0x... or name (e.g., vitalik.eth, name.mega)"
                    value={walletAddress}
                    onChange={(e) => {
                      setWalletAddress(e.target.value);
                      setApiKeyErrors({});
                    }}
                    bg="white"
                    border="3px solid"
                    borderColor={
                      apiKeyErrors.walletAddress
                        ? "bauhaus.red"
                        : "bauhaus.black"
                    }
                    borderRadius="0"
                    _focus={{
                      borderColor: apiKeyErrors.walletAddress
                        ? "bauhaus.red"
                        : "bauhaus.blue",
                      boxShadow: "none",
                    }}
                  />
                  <FormErrorMessage color="bauhaus.red" fontWeight="700">
                    {apiKeyErrors.walletAddress}
                  </FormErrorMessage>
                </FormControl>

                {needsPassword && (
                  <>
                    <FormControl isInvalid={!!apiKeyErrors.password}>
                      <FormLabel
                        fontSize="xs"
                        fontWeight="700"
                        color="text.primary"
                        textTransform="uppercase"
                      >
                        Master Password
                      </FormLabel>
                      <InputGroup>
                        <Input
                          type={showPassword ? "text" : "password"}
                          placeholder="Enter your password"
                          value={password}
                          onChange={(e) => {
                            setPassword(e.target.value);
                            setApiKeyErrors({});
                          }}
                          pr="3rem"
                          bg="white"
                          border="3px solid"
                          borderColor={
                            apiKeyErrors.password
                              ? "bauhaus.red"
                              : "bauhaus.black"
                          }
                          borderRadius="0"
                          _focus={{
                            borderColor: apiKeyErrors.password
                              ? "bauhaus.red"
                              : "bauhaus.blue",
                            boxShadow: "none",
                          }}
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
                      <FormErrorMessage color="bauhaus.red" fontWeight="700">
                        {apiKeyErrors.password}
                      </FormErrorMessage>
                    </FormControl>

                    <Alert
                      status="warning"
                      bg="bauhaus.yellow"
                      border="2px solid"
                      borderColor="bauhaus.black"
                      borderRadius="0"
                      fontSize="sm"
                    >
                      <AlertIcon color="bauhaus.black" />
                      <Text color="bauhaus.black" fontWeight="600">
                        Enter your password to save changes. Session expired.
                      </Text>
                    </Alert>
                  </>
                )}
              </VStack>
            )}
          </ModalBody>

          <ModalFooter gap={2}>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setView("settings")}
            >
              Cancel
            </Button>
            {!isAgentSession && (
              <Button
                variant="primary"
                size="sm"
                onClick={handleSaveApiKey}
                isLoading={isSubmittingApiKey || isResolvingAddress}
                loadingText={isResolvingAddress ? "Resolving..." : "Saving..."}
              >
                Save
              </Button>
            )}
          </ModalFooter>
        </ModalContent>
      </Modal>
    );
  }

  // Confirmation view for delete
  if (view === "confirmDelete") {
    return (
      <Modal isOpen={isOpen} onClose={handleClose} isCentered>
        <ModalOverlay bg="blackAlpha.700" />
        <ModalContent
          bg="bauhaus.white"
          border="4px solid"
          borderColor="bauhaus.black"
          borderRadius="0"
          boxShadow="8px 8px 0px 0px #121212"
          mx={4}
        >
          <ModalHeader
            color="text.primary"
            fontSize="md"
            pb={2}
            textTransform="uppercase"
            letterSpacing="wider"
          >
            <Box display="flex" alignItems="center" gap={2}>
              <Box
                p={1}
                bg="bauhaus.red"
                border="2px solid"
                borderColor="bauhaus.black"
              >
                <WarningTwoIcon color="white" />
              </Box>
              Remove Account?
            </Box>
          </ModalHeader>

          <ModalBody>
            <VStack spacing={3} align="stretch">
              <Text color="text.secondary" fontSize="sm" fontWeight="500">
                Are you sure you want to remove this account?
              </Text>

              <Box
                p={3}
                bg="bg.muted"
                border="2px solid"
                borderColor="bauhaus.black"
              >
                <Text fontSize="sm" fontWeight="700" color="text.primary">
                  {account.displayName || truncateAddress(account.address)}
                </Text>
                <Text fontSize="xs" fontFamily="mono" color="text.tertiary">
                  {account.address}
                </Text>
              </Box>

              {(account.type === "privateKey" ||
                account.type === "seedPhrase") && (
                <Box
                  w="full"
                  p={3}
                  bg="bauhaus.red"
                  border="2px solid"
                  borderColor="bauhaus.black"
                >
                  <Text color="white" fontSize="sm" fontWeight="700">
                    {account.type === "seedPhrase"
                      ? "Make sure you have backed up your seed phrase before removing this account!"
                      : "Make sure you have backed up your private key before removing this account!"}
                  </Text>
                </Box>
              )}
            </VStack>
          </ModalBody>

          <ModalFooter gap={2}>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setView("settings")}
              isDisabled={isDeleting}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={handleDeleteAccount}
              isLoading={isDeleting}
              loadingText="Removing..."
            >
              Remove Account
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    );
  }

  // Main settings view
  return (
    <Modal isOpen={isOpen} onClose={handleClose} isCentered>
      <ModalOverlay bg="blackAlpha.700" />
      <ModalContent
        bg="bauhaus.white"
        border="4px solid"
        borderColor="bauhaus.black"
        borderRadius="0"
        boxShadow="8px 8px 0px 0px #121212"
        mx={4}
      >
        <ModalHeader
          color="text.primary"
          fontSize="md"
          pb={2}
          textTransform="uppercase"
          letterSpacing="wider"
        >
          <Box display="flex" alignItems="center" gap={2}>
            <Box
              p={1}
              bg="bauhaus.blue"
              border="2px solid"
              borderColor="bauhaus.black"
            >
              <SettingsIcon color="white" />
            </Box>
            Account Settings
          </Box>
        </ModalHeader>

        <ModalBody>
          <VStack spacing={4} align="stretch">
            {/* Account Info */}
            <Box
              p={3}
              bg="bg.muted"
              border="2px solid"
              borderColor="bauhaus.black"
            >
              <Text fontSize="xs" fontFamily="mono" color="text.tertiary">
                {account.address}
              </Text>
              <HStack mt={1} spacing={2}>
                <Box
                  w={2}
                  h={2}
                  bg={
                    account.type === "privateKey"
                      ? "bauhaus.yellow"
                      : account.type === "seedPhrase"
                        ? "bauhaus.red"
                        : account.type === "impersonator"
                          ? "bauhaus.green"
                          : "bauhaus.blue"
                  }
                  border="1px solid"
                  borderColor="bauhaus.black"
                  borderRadius={
                    account.type === "privateKey" ||
                    account.type === "seedPhrase"
                      ? "none"
                      : "full"
                  }
                />
                <Text
                  fontSize="xs"
                  color="text.tertiary"
                  fontWeight="600"
                  textTransform="uppercase"
                >
                  {account.type === "privateKey"
                    ? "Private Key Account"
                    : account.type === "seedPhrase"
                      ? `Seed Phrase Account · #${account.derivationIndex}`
                      : account.type === "impersonator"
                        ? "View-Only Account"
                        : "Bankr Account"}
                </Text>
              </HStack>
            </Box>

            {/* Display Name */}
            <FormControl>
              <FormLabel
                fontSize="xs"
                fontWeight="700"
                color="text.primary"
                textTransform="uppercase"
                letterSpacing="wider"
              >
                Display Name
              </FormLabel>
              <HStack spacing={3}>
                <Input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Enter a name..."
                  bg="white"
                  border="3px solid"
                  borderColor="bauhaus.black"
                  borderRadius="0"
                  size="md"
                  _focus={{
                    borderColor: "bauhaus.blue",
                    boxShadow: "none",
                  }}
                  _hover={{
                    borderColor: "bauhaus.black",
                  }}
                />
                <Button
                  variant="secondary"
                  size="md"
                  onClick={handleSaveDisplayName}
                  isLoading={isSaving}
                  isDisabled={
                    displayName.trim() === (account.displayName || "")
                  }
                  minW="70px"
                >
                  Save
                </Button>
              </HStack>
            </FormControl>

            {/* Seed Group Name (for seed phrase accounts) */}
            {account.type === "seedPhrase" && (
              <FormControl>
                <FormLabel
                  fontSize="xs"
                  fontWeight="700"
                  color="text.primary"
                  textTransform="uppercase"
                  letterSpacing="wider"
                >
                  Seed Group Name
                </FormLabel>
                <HStack spacing={3}>
                  <Input
                    value={seedGroupName}
                    onChange={(e) => setSeedGroupName(e.target.value)}
                    placeholder="e.g. Main Seed"
                    bg="white"
                    border="3px solid"
                    borderColor="bauhaus.black"
                    borderRadius="0"
                    size="md"
                    _focus={{
                      borderColor: "bauhaus.blue",
                      boxShadow: "none",
                    }}
                    _hover={{
                      borderColor: "bauhaus.black",
                    }}
                  />
                  <Button
                    variant="secondary"
                    size="md"
                    onClick={handleSaveSeedGroupName}
                    isLoading={isSavingSeedGroup}
                    isDisabled={
                      !seedGroupName.trim() ||
                      seedGroupName.trim() === originalSeedGroupName
                    }
                    minW="70px"
                  >
                    Save
                  </Button>
                </HStack>
              </FormControl>
            )}

            {/* Actions */}
            <VStack spacing={3} align="stretch" pt={2}>
              {(account.type === "privateKey" ||
                account.type === "seedPhrase") && (
                <Button
                  variant="yellow"
                  size="sm"
                  leftIcon={<ViewIcon />}
                  onClick={handleRevealKey}
                  justifyContent="flex-start"
                  w="full"
                >
                  Reveal Private Key
                </Button>
              )}

              {account.type === "seedPhrase" && (
                <Button
                  variant="yellow"
                  size="sm"
                  leftIcon={<ViewIcon />}
                  onClick={handleRevealSeedPhrase}
                  justifyContent="flex-start"
                  w="full"
                >
                  Reveal Seed Phrase
                </Button>
              )}

              <Button
                variant="secondary"
                size="sm"
                leftIcon={<RepeatIcon />}
                onClick={handleRefreshEns}
                isLoading={isRefreshingEns}
                loadingText="Resolving..."
                justifyContent="flex-start"
                w="full"
              >
                Refresh ENS Data
              </Button>

              {account.type === "bankr" && (
                <Button
                  variant="secondary"
                  size="sm"
                  leftIcon={<EditIcon />}
                  onClick={() => setView("changeApiKey")}
                  justifyContent="flex-start"
                  w="full"
                >
                  Change API Key & Address
                </Button>
              )}

              <Tooltip
                label="Cannot remove the last account"
                isDisabled={totalAccounts > 1}
                placement="top"
                hasArrow
              >
                <Button
                  variant="ghost"
                  size="sm"
                  leftIcon={
                    <DeleteIcon
                      color={totalAccounts <= 1 ? "gray.400" : "bauhaus.red"}
                    />
                  }
                  onClick={() => setView("confirmDelete")}
                  justifyContent="flex-start"
                  color={totalAccounts <= 1 ? "gray.400" : "bauhaus.red"}
                  fontWeight="700"
                  border="2px solid transparent"
                  _hover={
                    totalAccounts > 1
                      ? {
                          bg: "red.50",
                          borderColor: "bauhaus.red",
                        }
                      : undefined
                  }
                  w="full"
                  isDisabled={totalAccounts <= 1}
                >
                  Remove Account
                </Button>
              </Tooltip>
            </VStack>
          </VStack>
        </ModalBody>

        <ModalFooter>
          <Button variant="secondary" size="md" onClick={handleClose}>
            Done
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}

function truncateAddress(address: string): string {
  if (!address) return "";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export default memo(AccountSettingsModal);
