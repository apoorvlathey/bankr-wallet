import { useState, useEffect, memo, useMemo, useCallback } from "react";
import {
  Box,
  VStack,
  HStack,
  Text,
  Input,
  FormControl,
  FormLabel,
  FormErrorMessage,
  InputGroup,
  InputRightElement,
  IconButton,
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
import { LocalAccountBiometricGateStatus } from "@/components/AddAccount/LegacyBiometricUpgradeNotice";
import { AddAccountTypeSelectionScreen } from "@/components/AddAccount/AddAccountTypeSelectionScreen";
import { AddAccountActionBar } from "@/components/AddAccount/AddAccountActionBar";
import { PrivateKeyAccountSection } from "@/components/AddAccount/PrivateKeyAccountSection";
import { SeedPhraseAccountSection } from "@/components/AddAccount/SeedPhraseAccountSection";
import { useLocalAccountBiometricGate } from "@/components/AddAccount/useLocalAccountBiometricGate";
import type { AccountType } from "@/components/AddAccountTypeGrid";
import { useAddressResolver } from "@/hooks/useAddressResolver";
import { useCachedAvatarSrc } from "@/hooks/useCachedAvatarSrc";
import { isResolvableName } from "@/lib/ensUtils";
import {
  AppHeader,
  AppScreen,
  ScreenBody,
  ScreenSection,
} from "@/components/ui";

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
  onOpenBiometricSettings: () => void;
}

const accountTypeTitles: Record<AccountType, string> = {
  privateKey: "Private key",
  seedPhrase: "Seed phrase",
  bankr: "Bankr API",
  impersonator: "View-only account",
};

