import { useEffect, useMemo, useRef, useState } from "react";
import {
  Box,
  Button,
  Code,
  FormControl,
  FormErrorMessage,
  FormLabel,
  HStack,
  Input,
  SimpleGrid,
  Text,
  Textarea,
  VStack,
} from "@chakra-ui/react";
import { CheckIcon, CopyIcon } from "@chakra-ui/icons";
import { ScreenSection } from "@/components/ui";
import { SettingsScreenFrame } from "./SettingsScreenFrame";

type RecoveryStatus =
  | {
      success: true;
      status: "missing" | "ready";
      hasMasterRecovery: boolean;
      backupVerified: boolean;
    }
  | { success: false; status: "attention"; error: string };

type RecoveryResponse = {
  success: boolean;
  phrase?: string;
  status?: string;
  error?: string;
};

interface Props {
  onBack: () => void;
}

function sendMessage<T>(message: unknown): Promise<T> {
  return new Promise((resolve) => chrome.runtime.sendMessage(message, resolve));
}

export default function PrivacyRecoverySettings({ onBack }: Props) {
  const [status, setStatus] = useState<RecoveryStatus | null>(null);
  const [password, setPassword] = useState("");
  const [restorePhrase, setRestorePhrase] = useState("");
  const [revealedPhrase, setRevealedPhrase] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const passwordRef = useRef<HTMLInputElement>(null);

  const loadStatus = async () => {
    const next = await sendMessage<RecoveryStatus>({
      type: "privacyGetRecoveryStatus",
    });
    setStatus(next);
  };

  useEffect(() => {
    void loadStatus();
  }, []);

  useEffect(() => {
    if (!revealedPhrase) return;
    const timer = window.setTimeout(() => setRevealedPhrase(""), 60_000);
    return () => window.clearTimeout(timer);
  }, [revealedPhrase]);

  const words = useMemo(
    () => revealedPhrase ? revealedPhrase.split(" ") : [],
    [revealedPhrase],
  );

  const reveal = async () => {
    if (!password) {
      setError("Main password is required");
      passwordRef.current?.focus();
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await sendMessage<RecoveryResponse>({
        type: "privacyRevealRecovery",
        password,
      });
      if (!response.success || !response.phrase) {
        setError(response.error || "Couldn’t reveal the recovery phrase.");
        return;
      }
      setRevealedPhrase(response.phrase);
      setPassword("");
      await loadStatus();
    } finally {
      setBusy(false);
    }
  };

  const scan = async (): Promise<boolean> => {
    const response = await sendMessage<{
      success: boolean;
      result?: { recovered: number };
      error?: string;
    }>({ type: "privacyRescanRecovery" });
    if (!response.success) {
      setError(response.error || "Couldn’t scan Sepolia right now.");
      return false;
    }
    setNotice(
      response.result?.recovered
        ? `Recovered ${response.result.recovered} Shield balance${response.result.recovered === 1 ? "" : "s"}.`
        : "Sepolia scan complete.",
    );
    return true;
  };

  const restore = async () => {
    if (!restorePhrase.trim()) {
      setError("Enter your 12-word Shield recovery phrase");
      return;
    }
    if (!password) {
      setError("Main password is required");
      passwordRef.current?.focus();
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await sendMessage<RecoveryResponse>({
        type: "privacyRestoreRecovery",
        requestId: crypto.randomUUID(),
        phrase: restorePhrase,
        password,
      });
      if (!response.success) {
        setError(response.error || "Couldn’t restore the recovery phrase.");
        return;
      }
      setRestorePhrase("");
      setPassword("");
      setNotice("Recovery phrase restored. Scanning Sepolia…");
      await loadStatus();
      await scan();
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    if (!revealedPhrase) return;
    try {
      await navigator.clipboard.writeText(revealedPhrase);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2_000);
    } catch {
      setError("Copy failed. Write the words down in order.");
    }
  };

  const goBack = () => {
    setRevealedPhrase("");
    setRestorePhrase("");
    setPassword("");
    onBack();
  };

  const ready = status?.success === true && status.status === "ready";

  return (
    <SettingsScreenFrame
      title="Shield recovery"
      onBack={goBack}
      primaryAction={
        ready ? (
          <Button
            variant="primary"
            onClick={() => void (revealedPhrase ? scan() : reveal())}
            isLoading={busy}
          >
            {revealedPhrase ? "Scan Sepolia" : "Reveal phrase"}
          </Button>
        ) : status?.success === true ? (
          <Button variant="brand" onClick={() => void restore()} isLoading={busy}>
            Restore phrase
          </Button>
        ) : undefined
      }
      secondaryAction={
        <Button variant="secondary" onClick={goBack}>
          Back
        </Button>
      }
    >
      <VStack spacing={5} align="stretch">
        {!status ? (
          <Text fontSize="sm" color="fg.secondary" aria-live="polite">
            Checking Shield recovery…
          </Text>
        ) : !status.success ? (
          <Box
            p={3}
            bg="status.error.bg"
            color="status.error.fg"
            border="1px solid"
            borderColor="status.error.border"
            borderRadius="md"
          >
            <Text fontSize="sm" fontWeight="600">{status.error}</Text>
          </Box>
        ) : ready ? (
          <>
            <ScreenSection
              title={revealedPhrase ? "Your Shield recovery phrase" : "Back up your Shield balance"}
              description={
                revealedPhrase
                  ? "Write these words down in order and keep them offline."
                  : "Enter your main password to reveal the separate phrase used only for Shield."
              }
            >
              {revealedPhrase ? (
                <VStack align="stretch" spacing={3}>
                  <SimpleGrid columns={2} spacing={2}>
                    {words.map((word, index) => (
                      <HStack
                        key={`${index}-${word}`}
                        bg="surface.sunken"
                        border="1px solid"
                        borderColor="border.default"
                        borderRadius="md"
                        px={3}
                        py={2}
                      >
                        <Text color="fg.muted" fontSize="xs" minW={4}>
                          {index + 1}
                        </Text>
                        <Code bg="transparent" color="fg.primary" fontSize="sm">
                          {word}
                        </Code>
                      </HStack>
                    ))}
                  </SimpleGrid>
                  <Button
                    variant="secondary"
                    leftIcon={copied ? <CheckIcon /> : <CopyIcon />}
                    onClick={() => void copy()}
                  >
                    {copied ? "Copied" : "Copy phrase"}
                  </Button>
                  <Text fontSize="xs" color="fg.secondary">
                    This phrase hides automatically after one minute.
                  </Text>
                </VStack>
              ) : (
                <FormControl isInvalid={!!error}>
                  <FormLabel>Main password</FormLabel>
                  <Input
                    ref={passwordRef}
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(event) => {
                      setPassword(event.target.value);
                      setError("");
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") void reveal();
                    }}
                  />
                  <FormErrorMessage>{error}</FormErrorMessage>
                </FormControl>
              )}
            </ScreenSection>
            {!status.hasMasterRecovery && !revealedPhrase ? (
              <Text fontSize="sm" color="status.warning.emphasis">
                Verify your main password before shielding funds.
              </Text>
            ) : null}
          </>
        ) : (
          <ScreenSection
            title="Restore Shield balance"
            description="Enter the separate 12-word Shield phrase, then WalletChan will scan Sepolia."
          >
            <VStack spacing={4} align="stretch">
              <FormControl isInvalid={!!error}>
                <FormLabel>Shield recovery phrase</FormLabel>
                <Textarea
                  value={restorePhrase}
                  onChange={(event) => {
                    setRestorePhrase(event.target.value);
                    setError("");
                  }}
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  placeholder="12 words"
                  minH="96px"
                />
              </FormControl>
              <FormControl isInvalid={!!error}>
                <FormLabel>Main password</FormLabel>
                <Input
                  ref={passwordRef}
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => {
                    setPassword(event.target.value);
                    setError("");
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") void restore();
                  }}
                />
                <FormErrorMessage>{error}</FormErrorMessage>
              </FormControl>
            </VStack>
          </ScreenSection>
        )}

        {notice ? (
          <Text color="status.success.emphasis" fontSize="sm" aria-live="polite">
            {notice}
          </Text>
        ) : null}
        {error && ready && revealedPhrase ? (
          <Text color="status.error.emphasis" fontSize="sm" aria-live="polite">
            {error}
          </Text>
        ) : null}
      </VStack>
    </SettingsScreenFrame>
  );
}
