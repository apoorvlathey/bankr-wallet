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
  Image,
  Link,
} from "@chakra-ui/react";
import { keyframes } from "@emotion/react";
import {
  ViewIcon,
  ViewOffIcon,
  ArrowBackIcon,
  CheckIcon,
} from "@chakra-ui/icons";
import { saveEncryptedApiKey, hasEncryptedApiKey } from "@/chrome/crypto";
import { resolveNameToAddress, isResolvableName } from "@/lib/ensUtils";
import { isAddress } from "@ethersproject/address";
import { validateAndDeriveAddress } from "@/utils/privateKeyUtils";
import {
  RobotIcon,
  KeyIcon,
  SeedIcon,
} from "@/components/shared/AccountTypeIcons";
import PrivateKeyInput from "@/components/shared/PrivateKeyInput";
import SeedPhraseSetup from "@/components/SeedPhraseSetup";
import ThemeSwitcher from "@/components/shared/ThemeSwitcher";
import { TWITTER_URL, BANKR_BOT_API_PAGE, BANKR_BOT_TERMINAL_PAGE } from "@/constants/externalUrls";
import { isDarkThemeId, useTheme } from "@/theme";

type OnboardingStep =
  | "welcome"
  | "accountType"
  | "bankrSetup"
  | "privateKey"
  | "seedPhrase"
  | "password"
  | "success";
type AccountTypeChoice = "bankr" | "privateKey" | "seedPhrase";

/**
 * Detects if we're running in Arc browser using CSS variable
 * Arc browser injects --arc-palette-title CSS variable
 */
function isArcBrowser(): boolean {
  try {
    const arcPaletteTitle = getComputedStyle(
      document.documentElement,
    ).getPropertyValue("--arc-palette-title");
    return !!arcPaletteTitle && arcPaletteTitle.trim().length > 0;
  } catch {
    return false;
  }
}

// Step indicator component — three intent accents that cycle correctly in either palette.
function StepIndicator({
  currentStep,
  totalSteps,
}: {
  currentStep: number;
  totalSteps: number;
}) {
  const { themeId } = useTheme();
  const isDarkTheme = isDarkThemeId(themeId);
  const colors = ["accent.primary", "accent.secondary", "accent.highlight"];
  return (
    <VStack spacing={2}>
      <HStack spacing={3}>
        {Array.from({ length: totalSteps }).map((_, index) => (
          <Box
            key={index}
            w="12px"
            h="12px"
            bg={index <= currentStep ? colors[index] : "surface.raised"}
            border={isDarkTheme ? "1px solid" : "2px solid"}
            borderColor="border.default"
            borderRadius={isDarkTheme ? "full" : "none"}
            transform={
              !isDarkTheme && index === currentStep ? "rotate(45deg)" : "none"
            }
            transition="all 0.2s"
          />
        ))}
      </HStack>
      <Text
        fontSize="xs"
        color="text.tertiary"
        fontWeight="700"
        textTransform="uppercase"
      >
        Step {currentStep + 1} of {totalSteps}
      </Text>
    </VStack>
  );
}

// Success checkmark animation
const scaleIn = keyframes`
  0% { transform: scale(0); opacity: 0; }
  50% { transform: scale(1.2); }
  100% { transform: scale(1); opacity: 1; }
`;

// Floating arrow bounce animation
const bounceArrow = keyframes`
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-10px); }
`;

