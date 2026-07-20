import type { Account } from "@/chrome/types";
import type { ShieldSourceAccount } from "./model/shieldQuote";
import ShieldScreen from "./ShieldScreen";
import PrivateWithdrawalScreen from "./PrivateWithdrawalScreen";

export type PrivacyActionMode = "shield" | "unshield" | "send";

interface PrivacyActionScreenProps {
  mode: PrivacyActionMode;
  onBack: () => void;
  onNavigate: (mode: PrivacyActionMode) => void;
  account: ShieldSourceAccount | null;
  accounts?: Account[];
}

export default function PrivacyActionScreen({
  mode,
  onBack,
  onNavigate,
  account,
  accounts,
}: PrivacyActionScreenProps) {
  if (mode === "shield") {
    return <ShieldScreen onBack={onBack} account={account} accounts={accounts} />;
  }

  return (
    <PrivateWithdrawalScreen
      intent={mode}
      onBack={onBack}
      onOpenShield={() => onNavigate("shield")}
      account={account}
      accounts={accounts}
    />
  );
}