function AddAccount({
  onBack,
  onAccountAdded,
  onOpenBiometricSettings,
}: AddAccountProps) {
  const toast = useThemedToast();

  const [accountType, setAccountType] = useState<AccountType | null>(null);
  const [privateKey, setPrivateKey] = useState("");
  const [derivedAddress, setDerivedAddress] = useState<string | null>(null);
  const [privateKeyBackup, setPrivateKeyBackup] = useState({ isGenerated: false, isConfirmed: true });
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
  const {
    needsUpgrade: needsBiometricUpgrade,
    isAuthenticating: isMnemonicAuthenticating,
    ensureMnemonicAccess,
  } = useLocalAccountBiometricGate();
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

  const handleGeneratedBackupStateChange = useCallback(
    (isGenerated: boolean, isConfirmed: boolean) => {
      setPrivateKeyBackup({ isGenerated, isConfirmed });
    },
    [],
  );

  const openSeedSetup = useCallback(async () => {
    const access = await ensureMnemonicAccess();
    if (access.ready) setShowSeedSetup(true);
  }, [ensureMnemonicAccess]);

  const openSeedPicker = useCallback(
    async (seedGroupId: string) => {
      const access = await ensureMnemonicAccess();
      if (access.ready) setPickingGroupId(seedGroupId);
    },
    [ensureMnemonicAccess],
  );

  const handleAccountTypeSelect = useCallback(
    async (type: AccountType) => {
      if (type === "seedPhrase") {
        const access = await ensureMnemonicAccess();
        if (!access.ready && access.reason !== "legacy-upgrade-required") {
          return;
        }
        setAccountType(type);
        if (access.ready && seedGroups.length === 0) setShowSeedSetup(true);
        return;
      }
      setAccountType(type);
    },
    [ensureMnemonicAccess, seedGroups.length],
  );

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
        if (privateKeyBackup.isGenerated && !privateKeyBackup.isConfirmed) {
          setErrors({
            privateKey: "Confirm that you saved the generated private key",
          });
          setIsSubmitting(false);
          return;
        }
        // Validate private key
        const result = validateAndDeriveAddress(privateKey);
        if (!result.valid || !result.address || !result.normalizedKey) {
          setErrors({ privateKey: result.error || "Invalid private key" });
          setIsSubmitting(false);
          return;
        }

        // Use the normalized key from validation (already has 0x prefix)
        const normalizedKey = result.normalizedKey;

        // The background accepts either a password-backed master session or a
        // biometric master session with the vault key cached. It remains the
        // authority for master-vs-agent access control.
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

        // The service worker verifies the active master session and encrypts
        // with its cached vault key, including after biometric unlock.
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
    const access = await ensureMnemonicAccess();
    if (!access.ready) return;
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
  if (showSeedSetup && needsBiometricUpgrade === false) {
    return (
      <SeedPhraseSetup
        onBack={() => {
          setShowSeedSetup(false);
          if (seedGroups.length === 0) setAccountType(null);
        }}
        onComplete={onAccountAdded}
        ensureMnemonicAccess={ensureMnemonicAccess}
      />
    );
  }

  // Render the multi-select picker when the user opens an existing seed
  // group to derive more addresses.
  if (pickingGroupId && needsBiometricUpgrade === false) {
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
        isSubmitting={isSubmitting || isMnemonicAuthenticating}
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

  if (!accountType) {
    return (
      <AddAccountTypeSelectionScreen
        hasBankrAccount={hasBankrAccount}
        onBack={onBack}
        onSelect={(type) => void handleAccountTypeSelect(type)}
      />
    );
  }

  const isLocalAccount =
    accountType === "privateKey" || accountType === "seedPhrase";

  return (
    <AppScreen>
      <AppHeader
        title={accountTypeTitles[accountType]}
        onBack={() => {
          // Do not retain uncommitted credentials when leaving a signer/API
          // setup screen. This also prevents a generated key from reappearing
          // as an "imported" key and bypassing its backup acknowledgement.
          setPrivateKey("");
          setDerivedAddress(null);
          setPrivateKeyBackup({ isGenerated: false, isConfirmed: true });
          setBankrApiKey("");
          setShowBankrApiKey(false);
          setAccountType(null);
          setErrors({});
        }}
      />
      <ScreenBody pt={5}>
        <VStack spacing={6} align="stretch">
          {isLocalAccount && (
            <LocalAccountBiometricGateStatus
              needsUpgrade={needsBiometricUpgrade}
              onOpenBiometricSettings={onOpenBiometricSettings}
            />
          )}

          {accountType === "privateKey" && needsBiometricUpgrade === false && (
            <PrivateKeyAccountSection
              privateKey={privateKey}
              onPrivateKeyChange={setPrivateKey}
              derivedAddress={derivedAddress}
              error={errors.privateKey}
              onClearError={() => setErrors((prev) => ({ ...prev, privateKey: undefined }))}
              backup={privateKeyBackup}
              onBackupChange={(isConfirmed) => setPrivateKeyBackup((current) => ({ ...current, isConfirmed }))}
              onBackupStateChange={handleGeneratedBackupStateChange}
            />
          )}

          {accountType === "seedPhrase" && needsBiometricUpgrade === false && (
            <SeedPhraseAccountSection
              groups={seedGroups}
              isAuthenticating={isMnemonicAuthenticating}
              onDerive={(groupId) => void openSeedPicker(groupId)}
            />
          )}

          {accountType === "impersonator" && (
          <ScreenSection
            title="Address to follow"
            description="View balances & Connect to dapps as this address"
          >
            <FormControl isInvalid={!!errors.impersonatorAddress}>
              <HStack justify="flex-end" align="center" mb={impersonatorAddress ? 1 : 0}>
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
                            "noopener,noreferrer",
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
                aria-label="Address or name"
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

          {accountType !== "seedPhrase" &&
            (!isLocalAccount || needsBiometricUpgrade === false) && (
            <ScreenSection
              title="Account name"
              description="Optional. You can change this later."
            >
              <FormControl>
                <Input
                  aria-label="Account name"
                  placeholder="My wallet"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                />
              </FormControl>
            </ScreenSection>
          )}

          {accountType === "impersonator" && (
            <Box
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
          )}
        </VStack>
      </ScreenBody>

      <AddAccountActionBar
        accountType={accountType}
        needsBiometricUpgrade={needsBiometricUpgrade}
        isSubmitting={isSubmitting}
        isAuthenticating={isMnemonicAuthenticating}
        canAddPrivateKey={
          !!derivedAddress &&
          (!privateKeyBackup.isGenerated || privateKeyBackup.isConfirmed)
        }
        privateKeyBackup={privateKeyBackup}
        onPrivateKeyBackupChange={(isConfirmed) =>
          setPrivateKeyBackup((current) => ({ ...current, isConfirmed }))
        }
        canAddBankr={!!bankrAddress.trim() && !!bankrApiKey.trim()}
        canAddImpersonator={impersonatorIsValid && !impersonatorIsResolving}
        seedGroupCount={seedGroups.length}
        onAddAccount={handleSubmit}
        onSetupSeedPhrase={() => void openSeedSetup()}
      />
    </AppScreen>
  );
}

export default memo(AddAccount);
