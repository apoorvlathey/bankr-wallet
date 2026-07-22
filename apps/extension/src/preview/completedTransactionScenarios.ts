import type { CompletedTransaction } from "@/chrome/txHistoryStorage";
import { PREVIEW_WALLETS } from "./fixtures";
import type { PreviewWalletType } from "./types";
import {
  previewCompletedTransaction,
  previewFailedTransaction,
  getPreviewActivityTransactions,
  previewMissingMetadataTransaction,
  previewPendingTransaction,
  previewStressTransaction,
} from "./completedTransactionFixture";
import {
  previewApprovalRevokeTransaction,
  previewApprovalTransaction,
  previewBridgeTransaction,
  previewErc20TransferTransaction,
  previewPendingSwapTransaction,
  previewSwapTransaction,
  previewTokenFeeSwapTransaction,
  previewTransferTransaction,
} from "./completedTransactionCoreVariants";
import {
  previewAtomicBatchTransaction,
  previewBridgePendingTransaction,
  previewBridgeRefundedTransaction,
  previewBroadcastUncertainTransaction,
  previewDelegationRevokeTransaction,
  previewDelegationSetTransaction,
  previewDeploymentTransaction,
  previewErc7715RevokeTransaction,
  previewForceInclusionCompleteTransaction,
  previewForceInclusionTransaction,
  previewLegacyTransaction,
  previewSplitBatchTransaction,
} from "./completedTransactionEdgeVariants";

const fixtures: Record<string, CompletedTransaction> = {
  pending: previewPendingTransaction,
  failed: previewFailedTransaction,
  "missing-metadata": previewMissingMetadataTransaction,
  stress: previewStressTransaction,
  bridge: previewBridgeTransaction,
  "bridge-pending": previewBridgePendingTransaction,
  "bridge-refunded": previewBridgeRefundedTransaction,
  swap: previewSwapTransaction,
  "swap-token-fee": previewTokenFeeSwapTransaction,
  "swap-pending": previewPendingSwapTransaction,
  approve: previewApprovalTransaction,
  "approval-revoke": previewApprovalRevokeTransaction,
  transfer: previewTransferTransaction,
  "erc20-transfer": previewErc20TransferTransaction,
  "delegation-set": previewDelegationSetTransaction,
  "delegation-revoke": previewDelegationRevokeTransaction,
  "erc7715-revoke": previewErc7715RevokeTransaction,
  "atomic-batch": previewAtomicBatchTransaction,
  "split-batch": previewSplitBatchTransaction,
  "force-inclusion": previewForceInclusionTransaction,
  "force-inclusion-complete": previewForceInclusionCompleteTransaction,
  "broadcast-uncertain": previewBroadcastUncertainTransaction,
  deployment: previewDeploymentTransaction,
  legacy: previewLegacyTransaction,
  shield: getPreviewActivityTransactions()[0],
};

export function getPreviewCompletedTransaction(
  scenario: string,
  walletType: PreviewWalletType = "privateKey",
): CompletedTransaction {
  const fixture = fixtures[scenario] ?? previewCompletedTransaction;
  const wallet = PREVIEW_WALLETS[walletType];
  const previewSignerWord = PREVIEW_WALLETS.privateKey.address
    .toLowerCase()
    .slice(2)
    .padStart(64, "0");
  const walletSignerWord = wallet.address
    .toLowerCase()
    .slice(2)
    .padStart(64, "0");

  return {
    ...fixture,
    id: `${fixture.id}-${walletType}`,
    tx: {
      ...fixture.tx,
      from: wallet.address,
      data: fixture.tx.data?.replace(previewSignerWord, walletSignerWord),
    },
    accountId: wallet.accountId,
    accountType:
      wallet.accountType === "impersonator" ? "bankr" : wallet.accountType,
  };
}
