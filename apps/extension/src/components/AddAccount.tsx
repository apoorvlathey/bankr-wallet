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
  Image,
  Spinner,
} from "@chakra-ui/react";
import { useThemedToast } from "@/hooks/useThemedToast";
import SeedPhraseSetup from "@/components/SeedPhraseSetup";
import SeedAddressPicker from "@/components/SeedAddressPicker";
import {
  ViewIcon,
  ViewOffIcon,
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
import {
  AppHeader,
  AppScreen,
  ListItem,
  ListItemActions,
  ListItemContent,
  ListItemDescription,
  ListItemMedia,
  ListItemTitle,
  ListSurface,
  ScreenBody,
  ScreenSection,
  StickyActionBar,
} from "@/components/ui";

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
            border="1px solid"
            borderColor="border.subtle"
            borderRadius="md"
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
    <AppScreen>
      <AppHeader title="Add account" onBack={onBack} />
      <ScreenBody pt={5}>
        <VStack spacing={6} align="stretch">
          <ScreenSection
            title="Choose an account type"
            description="You can sign locally, connect Bankr, or follow an address without signing."
          >
          <RadioGroup
            value={accountType}
            onChange={(val) => setAccountType(val as AccountType)}
          >
            <ListSurface as="div" role="radiogroup">
              <HStack
                as="label"
                minH="64px"
                px={4}
                py={3}
                spacing={3}
                bg={accountType === "privateKey" ? "surface.raisedHover" : "transparent"}
                borderBottom="1px solid"
                borderColor="border.subtle"
                cursor="pointer"
                _hover={{ bg: "surface.raisedHover" }}
              >
                <HStack spacing={3}>
                  <Radio value="privateKey" />
                  <Box
                    w="32px"
                    h="32px"
                    display="grid"
                    placeItems="center"
                    bg="status.warning.bg"
                    borderRadius="md"
                  >
                    <KeyIcon boxSize="17px" color="status.warning.fg" />
                  </Box>
                  <VStack align="start" spacing={0}>
                    <Text fontSize="md" fontWeight="600" color="fg.primary">
                      Private key
                    </Text>
                    <Text fontSize="sm" color="fg.secondary">
                      Sign transactions locally
                    </Text>
                  </VStack>
                </HStack>
              </HStack>

              <HStack
                as="label"
                minH="64px"
                px={4}
                py={3}
                spacing={3}
                bg={accountType === "seedPhrase" ? "surface.raisedHover" : "transparent"}
                borderBottom="1px solid"
                borderColor="border.subtle"
                cursor="pointer"
                _hover={{ bg: "surface.raisedHover" }}
              >
                <HStack spacing={3}>
                  <Radio value="seedPhrase" />
                  <Box
                    w="32px"
                    h="32px"
                    display="grid"
                    placeItems="center"
                    bg="surface.sunken"
                    borderRadius="md"
                  >
                    <SeedIcon boxSize="17px" color="accent.primary" />
                  </Box>
                  <VStack align="start" spacing={0}>
                    <Text fontSize="md" fontWeight="600" color="fg.primary">
                      Seed phrase
                    </Text>
                    <Text fontSize="sm" color="fg.secondary">
                      Import or create a 12-word phrase
                    </Text>
                  </VStack>
                </HStack>
              </HStack>

              <HStack
                as="label"
                minH="64px"
                px={4}
                py={3}
                spacing={3}
                bg={accountType === "bankr" ? "surface.raisedHover" : "transparent"}
                borderBottom="1px solid"
                borderColor="border.subtle"
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
                    w="32px"
                    h="32px"
                    display="grid"
                    placeItems="center"
                    bg="surface.sunken"
                    borderRadius="md"
                  >
                    <RobotIcon boxSize="17px" color="accent.primary" />
                  </Box>
                  <VStack align="start" spacing={0}>
                    <Text fontSize="md" fontWeight="600" color="fg.primary">
                      Bankr API
                    </Text>
                    <Text fontSize="sm" color="fg.secondary">
                      Use Bankr to execute transactions
                    </Text>
                    {hasBankrAccount && (
                      <Text fontSize="xs" color="status.error.fg" fontWeight="600">
                        Already added
                      </Text>
                    )}
                  </VStack>
                </HStack>
              </HStack>
              <HStack
                as="label"
                minH="64px"
                px={4}
                py={3}
                spacing={3}
                bg={accountType === "impersonator" ? "surface.raisedHover" : "transparent"}
                cursor="pointer"
                _hover={{ bg: "surface.raisedHover" }}
              >
                <HStack spacing={3}>
                  <Radio value="impersonator" />
                  <Box
                    w="32px"
                    h="32px"
                    display="grid"
                    placeItems="center"
                    bg="status.success.bg"
                    borderRadius="md"
                  >
                    <EyeIcon boxSize="17px" color="status.success.fg" />
                  </Box>
                  <VStack align="start" spacing={0}>
                    <Text fontSize="md" fontWeight="600" color="fg.primary">
                      View-only
                    </Text>
                    <Text fontSize="sm" color="fg.secondary">
                      Follow an address without signing
                    </Text>
                  </VStack>
                </HStack>
              </HStack>
            </ListSurface>
          </RadioGroup>
          </ScreenSection>

          {accountType === "privateKey" && (
          <ScreenSection
            title="Import private key"
            description="The key is encrypted before it is stored locally on this device."
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
            <Box mt={3} p={3} bg="status.warning.bg" border="1px solid" borderColor="status.warning.border" borderRadius="md">
              <Text fontSize="sm" color="status.warning.fg" fontWeight="600">
                Never share this key. WalletChan support will never ask for it.
              </Text>
            </Box>
          </ScreenSection>
        )}

          {accountType === "seedPhrase" && seedGroups.length > 0 && (
          <ScreenSection
            title="Existing seed phrases"
            description="Derive another address from a phrase already stored in this wallet."
          >
            <ListSurface>
              {seedGroups.map((group) => (
                <ListItem key={group.id}>
                  <ListItemMedia>
                    <SeedIcon boxSize="18px" color="accent.primary" />
                  </ListItemMedia>
                  <ListItemContent>
                    <HStack spacing={2}>
                      <ListItemTitle>{group.name}</ListItemTitle>
                      <Badge variant="subtle" fontSize="xs">
                        {group.accountCount} {group.accountCount === 1 ? "account" : "accounts"}
                      </Badge>
                    </HStack>
                    <ListItemDescription>Stored seed phrase</ListItemDescription>
                  </ListItemContent>
                  <ListItemActions>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => setPickingGroupId(group.id)}
                  >
                    Derive
                  </Button>
                  </ListItemActions>
                </ListItem>
              ))}
            </ListSurface>
          </ScreenSection>
        )}

          {accountType === "impersonator" && (
          <ScreenSection
            title="Address to follow"
            description="Balances and activity are visible, but this account can never sign or send."
          >
            <FormControl isInvalid={!!errors.impersonatorAddress}>
              <HStack justify="space-between" align="center" mb={1}>
                <FormLabel
                  fontSize="xs"
                  color="fg.secondary"
                  fontWeight="600"
                  mb={0}
                >
                  Address or name
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
              p={3}
              bg="status.warning.bg"
              border="1px solid"
              borderColor="status.warning.border"
              borderRadius="md"
            >
              <Text fontSize="sm" color="status.warning.fg" fontWeight="600">
                View-only accounts cannot approve transactions or signatures.
              </Text>
            </Box>
          </ScreenSection>
        )}

          {accountType === "bankr" && (
          <ScreenSection
            title="Connect Bankr"
            description="Your API key is encrypted locally and used only for Bankr account actions."
          >
            <VStack spacing={4} align="stretch">
              <FormControl isInvalid={!!errors.bankrApiKey}>
                <FormLabel>Bankr API key</FormLabel>
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
                <FormLabel>Bankr wallet address</FormLabel>
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
          </ScreenSection>
        )}

          {accountType !== "seedPhrase" && (
          <ScreenSection title="Name this account" description="Optional. You can change this later.">
            <FormControl>
              <FormLabel>Display name</FormLabel>
              <Input
                placeholder="My wallet"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />
            </FormControl>
          </ScreenSection>
        )}
        </VStack>
      </ScreenBody>

      <StickyActionBar
        primaryAction={
          <Button
            variant="primary"
            onClick={
              accountType === "seedPhrase"
                ? () => setShowSeedSetup(true)
                : handleSubmit
            }
            isLoading={isSubmitting}
            loadingText="Adding…"
            isDisabled={
              (accountType === "privateKey" && !derivedAddress) ||
              (accountType === "bankr" &&
                (!bankrAddress.trim() || !bankrApiKey.trim())) ||
              (accountType === "impersonator" &&
                (!impersonatorIsValid || impersonatorIsResolving))
            }
          >
            {accountType === "seedPhrase"
              ? seedGroups.length > 0
                ? "Add another seed phrase"
                : "Set up seed phrase"
              : "Add account"}
          </Button>
        }
      />
    </AppScreen>
  );
}

export default memo(AddAccount);
