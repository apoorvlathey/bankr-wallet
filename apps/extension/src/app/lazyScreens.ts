import { lazy } from "react";
import type { ProviderRequestSurfaceType } from "@/chrome/windowing/providerRequestSurface";

export const Settings = lazy(() => import("@/components/Settings"));
export const TransactionConfirmation = lazy(
  () => import("@/components/TransactionConfirmation"),
);
export const SignatureRequestConfirmation = lazy(
  () => import("@/components/SignatureRequestConfirmation"),
);
export const Erc7715PermissionConfirmation = lazy(
  () => import("@/components/Erc7715PermissionConfirmation"),
);
export const DappConnectionConfirmation = lazy(
  () => import("@/components/DappConnectionConfirmation"),
);
export const PendingTxList = lazy(() => import("@/components/PendingTxList"));
export const BatchTransactionConfirmation = lazy(
  () => import("@/components/BatchTransactionConfirmation"),
);
export const CrossDappBatchConfirmation = lazy(
  () => import("@/components/CrossDappBatchConfirmation"),
);
export const ChatView = lazy(() => import("@/components/Chat/ChatView"));
export const AddAccount = lazy(() => import("@/components/AddAccount"));
export const LedgerSetupScreen = lazy(
  () => import("@/components/Ledger/LedgerSetupScreen"),
);
export const AccountSettings = lazy(
  () => import("@/components/AccountSettings"),
);
export const QRCodeModal = lazy(() =>
  import("@/components/QRCodeModal").then((module) => ({
    default: module.QRCodeModal,
  })),
);
export const TokenTransfer = lazy(() => import("@/components/TokenTransfer"));
export const SwapView = lazy(() => import("@/components/Swap/SwapView"));
// export const ShieldView = lazy(() => import("@/components/ShieldView"));
export const MoreActionsView = lazy(
  () => import("@/components/MoreActionsView"),
);
export const HideTokensView = lazy(
  () => import("@/components/HideTokensView"),
);
export const HiddenPortfolioTokensView = lazy(
  () => import("@/components/HiddenPortfolioTokensView"),
);
export const WalletConnectView = lazy(
  () => import("@/components/WalletConnectView"),
);
export const WatchAssetConfirmation = lazy(
  () => import("@/components/WatchAssetConfirmation"),
);
export const AddChain = lazy(() => import("@/components/Settings/AddChain"));
export const TxDetailScreen = lazy(
  () => import("@/components/TxDetailScreen"),
);

/** Starts the exact approval chunk while its durable request is being prepared. */
export function preloadApprovalRequestScreen(
  requestType: ProviderRequestSurfaceType,
): Promise<unknown> {
  switch (requestType) {
    case "i_dappAccounts":
      return import("@/components/DappConnectionConfirmation");
    case "i_sendTransaction":
      return import("@/components/TransactionConfirmation");
    case "i_signatureRequest":
      return import("@/components/SignatureRequestConfirmation");
    case "i_walletExecutionPermissions":
      return import("@/components/Erc7715PermissionConfirmation");
    case "i_walletSendCalls":
      return import("@/components/BatchTransactionConfirmation");
  }
}

// Prime every route chunk once the popup is idle so first navigation never
// swaps a Suspense fallback into an already-running screen transition.
if (typeof window !== "undefined") {
  const schedule =
    (window as Window & {
      requestIdleCallback?: (callback: () => void) => number;
    }).requestIdleCallback ??
    ((callback: () => void) => window.setTimeout(callback, 300));

  schedule(() => {
    void import("@/components/Settings");
    void import("@/components/TransactionConfirmation");
    void import("@/components/SignatureRequestConfirmation");
    void import("@/components/Erc7715PermissionConfirmation");
    void import("@/components/PendingTxList");
    void import("@/components/BatchTransactionConfirmation");
    void import("@/components/CrossDappBatchConfirmation");
    void import("@/components/Chat/ChatView");
    void import("@/components/AddAccount");
    void import("@/components/Ledger/LedgerSetupScreen");
    void import("@/components/AccountSettings");
    void import("@/components/QRCodeModal");
    void import("@/components/TokenTransfer");
    void import("@/components/Swap/SwapView");
    // void import("@/components/ShieldView");
    void import("@/components/MoreActionsView");
    void import("@/components/HideTokensView");
    void import("@/components/HiddenPortfolioTokensView");
    void import("@/components/WalletConnectView");
    void import("@/components/WatchAssetConfirmation");
    void import("@/components/Settings/AddChain");
    void import("@/components/TxDetailScreen");
  });
}
