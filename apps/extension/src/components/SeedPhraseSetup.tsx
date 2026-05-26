import { useState, memo } from "react";
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
  IconButton,
  SimpleGrid,
  Spinner,
  Textarea,
} from "@chakra-ui/react";
import { useThemedToast } from "@/hooks/useThemedToast";
import {
  ArrowBackIcon,
  CopyIcon,
  CheckIcon,
  ViewIcon,
  ViewOffIcon,
  AddIcon,
  DownloadIcon,
} from "@chakra-ui/icons";
import { IconBox } from "@/theme";
import SeedAddressPicker from "./SeedAddressPicker";

type Mode = "choose" | "generate" | "import" | "pick";

interface SeedPhraseSetupProps {
  onBack: () => void;
  onComplete: () => void;
  /** When provided, collect mnemonic + selected derivation indices without saving (for onboarding flow where wallet isn't unlocked yet). */
  onCollect?: (
    mnemonic: string,
    indices: number[],
    groupName?: string,
    accountDisplayName?: string,
  ) => void;
}

// Lifted to module scope so identity is stable across renders — otherwise
// re-defining these on every render remounts the entire subtree on each
// keystroke and kills focus on the name inputs.
const Wrapper = ({
  isOnboarding,
  children,
}: {
  isOnboarding: boolean;
  children: React.ReactNode;
}) =>
  isOnboarding ? (
    <VStack spacing={6} w="full" maxW="400px" align="stretch">
      {children}
    </VStack>
  ) : (
    <Box p={4} h="100%" overflowY="auto" bg="surface.base">
      <VStack spacing={4} align="stretch">
        {children}
      </VStack>
    </Box>
  );

const Header = ({
  isOnboarding,
  title,
  onBackClick,
}: {
  isOnboarding: boolean;
  title: string;
  onBackClick: () => void;
}) =>
  isOnboarding ? (
    <HStack w="full" justify="space-between" align="center">
      <IconButton
        aria-label="Back"
        icon={<ArrowBackIcon />}
        variant="ghost"
        size="sm"
        onClick={onBackClick}
      />
      <Text
        fontWeight="900"
        fontSize="md"
        color="text.primary"
        textTransform="uppercase"
        letterSpacing="wide"
        noOfLines={1}
        flex={1}
        textAlign="center"
        mx={2}
      >
        {title}
      </Text>
      <Box w="32px" flexShrink={0} />
    </HStack>
  ) : (
    <HStack spacing={3}>
      <IconButton
        aria-label="Back"
        icon={<ArrowBackIcon />}
        variant="ghost"
        size="sm"
        onClick={onBackClick}
      />
      <Text
        fontWeight="900"
        fontSize="lg"
        color="text.primary"
        textTransform="uppercase"
        letterSpacing="wide"
      >
        {title}
      </Text>
    </HStack>
  );

