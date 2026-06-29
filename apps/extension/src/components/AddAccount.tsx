import { useState, useEffect, memo, useMemo } from "react";
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
  Radio,
  RadioGroup,
  Badge,
  Divider,
  Image,
  Spinner,
} from "@chakra-ui/react";
import { useThemedToast } from "@/hooks/useThemedToast";
import SeedPhraseSetup from "@/components/SeedPhraseSetup";
import SeedAddressPicker from "@/components/SeedAddressPicker";
import {
  ViewIcon,
  ViewOffIcon,
  ArrowBackIcon,
  AddIcon,
  CopyIcon,
  CheckIcon,
  ExternalLinkIcon,
} from "@chakra-ui/icons";
import { isAddress } from "@ethersproject/address";
import { validateAndDeriveAddress } from "@/utils/privateKeyUtils";
import {
  RobotIcon,
  KeyIcon,
  SeedIcon,
  EyeIcon,
} from "@/components/shared/AccountTypeIcons";
import PrivateKeyInput from "@/components/shared/PrivateKeyInput";
import { useAddressResolver } from "@/hooks/useAddressResolver";
import { useCachedAvatarSrc } from "@/hooks/useCachedAvatarSrc";
import { isResolvableName } from "@/lib/ensUtils";

type AccountType = "bankr" | "privateKey" | "seedPhrase" | "impersonator";

interface Account {
  id: string;
  type: "bankr" | "privateKey" | "seedPhrase" | "impersonator";
  address: string;
  displayName?: string;
  seedGroupId?: string;
  derivationIndex?: number;
}

interface SeedGroup {
  id: string;
  name: string;
  accountCount: number;
}

interface AddAccountProps {
  onBack: () => void;
  onAccountAdded: () => void;
}

