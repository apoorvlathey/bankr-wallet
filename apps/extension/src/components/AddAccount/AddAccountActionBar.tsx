import { Button } from "@chakra-ui/react";
import type { AccountType } from "@/components/AddAccountTypeGrid";
import { StickyActionBar } from "@/components/ui";
import { BackupConfirmationCheckbox } from "@/components/shared/BackupConfirmationCheckbox";

interface AddAccountActionBarProps {
  accountType: AccountType;
  needsBiometricUpgrade: boolean | null;
  isSubmitting: boolean;
  canAddPrivateKey: boolean;
  privateKeyBackup: { isGenerated: boolean; isConfirmed: boolean };
  onPrivateKeyBackupChange: (isConfirmed: boolean) => void;
  canAddBankr: boolean;
  canAddImpersonator: boolean;
  seedGroupCount: number;
  onAddAccount: () => void;
  onSetupSeedPhrase: () => void;
}

export function AddAccountActionBar({
  accountType,
  needsBiometricUpgrade,
  isSubmitting,
  canAddPrivateKey,
  privateKeyBackup,
  onPrivateKeyBackupChange,
  canAddBankr,
  canAddImpersonator,
  seedGroupCount,
  onAddAccount,
  onSetupSeedPhrase,
}: AddAccountActionBarProps) {
  const isLocalAccount =
    accountType === "privateKey" || accountType === "seedPhrase";
  if (
    needsBiometricUpgrade === null ||
    (needsBiometricUpgrade && isLocalAccount)
  ) {
    return null;
  }

  return (
    <StickyActionBar
      summaryGap={2}
      summary={
        accountType === "privateKey" && privateKeyBackup.isGenerated ? (
          <BackupConfirmationCheckbox
            isChecked={privateKeyBackup.isConfirmed}
            label="I saved this private key"
            onChange={onPrivateKeyBackupChange}
          />
        ) : undefined
      }
      primaryAction={
        <Button
          variant="brand"
          onClick={
            accountType === "seedPhrase" ? onSetupSeedPhrase : onAddAccount
          }
          isLoading={isSubmitting}
          loadingText="Adding…"
          isDisabled={
            (accountType === "privateKey" && !canAddPrivateKey) ||
            (accountType === "bankr" && !canAddBankr) ||
            (accountType === "impersonator" && !canAddImpersonator)
          }
        >
          {accountType === "seedPhrase"
            ? seedGroupCount > 0
              ? "Add another seed phrase"
              : "Set up seed phrase"
            : "Add account"}
        </Button>
      }
    />
  );
}
