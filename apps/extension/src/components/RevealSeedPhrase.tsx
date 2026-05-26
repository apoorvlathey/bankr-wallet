import { useState, useRef, useEffect, memo } from "react";
import {
  Box,
  VStack,
  HStack,
  Text,
  Input,
  Button,
  InputGroup,
  InputRightElement,
  IconButton,
  Code,
  Spacer,
} from "@chakra-ui/react";
import {
  ViewIcon,
  ViewOffIcon,
  CopyIcon,
  CheckIcon,
  LockIcon,
  ArrowBackIcon,
} from "@chakra-ui/icons";
import { useTheme } from "@/theme";
import type { Account, PasswordType } from "@/chrome/types";
import { truncateAddress } from "@/lib/addressUtils";

interface Props {
  account: Account | null;
  onBack: () => void;
}

function RevealSeedPhrase({ account, onBack }: Props) {
  const { themeId } = useTheme();
  const isDarkTheme = themeId === "midnight";
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showPhrase, setShowPhrase] = useState(false);
  const [mnemonic, setMnemonic] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [passwordType, setPasswordType] = useState<PasswordType | null>(null);
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [isAgentPasswordEnabled, setIsAgentPasswordEnabled] = useState(false);
  const passwordInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setIsCheckingSession(true);
    chrome.runtime.sendMessage(
      { type: "getPasswordType" },
      (response: { passwordType: PasswordType | null }) => {
        setPasswordType(response.passwordType);
        setIsCheckingSession(false);
        if (response.passwordType !== "agent") {
          setTimeout(() => passwordInputRef.current?.focus(), 100);
        }
      },
    );
    chrome.runtime.sendMessage(
      { type: "isAgentPasswordEnabled" },
      (response: { enabled: boolean }) => {
        setIsAgentPasswordEnabled(response.enabled);
      },
    );
  }, []);

  const handleReveal = () => {
    if (!password || !account || account.type !== "seedPhrase") return;
    setError("");
    setIsLoading(true);

    chrome.runtime.sendMessage(
      { type: "revealSeedPhrase", seedGroupId: account.seedGroupId, password },
      (result: { success: boolean; mnemonic?: string; error?: string }) => {
        setIsLoading(false);
        if (result.success && result.mnemonic) {
          setMnemonic(result.mnemonic);
        } else {
          setError(result.error || "Failed to reveal seed phrase");
        }
      },
    );
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(mnemonic);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = mnemonic;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const revealed = !!mnemonic;

  return (
    <VStack spacing={4} align="stretch">
      <HStack>
        <IconButton
          aria-label="Back"
          icon={<ArrowBackIcon />}
          variant="ghost"
          size="sm"
          onClick={onBack}
        />
        <Text
          fontSize="lg"
          fontWeight="900"
          color="text.primary"
          textTransform="uppercase"
          letterSpacing="tight"
        >
          Reveal Seed Phrase
        </Text>
        <Spacer />
      </HStack>

      {isCheckingSession ? (
        <Text color="text.secondary" fontSize="sm" fontWeight="500">
          Checking session...
        </Text>
      ) : passwordType === "agent" ? (
        <VStack spacing={3} align="stretch">
          <Box
            w="full"
            p={3}
            bg="status.warning.bg"
            border={isDarkTheme ? "1px solid" : "2px solid"}
            borderColor="status.warning.border"
            borderRadius={isDarkTheme ? "md" : undefined}
          >
            <HStack spacing={2}>
              <LockIcon color="status.warning.fg" />
              <Text color="status.warning.fg" fontSize="sm" fontWeight="700">
                You are unlocked with an agent password.
              </Text>
            </HStack>
          </Box>

          <Text color="text.secondary" fontSize="sm" fontWeight="500">
            Seed phrase reveal is only available when unlocked with your{" "}
            <Text as="span" fontWeight="700">
              master password
            </Text>
            .
          </Text>

          <Text color="text.secondary" fontSize="sm" fontWeight="500">
            To reveal the seed phrase:
          </Text>
          <Box pl={4} borderLeft="4px solid" borderColor="accent.secondary">
            <Text color="text.secondary" fontSize="sm">
              1. Lock your wallet
            </Text>
            <Text color="text.secondary" fontSize="sm">
              2. Unlock with your master password
            </Text>
            <Text color="text.secondary" fontSize="sm">
              3. Try revealing the seed phrase again
            </Text>
          </Box>

          <Button
            variant="secondary"
            size="sm"
            onClick={onBack}
            alignSelf="flex-start"
          >
            Back
          </Button>
        </VStack>
      ) : !revealed ? (
        <VStack spacing={3} align="stretch">
          <Box
            w="full"
            p={3}
            bg="status.error.bg"
            border={isDarkTheme ? "1px solid" : "2px solid"}
            borderColor="status.error.border"
            borderRadius={isDarkTheme ? "md" : undefined}
          >
            <Text color="status.error.fg" fontSize="sm" fontWeight="700">
              Never share your seed phrase. Anyone with it has full control of
              all derived accounts.
            </Text>
          </Box>

          <Text color="text.secondary" fontSize="sm" fontWeight="500">
            Enter your{" "}
            {isAgentPasswordEnabled && (
              <Text as="span" fontWeight="700">
                Master{" "}
              </Text>
            )}
            password to reveal the seed phrase for{" "}
            <Text as="span" fontWeight="700" color="text.primary">
              {account?.displayName || truncateAddress(account?.address || "")}
            </Text>
          </Text>

          <InputGroup>
            <Input
              ref={passwordInputRef}
              type={showPassword ? "text" : "password"}
              placeholder={
                isAgentPasswordEnabled ? "Master Password" : "Password"
              }
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setError("");
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleReveal();
              }}
              isInvalid={!!error}
            />
            <InputRightElement>
              <IconButton
                aria-label={showPassword ? "Hide password" : "Show password"}
                icon={showPassword ? <ViewOffIcon /> : <ViewIcon />}
                size="sm"
                variant="ghost"
                onClick={() => setShowPassword(!showPassword)}
                color="text.secondary"
              />
            </InputRightElement>
          </InputGroup>

          {error && (
            <Text color="chart.negative" fontSize="sm" fontWeight="600">
              {error}
            </Text>
          )}

          <HStack spacing={2} justify="flex-end" pt={2}>
            <Button variant="secondary" size="sm" onClick={onBack}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleReveal}
              isLoading={isLoading}
              loadingText="Verifying..."
              isDisabled={!password}
            >
              Reveal
            </Button>
          </HStack>
        </VStack>
      ) : (
        <VStack spacing={3} align="stretch">
          <Box
            w="full"
            p={3}
            bg="status.error.bg"
            border={isDarkTheme ? "1px solid" : "2px solid"}
            borderColor="status.error.border"
            borderRadius={isDarkTheme ? "md" : undefined}
          >
            <Text color="status.error.fg" fontSize="sm" fontWeight="700">
              Do not share this seed phrase. Anyone with it can steal your
              funds.
            </Text>
          </Box>

          <Box
            w="full"
            p={3}
            bg="surface.sunken"
            border={isDarkTheme ? "1px solid" : "2px solid"}
            borderColor="border.default"
            borderRadius={isDarkTheme ? "md" : undefined}
            position="relative"
          >
            <Code
              fontSize="xs"
              fontFamily="mono"
              wordBreak="break-all"
              bg="transparent"
              color="text.primary"
              fontWeight="600"
            >
              {showPhrase
                ? mnemonic
                : mnemonic.split(" ").map(() => "****").join(" ")}
            </Code>
          </Box>

          <HStack spacing={2}>
            <Button
              size="sm"
              variant="secondary"
              leftIcon={showPhrase ? <ViewOffIcon /> : <ViewIcon />}
              onClick={() => setShowPhrase(!showPhrase)}
              flex={1}
            >
              {showPhrase ? "Hide" : "Show"}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              leftIcon={copied ? <CheckIcon /> : <CopyIcon />}
              onClick={handleCopy}
              flex={1}
            >
              {copied ? "Copied!" : "Copy"}
            </Button>
          </HStack>

          <Button
            variant="secondary"
            size="sm"
            onClick={onBack}
            alignSelf="flex-end"
          >
            Done
          </Button>
        </VStack>
      )}
    </VStack>
  );
}

export default memo(RevealSeedPhrase);
