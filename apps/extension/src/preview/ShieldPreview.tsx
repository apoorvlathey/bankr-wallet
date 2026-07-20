import ShieldView from "@/components/ShieldView";
import { getPreviewWallet, toAccount } from "./fixtures";
import type { PreviewWalletType } from "./types";
import type { PrivacyActionMode } from "@/components/ShieldView";

export function ShieldPreview({
  wallet,
  scenario,
}: {
  wallet: PreviewWalletType;
  scenario: string;
}) {
  const previewWallet = getPreviewWallet(wallet);
  const account = toAccount(previewWallet);
  const mode: PrivacyActionMode = scenario === "unshield" ||
      scenario === "unshield-empty" ||
      scenario === "unshield-pending"
    ? "unshield"
    : scenario === "send" || scenario === "send-empty"
      ? "send"
      : "shield";
  return (
    <ShieldView
      key={mode}
      mode={mode}
      onBack={() => {}}
      account={account}
      accounts={[account]}
    />
  );
}
