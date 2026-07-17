import { useCallback, useEffect, useRef, useState } from "react";
import { useThemedToast } from "@/hooks/useThemedToast";
import {
  getPasskeyErrorMessage,
  requestPasskeySessionUnlock,
} from "@/lib/passkeyWebAuthn";
import {
  beginPasskeyPrompt,
  createPasskeyPromptGate,
  finishPasskeyPrompt,
} from "@/components/passkeyPromptGate";
import {
  getMnemonicAccessRequirement,
  needsLocalAccountBiometricUpgrade,
  type PasskeyUnlockStatus,
} from "./model/biometricGateModel";
import {
  ensureMnemonicAccessFromStatus,
  type EnsureMnemonicAccessResult,
} from "./model/mnemonicAccessCoordinator";

interface LocalAccountBiometricGate {
  needsUpgrade: boolean | null;
  isAuthenticating: boolean;
  ensureMnemonicAccess: () => Promise<EnsureMnemonicAccessResult>;
}

function readPasskeyUnlockStatus(): Promise<PasskeyUnlockStatus> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      { type: "getPasskeyUnlockStatus" },
      (status: PasskeyUnlockStatus | undefined) => {
        const runtimeError = chrome.runtime.lastError;
        if (runtimeError || !status) {
          reject(
            new Error(
              runtimeError?.message || "Unable to check biometric access",
            ),
          );
          return;
        }
        resolve(status);
      },
    );
  });
}

export function useLocalAccountBiometricGate(): LocalAccountBiometricGate {
  const toast = useThemedToast();
  const [needsUpgrade, setNeedsUpgrade] = useState<boolean | null>(null);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const passkeyPromptGateRef = useRef(createPasskeyPromptGate());

  const refreshStatus = useCallback(async () => {
    const status = await readPasskeyUnlockStatus();
    setNeedsUpgrade(needsLocalAccountBiometricUpgrade(status));
    return status;
  }, []);

  useEffect(() => {
    void refreshStatus().catch(() => {
      // Fail closed on a missing background response. Secret-entry controls
      // remain behind their loading state until a later explicit retry.
      setNeedsUpgrade(null);
    });
  }, [refreshStatus]);

  const ensureMnemonicAccess = useCallback(async (): Promise<EnsureMnemonicAccessResult> => {
    try {
      const status = await refreshStatus();
      const requirement = getMnemonicAccessRequirement(status);
      if (requirement === "ready") return { ready: true };
      if (requirement === "legacy-upgrade-required") {
        return { ready: false, reason: "legacy-upgrade-required" };
      }
      if (!beginPasskeyPrompt(passkeyPromptGateRef.current)) {
        return {
          ready: false,
          reason: "authentication-failed",
          failure: "verification",
          error: "Biometric verification is already in progress",
        };
      }

      setIsAuthenticating(true);
      try {
        const result = await ensureMnemonicAccessFromStatus(
          status,
          refreshStatus,
          requestPasskeySessionUnlock,
        );
        if (!result.ready && result.reason === "authentication-failed") {
          toast({
            title:
              result.failure === "verification"
                ? "Biometric verification failed"
                : "Seed phrase access unavailable",
            description: result.error,
            status: "error",
            duration: result.failure === "verification" ? 4000 : 5000,
            isClosable: true,
          });
        }
        return result;
      } finally {
        finishPasskeyPrompt(passkeyPromptGateRef.current);
        setIsAuthenticating(false);
      }
    } catch (error) {
      const errorMessage = getPasskeyErrorMessage(error);
      toast({
        title: "Biometric verification required",
        description: errorMessage,
        status: "error",
        duration: 4000,
        isClosable: true,
      });
      return {
        ready: false,
        reason: "authentication-failed",
        failure: "verification",
        error: errorMessage,
      };
    }
  }, [refreshStatus, toast]);

  return { needsUpgrade, isAuthenticating, ensureMnemonicAccess };
}
