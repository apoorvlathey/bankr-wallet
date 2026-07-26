import type { CrossDappBatch } from "@/chrome/crossDappBatch/storage";
import type { GasEstimate } from "@/chrome/gasEstimation";
import type { PendingBatchTxRequest } from "@/chrome/erc5792Types";
import type { ResidualApproval } from "@/chrome/txSimulation";
import type { FeePaymentRequestKind } from "@/components/FeePaymentSelector";

export interface BatchTransactionConfirmationProps {
  batchRequest: PendingBatchTxRequest;
  currentIndex: number;
  totalCount: number;
  isInSidePanel: boolean;
  accountType?: "bankr" | "privateKey" | "seedPhrase" | "ledger" | "impersonator";
  accountAddress: string;
  onBack: () => void;
  onConfirmed: () => void;
  onRejected: () => void;
  onRejectAll: () => void;
  /** Runs before the background reject message so navigation never flashes home. */
  onBeforeReject?: () => void;
  onNavigate: (direction: "prev" | "next") => void;
  /** Cross-dapp batches may remove a call from its persistent bundle. */
  onRemoveCall?: (callIndex: number) => void;
  /** Cross-dapp batches override the default pending-batch calldata mutation. */
  onEditCallData?: (
    callIndex: number,
    newData: string,
  ) => Promise<{ success: boolean; error?: string }>;
  /** Optional dapp identity for each call in a cross-dapp batch. */
  originPerCall?: Array<{ origin: string; favicon: string | null }>;
  titleOverride?: string;
  /** Cross-dapp batches own their confirmation message and result fan-out. */
  customConfirmHandler?: (
    gasEstimates?: GasEstimate[] | null,
    feePaymentToken?: "native" | "token",
    feePaymentQuoteId?: string,
  ) => Promise<{ success: boolean; error?: string }>;
  /** Opts a custom batch transport into the shared fee-token selector. */
  feePaymentRequestKind?: FeePaymentRequestKind;
  /** Cross-dapp batches own their rejection message. */
  customRejectHandler?: () => Promise<void>;
  /** Mutates a user-assembled batch without inventing a provider request. */
  approvalCleanupHandler?: (
    approval: ResidualApproval,
  ) => Promise<{ success: boolean; error?: string }>;
  /** Atomically appends every simulated cleanup to a user-assembled batch. */
  approvalCleanupAllHandler?: (
    approvals: ResidualApproval[],
  ) => Promise<{ success: boolean; error?: string }>;
  crossDappBatch?: CrossDappBatch | null;
  onAddedToBatch?: () => void;
  pageBgColor?: string;
}

export type ConfirmationState =
  | "ready"
  | "submitting"
  | "sent"
  | "error"
  | "forceInclusion";

export interface ForceInclusionInfo {
  l1ChainId: number;
  l1ChainName: string;
}
