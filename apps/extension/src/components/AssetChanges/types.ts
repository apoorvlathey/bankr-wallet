import type { PendingTxRequest } from "@/chrome/requests/pendingTxStorage";
import type { ResidualApproval } from "@/chrome/txSimulation";

export interface BatchAssetChangeCall {
  to?: string;
  data?: string;
  value?: string;
}

export interface AssetChangesDisplayProps {
  txRequest: PendingTxRequest;
  /** Explicit Safe identity; Safe routing must not depend on execution readiness. */
  safeAddress?: string;
  /** Exact outer Safe execution request used to determine the revert verdict. */
  safeExecutionRequest?: PendingTxRequest;
  /** Remove the panel's duplicate disclosure header inside a titled parent section. */
  embedded?: boolean;
  /** For batch transactions: simulate each call individually instead of the encoded batch. */
  batchCalls?: BatchAssetChangeCall[];
  /** Use eth_simulateV1-based non-atomic simulation for PK/seed EOA accounts. */
  isNonAtomic?: boolean;
  /** Surface simulated reverts above the confirmation content. */
  onRevertedChange?: (reverted: boolean) => void;
  /** Surface simulation transport failures above the confirmation content. */
  onSimulationUnavailableChange?: (unavailable: boolean) => void;
  /** Optional reducing-authority mutation for verified residual allowances. */
  approvalCleanup?: {
    disabledReason?: string | null;
    onRevoke: (
      approval: ResidualApproval,
    ) => Promise<{ success: boolean; error?: string }>;
    onRevokeAll: (
      approvals: ResidualApproval[],
    ) => Promise<{ success: boolean; error?: string }>;
  };
}