function SeedPhraseSetup({ onBack, onComplete, onCollect }: SeedPhraseSetupProps) {
  const toast = useThemedToast();

  // When rendered inside onboarding (`onCollect` set), match the outer layout
  // of Onboarding's form-step wrapper so the back button and heading stay
  // pinned at the same screen position across every internal screen (choose,
  // mnemonic display, import). Outside onboarding (Settings → AddAccount),
  // keep the existing scrollable full-height panel.
  const isOnboarding = !!onCollect;

  const [mode, setMode] = useState<Mode>("choose");
  const [generatedMnemonic, setGeneratedMnemonic] = useState<string | null>(null);
  const [importedMnemonic, setImportedMnemonic] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [accountDisplayName, setAccountDisplayName] = useState("");
  const [showMnemonic, setShowMnemonic] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [mnemonicCopied, setMnemonicCopied] = useState(false);

  // Set after the import mnemonic validates — drives the picker step.
  const [pickerMnemonic, setPickerMnemonic] = useState<string | null>(null);

  const handleGenerate = async () => {
    setIsSubmitting(true);
    setError(null);

    try {
      if (onCollect) {
        // collectOnly mode: generate mnemonic without saving (wallet not unlocked yet)
        const response = await new Promise<{
          success: boolean;
          error?: string;
          mnemonic?: string;
        }>((resolve) => {
          chrome.runtime.sendMessage({ type: "generateMnemonic" }, resolve);
        });

        if (!response.success || !response.mnemonic) {
          setError(response.error || "Failed to generate seed phrase");
          setIsSubmitting(false);
          return;
        }

        setGeneratedMnemonic(response.mnemonic);
        setIsSubmitting(false);
      } else {
        // Normal mode: generate and save via addSeedPhraseGroup
        const response = await new Promise<{
          success: boolean;
          error?: string;
          mnemonic?: string;
          account?: any;
          group?: any;
        }>((resolve) => {
          chrome.runtime.sendMessage(
            {
              type: "addSeedPhraseGroup",
              name: displayName.trim() || undefined,
              accountDisplayName: accountDisplayName.trim() || undefined,
            },
            resolve
          );
        });

        if (!response.success) {
          setError(response.error || "Failed to generate seed phrase");
          setIsSubmitting(false);
          return;
        }

        setGeneratedMnemonic(response.mnemonic!);
        setIsSubmitting(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate seed phrase");
      setIsSubmitting(false);
    }
  };

  const handleImport = async () => {
    setError(null);
    const trimmed = importedMnemonic.trim().toLowerCase().replace(/\s+/g, " ");
    const words = trimmed.split(" ");

    if (words.length !== 12) {
      setError("Seed phrase must be exactly 12 words");
      return;
    }
    // Picker handles validation + initial fetch + loading state itself.
    setPickerMnemonic(trimmed);
    setMode("pick");
  };

  const handlePickerSubmit = async (indices: number[]) => {
    if (!pickerMnemonic) return;
    setIsSubmitting(true);
    try {
      if (onCollect) {
        onCollect(
          pickerMnemonic,
          indices,
          displayName.trim() || undefined,
          accountDisplayName.trim() || undefined,
        );
        setIsSubmitting(false);
        return;
      }
      const response = await new Promise<{
        success: boolean;
        error?: string;
        accounts?: any[];
      }>((resolve) => {
        chrome.runtime.sendMessage(
          {
            type: "addSeedPhraseGroup",
            mnemonic: pickerMnemonic,
            indices,
            name: displayName.trim() || undefined,
            accountDisplayName: accountDisplayName.trim() || undefined,
          },
          resolve,
        );
      });

      if (!response.success) {
        setIsSubmitting(false);
        throw new Error(response.error || "Failed to import seed phrase");
      }

      const count = response.accounts?.length ?? indices.length;
      toast({
        title: "Seed phrase imported",
        description: count === 1 ? "1 account derived" : `${count} accounts derived`,
        status: "success",
        duration: 2000,
      });
      onComplete();
    } catch (err) {
      setIsSubmitting(false);
      throw err;
    }
  };

  // After generating: show the mnemonic grid and confirm button
  if (generatedMnemonic) {
    const words = generatedMnemonic.split(" ");
    return (
      <Wrapper isOnboarding={isOnboarding}>
          <Header
            isOnboarding={isOnboarding}
            title="Save Your Seed Phrase"
            onBackClick={() => {
              if (!confirmed) {
                setGeneratedMnemonic(null);
                setMode("choose");
              } else {
                onComplete();
              }
            }}
          />

          <Box
            bg="status.error.bg"
            border="2px solid"
            borderColor="status.error.border"
            borderRadius="lg"
            boxShadow="card"
            p={3}
          >
            <Text fontSize="xs" color="status.error.fg" fontWeight="700">
              Write down these 12 words in order. This is the ONLY way to recover your accounts. Never share your seed phrase!
            </Text>
          </Box>

          <Box
            bg="surface.raised"
            border="2px solid"
            borderColor="border.default"
            borderRadius="lg"
            boxShadow="card"
            p={4}
            position="relative"
          >
            <HStack justify="flex-end" mb={2}>
              <IconButton
                aria-label={showMnemonic ? "Hide" : "Show"}
                icon={showMnemonic ? <ViewOffIcon /> : <ViewIcon />}
                size="xs"
                variant="ghost"
                onClick={() => setShowMnemonic(!showMnemonic)}
              />
              <IconButton
                aria-label="Copy"
                icon={mnemonicCopied ? <CheckIcon /> : <CopyIcon />}
                size="xs"
                variant="ghost"
                color={mnemonicCopied ? "accent.highlight" : undefined}
                onClick={async () => {
                  await navigator.clipboard.writeText(generatedMnemonic);
                  setMnemonicCopied(true);
                  setTimeout(() => setMnemonicCopied(false), 2000);
                }}
              />
            </HStack>
            <SimpleGrid columns={3} spacing={2}>
              {words.map((word, i) => (
                <HStack
                  key={i}
                  bg="surface.sunken"
                  border="2px solid"
                  borderColor="border.default"
                  borderRadius="md"
                  px={2}
                  py={1.5}
                  spacing={1}
                >
                  <Text fontSize="10px" color="text.tertiary" fontWeight="700" minW="16px">
                    {i + 1}.
                  </Text>
                  <Text fontSize="xs" fontWeight="700" fontFamily="mono" color="text.primary">
                    {showMnemonic ? word : "****"}
                  </Text>
                </HStack>
              ))}
            </SimpleGrid>
          </Box>

          <Button
            variant="primary"
            w="full"
            onClick={() => {
              setConfirmed(true);
              if (onCollect) {
                // collectOnly mode: pass mnemonic back without saving.
                // Generate flow only ever creates index 0 — picker is
                // import-only since fresh mnemonics have nothing to discover.
                onCollect(
                  generatedMnemonic,
                  [0],
                  displayName.trim() || undefined,
                  accountDisplayName.trim() || undefined
                );
              } else {
                toast({
                  title: "Account added",
                  description: "Seed phrase account has been created",
                  status: "success",
                  duration: 2000,
                });
                onComplete();
              }
            }}
          >
            I've Saved My Seed Phrase
          </Button>
      </Wrapper>
    );
  }

  // Choose mode: generate or import
  if (mode === "choose") {
    return (
      <Wrapper isOnboarding={isOnboarding}>
          <Header isOnboarding={isOnboarding} title="Seed Phrase" onBackClick={onBack} />

          <VStack spacing={3} align="stretch">
            <Box
              as="button"
              w="full"
              p={4}
              bg="surface.raised"
              border="2px solid"
              borderColor="border.default"
              borderRadius="lg"
              boxShadow="card"
              textAlign="left"
              disabled={isSubmitting}
              opacity={isSubmitting ? 0.6 : 1}
              cursor={isSubmitting ? "not-allowed" : "pointer"}
              onClick={() => {
                if (onCollect) {
                  // Skip the intermediate "name your account" screen during
                  // onboarding — generate immediately and jump to the mnemonic
                  // display. Naming happens later in settings.
                  handleGenerate();
                } else {
                  setMode("generate");
                }
              }}
              _hover={isSubmitting ? {} : { bg: "surface.raisedHover" }}
            >
              <HStack spacing={3} align="center">
                <IconBox size="32px" bg="accent.primary" noShadow>
                  <AddIcon color="accentFg.primary" boxSize="14px" />
                </IconBox>
                <VStack align="start" spacing={1} flex={1}>
                  <Text fontSize="sm" fontWeight="900" color="text.primary" textTransform="uppercase">
                    Generate New
                  </Text>
                  <Text fontSize="xs" color="text.secondary" fontWeight="500">
                    Create a new 12-word seed phrase and derive your first account
                  </Text>
                </VStack>
                {isSubmitting && <Spinner size="sm" color="accent.primary" flexShrink={0} />}
              </HStack>
            </Box>

            <Box
              as="button"
              w="full"
              p={4}
              bg="surface.raised"
              border="2px solid"
              borderColor="border.default"
              borderRadius="lg"
              boxShadow="card"
              textAlign="left"
              disabled={isSubmitting}
              opacity={isSubmitting ? 0.6 : 1}
              cursor={isSubmitting ? "not-allowed" : "pointer"}
              onClick={() => setMode("import")}
              _hover={isSubmitting ? {} : { bg: "surface.raisedHover" }}
            >
              <HStack spacing={3} align="center">
                <IconBox size="32px" bg="accent.secondary" noShadow>
                  <DownloadIcon color="accentFg.secondary" boxSize="14px" />
                </IconBox>
                <VStack align="start" spacing={1} flex={1}>
                  <Text fontSize="sm" fontWeight="900" color="text.primary" textTransform="uppercase">
                    Import Existing
                  </Text>
                  <Text fontSize="xs" color="text.secondary" fontWeight="500">
                    Import a 12-word seed phrase from another wallet
                  </Text>
                </VStack>
              </HStack>
            </Box>
          </VStack>
      </Wrapper>
    );
  }

  // Generate mode form (display name + generate button)
  if (mode === "generate") {
    return (
      <Wrapper isOnboarding={isOnboarding}>
          <Header isOnboarding={isOnboarding} title="Generate Seed Phrase" onBackClick={() => setMode("choose")} />

          {onCollect ? (
            <Box
              bg="surface.raised"
              border="2px solid"
              borderColor="border.default"
              borderRadius="lg"
              boxShadow="card"
              p={4}
            >
              <Text fontSize="sm" color="text.secondary" fontWeight="500">
                A new 12-word recovery phrase will be generated for your wallet. You can name your account later from settings.
              </Text>
            </Box>
          ) : (
            <Box
              bg="surface.raised"
              border="2px solid"
              borderColor="border.default"
              borderRadius="lg"
              boxShadow="card"
              p={4}
            >
              <VStack spacing={4} align="stretch">
                <FormControl>
                  <FormLabel fontSize="xs" color="text.secondary" fontWeight="700" textTransform="uppercase">
                    Group Name (Optional)
                  </FormLabel>
                  <Input
                    placeholder="e.g., My Seed Wallet"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                  />
                </FormControl>

                <FormControl>
                  <FormLabel fontSize="xs" color="text.secondary" fontWeight="700" textTransform="uppercase">
                    Account Display Name (Optional)
                  </FormLabel>
                  <Input
                    placeholder="e.g., Main Account"
                    value={accountDisplayName}
                    onChange={(e) => setAccountDisplayName(e.target.value)}
                  />
                </FormControl>
              </VStack>
            </Box>
          )}

          {error && (
            <Box bg="status.error.bg" border="2px solid" borderColor="status.error.border" borderRadius="md" p={2}>
              <Text fontSize="xs" color="status.error.fg" fontWeight="700">
                {error}
              </Text>
            </Box>
          )}

          <Button
            variant="primary"
            w="full"
            onClick={handleGenerate}
            isLoading={isSubmitting}
            loadingText="Generating..."
          >
            Generate Seed Phrase
          </Button>
      </Wrapper>
    );
  }

  // Address picker (shown after validating an imported mnemonic).
  // Lets the user select one or more addresses to import — covers wallets that
  // shifted the user's "first" address to a non-zero BIP44 index, and matches
  // MetaMask/Rabby's standard import UX.
  if (mode === "pick" && pickerMnemonic) {
    return (
      <SeedAddressPicker
        title="Select Addresses"
        source={{ kind: "mnemonic", mnemonic: pickerMnemonic }}
        variant={isOnboarding ? "onboarding" : "panel"}
        isSubmitting={isSubmitting}
        onBack={() => {
          setMode("import");
          setPickerMnemonic(null);
        }}
        onSubmit={handlePickerSubmit}
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
              Pick which addresses from this seed phrase to add.
            </Text>
          </Box>
        }
      />
    );
  }

  // Import mode form
  return (
    <Wrapper isOnboarding={isOnboarding}>
        <Header isOnboarding={isOnboarding} title="Import Seed Phrase" onBackClick={() => setMode("choose")} />

        <Box
          bg="surface.raised"
          border="2px solid"
          borderColor="border.default"
          borderRadius="lg"
          boxShadow="card"
          p={4}
        >
          <VStack spacing={4} align="stretch">
            <FormControl isInvalid={!!error}>
              <FormLabel fontSize="xs" color="text.secondary" fontWeight="700" textTransform="uppercase">
                12-Word Seed Phrase
              </FormLabel>
              <Textarea
                placeholder="Enter your 12-word seed phrase separated by spaces"
                value={importedMnemonic}
                onChange={(e) => {
                  setImportedMnemonic(e.target.value);
                  if (error) setError(null);
                }}
                fontFamily="mono"
                fontSize="sm"
                rows={3}
                resize="none"
              />
              <FormErrorMessage color="chart.negative" fontWeight="700">
                {error}
              </FormErrorMessage>
            </FormControl>

            {!onCollect && (
              <>
                <FormControl>
                  <FormLabel fontSize="xs" color="text.secondary" fontWeight="700" textTransform="uppercase">
                    Group Name (Optional)
                  </FormLabel>
                  <Input
                    placeholder="e.g., My Imported Seed"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                  />
                </FormControl>

                <FormControl>
                  <FormLabel fontSize="xs" color="text.secondary" fontWeight="700" textTransform="uppercase">
                    Account Display Name (Optional)
                  </FormLabel>
                  <Input
                    placeholder="e.g., Main Account"
                    value={accountDisplayName}
                    onChange={(e) => setAccountDisplayName(e.target.value)}
                  />
                </FormControl>
              </>
            )}
          </VStack>
        </Box>

        <Box
          bg="status.warning.bg"
          border="2px solid"
          borderColor="status.warning.border"
          borderRadius="lg"
          boxShadow="card"
          p={3}
        >
          <Text fontSize="sm" color="status.warning.fg" fontWeight="700">
            Your seed phrase will be encrypted and stored locally. Never share it with anyone.
          </Text>
        </Box>

        <Button
          variant="primary"
          w="full"
          onClick={handleImport}
          isLoading={isSubmitting}
          loadingText="Deriving..."
          isDisabled={!importedMnemonic.trim()}
        >
          Continue
        </Button>
    </Wrapper>
  );
}

export default memo(SeedPhraseSetup);
