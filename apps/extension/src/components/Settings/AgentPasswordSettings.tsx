import { useState, useEffect, useRef } from "react";
import { useThemedToast } from "@/hooks/useThemedToast";
import { ListSurface, SkeletonRow } from "@/components/ui";
import { SettingsScreenFrame } from "./SettingsScreenFrame";
import {
  AgentPasswordStatusView,
  RemoveAgentPasswordView,
  SetAgentPasswordView,
} from "./AgentPasswordViews";
import { newPasswordPolicyError } from "@/constants/securityPolicy";

interface AgentPasswordSettingsProps {
  onComplete: () => void;
  onCancel: () => void;
  onSessionExpired?: () => void;
}

type ViewMode = "status" | "set" | "remove";

function AgentPasswordSettings({
  onComplete,
  onCancel,
  onSessionExpired,
}: AgentPasswordSettingsProps) {
  const [viewMode, setViewMode] = useState<ViewMode>("status");
  const [isAgentEnabled, setIsAgentEnabled] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [passwordType, setPasswordType] = useState<"master" | "agent" | null>(null);

  // Form states for setting agent password
  const [agentPassword, setAgentPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<{
    masterPassword?: string;
    agentPassword?: string;
    confirmPassword?: string;
  }>({});

  // Explicit master-password proof is shared by set/remove flows.
  const [masterPassword, setMasterPassword] = useState("");
  const [showMasterPassword, setShowMasterPassword] = useState(false);
  const [removeError, setRemoveError] = useState("");

  const toast = useThemedToast();
  const passwordInputRef = useRef<HTMLInputElement>(null);
  const masterPasswordInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadStatus();
  }, []);

  // Auto-focus password input when entering set or remove mode
  useEffect(() => {
    if (viewMode === "set") {
      setTimeout(() => masterPasswordInputRef.current?.focus(), 100);
    } else if (viewMode === "remove") {
      setTimeout(() => masterPasswordInputRef.current?.focus(), 100);
    }
  }, [viewMode]);

  const loadStatus = async () => {
    setIsLoading(true);
    try {
      // Check if agent password is enabled
      const enabledResponse = await new Promise<{ enabled: boolean }>((resolve) => {
        chrome.runtime.sendMessage({ type: "isAgentPasswordEnabled" }, resolve);
      });
      setIsAgentEnabled(enabledResponse.enabled);

      // Get current password type
      const typeResponse = await new Promise<{ passwordType: "master" | "agent" | null }>((resolve) => {
        chrome.runtime.sendMessage({ type: "getPasswordType" }, resolve);
      });
      setPasswordType(typeResponse.passwordType);
    } finally {
      setIsLoading(false);
    }
  };

  const validateSetPassword = (): boolean => {
    const newErrors: typeof errors = {};
    if (!masterPassword) {
      newErrors.masterPassword = "Master password is required";
    }
    const agentPasswordError = newPasswordPolicyError(
      agentPassword,
      "Agent password",
    );
    if (agentPasswordError) newErrors.agentPassword = agentPasswordError;

    if (agentPassword !== confirmPassword) {
      newErrors.confirmPassword = "Passwords do not match";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSetAgentPassword = async () => {
    if (!validateSetPassword()) return;

    setIsSubmitting(true);
    try {
      const response = await new Promise<{ success: boolean; error?: string }>((resolve) => {
        chrome.runtime.sendMessage(
          { type: "setAgentPassword", agentPassword, masterPassword },
          resolve
        );
      });

      if (!response.success) {
        if (
          response.error === "Invalid master password" ||
          response.error === "Master password is required"
        ) {
          setErrors((current) => ({
            ...current,
            masterPassword: response.error,
          }));
          return;
        }
        if (response.error?.includes("Must be unlocked with master password")) {
          if (onSessionExpired) {
            onSessionExpired();
            return;
          }
          toast({
            title: "Master password required",
            description: "You must be unlocked with master password to set agent password",
            status: "error",
            duration: 5000,
            isClosable: true,
          });
          return;
        }
        toast({
          title: "Error setting agent password",
          description: response.error || "Unknown error",
          status: "error",
          duration: 5000,
          isClosable: true,
        });
        return;
      }

      toast({
        title: "Agent password set",
        description: "AI agents can now unlock your wallet with the agent password",
        status: "success",
        duration: 3000,
        isClosable: true,
      });

      // Reset form and go back to settings (onComplete refreshes parent state)
      setAgentPassword("");
      setConfirmPassword("");
      setMasterPassword("");
      onComplete();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRemoveAgentPassword = async () => {
    if (!masterPassword) {
      setRemoveError("Master password is required");
      return;
    }

    setIsSubmitting(true);
    setRemoveError("");
    try {
      const response = await new Promise<{ success: boolean; error?: string }>((resolve) => {
        chrome.runtime.sendMessage(
          { type: "removeAgentPassword", masterPassword },
          resolve
        );
      });

      if (!response.success) {
        setRemoveError(response.error || "Failed to remove agent password");
        return;
      }

      toast({
        title: "Agent password removed",
        description: "Only master password can now unlock the wallet",
        status: "success",
        duration: 3000,
        isClosable: true,
      });

      // Reset form and go back to settings (onComplete refreshes parent state)
      setMasterPassword("");
      onComplete();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBack = () => {
    if (viewMode === "status") {
      onCancel();
    } else {
      // Reset form states
      setAgentPassword("");
      setConfirmPassword("");
      setMasterPassword("");
      setErrors({});
      setRemoveError("");
      setViewMode("status");
    }
  };

  // Check if unlocked with agent password (can't manage agent password)
  const isAgentSession = passwordType === "agent";

  if (isLoading) {
    return (
      <SettingsScreenFrame title="Agent password" onBack={onCancel}>
        <ListSurface aria-label="Loading agent password status">
          <SkeletonRow />
        </ListSurface>
      </SettingsScreenFrame>
    );
  }

  // Status view
  if (viewMode === "status") {
    return (
      <AgentPasswordStatusView
        enabled={isAgentEnabled}
        agentSession={isAgentSession}
        onBack={onCancel}
        onManage={() => setViewMode(isAgentEnabled ? "remove" : "set")}
      />
    );
  }

  // Set agent password view
  if (viewMode === "set") {
    return (
      <SetAgentPasswordView
        masterPassword={masterPassword}
        password={agentPassword}
        confirmPassword={confirmPassword}
        showMasterPassword={showMasterPassword}
        showPassword={showPassword}
        errors={errors}
        submitting={isSubmitting}
        masterPasswordInputRef={masterPasswordInputRef}
        passwordInputRef={passwordInputRef}
        onMasterPasswordChange={(value) => {
          setMasterPassword(value);
          setErrors((current) => ({
            ...current,
            masterPassword: undefined,
          }));
        }}
        onPasswordChange={(value) => {
          setAgentPassword(value);
          setErrors((current) => ({
            ...current,
            agentPassword: undefined,
          }));
        }}
        onConfirmChange={(value) => {
          setConfirmPassword(value);
          setErrors((current) => ({
            ...current,
            confirmPassword: undefined,
          }));
        }}
        onToggleMasterVisibility={() =>
          setShowMasterPassword(!showMasterPassword)
        }
        onToggleVisibility={() => setShowPassword(!showPassword)}
        onSubmit={handleSetAgentPassword}
        onBack={handleBack}
      />
    );
  }

  // Remove agent password view
  if (viewMode === "remove") {
    return (
      <RemoveAgentPasswordView
        password={masterPassword}
        showPassword={showMasterPassword}
        error={removeError}
        submitting={isSubmitting}
        passwordInputRef={masterPasswordInputRef}
        onPasswordChange={(value) => {
          setMasterPassword(value);
          setRemoveError("");
        }}
        onToggleVisibility={() => setShowMasterPassword(!showMasterPassword)}
        onSubmit={handleRemoveAgentPassword}
        onBack={handleBack}
      />
    );
  }

  return null;
}

export default AgentPasswordSettings;
