import PrivateKeyInput from "@/components/shared/PrivateKeyInput";
import { ScreenSection } from "@/components/ui";

interface PrivateKeyAccountSectionProps {
  privateKey: string;
  derivedAddress: string | null;
  error?: string;
  backup: { isGenerated: boolean; isConfirmed: boolean };
  onPrivateKeyChange: (privateKey: string) => void;
  onClearError: () => void;
  onBackupChange: (isConfirmed: boolean) => void;
  onBackupStateChange: (isGenerated: boolean, isConfirmed: boolean) => void;
}

export function PrivateKeyAccountSection({
  privateKey,
  derivedAddress,
  error,
  backup,
  onPrivateKeyChange,
  onClearError,
  onBackupChange,
  onBackupStateChange,
}: PrivateKeyAccountSectionProps) {
  return (
    <ScreenSection
      title="Import private key"
      description="The key is encrypted before it is stored locally on this device."
    >
      <PrivateKeyInput
        privateKey={privateKey}
        onPrivateKeyChange={onPrivateKeyChange}
        derivedAddress={derivedAddress}
        error={error}
        onClearError={onClearError}
        safetyNotice="Never share this key with anyone."
        requireGeneratedBackupConfirmation
        generatedBackupConfirmed={backup.isConfirmed}
        onGeneratedBackupConfirmedChange={onBackupChange}
        showGeneratedBackupConfirmation={false}
        onGeneratedBackupStateChange={onBackupStateChange}
      />
    </ScreenSection>
  );
}
