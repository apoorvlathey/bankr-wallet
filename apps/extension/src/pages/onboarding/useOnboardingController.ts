import { useEffect, useRef, useState } from "react";
import { isAddress } from "@ethersproject/address";
import { isResolvableName, resolveNameToAddress } from "@/lib/ensUtils";
import { validateAndDeriveAddress } from "@/utils/privateKeyUtils";
import { newPasswordPolicyError } from "@/constants/securityPolicy";
import { startUiKeepaliveHeartbeat } from "@/app/uiKeepalive";

export type OnboardingStep =
  | "welcome"
  | "accountType"
  | "bankrSetup"
  | "privateKey"
  | "seedPhrase"
  | "password"
  | "success";

export type AccountTypeChoice = "bankr" | "privateKey" | "seedPhrase";

export type OnboardingErrors = {
  apiKey?: string;
  privateKey?: string;
  walletAddress?: string;
  password?: string;
  confirmPassword?: string;
};

function isArcBrowser(): boolean {
  try {
    const title = getComputedStyle(document.documentElement).getPropertyValue(
      "--arc-palette-title",
    );
    return !!title && title.trim().length > 0;
  } catch {
    return false;
  }
}

const ONBOARDING_OWNER_SESSION_KEY = "walletchanOnboardingOwner";

function getOrCreateOnboardingOwnerId(): string {
  try {
    const existing = sessionStorage.getItem(ONBOARDING_OWNER_SESSION_KEY);
    if (existing) return existing;
    const created = crypto.randomUUID();
    sessionStorage.setItem(ONBOARDING_OWNER_SESSION_KEY, created);
    return created;
  } catch {
    // A stable ID for this mounted controller is still enough when session
    // storage is unavailable. A reload then treats the old marker as owned by
    // an interrupted surface only after its TTL, never overwriting it.
    return crypto.randomUUID();
  }
}

