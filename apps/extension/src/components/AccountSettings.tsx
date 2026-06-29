import { useState, useEffect, useRef, memo } from "react";
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
  Spacer,
  Alert,
  AlertIcon,
  Tooltip,
  Divider,
  Image,
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
  ExternalLinkIcon,
  CheckIcon,
} from "@chakra-ui/icons";
import { blo } from "blo";
import { useThemedToast } from "@/hooks/useThemedToast";
import { isDarkThemeId, useTheme, IconBox } from "@/theme";
import type { Account, PasswordType, SeedGroup } from "@/chrome/types";
import { resolveNameToAddress, isResolvableName } from "@/lib/ensUtils";
import { isAddress } from "@ethersproject/address";
import {
  resolveAndCacheIdentity,
  getEnsIdentityCache,
} from "@/lib/ensIdentityCache";
import { CopyButton } from "./CopyButton";
import DelegatedPermissionsSection from "./DelegatedPermissionsSection";
import SmartAccountSection from "./SmartAccountSection";
import RevealPrivateKey from "./RevealPrivateKey";
import RevealSeedPhrase from "./RevealSeedPhrase";
import { useCachedAvatarSrc } from "@/hooks/useCachedAvatarSrc";
import { truncateAddress } from "@/lib/addressUtils";

interface AccountSettingsProps {
  account: Account | null;
  onClose: () => void;
  onAccountUpdated: () => void | Promise<unknown>;
  totalAccounts: number;
  initialView?: AccountSettingsSubView;
  onSessionExpired?: (returnView?: AccountSettingsSubView) => void;
  apiKeyDraft?: BankrConfigDraft | null;
  onApiKeyDraftChange?: (draft: BankrConfigDraft | null) => void;
}

export type AccountSettingsSubView =
  | "settings"
  | "changeApiKey"
  | "revealPrivateKey"
  | "revealSeedPhrase";

export interface BankrConfigDraft {
  accountId: string;
  apiKey: string;
  walletAddress: string;
}

function isWalletLockedError(error: string | undefined): boolean {
  return /wallet is locked|session expired|please unlock/i.test(error || "");
}

