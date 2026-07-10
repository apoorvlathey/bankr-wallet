import { useEffect, useRef, useState } from "react";
import { isAddress } from "@ethersproject/address";
import { hasEncryptedApiKey, saveEncryptedApiKey } from "@/chrome/crypto";
import { isResolvableName, resolveNameToAddress } from "@/lib/ensUtils";
import { validateAndDeriveAddress } from "@/utils/privateKeyUtils";

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
  const keepAlivePortRef = useRef<chrome.runtime.Port | null>(null);

  useEffect(() => {
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

      if (await hasEncryptedApiKey()) setStep("success");
      setIsCheckingSetup(false);

      if (!keepAlivePortRef.current) {
        try {
          keepAlivePortRef.current = chrome.runtime.connect({
            name: "ui-keepalive",
          });
        } catch {
          // Ignore connection errors.
        }
      }
    };
    checkExistingSetup();
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
    if (!password) nextErrors.password = "Password is required";
    else if (password.length < 6) {
      nextErrors.password = "Password must be at least 6 characters";
    }
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
      case "privateKey":
      case "seedPhrase":
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
    try {
      let finalAddress: string;
      let finalDisplayAddress: string;

      if (accountTypeChoice === "seedPhrase") {
        await saveEncryptedApiKey("pk-only-mode", password);
        await chrome.runtime.sendMessage({ type: "unlockWallet", password });
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
          setErrors({
            password: response.error || "Failed to create seed phrase account",
          });
          setIsSubmitting(false);
          return;
        }
        const accounts = await new Promise<any[]>((resolve) => {
          chrome.runtime.sendMessage({ type: "getAccounts" }, resolve);
        });
        const account = accounts?.find((item: any) => item.type === "seedPhrase");
        finalAddress = account?.address || accounts?.[0]?.address;
        finalDisplayAddress = account?.displayName || finalAddress;
      }

      if (accountTypeChoice === "privateKey") {
        const result = validateAndDeriveAddress(privateKey);
        if (!result.valid || !result.address || !result.normalizedKey) {
          setErrors({ privateKey: result.error || "Invalid private key" });
          setIsSubmitting(false);
          return;
        }
        finalAddress = result.address;
        finalDisplayAddress = pkDisplayName.trim() || result.address;
        await saveEncryptedApiKey("pk-only-mode", password);
        await chrome.runtime.sendMessage({ type: "unlockWallet", password });
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
          setErrors({
            privateKey: response.error || "Failed to add private key account",
          });
          setIsSubmitting(false);
          return;
        }
      }

      if (accountTypeChoice === "bankr") {
        let resolvedAddress: string | null;
        try {
          resolvedAddress = await resolveAddress(walletAddress.trim());
        } catch (error) {
          setErrors({
            walletAddress:
              error instanceof Error ? error.message : "Failed to resolve name",
          });
          setIsSubmitting(false);
          return;
        }
        if (!resolvedAddress) {
          setErrors({ walletAddress: "Invalid address or name" });
          setIsSubmitting(false);
          return;
        }
        await saveEncryptedApiKey(apiKey.trim(), password);
        await chrome.runtime.sendMessage({ type: "unlockWallet", password });
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
          setErrors({
            walletAddress: response.error || "Failed to add Bankr account",
          });
          setIsSubmitting(false);
          return;
        }
        finalAddress = resolvedAddress;
        finalDisplayAddress = bankrDisplayName.trim() || walletAddress.trim();
      }

      await chrome.storage.sync.set({
        address: finalAddress!,
        displayAddress: finalDisplayAddress!,
        chainName: "Base",
      });
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
  };
}