export function useOnboardingController() {
  const [step, setStep] = useState<OnboardingStep>("welcome");
  const [isCheckingSetup, setIsCheckingSetup] = useState(true);
  const [accountTypeChoice, setAccountTypeChoice] =
    useState<AccountTypeChoice>("bankr");
  const [apiKey, setApiKey] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [privateKey, setPrivateKey] = useState("");
  const [derivedAddress, setDerivedAddress] = useState<string | null>(null);
  const [pkDisplayName, setPkDisplayName] = useState("");
  const [walletAddress, setWalletAddress] = useState("");
  const [bankrDisplayName, setBankrDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResolvingAddress, setIsResolvingAddress] = useState(false);
  const [collectedMnemonic, setCollectedMnemonic] = useState("");
  const [collectedSeedIndices, setCollectedSeedIndices] = useState<number[]>([0]);
  const [seedGroupName, setSeedGroupName] = useState("");
  const [seedAccountDisplayName, setSeedAccountDisplayName] = useState("");
  const [errors, setErrors] = useState<OnboardingErrors>({});
  const [setupRecoveryError, setSetupRecoveryError] = useState<string | null>(
    null,
  );
  const keepAlivePortRef = useRef<chrome.runtime.Port | null>(null);
  const stopKeepaliveHeartbeatRef = useRef<(() => void) | null>(null);
  const onboardingOwnerIdRef = useRef(getOrCreateOnboardingOwnerId());

  useEffect(() => {
    let disposed = false;
    const checkExistingSetup = async () => {
      if (isArcBrowser()) {
        console.log(
          "Arc browser detected during onboarding - disabling sidepanel",
        );
        await chrome.storage.sync.set({
          isArcBrowser: true,
          sidePanelMode: false,
        });
      }

      try {
        const setupStatus = await chrome.runtime.sendMessage({
          type: "getOnboardingInitializationStatus",
          initializationId: onboardingOwnerIdRef.current,
        });
        if (setupStatus?.configured) {
          setStep("success");
        } else if (setupStatus?.setupInProgress) {
          setSetupRecoveryError(
            "Wallet setup is already in progress in another tab. Finish or close that setup before trying again.",
          );
        } else if (setupStatus?.recoveryRequired || setupStatus?.error) {
          // Never overwrite unmarked data from an older extension version. It
          // may contain the user's only encrypted key material and requires an
          // explicit reset/recovery decision outside this setup flow.
          setSetupRecoveryError(
            setupStatus?.error ||
              "Incomplete wallet data was found. Open WalletChan settings to reset only if you have safely backed up every key and recovery phrase.",
          );
        }
      } catch {
        setSetupRecoveryError(
          "WalletChan could not verify the current wallet state. Reload the extension before continuing.",
        );
      } finally {
        setIsCheckingSetup(false);
      }

      if (!disposed && !keepAlivePortRef.current) {
        try {
          const port = chrome.runtime.connect({
            name: "ui-keepalive",
          });
          keepAlivePortRef.current = port;
          port.onDisconnect.addListener(() => {
            if (keepAlivePortRef.current !== port) return;
            stopKeepaliveHeartbeatRef.current?.();
            stopKeepaliveHeartbeatRef.current = null;
            keepAlivePortRef.current = null;
          });
          stopKeepaliveHeartbeatRef.current =
            startUiKeepaliveHeartbeat(port);
        } catch {
          // Ignore connection errors.
        }
      }
    };
    checkExistingSetup();
    return () => {
      disposed = true;
      stopKeepaliveHeartbeatRef.current?.();
      stopKeepaliveHeartbeatRef.current = null;
      const port = keepAlivePortRef.current;
      keepAlivePortRef.current = null;
      try {
        port?.disconnect();
      } catch {
        // The onboarding page or extension context may already be closed.
      }
    };
  }, []);

  const resolveAddress = async (input: string): Promise<string | null> => {
    if (isAddress(input)) return input;
    if (!isResolvableName(input)) return null;
    try {
      return await resolveNameToAddress(input);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/429|too many/i.test(message)) {
        throw new Error(
          "RPC rate limited (429). Try switching your RPC URL in Settings.",
        );
      }
      throw new Error(
        "Failed to resolve name. Check your RPC URL in Settings.",
      );
    }
  };

  useEffect(() => {
    if (!privateKey) {
      setDerivedAddress(null);
      return;
    }
    const result = validateAndDeriveAddress(privateKey);
    if (result.valid && result.address) {
      setDerivedAddress(result.address);
      setErrors((previous) => ({ ...previous, privateKey: undefined }));
    } else {
      setDerivedAddress(null);
      if (privateKey.length > 10) {
        setErrors((previous) => ({ ...previous, privateKey: result.error }));
      }
    }
  }, [privateKey]);

  const validatePassword = (): boolean => {
    const nextErrors: OnboardingErrors = {};
    const passwordError = newPasswordPolicyError(password, "Password");
    if (passwordError) nextErrors.password = passwordError;
    if (password !== confirmPassword) {
      nextErrors.confirmPassword = "Passwords do not match";
    }
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const validateBankrSetup = async (): Promise<boolean> => {
    const nextErrors: OnboardingErrors = {};
    if (!apiKey.trim()) nextErrors.apiKey = "API key is required";
    if (!walletAddress.trim()) {
      nextErrors.walletAddress = "Wallet address is required";
    } else {
      setIsResolvingAddress(true);
      try {
        if (!(await resolveAddress(walletAddress.trim()))) {
          nextErrors.walletAddress = "Invalid address or name";
        }
      } catch (error) {
        nextErrors.walletAddress =
          error instanceof Error ? error.message : "Failed to resolve name";
      } finally {
        setIsResolvingAddress(false);
      }
    }
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  async function handleContinue() {
    switch (step) {
      case "accountType":
        if (accountTypeChoice === "bankr") setStep("bankrSetup");
        else if (accountTypeChoice === "privateKey") setStep("privateKey");
        else if (accountTypeChoice === "seedPhrase") setStep("seedPhrase");
        break;
      case "bankrSetup":
        if (await validateBankrSetup()) setStep("password");
        break;
      case "privateKey": {
        const result = validateAndDeriveAddress(privateKey);
        if (!result.valid) {
          setErrors({ privateKey: result.error || "Invalid private key" });
        } else setStep("password");
        break;
      }
      case "password":
        if (validatePassword()) await handleSubmit();
        break;
    }
  }

  const handleBack = () => {
    switch (step) {
      case "accountType":
        setStep("welcome");
        break;
      case "bankrSetup":
        setStep("accountType");
        break;
      case "privateKey":
        // Do not retain imported/generated secret material after the user
        // deliberately leaves this setup path.
        setPrivateKey("");
        setDerivedAddress(null);
        setStep("accountType");
        break;
      case "seedPhrase":
        setCollectedMnemonic("");
        setCollectedSeedIndices([0]);
        setSeedGroupName("");
        setSeedAccountDisplayName("");
        setStep("accountType");
        break;
      case "password":
        if (accountTypeChoice === "seedPhrase") setStep("seedPhrase");
        else if (accountTypeChoice === "privateKey") setStep("privateKey");
        else setStep("bankrSetup");
        break;
    }
  };

  async function handleSubmit() {
    setIsSubmitting(true);
    let initializationId: string | null = null;
    try {
      let finalAddress: string;
      let finalDisplayAddress: string;
      let resolvedBankrAddress: string | null = null;

      // Resolve and validate every input that does not mutate storage before
      // opening the initialization transaction.
      if (accountTypeChoice === "privateKey") {
        const result = validateAndDeriveAddress(privateKey);
        if (!result.valid || !result.address || !result.normalizedKey) {
          throw new Error(result.error || "Invalid private key");
        }
      } else if (accountTypeChoice === "seedPhrase") {
        if (!collectedMnemonic.trim()) {
          throw new Error("Seed phrase is required");
        }
      } else {
        resolvedBankrAddress = await resolveAddress(walletAddress.trim());
        if (!resolvedBankrAddress) throw new Error("Invalid address or name");
      }

      const initialization = await chrome.runtime.sendMessage({
        type: "beginOnboardingInitialization",
        initializationId: onboardingOwnerIdRef.current,
      });
      if (!initialization?.success || !initialization.initializationId) {
        throw new Error(
          initialization?.error || "Failed to start wallet setup safely",
        );
      }
      initializationId = initialization.initializationId;

      const initializeCredential = async (credential: string) => {
        const unlocked = await chrome.runtime.sendMessage({
          type: "initializeOnboardingCredential",
          initializationId,
          credential,
          password,
        });
        if (!unlocked?.success || unlocked.passwordType !== "master") {
          throw new Error(
            unlocked?.error || "Failed to verify the wallet password",
          );
        }
      };

      if (accountTypeChoice === "seedPhrase") {
        await initializeCredential("pk-only-mode");
        const response = await new Promise<{
          success: boolean;
          error?: string;
          account?: any;
          group?: any;
        }>((resolve) => {
          chrome.runtime.sendMessage(
            {
              type: "addSeedPhraseGroup",
              mnemonic: collectedMnemonic,
              indices: collectedSeedIndices,
              name: seedGroupName || undefined,
              accountDisplayName: seedAccountDisplayName || undefined,
            },
            resolve,
          );
        });
        if (!response.success) {
          throw new Error(
            response.error || "Failed to create seed phrase account",
          );
        }
        const account = response.account;
        if (!account?.address) {
          throw new Error("Seed phrase account was not committed safely");
        }
        finalAddress = account.address;
        finalDisplayAddress = account?.displayName || finalAddress;
      }

      if (accountTypeChoice === "privateKey") {
        const result = validateAndDeriveAddress(privateKey);
        if (!result.valid || !result.address || !result.normalizedKey) {
          throw new Error(result.error || "Invalid private key");
        }
        finalAddress = result.address;
        finalDisplayAddress = pkDisplayName.trim() || result.address;
        await initializeCredential("pk-only-mode");
        const response = await new Promise<{ success: boolean; error?: string }>(
          (resolve) => {
            chrome.runtime.sendMessage(
              {
                type: "addPrivateKeyAccount",
                privateKey: result.normalizedKey,
                displayName: pkDisplayName.trim() || undefined,
              },
              resolve,
            );
          },
        );
        if (!response.success) {
          throw new Error(response.error || "Failed to add private key account");
        }
      }

      if (accountTypeChoice === "bankr") {
        const resolvedAddress = resolvedBankrAddress!;
        await initializeCredential(apiKey.trim());
        const displayName =
          bankrDisplayName.trim() ||
          (walletAddress.trim() !== resolvedAddress
            ? walletAddress.trim()
            : undefined);
        const response = await new Promise<{ success: boolean; error?: string }>(
          (resolve) => {
            chrome.runtime.sendMessage(
              {
                type: "addBankrAccount",
                address: resolvedAddress,
                displayName,
              },
              resolve,
            );
          },
        );
        if (!response.success) {
          throw new Error(response.error || "Failed to add Bankr account");
        }
        finalAddress = resolvedAddress;
        finalDisplayAddress = bankrDisplayName.trim() || walletAddress.trim();
      }

      await chrome.storage.sync.set({
        address: finalAddress!,
        displayAddress: finalDisplayAddress!,
        chainName: "Base",
      });

      const completion = await chrome.runtime.sendMessage({
        type: "completeOnboardingInitialization",
        initializationId,
      });
      if (!completion?.success) {
        throw new Error(
          completion?.error || "Wallet setup did not complete safely",
        );
      }
      initializationId = null;
      try {
        sessionStorage.removeItem(ONBOARDING_OWNER_SESSION_KEY);
      } catch {
        // Session metadata is non-secret and best effort only.
      }

      const { isArcBrowser: storedIsArc } = await chrome.storage.sync.get([
        "isArcBrowser",
      ]);
      if (!storedIsArc) {
        try {
          const response = await chrome.runtime.sendMessage({
            type: "setSidePanelMode",
            enabled: true,
          });
          if (response?.success) {
            console.log("Sidepanel mode enabled by default");
          }
        } catch {
          // Popup mode remains available as a fallback.
        }
      }

      setApiKey("");
      setPrivateKey("");
      setPassword("");
      setConfirmPassword("");
      setCollectedMnemonic("");
      setCollectedSeedIndices([0]);
      setStep("success");
      chrome.runtime.sendMessage({ type: "onboardingComplete" });
    } catch (error) {
      if (initializationId) {
        await chrome.runtime
          .sendMessage({
            type: "rollbackOnboardingInitialization",
            initializationId,
          })
          .catch(() => undefined);
      }
      setErrors({
        password:
          error instanceof Error
            ? error.message
            : "Failed to save configuration",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return {
    step, setStep, isCheckingSetup, accountTypeChoice, setAccountTypeChoice,
    apiKey, setApiKey, showApiKey, setShowApiKey, privateKey, setPrivateKey,
    derivedAddress, pkDisplayName, setPkDisplayName, walletAddress,
    setWalletAddress, bankrDisplayName, setBankrDisplayName, password,
    setPassword, confirmPassword, setConfirmPassword, showPassword,
    setShowPassword, isSubmitting, isResolvingAddress, setCollectedMnemonic,
    setCollectedSeedIndices, setSeedGroupName, setSeedAccountDisplayName,
    errors, setErrors, handleContinue, handleBack,
    setupRecoveryError,
  };
}
