/** Stable compatibility facade for ERC-7715 permission operations. */

export {
  ERC7715_PERMISSION_METHODS,
  getSupportedExecutionPermissions,
  isErc7715PermissionMethod,
} from "./erc7715/methods";
export type {
  Erc7715PermissionMethod,
  SupportedExecutionPermissionsResult,
} from "./erc7715/methods";
export { getGrantedExecutionPermissions } from "./erc7715/queries";
export { getActiveErc7715PermissionGrantsWithOnchainSync } from "./erc7715/onchainStatus";
export { handleInitiateErc7715PermissionRevoke } from "./erc7715/revocation";
export {
  handleConfirmErc7715PermissionRequest,
  handleRejectErc7715PermissionRequest,
} from "./erc7715/confirmation";
export { handleErc7715PermissionMethod } from "./erc7715/requestHandler";
