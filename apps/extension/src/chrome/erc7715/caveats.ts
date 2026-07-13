/** Stable local facade for deterministic ERC-7715 caveat construction. */
export {
  ERC7710_DELEGATION_MANAGER,
  ERC7710_EMPTY_CAVEAT_ARGS,
  ERC7710_ROOT_AUTHORITY,
  METAMASK_DELEGATOR_V1_3_CAVEAT_ENFORCERS,
  type Erc7715MappedCaveat,
} from "./caveatDefinitions";
export { buildErc7715PermissionCaveats } from "./caveatBuilder";
