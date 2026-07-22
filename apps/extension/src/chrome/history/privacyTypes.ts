import type { PrivacyShieldLifecycleState } from "../../lib/privacyShieldLifecycle";

/** Bounded public Shield lifecycle projection for the normal Activity row. */
export interface PrivacyShieldHistoryMeta {
  version: 1;
  operationId: string;
  state: PrivacyShieldLifecycleState;
  updatedAt: number;
  amountWei: string;
  shieldedAmountWei: string;
}

/** Non-linking marker that keeps a public exit in Private Activity. */
export interface PrivacyRagequitHistoryMeta {
  version: 1;
}

/** Public marker used only to suppress a duplicate normal transaction row. */
export interface PrivacyUnshieldHistoryMeta {
  version: 1;
}
