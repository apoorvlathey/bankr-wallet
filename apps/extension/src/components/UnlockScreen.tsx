import { useState, useEffect, useRef, memo, useCallback } from "react";
import { useDisclosure } from "@chakra-ui/react";
import { useThemedToast } from "@/hooks/useThemedToast";
import {
  closeSidePanelForWindow,
  switchSidePanelToPopup,
} from "@/lib/sidePanelControls";
import { clearPortfolioHoldingsLocalMirror } from "@/chrome/portfolio/holdingsCache";
import BiometricUnlockSetup from "@/components/BiometricUnlockSetup";
import {
  getPasskeyErrorMessage,
  isPasskeyUnlockSupported,
  requestPasskeySessionUnlock,
} from "@/lib/passkeyWebAuthn";
import UnlockView from "@/components/UnlockView";
import { getUnlockMascotState } from "@/components/unlockMascotState";
import {
  beginPasskeyPrompt,
  canAutoPromptPasskey,
  createPasskeyPromptGate,
  finishPasskeyPrompt,
} from "@/components/passkeyPromptGate";
import { playInteractionSound } from "@/sounds/soundManager";
import { detectExtensionSurface } from "@/app/extensionSurface";
import { usePendingSafeProposalCount } from "@/components/SafeAccount/usePendingSafeProposalCount";
import { formatPendingUnlockRequestLabel } from "@/components/pendingUnlockRequestLabel";

interface UnlockScreenProps {
  onUnlock: () => void;
  showMascotSuccess?: boolean;
  suppressPasskeyAutoPrompt?: boolean;
  pendingTxCount: number;
  pendingSignatureCount: number;
  pendingBatchCount?: number;
  pendingPermissionCount?: number;
}

interface PasskeyUnlockStatus {
  configured: boolean;
  rpId: string;
  authCeremonyEpoch?: string;
  credentialId?: string;
  prfSalt?: string;
}

