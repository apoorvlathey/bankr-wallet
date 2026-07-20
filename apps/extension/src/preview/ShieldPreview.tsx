import ShieldView from "@/components/ShieldView";
import { getPreviewWallet } from "./fixtures";
import type { PreviewWalletType } from "./types";

export function ShieldPreview({ wallet }: { wallet: PreviewWalletType }) {
  const account = getPreviewWallet(wallet);
  return (
    <ShieldView
      onBack={() => {}}
      account={{ id: account.accountId, type: account.accountType, address: account.address }}
    />
  );
}
