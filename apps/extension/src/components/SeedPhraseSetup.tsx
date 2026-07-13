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
  type ButtonProps,
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
import {
  AppHeader,
  AppScreen,
  ListItem,
  ListItemContent,
  ListItemDescription,
  ListItemMedia,
  ListItemTitle,
  ListSurface,
  ScreenBody,
  ScreenSection,
  StickyActionBar,
} from "@/components/ui";

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
const SetupFrame = ({
  isOnboarding,
  title,
  onBack,
  action,
  children,
}: {
  isOnboarding: boolean;
  title: string;
  onBack: () => void;
  action?: React.ReactElement<ButtonProps>;
  children: React.ReactNode;
}) =>
  isOnboarding ? (
    <VStack spacing={6} w="full" maxW="400px" align="stretch">
      <HStack w="full" justify="space-between" align="center">
        <IconButton
          aria-label="Back"
          icon={<ArrowBackIcon />}
          variant="ghost"
          size="sm"
          onClick={onBack}
        />
        <Text fontWeight="700" fontSize="md" color="fg.primary" flex={1} textAlign="center" mx={2}>
          {title}
        </Text>
        <Box w="32px" flexShrink={0} />
      </HStack>
      {children}
      {action}
    </VStack>
  ) : (
    <AppScreen>
      <AppHeader title={title} onBack={onBack} />
      <ScreenBody pt={5}>
        <VStack spacing={6} align="stretch">{children}</VStack>
      </ScreenBody>
      {action && <StickyActionBar primaryAction={action} />}
    </AppScreen>
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
      // Generate in renderer memory first. Persisting the encrypted phrase and
      // account happens only after the user explicitly confirms they saved it.
      // Pressing Back before confirmation therefore cannot leave a hidden,
      // un-backed-up account behind.
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
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate seed phrase");
      setIsSubmitting(false);
    }
  };

  const handleConfirmGenerated = async () => {
    if (!generatedMnemonic || isSubmitting) return;
    setIsSubmitting(true);
    setError(null);
    try {
      if (onCollect) {
        setConfirmed(true);
        onCollect(
          generatedMnemonic,
          [0],
          displayName.trim() || undefined,
          accountDisplayName.trim() || undefined,
        );
        return;
      }

      const response = await new Promise<{
        success: boolean;
        error?: string;
      }>((resolve) => {
        chrome.runtime.sendMessage(
          {
            type: "addSeedPhraseGroup",
            mnemonic: generatedMnemonic,
            indices: [0],
            name: displayName.trim() || undefined,
            accountDisplayName: accountDisplayName.trim() || undefined,
          },
          resolve,
        );
      });
      if (!response.success) {
        throw new Error(response.error || "Failed to save seed phrase");
      }

      setConfirmed(true);
      toast({
        title: "Account added",
        description: "Seed phrase account has been created",
        status: "success",
        duration: 2000,
      });
      onComplete();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save seed phrase");
    } finally {
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
      <SetupFrame
        isOnboarding={isOnboarding}
        title="Save your seed phrase"
        onBack={() => {
              if (!confirmed) {
                setGeneratedMnemonic(null);
                setMode("choose");
              } else {
                onComplete();
              }
        }}
        action={
          <Button
            variant="brand"
            w="full"
            onClick={handleConfirmGenerated}
            isLoading={isSubmitting}
            loadingText="Saving…"
          >
            I’ve saved my seed phrase
          </Button>
        }
      >

          <Box
            bg="status.error.bg"
            border="1px solid"
            borderColor="status.error.border"
            borderRadius="md"
            p={3}
          >
            <Text fontSize="sm" color="status.error.fg" fontWeight="600">
              Write down these 12 words in order. They are the only way to recover these accounts. Never share them.
            </Text>
          </Box>

          {error && (
            <Box
              bg="status.error.bg"
              border="1px solid"
              borderColor="status.error.border"
              borderRadius="md"
              p={3}
            >
              <Text fontSize="sm" color="status.error.fg" fontWeight="600">
                {error}
              </Text>
            </Box>
          )}

          <ScreenSection title="Recovery phrase">
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
                  border="1px solid"
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
          </ScreenSection>
      </SetupFrame>
    );
  }

  // Choose mode: generate or import
  if (mode === "choose") {
    return (
      <SetupFrame isOnboarding={isOnboarding} title="Seed phrase" onBack={onBack}>
        <ScreenSection title="Choose how to continue">
          <ListSurface>
            <ListItem
              interactive
              isDisabled={isSubmitting}
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
            >
              <ListItemMedia>
                <IconBox
                  size="36px"
                  bg="status.warning.bg"
                  borderColor="status.warning.border"
                  noShadow
                >
                  <AddIcon color="status.warning.fg" boxSize="16px" />
                </IconBox>
              </ListItemMedia>
              <ListItemContent>
                <ListItemTitle>Generate new phrase</ListItemTitle>
                <ListItemDescription>
                  Create 12 recovery words and your first account
                </ListItemDescription>
              </ListItemContent>
              {isSubmitting && <Spinner size="sm" color="accent.primary" flexShrink={0} />}
            </ListItem>

            <ListItem
              interactive
              isDisabled={isSubmitting}
              onClick={() => setMode("import")}
            >
              <ListItemMedia>
                <IconBox
                  size="36px"
                  bg="status.info.bg"
                  borderColor="status.info.border"
                  noShadow
                >
                  <DownloadIcon color="status.info.fg" boxSize="16px" />
                </IconBox>
              </ListItemMedia>
              <ListItemContent>
                <ListItemTitle>Import existing phrase</ListItemTitle>
                <ListItemDescription>
                  Add 12 recovery words from another wallet
                </ListItemDescription>
              </ListItemContent>
            </ListItem>
          </ListSurface>
        </ScreenSection>
      </SetupFrame>
    );
  }

  // Generate mode form (display name + generate button)
  if (mode === "generate") {
    return (
      <SetupFrame
        isOnboarding={isOnboarding}
        title="Generate seed phrase"
        onBack={() => setMode("choose")}
        action={
          <Button
            variant="brand"
            w="full"
            onClick={handleGenerate}
            isLoading={isSubmitting}
            loadingText="Generating…"
          >
            Generate seed phrase
          </Button>
        }
      >
          {onCollect ? (
            <Box
              bg="surface.sunken"
              border="1px solid"
              borderColor="border.subtle"
              borderRadius="md"
              p={3}
            >
              <Text fontSize="sm" color="fg.secondary">
                A new 12-word recovery phrase will be generated for your wallet. You can name your account later from settings.
              </Text>
            </Box>
          ) : (
            <ScreenSection
              title="Name your seed group"
              description="Both names are optional and can be changed later."
            >
              <VStack spacing={4} align="stretch">
                <FormControl>
                  <FormLabel>Group name (optional)</FormLabel>
                  <Input
                    placeholder="e.g., My Seed Wallet"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                  />
                </FormControl>

                <FormControl>
                  <FormLabel>Account display name (optional)</FormLabel>
                  <Input
                    placeholder="e.g., Main Account"
                    value={accountDisplayName}
                    onChange={(e) => setAccountDisplayName(e.target.value)}
                  />
                </FormControl>
              </VStack>
            </ScreenSection>
          )}

          {error && (
            <Box bg="status.error.bg" border="1px solid" borderColor="status.error.border" borderRadius="md" p={3}>
              <Text fontSize="sm" color="status.error.fg" fontWeight="600">
                {error}
              </Text>
            </Box>
          )}
      </SetupFrame>
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
            border="1px solid"
            borderColor="border.subtle"
            borderRadius="md"
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
    <SetupFrame
      isOnboarding={isOnboarding}
      title="Import seed phrase"
      onBack={() => setMode("choose")}
      action={
        <Button
          variant="primary"
          w="full"
          onClick={handleImport}
          isLoading={isSubmitting}
          loadingText="Deriving…"
          isDisabled={!importedMnemonic.trim()}
        >
          Continue
        </Button>
      }
    >
        <ScreenSection
          title="Enter your recovery phrase"
          description="Use the exact 12 words in the original order."
        >
          <VStack spacing={4} align="stretch">
            <FormControl isInvalid={!!error}>
              <FormLabel>12-word seed phrase</FormLabel>
              <Textarea
                placeholder="Enter your 12-word seed phrase separated by spaces"
                value={importedMnemonic}
                autoComplete="off"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
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
                  <FormLabel>Group name (optional)</FormLabel>
                  <Input
                    placeholder="e.g., My Imported Seed"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                  />
                </FormControl>

                <FormControl>
                  <FormLabel>Account display name (optional)</FormLabel>
                  <Input
                    placeholder="e.g., Main Account"
                    value={accountDisplayName}
                    onChange={(e) => setAccountDisplayName(e.target.value)}
                  />
                </FormControl>
              </>
            )}
          </VStack>
        </ScreenSection>

        <Box
          bg="status.warning.bg"
          border="1px solid"
          borderColor="status.warning.border"
          borderRadius="md"
          p={3}
        >
          <Text fontSize="sm" color="status.warning.fg" fontWeight="600">
            Your seed phrase will be encrypted and stored locally. Never share it with anyone.
          </Text>
        </Box>
    </SetupFrame>
  );
}

export default memo(SeedPhraseSetup);
