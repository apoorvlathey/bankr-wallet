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

function RevealPrivateKey({ account, onBack }: Props) {
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [privateKey, setPrivateKey] = useState("");
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
    if (!password || !account) return;
    setError("");
    setIsLoading(true);

    chrome.runtime.sendMessage(
      { type: "revealPrivateKey", accountId: account.id, password },
      (result: { success: boolean; privateKey?: string; error?: string }) => {
        setIsLoading(false);
        if (result.success && result.privateKey) {
          setPrivateKey(result.privateKey);
        } else {
          setError(result.error || "Failed to reveal private key");
        }
      },
    );
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(privateKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = privateKey;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const revealed = !!privateKey;

  return (
    <AppScreen>
      <AppHeader title="Reveal private key" onBack={onBack} />
      <ScreenBody pt={5}>
        {isCheckingSession ? (
          <Text color="fg.secondary" fontSize="sm" aria-live="polite">
            Checking your session…
          </Text>
        ) : passwordType === "agent" ? (
          <VStack spacing={5} align="stretch">
            <ScreenSection
              title="Master password required"
              description="Private keys cannot be revealed while WalletChan is unlocked with an agent password."
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
                <Text>3. Open this account and reveal the key again.</Text>
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
                Never share your private key. Anyone with it has full control of
                this account.
              </Text>
            </Box>

            <ScreenSection
              title="Verify it’s you"
              description={
                <>
                  Enter your {isAgentPasswordEnabled ? "master " : ""}password
                  to reveal the key for{" "}
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
                Keep this key private. Anyone who has it can move this account’s funds.
              </Text>
            </Box>

            <ScreenSection title="Private key">
              <Box
                w="full"
                p={4}
                minH="88px"
                display="flex"
                alignItems="center"
                bg="surface.sunken"
                border="1px solid"
                borderColor="border.default"
                borderRadius="lg"
              >
                <Code
                  fontSize="sm"
                  lineHeight="1.6"
                  fontFamily="mono"
                  wordBreak="break-all"
                  bg="transparent"
                  color="fg.primary"
                  fontWeight="500"
                >
                  {showKey ? privateKey : "•".repeat(66)}
                </Code>
              </Box>

              <HStack spacing={2} mt={3}>
                <Button
                  variant="secondary"
                  leftIcon={showKey ? <ViewOffIcon /> : <ViewIcon />}
                  onClick={() => setShowKey(!showKey)}
                  flex={1}
                >
                  {showKey ? "Hide" : "Show"}
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
        <StickyActionBar primaryAction={<Button variant="secondary" onClick={onBack}>Back</Button>} />
      )}
      {!isCheckingSession && passwordType !== "agent" && !revealed && (
        <StickyActionBar
          secondaryAction={<Button variant="secondary" onClick={onBack}>Cancel</Button>}
          primaryAction={
            <Button
              variant="brand"
              onClick={handleReveal}
              isLoading={isLoading}
              loadingText="Verifying…"
              isDisabled={!password}
            >
              Reveal key
            </Button>
          }
        />
      )}
      {revealed && (
        <StickyActionBar primaryAction={<Button variant="brand" onClick={onBack}>Done</Button>} />
      )}
    </AppScreen>
  );
}

export default memo(RevealPrivateKey);
