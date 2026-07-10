import { useState, useRef, useEffect, memo } from "react";
import {
  Box,
  VStack,
  HStack,
  Text,
  Input,
  Button,
  FormControl,
  FormLabel,
  InputGroup,
  InputRightElement,
  IconButton,
  Code,
  SimpleGrid,
} from "@chakra-ui/react";
import {
  ViewIcon,
  ViewOffIcon,
  CopyIcon,
  CheckIcon,
  LockIcon,
} from "@chakra-ui/icons";
import type { Account, PasswordType } from "@/chrome/types";
import { truncateAddress } from "@/lib/addressUtils";
import {
  AppHeader,
  AppScreen,
  ScreenBody,
  ScreenSection,
  StickyActionBar,
} from "@/components/ui";

interface Props {
  account: Account | null;
  onBack: () => void;
}

function RevealSeedPhrase({ account, onBack }: Props) {
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
  const words = mnemonic.split(" ");

  return (
    <AppScreen>
      <AppHeader title="Reveal seed phrase" onBack={onBack} />
      <ScreenBody pt={5}>
        {isCheckingSession ? (
          <Text color="fg.secondary" fontSize="sm" aria-live="polite">
            Checking your session…
          </Text>
        ) : passwordType === "agent" ? (
          <VStack spacing={5} align="stretch">
            <ScreenSection
              title="Master password required"
              description="Seed phrases cannot be revealed while WalletChan is unlocked with an agent password."
            >
              <Box
                w="full"
                p={3}
                bg="status.warning.bg"
                border="1px solid"
                borderColor="status.warning.border"
                borderRadius="md"
              >
                <HStack spacing={2} align="start">
                  <LockIcon mt={0.5} color="status.warning.fg" />
                  <Text color="status.warning.fg" fontSize="sm" fontWeight="600">
                    Your agent session stays active, but secret access is blocked.
                  </Text>
                </HStack>
              </Box>
            </ScreenSection>

            <ScreenSection title="To continue">
              <VStack align="stretch" spacing={2} color="fg.secondary" fontSize="sm">
                <Text>1. Lock your wallet.</Text>
                <Text>2. Unlock with your master password.</Text>
                <Text>3. Open this account and reveal the phrase again.</Text>
              </VStack>
            </ScreenSection>
          </VStack>
        ) : !revealed ? (
          <VStack spacing={5} align="stretch">
            <Box
              w="full"
              p={3}
              bg="status.error.bg"
              border="1px solid"
              borderColor="status.error.border"
              borderRadius="md"
            >
              <Text color="status.error.fg" fontSize="sm" fontWeight="600">
                Never share your seed phrase. Anyone with it has full control of
                every account derived from it.
              </Text>
            </Box>

            <ScreenSection
              title="Verify it’s you"
              description={
                <>
                  Enter your {isAgentPasswordEnabled ? "master " : ""}password
                  to reveal the phrase for{" "}
                  <Text as="span" color="fg.primary" fontWeight="600">
                    {account?.displayName || truncateAddress(account?.address || "")}
                  </Text>
                  .
                </>
              }
            >
              <FormControl isInvalid={!!error}>
                <FormLabel>Password</FormLabel>
                <InputGroup>
                  <Input
                    ref={passwordInputRef}
                    type={showPassword ? "text" : "password"}
                    placeholder={
                      isAgentPasswordEnabled ? "Enter master password" : "Enter password"
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
                      color="fg.secondary"
                    />
                  </InputRightElement>
                </InputGroup>
                {error && (
                  <Text mt={2} color="status.error.fg" fontSize="sm" fontWeight="600" aria-live="polite">
                    {error}
                  </Text>
                )}
              </FormControl>
            </ScreenSection>
          </VStack>
        ) : (
          <VStack spacing={5} align="stretch">
            <Box
              w="full"
              p={3}
              bg="status.error.bg"
              border="1px solid"
              borderColor="status.error.border"
              borderRadius="md"
            >
              <Text color="status.error.fg" fontSize="sm" fontWeight="600">
                Keep these words private and in order. Anyone who has them can
                recover every account in this seed group.
              </Text>
            </Box>

            <ScreenSection title="Recovery phrase">
              <Box
                w="full"
                p={3}
                bg="surface.sunken"
                border="1px solid"
                borderColor="border.default"
                borderRadius="lg"
              >
                <SimpleGrid columns={2} spacing={2}>
                  {words.map((word, index) => (
                    <HStack key={index} spacing={2} minW={0}>
                      <Text minW="20px" color="fg.muted" fontSize="xs" textAlign="end">
                        {index + 1}
                      </Text>
                      <Code
                        bg="transparent"
                        color="fg.primary"
                        fontFamily="mono"
                        fontSize="sm"
                        fontWeight="500"
                        noOfLines={1}
                      >
                        {showPhrase ? word : "••••"}
                      </Code>
                    </HStack>
                  ))}
                </SimpleGrid>
              </Box>

              <HStack spacing={2} mt={3}>
                <Button
                  variant="secondary"
                  leftIcon={showPhrase ? <ViewOffIcon /> : <ViewIcon />}
                  onClick={() => setShowPhrase(!showPhrase)}
                  flex={1}
                >
                  {showPhrase ? "Hide" : "Show"}
                </Button>
                <Button
                  variant="secondary"
                  leftIcon={copied ? <CheckIcon /> : <CopyIcon />}
                  onClick={handleCopy}
                  flex={1}
                >
                  {copied ? "Copied" : "Copy"}
                </Button>
              </HStack>
            </ScreenSection>
          </VStack>
        )}
      </ScreenBody>

      {!isCheckingSession && passwordType === "agent" && (
        <StickyActionBar
          primaryAction={<Button variant="secondary" onClick={onBack}>Back</Button>}
        />
      )}
      {!isCheckingSession && passwordType !== "agent" && !revealed && (
        <StickyActionBar
          secondaryAction={<Button variant="secondary" onClick={onBack}>Cancel</Button>}
          primaryAction={
            <Button
              variant="primary"
              onClick={handleReveal}
              isLoading={isLoading}
              loadingText="Verifying…"
              isDisabled={!password}
            >
              Reveal phrase
            </Button>
          }
        />
      )}
      {revealed && (
        <StickyActionBar
          primaryAction={<Button variant="primary" onClick={onBack}>Done</Button>}
        />
      )}
    </AppScreen>
  );
}

export default memo(RevealSeedPhrase);