function AddAccount({ onBack, onAccountAdded }: AddAccountProps) {
  const toast = useThemedToast();

  const [accountType, setAccountType] = useState<AccountType>("privateKey");
  const [privateKey, setPrivateKey] = useState("");
  const [derivedAddress, setDerivedAddress] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [bankrAddress, setBankrAddress] = useState("");
  const [bankrApiKey, setBankrApiKey] = useState("");
  const [showBankrApiKey, setShowBankrApiKey] = useState(false);
  const [impersonatorAddress, setImpersonatorAddress] = useState("");
  const [hasBankrAccount, setHasBankrAccount] = useState(false);
  const [seedGroups, setSeedGroups] = useState<SeedGroup[]>([]);
  const [allAccounts, setAllAccounts] = useState<Account[]>([]);
  const [showSeedSetup, setShowSeedSetup] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pickingGroupId, setPickingGroupId] = useState<string | null>(null);
  const [impersonatorCopied, setImpersonatorCopied] = useState(false);
  const [errors, setErrors] = useState<{
    privateKey?: string;
    bankrAddress?: string;
    bankrApiKey?: string;
    impersonatorAddress?: string;
  }>({});

  // ENS/Basename/.wei/.gwei/.mega resolution for impersonator address
  const {
    resolvedAddress: impersonatorResolvedAddress,
    resolvedName: impersonatorResolvedName,
    avatar: impersonatorAvatar,
    isResolving: impersonatorIsResolving,
    isLoadingExtras: impersonatorIsLoadingExtras,
    isValid: impersonatorIsValid,
    error: impersonatorResolverError,
  } = useAddressResolver(impersonatorAddress);
  const cachedImpersonatorAvatar = useCachedAvatarSrc(impersonatorAvatar);

  // Check existing accounts and seed groups on mount
  useEffect(() => {
    chrome.runtime.sendMessage(
      { type: "getAccounts" },
      (accounts: Account[]) => {
        const list = accounts || [];
        setAllAccounts(list);
        setHasBankrAccount(list.some((a) => a.type === "bankr"));
      },
    );
    chrome.runtime.sendMessage(
      { type: "getSeedGroups" },
      (groups: SeedGroup[]) => {
        setSeedGroups(groups || []);
      },
    );
  }, []);

  const existingIndicesByGroup = useMemo(() => {
    const map = new Map<string, number[]>();
    for (const a of allAccounts) {
      if (a.type !== "seedPhrase" || !a.seedGroupId) continue;
      if (a.derivationIndex == null) continue;
      const list = map.get(a.seedGroupId) || [];
      list.push(a.derivationIndex);
      map.set(a.seedGroupId, list);
    }
    return map;
  }, [allAccounts]);

  // Derive address when private key changes
  useEffect(() => {
    if (accountType === "privateKey" && privateKey) {
      const result = validateAndDeriveAddress(privateKey);
      if (result.valid && result.address) {
        setDerivedAddress(result.address);
        setErrors((prev) => ({ ...prev, privateKey: undefined }));
      } else {
        setDerivedAddress(null);
        // Only show error if user has entered something
        if (privateKey.length > 10) {
          setErrors((prev) => ({ ...prev, privateKey: result.error }));
        }
      }
    } else {
      setDerivedAddress(null);
    }
  }, [privateKey, accountType]);

  const handleSubmit = async () => {
    setIsSubmitting(true);
    setErrors({});

    try {
      if (accountType === "privateKey") {
        // Validate private key
        const result = validateAndDeriveAddress(privateKey);
        if (!result.valid || !result.address || !result.normalizedKey) {
          setErrors({ privateKey: result.error || "Invalid private key" });
          setIsSubmitting(false);
          return;
        }

        // Use the normalized key from validation (already has 0x prefix)
        const normalizedKey = result.normalizedKey;

        // Get cached password
        const { hasCachedPassword } = await new Promise<{
          hasCachedPassword: boolean;
        }>((resolve) => {
          chrome.runtime.sendMessage({ type: "getCachedPassword" }, resolve);
        });

        if (!hasCachedPassword) {
          toast({
            title: "Wallet locked",
            description: "Please unlock your wallet first",
            status: "error",
            duration: 3000,
          });
          setIsSubmitting(false);
          return;
        }

        // Add the private key account (background will encrypt with cached password)
        const response = await new Promise<{
          success: boolean;
          error?: string;
        }>((resolve) => {
          chrome.runtime.sendMessage(
            {
              type: "addPrivateKeyAccount",
              privateKey: normalizedKey,
              displayName: displayName.trim() || undefined,
            },
            resolve,
          );
        });

        if (!response.success) {
          setErrors({ privateKey: response.error || "Failed to add account" });
          setIsSubmitting(false);
          return;
        }

        toast({
          title: "Account added",
          description: "Private key account has been added",
          status: "success",
          duration: 2000,
        });

        onAccountAdded();
      } else if (accountType === "impersonator") {
        // Impersonator (view-only) account
        if (!impersonatorAddress.trim()) {
          setErrors({ impersonatorAddress: "Address or name is required" });
          setIsSubmitting(false);
          return;
        }

        if (!impersonatorIsValid || !impersonatorResolvedAddress) {
          setErrors({ impersonatorAddress: impersonatorResolverError || "Invalid address or name" });
          setIsSubmitting(false);
          return;
        }

        // Use the original input as display name if it was a name that resolved
        const autoDisplayName = isResolvableName(impersonatorAddress.trim())
          ? impersonatorAddress.trim()
          : undefined;

        const response = await new Promise<{
          success: boolean;
          error?: string;
        }>((resolve) => {
          chrome.runtime.sendMessage(
            {
              type: "addImpersonatorAccount",
              address: impersonatorResolvedAddress,
              displayName: displayName.trim() || autoDisplayName || undefined,
            },
            resolve,
          );
        });

        if (!response.success) {
          setErrors({
            impersonatorAddress: response.error || "Failed to add account",
          });
          setIsSubmitting(false);
          return;
        }

        toast({
          title: "Account added",
          description: "Impersonator (view-only) account has been added",
          status: "success",
          duration: 2000,
        });

        onAccountAdded();
      } else {
        // Bankr account
        if (!bankrApiKey.trim()) {
          setErrors({ bankrApiKey: "API key is required" });
          setIsSubmitting(false);
          return;
        }

        if (!bankrAddress.trim()) {
          setErrors({ bankrAddress: "Address is required" });
          setIsSubmitting(false);
          return;
        }

        if (!isAddress(bankrAddress.trim())) {
          setErrors({ bankrAddress: "Invalid Ethereum address" });
          setIsSubmitting(false);
          return;
        }

        // Check if wallet is unlocked (required to encrypt API key)
        const { hasCachedPassword } = await new Promise<{
          hasCachedPassword: boolean;
        }>((resolve) => {
          chrome.runtime.sendMessage({ type: "getCachedPassword" }, resolve);
        });

        if (!hasCachedPassword) {
          toast({
            title: "Wallet locked",
            description: "Please unlock your wallet first",
            status: "error",
            duration: 3000,
          });
          setIsSubmitting(false);
          return;
        }

        // Add bankr account (background will save the API key)
        const response = await new Promise<{
          success: boolean;
          error?: string;
        }>((resolve) => {
          chrome.runtime.sendMessage(
            {
              type: "addBankrAccount",
              address: bankrAddress.trim(),
              displayName: displayName.trim() || undefined,
              apiKey: bankrApiKey.trim(),
            },
            resolve,
          );
        });

        if (!response.success) {
          setErrors({
            bankrAddress: response.error || "Failed to add account",
          });
          setIsSubmitting(false);
          return;
        }

        toast({
          title: "Account added",
          description: "Bankr account has been added",
          status: "success",
          duration: 2000,
        });

        onAccountAdded();
      }
    } catch (error) {
      toast({
        title: "Error",
        description:
          error instanceof Error ? error.message : "Failed to add account",
        status: "error",
        duration: 3000,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePickerDerive = async (indices: number[]) => {
    if (!pickingGroupId) return;
    setIsSubmitting(true);
    try {
      const response = await new Promise<{
        success: boolean;
        error?: string;
        accounts?: Account[];
      }>((resolve) => {
        chrome.runtime.sendMessage(
          {
            type: "deriveSeedAccount",
            seedGroupId: pickingGroupId,
            indices,
          },
          resolve,
        );
      });

      if (!response.success) {
        setIsSubmitting(false);
        throw new Error(response.error || "Failed to derive accounts");
      }

      const count = response.accounts?.length ?? indices.length;
      toast({
        title: count === 1 ? "Account derived" : "Accounts derived",
        description:
          count === 1
            ? "New address added from seed phrase"
            : `${count} addresses added from seed phrase`,
        status: "success",
        duration: 2000,
      });
      setIsSubmitting(false);
      onAccountAdded();
    } catch (error) {
      setIsSubmitting(false);
      throw error;
    }
  };

  // Render SeedPhraseSetup when seed phrase is selected
  if (showSeedSetup) {
    return (
      <SeedPhraseSetup
        onBack={() => setShowSeedSetup(false)}
        onComplete={onAccountAdded}
      />
    );
  }

  // Render the multi-select picker when the user opens an existing seed
  // group to derive more addresses.
  if (pickingGroupId) {
    const group = seedGroups.find((g) => g.id === pickingGroupId);
    const groupTitle = group?.name || "Seed Phrase";
    return (
      <SeedAddressPicker
        title={`Derive · ${groupTitle}`}
        source={{
          kind: "existingGroup",
          seedGroupId: pickingGroupId,
          existingIndices: existingIndicesByGroup.get(pickingGroupId) || [],
        }}
        variant="panel"
        isSubmitting={isSubmitting}
        onBack={() => setPickingGroupId(null)}
        onSubmit={handlePickerDerive}
        submitLabel={(count) =>
          count === 1 ? "Derive 1 Address" : `Derive ${count} Addresses`
        }
        intro={
          <Box
            bg="surface.raised"
            border="2px solid"
            borderColor="border.default"
            borderRadius="lg"
            boxShadow="card"
            p={3}
          >
            <Text fontSize="xs" color="text.secondary" fontWeight="500">
              Existing accounts from this seed are shown for context. Tick the
              new addresses you want to derive.
            </Text>
          </Box>
        }
      />
    );
  }

  return (
    <Box p={4} h="100%" overflowY="auto" bg="surface.base">
      <VStack spacing={4} align="stretch">
        {/* Header */}
        <HStack spacing={3}>
          <IconButton
            aria-label="Back"
            icon={<ArrowBackIcon />}
            variant="ghost"
            size="sm"
            onClick={onBack}
          />
          <Text
            fontWeight="900"
            fontSize="lg"
            color="text.primary"
            textTransform="uppercase"
            letterSpacing="wide"
          >
            Add Account
          </Text>
        </HStack>

        {/* Account Type Selection */}
        <Box
          bg="surface.raised"
          border="2px solid"
          borderColor="border.default"
          borderRadius="lg"
          boxShadow="card"
          p={4}
        >
          <Text
            fontSize="xs"
            color="text.secondary"
            fontWeight="700"
            textTransform="uppercase"
            mb={3}
          >
            Account Type
          </Text>
          <RadioGroup
            value={accountType}
            onChange={(val) => setAccountType(val as AccountType)}
          >
            <VStack spacing={3} align="stretch">
              <Box
                as="label"
                p={3}
                bg={accountType === "privateKey" ? "surface.sunken" : "transparent"}
                border="2px solid"
                borderColor="border.default"
                borderRadius="md"
                cursor="pointer"
                _hover={{ bg: "surface.raisedHover" }}
              >
                <HStack spacing={3}>
                  <Radio value="privateKey" />
                  <Box
                    bg="accent.highlight"
                    border="2px solid"
                    borderColor="border.default"
                    borderRadius="sm"
                    p={1}
                  >
                    <KeyIcon boxSize="16px" color="accentFg.highlight" />
                  </Box>
                  <VStack align="start" spacing={0}>
                    <Text fontSize="sm" fontWeight="700" color="text.primary">
                      Private Key
                    </Text>
                    <Text fontSize="xs" color="text.secondary">
                      Sign transactions locally
                    </Text>
                  </VStack>
                </HStack>
              </Box>

              <Box
                as="label"
                p={3}
                bg={accountType === "seedPhrase" ? "surface.sunken" : "transparent"}
                border="2px solid"
                borderColor="border.default"
                borderRadius="md"
                cursor="pointer"
                _hover={{ bg: "surface.raisedHover" }}
              >
                <HStack spacing={3}>
                  <Radio value="seedPhrase" />
                  <Box
                    bg="accent.primary"
                    border="2px solid"
                    borderColor="border.default"
                    borderRadius="sm"
                    p={1}
                  >
                    <SeedIcon boxSize="16px" color="accentFg.primary" />
                  </Box>
                  <VStack align="start" spacing={0}>
                    <Text fontSize="sm" fontWeight="700" color="text.primary">
                      Seed Phrase
                    </Text>
                    <Text fontSize="xs" color="text.secondary">
                      12-word mnemonic (BIP39)
                    </Text>
                  </VStack>
                </HStack>
              </Box>

              <Box
                as="label"
                p={3}
                bg={accountType === "bankr" ? "surface.sunken" : "transparent"}
                border="2px solid"
                borderColor="border.default"
                borderRadius="md"
                cursor={hasBankrAccount ? "not-allowed" : "pointer"}
                opacity={hasBankrAccount ? 0.5 : 1}
                _hover={hasBankrAccount ? {} : { bg: "surface.raisedHover" }}
                onClick={(e) => {
                  if (hasBankrAccount) {
                    e.preventDefault();
                    e.stopPropagation();
                  }
                }}
              >
                <HStack spacing={3}>
                  <Radio
                    value="bankr"
                    isDisabled={hasBankrAccount}
                  />
                  <Box
                    bg="accent.secondary"
                    border="2px solid"
                    borderColor="border.default"
                    borderRadius="sm"
                    p={1}
                  >
                    <RobotIcon boxSize="16px" color="accentFg.secondary" />
                  </Box>
                  <VStack align="start" spacing={0}>
                    <Text fontSize="sm" fontWeight="700" color="text.primary">
                      BankrAPI
                    </Text>
                    <Text fontSize="xs" color="text.secondary">
                      Use Bankr API for transactions
                    </Text>
                    {hasBankrAccount && (
                      <Text fontSize="xs" color="chart.negative" fontWeight="700">
                        BankrAPI already added
                      </Text>
                    )}
                  </VStack>
                </HStack>
              </Box>
              <Box
                as="label"
                p={3}
                bg={accountType === "impersonator" ? "surface.sunken" : "transparent"}
                border="2px solid"
                borderColor="border.default"
                borderRadius="md"
                cursor="pointer"
                _hover={{ bg: "surface.raisedHover" }}
              >
                <HStack spacing={3}>
                  <Radio value="impersonator" />
                  <Box
                    bg="chart.positive"
                    border="2px solid"
                    borderColor="border.default"
                    borderRadius="sm"
                    p={1}
                  >
                    <EyeIcon boxSize="16px" color="fg.inverse" />
                  </Box>
                  <VStack align="start" spacing={0}>
                    <Text fontSize="sm" fontWeight="700" color="text.primary">
                      Impersonator
                    </Text>
                    <Text fontSize="xs" color="text.secondary">
                      View-only, no signing
                    </Text>
                  </VStack>
                </HStack>
              </Box>
            </VStack>
          </RadioGroup>
        </Box>

        {/* Private Key Input */}
        {accountType === "privateKey" && (
          <Box
            bg="surface.raised"
            border="2px solid"
            borderColor="border.default"
            borderRadius="lg"
            boxShadow="card"
            p={4}
          >
            <PrivateKeyInput
              privateKey={privateKey}
              onPrivateKeyChange={setPrivateKey}
              derivedAddress={derivedAddress}
              error={errors.privateKey}
              onClearError={() =>
                setErrors((prev) => ({ ...prev, privateKey: undefined }))
              }
            />
          </Box>
        )}

        {/* Seed Phrase: Existing Groups + Derive */}
        {accountType === "seedPhrase" && seedGroups.length > 0 && (
          <Box
            bg="surface.raised"
            border="2px solid"
            borderColor="border.default"
            borderRadius="lg"
            boxShadow="card"
            p={4}
          >
            <Text
              fontSize="xs"
              color="text.secondary"
              fontWeight="700"
              textTransform="uppercase"
              mb={3}
            >
              Existing Seed Phrases
            </Text>
            <VStack spacing={3} align="stretch">
              {seedGroups.map((group) => (
                <Box
                  key={group.id}
                  p={3}
                  border="2px solid"
                  borderColor="border.default"
                  borderRadius="md"
                  bg="surface.sunken"
                >
                  <HStack justify="space-between" align="center">
                    <HStack spacing={2}>
                      <Box
                        bg="accent.primary"
                        border="2px solid"
                        borderColor="border.default"
                        borderRadius="sm"
                        p={1}
                      >
                        <SeedIcon boxSize="14px" color="accentFg.primary" />
                      </Box>
                      <Text fontSize="sm" fontWeight="700" color="text.primary">
                        {group.name}
                      </Text>
                      <Badge
                        bg="fg.primary"
                        color="surface.raised"
                        fontSize="xs"
                        fontWeight="700"
                        px={2}
                      >
                        {group.accountCount}{" "}
                        {group.accountCount === 1 ? "account" : "accounts"}
                      </Badge>
                    </HStack>
                  </HStack>
                  <Button
                    size="sm"
                    variant="primary"
                    mt={2}
                    w="full"
                    leftIcon={<AddIcon boxSize="10px" />}
                    onClick={() => setPickingGroupId(group.id)}
                  >
                    Derive Addresses
                  </Button>
                </Box>
              ))}
            </VStack>

            <HStack my={4} align="center">
              <Divider borderColor="border.default" />
              <Text
                fontSize="xs"
                color="text.secondary"
                fontWeight="700"
                whiteSpace="nowrap"
                px={2}
              >
                OR
              </Text>
              <Divider borderColor="border.default" />
            </HStack>

            <Button
              variant="outline"
              w="full"
              size="sm"
              border="2px solid"
              borderColor="border.default"
              fontWeight="700"
              onClick={() => setShowSeedSetup(true)}
            >
              Add New Seed Phrase
            </Button>
          </Box>
        )}

        {/* Impersonator Address Input */}
        {accountType === "impersonator" && (
          <Box
            bg="surface.raised"
            border="2px solid"
            borderColor="border.default"
            borderRadius="lg"
            boxShadow="card"
            p={4}
          >
            <FormControl isInvalid={!!errors.impersonatorAddress}>
              <HStack justify="space-between" align="center" mb={1}>
                <FormLabel
                  fontSize="xs"
                  color="text.secondary"
                  fontWeight="700"
                  textTransform="uppercase"
                  mb={0}
                >
                  Address to Impersonate
                </FormLabel>
                {/* Resolution status */}
                {impersonatorAddress &&
                  (impersonatorIsResolving || impersonatorIsLoadingExtras) && (
                    <HStack spacing={1}>
                      <Spinner size="xs" color="accent.secondary" />
                      <Text
                        fontSize="xs"
                        color="text.tertiary"
                        fontWeight="700"
                      >
                        Resolving...
                      </Text>
                    </HStack>
                  )}
                {impersonatorAddress &&
                  !impersonatorIsResolving &&
                  impersonatorIsValid &&
                  isResolvableName(impersonatorAddress) &&
                  impersonatorResolvedAddress && (
                    <HStack spacing={0.5}>
                      {impersonatorAvatar && (
                        <Image
                          src={cachedImpersonatorAvatar || impersonatorAvatar}
                          alt="avatar"
                          boxSize="14px"
                          borderRadius="full"
                          border="1px solid"
                          borderColor="border.default"
                        />
                      )}
                      <Text
                        fontSize="xs"
                        color="text.tertiary"
                        fontFamily="mono"
                        fontWeight="700"
                      >
                        {impersonatorResolvedAddress.slice(0, 6)}...
                        {impersonatorResolvedAddress.slice(-4)}
                      </Text>
                      <IconButton
                        aria-label="Copy address"
                        icon={
                          impersonatorCopied ? (
                            <CheckIcon boxSize="10px" />
                          ) : (
                            <CopyIcon boxSize="10px" />
                          )
                        }
                        size="xs"
                        variant="ghost"
                        minW="18px"
                        h="18px"
                        color={
                          impersonatorCopied
                            ? "accent.highlight"
                            : "text.tertiary"
                        }
                        onClick={async () => {
                          await navigator.clipboard.writeText(
                            impersonatorResolvedAddress,
                          );
                          setImpersonatorCopied(true);
                          setTimeout(() => setImpersonatorCopied(false), 2000);
                        }}
                        _hover={{ color: "accent.secondary", bg: "surface.sunken" }}
                      />
                      <IconButton
                        aria-label="View on explorer"
                        icon={<ExternalLinkIcon boxSize="10px" />}
                        size="xs"
                        variant="ghost"
                        minW="18px"
                        h="18px"
                        color="text.tertiary"
                        onClick={() =>
                          window.open(
                            `https://etherscan.io/address/${impersonatorResolvedAddress}`,
                            "_blank",
                          )
                        }
                        _hover={{ color: "accent.secondary", bg: "surface.sunken" }}
                      />
                    </HStack>
                  )}
                {impersonatorAddress &&
                  !impersonatorIsResolving &&
                  impersonatorIsValid &&
                  !isResolvableName(impersonatorAddress) &&
                  impersonatorResolvedName && (
                    <HStack spacing={0.5}>
                      {impersonatorAvatar && (
                        <Image
                          src={cachedImpersonatorAvatar || impersonatorAvatar}
                          alt="avatar"
                          boxSize="14px"
                          borderRadius="full"
                          border="1px solid"
                          borderColor="border.default"
                        />
                      )}
                      <Text
                        fontSize="xs"
                        color="text.tertiary"
                        fontWeight="700"
                      >
                        {impersonatorResolvedName}
                      </Text>
                    </HStack>
                  )}
              </HStack>
              <Input
                placeholder="0x..., ENS, Basename, .wei, .gwei, or .mega"
                value={impersonatorAddress}
                onChange={(e) => {
                  setImpersonatorAddress(e.target.value);
                  if (errors.impersonatorAddress)
                    setErrors((prev) => ({
                      ...prev,
                      impersonatorAddress: undefined,
                    }));
                }}
                fontFamily="mono"
                isInvalid={
                  !!impersonatorAddress &&
                  !impersonatorIsResolving &&
                  !impersonatorIsValid
                }
              />
              {impersonatorAddress &&
                !impersonatorIsResolving &&
                !impersonatorIsValid &&
                !errors.impersonatorAddress && (
                  <Text
                    fontSize="xs"
                    color="chart.negative"
                    fontWeight="700"
                    mt={1}
                  >
                    {impersonatorResolverError || "Invalid address or name"}
                  </Text>
                )}
              <FormErrorMessage color="chart.negative" fontWeight="700">
                {errors.impersonatorAddress}
              </FormErrorMessage>
            </FormControl>
            <Box
              mt={3}
              p={2}
              bg="status.warning.bg"
              border="2px solid"
              borderColor="status.warning.border"
              borderRadius="md"
            >
              <Text fontSize="xs" color="status.warning.fg" fontWeight="700">
                View-only mode: You can view transactions and signatures but
                cannot sign or send.
              </Text>
            </Box>
          </Box>
        )}

        {/* Bankr API Key and Address Input */}
        {accountType === "bankr" && (
          <Box
            bg="surface.raised"
            border="2px solid"
            borderColor="border.default"
            borderRadius="lg"
            boxShadow="card"
            p={4}
          >
            <VStack spacing={4} align="stretch">
              <FormControl isInvalid={!!errors.bankrApiKey}>
                <FormLabel
                  fontSize="xs"
                  color="text.secondary"
                  fontWeight="700"
                  textTransform="uppercase"
                >
                  Bankr API Key
                </FormLabel>
                <InputGroup>
                  <Input
                    type={showBankrApiKey ? "text" : "password"}
                    placeholder="Enter your API key"
                    value={bankrApiKey}
                    onChange={(e) => {
                      setBankrApiKey(e.target.value);
                      if (errors.bankrApiKey)
                        setErrors((prev) => ({
                          ...prev,
                          bankrApiKey: undefined,
                        }));
                    }}
                    pr="3rem"
                  />
                  <InputRightElement>
                    <IconButton
                      aria-label={
                        showBankrApiKey ? "Hide API key" : "Show API key"
                      }
                      icon={showBankrApiKey ? <ViewOffIcon /> : <ViewIcon />}
                      size="sm"
                      variant="ghost"
                      onClick={() => setShowBankrApiKey(!showBankrApiKey)}
                      color="text.secondary"
                      tabIndex={-1}
                    />
                  </InputRightElement>
                </InputGroup>
                <FormErrorMessage color="chart.negative" fontWeight="700">
                  {errors.bankrApiKey}
                </FormErrorMessage>
              </FormControl>

              <FormControl isInvalid={!!errors.bankrAddress}>
                <FormLabel
                  fontSize="xs"
                  color="text.secondary"
                  fontWeight="700"
                  textTransform="uppercase"
                >
                  BankrAPI Address
                </FormLabel>
                <Input
                  placeholder="0x..."
                  value={bankrAddress}
                  onChange={(e) => {
                    setBankrAddress(e.target.value);
                    if (errors.bankrAddress)
                      setErrors((prev) => ({
                        ...prev,
                        bankrAddress: undefined,
                      }));
                  }}
                  fontFamily="mono"
                />
                <FormErrorMessage color="chart.negative" fontWeight="700">
                  {errors.bankrAddress}
                </FormErrorMessage>
              </FormControl>
            </VStack>
          </Box>
        )}

        {/* Display Name (Optional) - not shown for seed phrase */}
        {accountType !== "seedPhrase" && (
          <Box
            bg="surface.raised"
            border="2px solid"
            borderColor="border.default"
            borderRadius="lg"
            boxShadow="card"
            p={4}
          >
            <FormControl>
              <FormLabel
                fontSize="xs"
                color="text.secondary"
                fontWeight="700"
                textTransform="uppercase"
              >
                Display Name (Optional)
              </FormLabel>
              <Input
                placeholder="My Wallet"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />
            </FormControl>
          </Box>
        )}

        {/* Security Warning for PK */}
        {accountType === "privateKey" && (
          <Box
            bg="status.warning.bg"
            border="2px solid"
            borderColor="status.warning.border"
            borderRadius="lg"
            boxShadow="card"
            p={3}
          >
            <Text fontSize="sm" color="status.warning.fg" fontWeight="700">
              Your private key will be encrypted and stored locally. Never share
              it with anyone.
            </Text>
          </Box>
        )}

        {/* Submit Button - hidden when seed groups exist (actions are inline above) */}
        {!(accountType === "seedPhrase" && seedGroups.length > 0) && (
          <Button
            variant="primary"
            w="full"
            onClick={
              accountType === "seedPhrase"
                ? () => setShowSeedSetup(true)
                : handleSubmit
            }
            isLoading={isSubmitting}
            loadingText="Adding..."
            isDisabled={
              (accountType === "privateKey" && !derivedAddress) ||
              (accountType === "bankr" &&
                (!bankrAddress.trim() || !bankrApiKey.trim())) ||
              (accountType === "impersonator" &&
                (!impersonatorIsValid || impersonatorIsResolving))
            }
          >
            {accountType === "seedPhrase"
              ? "Set Up Seed Phrase"
              : "Add Account"}
          </Button>
        )}
      </VStack>
    </Box>
  );
}

export default memo(AddAccount);
