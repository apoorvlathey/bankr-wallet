import type { CrossDappBatch } from "@/chrome/crossDappBatch/storage";
import type { PendingTxRequest } from "@/chrome/requests/pendingTxStorage";

export type TransactionAccountType =
  | "bankr"
  | "privateKey"
  | "seedPhrase"
  | "impersonator";

export interface TransactionConfirmationProps {
  txRequest: PendingTxRequest;
  currentIndex: number;
  totalCount: number;
  isInSidePanel: boolean;
  accountType?: TransactionAccountType;
  onBack: () => void;
  onConfirmed: () => void;
  onRejected: () => void;
  onRejectAll: () => void;
  /**
   * Fired before the reject message is sent so the parent can pre-navigate
   * without briefly rendering an empty transaction-confirmation view.
   */
  onBeforeReject?: () => void;
  onNavigate: (direction: "prev" | "next") => void;
  crossDappBatch?: CrossDappBatch | null;
  onAddedToBatch?: () => void;
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
