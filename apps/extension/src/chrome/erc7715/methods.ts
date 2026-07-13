/** ERC-7715 method recognition and supported-capability advertisement. */

import { CHAIN_REGISTRY } from "@/constants/chainRegistry";
import { hasDefaultDelegateForChain } from "@/utils/delegationResolution";
import {
  ERC7715_SUPPORTED_PERMISSION_TYPES,
  ERC7715_SUPPORTED_RULE_TYPES,
} from "./permissionTypes";
import type { Hex } from "./types";

export const ERC7715_PERMISSION_METHODS = [
  "wallet_getSupportedExecutionPermissions",
  "wallet_requestExecutionPermissions",
  "wallet_getGrantedExecutionPermissions",
] as const;

export type Erc7715PermissionMethod =
  (typeof ERC7715_PERMISSION_METHODS)[number];

type SupportedExecutionPermission = {
  chainIds: Hex[];
  ruleTypes: string[];
};

export type SupportedExecutionPermissionsResult = Record<
  string,
  SupportedExecutionPermission
>;

export function isErc7715PermissionMethod(
  method: string,
): method is Erc7715PermissionMethod {
  return (ERC7715_PERMISSION_METHODS as readonly string[]).includes(method);
}

export function getSupportedExecutionPermissions(): SupportedExecutionPermissionsResult {
  const chainIds = CHAIN_REGISTRY.filter((chain) =>
    hasDefaultDelegateForChain(chain.chainId),
  ).map((chain) => `0x${chain.chainId.toString(16)}` as Hex);

  return Object.fromEntries(
    ERC7715_SUPPORTED_PERMISSION_TYPES.map((permissionType) => [
      permissionType,
      { chainIds, ruleTypes: [...ERC7715_SUPPORTED_RULE_TYPES] },
    ]),
  );
}
