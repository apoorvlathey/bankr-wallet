import ShieldView from "@/components/ShieldView";
import { getPreviewWallet, toAccount } from "./fixtures";
import type { PreviewWalletType } from "./types";
import type { PrivacyActionMode } from "@/components/ShieldView";
import type { Account } from "@/chrome/types";
import {
  isPrivacyPoolsMutationAccountType,
  type PrivacyPoolsMutationAccount,
} from "@/chrome/privacy/deployment/accountPolicy";

function isPrivacyPreviewAccount(
  account: Account,
): account is PrivacyPoolsMutationAccount {
  return isPrivacyPoolsMutationAccountType(account.type);
}

export function ShieldPreview({
  wallet,
  scenario,
}: {
  wallet: PreviewWalletType;
  scenario: string;
}) {
  const previewWallet = getPreviewWallet(wallet);
  const account = toAccount(previewWallet);
  const privacyAccount = isPrivacyPreviewAccount(account) ? account : null;
  const mode: PrivacyActionMode = scenario === "unshield" ||
      scenario === "unshield-empty" ||
      scenario === "unshield-pending"
    ? "unshield"
    : "shield";
  return (
    <ShieldView
      key={mode}
      mode={mode}
      onBack={() => {}}
      onUnlockRequired={() => {}}
      onOpenBiometricSettings={() => {}}
      account={privacyAccount}
      accounts={privacyAccount ? [privacyAccount] : []}
    />
  );
}