function AccountSettings({
  account,
  onClose,
  onAccountUpdated,
  totalAccounts,
  initialView = "settings",
  onSessionExpired,
  apiKeyDraft,
  onApiKeyDraftChange,
}: AccountSettingsProps) {
  const toast = useThemedToast();
  const { themeId } = useTheme();
  const isDarkTheme = isDarkThemeId(themeId);
  const [view, setView] = useState<AccountSettingsSubView>(initialView);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
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

  const apiKeyDraftRef = useRef<BankrConfigDraft | null | undefined>(
    apiKeyDraft,
  );

  useEffect(() => {
    apiKeyDraftRef.current = apiKeyDraft;
  }, [apiKeyDraft]);

  // Cached ENS identity for header avatar/name — refreshed when the screen
  // mounts and whenever the user clicks "Refresh ENS Data".
  const [ensIdentity, setEnsIdentity] = useState<{
    name: string | null;
    avatar: string | null;
  }>({ name: null, avatar: null });

  useEffect(() => {
    if (!account) return;
    let cancelled = false;
    getEnsIdentityCache().then((cache) => {
      if (cancelled) return;
      const entry = cache[account.address.toLowerCase()];
      setEnsIdentity({
        name: entry?.name ?? null,
        avatar: entry?.avatar ?? null,
      });
    });
    return () => {
      cancelled = true;
    };
  }, [account]);

  // Initialize editable fields when account changes.
  useEffect(() => {
    if (!account) return;
    const currentDraft = apiKeyDraftRef.current;
    const draftForAccount =
      currentDraft?.accountId === account.id ? currentDraft : null;
    setDisplayName(account.displayName || "");
    setView(initialView);
    setApiKey(draftForAccount?.apiKey || "");
    setShowApiKey(false);
    setWalletAddress(draftForAccount?.walletAddress || "");
    setPassword("");
    setShowPassword(false);
    setApiKeyErrors({});
    setSeedGroupName("");
    setOriginalSeedGroupName("");

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
  }, [account, initialView]);

  // Load data when switching to changeApiKey view
  useEffect(() => {
    if (view === "changeApiKey" && account?.type === "bankr") {
      let cancelled = false;
      const currentDraft = apiKeyDraftRef.current;
      const draftForAccount =
        currentDraft?.accountId === account.id ? currentDraft : null;
      const hasDraftForAccount = !!draftForAccount;
      chrome.runtime.sendMessage({ type: "getCachedPassword" }, (response) => {
        if (cancelled) return;
        const hasPassword = response?.hasCachedPassword || false;
        setHasCachedPassword(hasPassword);
        if (!hasPassword && onSessionExpired) {
          onSessionExpired("changeApiKey");
        }
      });
      chrome.runtime.sendMessage(
        { type: "getPasswordType" },
        (response: { passwordType: PasswordType | null }) => {
          if (cancelled) return;
          setPasswordType(response.passwordType);
        },
      );
      chrome.runtime.sendMessage({ type: "getCachedApiKey" }, (response) => {
        if (cancelled) return;
        if (response?.apiKey && !hasDraftForAccount) {
          setApiKey(response.apiKey);
        }
      });
      setWalletAddress(
        draftForAccount ? draftForAccount.walletAddress : account.address,
      );
      return () => {
        cancelled = true;
      };
    }
  }, [view, account, onSessionExpired]);

  const persistApiKeyDraft = (nextApiKey: string, nextWalletAddress: string) => {
    if (!account || account.type !== "bankr") return;
    onApiKeyDraftChange?.({
      accountId: account.id,
      apiKey: nextApiKey,
      walletAddress: nextWalletAddress,
    });
  };

  const closeApiKeyForm = () => {
    onApiKeyDraftChange?.(null);
    setView("settings");
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

      if (!account || account.type !== "bankr") {
        setIsSubmittingApiKey(false);
        return;
      }

      if (!hasCachedPassword) {
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
      }

      const saveResult = await new Promise<{
        success: boolean;
        error?: string;
      }>((resolve) => {
        chrome.runtime.sendMessage({
          type: "saveBankrApiKeyAndAddress",
          accountId: account.id,
          apiKey: apiKey.trim(),
          address: resolvedAddress,
        }, resolve);
      });
      if (!saveResult.success) {
        if (isWalletLockedError(saveResult.error) && onSessionExpired) {
          onSessionExpired("changeApiKey");
          setIsSubmittingApiKey(false);
          return;
        }
        toast({
          title: "Error saving configuration",
          description: saveResult.error || "Failed to save configuration",
          status: "error",
          duration: 5000,
          isClosable: true,
        });
        setIsSubmittingApiKey(false);
        return;
      }

      toast({
        title: "Configuration saved",
        description: "Your API key and wallet address have been saved.",
        status: "success",
        duration: 3000,
        isClosable: true,
      });

      await onAccountUpdated();
      onApiKeyDraftChange?.(null);
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
      setEnsIdentity({ name: result.name, avatar: result.avatar });
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
    if (account) setView("revealPrivateKey");
  };

  const handleRevealSeedPhrase = () => {
    if (account) setView("revealSeedPhrase");
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
          setIsDeleteOpen(false);
          onAccountUpdated();
          onClose();
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

  if (view === "revealPrivateKey") {
    return (
      <Box flex="1" overflowY="auto" minH={0} px={4} py={4}>
        <RevealPrivateKey
          account={account}
          onBack={() => setView("settings")}
        />
      </Box>
    );
  }

  if (view === "revealSeedPhrase") {
    return (
      <Box flex="1" overflowY="auto" minH={0} px={4} py={4}>
        <RevealSeedPhrase
          account={account}
          onBack={() => setView("settings")}
        />
      </Box>
    );
  }

  // Change API Key sub-screen (Bankr accounts)
  if (view === "changeApiKey") {
    const isAgentSession = passwordType === "agent";

    return (
      <Box flex="1" overflowY="auto" minH={0} px={4} py={4}>
      <VStack spacing={4} align="stretch">
        <HStack>
          <IconButton
            aria-label="Back"
            icon={<ArrowBackIcon />}
            variant="ghost"
            size="sm"
            onClick={closeApiKeyForm}
          />
          <Text
            fontSize="lg"
            fontWeight="900"
            color="text.primary"
            textTransform="uppercase"
            letterSpacing="tight"
          >
            Change API Key & Address
          </Text>
          <Spacer />
        </HStack>

        {isAgentSession ? (
          <VStack spacing={3} align="stretch">
            <Box
              w="full"
              p={3}
              bg="status.warning.bg"
              border="2px solid"
              borderColor="status.warning.border"
              borderRadius="md"
            >
              <HStack spacing={2}>
                <WarningTwoIcon color="status.warning.fg" />
                <Text color="status.warning.fg" fontSize="sm" fontWeight="700">
                  Unlock with master password to access
                </Text>
              </HStack>
            </Box>
            <Text color="text.secondary" fontSize="sm" fontWeight="500">
              API key changes are only available when unlocked with your
              master password.
            </Text>
            <Button
              variant="secondary"
              size="sm"
              onClick={closeApiKeyForm}
              alignSelf="flex-start"
            >
              Back
            </Button>
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
                    const nextApiKey = e.target.value;
                    setApiKey(nextApiKey);
                    persistApiKeyDraft(nextApiKey, walletAddress);
                    setApiKeyErrors({});
                  }}
                  pr="3rem"
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
              <FormErrorMessage color="chart.negative" fontWeight="700">
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
                  const nextWalletAddress = e.target.value;
                  setWalletAddress(nextWalletAddress);
                  persistApiKeyDraft(apiKey, nextWalletAddress);
                  setApiKeyErrors({});
                }}
              />
              <FormErrorMessage color="chart.negative" fontWeight="700">
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
                  <FormErrorMessage color="chart.negative" fontWeight="700">
                    {apiKeyErrors.password}
                  </FormErrorMessage>
                </FormControl>

                <Alert
                  status="warning"
                  bg="status.warning.bg"
                  border="2px solid"
                  borderColor="status.warning.border"
                  borderRadius="md"
                  fontSize="sm"
                >
                  <AlertIcon color="status.warning.fg" />
                  <Text color="status.warning.fg" fontWeight="600">
                    Enter your password to save changes. Session expired.
                  </Text>
                </Alert>
              </>
            )}

            <HStack spacing={2} justify="flex-end" pt={2}>
              <Button
                variant="secondary"
                size="sm"
                onClick={closeApiKeyForm}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleSaveApiKey}
                isLoading={isSubmittingApiKey || isResolvingAddress}
                loadingText={isResolvingAddress ? "Resolving..." : "Saving..."}
              >
                Save
              </Button>
            </HStack>
          </VStack>
        )}
      </VStack>
      </Box>
    );
  }

  // Main settings view
  const displayNameDirty =
    displayName.trim() !== (account.displayName || "");
  const seedGroupDirty =
    !!seedGroupName.trim() &&
    seedGroupName.trim() !== originalSeedGroupName;
  const accountTypeLabel =
    account.type === "privateKey"
      ? "Private Key"
      : account.type === "seedPhrase"
        ? `Seed · #${account.derivationIndex}`
        : account.type === "impersonator"
          ? "View-Only"
          : "Bankr";
  const accountTypeAccent =
    account.type === "privateKey"
      ? "accent.highlight"
      : account.type === "seedPhrase"
        ? "accent.primary"
        : account.type === "impersonator"
          ? "status.success.fg"
          : "accent.secondary";
  const accountTypeAccentFg =
    account.type === "privateKey"
      ? "accentFg.highlight"
      : account.type === "seedPhrase"
        ? "accentFg.primary"
        : account.type === "impersonator"
          ? "status.success.bg"
          : "accentFg.secondary";
  const headerName =
    account.displayName || ensIdentity.name || truncateAddress(account.address);
  const canReveal =
    account.type === "privateKey" || account.type === "seedPhrase";
  const removeDisabled = totalAccounts <= 1;

  return (
    <>
      <Box display="flex" flexDirection="column" flex="1" minH={0} w="100%">
        {/* Sticky header — back button + heading + identity card. Stays
            pinned to the top so users always know where they are while
            scrolling through long forms below. */}
        <Box
          flexShrink={0}
          bg="bg.base"
          px={4}
          pt={4}
          pb={3}
          borderBottom="1px solid"
          borderColor="border.subtle"
        >
          <VStack spacing={3} align="stretch">
            <HStack>
              <IconButton
                aria-label="Back"
                icon={<ArrowBackIcon />}
                variant="ghost"
                size="sm"
                onClick={onClose}
              />
              <HStack spacing={2}>
                <IconBox size="32px" bg="accent.secondary" noShadow>
                  <SettingsIcon color="accentFg.secondary" />
                </IconBox>
                <Text
                  fontSize="lg"
                  fontWeight="900"
                  color="text.primary"
                  textTransform="uppercase"
                  letterSpacing="tight"
                >
                  Account Settings
                </Text>
              </HStack>
              <Spacer />
            </HStack>

            {/* Identity card — avatar + name + address (with copy + explorer) + type pill */}
            <Box
              p={3}
              bg="surface.sunken"
              border={isDarkTheme ? "1px solid" : "2px solid"}
              borderColor="border.default"
              borderRadius="md"
            >
              <HStack spacing={3} align="center">
                <AccountAvatar
                  account={account}
                  ensAvatar={ensIdentity.avatar}
                />
                <VStack spacing={1} align="stretch" flex={1} minW={0}>
                  <HStack spacing={2} minW={0}>
                    <Text
                      fontSize="sm"
                      fontWeight="800"
                      color="text.primary"
                      noOfLines={1}
                      flex={1}
                      minW={0}
                    >
                      {headerName}
                    </Text>
                    <Box
                      bg={accountTypeAccent}
                      color={accountTypeAccentFg}
                      border={isDarkTheme ? "1px solid" : "2px solid"}
                      borderColor="border.default"
                      borderRadius="sm"
                      px={1.5}
                      py={0}
                      fontSize="2xs"
                      fontWeight="800"
                      textTransform="uppercase"
                      letterSpacing="wide"
                      flexShrink={0}
                    >
                      {accountTypeLabel}
                    </Box>
                  </HStack>
                  <HStack spacing={1} minW={0}>
                    <Text
                      fontSize="xs"
                      fontFamily="mono"
                      color="text.tertiary"
                      noOfLines={1}
                      flex={1}
                      minW={0}
                    >
                      {truncateAddress(account.address)}
                    </Text>
                    <CopyButton value={account.address} />
                    <IconButton
                      aria-label="View on explorer"
                      icon={<ExternalLinkIcon />}
                      size="xs"
                      variant="ghost"
                      color="text.secondary"
                      _hover={{ color: "accent.secondary", bg: "bg.muted" }}
                      onClick={() =>
                        chrome.tabs.create({
                          url: `https://etherscan.io/address/${account.address}`,
                        })
                      }
                    />
                  </HStack>
                </VStack>
              </HStack>
            </Box>
          </VStack>
        </Box>

        {/* Scrollable body — everything below the identity card */}
        <Box flex="1" overflowY="auto" minH={0} px={4} pt={4} pb={4}>
          <VStack spacing={5} align="stretch">
        {/* Display Name — Save appears inline only when dirty */}
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
          <HStack spacing={2}>
            <Input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Enter a name..."
              size="md"
              onKeyDown={(e) => {
                if (e.key === "Enter" && displayNameDirty && !isSaving) {
                  handleSaveDisplayName();
                }
              }}
            />
            {displayNameDirty && (
              <Button
                variant="primary"
                size="md"
                onClick={handleSaveDisplayName}
                isLoading={isSaving}
                minW="70px"
                leftIcon={<CheckIcon />}
              >
                Save
              </Button>
            )}
          </HStack>
        </FormControl>

        {/* Seed Group Name — same inline-save pattern */}
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
            <HStack spacing={2}>
              <Input
                value={seedGroupName}
                onChange={(e) => setSeedGroupName(e.target.value)}
                placeholder="e.g. Main Seed"
                size="md"
                onKeyDown={(e) => {
                  if (
                    e.key === "Enter" &&
                    seedGroupDirty &&
                    !isSavingSeedGroup
                  ) {
                    handleSaveSeedGroupName();
                  }
                }}
              />
              {seedGroupDirty && (
                <Button
                  variant="primary"
                  size="md"
                  onClick={handleSaveSeedGroupName}
                  isLoading={isSavingSeedGroup}
                  minW="70px"
                  leftIcon={<CheckIcon />}
                >
                  Save
                </Button>
              )}
            </HStack>
          </FormControl>
        )}

        {/* Utilities — quiet, low-stakes actions */}
        <VStack spacing={2} align="stretch">
          <Text
            fontSize="2xs"
            fontWeight="700"
            color="text.tertiary"
            textTransform="uppercase"
            letterSpacing="wider"
          >
            Utilities
          </Text>
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
        </VStack>

        {(account.type === "privateKey" || account.type === "seedPhrase") && (
          <>
            <Divider borderColor="border.subtle" />
            <SmartAccountSection
              accountId={account.id}
              accountAddress={account.address}
            />
            <Divider borderColor="border.subtle" />
            <DelegatedPermissionsSection accountId={account.id} />
          </>
        )}

        <Divider borderColor="border.subtle" />

        {/* Danger zone — reveals + destructive actions grouped together */}
        <VStack spacing={2} align="stretch">
          <Text
            fontSize="2xs"
            fontWeight="700"
            color="chart.negative"
            textTransform="uppercase"
            letterSpacing="wider"
          >
            Danger Zone
          </Text>
          {canReveal && (
            <Button
              variant="secondary"
              size="sm"
              leftIcon={<ViewIcon color="status.warning.fg" />}
              onClick={handleRevealKey}
              justifyContent="flex-start"
              color="status.warning.fg"
              fontWeight="700"
              borderColor="status.warning.border"
              _hover={{
                bg: "status.warning.bg",
                borderColor: "status.warning.border",
              }}
              w="full"
            >
              Reveal Private Key
            </Button>
          )}
          {account.type === "seedPhrase" && (
            <Button
              variant="secondary"
              size="sm"
              leftIcon={<ViewIcon color="status.warning.fg" />}
              onClick={handleRevealSeedPhrase}
              justifyContent="flex-start"
              color="status.warning.fg"
              fontWeight="700"
              borderColor="status.warning.border"
              _hover={{
                bg: "status.warning.bg",
                borderColor: "status.warning.border",
              }}
              w="full"
            >
              Reveal Seed Phrase
            </Button>
          )}
          <Tooltip
            label="Cannot remove the last account"
            isDisabled={!removeDisabled}
            placement="top"
            hasArrow
          >
            <Button
              variant="secondary"
              size="sm"
              leftIcon={
                <DeleteIcon
                  color={removeDisabled ? "fg.muted" : "chart.negative"}
                />
              }
              onClick={() => setIsDeleteOpen(true)}
              justifyContent="flex-start"
              color={removeDisabled ? "fg.muted" : "chart.negative"}
              fontWeight="700"
              borderColor={
                removeDisabled ? "border.default" : "status.error.border"
              }
              _hover={
                !removeDisabled
                  ? {
                      bg: "status.error.bg",
                      borderColor: "status.error.border",
                    }
                  : undefined
              }
              w="full"
              isDisabled={removeDisabled}
            >
              Remove Account
            </Button>
          </Tooltip>
        </VStack>
          </VStack>
        </Box>
      </Box>

      {/* Delete-confirmation popup — small modal because it's a confirmation,
          not a destination screen. Keeps the user in their place on cancel. */}
      <Modal
        isOpen={isDeleteOpen}
        onClose={() => (isDeleting ? undefined : setIsDeleteOpen(false))}
        isCentered
      >
        <ModalOverlay bg="surface.overlay" />
        <ModalContent mx={4}>
          <ModalHeader
            color="text.primary"
            fontSize="md"
            pb={2}
            textTransform="uppercase"
            letterSpacing="wider"
          >
            <Box display="flex" alignItems="center" gap={2}>
              <IconBox
                size="32px"
                bg={isDarkTheme ? "status.error.fg" : "accent.primary"}
                noShadow
              >
                <WarningTwoIcon
                  color={isDarkTheme ? "fg.inverse" : "accentFg.primary"}
                />
              </IconBox>
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
                bg="surface.sunken"
                border={isDarkTheme ? "1px solid" : "2px solid"}
                borderColor="border.default"
                borderRadius="md"
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
                  bg="status.error.bg"
                  border={isDarkTheme ? "1px solid" : "2px solid"}
                  borderColor="status.error.border"
                  borderRadius="md"
                >
                  <Text color="status.error.fg" fontSize="sm" fontWeight="700">
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
              onClick={() => setIsDeleteOpen(false)}
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
    </>
  );
}


