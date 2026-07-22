import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MutableRefObject,
} from "react";
import { clearRendererMemoryCache } from "@/app/rendererMemoryCache";

type LockWalletResponse = {
  success?: boolean;
};

type SendLockMessage = (
  message: { type: "lockWallet" },
  callback: (response?: LockWalletResponse) => void,
) => void;

export type ManualWalletLockStatus = "idle" | "locking" | "failed";

export interface ExternalWalletAuthMessage {
  type?: string;
  suppressPasskeyAutoPrompt?: boolean;
}

interface ExternalWalletAuthControls {
  isWalletUnlocked: () => boolean;
  handleUnlock: () => void;
  showLockedRenderer: (suppressAutoPrompt: boolean) => void;
  setStatus: (status: ManualWalletLockStatus) => void;
}

export function applyExternalWalletAuthMessage(
  message: ExternalWalletAuthMessage,
  controls: ExternalWalletAuthControls,
): boolean {
  if (message?.type === "walletLockedExternal") {
    controls.setStatus("idle");
    controls.showLockedRenderer(message.suppressPasskeyAutoPrompt === true);
    return true;
  }
  if (message?.type === "walletLockFailedExternal") {
    controls.showLockedRenderer(true);
    controls.setStatus("failed");
    return true;
  }
  if (message?.type === "walletUnlockedExternal") {
    controls.setStatus("idle");
    if (!controls.isWalletUnlocked()) controls.handleUnlock();
    return true;
  }
  return false;
}

export function requestManualWalletLock(
  sendMessage: SendLockMessage = (message, callback) => {
    chrome.runtime.sendMessage(message, callback);
  },
  readLastError: () => unknown = () => chrome.runtime.lastError,
  timeoutMs = 10_000,
): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (confirmed: boolean) => {
      if (settled) return;
      settled = true;
      globalThis.clearTimeout(timeout);
      resolve(confirmed);
    };
    const timeout = globalThis.setTimeout(() => finish(false), timeoutMs);
    try {
      sendMessage({ type: "lockWallet" }, (response) => {
        const runtimeError = readLastError();
        finish(!runtimeError && response?.success === true);
      });
    } catch {
      finish(false);
    }
  });
}

interface ManualWalletLockOptions {
  isWalletUnlocked: boolean;
  isWalletUnlockedRef: MutableRefObject<boolean>;
  unlockRouteHandledRef: MutableRefObject<boolean>;
  handleUnlock: () => void;
  setShowUnlockMascotSuccess: (value: boolean) => void;
  setIsWalletUnlocked: (value: boolean) => void;
  setPasswordType: (value: null) => void;
  setAccountSettingsApiKeyDraft: (value: null) => void;
  setSuppressPasskeyAutoPrompt: (value: boolean) => void;
  setView: (value: "unlock") => void;
}

export function useManualWalletLock({
  isWalletUnlocked,
  isWalletUnlockedRef,
  unlockRouteHandledRef,
  handleUnlock,
  setShowUnlockMascotSuccess,
  setIsWalletUnlocked,
  setPasswordType,
  setAccountSettingsApiKeyDraft,
  setSuppressPasskeyAutoPrompt,
  setView,
}: ManualWalletLockOptions) {
  const [status, setStatus] = useState<ManualWalletLockStatus>("idle");
  const lockInFlight = useRef(false);

  const clearRendererAuthState = useCallback(() => {
    clearRendererMemoryCache();
    isWalletUnlockedRef.current = false;
    unlockRouteHandledRef.current = false;
    setShowUnlockMascotSuccess(false);
    setIsWalletUnlocked(false);
    setPasswordType(null);
    setAccountSettingsApiKeyDraft(null);
  }, [
    isWalletUnlockedRef,
    setAccountSettingsApiKeyDraft,
    setIsWalletUnlocked,
    setPasswordType,
    setShowUnlockMascotSuccess,
    unlockRouteHandledRef,
  ]);
  const showLockedRenderer = useCallback(
    (suppressAutoPrompt: boolean) => {
      clearRendererAuthState();
      setSuppressPasskeyAutoPrompt(suppressAutoPrompt);
      setView("unlock");
    },
    [clearRendererAuthState, setSuppressPasskeyAutoPrompt, setView],
  );

  const requestLock = useCallback(async () => {
    if (lockInFlight.current) return;
    lockInFlight.current = true;
    clearRendererAuthState();
    setStatus("locking");
    try {
      if (await requestManualWalletLock()) {
        showLockedRenderer(true);
        setStatus("idle");
      } else {
        setStatus("failed");
      }
    } finally {
      lockInFlight.current = false;
    }
  }, [clearRendererAuthState, showLockedRenderer]);

  useEffect(() => {
    isWalletUnlockedRef.current = isWalletUnlocked;
    if (!isWalletUnlocked) {
      unlockRouteHandledRef.current = false;
      setShowUnlockMascotSuccess(false);
    }
  }, [
    isWalletUnlocked,
    isWalletUnlockedRef,
    setShowUnlockMascotSuccess,
    unlockRouteHandledRef,
  ]);

  useEffect(() => {
    const handler = (
      message: ExternalWalletAuthMessage,
      _sender: chrome.runtime.MessageSender,
      sendResponse: (response?: unknown) => void,
    ) => {
      const handled = applyExternalWalletAuthMessage(message, {
        isWalletUnlocked: () => isWalletUnlockedRef.current,
        handleUnlock,
        showLockedRenderer,
        setStatus,
      });
      if (handled) {
        sendResponse({ ok: true });
      }
      return false;
    };
    chrome.runtime.onMessage.addListener(handler);
    return () => chrome.runtime.onMessage.removeListener(handler);
  }, [handleUnlock, isWalletUnlockedRef, showLockedRenderer]);

  return { status, requestLock };
}
