import { useEffect, useRef, useState } from "react";
import { Button, Text, VStack } from "@chakra-ui/react";
import { SHIELDED_ETH_NETWORK_NAME } from "@/components/Shield/model/shieldedAsset";

import { SettingsScreenFrame } from "../SettingsScreenFrame";
import { RecoveryBackupScreen } from "./RecoveryBackupScreen";
import { RecoveryImportScreen } from "./RecoveryImportScreen";
import { RecoveryMenu } from "./RecoveryMenu";
import { RecoveryReplacementConfirm } from "./RecoveryReplacementConfirm";
import type {
  RecoveryResponse,
  RecoveryStatus,
  RecoveryView,
  ShieldPortfolio,
} from "./types";

interface Props {
  onBack: () => void;
}

function sendMessage<T>(message: unknown): Promise<T> {
  return new Promise((resolve) => chrome.runtime.sendMessage(message, resolve));
}

function validWordCount(value: string): boolean {
  return value.trim().split(/\s+/).length === 12;
}

export default function PrivacyRecoverySettings({ onBack }: Props) {
  const [status, setStatus] = useState<RecoveryStatus | null>(null);
  const [portfolio, setPortfolio] = useState<ShieldPortfolio | null>(null);
  const [view, setView] = useState<RecoveryView>("menu");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [revealedPhrase, setRevealedPhrase] = useState("");
  const [phraseVisible, setPhraseVisible] = useState(false);
  const [restorePhrase, setRestorePhrase] = useState("");
  const [backupConfirmed, setBackupConfirmed] = useState(false);
  const [lossConfirmed, setLossConfirmed] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const passwordRef = useRef<HTMLInputElement>(null);

  const loadStatus = async () => {
    const [nextStatus, activity] = await Promise.all([
      sendMessage<RecoveryStatus>({ type: "privacyGetRecoveryStatus" }),
      sendMessage<{ success: boolean; portfolio?: ShieldPortfolio }>({
        type: "privacyListShieldOperations",
      }),
    ]);
    setStatus(nextStatus);
    setPortfolio(activity.success && activity.portfolio ? activity.portfolio : null);
    return nextStatus;
  };

  useEffect(() => {
    void loadStatus();
  }, []);

  useEffect(() => {
    if (!revealedPhrase) return;
    const timer = window.setTimeout(() => {
      setPhraseVisible(false);
      setRevealedPhrase("");
    }, 60_000);
    return () => window.clearTimeout(timer);
  }, [revealedPhrase]);

  const clearTransientSecrets = () => {
    setPassword("");
    setShowPassword(false);
    setRevealedPhrase("");
    setPhraseVisible(false);
    setRestorePhrase("");
    setCopied(false);
    setError("");
  };

  const goToMenu = () => {
    clearTransientSecrets();
    setBackupConfirmed(false);
    setLossConfirmed(false);
    setView("menu");
  };

  const goBack = () => {
    if (view === "menu") {
      clearTransientSecrets();
      onBack();
      return;
    }
    if (view === "restore-confirm") {
      setView("restore-backup");
      return;
    }
    if (view === "restore-import" && status?.success && status.status === "ready") {
      setRestorePhrase("");
      setPassword("");
      setError("");
      setView("restore-confirm");
      return;
    }
    goToMenu();
  };

  const reveal = async () => {
    if (!password) {
      setError("Main password is required");
      passwordRef.current?.focus();
      return;
    }
    setBusy(true);
    setError("");
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
      setPhraseVisible(false);
      setPassword("");
      await loadStatus();
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

  const restore = async () => {
    if (!validWordCount(restorePhrase)) {
      setError("Enter a valid 12-word Shield recovery phrase");
      return;
    }
    if (!password) {
      setError("Main password is required");
      passwordRef.current?.focus();
      return;
    }
    const replacing = status?.success === true && status.status === "ready";
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await sendMessage<RecoveryResponse>({
        type: "privacyRestoreRecovery",
        requestId: crypto.randomUUID(),
        phrase: restorePhrase,
        password,
        replaceExisting: replacing,
        backupConfirmed: replacing && backupConfirmed,
        lossConfirmed: replacing && lossConfirmed,
      });
      if (!response.success) {
        setError(response.error || "Couldn’t restore the recovery phrase.");
        return;
      }

      clearTransientSecrets();
      setNotice(`Shield phrase restored. Scanning ${SHIELDED_ETH_NETWORK_NAME}…`);
      const scan = await sendMessage<{
        success: boolean;
        result?: { recovered: number };
        error?: string;
      }>({ type: "privacyRescanRecovery" });
      if (!scan.success) {
        setNotice("");
        setError(`The new Shield phrase is saved, but ${SHIELDED_ETH_NETWORK_NAME} couldn’t be scanned yet.`);
        setView("menu");
        await loadStatus();
        return;
      }
      setNotice(scan.result?.recovered
        ? `Shield phrase restored. Recovered ${scan.result.recovered} Shield balance${scan.result.recovered === 1 ? "" : "s"}.`
        : `Shield phrase restored. ${SHIELDED_ETH_NETWORK_NAME} scan complete.`);
      setBackupConfirmed(false);
      setLossConfirmed(false);
      setView("menu");
      await loadStatus();
    } finally {
      setBusy(false);
    }
  };

  if (!status) {
    return (
      <SettingsScreenFrame title="Privacy Pools recovery" onBack={onBack}>
        <Text fontSize="sm" color="fg.secondary" aria-live="polite">
          Checking Shield recovery…
        </Text>
      </SettingsScreenFrame>
    );
  }

  if (!status.success) {
    return (
      <SettingsScreenFrame title="Privacy Pools recovery" onBack={onBack}>
        <Text color="status.error.emphasis" fontSize="sm" aria-live="polite">
          {status.error}
        </Text>
      </SettingsScreenFrame>
    );
  }

  const replacement = status.status === "ready";
  const title = view === "menu"
    ? "Privacy Pools recovery"
    : view === "backup" || view === "restore-backup"
      ? "Back up Shield phrase"
      : view === "restore-confirm"
        ? "Confirm replacement"
        : "Restore Shield phrase";

  const primaryAction = view === "backup"
    ? revealedPhrase
      ? <Button variant="brand" onClick={goToMenu}>Done</Button>
      : <Button variant="brand" onClick={() => void reveal()} isLoading={busy}>Reveal phrase</Button>
    : view === "restore-backup"
      ? revealedPhrase
        ? <Button variant="brand" onClick={() => setView("restore-confirm")}>Continue</Button>
        : <Button variant="brand" onClick={() => void reveal()} isLoading={busy}>Reveal phrase</Button>
      : view === "restore-confirm"
        ? (
          <Button
            variant="brand"
            isDisabled={!backupConfirmed || !lossConfirmed}
            onClick={() => {
              clearTransientSecrets();
              setView("restore-import");
            }}
          >
            Continue
          </Button>
        )
        : view === "restore-import"
          ? (
            <Button
              variant="brand"
              onClick={() => void restore()}
              isLoading={busy}
              loadingText="Restoring…"
              isDisabled={!validWordCount(restorePhrase) || !password}
            >
              Restore phrase
            </Button>
          )
          : undefined;

  return (
    <SettingsScreenFrame
      title={title}
      onBack={goBack}
      primaryAction={primaryAction}
      secondaryAction={view === "restore-confirm" || view === "restore-import"
        ? <Button variant="secondary" onClick={goBack} isDisabled={busy}>Back</Button>
        : undefined}
    >
      {view === "menu" ? (
        <RecoveryMenu
          status={status}
          notice={notice}
          error={error}
          onBackup={() => {
            setNotice("");
            setView("backup");
          }}
          onRestore={() => {
            setNotice("");
            setView(replacement ? "restore-backup" : "restore-import");
          }}
        />
      ) : view === "backup" || view === "restore-backup" ? (
        <RecoveryBackupScreen
          replacement={view === "restore-backup"}
          password={password}
          showPassword={showPassword}
          phrase={revealedPhrase}
          phraseVisible={phraseVisible}
          copied={copied}
          error={error}
          passwordRef={passwordRef}
          portfolio={portfolio}
          onPasswordChange={(value) => {
            setPassword(value);
            setError("");
          }}
          onTogglePassword={() => setShowPassword((value) => !value)}
          onReveal={() => void reveal()}
          onTogglePhrase={() => setPhraseVisible((value) => !value)}
          onCopy={() => void copy()}
        />
      ) : view === "restore-confirm" ? (
        <RecoveryReplacementConfirm
          backupConfirmed={backupConfirmed}
          lossConfirmed={lossConfirmed}
          onBackupConfirmed={setBackupConfirmed}
          onLossConfirmed={setLossConfirmed}
        />
      ) : (
        <VStack spacing={4} align="stretch">
          <RecoveryImportScreen
            replacing={replacement}
            phrase={restorePhrase}
            password={password}
            showPassword={showPassword}
            error={error}
            passwordRef={passwordRef}
            onPhraseChange={(value) => {
              setRestorePhrase(value);
              setError("");
            }}
            onPasswordChange={(value) => {
              setPassword(value);
              setError("");
            }}
            onTogglePassword={() => setShowPassword((value) => !value)}
            onRestore={() => void restore()}
          />
          {error ? (
            <Text color="status.error.emphasis" fontSize="sm" aria-live="polite">
              {error}
            </Text>
          ) : null}
        </VStack>
      )}
    </SettingsScreenFrame>
  );
}
