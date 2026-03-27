import { useState, useEffect, memo } from "react";
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
  Textarea,
} from "@chakra-ui/react";
import { useBauhausToast } from "@/hooks/useBauhausToast";
import { ArrowBackIcon, CopyIcon, CheckIcon, ViewIcon, ViewOffIcon } from "@chakra-ui/icons";

type Mode = "choose" | "generate" | "import";

interface SeedPhraseSetupProps {
  onBack: () => void;
  onComplete: () => void;
  /** When provided, collect mnemonic without saving (for onboarding flow where wallet isn't unlocked yet) */
  onCollect?: (mnemonic: string, groupName?: string, accountDisplayName?: string) => void;
}

function SeedPhraseSetup({ onBack, onComplete, onCollect }: SeedPhraseSetupProps) {
  const toast = useBauhausToast();

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

  // When switching to generate mode, request a new mnemonic from background
  useEffect(() => {
    if (mode === "generate" && !generatedMnemonic) {
      // We'll generate when we submit - background handler does it
      // For now, just show the UI
    }
  }, [mode]);

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
    setIsSubmitting(true);
    setError(null);

    const trimmed = importedMnemonic.trim().toLowerCase().replace(/\s+/g, " ");
    const words = trimmed.split(" ");

    if (words.length !== 12) {
      setError("Seed phrase must be exactly 12 words");
      setIsSubmitting(false);
      return;
    }

    try {
      if (onCollect) {
        // collectOnly mode: validate locally, don't save yet
        onCollect(
          trimmed,
          displayName.trim() || undefined,
          accountDisplayName.trim() || undefined
        );
        setIsSubmitting(false);
      } else {
        // Normal mode: save via addSeedPhraseGroup
        const response = await new Promise<{
          success: boolean;
          error?: string;
          account?: any;
          group?: any;
        }>((resolve) => {
          chrome.runtime.sendMessage(
            {
              type: "addSeedPhraseGroup",
              mnemonic: trimmed,
              name: displayName.trim() || undefined,
              accountDisplayName: accountDisplayName.trim() || undefined,
            },
            resolve
          );
        });

        if (!response.success) {
          setError(response.error || "Failed to import seed phrase");
          setIsSubmitting(false);
          return;
        }

        toast({
          title: "Seed phrase imported",
          description: "First account has been derived",
          status: "success",
          duration: 2000,
        });

        onComplete();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to import seed phrase");
      setIsSubmitting(false);
    }
  };

  // After generating: show the mnemonic grid and confirm button
  if (generatedMnemonic) {
    const words = generatedMnemonic.split(" ");
    return (
      <Box p={4} minH="100%" bg="bg.base">
        <VStack spacing={4} align="stretch">
          <HStack spacing={3}>
            <IconButton
              aria-label="Back"
              icon={<ArrowBackIcon />}
              variant="ghost"
              size="sm"
              onClick={() => {
                if (!confirmed) {
                  setGeneratedMnemonic(null);
                  setMode("choose");
                } else {
                  onComplete();
                }
              }}
            />
            <Text fontWeight="900" fontSize="lg" color="text.primary" textTransform="uppercase" letterSpacing="wide">
              Save Your Seed Phrase
            </Text>
          </HStack>

          <Box
            bg="bauhaus.red"
            border="3px solid"
            borderColor="bauhaus.black"
            boxShadow="4px 4px 0px 0px #121212"
            p={3}
          >
            <Text fontSize="xs" color="bauhaus.white" fontWeight="700">
              Write down these 12 words in order. This is the ONLY way to recover your accounts. Never share your seed phrase!
            </Text>
          </Box>

          <Box
            bg="bauhaus.white"
            border="3px solid"
            borderColor="bauhaus.black"
            boxShadow="4px 4px 0px 0px #121212"
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
                color={mnemonicCopied ? "bauhaus.yellow" : undefined}
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
                  bg="bg.muted"
                  border="2px solid"
                  borderColor="bauhaus.black"
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
                // collectOnly mode: pass mnemonic back without saving
                onCollect(
                  generatedMnemonic,
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
        </VStack>
      </Box>
    );
  }

  // Choose mode: generate or import
  if (mode === "choose") {
    return (
      <Box p={4} minH="100%" bg="bg.base">
        <VStack spacing={4} align="stretch">
          <HStack spacing={3}>
            <IconButton
              aria-label="Back"
              icon={<ArrowBackIcon />}
              variant="ghost"
              size="sm"
              onClick={onBack}
            />
            <Text fontWeight="900" fontSize="lg" color="text.primary" textTransform="uppercase" letterSpacing="wide">
              Seed Phrase
            </Text>
          </HStack>

          <VStack spacing={3}>
            <Box
              as="button"
              w="full"
              p={4}
              bg="bauhaus.white"
              border="3px solid"
              borderColor="bauhaus.black"
              boxShadow="4px 4px 0px 0px #121212"
              textAlign="left"
              onClick={() => setMode("generate")}
              _hover={{ bg: "bg.muted" }}
            >
              <VStack align="start" spacing={1}>
                <Text fontSize="sm" fontWeight="900" color="text.primary" textTransform="uppercase">
                  Generate New
                </Text>
                <Text fontSize="xs" color="text.secondary" fontWeight="500">
                  Create a new 12-word seed phrase and derive your first account
                </Text>
              </VStack>
            </Box>

            <Box
              as="button"
              w="full"
              p={4}
              bg="bauhaus.white"
              border="3px solid"
              borderColor="bauhaus.black"
              boxShadow="4px 4px 0px 0px #121212"
              textAlign="left"
              onClick={() => setMode("import")}
              _hover={{ bg: "bg.muted" }}
            >
              <VStack align="start" spacing={1}>
                <Text fontSize="sm" fontWeight="900" color="text.primary" textTransform="uppercase">
                  Import Existing
                </Text>
                <Text fontSize="xs" color="text.secondary" fontWeight="500">
                  Import a 12-word seed phrase from another wallet
                </Text>
              </VStack>
            </Box>
          </VStack>
        </VStack>
      </Box>
    );
  }

  // Generate mode form (display name + generate button)
  if (mode === "generate") {
    return (
      <Box p={4} minH="100%" bg="bg.base">
        <VStack spacing={4} align="stretch">
          <HStack spacing={3}>
            <IconButton
              aria-label="Back"
              icon={<ArrowBackIcon />}
              variant="ghost"
              size="sm"
              onClick={() => setMode("choose")}
            />
            <Text fontWeight="900" fontSize="lg" color="text.primary" textTransform="uppercase" letterSpacing="wide">
              Generate Seed Phrase
            </Text>
          </HStack>

          <Box
            bg="bauhaus.white"
            border="3px solid"
            borderColor="bauhaus.black"
            boxShadow="4px 4px 0px 0px #121212"
            p={4}
          >
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
          </Box>

          {error && (
            <Box bg="bauhaus.red" border="2px solid" borderColor="bauhaus.black" p={2}>
              <Text fontSize="xs" color="bauhaus.white" fontWeight="700">
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
        </VStack>
      </Box>
    );
  }

  // Import mode form
  return (
    <Box p={4} minH="100%" bg="bg.base">
      <VStack spacing={4} align="stretch">
        <HStack spacing={3}>
          <IconButton
            aria-label="Back"
            icon={<ArrowBackIcon />}
            variant="ghost"
            size="sm"
            onClick={() => setMode("choose")}
          />
          <Text fontWeight="900" fontSize="lg" color="text.primary" textTransform="uppercase" letterSpacing="wide">
            Import Seed Phrase
          </Text>
        </HStack>

        <Box
          bg="bauhaus.white"
          border="3px solid"
          borderColor="bauhaus.black"
          boxShadow="4px 4px 0px 0px #121212"
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
              <FormErrorMessage color="bauhaus.red" fontWeight="700">
                {error}
              </FormErrorMessage>
            </FormControl>

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
          </VStack>
        </Box>

        <Box
          bg="bauhaus.yellow"
          border="3px solid"
          borderColor="bauhaus.black"
          boxShadow="4px 4px 0px 0px #121212"
          p={3}
        >
          <Text fontSize="sm" color="bauhaus.black" fontWeight="700">
            Your seed phrase will be encrypted and stored locally. Never share it with anyone.
          </Text>
        </Box>

        <Button
          variant="primary"
          w="full"
          onClick={handleImport}
          isLoading={isSubmitting}
          loadingText="Importing..."
          isDisabled={!importedMnemonic.trim()}
        >
          Import & Derive Account
        </Button>
      </VStack>
    </Box>
  );
}

export default memo(SeedPhraseSetup);
