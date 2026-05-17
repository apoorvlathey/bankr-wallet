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
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Code,
} from "@chakra-ui/react";
import { ViewIcon, ViewOffIcon, WarningTwoIcon, CopyIcon, CheckIcon, LockIcon } from "@chakra-ui/icons";
import { useTheme, IconBox } from "@/theme";
import type { Account, PasswordType } from "@/chrome/types";
import { truncateAddress } from "@/lib/addressUtils";

interface RevealPrivateKeyModalProps {
  isOpen: boolean;
  onClose: () => void;
  account: Account | null;
}

function RevealPrivateKeyModal({ isOpen, onClose, account }: RevealPrivateKeyModalProps) {
  const { themeId } = useTheme();
  const isDarkTheme = themeId === "midnight";
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

  // Check password type and agent password status when modal opens
  useEffect(() => {
    if (isOpen) {
      setIsCheckingSession(true);

      // Check password type
      chrome.runtime.sendMessage(
        { type: "getPasswordType" },
        (response: { passwordType: PasswordType | null }) => {
          setPasswordType(response.passwordType);
          setIsCheckingSession(false);
          // Only focus password input if not agent session
          if (response.passwordType !== "agent") {
            setTimeout(() => passwordInputRef.current?.focus(), 100);
          }
        }
      );

      // Check if agent password is enabled
      chrome.runtime.sendMessage(
        { type: "isAgentPasswordEnabled" },
        (response: { enabled: boolean }) => {
          setIsAgentPasswordEnabled(response.enabled);
        }
      );
    }
  }, [isOpen]);

  // Clear state on close
  const handleClose = () => {
    setPassword("");
    setShowPassword(false);
    setShowKey(false);
    setPrivateKey("");
    setError("");
    setIsLoading(false);
    setCopied(false);
    setPasswordType(null);
    setIsCheckingSession(true);
    setIsAgentPasswordEnabled(false);
    onClose();
  };

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
      }
    );
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(privateKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for extension context
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
    <Modal isOpen={isOpen} onClose={handleClose} isCentered>
      <ModalOverlay bg="surface.overlay" />
      {/* Modal baseStyle paints bg/border/borderRadius/boxShadow from theme tokens. */}
      <ModalContent mx={4}>
        <ModalHeader color="text.primary" fontSize="md" pb={2} textTransform="uppercase" letterSpacing="wider">
          <Box display="flex" alignItems="center" gap={2}>
            <IconBox size="32px" bg="accent.highlight" noShadow>
              <WarningTwoIcon color="accentFg.highlight" />
            </IconBox>
            Reveal Private Key
          </Box>
        </ModalHeader>

        <ModalBody>
          {isCheckingSession ? (
            <VStack spacing={3} align="stretch">
              <Text color="text.secondary" fontSize="sm" fontWeight="500">
                Checking session...
              </Text>
            </VStack>
          ) : passwordType === "agent" ? (
            /* Agent session - cannot reveal private key */
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
                Private key reveal is only available when unlocked with your <Text as="span" fontWeight="700">master password</Text>.
              </Text>

              <Text color="text.secondary" fontSize="sm" fontWeight="500">
                To reveal the private key:
              </Text>
              <Box pl={4} borderLeft="4px solid" borderColor="accent.secondary">
                <Text color="text.secondary" fontSize="sm">1. Lock your wallet</Text>
                <Text color="text.secondary" fontSize="sm">2. Unlock with your master password</Text>
                <Text color="text.secondary" fontSize="sm">3. Try revealing the key again</Text>
              </Box>
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
                  Never share your private key. Anyone with it has full control of your wallet.
                </Text>
              </Box>

              <Text color="text.secondary" fontSize="sm" fontWeight="500">
                Enter your {isAgentPasswordEnabled && <Text as="span" fontWeight="700">Master </Text>}password to reveal the private key for{" "}
                <Text as="span" fontWeight="700" color="text.primary">
                  {account?.displayName || truncateAddress(account?.address || "")}
                </Text>
              </Text>

              <InputGroup>
                <Input
                  ref={passwordInputRef}
                  type={showPassword ? "text" : "password"}
                  placeholder={isAgentPasswordEnabled ? "Master Password" : "Password"}
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
                  Do not share this key. Anyone with it can steal your funds.
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
                  {showKey ? privateKey : "•".repeat(66)}
                </Code>
              </Box>

              <HStack spacing={2}>
                <Button
                  size="sm"
                  variant="secondary"
                  leftIcon={showKey ? <ViewOffIcon /> : <ViewIcon />}
                  onClick={() => setShowKey(!showKey)}
                  flex={1}
                >
                  {showKey ? "Hide" : "Show"}
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
            </VStack>
          )}
        </ModalBody>

        <ModalFooter gap={2}>
          {isCheckingSession ? (
            <Button variant="secondary" size="sm" onClick={handleClose} w="full">
              Cancel
            </Button>
          ) : passwordType === "agent" ? (
            <Button variant="secondary" size="sm" onClick={handleClose} w="full">
              Close
            </Button>
          ) : !revealed ? (
            <>
              <Button variant="secondary" size="sm" onClick={handleClose}>
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
            </>
          ) : (
            <Button variant="secondary" size="sm" onClick={handleClose} w="full">
              Done
            </Button>
          )}
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}

export default memo(RevealPrivateKeyModal);
