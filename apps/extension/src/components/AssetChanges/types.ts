import type { PendingTxRequest } from "@/chrome/requests/pendingTxStorage";

export interface BatchAssetChangeCall {
  to?: string;
  data?: string;
  value?: string;
}

export interface AssetChangesDisplayProps {
  txRequest: PendingTxRequest;
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
}