function UnlockScreen({
  onUnlock,
  showMascotSuccess = false,
  suppressPasskeyAutoPrompt = false,
  pendingTxCount,
  pendingSignatureCount,
  pendingBatchCount = 0,
  pendingPermissionCount = 0,
}: UnlockScreenProps) {
  const toast = useThemedToast();
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [error, setError] = useState("");
  const [sidePanelSupported, setSidePanelSupported] = useState(false);
  const [sidePanelMode, setSidePanelMode] = useState(false);
  const [isInSidePanel, setIsInSidePanel] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [mode, setMode] = useState<"unlock" | "setupBiometric">("unlock");
  const [passkeyStatus, setPasskeyStatus] = useState<PasskeyUnlockStatus | null>(null);
  const [passkeySupported, setPasskeySupported] = useState(false);
  const [isPasskeyUnlocking, setIsPasskeyUnlocking] = useState(false);
  const passkeyPromptGateRef = useRef(createPasskeyPromptGate());
  const passwordInputRef = useRef<HTMLInputElement>(null);
  const pendingSafeCount = usePendingSafeProposalCount();
  const {
    isOpen: isResetModalOpen,
    onOpen: onResetModalOpen,
    onClose: onResetModalClose,
  } = useDisclosure();

  useEffect(() => {
    const checkSidePanelSupport = async () => {
      return new Promise<boolean>((resolve) => {
        chrome.runtime.sendMessage(
          { type: "isSidePanelSupported" },
          (response) => {
            resolve(response?.supported || false);
          },
        );
      });
    };

    const checkSidePanelMode = async () => {
      return new Promise<boolean>((resolve) => {
        chrome.runtime.sendMessage({ type: "getSidePanelMode" }, (response) => {
          resolve(response?.enabled || false);
        });
      });
    };

    const checkPasskeyStatus = async () => {
      return new Promise<PasskeyUnlockStatus>((resolve) => {
        chrome.runtime.sendMessage(
          { type: "getPasskeyUnlockStatus" },
          (response) => {
            resolve(response || { configured: false, rpId: "extension" });
          },
        );
      });
    };

    const init = async () => {
      const supported = await checkSidePanelSupport();
      setSidePanelSupported(supported);
      let sidePanelPreferenceEnabled = false;

      if (supported) {
        const mode = await checkSidePanelMode();
        setSidePanelMode(mode);
        sidePanelPreferenceEnabled = mode;
      }

      const surface = await detectExtensionSurface({
        sidePanelSupported: supported,
        sidePanelPreferenceEnabled,
      });
      setIsInSidePanel(surface === "sidepanel");

      const [biometricSupported, biometricStatus] = await Promise.all([
        isPasskeyUnlockSupported(),
        checkPasskeyStatus(),
      ]);
      setPasskeySupported(biometricSupported);
      setPasskeyStatus(biometricStatus);
    };

    init();
  }, []);

  // Chrome sidepanels don't receive keyboard focus on open — any focus()
  // call before the user clicks into the panel results in a brief cursor
  // flash that's immediately lost to the main page (documented Chromium
  // limitation — https://groups.google.com/a/chromium.org/g/chromium-extensions/c/nb058-YrrWc).
  // Workaround: when the user clicks on a non-interactive area of the
  // panel (i.e. the background), the sidepanel's document gains focus;
  // hand it to the password input so they can start typing immediately.
  //
  // Timing gotchas we work around:
  // 1. On mousedown, Chrome transfers focus to the sidepanel document AFTER
  //    our listener runs — so focus() called synchronously gets overwritten.
  //    Defer via rAF + setTimeout(0) so focus() runs after the transfer.
  // 2. preventDefault() on mousedown stops the browser from auto-focusing
  //    the clicked non-interactive element (which otherwise lands on body).
  useEffect(() => {
    const INTERACTIVE_SELECTOR =
      "input, textarea, select, button, a, [role='button'], [contenteditable='true']";

    const focusPasswordInput = () => {
      passwordInputRef.current?.focus({ preventScroll: true });
    };

    const handleBackgroundMousedown = (e: MouseEvent) => {
      const target = e.target as Element | null;
      if (!target) return;
      // Clicked an interactive element — let browser default focus behavior
      // handle it.
      if (target.closest(INTERACTIVE_SELECTOR)) return;

      // Stop the browser from shifting focus to the non-interactive target
      // (which would override our focus() call below).
      e.preventDefault();

      // Focus now (for popup, where the document is already focused) and
      // also schedule a deferred focus after Chrome finishes any focus
      // transfer for sidepanel.
      focusPasswordInput();
      requestAnimationFrame(focusPasswordInput);
      setTimeout(focusPasswordInput, 0);
    };

    document.addEventListener("mousedown", handleBackgroundMousedown);
    return () => {
      document.removeEventListener("mousedown", handleBackgroundMousedown);
    };
  }, []);

  const toggleSidePanelMode = async () => {
    if (sidePanelMode) {
      // DISABLING: restore and immediately open the popup before closing the panel
      const switched = await switchSidePanelToPopup();
      if (!switched) {
        console.warn("Failed to switch from sidepanel to popup mode");
      }
    } else {
      // ENABLING: open sidepanel, persist, close popup — all fire-and-forget
      try {
        if (!chrome.sidePanel?.open) return; // Firefox / unsupported browser
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        const windowId = tabs[0]?.windowId;
        if (!windowId) return;

        chrome.sidePanel.open({ windowId });
        chrome.runtime.sendMessage({ type: "setSidePanelMode", enabled: true });
        window.close();
      } catch (error) {
        console.warn("Failed to open sidepanel:", error);
      }
    }
  };

  const openFullScreen = async () => {
    // Open extension in a new tab
    const tab = await chrome.tabs.create({ url: chrome.runtime.getURL("index.html") });
    if (isInSidePanel) {
      const closed = await closeSidePanelForWindow(tab.windowId);
      if (!closed) {
        window.close();
      }
    }
  };

  const handlePasskeyUnlock = useCallback(
    async (autoPrompt = false) => {
      if (
        !passkeyStatus?.configured ||
        !passkeyStatus.authCeremonyEpoch ||
        !passkeyStatus.credentialId ||
        !passkeyStatus.prfSalt
      ) {
        return;
      }
      if (!beginPasskeyPrompt(passkeyPromptGateRef.current)) return;

      setIsPasskeyUnlocking(true);
      if (!autoPrompt) setError("");

      try {
        const result = await requestPasskeySessionUnlock(passkeyStatus);

        if (result.success) {
          void playInteractionSound("unlockSuccess");
          onUnlock();
          return;
        }

        setError(result.error || "Biometric unlock failed");
      } catch (passkeyError) {
        if (!autoPrompt) {
          setError(getPasskeyErrorMessage(passkeyError));
        }
      } finally {
        finishPasskeyPrompt(passkeyPromptGateRef.current);
        setIsPasskeyUnlocking(false);
      }
    },
    [onUnlock, passkeyStatus],
  );

  useEffect(() => {
    if (
      mode !== "unlock" ||
      !canAutoPromptPasskey(
        passkeyPromptGateRef.current,
        showMascotSuccess,
      ) ||
      !passkeySupported ||
      !passkeyStatus?.configured ||
      suppressPasskeyAutoPrompt ||
      !passkeyStatus.authCeremonyEpoch ||
      !passkeyStatus.credentialId ||
      !passkeyStatus.prfSalt
    ) {
      return;
    }

    void handlePasskeyUnlock(true);
  }, [
    handlePasskeyUnlock,
    mode,
    passkeyStatus,
    passkeySupported,
    showMascotSuccess,
    suppressPasskeyAutoPrompt,
  ]);

  const handleUnlock = async () => {
    if (!password) {
      setError("Password is required");
      passwordInputRef.current?.focus();
      return;
    }

    setIsUnlocking(true);
    setError("");

    chrome.runtime.sendMessage(
      { type: "unlockWallet", password },
      (result: { success: boolean; error?: string }) => {
        if (result.success) {
          void playInteractionSound("unlockSuccess");
          onUnlock();
        } else {
          setError(
            result.error === "Invalid password"
              ? "Incorrect password"
              : result.error || "Incorrect password",
          );
          setIsUnlocking(false);
          passwordInputRef.current?.focus();
        }
      },
    );
  };

  const handleResetExtension = () => {
    setIsResetting(true);
    chrome.runtime.sendMessage({ type: "resetExtension" }, (result) => {
      setIsResetting(false);
      if (result?.success) {
        clearPortfolioHoldingsLocalMirror();
        onResetModalClose();
        toast({
          title: "Extension reset",
          description: "Please set up your API key and password again",
          status: "info",
          duration: 4000,
          isClosable: true,
        });
        // Reload the extension popup to show the setup screen
        window.location.reload();
      } else {
        toast({
          title: "Reset failed",
          description: result?.error || "Failed to reset extension",
          status: "error",
          duration: 3000,
          isClosable: true,
        });
      }
    });
  };

  if (mode === "setupBiometric") {
    return (
      <BiometricUnlockSetup
        onCancel={() => setMode("unlock")}
        onComplete={onUnlock}
      />
    );
  }

  const pendingRequestLabel = formatPendingUnlockRequestLabel(
    pendingTxCount + pendingSignatureCount + pendingBatchCount +
      pendingPermissionCount + pendingSafeCount,
    pendingSafeCount,
  );
  const mascotState = getUnlockMascotState({
    password,
    error,
    isUnlocking,
    isPasskeyUnlocking,
    showSuccess: showMascotSuccess,
  });

  return (
    <UnlockView
      password={password}
      showPassword={showPassword}
      error={error}
      isUnlocking={isUnlocking}
      isPasskeyUnlocking={isPasskeyUnlocking}
      mascotState={mascotState}
      passkeySupported={passkeySupported}
      passkeyConfigured={passkeyStatus?.configured === true}
      pendingRequestLabel={pendingRequestLabel}
      sidePanelSupported={sidePanelSupported}
      sidePanelMode={sidePanelMode}
      passwordInputRef={passwordInputRef}
      onPasswordChange={(nextPassword) => {
        setPassword(nextPassword);
        if (error) setError("");
      }}
      onTogglePassword={() => setShowPassword((visible) => !visible)}
      onUnlock={handleUnlock}
      onPasskeyUnlock={() => void handlePasskeyUnlock(false)}
      onSetupBiometric={() => {
        setError("");
        setMode("setupBiometric");
      }}
      onOpenReset={onResetModalOpen}
      onOpenFullscreen={() => void openFullScreen()}
      onToggleSidePanel={() => void toggleSidePanelMode()}
      resetDialog={{
        isOpen: isResetModalOpen,
        isResetting,
        onClose: onResetModalClose,
        onConfirm: handleResetExtension,
      }}
    />
  );
}

export default memo(UnlockScreen);
