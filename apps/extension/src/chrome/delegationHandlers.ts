/** Stable compatibility facade for EIP-7702 Settings handlers. */
export { handleGetDelegationStatus } from "./delegation/status";
export { handleProbeDelegateContract } from "./delegation/probe";
export { handleInitiateSetDelegation } from "./delegation/setRequest";
export { handleInitiateRevokeDelegation } from "./delegation/revokeRequest";
export { removeAllDelegatesForAccount } from "./delegation/storage";
export type {
  DelegationStatusFailure,
  DelegationStatusResponse,
} from "./delegation/types";
