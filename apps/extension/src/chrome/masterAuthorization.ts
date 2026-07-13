/** Stable compatibility facade for live master-session authorization. */

export {
  assertCurrentMasterAuthorization,
  hasCurrentMasterAuthorization,
  STALE_MASTER_AUTHORIZATION_ERROR,
} from "./secrets/masterAuthorization";
