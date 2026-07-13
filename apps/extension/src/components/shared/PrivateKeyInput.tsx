import { useEffect, useRef, useState } from "react";
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
  Checkbox,
} from "@chakra-ui/react";
import {
  ExternalLinkIcon,
  ViewIcon,
  ViewOffIcon,
  CheckIcon,
  RepeatIcon,
  CopyIcon,
} from "@chakra-ui/icons";
import { generatePrivateKey } from "@/utils/privateKeyUtils";
import MiddleTruncatedAddress from "@/components/MiddleTruncatedAddress";
import { CopyButton } from "@/components/CopyButton";

type PkMode = "import" | "generate";

interface PrivateKeyInputProps {
  privateKey: string;
  onPrivateKeyChange: (key: string) => void;
  derivedAddress: string | null;
  error?: string;
  onClearError?: () => void;
  onContinue?: () => void;
  autoFocus?: boolean;
  safetyNotice?: string;
  requireGeneratedBackupConfirmation?: boolean;
  onGeneratedBackupStateChange?: (
    isGenerated: boolean,
    isConfirmed: boolean,
  ) => void;
}

export default function PrivateKeyInput({
  privateKey,
  onPrivateKeyChange,
  derivedAddress,
  error,
  onClearError,
  onContinue,
  autoFocus,
  safetyNotice,
  requireGeneratedBackupConfirmation = false,
  onGeneratedBackupStateChange,
}: PrivateKeyInputProps) {
  const [pkMode, setPkMode] = useState<PkMode>("import");
  const [showPrivateKey, setShowPrivateKey] = useState(false);
  const [pkCopied, setPkCopied] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [showUpdateGlow, setShowUpdateGlow] = useState(false);
  const [hasInteractedWithGeneratedKey, setHasInteractedWithGeneratedKey] =
    useState(false);
  const [generatedBackupConfirmed, setGeneratedBackupConfirmed] =
    useState(false);
  const regenerationTimerRef = useRef<number | null>(null);
  const glowTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (regenerationTimerRef.current !== null) {
        window.clearTimeout(regenerationTimerRef.current);
      }
      if (glowTimerRef.current !== null) {
        window.clearTimeout(glowTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    onGeneratedBackupStateChange?.(
      pkMode === "generate",
      pkMode !== "generate" ||
        (hasInteractedWithGeneratedKey && generatedBackupConfirmed),
    );
  }, [
    generatedBackupConfirmed,
    hasInteractedWithGeneratedKey,
    onGeneratedBackupStateChange,
    pkMode,
  ]);

  const markGeneratedValuesUpdated = () => {
    if (glowTimerRef.current !== null) {
      window.clearTimeout(glowTimerRef.current);
    }
    setShowUpdateGlow(true);
    glowTimerRef.current = window.setTimeout(() => {
      setShowUpdateGlow(false);
      glowTimerRef.current = null;
    }, 650);
  };

  const applyGeneratedKey = () => {
    onPrivateKeyChange(generatePrivateKey());
    setShowPrivateKey(false);
    setPkCopied(false);
    setHasInteractedWithGeneratedKey(false);
    setGeneratedBackupConfirmed(false);
    markGeneratedValuesUpdated();
  };

  const regenerateKey = () => {
    if (isRegenerating) return;

    setIsRegenerating(true);
    setShowUpdateGlow(false);
    regenerationTimerRef.current = window.setTimeout(() => {
      applyGeneratedKey();
      setIsRegenerating(false);
      regenerationTimerRef.current = null;
    }, 550);
  };

  return (
    <>
      <HStack
        spacing={1}
        mb={4}
        p={1}
        bg="surface.sunken"
        border="1px solid"
        borderColor="border.subtle"
        borderRadius="md"
      >
        <Button
          flex={1}
          size="sm"
          variant="ghost"
          bg={pkMode === "import" ? "surface.raisedHover" : "transparent"}
          color={pkMode === "import" ? "fg.primary" : "fg.secondary"}
          fontWeight="600"
          onClick={() => {
            setPkMode("import");
            if (regenerationTimerRef.current !== null) {
              window.clearTimeout(regenerationTimerRef.current);
              regenerationTimerRef.current = null;
            }
            setIsRegenerating(false);
            setShowUpdateGlow(false);
            setHasInteractedWithGeneratedKey(false);
            setGeneratedBackupConfirmed(false);
            onPrivateKeyChange("");
          }}
          _hover={{ bg: "surface.raisedHover", color: "fg.primary" }}
        >
          Import existing
        </Button>
        <Button
          flex={1}
          size="sm"
          variant="ghost"
          bg={pkMode === "generate" ? "surface.raisedHover" : "transparent"}
          color={pkMode === "generate" ? "fg.primary" : "fg.secondary"}
          fontWeight="600"
          onClick={() => {
            setPkMode("generate");
            applyGeneratedKey();
          }}
          _hover={{ bg: "surface.raisedHover", color: "fg.primary" }}
        >
          Generate new
        </Button>
      </HStack>

      {pkMode === "import" ? (
        <VStack spacing={3} align="stretch">
          <FormControl isInvalid={!!error}>
            <FormLabel color="fg.secondary" fontSize="sm" fontWeight="600">
              Private key
            </FormLabel>
            <InputGroup>
              <Input
                type={showPrivateKey ? "text" : "password"}
                placeholder="0x..."
                value={privateKey}
                autoComplete="off"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                autoFocus={autoFocus}
                fontFamily="mono"
                onChange={(e) => {
                  onPrivateKeyChange(e.target.value);
                  if (error) onClearError?.();
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") onContinue?.();
                }}
                pr="3rem"
              />
              <InputRightElement>
                <IconButton
                  aria-label={showPrivateKey ? "Hide" : "Show"}
                  icon={showPrivateKey ? <ViewOffIcon /> : <ViewIcon />}
                  size="sm"
                  variant="ghost"
                  onClick={() => setShowPrivateKey(!showPrivateKey)}
                  color="text.secondary"
                  tabIndex={-1}
                />
              </InputRightElement>
            </InputGroup>
            <FormErrorMessage color="chart.negative" fontWeight="700">
              {error}
            </FormErrorMessage>
          </FormControl>
          {safetyNotice && (
            <Box
              p={3}
              bg="status.warning.bg"
              border="1px solid"
              borderColor="status.warning.border"
              borderRadius="md"
            >
              <Text fontSize="sm" color="status.warning.fg" fontWeight="600">
                {safetyNotice}
              </Text>
            </Box>
          )}
        </VStack>
      ) : (
        <VStack spacing={4} align="stretch">
          <FormControl isInvalid={!!error}>
            <HStack justify="space-between" align="center" mb={2}>
              <FormLabel
                color="fg.primary"
                fontSize="md"
                fontWeight="700"
                mb={0}
              >
                Generated private key
              </FormLabel>
              <Button
                size="xs"
                minW="116px"
                variant="ghost"
                leftIcon={<RepeatIcon boxSize="12px" />}
                isLoading={isRegenerating}
                onClick={regenerateKey}
                flexShrink={0}
                color="fg.secondary"
                _hover={{ color: "accent.highlight", bg: "surface.raisedHover" }}
              >
                Generate again
              </Button>
            </HStack>
            <InputGroup
              borderRadius="md"
              boxShadow={
                showUpdateGlow
                  ? "0 0 0 1px var(--chakra-colors-accent-highlight), 0 0 10px var(--chakra-colors-status-warning-border)"
                  : "none"
              }
              transitionProperty="box-shadow"
              transitionDuration="slow"
            >
              <Input
                type={showPrivateKey ? "text" : "password"}
                value={privateKey}
                readOnly
                autoComplete="off"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                fontFamily="mono"
                fontSize="sm"
                minH="56px"
                pr="4.5rem"
                bg={
                  showUpdateGlow ? "status.warning.bg" : "status.warning.tint"
                }
                borderColor={
                  showUpdateGlow ? "accent.highlight" : "status.warning.border"
                }
                transitionProperty="background-color, border-color"
                transitionDuration="slow"
              />
              <InputRightElement w="4.5rem" h="full">
                <HStack spacing={0}>
                  <IconButton
                    aria-label={showPrivateKey ? "Hide" : "Show"}
                    icon={showPrivateKey ? <ViewOffIcon /> : <ViewIcon />}
                    size="xs"
                    variant="ghost"
                    onClick={() => {
                      setShowPrivateKey(!showPrivateKey);
                      setHasInteractedWithGeneratedKey(true);
                    }}
                    color="text.secondary"
                    tabIndex={-1}
                  />
                  <IconButton
                    aria-label="Copy private key"
                    icon={pkCopied ? <CheckIcon color="chart.positive" /> : <CopyIcon />}
                    size="xs"
                    variant="ghost"
                    onClick={async () => {
                      await navigator.clipboard.writeText(privateKey);
                      setPkCopied(true);
                      setHasInteractedWithGeneratedKey(true);
                      setTimeout(() => setPkCopied(false), 2000);
                    }}
                    color={pkCopied ? "accent.highlight" : "fg.secondary"}
                  />
                </HStack>
              </InputRightElement>
            </InputGroup>
            <FormErrorMessage color="chart.negative" fontWeight="700">
              {error}
            </FormErrorMessage>
            <Box
              mt={3}
              p={3}
              bg="status.warning.bg"
              border="1px solid"
              borderColor="status.warning.border"
              borderRadius="md"
            >
              <Text
                fontSize="sm"
                color="status.warning.fg"
                fontWeight="600"
                lineHeight="1.45"
              >
                Store this key safely.
                <br />
                It cannot be recovered if lost.
                <br />
                Never share with anyone.
              </Text>
            </Box>
            {requireGeneratedBackupConfirmation && (
              <Checkbox
                mt={3}
                isChecked={generatedBackupConfirmed}
                isDisabled={!hasInteractedWithGeneratedKey}
                onChange={(event) =>
                  setGeneratedBackupConfirmed(event.target.checked)
                }
                colorScheme="yellow"
              >
                <Text fontSize="sm" color="fg.primary" fontWeight="600">
                  I saved this private key
                </Text>
              </Checkbox>
            )}
          </FormControl>
        </VStack>
      )}

      {derivedAddress && (
        <VStack mt={4} spacing={1.5} align="stretch">
          <Text fontSize="sm" color="fg.secondary" fontWeight="600">
            Account address
          </Text>
          <HStack
            minH="48px"
            spacing={2}
            px={3}
            py={2}
            bg="surface.raised"
            border="1px solid"
            borderColor="border.subtle"
            borderRadius="md"
            color="fg.secondary"
          >
            <Box flex={1} minW={0}>
              <MiddleTruncatedAddress address={derivedAddress} />
            </Box>
            <CopyButton value={derivedAddress} label="Copy account address" />
            <IconButton
              aria-label="View account on Etherscan"
              icon={<ExternalLinkIcon boxSize="12px" />}
              size="xs"
              variant="ghost"
              color="fg.secondary"
              onClick={() =>
                window.open(
                  `https://etherscan.io/address/${derivedAddress}`,
                  "_blank",
                  "noopener,noreferrer",
                )
              }
              _hover={{ color: "accent.highlight", bg: "surface.raisedHover" }}
            />
          </HStack>
        </VStack>
      )}
    </>
  );
}