// Small identity avatar for the settings header — prefers a resolved ENS
// avatar, then the Bankr mark for Bankr accounts, then a deterministic
// blockie for everything else (PK / seed phrase / view-only).
function AccountAvatar({
  account,
  ensAvatar,
}: {
  account: Account;
  ensAvatar: string | null;
}) {
  const size = 40;
  const cachedEnsSrc = useCachedAvatarSrc(ensAvatar || "");
  if (ensAvatar) {
    return (
      <Image
        src={cachedEnsSrc || ensAvatar}
        alt="ENS avatar"
        boxSize={`${size}px`}
        minW={`${size}px`}
        borderRadius="full"
        border="2px solid"
        borderColor="border.default"
        objectFit="cover"
      />
    );
  }
  if (account.type === "bankr") {
    return (
      <Image
        src="/bankr-icon.png"
        alt="Bankr account"
        boxSize={`${size}px`}
        minW={`${size}px`}
        borderRadius="sm"
        border="2px solid"
        borderColor="border.default"
      />
    );
  }
  return (
    <Image
      src={blo(account.address as `0x${string}`)}
      alt="Account avatar"
      boxSize={`${size}px`}
      minW={`${size}px`}
      borderRadius="sm"
      border="2px solid"
      borderColor="border.default"
    />
  );
}

export default memo(AccountSettings);
