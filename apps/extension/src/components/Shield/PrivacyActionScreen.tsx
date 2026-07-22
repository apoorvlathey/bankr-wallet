import type { Account } from "@/chrome/types";
import type { ShieldSourceAccount } from "./model/shieldQuote";
import type { UnshieldEntryTarget, UnshieldOperation } from "./model/unshield";
import ShieldScreen from "./ShieldScreen";
import PrivateWithdrawalScreen from "./PrivateWithdrawalScreen";
import PublicRecoveryStatusScreen from "./PublicRecoveryStatusScreen";

export type PrivacyActionMode = "shield" | "unshield" | "status";

interface PrivacyActionScreenProps {
  mode: PrivacyActionMode;
  onBack: () => void;
  account: ShieldSourceAccount | null;
  accounts?: Account[];
  unshieldTarget?: UnshieldEntryTarget | null;
  onUnlockRequired: () => void;
  onUnshieldSubmitted?: (operation: UnshieldOperation) => void;
}

export default function PrivacyActionScreen({
  mode,
  onBack,
  account,
  accounts,
  unshieldTarget,
  onUnlockRequired,
  onUnshieldSubmitted,
}: PrivacyActionScreenProps) {
  if (mode === "shield") {
    return (
      <ShieldScreen
        onBack={onBack}
        account={account}
        accounts={accounts}
        onUnlockRequired={onUnlockRequired}
      />
    );
  }

  if (mode === "status") {
    return (
      <PublicRecoveryStatusScreen
        onBack={onBack}
        accounts={accounts ?? []}
        onUnlockRequired={onUnlockRequired}
      />
    );
  }

  return (
    <PrivateWithdrawalScreen
      onBack={onBack}
      account={account}
      accounts={accounts}
      unshieldTarget={unshieldTarget}
      onUnlockRequired={onUnlockRequired}
      onUnshieldSubmitted={onUnshieldSubmitted}
    />
  );
}
