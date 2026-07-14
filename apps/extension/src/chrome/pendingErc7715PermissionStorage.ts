/** Stable facade for ERC-7715 prompt, grant, and result persistence. */

export type {
  Address,
  Erc7710Delegation,
  Erc7710DelegationTypedData,
  Erc7715PermissionGrant,
  Erc7715PermissionRequest,
  Erc7715PermissionResponse,
  Erc7715PermissionResult,
  Hex,
  PendingErc7715PermissionRequest,
} from "./erc7715/types";
export {
  ERC7715_PERMISSION_RESULT_PREFIX,
} from "./erc7715/types";
export {
  getPendingErc7715PermissionRequestById,
  getPendingErc7715PermissionRequests,
  removePendingErc7715PermissionRequest,
  savePendingErc7715PermissionRequest,
} from "./erc7715/pendingRequestStorage";
export {
  commitErc7715PermissionGrantApproval,
  getActiveErc7715PermissionGrants,
  getErc7715PermissionGrantById,
  getErc7715PermissionGrants,
  revokeErc7715PermissionGrant,
  saveErc7715PermissionGrant,
} from "./erc7715/grantStorage";
export {
  waitForErc7715PermissionResult,
  writeErc7715PermissionResult,
} from "./erc7715/resultStorage";