function Onboarding() {
  const { themeId } = useTheme();
  const isDarkTheme = isDarkThemeId(themeId);
  const [step, setStep] = useState<OnboardingStep>("welcome");
  const [isCheckingSetup, setIsCheckingSetup] = useState(true);
  const [accountTypeChoice, setAccountTypeChoice] =
    useState<AccountTypeChoice>("bankr");
  const [apiKey, setApiKey] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [privateKey, setPrivateKey] = useState("");
  const [derivedAddress, setDerivedAddress] = useState<string | null>(null);
  const [pkDisplayName, setPkDisplayName] = useState("");
  const [walletAddress, setWalletAddress] = useState("");
  const [bankrDisplayName, setBankrDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResolvingAddress, setIsResolvingAddress] = useState(false);
  const [collectedMnemonic, setCollectedMnemonic] = useState("");
  const [collectedSeedIndices, setCollectedSeedIndices] = useState<number[]>([0]);
  const [seedGroupName, setSeedGroupName] = useState("");
  const [seedAccountDisplayName, setSeedAccountDisplayName] = useState("");
  const [errors, setErrors] = useState<{
    apiKey?: string;
    privateKey?: string;
    walletAddress?: string;
    password?: string;
    confirmPassword?: string;
  }>({});
  const keepAlivePortRef = useRef<chrome.runtime.Port | null>(null);

  // Check if extension is already configured on mount
  // If so, skip directly to success screen (don't expose any sensitive data)
  // Also detect Arc browser early to disable sidepanel
  useEffect(() => {
    const checkExistingSetup = async () => {
      // Detect Arc browser early and set flags
      if (isArcBrowser()) {
        console.log(
          "Arc browser detected during onboarding - disabling sidepanel",
        );
        await chrome.storage.sync.set({
          isArcBrowser: true,
          sidePanelMode: false,
        });
      }

      const hasApiKey = await hasEncryptedApiKey();
      if (hasApiKey) {
        // Extension already configured - show success screen only
        setStep("success");
      }
      setIsCheckingSetup(false);

      // Establish keepalive connection so the service worker can track UI close time
      if (!keepAlivePortRef.current) {
        try {
          keepAlivePortRef.current = chrome.runtime.connect({
            name: "ui-keepalive",
          });
        } catch {
          // Ignore connection errors
        }
      }
    };
    checkExistingSetup();
  }, []);

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

  // Derive address when private key changes
  useEffect(() => {
    if (privateKey) {
      const result = validateAndDeriveAddress(privateKey);
      if (result.valid && result.address) {
        setDerivedAddress(result.address);
        setErrors((prev) => ({ ...prev, privateKey: undefined }));
      } else {
        setDerivedAddress(null);
        if (privateKey.length > 10) {
          setErrors((prev) => ({ ...prev, privateKey: result.error }));
        }
      }
    } else {
      setDerivedAddress(null);
    }
  }, [privateKey]);

  const validatePassword = (): boolean => {
    const newErrors: typeof errors = {};

    if (!password) {
      newErrors.password = "Password is required";
    } else if (password.length < 6) {
      newErrors.password = "Password must be at least 6 characters";
    }

    if (password !== confirmPassword) {
      newErrors.confirmPassword = "Passwords do not match";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const validateBankrSetup = async (): Promise<boolean> => {
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

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleContinue = async () => {
    switch (step) {
      case "accountType":
        if (accountTypeChoice === "bankr") {
          setStep("bankrSetup");
        } else if (accountTypeChoice === "privateKey") {
          setStep("privateKey");
        } else if (accountTypeChoice === "seedPhrase") {
          setStep("seedPhrase");
        }
        break;
      case "bankrSetup":
        if (await validateBankrSetup()) {
          setStep("password");
        }
        break;
      case "privateKey": {
        const pkResult = validateAndDeriveAddress(privateKey);
        if (!pkResult.valid) {
          setErrors({ privateKey: pkResult.error || "Invalid private key" });
        } else {
          setStep("password");
        }
        break;
      }
      case "password":
        if (validatePassword()) {
          await handleSubmit();
        }
        break;
    }
  };

  const handleBack = () => {
    switch (step) {
      case "accountType":
        setStep("welcome");
        break;
      case "bankrSetup":
        setStep("accountType");
        break;
      case "privateKey":
        setStep("accountType");
        break;
      case "password":
        if (accountTypeChoice === "seedPhrase") {
          setStep("seedPhrase");
        } else if (accountTypeChoice === "privateKey") {
          setStep("privateKey");
        } else {
          setStep("bankrSetup");
        }
        break;
      case "seedPhrase":
        setStep("accountType");
        break;
    }
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);

    try {
      let finalAddress: string;
      let finalDisplayAddress: string;

      // Handle Seed Phrase account setup
      if (accountTypeChoice === "seedPhrase") {
        // Save placeholder to establish the password
        await saveEncryptedApiKey("pk-only-mode", password);

        // Unlock wallet to cache credentials
        await chrome.runtime.sendMessage({ type: "unlockWallet", password });

        // Create seed phrase group + derive first account (atomic with wallet creation)
        const seedResponse = await new Promise<{
          success: boolean;
          error?: string;
          account?: any;
          group?: any;
        }>((resolve) => {
          chrome.runtime.sendMessage(
            {
              type: "addSeedPhraseGroup",
              mnemonic: collectedMnemonic,
              indices: collectedSeedIndices,
              name: seedGroupName || undefined,
              accountDisplayName: seedAccountDisplayName || undefined,
            },
            resolve,
          );
        });

        if (!seedResponse.success) {
          setErrors({
            password:
              seedResponse.error || "Failed to create seed phrase account",
          });
          setIsSubmitting(false);
          return;
        }

        // Get account address for storage
        const accounts = await new Promise<any[]>((resolve) => {
          chrome.runtime.sendMessage({ type: "getAccounts" }, resolve);
        });
        const seedAccount = accounts?.find((a: any) => a.type === "seedPhrase");
        finalAddress = seedAccount?.address || accounts?.[0]?.address;
        finalDisplayAddress = seedAccount?.displayName || finalAddress;
      }

      // Handle Private Key account setup
      if (accountTypeChoice === "privateKey") {
        const pkResult = validateAndDeriveAddress(privateKey);
        if (!pkResult.valid || !pkResult.address || !pkResult.normalizedKey) {
          setErrors({ privateKey: pkResult.error || "Invalid private key" });
          setIsSubmitting(false);
          return;
        }

        // Use derived address
        finalAddress = pkResult.address;
        finalDisplayAddress = pkDisplayName.trim() || pkResult.address;

        // Use the normalized key from validation (already has 0x prefix)
        const normalizedKey = pkResult.normalizedKey;

        // For PK-only, we still need to encrypt something to establish password
        // Save a placeholder that will be checked
        await saveEncryptedApiKey("pk-only-mode", password);

        // Unlock wallet to cache credentials
        await chrome.runtime.sendMessage({ type: "unlockWallet", password });

        // Add the private key account
        const pkResponse = await new Promise<{
          success: boolean;
          error?: string;
        }>((resolve) => {
          chrome.runtime.sendMessage(
            {
              type: "addPrivateKeyAccount",
              privateKey: normalizedKey,
              displayName: pkDisplayName.trim() || undefined,
            },
            resolve,
          );
        });

        if (!pkResponse.success) {
          setErrors({
            privateKey: pkResponse.error || "Failed to add private key account",
          });
          setIsSubmitting(false);
          return;
        }
      }

      // Handle Bankr account setup
      if (accountTypeChoice === "bankr") {
        // Resolve address (in case it's ENS/Basename/WNS/GNS)
        let resolvedAddress: string | null;
        try {
          resolvedAddress = await resolveAddress(walletAddress.trim());
        } catch (err) {
          setErrors({ walletAddress: err instanceof Error ? err.message : "Failed to resolve name" });
          setIsSubmitting(false);
          return;
        }
        if (!resolvedAddress) {
          setErrors({ walletAddress: "Invalid address or name" });
          setIsSubmitting(false);
          return;
        }

        // Save encrypted API key
        await saveEncryptedApiKey(apiKey.trim(), password);

        // Unlock wallet to cache credentials
        await chrome.runtime.sendMessage({ type: "unlockWallet", password });

        // Add the Bankr account
        const bankrAccountDisplayName =
          bankrDisplayName.trim() ||
          (walletAddress.trim() !== resolvedAddress
            ? walletAddress.trim()
            : undefined);
        const bankrResponse = await new Promise<{
          success: boolean;
          error?: string;
        }>((resolve) => {
          chrome.runtime.sendMessage(
            {
              type: "addBankrAccount",
              address: resolvedAddress,
              displayName: bankrAccountDisplayName,
            },
            resolve,
          );
        });

        if (!bankrResponse.success) {
          setErrors({
            walletAddress: bankrResponse.error || "Failed to add Bankr account",
          });
          setIsSubmitting(false);
          return;
        }

        finalAddress = resolvedAddress;
        finalDisplayAddress = bankrDisplayName.trim() || walletAddress.trim();
      }

      // Save wallet address and default network (use first account's address)
      await chrome.storage.sync.set({
        address: finalAddress!,
        displayAddress: finalDisplayAddress!,
        chainName: "Base",
      });

      // Enable sidepanel mode by default for non-Arc browsers
      const { isArcBrowser: storedIsArc } = await chrome.storage.sync.get([
        "isArcBrowser",
      ]);
      if (!storedIsArc) {
        try {
          const response = await chrome.runtime.sendMessage({
            type: "setSidePanelMode",
            enabled: true,
          });
          if (response?.success) {
            console.log("Sidepanel mode enabled by default");
          }
        } catch {
          // Ignore errors - popup mode is fine as fallback
        }
      }

      // Clear sensitive state from memory before showing success
      setApiKey("");
      setPrivateKey("");
      setPassword("");
      setConfirmPassword("");
      setCollectedMnemonic("");
      setCollectedSeedIndices([0]);

      // Show success step
      setStep("success");

      // Notify background that onboarding is complete
      chrome.runtime.sendMessage({ type: "onboardingComplete" });
    } catch (error) {
      setErrors({
        password:
          error instanceof Error
            ? error.message
            : "Failed to save configuration",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const getStepNumber = (): number => {
    switch (step) {
      case "accountType":
        return 0;
      case "bankrSetup":
        return 1;
      case "privateKey":
        return 1;
      case "seedPhrase":
        return 1;
      case "password":
        return 2;
      default:
        return 0;
    }
  };

  const getTotalSteps = (): number => {
    return 3; // accountType, setup, password
  };

  // Show loading while checking if already set up
  if (isCheckingSetup) {
    return (
      <Box
        minH="100vh"
        bg="surface.base"
        display="flex"
        alignItems="center"
        justifyContent="center"
      >
        <Text
          color="text.secondary"
          fontWeight="700"
          textTransform="uppercase"
          letterSpacing="wider"
        >
          Loading...
        </Text>
      </Box>
    );
  }

  // Welcome Step
  if (step === "welcome") {
    return (
      <Box
        minH="100vh"
        bg="surface.base"
        display="flex"
        flexDirection="column"
        alignItems="center"
        justifyContent="center"
        p={8}
        position="relative"
      >
        {/* Theme switcher — top-right corner on every onboarding screen. */}
        <Box position="absolute" top={3} right={3} zIndex={2}>
          <ThemeSwitcher />
        </Box>

        {/* Bauhaus-only geometric decorations — Midnight has no corner ornaments. */}
        {!isDarkTheme && (
          <>
            <Box
              position="absolute"
              top={8}
              left={8}
              w="20px"
              h="20px"
              bg="accent.primary"
              border="3px solid"
              borderColor="border.default"
            />
            <Box
              position="absolute"
              bottom={20}
              left={8}
              w="0"
              h="0"
              borderLeft="10px solid transparent"
              borderRight="10px solid transparent"
              borderBottom="20px solid"
              borderBottomColor="var(--chakra-colors-accent-highlight)"
            />
          </>
        )}

        <VStack spacing={8} maxW="400px" textAlign="center">
          <Box
            bg="accent.highlight"
            border="2px solid"
            borderColor="border.default"
            borderRadius="lg"
            boxShadow="card"
            p={4}
          >
            <Image src="/walletchan-icon.png" w="60px" />
          </Box>

          <VStack spacing={3}>
            <Text
              fontSize="2xl"
              fontWeight="900"
              color="text.primary"
              textTransform="uppercase"
              letterSpacing="wider"
            >
              Welcome to WalletChan
            </Text>
          </VStack>

          <Button
            variant="primary"
            size="lg"
            w="full"
            maxW="280px"
            onClick={() => setStep("accountType")}
          >
            Get Started
          </Button>
        </VStack>

        {/* Footer */}
        <HStack
          spacing={1}
          justify="center"
          position="absolute"
          bottom={6}
          left={0}
          right={0}
        >
          <Text fontSize="sm" color="text.tertiary" fontWeight="500">
            Built by
          </Text>
          <Link
            display="flex"
            alignItems="center"
            gap={1}
            color="accent.secondary"
            fontWeight="700"
            _hover={{ color: "accent.highlight" }}
            href={TWITTER_URL}
            isExternal
          >
            <Box
              as="svg"
              viewBox="0 0 24 24"
              w="14px"
              h="14px"
              fill="currentColor"
            >
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
            </Box>
            <Text fontSize="sm" textDecor="underline">
              @apoorveth
            </Text>
          </Link>
        </HStack>
      </Box>
    );
  }

  // Success Step
  if (step === "success") {
    return (
      <Box
        minH="100vh"
        bg="surface.base"
        display="flex"
        flexDirection="column"
        alignItems="center"
        justifyContent="center"
        p={8}
        position="relative"
      >
        {/* Theme switcher — top-right corner on every onboarding screen. */}
        <Box position="absolute" top={3} right={3} zIndex={2}>
          <ThemeSwitcher />
        </Box>

        {/* Bauhaus-only geometric decorations */}
        {!isDarkTheme && (
          <Box
            position="absolute"
            top={8}
            left={8}
            w="16px"
            h="16px"
            bg="accent.primary"
            border="2px solid"
            borderColor="border.default"
          />
        )}

        {/* Floating arrow pointing to extension area */}
        <Box
          position="fixed"
          top="20px"
          right="60px"
          display="flex"
          flexDirection="column"
          alignItems="center"
          css={{
            animation: `${bounceArrow} 1.5s ease-in-out infinite`,
          }}
        >
          <Box
            as="svg"
            viewBox="0 0 24 24"
            w="40px"
            h="40px"
            fill="none"
            stroke="var(--chakra-colors-accent-secondary)"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            transform="rotate(45deg)"
          >
            <line x1="12" y1="19" x2="12" y2="5" />
            <polyline points="5 12 12 5 19 12" />
          </Box>
          <HStack
            mt={2}
            spacing={2}
            bg="accent.highlight"
            px={3}
            py={2}
            border="2px solid"
            borderColor="border.default"
            borderRadius="lg"
            boxShadow="card"
          >
            <Image src="/walletchan-icon.png" w="20px" h="20px" />
            <Text fontSize="sm" color="accentFg.highlight" fontWeight="700">
              WalletChan
            </Text>
          </HStack>
          <Text
            fontSize="xs"
            color="accent.secondary"
            fontWeight="700"
            mt={1}
            textAlign="center"
            textTransform="uppercase"
          >
            Pin & click the extension
          </Text>
        </Box>

        <VStack spacing={6} textAlign="center">
          <Box
            w="80px"
            h="80px"
            bg="accent.highlight"
            border="2px solid"
            borderColor="border.default"
            borderRadius="lg"
            boxShadow="card"
            display="flex"
            alignItems="center"
            justifyContent="center"
            css={{
              animation: `${scaleIn} 0.5s ease-out`,
            }}
          >
            <CheckIcon boxSize="40px" color="accentFg.highlight" />
          </Box>

          <VStack spacing={2}>
            <Text
              fontSize="xl"
              fontWeight="900"
              color="text.primary"
              textTransform="uppercase"
              letterSpacing="wider"
            >
              You're all set!
            </Text>
            <Text
              fontSize="sm"
              color="text.secondary"
              maxW="300px"
              fontWeight="500"
            >
              Pin the WalletChan extension to your browser toolbar, then click
              on it to start using your wallet.
            </Text>
          </VStack>
        </VStack>

        {/* Footer */}
        <HStack
          spacing={1}
          justify="center"
          position="absolute"
          bottom={6}
          left={0}
          right={0}
        >
          <Text fontSize="sm" color="text.tertiary" fontWeight="500">
            Built by
          </Text>
          <Link
            display="flex"
            alignItems="center"
            gap={1}
            color="accent.secondary"
            fontWeight="700"
            _hover={{ color: "accent.highlight" }}
            href={TWITTER_URL}
            isExternal
          >
            <Box
              as="svg"
              viewBox="0 0 24 24"
              w="14px"
              h="14px"
              fill="currentColor"
            >
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
            </Box>
            <Text fontSize="sm" textDecor="underline">
              @apoorveth
            </Text>
          </Link>
        </HStack>
      </Box>
    );
  }

  // Seed Phrase Step - collect mnemonic before password
  if (step === "seedPhrase") {
    return (
      <Box
        minH="100vh"
        bg="surface.base"
        display="flex"
        flexDirection="column"
        alignItems="center"
        justifyContent="flex-start"
        px={8}
        pt={32}
        pb={8}
        position="relative"
      >
        {/* Theme switcher — top-right corner on every onboarding screen. */}
        <Box position="absolute" top={3} right={3} zIndex={2}>
          <ThemeSwitcher />
        </Box>

        <SeedPhraseSetup
          onBack={() => setStep("accountType")}
          onComplete={() => {}}
          onCollect={(mnemonic, indices, groupName, accountDisplayName) => {
            setCollectedMnemonic(mnemonic);
            setCollectedSeedIndices(indices.length > 0 ? indices : [0]);
            setSeedGroupName(groupName || "");
            setSeedAccountDisplayName(accountDisplayName || "");
            setStep("password");
          }}
        />
      </Box>
    );
  }

  // Form Steps (accountType, bankrSetup, privateKey, password)
  return (
    <Box
      minH="100vh"
      bg="surface.base"
      display="flex"
      flexDirection="column"
      alignItems="center"
      justifyContent="flex-start"
      px={8}
      pt={32}
      pb={8}
      position="relative"
    >
      {/* Theme switcher — top-right corner on every onboarding screen. */}
      <Box position="absolute" top={3} right={3} zIndex={2}>
        <ThemeSwitcher />
      </Box>

      {/* Bauhaus-only geometric decorations */}
      {!isDarkTheme && (
        <Box
          position="absolute"
          top={8}
          left={8}
          w="12px"
          h="12px"
          bg="accent.primary"
          border="2px solid"
          borderColor="border.default"
        />
      )}

      <VStack spacing={6} w="full" maxW="400px">
        {/* Header with back button */}
        <HStack w="full" justify="space-between" align="center">
          <IconButton
            aria-label="Go back"
            icon={<ArrowBackIcon />}
            variant="ghost"
            size="sm"
            onClick={handleBack}
          />
          <StepIndicator
            currentStep={getStepNumber()}
            totalSteps={getTotalSteps()}
          />
          <Box w="32px" /> {/* Spacer for alignment */}
        </HStack>

        {/* Account Type Selection Step */}
        {step === "accountType" && (
          <VStack spacing={5} w="full">
            <VStack spacing={2} textAlign="center">
              <Text
                fontSize="lg"
                fontWeight="900"
                color="text.primary"
                textTransform="uppercase"
                letterSpacing="wide"
              >
                Choose Account Type
              </Text>
              <Text fontSize="sm" color="text.secondary" fontWeight="500">
                Select how you want to use WalletChan
              </Text>
            </VStack>

            <HStack spacing={3} w="full" align="stretch">
              {/* Left column - WalletChan */}
              <Box
                as="button"
                flex={1}
                p={4}
                bg={
                  accountTypeChoice === "bankr"
                    ? isDarkTheme ? "surface.raisedHover" : "surface.sunken"
                    : "surface.raised"
                }
                border="2px solid"
                borderColor={
                  accountTypeChoice === "bankr"
                    ? "accent.secondary"
                    : "border.default"
                }
                borderRadius="lg"
                boxShadow="card"
                textAlign="left"
                onClick={() => setAccountTypeChoice("bankr")}
                _hover={{ bg: "surface.raisedHover" }}
                display="flex"
                flexDirection="column"
                alignItems="center"
                justifyContent="center"
              >
                <VStack spacing={2}>
                  <Box
                    bg="accent.secondary"
                    border="2px solid"
                    borderColor="border.default"
                    borderRadius="md"
                    p={2}
                  >
                    <RobotIcon boxSize="20px" color="accentFg.secondary" />
                  </Box>
                  <VStack spacing={0}>
                    <Text
                      fontSize="sm"
                      fontWeight="900"
                      color="text.primary"
                      textTransform="uppercase"
                      textAlign="center"
                    >
                      Bankr API
                    </Text>
                    <Text
                      fontSize="xs"
                      color="text.secondary"
                      fontWeight="500"
                      textAlign="center"
                    >
                      AI-powered, no seed phrases.
                    </Text>
                  </VStack>
                  {accountTypeChoice === "bankr" && (
                    <Box
                      w="12px"
                      h="12px"
                      bg="accent.secondary"
                      border="2px solid"
                      borderColor="border.default"
                      borderRadius="full"
                    />
                  )}
                </VStack>
              </Box>

              {/* "or" separator */}
              <VStack justify="center" spacing={0} flexShrink={0}>
                <Text
                  fontSize="xs"
                  color="text.secondary"
                  fontWeight="700"
                  textTransform="lowercase"
                >
                  or
                </Text>
              </VStack>

              {/* Right column - Private Key & Seed Phrase stacked */}
              <VStack flex={1} spacing={3}>
                {/* Private Key Option */}
                <Box
                  as="button"
                  w="full"
                  p={3}
                  bg={
                    accountTypeChoice === "privateKey"
                      ? isDarkTheme ? "surface.raisedHover" : "surface.sunken"
                      : "surface.raised"
                  }
                  border="2px solid"
                  borderColor={
                    accountTypeChoice === "privateKey"
                      ? "accent.highlight"
                      : "border.default"
                  }
                  borderRadius="lg"
                  boxShadow="card"
                  textAlign="left"
                  onClick={() => setAccountTypeChoice("privateKey")}
                  _hover={{ bg: "surface.raisedHover" }}
                >
                  <HStack spacing={2}>
                    <Box
                      bg="accent.highlight"
                      border="2px solid"
                      borderColor="border.default"
                      borderRadius="md"
                      p={1.5}
                    >
                      <KeyIcon boxSize="16px" color="accentFg.highlight" />
                    </Box>
                    <VStack align="start" spacing={0} flex={1}>
                      <Text
                        fontSize="xs"
                        fontWeight="900"
                        color="text.primary"
                        textTransform="uppercase"
                      >
                        Private Key
                      </Text>
                      <Text
                        fontSize="2xs"
                        color="text.secondary"
                        fontWeight="500"
                      >
                        Import key, sign locally.
                      </Text>
                    </VStack>
                    {accountTypeChoice === "privateKey" && (
                      <Box
                        w="10px"
                        h="10px"
                        bg="accent.highlight"
                        border="2px solid"
                        borderColor="border.default"
                        borderRadius={isDarkTheme ? "full" : "none"}
                      />
                    )}
                  </HStack>
                </Box>

                {/* Seed Phrase Option */}
                <Box
                  as="button"
                  w="full"
                  p={3}
                  bg={
                    accountTypeChoice === "seedPhrase"
                      ? isDarkTheme ? "surface.raisedHover" : "surface.sunken"
                      : "surface.raised"
                  }
                  border="2px solid"
                  borderColor={
                    accountTypeChoice === "seedPhrase"
                      ? "accent.primary"
                      : "border.default"
                  }
                  borderRadius="lg"
                  boxShadow="card"
                  textAlign="left"
                  onClick={() => setAccountTypeChoice("seedPhrase")}
                  _hover={{ bg: "surface.raisedHover" }}
                >
                  <HStack spacing={2}>
                    <Box
                      bg="accent.primary"
                      border="2px solid"
                      borderColor="border.default"
                      borderRadius="md"
                      p={1.5}
                    >
                      <SeedIcon boxSize="16px" color="accentFg.primary" />
                    </Box>
                    <VStack align="start" spacing={0} flex={1}>
                      <Text
                        fontSize="xs"
                        fontWeight="900"
                        color="text.primary"
                        textTransform="uppercase"
                      >
                        Seed Phrase
                      </Text>
                      <Text
                        fontSize="2xs"
                        color="text.secondary"
                        fontWeight="500"
                      >
                        BIP39 mnemonic, multi-account.
                      </Text>
                    </VStack>
                    {accountTypeChoice === "seedPhrase" && (
                      <Box
                        w="10px"
                        h="10px"
                        bg="accent.primary"
                        border="2px solid"
                        borderColor="border.default"
                        borderRadius={isDarkTheme ? "full" : "none"}
                        transform={isDarkTheme ? "none" : "rotate(45deg)"}
                      />
                    )}
                  </HStack>
                </Box>
              </VStack>
            </HStack>

            <Text
              fontSize="xs"
              color="text.secondary"
              fontWeight="500"
              textAlign="center"
            >
              You can add other account types later from the extension settings.
            </Text>

            <Button variant="primary" w="full" onClick={handleContinue}>
              Continue
            </Button>
          </VStack>
        )}

        {/* Bankr Setup Step - API Key + Wallet Address together */}
        {step === "bankrSetup" && (
          <VStack spacing={6} w="full">
            <VStack spacing={2} textAlign="center">
              <Text
                fontSize="lg"
                fontWeight="900"
                color="text.primary"
                textTransform="uppercase"
                letterSpacing="wide"
              >
                Setup WalletChan
              </Text>
              <Text fontSize="sm" color="text.secondary" fontWeight="500">
                Enter your Bankr API key and linked wallet address.
              </Text>
            </VStack>

            <Box
              w="full"
              p={6}
              bg="surface.raised"
              border="2px solid"
              borderColor={isDarkTheme ? "border.strong" : "border.default"}
              borderRadius="lg"
              boxShadow="card"
              position="relative"
            >
              {/* Bauhaus-only corner decoration */}
              {!isDarkTheme && (
                <Box
                  position="absolute"
                  top="-3px"
                  right="-3px"
                  w="10px"
                  h="10px"
                  bg="accent.secondary"
                  border="2px solid"
                  borderColor="border.default"
                  borderRadius="full"
                />
              )}

              <VStack spacing={4}>
                <FormControl isInvalid={!!errors.apiKey}>
                  <FormLabel
                    color="text.secondary"
                    fontSize="xs"
                    fontWeight="700"
                    textTransform="uppercase"
                  >
                    Bankr API Key
                  </FormLabel>
                  <InputGroup>
                    <Input
                      type={showApiKey ? "text" : "password"}
                      placeholder="Enter your API key"
                      value={apiKey}
                      autoFocus
                      onChange={(e) => {
                        setApiKey(e.target.value);
                        if (errors.apiKey)
                          setErrors((prev) => ({ ...prev, apiKey: undefined }));
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleContinue();
                      }}
                      pr="3rem"
                    />
                    <InputRightElement>
                      <IconButton
                        aria-label={
                          showApiKey ? "Hide API key" : "Show API key"
                        }
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
                    {errors.apiKey}
                  </FormErrorMessage>
                </FormControl>

                <FormControl isInvalid={!!errors.walletAddress}>
                  <FormLabel
                    color="text.secondary"
                    fontSize="xs"
                    fontWeight="700"
                    textTransform="uppercase"
                  >
                    Wallet Address
                  </FormLabel>
                  <Input
                    placeholder="0x... or name (e.g., vitalik.eth, name.mega)"
                    value={walletAddress}
                    onChange={(e) => {
                      setWalletAddress(e.target.value);
                      if (errors.walletAddress)
                        setErrors((prev) => ({
                          ...prev,
                          walletAddress: undefined,
                        }));
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleContinue();
                    }}
                  />
                  <FormErrorMessage color="chart.negative" fontWeight="700">
                    {errors.walletAddress}
                  </FormErrorMessage>
                </FormControl>

                <FormControl>
                  <FormLabel
                    color="text.secondary"
                    fontSize="xs"
                    fontWeight="700"
                    textTransform="uppercase"
                  >
                    Display Name (Optional)
                  </FormLabel>
                  <Input
                    placeholder="e.g., Main Wallet"
                    value={bankrDisplayName}
                    onChange={(e) => setBankrDisplayName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleContinue();
                    }}
                  />
                </FormControl>
              </VStack>
            </Box>

            <VStack spacing={2} w="full">
              <Link
                fontSize="sm"
                color="accent.secondary"
                fontWeight="700"
                href={BANKR_BOT_API_PAGE}
                isExternal
                _hover={{ color: "accent.highlight", textDecoration: "underline" }}
              >
                Don't have an API key? Get one from bankr.bot
              </Link>
              <Link
                fontSize="sm"
                color="accent.secondary"
                fontWeight="700"
                href={BANKR_BOT_TERMINAL_PAGE}
                isExternal
                _hover={{ color: "accent.highlight", textDecoration: "underline" }}
              >
                Find your wallet address at bankr.bot/terminal
              </Link>
            </VStack>

            <Button
              variant="primary"
              w="full"
              onClick={handleContinue}
              isLoading={isResolvingAddress}
              loadingText="Verifying..."
            >
              Continue
            </Button>
          </VStack>
        )}

        {/* Private Key Step */}
        {step === "privateKey" && (
          <VStack spacing={6} w="full">
            <VStack spacing={2} textAlign="center">
              <Text
                fontSize="lg"
                fontWeight="900"
                color="text.primary"
                textTransform="uppercase"
                letterSpacing="wide"
              >
                Enter your Private Key
              </Text>
              <Text fontSize="sm" color="text.secondary" fontWeight="500">
                Your private key will be encrypted and stored locally.
              </Text>
            </VStack>

            <Box
              w="full"
              p={6}
              bg="surface.raised"
              border="2px solid"
              borderColor={isDarkTheme ? "border.strong" : "border.default"}
              borderRadius="lg"
              boxShadow="card"
              position="relative"
            >
              {/* Bauhaus-only corner decoration */}
              {!isDarkTheme && (
                <Box
                  position="absolute"
                  top="-3px"
                  right="-3px"
                  w="10px"
                  h="10px"
                  bg="accent.highlight"
                  border="2px solid"
                  borderColor="border.default"
                />
              )}

              <PrivateKeyInput
                privateKey={privateKey}
                onPrivateKeyChange={setPrivateKey}
                derivedAddress={derivedAddress}
                error={errors.privateKey}
                onClearError={() => setErrors({})}
                onContinue={handleContinue}
                autoFocus
              />

              <FormControl mt={4}>
                <FormLabel
                  color="text.secondary"
                  fontSize="xs"
                  fontWeight="700"
                  textTransform="uppercase"
                >
                  Display Name (Optional)
                </FormLabel>
                <Input
                  placeholder="e.g., My Trading Wallet"
                  value={pkDisplayName}
                  onChange={(e) => setPkDisplayName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleContinue();
                  }}
                />
              </FormControl>
            </Box>

            <HStack
              w="full"
              p={3}
              bg="status.warning.bg"
              border="2px solid"
              borderColor="status.warning.border"
              borderRadius="lg"
              boxShadow="card"
              spacing={2}
              align="center"
            >
              <Box
                w="8px"
                h="8px"
                minW="8px"
                bg="status.warning.fg"
                borderRadius={isDarkTheme ? "full" : "none"}
              />
              <Text fontSize="xs" color="status.warning.fg" fontWeight="700">
                Never share your private key with anyone. It will be encrypted
                and stored only on this device.
              </Text>
            </HStack>

            <Button
              variant="primary"
              w="full"
              onClick={handleContinue}
              isDisabled={!derivedAddress}
            >
              Continue
            </Button>
          </VStack>
        )}

        {/* Password Step */}
        {step === "password" && (
          <VStack spacing={6} w="full">
            <VStack spacing={2} textAlign="center">
              <Text
                fontSize="lg"
                fontWeight="900"
                color="text.primary"
                textTransform="uppercase"
                letterSpacing="wide"
              >
                Create a Password
              </Text>
              <Text fontSize="sm" color="text.secondary" fontWeight="500">
                Your password encrypts your API key locally. You'll need it to
                unlock the wallet.
              </Text>
            </VStack>

            <Box
              w="full"
              p={6}
              bg="surface.raised"
              border="2px solid"
              borderColor={isDarkTheme ? "border.strong" : "border.default"}
              borderRadius="lg"
              boxShadow="card"
              position="relative"
            >
              {/* Bauhaus-only corner decoration */}
              {!isDarkTheme && (
                <Box
                  position="absolute"
                  top="-3px"
                  right="-3px"
                  w="0"
                  h="0"
                  borderLeft="6px solid transparent"
                  borderRight="6px solid transparent"
                  borderBottom="10px solid"
                  borderBottomColor="var(--chakra-colors-accent-highlight)"
                />
              )}

              <VStack spacing={4}>
                <FormControl isInvalid={!!errors.password}>
                  <FormLabel
                    color="text.secondary"
                    fontSize="xs"
                    fontWeight="700"
                    textTransform="uppercase"
                  >
                    Password
                  </FormLabel>
                  <InputGroup>
                    <Input
                      type={showPassword ? "text" : "password"}
                      placeholder="Create a password (min. 6 characters)"
                      value={password}
                      autoFocus
                      onChange={(e) => {
                        setPassword(e.target.value);
                        if (errors.password) setErrors({});
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleContinue();
                      }}
                      pr="3rem"
                    />
                    <InputRightElement>
                      <IconButton
                        aria-label={
                          showPassword ? "Hide password" : "Show password"
                        }
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
                    {errors.password}
                  </FormErrorMessage>
                </FormControl>

                <FormControl isInvalid={!!errors.confirmPassword}>
                  <FormLabel
                    color="text.secondary"
                    fontSize="xs"
                    fontWeight="700"
                    textTransform="uppercase"
                  >
                    Confirm Password
                  </FormLabel>
                  <Input
                    type={showPassword ? "text" : "password"}
                    placeholder="Confirm your password"
                    value={confirmPassword}
                    onChange={(e) => {
                      setConfirmPassword(e.target.value);
                      if (errors.confirmPassword) setErrors({});
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleContinue();
                    }}
                  />
                  <FormErrorMessage color="chart.negative" fontWeight="700">
                    {errors.confirmPassword}
                  </FormErrorMessage>
                </FormControl>
              </VStack>
            </Box>

            <Box
              w="full"
              p={4}
              bg="status.warning.bg"
              border="2px solid"
              borderColor="status.warning.border"
              borderRadius="lg"
              boxShadow="card"
            >
              <Text fontSize="sm" color="status.warning.fg" fontWeight="700">
                Keep your password safe. If you forget it, you'll need to reset
                the extension and reconfigure your API key.
              </Text>
            </Box>

            <Button
              variant="primary"
              w="full"
              onClick={handleContinue}
              isLoading={isSubmitting}
              loadingText="Setting up..."
            >
              Complete Setup
            </Button>
          </VStack>
        )}
      </VStack>

      {/* Footer */}
      <HStack
        spacing={1}
        justify="center"
        position="absolute"
        bottom={6}
        left={0}
        right={0}
      >
        <Text fontSize="sm" color="text.tertiary" fontWeight="500">
          Built by
        </Text>
        <Link
          display="flex"
          alignItems="center"
          gap={1}
          color="accent.secondary"
          fontWeight="700"
          _hover={{ color: "accent.highlight" }}
          href={TWITTER_URL}
          isExternal
        >
          <Box
            as="svg"
            viewBox="0 0 24 24"
            w="14px"
            h="14px"
            fill="currentColor"
          >
            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
          </Box>
          <Text fontSize="sm" textDecor="underline">
            @apoorveth
          </Text>
        </Link>
      </HStack>
    </Box>
  );
}

export default Onboarding;
