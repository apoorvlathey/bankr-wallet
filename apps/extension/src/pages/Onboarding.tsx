import { AccountTypeStep } from "./onboarding/AccountTypeStep";
import { BankrSetupStep } from "./onboarding/BankrSetupStep";
import {
  OnboardingLoading,
  OnboardingRecoveryError,
  SuccessStep,
  WelcomeStep,
} from "./onboarding/OnboardingIntroSteps";
import { PasswordStep } from "./onboarding/PasswordStep";
import { PrivateKeySetupStep } from "./onboarding/PrivateKeySetupStep";
import { SeedPhraseOnboardingStep } from "./onboarding/SeedPhraseOnboardingStep";
import { useOnboardingController } from "./onboarding/useOnboardingController";

function Onboarding() {
  const {
    step,
    setStep,
    isCheckingSetup,
    accountTypeChoice,
    setAccountTypeChoice,
    apiKey,
    setApiKey,
    showApiKey,
    setShowApiKey,
    privateKey,
    setPrivateKey,
    derivedAddress,
    pkDisplayName,
    setPkDisplayName,
    walletAddress,
    setWalletAddress,
    bankrDisplayName,
    setBankrDisplayName,
    password,
    setPassword,
    confirmPassword,
    setConfirmPassword,
    showPassword,
    setShowPassword,
    isSubmitting,
    isResolvingAddress,
    setCollectedMnemonic,
    setCollectedSeedIndices,
    setSeedGroupName,
    setSeedAccountDisplayName,
    errors,
    setErrors,
    handleContinue,
    handleBack,
    setupRecoveryError,
  } = useOnboardingController();

  if (isCheckingSetup) return <OnboardingLoading />;
  if (setupRecoveryError) {
    return <OnboardingRecoveryError message={setupRecoveryError} />;
  }
  if (step === "welcome") {
    return <WelcomeStep onContinue={() => setStep("accountType")} />;
  }
  if (step === "success") return <SuccessStep />;

  if (step === "accountType") {
    return (
      <AccountTypeStep
        choice={accountTypeChoice}
        onChoiceChange={setAccountTypeChoice}
        onBack={handleBack}
        onContinue={handleContinue}
      />
    );
  }

  if (step === "bankrSetup") {
    return (
      <BankrSetupStep
        apiKey={apiKey}
        showApiKey={showApiKey}
        walletAddress={walletAddress}
        displayName={bankrDisplayName}
        errors={errors}
        isResolvingAddress={isResolvingAddress}
        onApiKeyChange={(value) => {
          setApiKey(value);
          if (errors.apiKey) {
            setErrors((previous) => ({ ...previous, apiKey: undefined }));
          }
        }}
        onToggleApiKey={() => setShowApiKey((visible) => !visible)}
        onWalletAddressChange={(value) => {
          setWalletAddress(value);
          if (errors.walletAddress) {
            setErrors((previous) => ({
              ...previous,
              walletAddress: undefined,
            }));
          }
        }}
        onDisplayNameChange={setBankrDisplayName}
        onBack={handleBack}
        onContinue={handleContinue}
      />
    );
  }

  if (step === "privateKey") {
    return (
      <PrivateKeySetupStep
        privateKey={privateKey}
        derivedAddress={derivedAddress}
        displayName={pkDisplayName}
        error={errors.privateKey}
        onPrivateKeyChange={setPrivateKey}
        onDisplayNameChange={setPkDisplayName}
        onClearError={() => setErrors({})}
        onBack={handleBack}
        onContinue={handleContinue}
      />
    );
  }

  if (step === "seedPhrase") {
    return (
      <SeedPhraseOnboardingStep
        onBack={() => setStep("accountType")}
        onCollect={(mnemonic, indices, groupName, accountDisplayName) => {
          setCollectedMnemonic(mnemonic);
          setCollectedSeedIndices(indices.length > 0 ? indices : [0]);
          setSeedGroupName(groupName || "");
          setSeedAccountDisplayName(accountDisplayName || "");
          setStep("password");
        }}
      />
    );
  }

  return (
    <PasswordStep
      password={password}
      confirmPassword={confirmPassword}
      showPassword={showPassword}
      errors={errors}
      isSubmitting={isSubmitting}
      onPasswordChange={(value) => {
        setPassword(value);
        if (errors.password) setErrors({});
      }}
      onConfirmPasswordChange={(value) => {
        setConfirmPassword(value);
        if (errors.confirmPassword) setErrors({});
      }}
      onTogglePassword={() => setShowPassword((visible) => !visible)}
      onBack={handleBack}
      onContinue={handleContinue}
    />
  );
}

export default Onboarding;
