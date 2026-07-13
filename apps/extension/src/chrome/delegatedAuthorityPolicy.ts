/** Stable compatibility facade for delegated-authority master policy. */
export {
  assertAutomaticEip7702AuthorizationAllowed,
  assertDelegatedAuthorityMasterAuthorization,
  captureDelegatedAuthorityMasterAuthorization,
  captureEip7702DelegationAuthorization,
  CUSTOM_DELEGATE_REAUTHORIZATION_ERROR,
  DELEGATED_AUTHORITY_MASTER_REQUIRED_ERROR,
  requiresMasterForEip7702Delegation,
} from "./delegation/authorityPolicy";
